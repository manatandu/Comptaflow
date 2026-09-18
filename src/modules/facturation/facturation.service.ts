import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SensFacture } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EnregistrerFactureDto } from './dto/facture.dto';
import {
  FactureVerifiable,
  HOMOLOGATION,
  OBLIGATION_DACCEPTATION,
  totauxFacture,
  verifierMentions,
} from './mentions-facture';
import { construireEtatDetaille, FactureAchatSource } from './etat-detaille-tva';
import { FORMES_PERSONNES_PHYSIQUES } from '../retenues/correspondance-retenues';

const nombre = (d: Prisma.Decimal | number | null): number | null =>
  d === null || d === undefined ? null : Number(d);

/**
 * LA FACTURE, TENUE COMME PIÈCE ET NON COMME COMPTABILITÉ.
 *
 * Le service n'écrit aucun montant au grand livre et n'en lit aucun : il
 * enregistre un document, le confronte à l'art. 100, et le rattache à
 * l'écriture passée par `EcritureService`. La règle de revue de la §7 du plan
 * de construction est explicite là-dessus · jamais de plan de facturation
 * parallèle à la comptabilité.
 */
@Injectable()
export class FacturationService {
  constructor(private readonly prisma: PrismaService) {}

  private async dossier(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        id: true,
        nom: true,
        numeroImpot: true,
        adresse: true,
        ville: true,
        formeJuridique: true,
        formeJuridiqueSyscohada: true,
        // Décret n° 011/42, art. 60 · la mention n'est due que par le dossier
        // AUTORISÉ, et seulement sur les factures qu'il DÉLIVRE.
        regimeExigibiliteTva: true,
      },
    });
  }

  /**
   * LE BARÈME DE L'ART. 97 BIS DÉPEND DE LA PERSONNALITÉ, PAS DU RÉFÉRENTIEL.
   *
   * Une ASBL dotée de la personnalité juridique (loi n° 004/2001, art. 3) est
   * une personne MORALE, au même titre qu'une SARL · elle relève donc des
   * 750.000 FC. Les 250.000 FC ne visent que la personne PHYSIQUE, c'est-à-dire
   * l'entreprenant ou le commerçant en nom propre du côté SYSCOHADA. Aucun
   * dossier SYCEBNL n'est une personne physique : une association est par
   * définition un groupement.
   */
  private estPersonneMorale(t: { formeJuridiqueSyscohada: string | null }): boolean {
    /*
      PASSE F9 · LE CODE DISAIT LE CONTRAIRE DE SON PROPRE COMMENTAIRE.

      La ligne était `!== 'ENTREPRISE_INDIVIDUELLE'`, alors que le commentaire
      ci-dessus nomme DEUX formes de personne physique, l'entreprenant ET le
      commerçant en nom propre. Un dossier d'ENTREPRENANT se voyait donc
      annoncer 750.000 FC par omission là où l'art. 97 bis en prévoit
      250.000 · TROIS FOIS TROP, sur le seul chiffre que cet écran affirme.

      Et la liste existait déjà, à deux fichiers de là :
      `FORMES_PERSONNES_PHYSIQUES` de `retenues/correspondance-retenues.ts`
      porte les deux formes depuis le chantier des retenues. C'est elle qui
      sert ici · une seconde liste écrite à la main aurait divergé au premier
      correctif, comme `calculerPropositions` l'a déjà appris au dépôt.

      L'ENTREPRENANT EST UNE PERSONNE PHYSIQUE, et le schéma l'écrit :
      `prisma/schema.prisma` note « AUDCG art. 30 · dispensé d'immatriculation
      au RCCM, il DÉCLARE son activité ».

      CE QUI N'EST PAS TRANCHÉ ICI · la SUCCURSALE. Aucun texte lu ne dit si
      elle relève du barème de la personne morale, son propriétaire pouvant
      être une société comme une personne physique. Elle reste donc du côté
      des personnes morales par défaut, faute de source, et non parce que la
      question serait réglée.
    */
    return !FORMES_PERSONNES_PHYSIQUES.includes(
      t.formeJuridiqueSyscohada as (typeof FORMES_PERSONNES_PHYSIQUES)[number],
    );
  }

  private verifiable(f: {
    emetteurNom: string;
    emetteurAdresse: string | null;
    emetteurNumeroImpot: string | null;
    contrepartieNom: string;
    contrepartieAdresse: string | null;
    contrepartieNumeroImpot: string | null;
    dateFacture: Date;
    numeroSerie: string;
    mentionTvaDebits: boolean;
    autresImpotsEtTaxes: Prisma.Decimal | null;
    lignes: {
      designation: string;
      quantite: Prisma.Decimal;
      prixUnitaire: Prisma.Decimal;
      montantHT: Prisma.Decimal;
      imposable: boolean;
      tauxApplique: Prisma.Decimal | null;
      montantTva: Prisma.Decimal;
    }[];
  }): FactureVerifiable {
    return {
      emetteurNom: f.emetteurNom,
      emetteurAdresse: f.emetteurAdresse,
      emetteurNumeroImpot: f.emetteurNumeroImpot,
      contrepartieNom: f.contrepartieNom,
      contrepartieAdresse: f.contrepartieAdresse,
      contrepartieNumeroImpot: f.contrepartieNumeroImpot,
      dateFacture: f.dateFacture,
      numeroSerie: f.numeroSerie,
      mentionTvaDebits: f.mentionTvaDebits,
      autresImpotsEtTaxes: nombre(f.autresImpotsEtTaxes),
      lignes: f.lignes.map((l) => ({
        designation: l.designation,
        quantite: nombre(l.quantite),
        prixUnitaire: nombre(l.prixUnitaire),
        montantHT: nombre(l.montantHT),
        imposable: l.imposable,
        tauxApplique: nombre(l.tauxApplique),
        montantTva: nombre(l.montantTva),
      })),
    };
  }

  async lister(tenantId: string, params: { sens?: SensFacture } = {}) {
    const t = await this.dossier(tenantId);
    const morale = this.estPersonneMorale(t);
    const factures = await this.prisma.facture.findMany({
      where: { tenantId, ...(params.sens ? { sens: params.sens } : {}) },
      include: { lignes: { orderBy: { ordre: 'asc' } }, tiers: { select: { id: true, code: true, nom: true } } },
      orderBy: [{ dateFacture: 'desc' }, { numeroSerie: 'desc' }],
    });

    return {
      homologation: HOMOLOGATION,
      obligationDAcceptation: OBLIGATION_DACCEPTATION,
      factures: factures.map((f) => {
        const v = this.verifiable(f);
        return {
          id: f.id,
          sens: f.sens,
          numeroSerie: f.numeroSerie,
          dateFacture: f.dateFacture,
          tiers: f.tiers,
          emetteurNom: f.emetteurNom,
          emetteurAdresse: f.emetteurAdresse,
          emetteurNumeroImpot: f.emetteurNumeroImpot,
          contrepartieNom: f.contrepartieNom,
          contrepartieAdresse: f.contrepartieAdresse,
          contrepartieNumeroImpot: f.contrepartieNumeroImpot,
          mentionTvaDebits: f.mentionTvaDebits,
          autresImpotsEtTaxes: nombre(f.autresImpotsEtTaxes),
          ecritureId: f.ecritureId,
          lignes: f.lignes.map((l) => ({
            id: l.id,
            ordre: l.ordre,
            designation: l.designation,
            quantite: nombre(l.quantite),
            prixUnitaire: nombre(l.prixUnitaire),
            montantHT: nombre(l.montantHT),
            imposable: l.imposable,
            tauxApplique: nombre(l.tauxApplique),
            montantTva: nombre(l.montantTva),
          })),
          totaux: totauxFacture(v),
          mentions: verifierMentions(v, morale, {
            sensVente: f.sens === SensFacture.VENTE,
            regimeExigibiliteTva: t.regimeExigibiliteTva,
          }),
        };
      }),
    };
  }

  async enregistrer(tenantId: string, dto: EnregistrerFactureDto) {
    const t = await this.dossier(tenantId);

    // L'IDENTITÉ DE LA CONTREPARTIE VIENT DU TIERS QUAND IL EST DONNÉ, ET DE LA
    // SAISIE SINON · une facture reçue d'un fournisseur non ouvert au plan des
    // tiers doit pouvoir entrer, sans quoi l'état détaillé perdrait la ligne.
    let contrepartieNom = dto.contrepartieNom?.trim() ?? '';
    let contrepartieAdresse = dto.contrepartieAdresse?.trim() || null;
    let contrepartieNumeroImpot = dto.contrepartieNumeroImpot?.trim() || null;
    if (dto.tiersId) {
      const tiers = await this.prisma.tiers.findFirst({
        where: { id: dto.tiersId, tenantId },
        select: { nom: true, numeroImpot: true, adresse: true, ville: true },
      });
      if (!tiers) throw new NotFoundException('Tiers introuvable dans ce dossier.');
      contrepartieNom = contrepartieNom || tiers.nom;
      contrepartieNumeroImpot = contrepartieNumeroImpot ?? tiers.numeroImpot;
      // ADRESSE RECOPIÉE À LA DATE DE LA PIÈCE, comme le nom · ce que la fiche
      // du tiers porte aujourd'hui sert de défaut, et n'est jamais relu ensuite.
      contrepartieAdresse = contrepartieAdresse ?? ([tiers.adresse, tiers.ville].filter(Boolean).join(', ') || null);
    }
    if (!contrepartieNom) {
      throw new BadRequestException(
        'L’identité de la contrepartie est la deuxième mention de l’art. 100 du décret n° 011/42 · ' +
          'renseignez un tiers ou saisissez le nom.',
      );
    }

    if (dto.ecritureId) {
      const ecriture = await this.prisma.ecriture.findFirst({
        where: { id: dto.ecritureId, tenantId },
        select: { id: true },
      });
      if (!ecriture) throw new NotFoundException('Écriture introuvable dans ce dossier.');
    }

    const doublon = await this.prisma.facture.findFirst({
      where: { tenantId, sens: dto.sens, numeroSerie: dto.numeroSerie.trim() },
      select: { id: true },
    });
    if (doublon) {
      throw new BadRequestException(
        `Le numéro de série « ${dto.numeroSerie.trim()} » est déjà porté par une facture de ce sens dans ce ` +
          'dossier. Le n° de série est la troisième mention de l’art. 100 : deux pièces ne peuvent pas le partager.',
      );
    }

    // L'adresse du dossier vient de ses paramètres, et reste NULLE quand ils ne
    // la portent pas · la mention manque alors, ce qui est l'état vrai.
    const adresseDossier = [t.adresse, t.ville].filter(Boolean).join(', ') || null;

    const facture = await this.prisma.facture.create({
      data: {
        tenantId,
        sens: dto.sens,
        numeroSerie: dto.numeroSerie.trim(),
        dateFacture: new Date(dto.dateFacture),
        tiersId: dto.tiersId ?? null,
        // L'ÉMETTEUR EST LE DOSSIER SUR UNE VENTE, LA CONTREPARTIE SUR UN ACHAT.
        // L'art. 100 demande le vendeur ou prestataire · sur une facture reçue,
        // ce n'est pas nous.
        emetteurNom: dto.sens === SensFacture.VENTE ? t.nom : contrepartieNom,
        emetteurAdresse: dto.sens === SensFacture.VENTE ? adresseDossier : contrepartieAdresse,
        emetteurNumeroImpot: dto.sens === SensFacture.VENTE ? t.numeroImpot : contrepartieNumeroImpot,
        contrepartieNom: dto.sens === SensFacture.VENTE ? contrepartieNom : t.nom,
        contrepartieAdresse: dto.sens === SensFacture.VENTE ? contrepartieAdresse : adresseDossier,
        contrepartieNumeroImpot: dto.sens === SensFacture.VENTE ? contrepartieNumeroImpot : t.numeroImpot,
        mentionTvaDebits: dto.mentionTvaDebits ?? false,
        autresImpotsEtTaxes:
          dto.autresImpotsEtTaxes === undefined ? null : new Prisma.Decimal(dto.autresImpotsEtTaxes),
        ecritureId: dto.ecritureId ?? null,
        lignes: {
          create: dto.lignes.map((l, i) => ({
            ordre: i + 1,
            designation: l.designation.trim(),
            quantite: new Prisma.Decimal(l.quantite),
            prixUnitaire: new Prisma.Decimal(l.prixUnitaire),
            montantHT: new Prisma.Decimal(l.montantHT),
            imposable: l.imposable ?? true,
            tauxTvaId: l.tauxTvaId ?? null,
            tauxApplique: l.tauxApplique === undefined ? null : new Prisma.Decimal(l.tauxApplique),
            montantTva: new Prisma.Decimal(l.montantTva ?? 0),
          })),
        },
      },
      include: { lignes: { orderBy: { ordre: 'asc' } } },
    });

    const v = this.verifiable(facture);
    return {
      id: facture.id,
      totaux: totauxFacture(v),
      mentions: verifierMentions(v, this.estPersonneMorale(t), {
        sensVente: facture.sens === SensFacture.VENTE,
        regimeExigibiliteTva: t.regimeExigibiliteTva,
      }),
      homologation: HOMOLOGATION,
    };
  }

  async supprimer(tenantId: string, id: string) {
    const facture = await this.prisma.facture.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!facture) throw new NotFoundException('Facture introuvable dans ce dossier.');
    await this.prisma.facture.delete({ where: { id: facture.id } });
    return { supprimee: true };
  }

  /**
   * L'ÉTAT DÉTAILLÉ D'UN MOIS · art. 56 de l'O.-L. n° 10/001.
   *
   * SUR LES FACTURES D'ACHAT SEULEMENT. L'état justifie la taxe DÉDUCTIBLE :
   * la prendre aussi sur les ventes gonflerait de la taxe collectée un état
   * qui ne parle que de déductions, et l'Administration y lirait une déduction
   * qui n'a jamais été demandée.
   */
  async etatDetaille(tenantId: string, periode: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periode ?? '')) {
      throw new BadRequestException('Période attendue au format AAAA-MM · la déclaration de TVA est mensuelle (art. 60).');
    }
    const [annee, mois] = periode.split('-').map(Number);
    const debut = new Date(Date.UTC(annee, mois - 1, 1));
    const finExclue = new Date(Date.UTC(annee, mois, 1));

    const factures = await this.prisma.facture.findMany({
      where: { tenantId, sens: SensFacture.ACHAT, dateFacture: { gte: debut, lt: finExclue } },
      include: { lignes: { orderBy: { ordre: 'asc' } } },
      orderBy: [{ dateFacture: 'asc' }, { numeroSerie: 'asc' }],
    });

    const source: FactureAchatSource[] = factures.map((f) => ({
      numeroSerie: f.numeroSerie,
      dateFacture: f.dateFacture,
      // SUR UN ACHAT, LE FOURNISSEUR EST L'ÉMETTEUR · c'est lui que l'art. 134
      // nomme, et non la contrepartie, qui est le dossier lui-même.
      fournisseurNom: f.emetteurNom,
      fournisseurNumeroImpot: f.emetteurNumeroImpot,
      lignes: f.lignes.map((l) => ({
        designation: l.designation,
        quantite: Number(l.quantite),
        prixHT: Number(l.montantHT),
        montantTva: Number(l.montantTva),
        imposable: l.imposable,
      })),
    }));

    return construireEtatDetaille(periode, source);
  }
}

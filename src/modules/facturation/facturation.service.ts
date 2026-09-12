import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SensFacture } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EnregistrerFactureDto } from './dto/facture.dto';
import {
  FactureVerifiable,
  HOMOLOGATION,
  totauxFacture,
  verifierMentions,
} from './mentions-facture';
import { construireEtatDetaille, FactureAchatSource } from './etat-detaille-tva';

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
      select: { id: true, nom: true, numeroImpot: true, formeJuridique: true, formeJuridiqueSyscohada: true },
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
    return t.formeJuridiqueSyscohada !== 'ENTREPRISE_INDIVIDUELLE';
  }

  private verifiable(f: {
    emetteurNom: string;
    emetteurNumeroImpot: string | null;
    contrepartieNom: string;
    contrepartieNumeroImpot: string | null;
    dateFacture: Date;
    numeroSerie: string;
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
      emetteurNumeroImpot: f.emetteurNumeroImpot,
      contrepartieNom: f.contrepartieNom,
      contrepartieNumeroImpot: f.contrepartieNumeroImpot,
      dateFacture: f.dateFacture,
      numeroSerie: f.numeroSerie,
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
      factures: factures.map((f) => {
        const v = this.verifiable(f);
        return {
          id: f.id,
          sens: f.sens,
          numeroSerie: f.numeroSerie,
          dateFacture: f.dateFacture,
          tiers: f.tiers,
          emetteurNom: f.emetteurNom,
          emetteurNumeroImpot: f.emetteurNumeroImpot,
          contrepartieNom: f.contrepartieNom,
          contrepartieNumeroImpot: f.contrepartieNumeroImpot,
          mentionTvaDebits: f.mentionTvaDebits,
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
          mentions: verifierMentions(v, morale),
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
    let contrepartieNumeroImpot = dto.contrepartieNumeroImpot?.trim() || null;
    if (dto.tiersId) {
      const tiers = await this.prisma.tiers.findFirst({
        where: { id: dto.tiersId, tenantId },
        select: { nom: true, numeroImpot: true },
      });
      if (!tiers) throw new NotFoundException('Tiers introuvable dans ce dossier.');
      contrepartieNom = contrepartieNom || tiers.nom;
      contrepartieNumeroImpot = contrepartieNumeroImpot ?? tiers.numeroImpot;
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
        emetteurNumeroImpot: dto.sens === SensFacture.VENTE ? t.numeroImpot : contrepartieNumeroImpot,
        contrepartieNom: dto.sens === SensFacture.VENTE ? contrepartieNom : t.nom,
        contrepartieNumeroImpot: dto.sens === SensFacture.VENTE ? contrepartieNumeroImpot : t.numeroImpot,
        mentionTvaDebits: dto.mentionTvaDebits ?? false,
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
      mentions: verifierMentions(v, this.estPersonneMorale(t)),
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

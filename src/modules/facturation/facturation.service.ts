import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NatureFacture, Prisma, SensFacture } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EmettreNoteDeCreditDto, EnregistrerFactureDto } from './dto/facture.dto';
import {
  FactureVerifiable,
  HOMOLOGATION,
  OBLIGATION_DACCEPTATION,
  renvoiALaMention,
  totauxFacture,
  verifierMentions,
} from './mentions-facture';
import { construireEtatDetaille, FactureAchatSource } from './etat-detaille-tva';
import { FORMES_PERSONNES_PHYSIQUES } from '../retenues/correspondance-retenues';
import { identiteSociete, mentionsRecopiees, SELECT_IDENTITE_SOCIETE, type MentionsRecopiees } from '../tenant/mentions-societe';
import { lirePeriodeDeListe } from '../../common/periode-de-liste';
import { motifRefusDateReception } from './date-reception';
import { jourDeKinshasa } from '../../common/echeance';

const nombre = (d: Prisma.Decimal | number | null): number | null =>
  d === null || d === undefined ? null : Number(d);

/**
 * LA FACTURE, TENUE COMME PIÈCE ET NON COMME COMPTABILITÉ.
 *
 * Le service n'écrit aucun montant au grand livre et n'en lit aucun : il
 * enregistre un document, le confronte aux mentions du texte en vigueur à sa
 * date (`texteApplicable`), et le rattache à
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
        numeroImpot: true,
        // AUSCGIE art. 17, 204, 386 et 853-2, AUDCG art. 59, 62 et 140, AUSCOOP
        // art. 19 et 183, loi n° 004/2001 art. 16 · tout ce que la ligne
        // recopiée sur une facture émise lit, par la sélection commune.
        ...SELECT_IDENTITE_SOCIETE,
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

  /**
   * LE FACTURIER À L'ÉCRAN · une période, et une tranche qui se dit (audit
   * final F188, § 8 bis).
   *
   * La liste rendait toutes les pièces du dossier, lignes comprises, à chaque
   * ouverture de la fenêtre · la mémoire du serveur dépendait de l'ancienneté
   * du cabinet. Elle se lit désormais sur la DATE DE LA PIÈCE (`du`, `au`) et
   * sous `PLAFOND_LISTE_FACTURES`, la plus récente d'abord comme avant. Le
   * total est COMPTÉ par la base sur la période entière, et `tronque` dit
   * quand la tranche en rend moins · « 500 » ne doit jamais se lire comme le
   * nombre de pièces du facturier.
   *
   * Rien d'autre n'est calculé sur la liste. L'état détaillé, l'impression, la
   * passation et les abonnements de la console lisent leurs pièces par leurs
   * propres requêtes, et ne passent pas par ici.
   */
  async lister(tenantId: string, params: { sens?: SensFacture; du?: string; au?: string } = {}) {
    // La période se lit AVANT toute lecture · une date illisible est un refus,
    // jamais une liste élargie en silence.
    const periode = lirePeriodeDeListe(params);
    const t = await this.dossier(tenantId);
    const morale = this.estPersonneMorale(t);
    const filtre: Prisma.FactureWhereInput = {
      ...(params.sens ? { sens: params.sens } : {}),
      ...(periode.bornes ? { dateFacture: periode.bornes } : {}),
    };
    const [factures, total] = await Promise.all([
      this.prisma.facture.findMany({
        where: { tenantId, ...filtre },
        include: {
          lignes: { orderBy: { ordre: 'asc' } },
          tiers: { select: { id: true, code: true, nom: true } },
          factureAnnulee: { select: { id: true, numeroSerie: true, dateFacture: true } },
          noteDeCredit: { select: { id: true, numeroSerie: true, dateFacture: true } },
        },
        // L'identifiant départage les ex aequo (une vente et un achat du même
        // jour sous le même numéro) · sans lui, la frontière d'une tranche
        // pleine changerait d'un appel à l'autre.
        orderBy: [{ dateFacture: 'desc' }, { numeroSerie: 'desc' }, { id: 'desc' }],
        take: PLAFOND_LISTE_FACTURES,
      }),
      this.prisma.facture.count({ where: { tenantId, ...filtre } }),
    ]);

    return {
      homologation: HOMOLOGATION,
      obligationDAcceptation: OBLIGATION_DACCEPTATION,
      // Décret n° 011/42, art. 60 · l'écran propose la mention cochée sur une
      // vente d'un dossier autorisé aux débits (audit final F24).
      regimeExigibiliteTva: t.regimeExigibiliteTva,
      periode: { du: periode.du, au: periode.au },
      total,
      plafond: PLAFOND_LISTE_FACTURES,
      tronque: total > factures.length,
      factures: factures.map((f) => {
        const v = this.verifiable(f);
        return {
          id: f.id,
          sens: f.sens,
          nature: f.nature,
          /** La facture que cette note annule et remplace. */
          factureAnnulee: f.factureAnnulee,
          /** La note qui annule cette facture, s'il y en a une. */
          noteDeCredit: f.noteDeCredit,
          /**
           * DÉCRET ART. 127 · la facture initiale « doit être BARRÉE et
           * conservée dans le facturier ». Calculé, jamais stocké : c'est
           * l'existence de la note qui barre la facture, et un drapeau posé à
           * part pourrait la contredire.
           */
          barree: f.noteDeCredit !== null,
          numeroSerie: f.numeroSerie,
          dateFacture: f.dateFacture,
          /** Réception d'une pièce reçue (ligne A21) · null sur une vente ou une pièce non renseignée. */
          dateReception: f.dateReception,
          tiers: f.tiers,
          emetteurNom: f.emetteurNom,
          emetteurAdresse: f.emetteurAdresse,
          emetteurNumeroImpot: f.emetteurNumeroImpot,
          contrepartieNom: f.contrepartieNom,
          contrepartieAdresse: f.contrepartieAdresse,
          contrepartieNumeroImpot: f.contrepartieNumeroImpot,
          mentionTvaDebits: f.mentionTvaDebits,
          mentionsSocieteEmetteur: f.mentionsSocieteEmetteur as MentionsRecopiees | null,
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
    // LES REFUS NOMMENT LE TEXTE EN VIGUEUR À LA DATE DE LA PIÈCE (audit final
    // F229) · une pièce de 2022 se juge sur l'art. 100 du décret n° 011/42, une
    // pièce de 2026 sur l'art. 26 du décret n° 23/10, et le renvoi passe par la
    // fonction qui choisit la liste vérifiée.
    const dateFacture = new Date(dto.dateFacture);
    // LA DATE DE RÉCEPTION D'UNE PIÈCE REÇUE (AUDCIF art. 16, al. 2, ligne
    // A21) · refusée sur une vente, jamais antérieure à la pièce ni future.
    const dateReception = dto.dateReception ? new Date(dto.dateReception) : null;
    const motifReception = motifRefusDateReception({ sens: dto.sens, dateFacture, dateReception }, jourDeKinshasa(new Date()));
    if (motifReception) throw new BadRequestException(motifReception);

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
      // La contrepartie est le CLIENT sur une vente et le VENDEUR sur un achat,
      // comme l'émetteur est posé plus bas · les deux textes les écrivent sous
      // deux mentions distinctes.
      const vente = dto.sens === SensFacture.VENTE;
      throw new BadRequestException(
        `L’identité ${vente ? 'du client' : 'du vendeur ou prestataire'} est exigée au ` +
          `${renvoiALaMention(dateFacture, vente ? 'IDENTITE_CLIENT' : 'IDENTITE_VENDEUR')} · ` +
          'renseignez un tiers ou saisissez le nom.',
      );
    }

    // UN TAUX D'UN AUTRE DOSSIER N'EXISTE PAS (audit final F120) · la ligne
    // de facture ne porte pas de `tenantId`, la garde de cloisonnement ne
    // voit donc pas le lien, et le compte de TVA d'un voisin serait passé.
    const idsTaux = [...new Set(dto.lignes.map((l) => l.tauxTvaId).filter((x): x is string => !!x))];
    if (idsTaux.length) {
      const trouves = await this.prisma.tauxTva.findMany({ where: { id: { in: idsTaux }, tenantId }, select: { id: true } });
      if (trouves.length !== idsTaux.length) throw new NotFoundException('Taux de taxe introuvable dans ce dossier.');
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
          `dossier. Le n° de série est exigé au ${renvoiALaMention(dateFacture, 'DATE_ET_NUMERO')} : deux pièces ` +
          'ne peuvent pas le partager.',
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
        dateFacture,
        dateReception,
        tiersId: dto.tiersId ?? null,
        // L'ÉMETTEUR EST LE DOSSIER SUR UNE VENTE, LA CONTREPARTIE SUR UN ACHAT.
        // L'art. 26 a), comme l'art. 100 avant lui, demande le vendeur ou
        // prestataire · sur une facture reçue, ce n'est pas nous.
        emetteurNom: dto.sens === SensFacture.VENTE ? t.nom : contrepartieNom,
        emetteurAdresse: dto.sens === SensFacture.VENTE ? adresseDossier : contrepartieAdresse,
        emetteurNumeroImpot: dto.sens === SensFacture.VENTE ? t.numeroImpot : contrepartieNumeroImpot,
        contrepartieNom: dto.sens === SensFacture.VENTE ? contrepartieNom : t.nom,
        contrepartieAdresse: dto.sens === SensFacture.VENTE ? contrepartieAdresse : adresseDossier,
        contrepartieNumeroImpot: dto.sens === SensFacture.VENTE ? contrepartieNumeroImpot : t.numeroImpot,
        mentionTvaDebits: dto.mentionTvaDebits ?? false,
        // Sur une vente, le dossier émet · l'art. 17 lui est recopié à la date
        // de la pièce. Sur un achat, l'émetteur est un tiers dont on ignore le
        // capital, rien n'est recopié.
        mentionsSocieteEmetteur:
          dto.sens === SensFacture.VENTE ? (mentionsRecopiees(identiteSociete(t), dateFacture) as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
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

  /**
   * LA NOTE DE CRÉDIT · O.-L. n° 10/001, art. 52 al. 2, et décret n° 011/42,
   * art. 127.
   *
   * « Pour les opérations annulées ou résiliées, la récupération de la taxe sur
   * la valeur ajoutée acquittée par le vendeur est subordonnée à
   * l'établissement et à l'envoi au client d'une facture nouvelle ou d'une note
   * de crédit ANNULANT ET REMPLAÇANT la facture initiale. Celle-ci doit être
   * barrée et conservée dans le facturier ou classeur des factures selon
   * l'ordre chronologique de numérotation. »
   *
   * ANNULANT : la note reprend la facture ENTIÈRE, ligne pour ligne. Le texte
   * ne connaît pas d'annulation partielle ; une opération seulement réduite se
   * traite en « facture nouvelle », que le module sait déjà enregistrer.
   *
   * LES IDENTITÉS SONT CELLES DE LA FACTURE ANNULÉE, et non celles du jour. La
   * note ne documente pas une opération nouvelle, elle défait celle-là : le
   * client doit y retrouver exactement ce qu'il a déduit, pour pouvoir le
   * reverser.
   *
   * LES DEUX SENS. Sur une VENTE, c'est la pièce que l'art. 127 exige du
   * vendeur. Sur un ACHAT, c'est la note reçue d'un fournisseur, enregistrée
   * pour la même raison qu'une facture reçue : la tenir dans le facturier.
   */
  async emettreNoteDeCredit(tenantId: string, factureId: string, dto: EmettreNoteDeCreditDto) {
    const initiale = await this.prisma.facture.findFirst({
      where: { id: factureId, tenantId },
      include: { lignes: { orderBy: { ordre: 'asc' } }, noteDeCredit: { select: { numeroSerie: true } } },
    });
    if (!initiale) throw new NotFoundException('Facture introuvable dans ce dossier.');
    if (initiale.nature !== NatureFacture.FACTURE) {
      throw new BadRequestException(
        'Une note de crédit annule une FACTURE (décret n° 011/42, art. 127). Pour revenir sur une note émise ' +
          'à tort, établissez une facture nouvelle.',
      );
    }
    if (initiale.noteDeCredit) {
      throw new BadRequestException(
        `Cette facture est déjà annulée par la note de crédit « ${initiale.noteDeCredit.numeroSerie} ».`,
      );
    }

    const dateNote = new Date(dto.dateNote);
    // Le facturier se tient « selon l'ordre chronologique » (art. 127) · une
    // note ne peut pas annuler une facture qui n'existait pas encore.
    if (dateNote < initiale.dateFacture) {
      throw new BadRequestException(
        'La note de crédit ne peut pas être antérieure à la facture qu’elle annule.',
      );
    }

    // Une note REÇUE d'un fournisseur est une pièce d'origine externe, comme
    // la facture qu'elle annule · même règle (ligne A21).
    const dateReceptionNote = dto.dateReception ? new Date(dto.dateReception) : null;
    const motifReception = motifRefusDateReception(
      { sens: initiale.sens, dateFacture: dateNote, dateReception: dateReceptionNote },
      jourDeKinshasa(new Date()),
    );
    if (motifReception) throw new BadRequestException(motifReception);

    const numeroSerie = dto.numeroSerie.trim();
    const doublon = await this.prisma.facture.findFirst({
      where: { tenantId, sens: initiale.sens, numeroSerie },
      select: { id: true },
    });
    if (doublon) {
      throw new BadRequestException(
        `Le numéro de série « ${numeroSerie} » est déjà porté par une pièce de ce sens dans ce dossier. ` +
          'La note de crédit est rangée dans le même facturier que les factures : deux pièces ne partagent pas un numéro.',
      );
    }

    if (dto.ecritureId) {
      const ecriture = await this.prisma.ecriture.findFirst({
        where: { id: dto.ecritureId, tenantId },
        select: { id: true },
      });
      if (!ecriture) throw new NotFoundException('Écriture introuvable dans ce dossier.');
    }

    const note = await this.prisma.facture.create({
      data: {
        tenantId,
        sens: initiale.sens,
        nature: NatureFacture.NOTE_DE_CREDIT,
        factureAnnuleeId: initiale.id,
        numeroSerie,
        dateFacture: dateNote,
        dateReception: dateReceptionNote,
        tiersId: initiale.tiersId,
        emetteurNom: initiale.emetteurNom,
        emetteurAdresse: initiale.emetteurAdresse,
        emetteurNumeroImpot: initiale.emetteurNumeroImpot,
        contrepartieNom: initiale.contrepartieNom,
        contrepartieAdresse: initiale.contrepartieAdresse,
        contrepartieNumeroImpot: initiale.contrepartieNumeroImpot,
        mentionTvaDebits: initiale.mentionTvaDebits,
        // Recopiée de la facture annulée, comme les identités · la note la
        // remplace, elle ne réécrit pas qui l'a émise.
        mentionsSocieteEmetteur: (initiale.mentionsSocieteEmetteur ?? Prisma.DbNull) as Prisma.InputJsonValue,
        autresImpotsEtTaxes: initiale.autresImpotsEtTaxes,
        ecritureId: dto.ecritureId ?? null,
        lignes: {
          create: initiale.lignes.map((l) => ({
            ordre: l.ordre,
            designation: l.designation,
            quantite: l.quantite,
            prixUnitaire: l.prixUnitaire,
            montantHT: l.montantHT,
            imposable: l.imposable,
            tauxTvaId: l.tauxTvaId,
            tauxApplique: l.tauxApplique,
            montantTva: l.montantTva,
          })),
        },
      },
      include: { lignes: { orderBy: { ordre: 'asc' } } },
    });

    return {
      id: note.id,
      nature: note.nature,
      factureAnnulee: { id: initiale.id, numeroSerie: initiale.numeroSerie },
      totaux: totauxFacture(this.verifiable(note)),
    };
  }

  async supprimer(tenantId: string, id: string) {
    const facture = await this.prisma.facture.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        nature: true,
        numeroSerie: true,
        ecritureId: true,
        factureAnnulee: { select: { numeroSerie: true } },
        noteDeCredit: { select: { numeroSerie: true } },
        factureAbonnement: { select: { periode: true } },
      },
    });
    if (!facture) throw new NotFoundException('Facture introuvable dans ce dossier.');
    // UNE PIÈCE PASSÉE AU JOURNAL NE SE SUPPRIME PAS (audit final F119) · le
    // lien est facultatif et la base le DÉNOUERAIT, laissant au journal une
    // écriture sans sa pièce. L'écriture se retire d'abord, au brouillard ;
    // validée, la pièce se conserve et s'annule par une note de crédit.
    if (facture.ecritureId) {
      throw new BadRequestException(
        `La pièce « ${facture.numeroSerie} » est passée au journal · retirez d’abord son écriture tant qu’elle est au ` +
          'brouillard ; validée, la pièce se conserve et s’annule par une note de crédit.',
      );
    }
    // UNE NOTE DE CRÉDIT EST UNE PIÈCE, ET ELLE BARRE UNE FACTURE (art. 127) ·
    // la supprimer débarrerait la facture et rendrait la taxe qu'elle a
    // reprise, sans qu'aucune trace ne dise pourquoi.
    if (facture.nature === NatureFacture.NOTE_DE_CREDIT) {
      throw new BadRequestException(
        `La note de crédit « ${facture.numeroSerie} » annule la facture « ${facture.factureAnnulee?.numeroSerie ?? '·'} » ` +
          '(décret n° 011/42, art. 127) · elle se conserve et ne se supprime pas.',
      );
    }
    // Une facture d'abonnement est tenue par la console de l'éditeur, qui y
    // lit ce qui a été facturé · la supprimer ici ferait refacturer la période.
    if (facture.factureAbonnement) {
      throw new BadRequestException(
        `Cette facture est celle de l’abonnement pour ${facture.factureAbonnement.periode} · elle ne se supprime pas ; une erreur s’annule par une note de crédit.`,
      );
    }
    // LA FACTURE ANNULÉE SE CONSERVE. Décret n° 011/42, art. 127 : elle « doit
    // être barrée et conservée dans le facturier ou classeur des factures selon
    // l'ordre chronologique de numérotation ». La clé étrangère RESTRICT le
    // refuserait aussi, mais avec une erreur de base que personne ne lirait.
    if (facture.noteDeCredit) {
      throw new BadRequestException(
        `Cette facture est annulée par la note de crédit « ${facture.noteDeCredit.numeroSerie} ». Elle doit être ` +
          'barrée et CONSERVÉE dans le facturier (décret n° 011/42, art. 127) : elle ne se supprime pas.',
      );
    }
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
      // LES NOTES DE CRÉDIT N'Y ENTRENT PAS. L'état justifie la taxe
      // DÉDUCTIBLE, et une note reçue d'un fournisseur la RÉDUIT : ses montants
      // sont positifs (la nature porte le sens), si bien qu'elle s'y
      // additionnerait comme une facture de plus et gonflerait la déduction du
      // montant même qu'elle annule.
      where: {
        tenantId,
        sens: SensFacture.ACHAT,
        nature: NatureFacture.FACTURE,
        // LE MOIS DE LA RÉCEPTION, à défaut celui de la facture (ligne A21).
        // L'état est joint « pour exercer le droit à déduction » (art. 56) ·
        // il accompagne la déclaration où la taxe est déduite. Une facture
        // reçue s'enregistre à sa réception (AUDCIF art. 16, al. 2), et sa
        // taxe, qui ne se déduit que figurant sur la facture (O.-L. n° 10/001,
        // art. 38, 1°), entre dans la déclaration de ce mois-là · la lister au
        // mois de sa date ferait justifier en décembre une déduction déclarée
        // en janvier. Une facture sans date de réception (enregistrée avant
        // A21) reste à son mois, comme avant.
        OR: [
          { dateReception: { gte: debut, lt: finExclue } },
          { dateReception: null, dateFacture: { gte: debut, lt: finExclue } },
        ],
      },
      include: {
        lignes: { orderBy: { ordre: 'asc' } },
        // La note qui barre la facture (art. 127) · sans elle, l'état
        // justifiait une déduction reprise (audit final F117).
        noteDeCredit: { select: { numeroSerie: true, dateFacture: true } },
      },
      orderBy: [{ dateFacture: 'asc' }, { numeroSerie: 'asc' }],
    });

    const source: FactureAchatSource[] = factures.map((f) => ({
      numeroSerie: f.numeroSerie,
      dateFacture: f.dateFacture,
      annuleePar: f.noteDeCredit ? { numeroSerie: f.noteDeCredit.numeroSerie, dateFacture: f.noteDeCredit.dateFacture } : null,
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

/** Plafond d'une tranche du facturier à l'écran · une fenêtre, pas un export (§ 8 bis, audit final F188). */
export const PLAFOND_LISTE_FACTURES = 500;

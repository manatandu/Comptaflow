import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NatureCreanceDouteuse,
  OrigineLettrage,
  Prisma,
  Referentiel,
  StatutEcriture,
  StatutExercice,
  TypeCompteDetailTotal,
  TypeJournal,
  TypeMouvementCreanceDouteuse,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { transactionJournalisee } from '../../common/audit/transaction-journalisee';
import { LOT_ECRITURES, lireParLots, pageApres } from '../../common/lecture-par-lots';
import { motifRefusDepreciationSmt } from '../../common/systeme-minimal';
import {
  DETENTEUR_MOUVEMENT_CREANCE,
  DETENTEUR_RECLASSEMENT_CREANCE,
  EcritureService,
} from '../comptabilite/ecriture.service';
import { motifLignesTenues } from '../comptabilite/lignes-tenues';
import { LettrageService } from '../lettrage/lettrage.service';
import { lignesFigees } from '../exercice/gel-cloture';
import {
  COMPTES_CREANCES_DOUTEUSES,
  RACINES_CREANCE_SOURCE,
  avertissementMethodeCotisations,
  centimes,
  compte416Propose,
  compte491,
  comptePertePropose,
  ecartDeDepreciation,
  enPlaceAvant,
  INFORMATION_BORNE_RECONSTITUEE,
  informationLettrageMaintenu,
  motifLettrageFigeAuBrouillard,
  motifRefusAnnulationMouvement,
  motifRefusAnnulationRevue,
  motifRefusAnnulationReclassement,
  motifNonRetirable,
  motifRefus491,
  motifRefusCotisationsEncaissement,
  motifResteNegatif,
  resteFinalDeLaCreance,
  mouvementsSansRevue,
  motifRefusDeclaration,
  motifRefusMouvement,
  motifRefusReclassement,
  motifRefusRevue,
  piecesLisibles,
  resteDeLaCreance,
  revueAFaire,
} from './creances-douteuses';
import {
  AnnulerMouvementDto,
  AnnulerReclassementDto,
  AnnulerRevueDto,
  DeclarerCreanceOuvertureDto,
  PerteCreanceDto,
  PieceJustificativeDto,
  ReclasserCreanceDto,
  RecouvrementCreanceDto,
  RevoirDepreciationDto,
} from './dto/creances-douteuses.dto';

const n = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);
const jour = (d: Date) => d.toISOString().slice(0, 10);

/** Borne de la liste servie · au-delà, la liste le dit (`tronque`). */
export const PLAFOND_CREANCES_LISTEES = 500;
const PLAFOND_COMPTES_CANDIDATS = 1000;
/**
 * m5 · borne des listes de 416 et de 491 de détail · au-delà, la liste le dit
 * (`tronque`, `total`, § 8 bis) · un plan n'en ouvre d'ordinaire que deux.
 */
export const PLAFOND_COMPTES_416_491 = 200;

/**
 * L'échéance du verrou des gestes · une borne de REPRISE d'un processus tombé
 * avant son `finally`, bien au-delà d'un geste (convention d'OmegaX, même
 * valeur que la ligne A5).
 */
export const ECHEANCE_VERROU_CREANCES_MS = 15 * 60 * 1000;
export const MOTIF_VERROU_CREANCES =
  'Une opération sur les créances douteuses est en cours sur ce dossier · réessayez après sa fin.';

/**
 * L'À-NOUVEAU QUI FAIT FOI d'un exercice · bilan d'ouverture importé ou report
 * de la clôture, quel qu'en soit le statut. L'À-NOUVEAU PROVISOIRE d'OmegaX
 * (`estANouveauProvisoire`) n'en est PAS un (ligne A7 ter, B1) · il est
 * calculé sur le seul livre-journal de l'exercice précédent, sans son
 * brouillard (point 11), et lu comme solde il valait zéro pour une facture
 * passée au brouillard le 10 décembre · le reclassement du 31 décembre était
 * refusé « au-delà de ce que le client doit au plus tard enregistré
 * (0.00) ». Même parti que la provision pour pertes de change (ligne A5,
 * `DevisesService.ouverturesDe`) · seul l'à-nouveau provisoire cède la place
 * à la clôture précédente, reconstituée brouillard compris.
 */
const A_NOUVEAU = { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false, estANouveauProvisoire: false } as const;

/**
 * JAMAIS L'À-NOUVEAU PROVISOIRE DANS UN SOLDE (B1) · la chaîne lit déjà
 * l'exercice précédent qu'il recopie ; le compter en plus porterait le report
 * DEUX fois.
 */
const HORS_REPORT_PROVISOIRE = { estANouveauProvisoire: false } as const;

const INCLURE_CREANCE = {
  compteCreance: { select: { id: true, numero: true, intitule: true, tiersCompte: { select: { tiers: { select: { nom: true } } } } } },
  compte416: { select: { id: true, numero: true, intitule: true } },
  compte491: { select: { id: true, numero: true, intitule: true } },
  // Seules les revues NON ANNULÉES comptent (relecture adverse, B2).
  ajustements: {
    where: { annuleeLe: null },
    include: { exercice: { select: { dateDebut: true, dateFin: true, statut: true } } },
    orderBy: { date: 'asc' as const },
  },
  // Seuls les mouvements NON ANNULÉS comptent (seconde relecture, K4) · le
  // reste de la créance, les revues et la clôture les ignorent ; les annulés
  // sont lus à part, pour l'écran.
  mouvements: {
    where: { annuleeLe: null },
    orderBy: { date: 'asc' as const },
  },
} satisfies Prisma.CreanceDouteuseInclude;

type Creance = Prisma.CreanceDouteuseGetPayload<{ include: typeof INCLURE_CREANCE }>;

/**
 * La lecture de la LISTE · ce qui décide aussi du retrait (m6), servi à
 * l'écran · tous les actes, annulés compris (`_count`), l'exercice de la
 * créance, l'écriture du reclassement et ses lignes.
 */
const INCLURE_LISTE = {
  ...INCLURE_CREANCE,
  _count: { select: { ajustements: true, mouvements: true } },
  exercice: { select: { statut: true } },
  ecritureReclassement: { select: { statut: true, lignes: { select: { lettre: true, lettrageId: true, rapprochementId: true } } } },
} satisfies Prisma.CreanceDouteuseInclude;

type CreanceListee = Prisma.CreanceDouteuseGetPayload<{ include: typeof INCLURE_LISTE }>;

/**
 * m6 · LE VERDICT DU RETRAIT, servi · la règle de `retirerCreance`
 * (`motifNonRetirable`), jamais recalculée à l'écran. Une lecture incomplète
 * ne rend jamais « retirable ».
 */
function estRetirable(c: CreanceListee): boolean {
  if (!c._count || !c.exercice) return false;
  const e = c.ecritureReclassement;
  return (
    motifNonRetirable({
      revuesTotal: c._count.ajustements,
      mouvementsTotal: c._count.mouvements,
      exerciceClos: c.exercice.statut === StatutExercice.CLOTURE,
      ecriture: e
        ? {
            statut: e.statut === StatutEcriture.BROUILLARD ? 'BROUILLARD' : 'VALIDEE',
            tenue: motifLignesTenues(e.lignes, 'le reclassement', 'retirer') !== null,
          }
        : null,
    }) === null
  );
}

/**
 * CRÉANCES DOUTEUSES OU LITIGIEUSES · la règle est dans `creances-douteuses.ts`
 * ; ici, la lecture des comptes, des créances et de leurs revues, puis
 * l'écriture, retenue par sa ligne (`detenteurs-ecriture.ts`).
 *
 * CHAQUE GESTE REJOUE AU SERVEUR ce que l'écran a annoncé (jamais un montant
 * calculé par l'écran), sous un VERROU PAR DOSSIER qui ne retient aucune
 * connexion (relecture adverse, M6), et l'écriture part au brouillard par
 * `EcritureService.creer`, comme toute pièce.
 */
@Injectable()
export class CreancesDouteusesService {
  private readonly journalServeur = new Logger(CreancesDouteusesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
    private readonly lettrage: LettrageService,
  ) {}

  /**
   * LE VERROU DES GESTES (relecture adverse, M6) · le mécanisme de la ligne A5
   * (`DevisesService.sousVerrouDuDossier`), sur sa propre table · une ligne
   * par dossier, insérée sur la clé unique et retirée en `finally` ; un second
   * geste reçoit aussitôt un 409 qui dit le geste en cours, depuis quand, et
   * l'échéance. Un verrou consultatif tenu dans une transaction figerait le
   * pool de tous les cabinets.
   */
  private async sousVerrou<T>(tenantId: string, geste: string, travail: () => Promise<T>): Promise<T> {
    const maintenant = new Date();
    await this.prisma.verrouCreancesDouteuses.deleteMany({ where: { tenantId, echeance: { lt: maintenant } } });
    let verrou: { id: string };
    try {
      verrou = await this.prisma.verrouCreancesDouteuses.create({
        data: { tenantId, geste, echeance: new Date(maintenant.getTime() + ECHEANCE_VERROU_CREANCES_MS) },
        select: { id: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const tenu = await this.prisma.verrouCreancesDouteuses.findFirst({
          where: { tenantId },
          select: { geste: true, createdAt: true, echeance: true },
        });
        throw new ConflictException(
          tenu
            ? `${MOTIF_VERROU_CREANCES} Geste en cours · ${tenu.geste}, depuis le ${tenu.createdAt.toISOString()} ; ` +
                `le verrou échoit au plus tard le ${tenu.echeance.toISOString()}.`
            : MOTIF_VERROU_CREANCES,
        );
      }
      throw e;
    }
    let resultat!: T;
    let erreur: unknown = null;
    let echec = false;
    try {
      resultat = await travail();
    } catch (e) {
      echec = true;
      erreur = e;
    }
    try {
      await this.prisma.verrouCreancesDouteuses.deleteMany({ where: { tenantId, id: verrou.id } });
    } catch (liberation) {
      // Un retrait manqué ne masque jamais l'issue du geste · la ligne tombera à son échéance.
      this.journalServeur.error(
        `Verrou des créances douteuses du dossier ${tenantId} non retiré · il échoit à son échéance`,
        liberation instanceof Error ? liberation.stack : String(liberation),
      );
    }
    if (echec) throw erreur;
    return resultat;
  }

  /**
   * M3 · LE RETRAIT D'UNE ÉCRITURE ORPHELINE NE MASQUE JAMAIS L'ERREUR
   * D'ORIGINE · son propre échec est consigné avec l'identifiant de
   * l'écriture restée au brouillard, puis l'appelant rejette l'erreur
   * d'origine.
   */
  private async compenser(tenantId: string, ecritureId: string) {
    try {
      await this.ecritures.retirerCompensation(tenantId, ecritureId);
    } catch (retrait) {
      this.journalServeur.error(
        `Écriture ${ecritureId} du dossier ${tenantId} restée au brouillard · son retrait après l'échec du geste a échoué`,
        retrait instanceof Error ? retrait.stack : String(retrait),
      );
    }
  }

  /**
   * M1 · LE STATUT SE RELIT DANS LA TRANSACTION · une écriture validée entre
   * la lecture et l'annulation ne se supprime jamais, elle s'inscrit en
   * négatif (AUDCIF art. 22, 2°).
   */
  private async statutDansTx(tx: Prisma.TransactionClient, tenantId: string, ecritureId: string) {
    const e = await tx.ecriture.findFirst({ where: { id: ecritureId, tenantId }, select: { statut: true } });
    if (!e) throw new ConflictException(`L'écriture ${ecritureId} n'existe plus · relisez la créance avant d'annuler.`);
    return e.statut;
  }

  /** M1 · supprimée seulement si elle est ENCORE au brouillard, une et une seule, sinon 409. */
  private async supprimerBrouillardDansTx(tx: Prisma.TransactionClient, tenantId: string, ecritureId: string) {
    await tx.ligneEcriture.deleteMany({ where: { ecritureId, ecriture: { tenantId, statut: StatutEcriture.BROUILLARD } } });
    const r = await tx.ecriture.deleteMany({ where: { id: ecritureId, tenantId, statut: StatutEcriture.BROUILLARD } });
    if (r.count !== 1) {
      throw new ConflictException(
        "L'écriture a été validée ou retirée pendant l'annulation · rien n'est supprimé. Relancez l'annulation · validée, elle " +
          "s'inscrira en négatif (AUDCIF art. 20, al. 2).",
      );
    }
  }

  private async regime(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, systemeComptableSyscohada: true, jeuEtatsFinanciersSycebnl: true, methodeCotisations: true },
    });
  }

  private async exercice(tenantId: string, id: string) {
    const ex = await this.prisma.exercice.findFirst({ where: { id, tenantId } });
    if (!ex) throw new BadRequestException('Exercice introuvable pour ce dossier.');
    return ex;
  }

  private async journal(tenantId: string, id: string) {
    const j = await this.prisma.journal.findFirst({
      where: { id, tenantId },
      select: { id: true, code: true, type: true, compteTresorerieId: true },
    });
    if (!j) throw new BadRequestException('Journal introuvable pour ce dossier.');
    return j;
  }

  private async compteParId(tenantId: string, id: string) {
    const c = await this.prisma.compte.findFirst({
      where: { id, tenantId },
      select: { id: true, numero: true, intitule: true, typeCompte: true, estActif: true },
    });
    if (!c) throw new BadRequestException('Compte introuvable pour ce dossier.');
    return c;
  }

  /** Le premier compte de détail actif sous une racine · un compte absent se nomme. */
  private async compteDetail(tenantId: string, racine: string) {
    const c = await this.prisma.compte.findFirst({
      where: { tenantId, numero: { startsWith: racine }, typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true },
      orderBy: { numero: 'asc' },
      select: { id: true, numero: true, intitule: true, typeCompte: true },
    });
    if (!c) throw new BadRequestException(`Aucun compte ${racine} de détail au plan du dossier · ouvrez-le d'abord.`);
    return c;
  }

  /** Un à-nouveau qui fait foi · jamais l'à-nouveau provisoire (B1). */
  private async aUnANouveau(tenantId: string, exerciceId: string) {
    return (await this.prisma.ecriture.count({ where: { tenantId, exerciceId, ...A_NOUVEAU } })) > 0;
  }

  /** L'exercice porte-t-il un à-nouveau PROVISOIRE · seulement pour le dire dans un message. */
  private async aUnReportProvisoire(tenantId: string, exerciceId: string) {
    return (await this.prisma.ecriture.count({ where: { tenantId, exerciceId, estANouveauProvisoire: true } })) > 0;
  }

  /**
   * LES EXERCICES DONT LES ÉCRITURES FONT LE SOLDE (relecture adverse, M2) ·
   * l'exercice lui-même, et, tant qu'il n'a pas d'à-nouveau QUI FAIT FOI,
   * l'exercice qui le précède, récursivement · le report RECONSTITUÉ de la
   * clôture précédente, brouillard compris, et DIT provisoire. Sans lui, une
   * créance de N-1 lue dans N sans à-nouveau valait zéro, et le rapprochement
   * fabriquait un écart qui n'existe pas (§ 10 bis, cinquième défaut).
   * L'à-nouveau PROVISOIRE n'arrête pas la chaîne (B1) · et `solde` ne le lit
   * jamais, sans quoi le report serait compté deux fois.
   */
  private async chaine(tenantId: string, ex: { id: string; dateDebut: Date }) {
    const ids = [ex.id];
    let provisoire = false;
    let courant = ex;
    for (let k = 0; k < 20; k++) {
      if (await this.aUnANouveau(tenantId, courant.id)) break;
      const precedent = await this.prisma.exercice.findFirst({
        where: { tenantId, dateFin: { lt: courant.dateDebut } },
        orderBy: { dateFin: 'desc' },
        select: { id: true, dateDebut: true },
      });
      if (!precedent) break;
      ids.push(precedent.id);
      provisoire = true;
      courant = precedent;
    }
    return { ids, provisoire };
  }

  /**
   * Solde (débit moins crédit) sur la chaîne d'exercices, jusqu'à une date
   * comprise, brouillard compris, à-nouveau PROVISOIRE exclu (B1).
   */
  private async solde(tenantId: string, compte: Prisma.CompteWhereInput, ids: string[], au: Date) {
    const s = await this.prisma.ligneEcriture.aggregate({
      where: {
        compte: { tenantId, ...compte },
        ecriture: { tenantId, exerciceId: { in: ids }, date: { lte: au }, ...HORS_REPORT_PROVISOIRE },
      },
      _sum: { debit: true, credit: true },
    });
    return centimes(n(s._sum.debit) - n(s._sum.credit));
  }

  private async creance(tenantId: string, id: string): Promise<Creance> {
    const c = await this.prisma.creanceDouteuse.findFirst({ where: { id, tenantId }, include: INCLURE_CREANCE });
    if (!c) throw new NotFoundException('Créance douteuse introuvable pour ce dossier.');
    // Un reclassement ANNULÉ (m2) n'admet plus aucun geste · il ne porte plus rien au 416.
    if (c.annuleeLe) throw new BadRequestException(`Le reclassement de cette créance est annulé, le ${jour(c.annuleeLe)}.`);
    return c;
  }

  private enPlace(c: Creance, avant: Date) {
    return enPlaceAvant(
      { declareeOuverture: c.declareeOuverture, depreciationOuverture: n(c.depreciationOuverture), dateReclassement: c.dateReclassement },
      c.ajustements.map((a) => ({ exerciceDateFin: a.exercice.dateFin, ecart: n(a.ecart) })),
      avant,
    );
  }

  private reste(c: Creance, au: Date) {
    return resteDeLaCreance(n(c.montant), c.mouvements.map((m) => ({ date: m.date, montant: n(m.montant) })), au);
  }

  /** B-α · ce qui reste après TOUS les mouvements non annulés, quelle que soit leur date. */
  private resteFinal(c: Creance) {
    return resteFinalDeLaCreance(n(c.montant), c.mouvements.map((m) => ({ montant: n(m.montant) })));
  }

  /**
   * LE SOLDE RECONSTITUÉ SE DIT, avec son issue (relecture adverse, M2 ; A7
   * ter, B1 et mineur 3). Le module ne lit JAMAIS le report à-nouveau
   * provisoire (`HORS_REPORT_PROVISOIRE`) · le relancer ne change rien à ce
   * solde, et le message ne le propose plus. Les deux seules issues · clôturer
   * l'exercice précédent (son report fait foi) ou passer un bilan d'ouverture.
   */
  private async motifSoldeReconstitue(tenantId: string, exerciceId: string, suite: string) {
    if (await this.aUnReportProvisoire(tenantId, exerciceId)) {
      return (
        " Ce solde est reconstitué depuis l'exercice précédent, brouillard compris · l'à-nouveau de cet exercice n'est qu'un " +
        "report PROVISOIRE, que ce module ne lit jamais. Clôturez l'exercice précédent ou passez un bilan d'ouverture, " +
        `vérifiez le montant, puis ${suite}.`
      );
    }
    return (
      " Ce solde est le report RECONSTITUÉ de l'exercice précédent, l'à-nouveau de cet exercice n'étant pas encore passé · " +
      `clôturez l'exercice précédent ou passez un bilan d'ouverture, puis ${suite}.`
    );
  }

  /**
   * B-α · LE SOLDE DU CLIENT AU PLUS TARD ENREGISTRÉ, brouillard compris · le
   * plus petit de son solde sur la chaîne de l'exercice du reclassement, toutes
   * dates (un règlement daté APRÈS le reclassement antidaté), et sur la chaîne
   * de l'exercice le plus récent du dossier (N+1 déjà ouvert).
   */
  private async soldeAuPlusTard(tenantId: string, compteId: string, ex: { id: string; dateDebut: Date; dateFin: Date }, ids: string[]) {
    const fin = new Date('9999-12-31');
    let plusPetit = await this.solde(tenantId, { id: compteId }, ids, fin);
    // M7 · TOUS les exercices qui finissent au plus tôt avec celui du
    // reclassement, chacun sur sa chaîne · un règlement d'un exercice
    // intermédiaire ne se perd pas derrière un à-nouveau du dernier.
    const suivants = await this.prisma.exercice.findMany({
      where: { tenantId, dateFin: { gte: ex.dateFin }, id: { not: ex.id } },
      orderBy: { dateFin: 'asc' },
      select: { id: true, dateDebut: true },
      take: 20,
    });
    for (const suivant of suivants) {
      const chaineSuivant = await this.chaine(tenantId, suivant);
      plusPetit = Math.min(plusPetit, await this.solde(tenantId, { id: compteId }, chaineSuivant.ids, fin));
    }
    return plusPetit;
  }

  /**
   * m5 · LE 491 SE CHOISIT sous la racine de la nature (4911 ou 4912) · absent,
   * le premier compte de détail de cette racine.
   */
  private async compte491Choisi(tenantId: string, nature: NatureCreanceDouteuse, choisi: string | undefined) {
    if (!choisi) return this.compteDetail(tenantId, compte491(nature));
    const k = await this.compteParId(tenantId, choisi);
    const refus = motifRefus491(nature, k.numero, k.typeCompte === TypeCompteDetailTotal.DETAIL);
    if (refus) throw new BadRequestException(refus);
    return k;
  }

  /**
   * LES COMPTES DU FORMULAIRE · les créances clients à solde débiteur à la fin
   * de l'exercice (lues sur la balance, report reconstitué compris), et les
   * comptes de détail du 416 que le texte prescrit. Aucune liste de choix
   * filtrée par la rétention · voir `listes-de-comptes.ts`, régime « texte ».
   */
  async comptes(tenantId: string, exerciceId: string, numero?: string) {
    // M4 · L'ISSUE D'UNE LISTE TRONQUÉE · au-delà du plafond, le cabinet tape
    // le début du numéro du compte du client et la liste se restreint ; un
    // filtre illisible est refusé, jamais ignoré (il rendrait la liste
    // tronquée en la disant filtrée).
    const filtre = (numero ?? '').trim();
    if (filtre && !/^\d{1,13}$/.test(filtre)) {
      throw new BadRequestException('Le début de numéro se tape en chiffres (de 1 à 13).');
    }
    const [{ referentiel, methodeCotisations }, ex] = await Promise.all([this.regime(tenantId), this.exercice(tenantId, exerciceId)]);
    const { ids, provisoire } = await this.chaine(tenantId, ex);
    const racines = RACINES_CREANCE_SOURCE[referentiel];
    const groupes = await this.prisma.ligneEcriture.groupBy({
      by: ['compteId'],
      where: {
        // B1 · la chaîne lit déjà l'exercice que l'à-nouveau provisoire recopie.
        ecriture: { tenantId, exerciceId: { in: ids }, ...HORS_REPORT_PROVISOIRE },
        compte: {
          tenantId,
          typeCompte: TypeCompteDetailTotal.DETAIL,
          OR: racines.map((r) => ({ numero: { startsWith: r } })),
          ...(filtre ? { AND: [{ numero: { startsWith: filtre } }] } : {}),
        },
      },
      _sum: { debit: true, credit: true },
      orderBy: { compteId: 'asc' },
      take: PLAFOND_COMPTES_CANDIDATS + 1,
    });
    const debiteurs = groupes
      .map((g) => ({ compteId: g.compteId, solde: centimes(n(g._sum?.debit) - n(g._sum?.credit)) }))
      .filter((g) => g.solde > 0.005);
    const ou416 = { tenantId, numero: { startsWith: COMPTES_CREANCES_DOUTEUSES.creances416 }, typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true };
    // m5 · les 491 de détail, que l'écran filtre par la racine de la nature.
    const ou491 = { tenantId, numero: { startsWith: '491' }, typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true };
    const [comptesCreances, comptes416, comptes491, total416, total491] = await Promise.all([
      this.prisma.compte.findMany({
        where: { tenantId, id: { in: debiteurs.map((d) => d.compteId) } },
        select: { id: true, numero: true, intitule: true, tiersCompte: { select: { tiers: { select: { nom: true } } } } },
        orderBy: { numero: 'asc' },
        take: PLAFOND_COMPTES_CANDIDATS,
      }),
      this.prisma.compte.findMany({ where: { ...ou416, tenantId }, select: { id: true, numero: true, intitule: true }, orderBy: { numero: 'asc' }, take: PLAFOND_COMPTES_416_491 }),
      this.prisma.compte.findMany({ where: { ...ou491, tenantId }, select: { id: true, numero: true, intitule: true }, orderBy: { numero: 'asc' }, take: PLAFOND_COMPTES_416_491 }),
      // m5 · une liste bornée dit son total (§ 8 bis), jamais une coupe muette.
      this.prisma.compte.count({ where: { ...ou416, tenantId } }),
      this.prisma.compte.count({ where: { ...ou491, tenantId } }),
    ]);
    const soldes = new Map(debiteurs.map((d) => [d.compteId, d.solde]));
    return {
      referentiel,
      soldesProvisoires: provisoire,
      creances: comptesCreances.map((c) => ({
        id: c.id,
        numero: c.numero,
        intitule: c.intitule,
        tiers: c.tiersCompte?.tiers.nom ?? null,
        solde: soldes.get(c.id) ?? 0,
        propose416: {
          LITIGIEUSE: compte416Propose(referentiel, NatureCreanceDouteuse.LITIGIEUSE, c.numero),
          DOUTEUSE: compte416Propose(referentiel, NatureCreanceDouteuse.DOUTEUSE, c.numero),
        },
        // m9 · servis, jamais recalculés à l'écran · le refus que le geste
        // opposera (cotisations à l'encaissement), ou l'avertissement.
        refusCotisations: motifRefusCotisationsEncaissement(referentiel, c.numero, methodeCotisations ?? null),
        avertissementCotisations: avertissementMethodeCotisations(referentiel, c.numero, methodeCotisations ?? null),
      })),
      tronque: groupes.length > PLAFOND_COMPTES_CANDIDATS,
      plafond: PLAFOND_COMPTES_CANDIDATS,
      filtreNumero: filtre || null,
      comptes416,
      comptes491,
      listes416491: {
        plafond: PLAFOND_COMPTES_416_491,
        total416,
        tronque416: total416 > comptes416.length,
        total491,
        tronque491: total491 > comptes491.length,
      },
    };
  }

  /**
   * LA LISTE DE L'EXERCICE · chaque créance reclassée ou déclarée au plus
   * tard à sa clôture, avec le reste au 416, la dépréciation en place à
   * l'ouverture et à la clôture, sa revue, ses mouvements, si une revue est À
   * FAIRE (elle changerait quelque chose), et si elle se RETIRE (m6, servi).
   * Le rapprochement confronte les totaux du module aux soldes du 416 et du
   * 491, lus sur le report reconstitué tant que l'à-nouveau qui fait foi
   * manque, et le dit.
   */
  async lister(tenantId: string, exerciceId: string) {
    const ex = await this.exercice(tenantId, exerciceId);
    const [total, lignes, regime, annulees, mouvementsAnnules, totalRevuesAnnulees, totalMouvementsAnnules] = await Promise.all([
      this.prisma.creanceDouteuse.count({ where: { tenantId, dateReclassement: { lte: ex.dateFin }, annuleeLe: null } }),
      // m3 · LES PLUS RÉCENTES D'ABORD · une tranche bornée n'écarte jamais
      // une créance de l'exercice ; au-delà du plafond, ce sont les plus
      // anciennes qui ne sont pas montrées, et `tronque` et `total` le disent.
      this.prisma.creanceDouteuse.findMany({
        where: { tenantId, dateReclassement: { lte: ex.dateFin }, annuleeLe: null },
        include: INCLURE_LISTE,
        orderBy: [{ dateReclassement: 'desc' }, { id: 'desc' }],
        take: PLAFOND_CREANCES_LISTEES,
      }),
      this.regime(tenantId),
      this.prisma.ajustementCreanceDouteuse.findMany({
        where: { tenantId, exerciceId: ex.id, annuleeLe: { not: null } },
        select: { id: true, creanceId: true, annuleeLe: true, motifAnnulation: true },
        orderBy: { annuleeLe: 'desc' },
        take: PLAFOND_CREANCES_LISTEES,
      }),
      this.prisma.mouvementCreanceDouteuse.findMany({
        where: { tenantId, exerciceId: ex.id, annuleeLe: { not: null } },
        select: { id: true, creanceId: true, type: true, date: true, montant: true, annuleeLe: true, motifAnnulation: true },
        orderBy: { annuleeLe: 'desc' },
        take: PLAFOND_CREANCES_LISTEES,
      }),
      // M5 · les listes d'annulations sont bornées · leur total le dit.
      this.prisma.ajustementCreanceDouteuse.count({ where: { tenantId, exerciceId: ex.id, annuleeLe: { not: null } } }),
      this.prisma.mouvementCreanceDouteuse.count({ where: { tenantId, exerciceId: ex.id, annuleeLe: { not: null } } }),
    ]);
    const creances = lignes.map((c) => ({
      ...this.presenter(c, ex, regime.referentiel),
      retirable: estRetirable(c),
      revuesAnnulees: annulees.filter((a) => a.creanceId === c.id).map((a) => ({ id: a.id, annuleeLe: a.annuleeLe, motif: a.motifAnnulation })),
      mouvementsAnnules: mouvementsAnnules
        .filter((m) => m.creanceId === c.id)
        .map((m) => ({ id: m.id, type: m.type, date: m.date, montant: n(m.montant), annuleeLe: m.annuleeLe, motif: m.motifAnnulation })),
    }));
    return {
      exercice: { id: ex.id, dateDebut: ex.dateDebut, dateFin: ex.dateFin, statut: ex.statut },
      systemeMinimal: !!motifRefusDepreciationSmt(regime),
      total,
      tronque: total > lignes.length,
      annulations: {
        revues: { total: totalRevuesAnnulees, tronque: totalRevuesAnnulees > annulees.length },
        mouvements: { total: totalMouvementsAnnules, tronque: totalMouvementsAnnules > mouvementsAnnules.length },
      },
      creances,
      // m10 · CALCULÉ PAR AGRÉGAT, sur toutes les créances, quelle que soit la
      // tranche montrée · les créances éteintes des exercices clos gonflaient
      // le total, et le rapprochement restait `null` pour toujours.
      rapprochement: await this.rapprochementDuModule(tenantId, ex),
    };
  }

  /**
   * LE RAPPROCHEMENT DU MODULE AVEC LE 416 ET LE 491 (m10 ; M-b, m4, m8) ·
   * mêmes nombres que la somme des lignes de la liste, pris par agrégat sur
   * toutes les créances en vigueur reclassées au plus tard à la clôture ·
   *  · reste au 416 = montants reclassés ou déclarés, moins les pertes et
   *    recouvrements non annulés datés au plus tard la clôture ;
   *  · dépréciation à la clôture = dépréciations déclarées à une ouverture au
   *    plus tard celle-ci, plus les écarts des revues non annulées des
   *    exercices clos au plus tard avec celui-ci (la revue de l'exercice porte
   *    l'en-place à la dépréciation nécessaire, `enPlaceAvant`).
   * Les soldes se lisent sur les SEULS 416 et 491 des créances du module. Le
   * 491 partagé avec des dépréciations passées hors du module (m8) en dit la
   * part · lignes de la chaîne qui ne sont ni un à-nouveau, ni une revue du
   * module, ni l'inscription en négatif d'une revue · l'écart n'est plus nu.
   */
  private async rapprochementDuModule(tenantId: string, ex: { id: string; dateDebut: Date; dateFin: Date }) {
    const enVigueur = { dateReclassement: { lte: ex.dateFin }, annuleeLe: null };
    const base = { tenantId, ...enVigueur };
    const [montants, declarees, mouvements, ecarts, par416, par491, chaine] = await Promise.all([
      this.prisma.creanceDouteuse.aggregate({ where: { ...base, tenantId }, _sum: { montant: true } }),
      this.prisma.creanceDouteuse.aggregate({
        where: { ...base, tenantId, declareeOuverture: true, dateReclassement: { lte: ex.dateDebut } },
        _sum: { depreciationOuverture: true },
      }),
      this.prisma.mouvementCreanceDouteuse.aggregate({
        where: { tenantId, annuleeLe: null, date: { lte: ex.dateFin }, creance: enVigueur },
        _sum: { montant: true },
      }),
      this.prisma.ajustementCreanceDouteuse.aggregate({
        where: { tenantId, annuleeLe: null, exercice: { dateFin: { lte: ex.dateFin } }, creance: enVigueur },
        _sum: { ecart: true },
      }),
      this.prisma.creanceDouteuse.groupBy({ by: ['compte416Id'], where: { ...base, tenantId }, orderBy: { compte416Id: 'asc' } }),
      this.prisma.creanceDouteuse.groupBy({ by: ['compte491Id'], where: { ...base, tenantId }, orderBy: { compte491Id: 'asc' } }),
      this.chaine(tenantId, ex),
    ]);
    const { ids, provisoire } = chaine;
    const comptes416 = par416.map((g) => g.compte416Id);
    const comptes491 = par491.map((g) => g.compte491Id);
    const [solde416, solde491, horsModule491, reportProvisoire] = await Promise.all([
      comptes416.length > 0 ? this.solde(tenantId, { id: { in: comptes416 } }, ids, ex.dateFin) : Promise.resolve(0),
      comptes491.length > 0 ? this.solde(tenantId, { id: { in: comptes491 } }, ids, ex.dateFin) : Promise.resolve(0),
      comptes491.length > 0 ? this.horsModule491(tenantId, comptes491, ex) : Promise.resolve(0),
      // B1 · l'écran dit pourquoi les soldes sont provisoires · à-nouveau
      // absent, ou report provisoire, que le module ne lit jamais.
      provisoire ? this.aUnReportProvisoire(tenantId, ex.id) : Promise.resolve(false),
    ]);
    return {
      // Lu sur le report reconstitué de l'exercice précédent tant que
      // l'à-nouveau qui fait foi n'est pas passé · provisoire, et l'écran le
      // dit (B1 · un report provisoire n'en tient pas lieu).
      provisoire,
      reportProvisoire,
      solde416,
      resteModule: centimes(n(montants._sum.montant) - n(mouvements._sum.montant)),
      // Le 491 est créditeur · rendu en positif pour se comparer.
      solde491: centimes(-solde491),
      depreciationModule: centimes(n(declarees._sum.depreciationOuverture) + n(ecarts._sum.ecart)),
      // m8 · la part du 491 passée HORS du module dans la chaîne, en positif.
      horsModule491,
    };
  }

  /**
   * m8 · LES DÉPRÉCIATIONS PASSÉES HORS DU MODULE sur ses 491 · les lignes DE
   * L'EXERCICE jusqu'à sa clôture qui ne sont ni un à-nouveau (il porte des
   * soldes, module et hors module mêlés), ni l'écriture d'une revue du module,
   * ni l'inscription en négatif d'une telle écriture. Rendu crédit moins débit.
   *
   * A7 TER, MINEUR 5 · L'EXERCICE SEUL, jamais la chaîne. Sans à-nouveau qui
   * fait foi, les exercices précédents de la chaîne tiennent lieu d'à-nouveau ·
   * une dépréciation passée à la main en N-1 est le solde d'ouverture que la
   * déclaration couvre (`depreciationOuverture`). Lue aussi « hors module »,
   * elle comptait DEUX fois · 400 000 au 491, 400 000 déclarés, 400 000 hors
   * module, et un reste de -400 000 à l'écran. Avec un à-nouveau, elle est
   * dans l'à-nouveau, que ce calcul écarte déjà · même règle des deux côtés.
   */
  private async horsModule491(tenantId: string, comptes491: string[], ex: { id: string; dateFin: Date }) {
    const s = await this.prisma.ligneEcriture.aggregate({
      where: {
        compteId: { in: comptes491 },
        ecriture: {
          tenantId,
          exerciceId: ex.id,
          date: { lte: ex.dateFin },
          estGenereeParCloture: false,
          ...HORS_REPORT_PROVISOIRE,
          ajustementCreanceDouteuse: { is: null },
          NOT: { corrigeEcriture: { is: { ajustementCreanceDouteuse: { isNot: null } } } },
        },
      },
      _sum: { debit: true, credit: true },
    });
    return centimes(n(s._sum.credit) - n(s._sum.debit));
  }

  private presenter(c: Creance, ex: { id: string; dateDebut: Date; dateFin: Date }, referentiel: Referentiel) {
    const enPlaceOuverture = this.enPlace(c, ex.dateDebut);
    const reste = this.reste(c, ex.dateFin);
    const revue = c.ajustements.find((a) => a.exerciceId === ex.id) ?? null;
    return {
      id: c.id,
      nature: c.nature,
      compteCreance: { id: c.compteCreance.id, numero: c.compteCreance.numero, intitule: c.compteCreance.intitule },
      tiers: c.compteCreance.tiersCompte?.tiers.nom ?? null,
      compte416: c.compte416,
      compte491: c.compte491,
      dateReclassement: c.dateReclassement,
      declareeOuverture: c.declareeOuverture,
      sourceDeclaration: c.sourceDeclaration,
      montant: n(c.montant),
      motif: c.motif,
      pieces: c.pieces,
      ecritureReclassementId: c.ecritureReclassementId,
      resteALaCloture: reste,
      depreciationOuverture: enPlaceOuverture,
      depreciationALaCloture: centimes(revue ? n(revue.depreciationNecessaire) : enPlaceOuverture),
      revueAFaire: revueAFaire({ revueDeLExercice: !!revue, enPlace: enPlaceOuverture, reste, aucuneRevue: c.ajustements.length === 0 }),
      // M-c · une INFORMATION, jamais un refus.
      mouvementsSansRevue: mouvementsSansRevue({
        revueDeLExercice: !!revue,
        mouvementsDeLExercice: c.mouvements.filter((m) => m.date >= ex.dateDebut && m.date <= ex.dateFin).length,
      }),
      comptePertePropose: comptePertePropose(referentiel, c.compteCreance.numero),
      revue: revue
        ? {
            id: revue.id,
            date: revue.date,
            depreciationNecessaire: n(revue.depreciationNecessaire),
            depreciationEnPlace: n(revue.depreciationEnPlace),
            ecart: n(revue.ecart),
            motif: revue.motif,
            pieces: revue.pieces,
            ecritureId: revue.ecritureId,
          }
        : null,
      revues: c.ajustements.map((a) => ({
        id: a.id,
        exerciceId: a.exerciceId,
        date: a.date,
        depreciationNecessaire: n(a.depreciationNecessaire),
        ecart: n(a.ecart),
        motif: a.motif,
        ecritureId: a.ecritureId,
      })),
      mouvements: c.mouvements.map((m) => ({
        id: m.id,
        type: m.type,
        date: m.date,
        montant: n(m.montant),
        motif: m.motif,
        pieces: m.pieces,
        ecritureId: m.ecritureId,
      })),
    };
  }

  private pieces(p: PieceJustificativeDto[] | undefined) {
    return piecesLisibles(p ?? []);
  }

  /** Fiche du compte 41 · D 416 / C compte du client, à la date choisie. */
  reclasser(tenantId: string, userId: string, dto: ReclasserCreanceDto) {
    return this.sousVerrou(tenantId, 'RECLASSEMENT', () => this.reclasserSousVerrou(tenantId, userId, dto));
  }

  private async reclasserSousVerrou(tenantId: string, userId: string, dto: ReclasserCreanceDto) {
    const [{ referentiel, methodeCotisations }, ex, journal, source] = await Promise.all([
      this.regime(tenantId),
      this.exercice(tenantId, dto.exerciceId),
      this.journal(tenantId, dto.journalId),
      this.compteParId(tenantId, dto.compteCreanceId),
    ]);
    const date = new Date(dto.date.slice(0, 10));
    const propose = compte416Propose(referentiel, dto.nature, source.numero);
    if (!dto.compte416Id && !propose) {
      throw new BadRequestException(
        `Le compte ${source.numero} ne dit pas si le débiteur est un adhérent (4161) ou un client-usager (4162) · choisissez le 416.`,
      );
    }
    const c416 = dto.compte416Id ? await this.compteParId(tenantId, dto.compte416Id) : await this.compteDetail(tenantId, propose!);
    const pieces = this.pieces(dto.pieces);
    const { ids, provisoire } = await this.chaine(tenantId, ex);
    const [soldeDebiteur, soldeDernier, enDevise, c491] = await Promise.all([
      this.solde(tenantId, { id: source.id }, ids, date),
      this.soldeAuPlusTard(tenantId, source.id, ex, ids),
      this.positionEnDeviseOuverte(tenantId, [source.id], ids, null),
      this.compte491Choisi(tenantId, dto.nature, dto.compte491Id),
    ]);
    let motif = motifRefusReclassement({
      referentiel,
      nature: dto.nature,
      numeroSource: source.numero,
      sourceEstDetail: source.typeCompte === TypeCompteDetailTotal.DETAIL,
      numero416: c416.numero,
      numero416EstDetail: c416.typeCompte === TypeCompteDetailTotal.DETAIL,
      montant: dto.montant,
      soldeDebiteur,
      soldeDernier,
      positionEnDevise: enDevise,
      motif: dto.motif,
      pieces,
      exerciceOuvert: ex.statut === StatutExercice.OUVERT,
      dateDansExercice: date >= ex.dateDebut && date <= ex.dateFin,
      journalGeneral: journal.type === TypeJournal.GENERAL,
      // m9 · SYCEBNL, cadre conceptuel § 5.4.2.1.
      methodeCotisations: methodeCotisations ?? null,
    });
    // Le solde lu sans à-nouveau qui fait foi est le report reconstitué · le
    // refus le dit, avec l'issue (relecture adverse, M2 ; A7 ter, B1).
    if (motif && provisoire && motif.includes('dépasse ce que le client doit')) {
      motif += await this.motifSoldeReconstitue(tenantId, ex.id, 'reprenez le reclassement');
    }
    if (motif) throw new BadRequestException(motif);

    const nature = dto.nature === NatureCreanceDouteuse.LITIGIEUSE ? 'litigieuse' : 'douteuse';
    // LE RECLASSEMENT NE LETTRE PAS LE COMPTE DU CLIENT, et n'exige aucun
    // lettrage. Lettré avec la facture, il serait lu par le moteur de la TVA
    // comme un ENCAISSEMENT (décret n° 011/42, art. 57) · la TVA d'une
    // prestation de services deviendrait exigible au reclassement (O.-L.
    // n° 10/001, art. 25, 2°), sans qu'aucun prix ne soit perçu. Le cabinet ne
    // lettre pas la facture avec cette pièce ; la ligne A7 bis du plan garde le
    // chantier de la TVA des créances douteuses.
    const ecriture = await this.ecritures.creer(tenantId, userId, {
      exerciceId: ex.id,
      journalId: journal.id,
      date: jour(date),
      libelle: `Créance ${nature} reclassée · ${source.numero} ${source.intitule}`.slice(0, 190),
      lignes: [
        { compteId: c416.id, debit: centimes(dto.montant), credit: 0 },
        { compteId: source.id, debit: 0, credit: centimes(dto.montant) },
      ],
    });
    try {
      const ligne = await transactionJournalisee(this.prisma, (tx) =>
        tx.creanceDouteuse.create({
          data: {
            tenantId,
            exerciceId: ex.id,
            nature: dto.nature,
            compteCreanceId: source.id,
            compte416Id: c416.id,
            compte491Id: c491.id,
            dateReclassement: date,
            montant: centimes(dto.montant),
            motif: dto.motif.trim(),
            pieces: pieces as unknown as Prisma.InputJsonValue,
            ecritureReclassementId: ecriture.id,
            createdBy: userId,
          },
        }),
      );
      // m9 · méthode des cotisations non déclarée · un avertissement, jamais un refus.
      return { ...ligne, montant: n(ligne.montant), avertissement: avertissementMethodeCotisations(referentiel, source.numero, methodeCotisations ?? null) };
    } catch (err) {
      // Une ligne refusée ne laisse pas son écriture au journal.
      await this.compenser(tenantId, ecriture.id);
      throw err;
    }
  }

  /**
   * DOSSIER REPRIS (relecture adverse, M3) · la créance déjà au 416 et sa
   * dépréciation déjà au 491 avant OmegaX, DÉCLARÉES au premier jour de
   * l'exercice choisi, sans écriture, source exigée, bornées par l'à-nouveau
   * du 416 et du 491. Elle entre ensuite dans les revues comme une autre.
   */
  declarer(tenantId: string, userId: string, dto: DeclarerCreanceOuvertureDto) {
    return this.sousVerrou(tenantId, 'DECLARATION', () => this.declarerSousVerrou(tenantId, userId, dto));
  }

  private async declarerSousVerrou(tenantId: string, userId: string, dto: DeclarerCreanceOuvertureDto) {
    const [{ referentiel, methodeCotisations }, ex, source, c416] = await Promise.all([
      this.regime(tenantId),
      this.exercice(tenantId, dto.exerciceId),
      this.compteParId(tenantId, dto.compteCreanceId),
      this.compteParId(tenantId, dto.compte416Id),
    ]);
    const c491 = await this.compte491Choisi(tenantId, dto.nature, dto.compte491Id);
    const date = ex.dateDebut;
    const { ids } = await this.chaine(tenantId, ex);
    const [ouverture, dejaPorte, enDevise] = await Promise.all([
      this.soldesALOuverture(tenantId, ex, c416.id, c491.id),
      this.dejaPorteALOuverture(tenantId, ex.dateDebut, c416.id, c491.id),
      // m4 · une créance en devise non réglée, sur le compte du client ou le
      // 416, à l'ouverture (à-nouveau, ou report reconstitué), ne se déclare pas.
      this.positionEnDeviseOuverte(tenantId, [source.id, c416.id], ids, ex.dateDebut),
    ]);
    let motif = motifRefusDeclaration({
      referentiel,
      nature: dto.nature,
      numeroSource: source.numero,
      numero416: c416.numero,
      numero416EstDetail: c416.typeCompte === TypeCompteDetailTotal.DETAIL,
      montant: dto.montant,
      depreciation: dto.depreciationOuverture,
      source: dto.source,
      dateDebutExercice: true,
      exerciceOuvert: ex.statut === StatutExercice.OUVERT,
      aNouveau: ouverture.existe,
      aNouveau416: ouverture.solde416,
      dejaDeclare416: dejaPorte.sur416,
      aNouveau491: ouverture.solde491,
      dejaDeclare491: dejaPorte.sur491,
      sourceEstDetail: source.typeCompte === TypeCompteDetailTotal.DETAIL,
      comptesEnSommeil: [source, c416, c491].filter((k) => 'estActif' in k && k.estActif === false).map((k) => k.numero),
      positionEnDevise: enDevise,
      methodeCotisations: methodeCotisations ?? null,
    });
    // B1 · une borne lue sur le report reconstitué se dit, avec son issue.
    if (motif && ouverture.reconstitue && motif.includes('dépasse')) {
      motif += await this.motifSoldeReconstitue(tenantId, ex.id, 'reprenez la déclaration');
    }
    if (motif) throw new BadRequestException(motif);
    const ligne = await transactionJournalisee(this.prisma, (tx) =>
      tx.creanceDouteuse.create({
        data: {
          tenantId,
          exerciceId: ex.id,
          nature: dto.nature,
          compteCreanceId: source.id,
          compte416Id: c416.id,
          compte491Id: c491.id,
          dateReclassement: date,
          montant: centimes(dto.montant),
          motif: (dto.motif ?? '').trim() || `Déclarée à l'ouverture · ${dto.source.trim()}`,
          pieces: this.pieces(dto.pieces) as unknown as Prisma.InputJsonValue,
          declareeOuverture: true,
          sourceDeclaration: dto.source.trim(),
          depreciationOuverture: centimes(dto.depreciationOuverture),
          createdBy: userId,
        },
      }),
    );
    // Mineur 4 · la borne lue sur le report reconstitué se SERT et se dit ·
    // jamais présentée comme sûre.
    return {
      ...ligne,
      montant: n(ligne.montant),
      depreciationOuverture: n(ligne.depreciationOuverture),
      borneProvisoire: ouverture.reconstitue,
      ...(ouverture.reconstitue ? { information: INFORMATION_BORNE_RECONSTITUEE } : {}),
    };
  }

  /**
   * A7 TER, MINEUR 2 · LA POSITION NETTE EN DEVISE, par compte et par devise,
   * sur la chaîne (`chaine`), à-nouveau provisoire exclu · somme des montants
   * en devise des lignes au débit, et des lignes inscrites en négatif au
   * crédit, moins celle des lignes au crédit, et des négatifs au débit (le
   * montant en devise se garde SANS SIGNE, le sens de la ligne le donne,
   * `lignesEnNegatif`). Une facture en dollars de N réglée en N+1 sur sa
   * ligne d'à-nouveau provisoire laisse en N une ligne non lettrée et une
   * position NULLE · la simple présence d'une ligne non lettrée refusait à
   * tort le reclassement d'une créance en francs. `true` dès qu'une devise
   * d'un compte n'est pas soldée au centime.
   */
  private async positionEnDeviseOuverte(tenantId: string, comptes: string[], ids: string[], au: Date | null): Promise<boolean> {
    const date = au ? { date: { lte: au } } : {};
    const [debits, credits] = await Promise.all([
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId', 'deviseId'],
        where: {
          compteId: { in: comptes },
          deviseId: { not: null },
          OR: [{ debit: { gt: 0 } }, { credit: { lt: 0 } }],
          ecriture: { tenantId, exerciceId: { in: ids }, ...date, ...HORS_REPORT_PROVISOIRE },
        },
        _sum: { montantDevise: true },
      }),
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId', 'deviseId'],
        where: {
          compteId: { in: comptes },
          deviseId: { not: null },
          OR: [{ credit: { gt: 0 } }, { debit: { lt: 0 } }],
          ecriture: { tenantId, exerciceId: { in: ids }, ...date, ...HORS_REPORT_PROVISOIRE },
        },
        _sum: { montantDevise: true },
      }),
    ]);
    const net = new Map<string, number>();
    for (const g of debits) net.set(`${g.compteId}|${g.deviseId}`, (net.get(`${g.compteId}|${g.deviseId}`) ?? 0) + n(g._sum.montantDevise));
    for (const g of credits) net.set(`${g.compteId}|${g.deviseId}`, (net.get(`${g.compteId}|${g.deviseId}`) ?? 0) - n(g._sum.montantDevise));
    return [...net.values()].some((v) => Math.abs(v) >= 0.005);
  }

  /**
   * LA BORNE DE LA DÉCLARATION D'OUVERTURE (relecture adverse, M3 ; A7 ter,
   * B1) · l'à-nouveau QUI FAIT FOI du 416 (débit net) et du 491 (crédit net).
   * Sans lui, le report RECONSTITUÉ de la clôture précédente, brouillard
   * compris, à la veille de l'ouverture · comme toute lecture du module
   * (M2), et jamais l'à-nouveau PROVISOIRE, calculé sur le seul livre-journal
   * · il ignorait le brouillard de l'exercice précédent, et une créance
   * passée au 416 au brouillard se déclarait refusée, ou une sortie au
   * brouillard laissait déclarer ce qui n'y était plus. Sans à-nouveau ni
   * exercice précédent, aucune borne · la déclaration est refusée.
   */
  private async soldesALOuverture(tenantId: string, ex: { id: string; dateDebut: Date }, compte416Id: string, compte491Id: string) {
    if (await this.aUnANouveau(tenantId, ex.id)) {
      const aNouveau = { tenantId, exerciceId: ex.id, ...A_NOUVEAU };
      const [an416, an491] = await Promise.all([
        this.prisma.ligneEcriture.aggregate({ where: { compteId: compte416Id, ecriture: aNouveau }, _sum: { debit: true, credit: true } }),
        this.prisma.ligneEcriture.aggregate({ where: { compteId: compte491Id, ecriture: aNouveau }, _sum: { debit: true, credit: true } }),
      ]);
      return {
        existe: true,
        reconstitue: false,
        solde416: centimes(n(an416._sum.debit) - n(an416._sum.credit)),
        solde491: centimes(n(an491._sum.credit) - n(an491._sum.debit)),
      };
    }
    const precedent = await this.prisma.exercice.findFirst({
      where: { tenantId, dateFin: { lt: ex.dateDebut } },
      orderBy: { dateFin: 'desc' },
      select: { id: true, dateDebut: true },
    });
    if (!precedent) return { existe: false, reconstitue: false, solde416: 0, solde491: 0 };
    const { ids } = await this.chaine(tenantId, precedent);
    const veille = new Date(ex.dateDebut.getTime() - 24 * 60 * 60 * 1000);
    const [s416, s491] = await Promise.all([
      this.solde(tenantId, { id: compte416Id }, ids, veille),
      this.solde(tenantId, { id: compte491Id }, ids, veille),
    ]);
    // Le 491 est créditeur · rendu en positif, comme l'à-nouveau.
    return { existe: true, reconstitue: true, solde416: s416, solde491: centimes(-s491) };
  }

  /**
   * CE QUE LE MODULE PORTE DÉJÀ À L'OUVERTURE sur un 416 et un 491 (seconde
   * relecture, M-a) · le RESTE à la veille de chaque créance reclassée avant
   * l'exercice et non sortie, et chaque créance déjà DÉCLARÉE à cette
   * ouverture ; leur dépréciation en place au premier jour. Sans ce reste,
   * une créance reclassée en N-1 et encore au 416 laissait déclarer une
   * seconde fois le même montant, sous la borne de l'à-nouveau.
   */
  private async dejaPorteALOuverture(tenantId: string, ouverture: Date, compte416Id: string, compte491Id: string) {
    const veille = new Date(ouverture.getTime() - 24 * 60 * 60 * 1000);
    let sur416 = 0;
    let sur491 = 0;
    await lireParLots(
      (curseur) =>
        this.prisma.creanceDouteuse.findMany({
          // m1 · les créances DÉCLARÉES à une ouverture au plus tard celle-ci,
          // et les créances RECLASSÉES AVANT l'ouverture · un reclassement daté
          // du premier jour se passe DANS l'exercice, il n'est pas dans
          // l'à-nouveau qui borne la déclaration.
          where: {
            tenantId,
            annuleeLe: null,
            AND: [
              { OR: [{ compte416Id }, { compte491Id }] },
              {
                OR: [
                  { declareeOuverture: true, dateReclassement: { lte: ouverture } },
                  { declareeOuverture: false, dateReclassement: { lt: ouverture } },
                ],
              },
            ],
          },
          include: INCLURE_CREANCE,
          ...pageApres(curseur, LOT_ECRITURES),
        }),
      (c) => {
        const aLOuverture = c.declareeOuverture && c.dateReclassement.getTime() === ouverture.getTime();
        if (c.compte416Id === compte416Id) {
          sur416 += aLOuverture ? n(c.montant) : this.reste(c, veille);
        }
        if (c.compte491Id === compte491Id) sur491 += this.enPlace(c, ouverture);
      },
      LOT_ECRITURES,
    );
    return { sur416: centimes(sur416), sur491: centimes(sur491) };
  }

  /**
   * L'ÉTAT DE LA REVUE pour un exercice · la dépréciation en place, le reste
   * de la créance à la clôture, et ce qui refuserait la revue. Rien n'est
   * écrit ; le geste rejoue ce calcul.
   */
  private async entreeRevue(tenantId: string, id: string, exerciceId: string) {
    const [c, ex, regime] = await Promise.all([this.creance(tenantId, id), this.exercice(tenantId, exerciceId), this.regime(tenantId)]);
    const enPlace = this.enPlace(c, ex.dateDebut);
    const reste = this.reste(c, ex.dateFin);
    // B-α · un reste négatif (mouvement antidaté passé avant la borne) se dit
    // avec son issue, au lieu d'un refus sans issue.
    const resteNegatif = motifResteNegatif(
      `${c.compteCreance.numero} ${c.compteCreance.intitule}`,
      Math.min(reste, this.resteFinal(c)),
    );
    const posterieure = c.ajustements.find((a) => a.exercice.dateDebut.getTime() > ex.dateFin.getTime()) ?? null;
    // Les exercices ouverts entre le reclassement et celui-ci, sans revue ·
    // on revoit dans l'ordre (fiche du compte 49, « à la clôture de
    // l'exercice »), comme la réévaluation des devises.
    const anterieurs = await this.prisma.exercice.findMany({
      where: { tenantId, statut: StatutExercice.OUVERT, dateFin: { gte: c.dateReclassement, lt: ex.dateDebut } },
      select: { id: true, dateDebut: true, dateFin: true },
      orderBy: { dateDebut: 'asc' },
      take: 20,
    });
    const revus = new Set(c.ajustements.map((a) => a.exerciceId));
    return {
      c,
      ex,
      enPlace,
      reste,
      resteNegatif,
      posterieure,
      anterieursSansRevue: anterieurs.filter((e) => !revus.has(e.id)).map((e) => `l'exercice clos le ${jour(e.dateFin)}`),
      refusSmt: motifRefusDepreciationSmt(regime),
    };
  }

  /**
   * Fiche du compte 49 · la dépréciation revue « à la clôture de
   * l'exercice ». Seul l'écart avec la dépréciation en place se passe ·
   * D 6594 / C 491 pour la hausse, D 491 / C 7594 pour la baisse, datée du
   * dernier jour de l'exercice. Un écart nul garde la revue sans écriture.
   */
  revoir(tenantId: string, userId: string, id: string, dto: RevoirDepreciationDto) {
    return this.sousVerrou(tenantId, 'REVUE', () => this.revoirSousVerrou(tenantId, userId, id, dto));
  }

  private async revoirSousVerrou(tenantId: string, userId: string, id: string, dto: RevoirDepreciationDto) {
    const e = await this.entreeRevue(tenantId, id, dto.exerciceId);
    const journal = await this.journal(tenantId, dto.journalId);
    const pieces = this.pieces(dto.pieces);
    if (e.c.ajustements.some((a) => a.exerciceId === e.ex.id)) {
      throw new ConflictException('La dépréciation de cette créance est déjà revue pour cet exercice · annulez la revue pour la refaire.');
    }
    const motif = motifRefusRevue({
      necessaire: dto.depreciationNecessaire,
      enPlace: e.enPlace,
      reste: e.reste,
      resteNegatif: e.resteNegatif,
      motif: dto.motif,
      pieces,
      exerciceOuvert: e.ex.statut === StatutExercice.OUVERT,
      avantReclassement: e.ex.dateFin.getTime() < e.c.dateReclassement.getTime(),
      revuePosterieure: e.posterieure ? jour(e.posterieure.date) : null,
      anterieursSansRevue: e.anterieursSansRevue,
      refusSmt: e.refusSmt,
      journalGeneral: journal.type === TypeJournal.GENERAL,
    });
    if (motif) throw new BadRequestException(motif);

    const ecart = ecartDeDepreciation(e.enPlace, dto.depreciationNecessaire);
    let ecritureId: string | null = null;
    if (Math.abs(ecart) >= 0.005) {
      const autre = await this.compteDetail(tenantId, ecart > 0 ? COMPTES_CREANCES_DOUTEUSES.dotation : COMPTES_CREANCES_DOUTEUSES.reprise);
      const montant = Math.abs(ecart);
      const ecriture = await this.ecritures.creer(tenantId, userId, {
        exerciceId: e.ex.id,
        journalId: journal.id,
        date: jour(e.ex.dateFin),
        libelle: `${ecart > 0 ? 'Dépréciation' : 'Reprise de dépréciation'} · créance ${e.c.compteCreance.numero} ${e.c.compteCreance.intitule}`.slice(0, 190),
        lignes:
          ecart > 0
            ? [
                { compteId: autre.id, debit: montant, credit: 0 },
                { compteId: e.c.compte491.id, debit: 0, credit: montant },
              ]
            : [
                { compteId: e.c.compte491.id, debit: montant, credit: 0 },
                { compteId: autre.id, debit: 0, credit: montant },
              ],
      });
      ecritureId = ecriture.id;
    }
    try {
      const ligne = await transactionJournalisee(this.prisma, (tx) =>
        tx.ajustementCreanceDouteuse.create({
          data: {
            tenantId,
            creanceId: e.c.id,
            exerciceId: e.ex.id,
            date: new Date(jour(e.ex.dateFin)),
            depreciationNecessaire: centimes(dto.depreciationNecessaire),
            depreciationEnPlace: e.enPlace,
            ecart,
            motif: dto.motif.trim(),
            pieces: pieces as unknown as Prisma.InputJsonValue,
            ecritureId,
            createdBy: userId,
          },
        }),
      );
      return { ...ligne, depreciationNecessaire: n(ligne.depreciationNecessaire), depreciationEnPlace: n(ligne.depreciationEnPlace), ecart: n(ligne.ecart) };
    } catch (err) {
      if (ecritureId) await this.compenser(tenantId, ecritureId);
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('La dépréciation de cette créance est déjà revue pour cet exercice.');
      }
      throw err;
    }
  }

  /** La proposition de revue d'un exercice · ce que le geste lirait. */
  async propositionRevue(tenantId: string, id: string, exerciceId: string) {
    const e = await this.entreeRevue(tenantId, id, exerciceId);
    return {
      depreciationEnPlace: e.enPlace,
      resteALaCloture: e.reste,
      dateRevue: jour(e.ex.dateFin),
      // Écran 12 · l'annonce de l'écriture lit les comptes que le geste
      // passera, servis ici, jamais recopiés à l'écran · le 491 de LA créance,
      // la dotation et la reprise du module (fiche du compte 49).
      comptes: {
        compte491: e.c.compte491.numero,
        dotation: COMPTES_CREANCES_DOUTEUSES.dotation,
        reprise: COMPTES_CREANCES_DOUTEUSES.reprise,
      },
      resteNegatif: e.resteNegatif,
      dejaRevue: e.c.ajustements.some((a) => a.exerciceId === e.ex.id),
      revuePosterieure: e.posterieure ? jour(e.posterieure.date) : null,
      anterieursSansRevue: e.anterieursSansRevue,
      dotationRefuseeSmt: e.refusSmt,
    };
  }

  /**
   * L'ANNULATION D'UNE REVUE (relecture adverse, B2) · AUDCIF art. 20, al. 2,
   * « exclusivement par inscription en négatif des éléments erronés ;
   * l'enregistrement exact est ensuite opéré ». Même règle que l'annulation
   * d'une réévaluation des devises (ligne A6, D6) · au brouillard, l'écriture
   * est supprimée ; validée, elle est inscrite en négatif ; une ligne lettrée
   * ou pointée refuse (`motifLignesTenues`) ; l'enregistrement est MARQUÉ
   * annulé par un `update` unitaire (journal d'audit), jamais supprimé.
   * Refus · exercice clôturé, revue postérieure non annulée.
   */
  annulerRevue(tenantId: string, userId: string, id: string, revueId: string, dto: AnnulerRevueDto) {
    return this.sousVerrou(tenantId, 'ANNULATION DE REVUE', () => this.annulerRevueSousVerrou(tenantId, userId, id, revueId, dto.motif));
  }

  private async annulerRevueSousVerrou(tenantId: string, userId: string, id: string, revueId: string, motifSaisi: string) {
    const revue = await this.prisma.ajustementCreanceDouteuse.findFirst({
      where: { id: revueId, creanceId: id, tenantId },
      include: {
        exercice: { select: { statut: true, dateFin: true } },
        ecriture: {
          select: { id: true, statut: true, numeroPiece: true, lignes: { select: { lettre: true, lettrageId: true, rapprochementId: true } } },
        },
      },
    });
    if (!revue) throw new NotFoundException('Revue introuvable pour cette créance.');
    const posterieure = await this.prisma.ajustementCreanceDouteuse.findFirst({
      where: { tenantId, creanceId: id, annuleeLe: null, date: { gt: revue.date } },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    const refus = motifRefusAnnulationRevue({
      dejaAnnulee: revue.annuleeLe ? jour(revue.annuleeLe) : null,
      exerciceClos: revue.exercice.statut === StatutExercice.CLOTURE,
      posterieureNonAnnulee: posterieure ? jour(posterieure.date) : null,
      motif: motifSaisi,
    });
    if (refus) throw new BadRequestException(refus);
    const motif = motifSaisi.trim();
    const objet = `l'écriture de la revue n° ${revue.ecriture?.numeroPiece ?? '·'}`;
    if (revue.ecriture) {
      const tenues = motifLignesTenues(revue.ecriture.lignes, objet, 'annuler', ', puis annulez la revue');
      if (tenues) throw new BadRequestException(tenues);
    }
    return transactionJournalisee(this.prisma, async (tx) => {
      const e = revue.ecriture;
      let annulation: Record<string, unknown> = { traitement: 'SANS_ECRITURE' };
      if (e) {
        // Relu dans la transaction · un lettrage posé entre-temps refuse aussi.
        const relues = await tx.ligneEcriture.findMany({
          where: { ecritureId: e.id, ecriture: { tenantId } },
          select: { lettre: true, lettrageId: true, rapprochementId: true },
        });
        const tenues = motifLignesTenues(relues, objet, 'annuler', ', puis annulez la revue');
        if (tenues) throw new BadRequestException(tenues);
        if ((await this.statutDansTx(tx, tenantId, e.id)) === StatutEcriture.BROUILLARD) {
          annulation = { traitement: 'SUPPRIMEE', ecritureId: e.id, numeroPiece: e.numeroPiece };
        } else {
          const negatif = await this.ecritures.inscrireEnNegatifPourAnnulation(tenantId, userId, e.id, motif, tx);
          annulation = { traitement: 'INSCRITE_EN_NEGATIF', ecritureId: e.id, numeroPiece: e.numeroPiece, negatifId: negatif.id, negatifNumeroPiece: negatif.numeroPiece };
        }
      }
      // Marquée AVANT la suppression du brouillard, sur une ligne encore non
      // annulée · le lien vers une écriture supprimée est effacé, l'écriture
      // inscrite en négatif reste nommée.
      try {
        await tx.ajustementCreanceDouteuse.update({
          where: { id: revue.id, tenantId, annuleeLe: null },
          data: {
            annuleeLe: new Date(),
            annuleePar: userId,
            motifAnnulation: motif,
            annulation: annulation as Prisma.InputJsonValue,
            ...(annulation.traitement === 'SUPPRIMEE' ? { ecritureId: null } : {}),
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          throw new ConflictException('Cette revue est déjà annulée.');
        }
        throw err;
      }
      if (e && annulation.traitement === 'SUPPRIMEE') {
        await this.supprimerBrouillardDansTx(tx, tenantId, e.id);
      }
      return { annulee: true, annulation };
    });
  }

  private async mouvement(
    tenantId: string,
    userId: string,
    id: string,
    type: TypeMouvementCreanceDouteuse,
    dto: PerteCreanceDto | RecouvrementCreanceDto,
  ) {
    const [c, ex, journal, { referentiel }] = await Promise.all([
      this.creance(tenantId, id),
      this.exercice(tenantId, dto.exerciceId),
      this.journal(tenantId, dto.journalId),
      this.regime(tenantId),
    ]);
    const date = new Date(dto.date.slice(0, 10));
    const pieces = this.pieces(dto.pieces);
    const reste = this.reste(c, date);
    const revueApres = c.ajustements.find((a) => a.exercice.dateFin.getTime() >= date.getTime()) ?? null;

    let comptePerte: { id: string; numero: string; estDetail: boolean } | null = null;
    if (type === TypeMouvementCreanceDouteuse.PERTE) {
      const choisi = (dto as PerteCreanceDto).comptePerteId;
      if (choisi) {
        const k = await this.compteParId(tenantId, choisi);
        comptePerte = { id: k.id, numero: k.numero, estDetail: k.typeCompte === TypeCompteDetailTotal.DETAIL };
      } else {
        const propose = comptePertePropose(referentiel, c.compteCreance.numero);
        if (propose) {
          const k = await this.compteDetail(tenantId, propose);
          comptePerte = { id: k.id, numero: k.numero, estDetail: true };
        }
      }
    }
    const journalAttendu =
      type === TypeMouvementCreanceDouteuse.RECOUVREMENT
        ? journal.type === TypeJournal.TRESORERIE && !!journal.compteTresorerieId
        : journal.type === TypeJournal.GENERAL;
    const motif = motifRefusMouvement({
      type,
      montant: dto.montant,
      reste,
      // B-α · borné aussi par ce que laissent TOUS les mouvements, quelle que soit leur date.
      resteFinal: this.resteFinal(c),
      motif: dto.motif,
      pieces,
      exerciceOuvert: ex.statut === StatutExercice.OUVERT,
      dateDansExercice: date >= ex.dateDebut && date <= ex.dateFin,
      avantReclassement: date.getTime() < c.dateReclassement.getTime(),
      revueApres: revueApres ? jour(revueApres.date) : null,
      journalAttendu,
      numeroPerte: comptePerte?.numero ?? null,
      numeroPerteEstDetail: comptePerte?.estDetail ?? false,
      // m3 · au SYCEBNL, le 651 du débiteur (fiche du compte 65).
      referentiel,
      numeroSource: c.compteCreance.numero,
    });
    if (motif) throw new BadRequestException(motif);

    const montant = centimes(dto.montant);
    // LA PERTE PASSE AU TTC ENTIER, D 651 / C 416, TOUJOURS (A7 scindée,
    // décision de Manasse du 2026-10-03) · aucune ligne 443. La TVA d'une
    // créance réellement et définitivement irrécouvrable se récupère par
    // imputation (O.-L. n° 10/001, art. 52 ; décret n° 011/42, art. 126 et 127,
    // duplicata surchargé), mais ce module ne la chiffre pas · le cabinet la
    // déclare lui-même, et la ligne A7 bis du plan en garde le chantier.
    const debit = type === TypeMouvementCreanceDouteuse.PERTE ? comptePerte!.id : journal.compteTresorerieId!;
    const lignes = [
      { compteId: debit, debit: montant, credit: 0 },
      { compteId: c.compte416.id, debit: 0, credit: montant },
    ];
    const ecriture = await this.ecritures.creer(tenantId, userId, {
      exerciceId: ex.id,
      journalId: journal.id,
      date: jour(date),
      libelle: `${type === TypeMouvementCreanceDouteuse.PERTE ? 'Perte sur créance irrécouvrable' : 'Recouvrement de créance douteuse'} · ${c.compteCreance.numero} ${c.compteCreance.intitule}`.slice(0, 190),
      lignes,
    });
    let ligne: Awaited<ReturnType<typeof this.prisma.mouvementCreanceDouteuse.create>>;
    try {
      ligne = await transactionJournalisee(this.prisma, (tx) =>
        tx.mouvementCreanceDouteuse.create({
          data: {
            tenantId,
            creanceId: c.id,
            exerciceId: ex.id,
            type,
            date,
            montant,
            motif: dto.motif.trim(),
            pieces: pieces as unknown as Prisma.InputJsonValue,
            ecritureId: ecriture.id,
            createdBy: userId,
          },
        }),
      );
    } catch (err) {
      await this.compenser(tenantId, ecriture.id);
      throw err;
    }
    // B2 · la créance éteinte se lettre au 416 · le geste a réussi, l'issue
    // du lettrage se DIT, jamais ne le défait.
    const lettrage416 = await this.lettrerSiEteinteSansEchec(tenantId, userId, c.id);
    return { ...ligne, montant: n(ligne.montant), lettrage416 };
  }

  /**
   * LA CRÉANCE ÉTEINTE SE LETTRE AU 416 (ligne A7 ter, B2) · quand ses pertes
   * et recouvrements non annulés soldent son reclassement (reste nul), ses
   * lignes 416 · le débit du reclassement, le crédit de chaque mouvement ·
   * forment un groupe soldé, posé par le service de lettrage, et le 416 ne
   * garde plus de ligne ouverte (report Détail, balance âgée, contrôle
   * d'ancienneté). Reconnues par leur LIAISON, une par écriture.
   *
   * CES ÉCRITURES N'ONT AUCUNE LIGNE 443 (règles 5 et 6 de
   * `creances-douteuses.ts`) · le lettrage du 416 n'est lu par aucun calcul de
   * TVA, à la différence du compte d'origine, dont la ligne de reclassement ne
   * se lettre jamais avec la facture (`lettrage/ligne-de-reclassement.ts`).
   *
   * `null` quand la créance n'est pas éteinte ; sinon l'issue, posée ou non,
   * avec son motif · rien n'est lettré pour une créance DÉCLARÉE à l'ouverture
   * (son montant est dans l'à-nouveau, sans ligne à elle), ni à travers deux
   * exercices (passé la clôture, la ligne du reclassement se lettre sur son
   * report à-nouveau, mode Détail, que la liaison ne désigne pas).
   */
  private async lettrerSiEteinte(
    tenantId: string,
    userId: string,
    creanceId: string,
  ): Promise<{ pose: true; code: string } | { pose: false; motif: string } | null> {
    const c = await this.creance(tenantId, creanceId);
    if (Math.abs(this.resteFinal(c)) >= 0.005) return null;
    if (!c.ecritureReclassementId) {
      return {
        pose: false,
        motif: "Créance éteinte, déclarée à l'ouverture · son montant est porté par l'à-nouveau du 416, sans ligne à elle · lettrez-la à la main.",
      };
    }
    if (c.mouvements.some((m) => !m.ecritureId)) {
      return { pose: false, motif: "Créance éteinte · un de ses mouvements n'a plus d'écriture, rien n'est lettré." };
    }
    const ecritureIds = await this.ecrituresDeLaCreance(tenantId, c);
    const lignes = await this.prisma.ligneEcriture.findMany({
      where: { ecritureId: { in: ecritureIds }, compteId: c.compte416Id, ecriture: { tenantId } },
      select: { id: true, ecritureId: true, lettrageId: true, ecriture: { select: { exerciceId: true } } },
    });
    if (lignes.length !== ecritureIds.length || new Set(lignes.map((l) => l.ecritureId)).size !== ecritureIds.length) {
      return { pose: false, motif: `Créance éteinte · ses lignes du ${c.compte416.numero} ne se retrouvent pas une par écriture, rien n'est lettré.` };
    }
    // RÉ-EXTINCTION (mineur 7) · seules les lignes ENCORE OUVERTES se lettrent ·
    // un groupe figé reste en place (B2b), et l'annulation inscrite en négatif
    // à côté de lui se lettre avec le geste qui éteint de nouveau la créance
    // (le négatif d'une perte annulée et la perte repassée). Sans groupe figé,
    // toutes les lignes, annulées et négatifs compris, soldent ensemble.
    const ouvertes = lignes.filter((l) => l.lettrageId === null);
    if (ouvertes.length === 0) return { pose: false, motif: `Créance éteinte · ses lignes du ${c.compte416.numero} sont déjà lettrées.` };
    if (new Set(ouvertes.map((l) => l.ecriture.exerciceId)).size > 1) {
      return {
        pose: false,
        motif:
          'Créance éteinte · son reclassement et ses mouvements tombent dans deux exercices. Passé la clôture, la ligne du ' +
          `reclassement se lettre sur son report à-nouveau du ${c.compte416.numero} (mode Détail) · lettrez-la à la main.`,
      };
    }
    const r = await this.lettrage.lettrerLignesDuModule(tenantId, c.compte416Id, ouvertes.map((l) => l.id), userId);
    return 'code' in r ? { pose: true, code: r.code } : { pose: false, motif: `Créance éteinte · ${r.motif}` };
  }

  /**
   * LES ÉCRITURES DE LA CRÉANCE AU 416, reconnues par leur LIAISON · le
   * reclassement, chaque mouvement dont l'écriture existe encore (annulé
   * compris · inscrit en négatif, il garde son écriture), et l'inscription en
   * négatif de chacune (`corrigeEcritureId`). Jamais par le compte ni le
   * libellé · un 416 porte aussi les autres créances du dossier.
   */
  private async ecrituresDeLaCreance(tenantId: string, c: { id: string; ecritureReclassementId: string | null }): Promise<string[]> {
    const mouvements = await this.prisma.mouvementCreanceDouteuse.findMany({
      where: { tenantId, creanceId: c.id, ecritureId: { not: null } },
      select: { ecritureId: true },
      orderBy: { date: 'asc' },
    });
    const origines = [c.ecritureReclassementId, ...mouvements.map((m) => m.ecritureId)].filter((x): x is string => !!x);
    if (origines.length === 0) return [];
    const negatifs = await this.prisma.ecriture.findMany({
      where: { tenantId, corrigeEcritureId: { in: origines } },
      select: { id: true },
    });
    return [...new Set([...origines, ...negatifs.map((e) => e.id)])];
  }

  /** Un échec inattendu du lettrage est consigné et DIT, jamais tu, et ne défait pas le geste. */
  private async lettrerSiEteinteSansEchec(tenantId: string, userId: string, creanceId: string) {
    try {
      return await this.lettrerSiEteinte(tenantId, userId, creanceId);
    } catch (err) {
      this.journalServeur.error(
        `Lettrage des lignes 416 de la créance ${creanceId} du dossier ${tenantId} non posé`,
        err instanceof Error ? err.stack : String(err),
      );
      return {
        pose: false as const,
        motif: "Créance éteinte · le lettrage de ses lignes du 416 n'a pas pu se poser · lettrez-les dans « Lettrage ».",
      };
    }
  }

  /**
   * LE GROUPE QUE LE MODULE A POSÉ sur la ligne 416 d'une écriture, s'il en
   * est un (B2) · d'origine `MODULE`, et toutes ses lignes sont des lignes 416
   * de LA créance (`ecrituresDeLaCreance`). Un groupe d'une autre origine,
   * même composé à la main des seules lignes de la créance, n'est jamais
   * défait par le module (mineur 7) · le refus ordinaire des lignes lettrées
   * joue. `figee` dit pourquoi le groupe ne se défait plus (B2b · une de ses
   * lignes est sous une clôture de période, totale ou d'exercice), `null`
   * sinon.
   */
  private async groupeDuModule(
    tenantId: string,
    c: { id: string; compte416Id: string; ecritureReclassementId: string | null },
    ecritureId: string,
  ): Promise<{ id: string; code: string; figee: string | null } | null> {
    const [ligne] = await this.prisma.ligneEcriture.findMany({
      where: { ecritureId, compteId: c.compte416Id, ecriture: { tenantId } },
      select: { lettrageId: true },
      take: 1,
    });
    if (!ligne?.lettrageId) return null;
    const groupe = await this.prisma.lettrage.findFirst({
      where: { id: ligne.lettrageId, tenantId },
      select: { id: true, code: true, origine: true },
    });
    if (!groupe || groupe.origine !== OrigineLettrage.MODULE) return null;
    const permises = new Set(await this.ecrituresDeLaCreance(tenantId, c));
    const duGroupe = await this.prisma.ligneEcriture.findMany({
      where: { lettrageId: groupe.id, ecriture: { tenantId } },
      select: { id: true, compteId: true, ecritureId: true },
    });
    if (duGroupe.length === 0 || !duGroupe.every((l) => l.compteId === c.compte416Id && permises.has(l.ecritureId))) return null;
    const figees = await lignesFigees(this.prisma, tenantId, duGroupe.map((l) => l.id));
    const premiere = [...figees.values()][0];
    return { id: groupe.id, code: groupe.code, figee: premiere ? `la ligne du ${jour(premiere.date)} est figée, ${premiere.motif}` : null };
  }

  /** Fiche du compte 65 · D 651 / C 416 pour la part irrécouvrable, au TTC entier. */
  perte(tenantId: string, userId: string, id: string, dto: PerteCreanceDto) {
    return this.sousVerrou(tenantId, 'PERTE', () => this.mouvement(tenantId, userId, id, TypeMouvementCreanceDouteuse.PERTE, dto));
  }

  /** L'encaissement d'une créance reclassée · D trésorerie du journal / C 416. */
  recouvrement(tenantId: string, userId: string, id: string, dto: RecouvrementCreanceDto) {
    return this.sousVerrou(tenantId, 'RECOUVREMENT', () => this.mouvement(tenantId, userId, id, TypeMouvementCreanceDouteuse.RECOUVREMENT, dto));
  }

  /**
   * RETIRER, AU BROUILLARD SEULEMENT, ET DANS UN EXERCICE OUVERT · l'écriture
   * part avec sa ligne, par la suppression du journal qui libère le module
   * dans la même transaction. Validée, elle ne se retire plus (AUDCIF art.
   * 22, 2°). On ne retire que le DERNIER acte · une revue ou un mouvement
   * comptés ailleurs resteraient faux. Une revue s'ANNULE (`annulerRevue`).
   */
  retirerCreance(tenantId: string, id: string) {
    return this.sousVerrou(tenantId, 'RETRAIT', async () => {
      const c = await this.creance(tenantId, id);
      const [toutes, tousMouvements] = await Promise.all([
        this.prisma.ajustementCreanceDouteuse.count({ where: { tenantId, creanceId: c.id } }),
        this.prisma.mouvementCreanceDouteuse.count({ where: { tenantId, creanceId: c.id } }),
      ]);
      const ex = await this.exercice(tenantId, c.exerciceId);
      // m6 · la règle que l'écran reçoit, servie (`retirable`) · une seule
      // écriture. L'écriture elle-même est revérifiée par la suppression.
      const refus = motifNonRetirable({
        revuesTotal: toutes,
        mouvementsTotal: tousMouvements,
        exerciceClos: ex.statut === StatutExercice.CLOTURE,
        ecriture: null,
      });
      if (refus) throw new BadRequestException(refus);
      const retirer = async (tx: Prisma.TransactionClient) => {
        await tx.creanceDouteuse.delete({ where: { id: c.id } });
      };
      if (!c.ecritureReclassementId) {
        await transactionJournalisee(this.prisma, retirer);
        return { retire: true };
      }
      await this.ecritures.supprimer(tenantId, c.ecritureReclassementId, {
        detenteur: DETENTEUR_RECLASSEMENT_CREANCE,
        liberer: retirer,
      });
      return { retire: true };
    });
  }

  /**
   * L'ANNULATION D'UN RECLASSEMENT (m2) · sur le modèle de `annulerRevue` (B2)
   * et de `annulerMouvement` (K4), AUDCIF art. 20, al. 2 · au brouillard,
   * l'écriture est supprimée ; validée, elle est inscrite en négatif ; une
   * ligne lettrée ou pointée refuse ; la créance est MARQUÉE annulée par un
   * `update` unitaire (journal d'audit), jamais supprimée. Refusée tant
   * qu'une revue ou un mouvement non annulé porte sur elle. Une créance
   * déclarée à l'ouverture, sans écriture, s'annule de même.
   */
  annulerReclassement(tenantId: string, userId: string, id: string, dto: AnnulerReclassementDto) {
    return this.sousVerrou(tenantId, 'ANNULATION DE RECLASSEMENT', () => this.annulerReclassementSousVerrou(tenantId, userId, id, dto.motif));
  }

  private async annulerReclassementSousVerrou(tenantId: string, userId: string, id: string, motifSaisi: string) {
    const c = await this.prisma.creanceDouteuse.findFirst({
      where: { id, tenantId },
      include: {
        exercice: { select: { statut: true } },
        ecritureReclassement: {
          select: { id: true, statut: true, numeroPiece: true, lignes: { select: { lettre: true, lettrageId: true, rapprochementId: true } } },
        },
      },
    });
    if (!c) throw new NotFoundException('Créance douteuse introuvable pour ce dossier.');
    const [revues, mouvements] = await Promise.all([
      this.prisma.ajustementCreanceDouteuse.count({ where: { tenantId, creanceId: c.id, annuleeLe: null } }),
      this.prisma.mouvementCreanceDouteuse.count({ where: { tenantId, creanceId: c.id, annuleeLe: null } }),
    ]);
    const refus = motifRefusAnnulationReclassement({
      dejaAnnulee: c.annuleeLe ? jour(c.annuleeLe) : null,
      exerciceClos: c.exercice.statut === StatutExercice.CLOTURE,
      revuesNonAnnulees: revues,
      mouvementsNonAnnules: mouvements,
      motif: motifSaisi,
    });
    if (refus) throw new BadRequestException(refus);
    const motif = motifSaisi.trim();
    const objet = `l'écriture du reclassement n° ${c.ecritureReclassement?.numeroPiece ?? '·'}`;
    // B2b · le groupe du module figé par une clôture reste en place, toléré ;
    // non figé, il se défait dans la transaction.
    const groupe = c.ecritureReclassement ? await this.groupeDuModule(tenantId, c, c.ecritureReclassement.id) : null;
    const maintenu = groupe?.figee ? groupe.id : null;
    if (c.ecritureReclassement) {
      if (groupe?.figee && c.ecritureReclassement.statut === StatutEcriture.BROUILLARD) {
        throw new BadRequestException(motifLettrageFigeAuBrouillard(groupe.code, groupe.figee, 'le reclassement'));
      }
      const tenues = motifLignesTenues(c.ecritureReclassement.lignes, objet, 'annuler', ', puis annulez le reclassement', groupe?.id ?? null);
      if (tenues) throw new BadRequestException(tenues);
    }
    return transactionJournalisee(this.prisma, async (tx) => {
      // Relu dans la transaction · une revue ou un mouvement passé entre-temps refuse aussi.
      const [r, m] = await Promise.all([
        tx.ajustementCreanceDouteuse.count({ where: { tenantId, creanceId: c.id, annuleeLe: null } }),
        tx.mouvementCreanceDouteuse.count({ where: { tenantId, creanceId: c.id, annuleeLe: null } }),
      ]);
      if (r > 0 || m > 0) {
        throw new BadRequestException(
          motifRefusAnnulationReclassement({ dejaAnnulee: null, exerciceClos: false, revuesNonAnnulees: r, mouvementsNonAnnules: m, motif })!,
        );
      }
      const e = c.ecritureReclassement;
      let annulation: Record<string, unknown> = { traitement: 'SANS_ECRITURE' };
      if (e) {
        if (groupe && !maintenu) await this.lettrage.defaireLettrageDuModule(tx, tenantId, groupe.id);
        const relues = await tx.ligneEcriture.findMany({
          where: { ecritureId: e.id, ecriture: { tenantId } },
          select: { lettre: true, lettrageId: true, rapprochementId: true },
        });
        const tenues = motifLignesTenues(relues, objet, 'annuler', ', puis annulez le reclassement', maintenu);
        if (tenues) throw new BadRequestException(tenues);
        if ((await this.statutDansTx(tx, tenantId, e.id)) === StatutEcriture.BROUILLARD) {
          if (groupe && maintenu) throw new BadRequestException(motifLettrageFigeAuBrouillard(groupe.code, groupe.figee!, 'le reclassement'));
          annulation = { traitement: 'SUPPRIMEE', ecritureId: e.id, numeroPiece: e.numeroPiece };
        } else {
          const negatif = await this.ecritures.inscrireEnNegatifPourAnnulation(tenantId, userId, e.id, motif, tx, { groupeTolere: maintenu });
          annulation = { traitement: 'INSCRITE_EN_NEGATIF', ecritureId: e.id, numeroPiece: e.numeroPiece, negatifId: negatif.id, negatifNumeroPiece: negatif.numeroPiece };
        }
        if (groupe) annulation = { ...annulation, ...(maintenu ? { lettrageMaintenu: groupe.id } : { lettrageDefait: groupe.id }) };
      }
      try {
        await tx.creanceDouteuse.update({
          where: { id: c.id, tenantId, annuleeLe: null },
          data: {
            annuleeLe: new Date(),
            annuleePar: userId,
            motifAnnulation: motif,
            annulation: annulation as Prisma.InputJsonValue,
            ...(annulation.traitement === 'SUPPRIMEE' ? { ecritureReclassementId: null } : {}),
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          throw new ConflictException('Ce reclassement est déjà annulé.');
        }
        throw err;
      }
      if (e && annulation.traitement === 'SUPPRIMEE') {
        await this.supprimerBrouillardDansTx(tx, tenantId, e.id);
      }
      return { annule: true, annulation, ...(groupe && maintenu ? { information: informationLettrageMaintenu(groupe.code, groupe.figee!) } : {}) };
    });
  }

  /**
   * LE RETRAIT D'UN MOUVEMENT AU BROUILLARD (m7 · réservé au comptable). Le
   * lettrage que le module a posé à l'extinction se défait DANS LA MÊME
   * transaction que la suppression (mineur 7 · deux transactions laissaient,
   * sur l'échec de la seconde, une créance éteinte sans son lettrage). Figé
   * par une clôture, il ne se défait plus · refus nommé, l'issue est de
   * valider l'écriture puis d'annuler le mouvement (B2b).
   */
  retirerMouvement(tenantId: string, userId: string, id: string, mouvementId: string) {
    return this.sousVerrou(tenantId, 'RETRAIT', async () => {
      const c = await this.creance(tenantId, id);
      const mv = c.mouvements.find((m) => m.id === mouvementId);
      if (!mv) throw new NotFoundException('Mouvement introuvable pour cette créance.');
      const revue = c.ajustements.find((a) => a.exercice.dateFin.getTime() >= mv.date.getTime());
      if (revue) {
        throw new BadRequestException(
          `La revue de la clôture du ${jour(revue.date)} a compté ce mouvement dans le reste de la créance · annulez-la d’abord.`,
        );
      }
      if (!mv.ecritureId) throw new BadRequestException('Ce mouvement n’a plus d’écriture · il est annulé.');
      const ecritureId = mv.ecritureId;
      const groupe = await this.groupeDuModule(tenantId, c, ecritureId);
      if (groupe?.figee) {
        const statut = await this.statutDansTx(this.prisma as unknown as Prisma.TransactionClient, tenantId, ecritureId);
        // Validée, la suppression refuse d'elle-même (« correction par inscription en négatif »).
        if (statut === StatutEcriture.BROUILLARD) {
          throw new BadRequestException(motifLettrageFigeAuBrouillard(groupe.code, groupe.figee, 'le mouvement'));
        }
      }
      const defaire = groupe && !groupe.figee ? groupe.id : null;
      await this.ecritures.supprimer(tenantId, ecritureId, {
        detenteur: DETENTEUR_MOUVEMENT_CREANCE,
        lettrageTolere: defaire,
        liberer: async (tx) => {
          if (defaire) await this.lettrage.defaireLettrageDuModule(tx, tenantId, defaire);
          await tx.mouvementCreanceDouteuse.delete({ where: { id: mv.id } });
        },
      });
      return { retire: true, ...(defaire ? { lettrageDefait: defaire } : {}) };
    });
  }

  /**
   * L'ANNULATION D'UNE PERTE OU D'UN RECOUVREMENT (seconde relecture, K4) ·
   * sur le modèle de `annulerRevue` (AUDCIF art. 20, al. 2) · au brouillard,
   * l'écriture est supprimée ; validée, elle est inscrite en négatif ; une
   * ligne lettrée ou pointée refuse (`motifLignesTenues`) ; le mouvement est
   * MARQUÉ annulé par un `update` unitaire (journal d'audit), jamais
   * supprimé. Refus · revue qui l'a compté et n'est pas annulée, exercice
   * clôturé. Annulé, il sort du reste de la créance, des revues, de la
   * clôture (B1) et du rapprochement ; l'enregistrement exact se repasse
   * ensuite par le geste ordinaire. Aucune régularisation de TVA · le module
   * n'en écrit aucune (ligne A7 bis).
   */
  annulerMouvement(tenantId: string, userId: string, id: string, mouvementId: string, dto: AnnulerMouvementDto) {
    return this.sousVerrou(tenantId, 'ANNULATION DE MOUVEMENT', () =>
      this.annulerMouvementSousVerrou(tenantId, userId, id, mouvementId, dto.motif),
    );
  }

  private async annulerMouvementSousVerrou(tenantId: string, userId: string, id: string, mouvementId: string, motifSaisi: string) {
    const mv = await this.prisma.mouvementCreanceDouteuse.findFirst({
      where: { id: mouvementId, creanceId: id, tenantId },
      include: {
        exercice: { select: { statut: true } },
        ecriture: {
          select: { id: true, statut: true, numeroPiece: true, lignes: { select: { lettre: true, lettrageId: true, rapprochementId: true } } },
        },
      },
    });
    if (!mv) throw new NotFoundException('Mouvement introuvable pour cette créance.');
    // B2 · le lettrage que le module a posé à l'extinction se DÉFAIT avec le
    // mouvement (dans la transaction ci-dessous) · il ne refuse pas
    // l'annulation. B2b · figé par une clôture, il RESTE EN PLACE, toléré, et
    // l'annulation s'inscrit en négatif à côté de lui.
    const creanceDuMouvement = await this.prisma.creanceDouteuse.findFirst({
      where: { id, tenantId },
      select: { id: true, compte416Id: true, ecritureReclassementId: true },
    });
    const groupe = creanceDuMouvement && mv.ecriture ? await this.groupeDuModule(tenantId, creanceDuMouvement, mv.ecriture.id) : null;
    const maintenu = groupe?.figee ? groupe.id : null;
    const revue = await this.prisma.ajustementCreanceDouteuse.findFirst({
      where: { tenantId, creanceId: id, annuleeLe: null, exercice: { dateFin: { gte: mv.date } } },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    const refus = motifRefusAnnulationMouvement({
      dejaAnnule: mv.annuleeLe ? jour(mv.annuleeLe) : null,
      exerciceClos: mv.exercice.statut === StatutExercice.CLOTURE,
      revueNonAnnulee: revue ? jour(revue.date) : null,
      motif: motifSaisi,
    });
    if (refus) throw new BadRequestException(refus);
    const motif = motifSaisi.trim();
    const nom = mv.type === TypeMouvementCreanceDouteuse.PERTE ? 'de la perte' : 'du recouvrement';
    const objet = `l'écriture ${nom} n° ${mv.ecriture?.numeroPiece ?? '·'}`;
    if (mv.ecriture) {
      if (groupe?.figee && mv.ecriture.statut === StatutEcriture.BROUILLARD) {
        throw new BadRequestException(motifLettrageFigeAuBrouillard(groupe.code, groupe.figee, 'le mouvement'));
      }
      const tenues = motifLignesTenues(mv.ecriture.lignes, objet, 'annuler', ', puis annulez le mouvement', groupe?.id ?? null);
      if (tenues) throw new BadRequestException(tenues);
    }
    return transactionJournalisee(this.prisma, async (tx) => {
      const e = mv.ecriture;
      let annulation: Record<string, unknown> = { traitement: 'SANS_ECRITURE' };
      if (e) {
        if (groupe && !maintenu) await this.lettrage.defaireLettrageDuModule(tx, tenantId, groupe.id);
        // Relu dans la transaction · un lettrage ou un pointage posé entre-temps refuse aussi.
        const relues = await tx.ligneEcriture.findMany({
          where: { ecritureId: e.id, ecriture: { tenantId } },
          select: { lettre: true, lettrageId: true, rapprochementId: true },
        });
        const tenues = motifLignesTenues(relues, objet, 'annuler', ', puis annulez le mouvement', maintenu);
        if (tenues) throw new BadRequestException(tenues);
        if ((await this.statutDansTx(tx, tenantId, e.id)) === StatutEcriture.BROUILLARD) {
          if (groupe && maintenu) throw new BadRequestException(motifLettrageFigeAuBrouillard(groupe.code, groupe.figee!, 'le mouvement'));
          annulation = { traitement: 'SUPPRIMEE', ecritureId: e.id, numeroPiece: e.numeroPiece };
        } else {
          const negatif = await this.ecritures.inscrireEnNegatifPourAnnulation(tenantId, userId, e.id, motif, tx, { groupeTolere: maintenu });
          annulation = {
            traitement: 'INSCRITE_EN_NEGATIF',
            ecritureId: e.id,
            numeroPiece: e.numeroPiece,
            negatifId: negatif.id,
            negatifNumeroPiece: negatif.numeroPiece,
          };
        }
        // B2 · le sort du lettrage se garde dans la trace de l'annulation.
        if (groupe) annulation = { ...annulation, ...(maintenu ? { lettrageMaintenu: groupe.id } : { lettrageDefait: groupe.id }) };
      }
      // Marqué AVANT la suppression du brouillard, sur une ligne encore non
      // annulée · le lien vers une écriture supprimée est effacé, l'écriture
      // inscrite en négatif reste nommée.
      try {
        await tx.mouvementCreanceDouteuse.update({
          where: { id: mv.id, tenantId, annuleeLe: null },
          data: {
            annuleeLe: new Date(),
            annuleePar: userId,
            motifAnnulation: motif,
            annulation: annulation as Prisma.InputJsonValue,
            ...(annulation.traitement === 'SUPPRIMEE' ? { ecritureId: null } : {}),
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          throw new ConflictException('Ce mouvement est déjà annulé.');
        }
        throw err;
      }
      if (e && annulation.traitement === 'SUPPRIMEE') {
        await this.supprimerBrouillardDansTx(tx, tenantId, e.id);
      }
      return { annule: true, annulation, ...(groupe && maintenu ? { information: informationLettrageMaintenu(groupe.code, groupe.figee!) } : {}) };
    });
  }
}

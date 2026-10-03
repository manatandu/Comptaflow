import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NatureCreanceDouteuse,
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
import {
  COMPTES_CREANCES_DOUTEUSES,
  RACINES_CREANCE_SOURCE,
  centimes,
  compte416Propose,
  compte491,
  comptePertePropose,
  ecartDeDepreciation,
  enPlaceAvant,
  motifRefusAnnulationMouvement,
  motifRefusAnnulationRevue,
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
 * L'échéance du verrou des gestes · une borne de REPRISE d'un processus tombé
 * avant son `finally`, bien au-delà d'un geste (convention d'OmegaX, même
 * valeur que la ligne A5).
 */
export const ECHEANCE_VERROU_CREANCES_MS = 15 * 60 * 1000;
export const MOTIF_VERROU_CREANCES =
  'Une opération sur les créances douteuses est en cours sur ce dossier · réessayez après sa fin.';

/** L'à-nouveau d'un exercice · bilan d'ouverture importé ou report, quel qu'en soit le statut. */
const A_NOUVEAU = { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false } as const;

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

  private async regime(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, systemeComptableSyscohada: true, jeuEtatsFinanciersSycebnl: true },
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

  private async aUnANouveau(tenantId: string, exerciceId: string) {
    return (await this.prisma.ecriture.count({ where: { tenantId, exerciceId, ...A_NOUVEAU } })) > 0;
  }

  /**
   * LES EXERCICES DONT LES ÉCRITURES FONT LE SOLDE (relecture adverse, M2) ·
   * l'exercice lui-même, et, tant qu'il n'a pas d'à-nouveau, l'exercice qui le
   * précède, récursivement · le report RECONSTITUÉ de la clôture précédente,
   * comme `lireComptesDuReport` le calcule, et DIT provisoire. Sans lui, une
   * créance de N-1 lue dans N sans à-nouveau valait zéro, et le rapprochement
   * fabriquait un écart qui n'existe pas (§ 10 bis, cinquième défaut).
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

  /** Solde (débit moins crédit) sur la chaîne d'exercices, jusqu'à une date comprise, brouillard compris. */
  private async solde(tenantId: string, compte: Prisma.CompteWhereInput, ids: string[], au: Date) {
    const s = await this.prisma.ligneEcriture.aggregate({
      where: { compte: { tenantId, ...compte }, ecriture: { tenantId, exerciceId: { in: ids }, date: { lte: au } } },
      _sum: { debit: true, credit: true },
    });
    return centimes(n(s._sum.debit) - n(s._sum.credit));
  }

  private async creance(tenantId: string, id: string): Promise<Creance> {
    const c = await this.prisma.creanceDouteuse.findFirst({ where: { id, tenantId }, include: INCLURE_CREANCE });
    if (!c) throw new NotFoundException('Créance douteuse introuvable pour ce dossier.');
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

  /**
   * LES COMPTES DU FORMULAIRE · les créances clients à solde débiteur à la fin
   * de l'exercice (lues sur la balance, report reconstitué compris), et les
   * comptes de détail du 416 que le texte prescrit. Aucune liste de choix
   * filtrée par la rétention · voir `listes-de-comptes.ts`, régime « texte ».
   */
  async comptes(tenantId: string, exerciceId: string) {
    const [{ referentiel }, ex] = await Promise.all([this.regime(tenantId), this.exercice(tenantId, exerciceId)]);
    const { ids, provisoire } = await this.chaine(tenantId, ex);
    const racines = RACINES_CREANCE_SOURCE[referentiel];
    const groupes = await this.prisma.ligneEcriture.groupBy({
      by: ['compteId'],
      where: {
        ecriture: { tenantId, exerciceId: { in: ids } },
        compte: { tenantId, typeCompte: TypeCompteDetailTotal.DETAIL, OR: racines.map((r) => ({ numero: { startsWith: r } })) },
      },
      _sum: { debit: true, credit: true },
      orderBy: { compteId: 'asc' },
      take: PLAFOND_COMPTES_CANDIDATS + 1,
    });
    const debiteurs = groupes
      .map((g) => ({ compteId: g.compteId, solde: centimes(n(g._sum?.debit) - n(g._sum?.credit)) }))
      .filter((g) => g.solde > 0.005);
    const [comptesCreances, comptes416] = await Promise.all([
      this.prisma.compte.findMany({
        where: { tenantId, id: { in: debiteurs.map((d) => d.compteId) } },
        select: { id: true, numero: true, intitule: true, tiersCompte: { select: { tiers: { select: { nom: true } } } } },
        orderBy: { numero: 'asc' },
        take: PLAFOND_COMPTES_CANDIDATS,
      }),
      this.prisma.compte.findMany({
        where: { tenantId, numero: { startsWith: COMPTES_CREANCES_DOUTEUSES.creances416 }, typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true },
        select: { id: true, numero: true, intitule: true },
        orderBy: { numero: 'asc' },
        take: 50,
      }),
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
      })),
      tronque: groupes.length > PLAFOND_COMPTES_CANDIDATS,
      comptes416,
    };
  }

  /**
   * LA LISTE DE L'EXERCICE · chaque créance reclassée ou déclarée au plus
   * tard à sa clôture, avec le reste au 416, la dépréciation en place à
   * l'ouverture et à la clôture, sa revue, ses mouvements, et si une revue
   * est À FAIRE (elle changerait quelque chose). Le rapprochement confronte
   * les totaux du module aux soldes du 416 et du 491, lus sur le report
   * reconstitué tant que l'à-nouveau manque, et le dit.
   */
  async lister(tenantId: string, exerciceId: string) {
    const ex = await this.exercice(tenantId, exerciceId);
    const [total, lignes, regime, annulees, mouvementsAnnules] = await Promise.all([
      this.prisma.creanceDouteuse.count({ where: { tenantId, dateReclassement: { lte: ex.dateFin } } }),
      this.prisma.creanceDouteuse.findMany({
        where: { tenantId, dateReclassement: { lte: ex.dateFin } },
        include: INCLURE_CREANCE,
        orderBy: [{ dateReclassement: 'asc' }, { id: 'asc' }],
        take: PLAFOND_CREANCES_LISTEES,
      }),
      this.regime(tenantId),
      this.prisma.ajustementCreanceDouteuse.findMany({
        where: { tenantId, exerciceId: ex.id, annuleeLe: { not: null } },
        select: { id: true, creanceId: true, annuleeLe: true, motifAnnulation: true },
        orderBy: { annuleeLe: 'asc' },
        take: PLAFOND_CREANCES_LISTEES,
      }),
      this.prisma.mouvementCreanceDouteuse.findMany({
        where: { tenantId, exerciceId: ex.id, annuleeLe: { not: null } },
        select: { id: true, creanceId: true, type: true, date: true, montant: true, annuleeLe: true, motifAnnulation: true },
        orderBy: { annuleeLe: 'asc' },
        take: PLAFOND_CREANCES_LISTEES,
      }),
    ]);
    const creances = lignes.map((c) => ({
      ...this.presenter(c, ex, regime.referentiel),
      revuesAnnulees: annulees.filter((a) => a.creanceId === c.id).map((a) => ({ id: a.id, annuleeLe: a.annuleeLe, motif: a.motifAnnulation })),
      mouvementsAnnules: mouvementsAnnules
        .filter((m) => m.creanceId === c.id)
        .map((m) => ({ id: m.id, type: m.type, date: m.date, montant: n(m.montant), annuleeLe: m.annuleeLe, motif: m.motifAnnulation })),
    }));
    const { ids, provisoire } = await this.chaine(tenantId, ex);
    // LE 491 DU MODULE SEUL (seconde relecture, M-b) · les comptes que ses
    // créances déprécient. Un 491 qui porte d'autres dépréciations (créance
    // dépréciée hors module, autre nature) fabriquait un écart qui n'est pas
    // celui du module.
    const comptes491 = [...new Set(lignes.map((c) => c.compte491Id))];
    const [solde416, solde491] = await Promise.all([
      this.solde(tenantId, { numero: { startsWith: COMPTES_CREANCES_DOUTEUSES.creances416 } }, ids, ex.dateFin),
      comptes491.length > 0 ? this.solde(tenantId, { id: { in: comptes491 } }, ids, ex.dateFin) : Promise.resolve(0),
    ]);
    return {
      exercice: { id: ex.id, dateDebut: ex.dateDebut, dateFin: ex.dateFin, statut: ex.statut },
      systemeMinimal: !!motifRefusDepreciationSmt(regime),
      total,
      tronque: total > lignes.length,
      creances,
      rapprochement:
        total > lignes.length
          ? null
          : {
              // Lu sur le report reconstitué de l'exercice précédent tant que
              // l'à-nouveau n'est pas passé · provisoire, et l'écran le dit.
              provisoire,
              solde416,
              resteModule: centimes(creances.reduce((s, c) => s + c.resteALaCloture, 0)),
              // Le 491 est créditeur · rendu en positif pour se comparer.
              solde491: centimes(-solde491),
              depreciationModule: centimes(creances.reduce((s, c) => s + c.depreciationALaCloture, 0)),
            },
    };
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
    const [{ referentiel }, ex, journal, source] = await Promise.all([
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
    const [soldeDebiteur, enDevise, c491] = await Promise.all([
      this.solde(tenantId, { id: source.id }, ids, date),
      this.prisma.ligneEcriture.count({
        where: { compteId: source.id, deviseId: { not: null }, lettre: null, ecriture: { tenantId, exerciceId: { in: ids } } },
      }),
      this.compteDetail(tenantId, compte491(dto.nature)),
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
      ligneEnDevise: enDevise > 0,
      motif: dto.motif,
      pieces,
      exerciceOuvert: ex.statut === StatutExercice.OUVERT,
      dateDansExercice: date >= ex.dateDebut && date <= ex.dateFin,
      journalGeneral: journal.type === TypeJournal.GENERAL,
    });
    // Le solde lu sans à-nouveau est le report reconstitué · le refus le dit,
    // avec l'issue (relecture adverse, M2).
    if (motif && provisoire && motif.includes('dépasse ce que le client doit')) {
      motif +=
        " Ce solde est le report RECONSTITUÉ de l'exercice précédent, l'à-nouveau de cet exercice n'étant pas encore passé · " +
        "passez l'à-nouveau (ou le bilan d'ouverture), puis reprenez le reclassement.";
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
      return { ...ligne, montant: n(ligne.montant) };
    } catch (err) {
      // Une ligne refusée ne laisse pas son écriture au journal.
      await this.ecritures.retirerCompensation(tenantId, ecriture.id);
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
    const [{ referentiel }, ex, source, c416] = await Promise.all([
      this.regime(tenantId),
      this.exercice(tenantId, dto.exerciceId),
      this.compteParId(tenantId, dto.compteCreanceId),
      this.compteParId(tenantId, dto.compte416Id),
    ]);
    const c491 = await this.compteDetail(tenantId, compte491(dto.nature));
    const date = ex.dateDebut;
    const aNouveau = { tenantId, exerciceId: ex.id, ...A_NOUVEAU };
    const [an416, an491, existe, dejaPorte] = await Promise.all([
      this.prisma.ligneEcriture.aggregate({ where: { compteId: c416.id, ecriture: aNouveau }, _sum: { debit: true, credit: true } }),
      this.prisma.ligneEcriture.aggregate({ where: { compteId: c491.id, ecriture: aNouveau }, _sum: { debit: true, credit: true } }),
      this.aUnANouveau(tenantId, ex.id),
      this.dejaPorteALOuverture(tenantId, ex.dateDebut, c416.id, c491.id),
    ]);
    const motif = motifRefusDeclaration({
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
      aNouveau: existe,
      aNouveau416: centimes(n(an416._sum.debit) - n(an416._sum.credit)),
      dejaDeclare416: dejaPorte.sur416,
      aNouveau491: centimes(n(an491._sum.credit) - n(an491._sum.debit)),
      dejaDeclare491: dejaPorte.sur491,
    });
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
    return { ...ligne, montant: n(ligne.montant), depreciationOuverture: n(ligne.depreciationOuverture) };
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
          where: { tenantId, dateReclassement: { lte: ouverture }, OR: [{ compte416Id }, { compte491Id }] },
          include: INCLURE_CREANCE,
          ...pageApres(curseur, LOT_ECRITURES),
        }),
      (c) => {
        const aLOuverture = c.dateReclassement.getTime() === ouverture.getTime();
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
      if (ecritureId) await this.ecritures.retirerCompensation(tenantId, ecritureId);
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
        if (e.statut === StatutEcriture.BROUILLARD) {
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
        await tx.ligneEcriture.deleteMany({ where: { ecritureId: e.id } });
        await tx.ecriture.deleteMany({ where: { id: e.id, tenantId } });
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
      motif: dto.motif,
      pieces,
      exerciceOuvert: ex.statut === StatutExercice.OUVERT,
      dateDansExercice: date >= ex.dateDebut && date <= ex.dateFin,
      avantReclassement: date.getTime() < c.dateReclassement.getTime(),
      revueApres: revueApres ? jour(revueApres.date) : null,
      journalAttendu,
      numeroPerte: comptePerte?.numero ?? null,
      numeroPerteEstDetail: comptePerte?.estDetail ?? false,
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
    try {
      const ligne = await transactionJournalisee(this.prisma, (tx) =>
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
      return { ...ligne, montant: n(ligne.montant) };
    } catch (err) {
      await this.ecritures.retirerCompensation(tenantId, ecriture.id);
      throw err;
    }
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
      if (toutes > 0 || tousMouvements > 0) {
        throw new BadRequestException(
          'Cette créance porte déjà une revue ou un mouvement (même annulés, ils se gardent) · la créance ne se retire plus, ' +
            'sa sortie se fait par la perte ou le recouvrement.',
        );
      }
      const ex = await this.exercice(tenantId, c.exerciceId);
      if (ex.statut === StatutExercice.CLOTURE) throw new BadRequestException("L'exercice de cette créance est clôturé.");
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

  retirerMouvement(tenantId: string, id: string, mouvementId: string) {
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
      await this.ecritures.supprimer(tenantId, mv.ecritureId, {
        detenteur: DETENTEUR_MOUVEMENT_CREANCE,
        liberer: (tx) => tx.mouvementCreanceDouteuse.delete({ where: { id: mv.id } }),
      });
      return { retire: true };
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
      const tenues = motifLignesTenues(mv.ecriture.lignes, objet, 'annuler', ', puis annulez le mouvement');
      if (tenues) throw new BadRequestException(tenues);
    }
    return transactionJournalisee(this.prisma, async (tx) => {
      const e = mv.ecriture;
      let annulation: Record<string, unknown> = { traitement: 'SANS_ECRITURE' };
      if (e) {
        // Relu dans la transaction · un lettrage ou un pointage posé entre-temps refuse aussi.
        const relues = await tx.ligneEcriture.findMany({
          where: { ecritureId: e.id, ecriture: { tenantId } },
          select: { lettre: true, lettrageId: true, rapprochementId: true },
        });
        const tenues = motifLignesTenues(relues, objet, 'annuler', ', puis annulez le mouvement');
        if (tenues) throw new BadRequestException(tenues);
        if (e.statut === StatutEcriture.BROUILLARD) {
          annulation = { traitement: 'SUPPRIMEE', ecritureId: e.id, numeroPiece: e.numeroPiece };
        } else {
          const negatif = await this.ecritures.inscrireEnNegatifPourAnnulation(tenantId, userId, e.id, motif, tx);
          annulation = {
            traitement: 'INSCRITE_EN_NEGATIF',
            ecritureId: e.id,
            numeroPiece: e.numeroPiece,
            negatifId: negatif.id,
            negatifNumeroPiece: negatif.numeroPiece,
          };
        }
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
        await tx.ligneEcriture.deleteMany({ where: { ecritureId: e.id } });
        await tx.ecriture.deleteMany({ where: { id: e.id, tenantId } });
      }
      return { annule: true, annulation };
    });
  }
}

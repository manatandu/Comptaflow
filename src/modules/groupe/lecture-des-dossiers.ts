import { StatutEcriture } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  agregatsParCompte,
  filtresDesTroisColonnes,
  lignesDeBalance,
  totauxDeBalance,
  type LigneDeBalance,
} from '../comptabilite/balance-trois-colonnes';

/**
 * LA LECTURE DU GROUPE PAR COUPLES DOSSIER-EXERCICE (audit final F190).
 *
 * La balance agrégée et la supervision appelaient `EcritureService.balance`
 * CELLULE PAR CELLULE, en série · quatre requêtes par dossier, plus trois
 * comptages par cellule à la supervision : de l'ordre de mille cinq cents
 * requêtes à la file pour un groupe fourni, chacune attendant la précédente.
 * Et la liasse comptait le brouillard de tous ses dossiers D'UN COUP, deux
 * comptages par dossier lancés ensemble · six cents requêtes simultanées pour
 * trois cents cellules, de quoi vider le pool de connexions de l'instance et
 * faire attendre tous les cabinets qu'elle sert.
 *
 * Ici chaque requête lit une TRANCHE de dossiers, bornée par ses couples
 * (dossier, exercice retenu) · la somme se fait dans Postgres, une ligne par
 * compte mouvementé, et les tranches se suivent. Le nombre de requêtes ne
 * dépend plus que du nombre de tranches, et jamais plus de quatre ne partent
 * ensemble · autant qu'une seule balance de dossier.
 *
 * LA BALANCE D'UN DOSSIER EST CELLE DE `EcritureService.balance`, brouillard
 * compris (c'est l'écran de travail du siège), à l'identique : même partition
 * en trois colonnes (report à-nouveau, mouvements, écriture qui solde les
 * comptes de gestion), comptes Détail seulement, comptes à mouvement nul
 * écartés, ordre croissant des numéros, et même ordre d'addition, donc les
 * mêmes nombres au bit près. Le calcul est PARTAGÉ avec ce service
 * (`comptabilite/balance-trois-colonnes.ts`), seule la lecture diffère ·
 * `lecture-groupe-f190.spec.ts` confronte encore les deux, dossier par
 * dossier.
 *
 * LE CLOISONNEMENT · chaque requête porte les dossiers de sa tranche par leur
 * VALEUR (`tenantId: { in }`, puis le couple exact), et l'appelant l'enveloppe
 * dans le périmètre du siège (`GroupeService.dansLeGroupe`). Rien ici ne sort
 * de la garde.
 */

export interface CoupleDossierExercice {
  tenantId: string;
  exerciceId: string;
}

/**
 * Dossiers lus par requête. Vingt dossiers d'un plan complet font quelques
 * dizaines de milliers de comptes, quelques mégaoctets · un groupe de trois
 * cents cellules se lit en seize tranches au lieu de trois cents balances.
 */
export const TRANCHE_DOSSIERS = 20;

function enTranches<T>(elements: readonly T[]): T[][] {
  const tranches: T[][] = [];
  for (let i = 0; i < elements.length; i += TRANCHE_DOSSIERS) {
    tranches.push(elements.slice(i, i + TRANCHE_DOSSIERS));
  }
  return tranches;
}

/**
 * UN DOSSIER, UN EXERCICE · les sommes se groupent par compte, et un compte
 * n'appartient qu'à un dossier. Le même dossier nommé deux fois réunirait sur
 * ses comptes deux exercices, dans une balance qui bouclerait quand même ·
 * c'est un défaut de l'appelant, et il lève au lieu de passer.
 */
function verifierCouples(couples: readonly CoupleDossierExercice[]): void {
  if (new Set(couples.map((c) => c.tenantId)).size !== couples.length) {
    throw new Error(
      'Lecture du groupe · un dossier ne se lit que pour un seul exercice à la fois, ses comptes réuniraient sinon deux exercices.',
    );
  }
}

export type LigneBalanceDossier = LigneDeBalance;

export interface BalanceDossier {
  lignes: LigneBalanceDossier[];
  totaux: { debit: number; credit: number };
}

/**
 * Les balances des dossiers nommés, chacune dans son exercice, rendues par
 * dossier. Un dossier sans mouvement rend une balance vide, jamais une absence.
 */
export async function balancesDesDossiers(
  prisma: PrismaService,
  couples: readonly CoupleDossierExercice[],
): Promise<Map<string, BalanceDossier>> {
  verifierCouples(couples);
  const balances = new Map<string, BalanceDossier>();
  for (const tranche of enTranches(couples)) {
    const dossiers = tranche.map((c) => c.tenantId);
    // Le couple EXACT, et non « ces dossiers et ces exercices » · une écriture
    // d'un dossier rangée sous l'exercice d'un autre n'entre pas dans la balance
    // du premier, pas plus que dans `EcritureService.balance`.
    const ecrituresDeLaTranche = {
      tenantId: { in: dossiers },
      OR: tranche.map((c) => ({ tenantId: c.tenantId, exerciceId: c.exerciceId })),
    };
    const filtres = filtresDesTroisColonnes(ecrituresDeLaTranche);
    const [comptes, reports, mouvements, clotures] = await Promise.all([
      prisma.compte.findMany({
        where: { tenantId: { in: dossiers } },
        orderBy: { numero: 'asc' },
        select: { id: true, tenantId: true, numero: true, intitule: true, classe: true, typeCompte: true },
      }),
      prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        where: { ecriture: filtres.reports },
        _sum: { debit: true, credit: true },
      }),
      prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        where: { ecriture: filtres.mouvements },
        _sum: { debit: true, credit: true },
      }),
      prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        where: { ecriture: filtres.clotures },
        _sum: { debit: true, credit: true },
      }),
    ]);

    // Le MÊME calcul que `EcritureService.balance` (balance-trois-colonnes.ts).
    // Un compte n'appartient qu'à un dossier · les sommes de la tranche se
    // rangent donc par compte sans se mêler. Les comptes arrivent dans l'ordre
    // croissant des numéros, tous dossiers mêlés, et chaque dossier garde le
    // sien, celui de sa propre balance.
    const parCompte = agregatsParCompte(reports, mouvements, clotures);
    const comptesParDossier = new Map<string, typeof comptes>(dossiers.map((d) => [d, []]));
    for (const c of comptes) comptesParDossier.get(c.tenantId)?.push(c);
    for (const [dossier, comptesDuDossier] of comptesParDossier) {
      const lignes = lignesDeBalance(comptesDuDossier, parCompte);
      balances.set(dossier, { lignes, totaux: totauxDeBalance(lignes) });
    }
  }
  return balances;
}

export interface ComptageDossier {
  nbEcritures: number;
  nbBrouillard: number;
  /** Parmi le brouillard, l'à-nouveau provisoire, qui ne se valide jamais. */
  nbProvisoiresAuBrouillard: number;
  /** La date comptable la plus tardive de l'exercice, ou null sans écriture. */
  derniereEcriture: Date | null;
}

/**
 * Ce que la supervision et la liasse comptent dans chaque dossier, en une
 * requête par tranche · un regroupement par statut et par à-nouveau provisoire,
 * dont chaque compteur n'est qu'une somme. Un dossier sans écriture rend des
 * zéros et aucune date, comme un comptage et une recherche qui ne trouvent rien.
 */
export async function comptagesDesDossiers(
  prisma: PrismaService,
  couples: readonly CoupleDossierExercice[],
): Promise<Map<string, ComptageDossier>> {
  verifierCouples(couples);
  const comptages = new Map<string, ComptageDossier>(
    couples.map((c) => [
      c.tenantId,
      { nbEcritures: 0, nbBrouillard: 0, nbProvisoiresAuBrouillard: 0, derniereEcriture: null },
    ]),
  );
  for (const tranche of enTranches(couples)) {
    const groupes = await prisma.ecriture.groupBy({
      by: ['tenantId', 'exerciceId', 'statut', 'estANouveauProvisoire'],
      where: {
        tenantId: { in: tranche.map((c) => c.tenantId) },
        OR: tranche.map(({ tenantId, exerciceId }) => ({ tenantId, exerciceId })),
      },
      _count: { _all: true },
      _max: { date: true },
    });
    for (const g of groupes) {
      const comptage = comptages.get(g.tenantId);
      if (!comptage) continue;
      const nombre = g._count._all;
      comptage.nbEcritures += nombre;
      if (g.statut === StatutEcriture.BROUILLARD) {
        comptage.nbBrouillard += nombre;
        if (g.estANouveauProvisoire) comptage.nbProvisoiresAuBrouillard += nombre;
      }
      const derniere = g._max.date;
      if (derniere && (!comptage.derniereEcriture || derniere.getTime() > comptage.derniereEcriture.getTime())) {
        comptage.derniereEcriture = derniere;
      }
    }
  }
  return comptages;
}

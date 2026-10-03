import { Prisma, StatutEcriture } from '@prisma/client';
import { jourDeKinshasa, jourUtc } from '../../common/echeance';

/**
 * LE SOLDE D'UNE CAISSE À LA DATE DE SON COMPTAGE, ET SA RECONSTITUTION VERS
 * LA CLÔTURE · ligne A10, relevé CPCC C6 (décision de Manasse du 2026-10-02).
 *
 * CE QUI SE COMPARE. La fiche du compte 57, mot pour mot dans les deux plans
 * (AUDCIF Titre VII ; SYCEBNL Partie 2 ch. 3) · « Le solde du compte caisse
 * doit TOUJOURS correspondre exactement à la somme disponible réellement. »
 * Toujours, donc à la date où l'on compte · des espèces comptées le 10 janvier
 * ne se comparent pas au solde du 31 décembre, sans quoi chaque encaissement
 * et chaque paiement de janvier deviendrait un écart que personne n'a
 * constaté. Et l'AUDCIF art. 16, al. 4 · l'inventaire relève chaque élément
 * « avec la mention de la nature, de la quantité et de la valeur de chacun
 * d'eux À LA DATE DE L'INVENTAIRE ».
 *
 * CE QUI SE RECONSTITUE. L'obligation porte sur la clôture (AUDCIF art. 42,
 * « À la clôture de chaque exercice, l'entité doit procéder au recensement »,
 * non écarté par l'art. 3 du SYCEBNL), et le CPCC demande « Le comptage des
 * espèces a-t-il eu lieu au 31 décembre ? » puis « Y a-t-il un chevauchement
 * avec l'exercice en cours sur le solde d'ouverture ? ». Compté après la
 * clôture, le PV remonte donc du comptage à la clôture par les mouvements de
 * caisse intercalés · solde au comptage = solde à la clôture + encaissements
 * postérieurs − décaissements postérieurs, et les espèces existant à la
 * clôture se reconstituent dans l'autre sens. Les données d'inventaire sont
 * « organisées et conservées de manière à justifier le contenu de chacun des
 * éléments recensés » (art. 16, al. 5) · les totaux sont FIGÉS sur le PV et
 * les mouvements servis ligne à ligne pour le chemin de révision (art. 22, 6°).
 * Témoin, non source · l'ISA 501 § 5 demande la même chose d'un comptage de
 * stock fait à une autre date que celle des états (« changes in inventory
 * between the count date and the date of the financial statements »).
 *
 * LE LIVRE-JOURNAL SEUL (AUDCIF art. 22, 2°, « Toute donnée entrée fait
 * l'objet d'une validation »). Une écriture au BROUILLARD sur la caisse, à
 * prendre en compte, REFUSE le PV au lieu d'être lue ou ignorée · lue, le
 * solde figé reposerait sur du provisoire ; ignorée, un paiement réel mais non
 * validé deviendrait un manquant. Même règle que le rapprochement de la
 * campagne (audit final F6) · on valide, puis on compte.
 *
 * LA DATE QUI COMPTE est la date de VALEUR quand l'opération a été reportée au
 * premier jour d'une période ouverte (art. 22, 4°, « sa date de valeur étant
 * mentionnée distinctement » ; art. 16, al. 2, « dans l'ordre de leur date de
 * valeur comptable ») · l'argent est sorti le jour de l'opération, pas le jour
 * où la période l'a admise. Le livre-journal ne porte pas d'heure · le solde
 * est celui de la JOURNÉE du comptage entière, et un mouvement du jour passé
 * après l'heure du comptage s'explique en observation.
 */

type Client = Prisma.TransactionClient;

export interface ExerciceBorne {
  id: string;
  dateDebut: Date;
  dateFin: Date;
}

/** Les totaux figés sur le PV quand le comptage suit la clôture. */
export interface ReconstitutionCaisse {
  dateCloture: Date;
  soldeALaCloture: number;
  encaissementsPosterieurs: number;
  decaissementsPosterieurs: number;
  mouvementsPosterieurs: number;
}

export type LectureSoldeCaisse =
  | { lisible: true; soldeComptable: number; reconstitution: ReconstitutionCaisse | null }
  | { lisible: false; motif: string };

const JOUR_MS = 24 * 60 * 60 * 1000;

const arrondi = (n: number) => Number(n.toFixed(2));

const jour = (d: Date) => jourUtc(d).toISOString().slice(0, 10);

/** Comptée APRÈS la clôture · comparaison au jour, jamais à l'instant. */
export function compteApresLaCloture(dateComptage: Date, dateFin: Date): boolean {
  return jourUtc(dateComptage).getTime() > jourUtc(dateFin).getTime();
}

/**
 * Le filtre « opération faite au plus tard le jour J » · date de valeur si elle
 * existe, date sinon. `lt` le lendemain à minuit, pour qu'une date portant une
 * heure reste dans sa journée.
 */
export function auPlusTardLe(jourJ: Date): Prisma.EcritureWhereInput {
  const lendemain = new Date(jourUtc(jourJ).getTime() + JOUR_MS);
  return { OR: [{ dateValeur: null, date: { lt: lendemain } }, { dateValeur: { lt: lendemain } }] };
}

/**
 * Les exercices qui portent les mouvements postérieurs à la clôture, du
 * lendemain de la clôture au jour du comptage. Ils doivent se suivre SANS
 * TROU · un jour qu'aucun exercice ne couvre est un jour dont aucun mouvement
 * ne peut être au livre-journal, et le lire comme « aucun mouvement » ferait
 * passer pour nul ce qui n'est pas enregistré.
 */
export function exercicesDuComptage(
  dateFin: Date,
  dateComptage: Date,
  suivants: ExerciceBorne[],
): { ids: string[] } | { motif: string } {
  const tries = [...suivants].sort((a, b) => a.dateDebut.getTime() - b.dateDebut.getTime());
  let attendu = jourUtc(dateFin).getTime() + JOUR_MS;
  const ids: string[] = [];
  for (const e of tries) {
    if (jourUtc(e.dateDebut).getTime() > attendu) break;
    if (jourUtc(e.dateDebut).getTime() < attendu) continue;
    ids.push(e.id);
    attendu = jourUtc(e.dateFin).getTime() + JOUR_MS;
    if (attendu > jourUtc(dateComptage).getTime()) return { ids };
  }
  const premierJourNonCouvert = jour(new Date(attendu));
  return {
    motif:
      `Le comptage est daté du ${jour(dateComptage)}, après la clôture du ${jour(dateFin)}, et aucun exercice du ` +
      `dossier ne couvre le ${premierJourNonCouvert}. Les encaissements et paiements de la caisse entre la clôture ` +
      "et le comptage ne peuvent donc pas être au livre-journal, et le solde à la date du comptage n'est pas " +
      "calculable · ouvrez l'exercice suivant, saisissez-y et validez ces mouvements, puis établissez le " +
      'procès-verbal (fiche du compte 57, « le solde du compte caisse doit toujours correspondre exactement à la ' +
      'somme disponible réellement » ; AUDCIF art. 16, al. 2).',
  };
}

/** Les exercices qui commencent après la clôture et au plus tard le jour du comptage. */
export function filtreExercicesSuivants(tenantId: string, dateFin: Date, dateComptage: Date): Prisma.ExerciceWhereInput {
  return { tenantId, dateDebut: { gt: dateFin, lt: new Date(jourUtc(dateComptage).getTime() + JOUR_MS) } };
}

/** Les espèces existant à la clôture, reconstituées depuis le comptage. */
export function especesReconstitueesALaCloture(
  especesComptees: number,
  r: Pick<ReconstitutionCaisse, 'encaissementsPosterieurs' | 'decaissementsPosterieurs'>,
): number {
  return arrondi(especesComptees - r.encaissementsPosterieurs + r.decaissementsPosterieurs);
}

async function sommes(prisma: Client, compteId: string, ecriture: Prisma.EcritureWhereInput) {
  const s = await prisma.ligneEcriture.aggregate({
    where: { compteId, ecriture },
    _sum: { debit: true, credit: true },
    _count: { _all: true },
  });
  const debit = Number(s._sum?.debit ?? 0);
  const credit = Number(s._sum?.credit ?? 0);
  return { debit, credit, nombre: s._count?._all ?? 0 };
}

/**
 * Lit le solde de la caisse au livre-journal à la date du comptage, et sa
 * reconstitution vers la clôture quand le comptage la suit. Un solde non
 * calculable revient avec son motif, jamais à zéro.
 */
export async function lireSoldeCaisseAuComptage(
  prisma: Client,
  tenantId: string,
  compteId: string,
  exercice: ExerciceBorne,
  dateComptage: Date,
  maintenant: Date = new Date(),
): Promise<LectureSoldeCaisse> {
  if (jourUtc(dateComptage).getTime() < jourUtc(exercice.dateDebut).getTime()) {
    return {
      lisible: false,
      motif:
        `Le comptage est daté du ${jour(dateComptage)}, avant l'ouverture de l'exercice de la campagne ` +
        `(${jour(exercice.dateDebut)}) · il ne compte pas la caisse de cet exercice.`,
    };
  }
  if (jourUtc(dateComptage).getTime() > jourDeKinshasa(maintenant).getTime()) {
    return {
      lisible: false,
      motif: `Le comptage est daté du ${jour(dateComptage)}, dans le futur · un procès-verbal constate un comptage fait.`,
    };
  }

  const apres = compteApresLaCloture(dateComptage, exercice.dateFin);

  // L'OUVERTURE DE L'EXERCICE DE LA CAMPAGNE · un à-nouveau PROVISOIRE ne se
  // valide jamais (il attend la clôture de l'exercice précédent) ; le solde de
  // la caisse en dépend, et il n'est pas au livre-journal.
  const ouvertureProvisoire = await prisma.ligneEcriture.count({
    where: { compteId, ecriture: { tenantId, exerciceId: exercice.id, estANouveauProvisoire: true } },
  });
  if (ouvertureProvisoire > 0) {
    return {
      lisible: false,
      motif:
        "Le solde d'ouverture de cette caisse est un report à-nouveau PROVISOIRE · il n'est pas au livre-journal " +
        "(AUDCIF art. 22, 2°), et le solde à la date du comptage en dépend. Clôturez l'exercice précédent, qui " +
        "pose le report définitif, puis établissez le procès-verbal.",
    };
  }

  const brouillardExercice = await prisma.ligneEcriture.count({
    where: {
      compteId,
      ecriture: {
        tenantId,
        exerciceId: exercice.id,
        statut: StatutEcriture.BROUILLARD,
        ...(apres ? {} : auPlusTardLe(dateComptage)),
      },
    },
  });

  if (!apres) {
    if (brouillardExercice > 0) return refusBrouillard(brouillardExercice, dateComptage);
    const s = await sommes(prisma, compteId, {
      tenantId,
      exerciceId: exercice.id,
      statut: StatutEcriture.VALIDEE,
      ...auPlusTardLe(dateComptage),
    });
    return { lisible: true, soldeComptable: arrondi(s.debit - s.credit), reconstitution: null };
  }

  const suivants = await prisma.exercice.findMany({
    where: filtreExercicesSuivants(tenantId, exercice.dateFin, dateComptage),
    select: { id: true, dateDebut: true, dateFin: true },
    orderBy: { dateDebut: 'asc' },
  });
  const couverture = exercicesDuComptage(exercice.dateFin, dateComptage, suivants);
  if ('motif' in couverture) return { lisible: false, motif: couverture.motif };

  // LE REPORT À-NOUVEAU DES EXERCICES SUIVANTS N'EST PAS UN MOUVEMENT · il
  // reprend la clôture, déjà lue sur l'exercice de la campagne. Le compter
  // doublerait le solde ; validé ou provisoire, il est écarté des deux
  // lectures, et le brouillard qui compte est celui des opérations.
  const mouvementsPosterieurs: Prisma.EcritureWhereInput = {
    tenantId,
    exerciceId: { in: couverture.ids },
    estGenereeParCloture: false,
    estANouveauProvisoire: false,
    ...auPlusTardLe(dateComptage),
  };
  const brouillardPosterieur = await prisma.ligneEcriture.count({
    where: { compteId, ecriture: { ...mouvementsPosterieurs, statut: StatutEcriture.BROUILLARD } },
  });
  if (brouillardExercice + brouillardPosterieur > 0) {
    return refusBrouillard(brouillardExercice + brouillardPosterieur, dateComptage);
  }

  const cloture = await sommes(prisma, compteId, { tenantId, exerciceId: exercice.id, statut: StatutEcriture.VALIDEE });
  const posterieurs = await sommes(prisma, compteId, { ...mouvementsPosterieurs, statut: StatutEcriture.VALIDEE });
  const soldeALaCloture = arrondi(cloture.debit - cloture.credit);
  const encaissementsPosterieurs = arrondi(posterieurs.debit);
  const decaissementsPosterieurs = arrondi(posterieurs.credit);
  return {
    lisible: true,
    soldeComptable: arrondi(soldeALaCloture + encaissementsPosterieurs - decaissementsPosterieurs),
    reconstitution: {
      dateCloture: exercice.dateFin,
      soldeALaCloture,
      encaissementsPosterieurs,
      decaissementsPosterieurs,
      mouvementsPosterieurs: posterieurs.nombre,
    },
  };
}

function refusBrouillard(nombre: number, dateComptage: Date): LectureSoldeCaisse {
  return {
    lisible: false,
    motif:
      `${nombre} ligne(s) au brouillard sur cette caisse, datée(s) au plus tard du comptage (${jour(dateComptage)}) · ` +
      'les valider ou les supprimer avant d’établir le procès-verbal. Le solde figé se lit au livre-journal ' +
      "(AUDCIF art. 22, 2°) · lue, une ligne provisoire figerait un solde que la validation peut changer ; " +
      "ignorée, un paiement réel deviendrait un manquant.",
  };
}

/**
 * Les mouvements postérieurs, ligne à ligne, TELS QUE LE PV LES A LUS · les
 * écritures validées au plus tard à l'établissement du PV (ou sans date de
 * validation, créées avant lui). Une opération validée APRÈS, même datée avant
 * le comptage, n'était pas au livre-journal quand le solde a été figé · elle
 * n'entre pas dans la reconstitution servie, et la concordance avec les totaux
 * figés le dit.
 */
export function mouvementsLusParLePv(
  tenantId: string,
  exercicesIds: string[],
  dateComptage: Date,
  etabliLe: Date,
): Prisma.EcritureWhereInput {
  return {
    tenantId,
    exerciceId: { in: exercicesIds },
    statut: StatutEcriture.VALIDEE,
    estGenereeParCloture: false,
    estANouveauProvisoire: false,
    AND: [
      auPlusTardLe(dateComptage),
      { OR: [{ valideeAt: { lte: etabliLe } }, { valideeAt: null, createdAt: { lte: etabliLe } }] },
    ],
  };
}

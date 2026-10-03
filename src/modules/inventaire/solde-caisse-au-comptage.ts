import { ModeComparaisonCaisse, Prisma, StatutEcriture } from '@prisma/client';
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
 * caisse intercalés · solde au comptage = solde à la clôture + opérations de
 * l'exercice suivant à date de valeur antérieure à la clôture + encaissements
 * postérieurs − décaissements postérieurs, et les espèces existant à la
 * clôture se reconstituent dans l'autre sens. Les données d'inventaire sont
 * « organisées et conservées de manière à justifier le contenu de chacun des
 * éléments recensés » (art. 16, al. 5) · les totaux sont FIGÉS sur le PV et
 * les mouvements servis ligne à ligne pour le chemin de révision (art. 22, 6°).
 * Témoin, non source · l'ISA 501 § 5 demande la même chose d'un comptage de
 * stock fait à une autre date que celle des états.
 *
 * LA CAISSE EN DEVISES (seconde passe, B1). Les plans ouvrent une caisse en
 * devises · 5712 « en devises » sous 571 au SYSCOHADA, 572 « Caisse en
 * devises » au SYCEBNL (le 572 SYSCOHADA est une caisse de SUCCURSALE · un
 * numéro, deux sens, d'où l'aiguillage par les LIGNES et jamais par le
 * numéro). Les espèces se comptent dans leur monnaie ; comparées en francs,
 * l'écart mêlerait les cours historiques de chaque mouvement. Quand TOUTES les
 * lignes lues portent UNE même devise, solde, reconstitution, comptage, écart
 * et coupures se lisent dans cette devise (montant en devise de chaque ligne,
 * signé par son sens). Aucun cours n'est appliqué ici · la conversion des
 * disponibilités en devises au cours de clôture (Titre VIII ch. 22, section 4,
 * qui la rattache à « l'article 58 » quand l'art. 58 lu porte la position
 * globale de change · anomalie de renvoi du texte, non corrigée) est l'affaire
 * de la réévaluation des devises (ligne A5), pas du comptage. Les écritures
 * d'écarts d'une réévaluation (lignes sans devise sur la caisse) n'ont aucun
 * montant en devise et sont écartées de la lecture en devise. Lignes MÊLÉES
 * (francs et devise, plusieurs devises, ligne en devise sans montant) · le PV
 * n'est PAS refusé, la campagne ne doit pas s'arrêter là ; la comparaison se
 * fait en francs, au cours historique de chaque mouvement, et le PV le DIT.
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

/** L'unité de la comparaison · francs, une devise, ou francs sur lignes mêlées. */
export interface UniteComparaison {
  mode: ModeComparaisonCaisse;
  devise: { id: string; code: string } | null;
}

/** Les totaux figés sur le PV quand le comptage suit la clôture. */
export interface ReconstitutionCaisse {
  dateCloture: Date;
  soldeALaCloture: number;
  /**
   * Opérations inscrites dans un exercice suivant avec une date de valeur au
   * plus tard à la clôture (net, débit moins crédit). Elles sont au
   * livre-journal du jour du comptage, mais ont eu lieu avant la clôture ·
   * isolées, jamais confondues avec les mouvements intercalés.
   */
  mouvementsValeurAvantCloture: number;
  encaissementsPosterieurs: number;
  decaissementsPosterieurs: number;
  mouvementsPosterieurs: number;
}

export type LectureSoldeCaisse =
  | { lisible: true; soldeComptable: number; unite: UniteComparaison; reconstitution: ReconstitutionCaisse | null }
  | { lisible: false; motif: string };

const JOUR_MS = 24 * 60 * 60 * 1000;

const arrondi = (n: number) => Number(n.toFixed(2));

const jour = (d: Date) => jourUtc(d).toISOString().slice(0, 10);

/** `dateComptage` reçue · une date civile AAAA-MM-JJ, et rien d'autre (e). */
export const FORMAT_DATE_COMPTAGE = /^\d{4}-\d{2}-\d{2}$/;

/** Comptée APRÈS la clôture · comparaison au jour, jamais à l'instant. */
export function compteApresLaCloture(dateComptage: Date, dateFin: Date): boolean {
  return jourUtc(dateComptage).getTime() > jourUtc(dateFin).getTime();
}

/** Lendemain du jour J, à minuit · borne `lt` qui garde une date à heure dans sa journée. */
const lendemain = (j: Date) => new Date(jourUtc(j).getTime() + JOUR_MS);

/**
 * Le filtre « opération faite au plus tard le jour J » · date de valeur si elle
 * existe, date sinon.
 */
export function auPlusTardLe(jourJ: Date): Prisma.EcritureWhereInput {
  const l = lendemain(jourJ);
  return { OR: [{ dateValeur: null, date: { lt: l } }, { dateValeur: { lt: l } }] };
}

/** « Opération faite APRÈS le jour J », même lecture de la date. */
function apresLe(jourJ: Date): Prisma.EcritureWhereInput {
  const l = lendemain(jourJ);
  return { OR: [{ dateValeur: null, date: { gte: l } }, { dateValeur: { gte: l } }] };
}

/** Les exercices qui commencent après la clôture et au plus tard le jour du comptage. */
export function filtreExercicesSuivants(tenantId: string, dateFin: Date, dateComptage: Date): Prisma.ExerciceWhereInput {
  return { tenantId, dateDebut: { gt: dateFin, lt: lendemain(dateComptage) } };
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

/**
 * Les espèces existant à la clôture, reconstituées depuis le comptage · les
 * opérations à date de valeur antérieure à la clôture ont eu lieu AVANT elle,
 * elles ne se retranchent pas.
 */
export function especesReconstitueesALaCloture(
  especesComptees: number,
  r: Pick<ReconstitutionCaisse, 'encaissementsPosterieurs' | 'decaissementsPosterieurs'>,
): number {
  return arrondi(especesComptees - r.encaissementsPosterieurs + r.decaissementsPosterieurs);
}

/**
 * LES FENÊTRES DE LECTURE d'un comptage · ce qui est de l'exercice de la
 * campagne, et, compté après la clôture, ce qui suit. Le report à-nouveau des
 * exercices suivants (validé, provisoire, ou bilan d'ouverture importé, que
 * l'import marque `estGenereeParCloture`) n'est JAMAIS un mouvement · il
 * reprend la clôture, déjà lue sur l'exercice de la campagne.
 */
export interface Fenetres {
  exercice: Prisma.EcritureWhereInput;
  /** Toutes les opérations des exercices suivants jusqu'au jour du comptage. */
  suivants: Prisma.EcritureWhereInput | null;
  /** Celles d'entre elles faites APRÈS la clôture · les mouvements intercalés. */
  intercales: Prisma.EcritureWhereInput | null;
  /** Celles d'entre elles à date de valeur au plus tard à la clôture (d). */
  valeurAvantCloture: Prisma.EcritureWhereInput | null;
}

export function fenetresDuComptage(
  tenantId: string,
  exercice: ExerciceBorne,
  dateComptage: Date,
  idsSuivants: string[] | null,
): Fenetres {
  const apres = compteApresLaCloture(dateComptage, exercice.dateFin);
  const dansExercice: Prisma.EcritureWhereInput = apres
    ? { tenantId, exerciceId: exercice.id }
    : { tenantId, exerciceId: exercice.id, ...auPlusTardLe(dateComptage) };
  if (!apres || idsSuivants === null) return { exercice: dansExercice, suivants: null, intercales: null, valeurAvantCloture: null };
  const suivants: Prisma.EcritureWhereInput = {
    tenantId,
    exerciceId: { in: idsSuivants },
    estGenereeParCloture: false,
    estANouveauProvisoire: false,
    ...auPlusTardLe(dateComptage),
  };
  return {
    exercice: dansExercice,
    suivants,
    intercales: { AND: [suivants, apresLe(exercice.dateFin)] },
    valeurAvantCloture: { AND: [suivants, { dateValeur: { lt: lendemain(exercice.dateFin) } }] },
  };
}

/** Une ligne d'écriture d'écarts de réévaluation des devises (ligne A5). */
const HORS_ECARTS_DE_REEVALUATION: Prisma.EcritureWhereInput = { reevaluationEcarts: { is: null } };

/**
 * L'UNITÉ DE LA COMPARAISON, lue sur les lignes VALIDÉES des fenêtres · une
 * seule devise partout (écritures d'écarts de réévaluation mises à part) =
 * cette devise ; aucune = francs ; tout le reste = francs au cours historique,
 * et le PV le dit.
 */
export async function uniteDeLaCaisse(
  prisma: Client,
  compteId: string,
  fenetres: Ecr[],
): Promise<UniteComparaison> {
  const deviseIds = new Set<string | null>();
  let sansMontant = 0;
  for (const f of fenetres) {
    const ecriture = { AND: [f, { statut: StatutEcriture.VALIDEE }, HORS_ECARTS_DE_REEVALUATION] };
    const groupes = await prisma.ligneEcriture.groupBy({ by: ['deviseId'], where: { compteId, ecriture } });
    for (const g of groupes) deviseIds.add(g.deviseId ?? null);
    sansMontant += await prisma.ligneEcriture.count({
      where: { compteId, ecriture, deviseId: { not: null }, montantDevise: null },
    });
  }
  if (deviseIds.size === 0 || (deviseIds.size === 1 && deviseIds.has(null))) {
    return { mode: ModeComparaisonCaisse.FRANCS, devise: null };
  }
  const [seule] = [...deviseIds];
  if (deviseIds.size === 1 && seule !== null && sansMontant === 0) {
    const devise = await prisma.devise.findFirst({ where: { id: seule }, select: { id: true, code: true } });
    if (devise) return { mode: ModeComparaisonCaisse.DEVISE, devise };
  }
  return { mode: ModeComparaisonCaisse.FRANCS_COURS_HISTORIQUES, devise: null };
}

type Ecr = Prisma.EcritureWhereInput;

/**
 * Débits, crédits et nombre de lignes d'une fenêtre, DANS L'UNITÉ.
 *
 * En devise, le montant en devise est stocké SANS SIGNE (`ligne-en-devise.ts`)
 * et le sens vient de la ligne, débit moins crédit, règle commune avec
 * `positionDesLignes` (devises/perimetre-reevaluation.ts). Une inscription en
 * NÉGATIF (`EcritureService.lignesEnNegatif`, AUDCIF art. 20 · correction,
 * réimputation, annulation) porte un débit ou un crédit NÉGATIF et recopie le
 * montant en devise tel quel · la filtrer sur `debit > 0` laissait l'erreur
 * corrigée au solde, et le PV figeait un manquant qui n'existe pas. Débit
 * effectif = lignes au débit positif MOINS lignes au débit négatif ; crédit
 * de même. Écritures d'écarts de réévaluation à part (aucun montant en devise).
 */
export async function sommesDansLUnite(prisma: Client, compteId: string, ecriture: Ecr, unite: UniteComparaison) {
  if (unite.mode === ModeComparaisonCaisse.DEVISE) {
    const e: Ecr = { AND: [ecriture, HORS_ECARTS_DE_REEVALUATION] };
    const somme = (filtre: Prisma.LigneEcritureWhereInput) =>
      prisma.ligneEcriture
        .aggregate({ where: { compteId, ecriture: e, ...filtre }, _sum: { montantDevise: true } })
        .then((r) => Number(r._sum?.montantDevise ?? 0));
    const [dPlus, dMoins, cPlus, cMoins, n] = await Promise.all([
      somme({ debit: { gt: 0 } }),
      somme({ debit: { lt: 0 } }),
      somme({ credit: { gt: 0 } }),
      somme({ credit: { lt: 0 } }),
      prisma.ligneEcriture.count({ where: { compteId, ecriture: e } }),
    ]);
    return { debit: dPlus - dMoins, credit: cPlus - cMoins, nombre: n };
  }
  const s = await prisma.ligneEcriture.aggregate({
    where: { compteId, ecriture },
    _sum: { debit: true, credit: true },
    _count: { _all: true },
  });
  return { debit: Number(s._sum?.debit ?? 0), credit: Number(s._sum?.credit ?? 0), nombre: s._count?._all ?? 0 };
}

const valide = (e: Ecr): Ecr => ({ AND: [e, { statut: StatutEcriture.VALIDEE }] });

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

  let idsSuivants: string[] | null = null;
  if (apres) {
    const suivants = await prisma.exercice.findMany({
      where: filtreExercicesSuivants(tenantId, exercice.dateFin, dateComptage),
      select: { id: true, dateDebut: true, dateFin: true },
      orderBy: { dateDebut: 'asc' },
    });
    const couverture = exercicesDuComptage(exercice.dateFin, dateComptage, suivants);
    if ('motif' in couverture) return { lisible: false, motif: couverture.motif };
    idsSuivants = couverture.ids;
  }
  const f = fenetresDuComptage(tenantId, exercice, dateComptage, idsSuivants);

  const brouillard = async (e: Ecr) =>
    prisma.ligneEcriture.count({ where: { compteId, ecriture: { AND: [e, { statut: StatutEcriture.BROUILLARD }] } } });
  const auBrouillard = (await brouillard(f.exercice)) + (f.suivants ? await brouillard(f.suivants) : 0);
  if (auBrouillard > 0) return refusBrouillard(auBrouillard, dateComptage);

  const unite = await uniteDeLaCaisse(prisma, compteId, f.suivants ? [f.exercice, f.suivants] : [f.exercice]);
  const exerciceLu = await sommesDansLUnite(prisma, compteId, valide(f.exercice), unite);
  if (!apres || !f.intercales || !f.valeurAvantCloture) {
    return { lisible: true, soldeComptable: arrondi(exerciceLu.debit - exerciceLu.credit), unite, reconstitution: null };
  }

  const intercales = await sommesDansLUnite(prisma, compteId, valide(f.intercales), unite);
  const avant = await sommesDansLUnite(prisma, compteId, valide(f.valeurAvantCloture), unite);
  const soldeALaCloture = arrondi(exerciceLu.debit - exerciceLu.credit);
  const mouvementsValeurAvantCloture = arrondi(avant.debit - avant.credit);
  const encaissementsPosterieurs = arrondi(intercales.debit);
  const decaissementsPosterieurs = arrondi(intercales.credit);
  return {
    lisible: true,
    soldeComptable: arrondi(soldeALaCloture + mouvementsValeurAvantCloture + encaissementsPosterieurs - decaissementsPosterieurs),
    unite,
    reconstitution: {
      dateCloture: exercice.dateFin,
      soldeALaCloture,
      mouvementsValeurAvantCloture,
      encaissementsPosterieurs,
      decaissementsPosterieurs,
      mouvementsPosterieurs: intercales.nombre,
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
 * Les écritures VALIDÉES qui étaient au livre-journal à l'établissement du PV
 * (validées au plus tard ce jour-là, ou sans date de validation et créées
 * avant) · ce que le PV a lu. Le complément · ce qui a été validé DEPUIS.
 */
export function luesParLePv(e: Ecr, etabliLe: Date): Ecr {
  return {
    AND: [
      e,
      { statut: StatutEcriture.VALIDEE },
      { OR: [{ valideeAt: { lte: etabliLe } }, { valideeAt: null, createdAt: { lte: etabliLe } }] },
    ],
  };
}

export function valideesDepuisLePv(e: Ecr, etabliLe: Date): Ecr {
  return {
    AND: [
      e,
      { statut: StatutEcriture.VALIDEE },
      { OR: [{ valideeAt: { gt: etabliLe } }, { valideeAt: null, createdAt: { gt: etabliLe } }] },
    ],
  };
}

/**
 * LES MENTIONS DU PV (g et B1), écrites par le serveur, jamais recomposées à
 * l'écran. Chacune vient d'une donnée du PV.
 */
export function mentionsDuPv(pv: {
  dateComptage: Date;
  dateCloture: Date;
  mode: ModeComparaisonCaisse;
  soldeComptable: number;
  soldeALaCloture: number | null;
  mouvementsValeurAvantCloture: number | null;
  especesReconstituees: number | null;
}): string[] {
  const m: string[] = [];
  const apres = compteApresLaCloture(pv.dateComptage, pv.dateCloture);
  if (pv.mode === ModeComparaisonCaisse.FRANCS_COURS_HISTORIQUES) {
    m.push("Comparaison en francs, au cours historique de chaque mouvement · l'écart comprend l'effet de change.");
  }
  if (apres) {
    m.push("Écart constaté au jour du comptage · son rattachement à l'exercice clos ou en cours est à apprécier.");
    m.push('Solde à la clôture lu au livre-journal à l’établissement · une réévaluation passée depuis n’y figure pas.');
  } else if (jourUtc(pv.dateComptage).getTime() < jourUtc(pv.dateCloture).getTime()) {
    m.push(`Compté avant la clôture · mouvements jusqu'au ${jour(pv.dateCloture)} non reconstitués.`);
  }
  if (pv.soldeComptable < 0 || (pv.soldeALaCloture !== null && pv.soldeALaCloture < 0)) {
    m.push(
      'Solde de caisse lu créditeur · « un solde créditeur du compte caisse constitue une présomption ' +
        "d'irrégularité de la comptabilité » (fiche du compte 57).",
    );
  }
  if (pv.especesReconstituees !== null && pv.especesReconstituees < 0) {
    m.push('Espèces reconstituées à la clôture négatives · les mouvements intercalés dépassent les espèces comptées, à examiner.');
  }
  if (pv.mouvementsValeurAvantCloture !== null && pv.mouvementsValeurAvantCloture !== 0) {
    m.push(
      "Opérations de l'exercice suivant à date de valeur antérieure à la clôture · comptées au solde du jour du " +
        'comptage, hors des mouvements intercalés, à examiner.',
    );
  }
  return m;
}

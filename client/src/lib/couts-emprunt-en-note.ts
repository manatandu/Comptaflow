/**
 * LES COÛTS D'EMPRUNT INCORPORÉS, MONTRÉS AUX NOTES ANNEXES (décision D1 du
 * suivi des immobilisations, 2026-10-02).
 *
 * AUDCIF Titre VIII ch. 7, section 3 · « Les entités doivent fournir les
 * informations suivantes : le montant des coûts d'emprunt incorporés dans le
 * coût d'actifs au cours de l'exercice ; le taux de capitalisation utilisé
 * […] ». Et § 1.2 · une période de préparation inférieure à douze mois, jugée
 * significative, oblige l'entité « à justifier son choix par une mention dans
 * les notes annexes ». Le SYCEBNL y renvoie (Partie 2 ch. 3, fiche des
 * comptes 20 à 29 · « voir SYSCOHADA au titre VIII […] chapitre 7 : Coût
 * d'emprunts ») · les deux référentiels.
 *
 * AUCUNE RUBRIQUE OFFICIELLE NE LES PORTE (Titre IX ch. 6 ; SYCEBNL Partie 4) ·
 * leur place naturelle est la rubrique libre des règles et méthodes, ou celle
 * des informations complémentaires, de la note « Informations obligatoires ».
 * Ces rubriques sont en SAISIE, rédigées par le cabinet, et saisie et
 * rattachement s'excluent (CLAUDE.md § 6) · l'écran MONTRE les montants à
 * côté, en lecture seule, et n'écrit RIEN dans la saisie ni dans la note.
 * Un montant injecté d'office se déposerait sous la signature du cabinet
 * sans qu'il l'ait rédigé.
 */

/** Ce que sert `GET /immobilisations/couts-emprunt-incorpores`. */
export interface CoutsEmpruntDeLExercice {
  lignes: Array<{
    id: string;
    immobilisation: { id: string; designation: string };
    nature: 'SPECIFIQUE' | 'GENERAL';
    dateDebut: string;
    dateFin: string;
    mois: number;
    base: number;
    tauxPourcent: number;
    produitsPlacement: number;
    montant: number;
    justificationPeriodeCourte: string | null;
  }>;
  total: number;
  tronque: boolean;
}

/**
 * LA NOTE « INFORMATIONS OBLIGATOIRES » de chaque jeu · NOTE 2 au SYSCOHADA
 * (`correspondance-notes-syscohada-1.ts`) et chez les associations
 * (`correspondance-notes-associations.ts`), NOTE 1 chez les projets de
 * développement (`correspondance-notes-projets.ts`). Un même titre sous deux
 * numéros · un test relit les trois tables.
 */
export const NOTE_INFORMATIONS_OBLIGATOIRES = {
  SYSCOHADA: '2',
  ASSOCIATIONS: '2',
  PROJETS: '1',
} as const;

/** Les rubriques libres à côté desquelles l'encadré se lit, par jeu (clés des tables). */
export const RUBRIQUES_VOISINES = {
  SYSCOHADA: ['b-regles-et-methodes-comptables', 'd-informations-complementaires-relatives-au-bila'],
  ASSOCIATIONS: ['c-regles-methodes-comptables-et-derogation-aux-p', 'd-informations-complementaires-relatives-au-bila'],
  PROJETS: ['c-regles-methodes-comptables-et-derogation-aux-p', 'd-informations-complementaires-relatives-au-bila'],
} as const;

export type EtatEncadreCoutsEmprunt =
  | { type: 'chargement' }
  | { type: 'erreur'; motif: string }
  | { type: 'absent' }
  | { type: 'encadre'; lu: CoutsEmpruntDeLExercice };

/**
 * CE QUE L'ÉCRAN MONTRE · rien tant que la lecture n'est pas faite, l'échec
 * DIT (§ 9 ter · un échec tu passerait pour « rien d'incorporé », la réponse
 * favorable), et l'encadré ABSENT quand la liste LUE est vide · aucune
 * information à fournir, rien à montrer.
 */
export function etatEncadreCoutsEmprunt(lu: CoutsEmpruntDeLExercice | null, erreur: string | null): EtatEncadreCoutsEmprunt {
  if (erreur) return { type: 'erreur', motif: erreur };
  if (!lu) return { type: 'chargement' };
  if (lu.lignes.length === 0 && Math.abs(lu.total) < 0.005) return { type: 'absent' };
  return { type: 'encadre', lu };
}

/** Les justifications d'une préparation de moins de douze mois (ch. 7 § 1.2), une par bien et par texte. */
export function justificationsPeriodeCourte(
  lu: CoutsEmpruntDeLExercice,
): Array<{ designation: string; justification: string }> {
  const vues = new Set<string>();
  const sortie: Array<{ designation: string; justification: string }> = [];
  for (const l of lu.lignes) {
    const texte = l.justificationPeriodeCourte?.trim();
    if (!texte) continue;
    const cle = `${l.immobilisation.id}::${texte}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    sortie.push({ designation: l.immobilisation.designation, justification: texte });
  }
  return sortie;
}

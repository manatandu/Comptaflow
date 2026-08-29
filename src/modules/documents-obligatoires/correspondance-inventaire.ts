import { JeuEtatsFinanciersSycebnl } from '@prisma/client';

/**
 * CONTENU DU LIVRE D'INVENTAIRE · article 14 de l'Acte uniforme SYCEBNL.
 *
 * L'article énumère, jeu par jeu, les états à transcrire. Cette table les
 * reprend dans l'ORDRE DU TEXTE, sans en ajouter ni en retrancher : un livre
 * d'inventaire enrichi d'un état que l'article ne demande pas se présenterait
 * comme conforme sur un contenu qu'il a lui-même choisi, et un livre amputé
 * expose les dirigeants à la sanction pénale de l'article 24.
 *
 * ⚠️ [texte officiel] La Partie 2 ch. 2 décrit le même livre autrement : elle
 * cite, pour les projets de développement, « l'État des dépenses et des
 * ressources », là où l'article 14 point 2 en énumère CINQ (Tableau
 * emplois-ressources, Tableau d'exécution budgétaire, Tableau de
 * réconciliation de trésorerie, Bilan, Compte d'exploitation). Les deux
 * rédactions ne se recouvrent pas. C'est l'article 14 qui est retenu : il est
 * le texte légal, la Partie 2 en est l'annexe explicative.
 */

/** Clé sous laquelle l'état figé est rangé dans `TranscriptionInventaire.etats`. */
export type CleEtatInventaire =
  | 'bilan'
  | 'compteDeResultat'
  | 'tableauFluxTresorerie'
  | 'tableauEmploisRessources'
  | 'tableauExecutionBudgetaire'
  | 'tableauReconciliationTresorerie'
  | 'compteExploitation';

export interface EtatATranscrire {
  cle: CleEtatInventaire;
  /** Intitulé tel que l'article 14 le nomme. */
  libelle: string;
  /**
   * `false` quand le logiciel ne produit pas encore cet état. La
   * transcription le déclare alors MANQUANT au lieu de se présenter comme
   * complète · c'est l'exposition à l'article 24 qui devient lisible, plutôt
   * qu'une omission silencieuse.
   */
  disponible: boolean;
  /** Motif de l'indisponibilité, à afficher tel quel au dossier. */
  motifIndisponibilite?: string;
}

const NON_CONSTRUIT = (article: string) =>
  `État exigé par l'article 14 mais non encore produit par OmegaX (${article}). Il doit être établi hors application et joint au livre d'inventaire tant que cette lacune subsiste.`;

/** Art. 14, point 1 · associations et ordres professionnels. */
export const ETATS_INVENTAIRE_ASSOCIATIONS: EtatATranscrire[] = [
  { cle: 'bilan', libelle: 'Bilan', disponible: true },
  { cle: 'compteDeResultat', libelle: 'Compte de résultat', disponible: true },
  { cle: 'tableauFluxTresorerie', libelle: 'Tableau des flux de trésorerie', disponible: true },
];

/** Art. 14, point 2 · entités gérant ou administrant des projets de développement. */
export const ETATS_INVENTAIRE_PROJETS: EtatATranscrire[] = [
  {
    cle: 'tableauEmploisRessources',
    libelle: 'Tableau emplois-ressources',
    disponible: false,
    motifIndisponibilite: NON_CONSTRUIT('Partie 4 ch. 3, codes FA à GZ'),
  },
  {
    cle: 'tableauExecutionBudgetaire',
    libelle: "Tableau d'exécution budgétaire",
    disponible: false,
    motifIndisponibilite: NON_CONSTRUIT('Partie 4 ch. 3 ; suppose la brique budgétaire'),
  },
  {
    cle: 'tableauReconciliationTresorerie',
    libelle: 'Tableau de réconciliation de trésorerie',
    disponible: false,
    motifIndisponibilite: NON_CONSTRUIT('Partie 4 ch. 3, codes A à I'),
  },
  { cle: 'bilan', libelle: 'Bilan', disponible: true },
  { cle: 'compteExploitation', libelle: "Compte d'exploitation", disponible: true },
];

/**
 * Système Minimal de Trésorerie.
 *
 * ⚠️ L'article 14 NE NOMME PAS le S.M.T : il n'énumère que deux cas, les
 * associations et ordres professionnels (point 1) et les entités gérant des
 * projets de développement (point 2). C'est cohérent avec l'économie du
 * texte · le S.M.T (art. 5 et 6) est un régime de PRÉSENTATION lié à la
 * taille, pas un type d'entité, et une petite association reste une
 * association.
 *
 * Le contenu retenu ici est donc celui du point 1 RESTREINT à ce que le
 * chapitre 4 produit réellement : le Bilan et le Compte de résultat. Le
 * Tableau des flux de trésorerie en est écarté · la Partie 4, ch. 1 § 4 pose
 * qu'il est « un état financier spécifique aux associations et ordres
 * professionnels » du Système normal, et le jeu du S.M.T ne le comporte pas.
 * Sa place est tenue par le journal unique de trésorerie (Note 4).
 *
 * Ce choix est une lecture, pas une transcription : il est écrit ici pour
 * pouvoir être discuté, et non enfoui dans un ternaire.
 */
export const ETATS_INVENTAIRE_SMT: EtatATranscrire[] = [
  { cle: 'bilan', libelle: 'Bilan', disponible: true },
  { cle: 'compteDeResultat', libelle: 'Compte de résultat', disponible: true },
];

export function etatsExigesPar(jeu: JeuEtatsFinanciersSycebnl): EtatATranscrire[] {
  switch (jeu) {
    case JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT:
      return ETATS_INVENTAIRE_PROJETS;
    case JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE:
      return ETATS_INVENTAIRE_SMT;
    default:
      return ETATS_INVENTAIRE_ASSOCIATIONS;
  }
}

/**
 * SECTIONS DU RAPPORT D'ACTIVITÉ · article 16, point 3.
 *
 * Le texte en énumère quatre, dans cet ordre. Elles sont transcrites ici
 * telles quelles, avec la citation qui fonde chacune : c'est ce qui permet à
 * l'écran comme à l'export de dire, section par section, ce que le texte
 * exige · et de signaler une section vide sans avoir à en juger le contenu.
 */
export interface SectionRapportActivite {
  cle: 'situationExerciceEcoule' | 'perspectivesDeveloppement' | 'evolutionTresorerie' | 'evenementsPosterieurs';
  titre: string;
  exigence: string;
}

export const SECTIONS_RAPPORT_ACTIVITE: SectionRapportActivite[] = [
  {
    cle: 'situationExerciceEcoule',
    titre: "Situation de l'entité durant l'exercice écoulé",
    exigence: "Art. 16-3 : « le rapport d'activité expose la situation de l'entité durant l'exercice écoulé ».",
  },
  {
    cle: 'perspectivesDeveloppement',
    titre: 'Perspectives de développement ou évolution prévisible',
    exigence: "Art. 16-3 : « ses perspectives de développement ou son évolution prévisible ».",
  },
  {
    cle: 'evolutionTresorerie',
    titre: 'Évolution de la situation de trésorerie',
    exigence: "Art. 16-3 : « et l'évolution de la situation de trésorerie ».",
  },
  {
    cle: 'evenementsPosterieurs',
    titre: 'Événements importants postérieurs à la clôture',
    exigence:
      "Art. 16-3 : « les événements importants, survenus entre la date de clôture de l'exercice et la date à laquelle il est établi, doivent également y être mentionnés ».",
  },
];

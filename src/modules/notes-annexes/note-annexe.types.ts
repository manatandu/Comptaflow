/**
 * Moteur de NOTES ANNEXES SYCEBNL — types et contrat déclaratif.
 *
 * Le référentiel compte 76 tableaux de notes (45 pour le jeu associations,
 * 26 pour les projets de développement, 5 pour le Système minimal de
 * trésorerie). Les traiter un par un en code serait absurde : la très grande
 * majorité partage une même ossature — des rubriques en lignes, des colonnes
 * Année N / Année N-1 / variations. D'où ce moteur déclaratif : une note = une
 * DONNÉE (voir `correspondance-notes-*.ts`), pas du code.
 *
 * ## Différence essentielle avec le bilan et le compte de résultat
 *
 * Le texte officiel fournit un tableau de correspondance poste → comptes pour
 * le bilan et le compte de résultat (Partie 4, section 6). **Il n'en fournit
 * AUCUN pour les notes** : celles-ci n'énumèrent que des libellés de rubriques.
 *
 * Pire, ces libellés réclament souvent une granularité que le plan de comptes
 * normalisé ne porte pas. Exemple relevé au dépouillement du 2026-08-28 : la
 * Note 24 « Achats » veut des lignes distinctes pour « Matières consommables »,
 * « Matières combustibles », « Produits d'entretien », « Eau », « Électricité »,
 * « Fourniture de bureau »… alors que le plan SYCEBNL s'arrête au compte 604
 * « Achats stockés de matières et fournitures consommables », sans subdivision.
 * Et un rapprochement naïf par libellé serait pire que rien : « Matières
 * consommables » existe bien au plan — en compte 331, qui est un compte de
 * STOCK, pas d'achat.
 *
 * Conséquence de conception, assumée et documentée plutôt que masquée :
 *
 * 1. `comptes` porte le rattachement lorsqu'il est **déductible sans jugement**
 *    (la rubrique correspond à un compte du plan normalisé, sans ambiguïté).
 * 2. `subdivisionAttendue` signale les rubriques qui exigent que le dossier ait
 *    créé ses propres sous-comptes. La note reste alors vide pour ce dossier
 *    tant que le rattachement n'a pas été fait — et le dit, au lieu d'afficher
 *    un zéro trompeur.
 * 3. Le rattachement par dossier (à venir : `RattachementNote`) permettra à
 *    l'utilisateur d'affecter ses propres sous-comptes à une rubrique.
 *
 * Aucune rubrique n'est rattachée « au jugé » : ou le texte et le plan la
 * déterminent, ou elle est déclarée en attente de rattachement.
 */

/** Ce qu'une colonne de note affiche. */
export type TypeColonneNote =
  | 'EXERCICE_N'
  | 'EXERCICE_N1'
  | 'VARIATION_VALEUR' // N − N-1
  | 'VARIATION_POURCENT' // (N − N-1) / |N-1|
  | 'ECHEANCE_1AN' // « à un an au plus »
  | 'ECHEANCE_2ANS' // « à plus d'un an et à deux ans au plus »
  | 'ECHEANCE_PLUS_2ANS' // « à plus de deux ans »
  | 'LIBRE'; // colonne renseignée hors comptabilité (devises, échéances, cours…)

export interface ColonneNote {
  type: TypeColonneNote;
  /** Intitulé exact du texte officiel. */
  libelle: string;
}

/**
 * D'où vient le montant d'une rubrique.
 * - `SOLDE` : solde de fin de période (le cas courant, notes de bilan).
 * - `MOUVEMENT_DEBIT` / `MOUVEMENT_CREDIT` : cumul des mouvements de la période
 *   (notes de charges et de produits, et tableau emplois-ressources).
 */
export type SourceMontantNote = 'SOLDE' | 'MOUVEMENT_DEBIT' | 'MOUVEMENT_CREDIT';

/** Restreint une rubrique aux comptes dont le solde va dans ce sens (tiers polyvalents). */
export type SensRubrique = 'DEBITEUR' | 'CREDITEUR';

export interface RubriqueNote {
  libelle: string;
  /**
   * Préfixes de comptes, même convention que les tableaux de correspondance du
   * bilan : un jeton de 2 chiffres englobe ses divisionnaires, un jeton plus
   * long ne vaut que pour lui-même et ses subdivisions.
   */
  comptes?: string[];
  exclusions?: string[];
  sens?: SensRubrique;
  source?: SourceMontantNote;
  /**
   * Présentation en négatif : les dépréciations et les comptes créditeurs
   * intercalés dans une note d'actif sont affichés en soustraction, comme le
   * fait la maquette officielle.
   */
  presenterEnNegatif?: boolean;
  /** Ligne de total : somme des rubriques dont l'index est listé ici. */
  totalDeRubriques?: number[];
  /**
   * Rubrique dont le rattachement suppose que le dossier ait créé ses propres
   * sous-comptes (le plan normalisé n'a pas cette granularité). Le texte de ce
   * champ explique ce qui est attendu ; il est montré à l'utilisateur.
   */
  subdivisionAttendue?: string;
  /** Renvoi de bas de tableau du texte officiel, reproduit tel quel. */
  renvoi?: string;
}

export interface SpecificationNote {
  /** Code officiel : « 8 », « 5A », « 29B ». */
  code: string;
  titre: string;
  colonnes: ColonneNote[];
  rubriques: RubriqueNote[];
  /** Le commentaire officiel de bas de note, reproduit mot pour mot. */
  commentaire?: string;
  /**
   * Article 15 : « les Notes annexes sont organisées par une référence croisée
   * avec l'information liée ». Codes REF des postes d'état qui renvoient ici.
   */
  renvoyeeDepuis?: string[];
  /**
   * Note dont le contenu ne se calcule pas depuis la balance (effectifs,
   * informations sociales et environnementales, engagements…). Le moteur la
   * présente en saisie, sans inventer de chiffre.
   */
  horsBalance?: boolean;
}

// --------------------------------------------------------------------------
// Résultat calculé
// --------------------------------------------------------------------------

export interface CompteDeRubrique {
  numero: string;
  intitule: string;
  montant: number;
}

export interface LigneNoteCalculee {
  libelle: string;
  montantN: number;
  montantN1?: number;
  variationValeur?: number;
  /** `undefined` quand N-1 est nul ou absent : une variation en % n'a alors pas de sens. */
  variationPourcent?: number;
  estTotal: boolean;
  /** Rubrique en attente d'un rattachement de sous-comptes propre au dossier. */
  enAttenteDeRattachement?: string;
  comptes: CompteDeRubrique[];
  renvoi?: string;
}

export interface NoteCalculee {
  code: string;
  titre: string;
  colonnes: ColonneNote[];
  lignes: LigneNoteCalculee[];
  commentaire?: string;
  renvoyeeDepuis?: string[];
  horsBalance: boolean;
  exerciceN1Disponible: boolean;
  /**
   * Article 24 de l'Acte uniforme (fiche récapitulative) : une note dont
   * aucune ligne n'est chiffrée est « non applicable » et, en vertu du § 1.4
   * de la Partie 4, ne doit pas être présentée.
   */
  applicable: boolean;
  /** Rubriques que ce dossier ne peut pas alimenter faute de sous-comptes. */
  rubriquesEnAttente: string[];
}

/**
 * ÉCRITURES-TYPES DES OPÉRATIONS SPÉCIFIQUES AUX EBNL
 * Partie 3 du référentiel SYCEBNL + Guide d'application (22 cas chiffrés).
 *
 * Ce que ce module est, et ce qu'il n'est pas.
 *
 * Il N'EST PAS un moteur de règles qui déciderait à la place du comptable.
 * Chaque modèle ci-dessous PROPOSE une écriture ; c'est le service
 * `EcritureService` et lui seul qui l'enregistre, avec ses contrôles
 * habituels (équilibre, exercice ouvert, comptes du dossier, verrous de
 * période). Une écriture issue d'un modèle est une écriture ordinaire : elle
 * se corrige, se lettre et se rapproche comme les autres.
 *
 * Il EST le catalogue des opérations que le référentiel décrit et qu'aucun
 * logiciel généraliste ne porte : fonds affectés, dons en nature, cotisations,
 * mécénat, contributions volontaires, fonds de bailleur. Chaque modèle porte
 * sa source · chapitre de la Partie 3 et, quand elle existe, l'application
 * chiffrée du Guide qui sert de test.
 *
 * ## Deux niveaux de numérotation, à ne pas confondre
 *
 * Le PLAN DES COMPTES (Partie 2 ch. 2) s'arrête à un certain niveau de détail
 * · par exemple `605 Autres achats`, `475 Générosités financières à recevoir`.
 * Le GUIDE, lui, écrit parfois un cran plus bas (`6055`, `4751`) : ce sont des
 * subdivisions que le dossier crée s'il le souhaite, PAS des comptes du plan
 * normalisé. Les modèles visent donc TOUJOURS le niveau du plan : c'est le
 * seul niveau dont l'existence est garantie dans tout dossier. Viser le niveau
 * du Guide rendrait la moitié des modèles inapplicables sur un plan standard.
 */

/**
 * Comment le montant d'une ligne se déduit des paramètres saisis.
 *
 * Quatre modes, chacun tiré d'un cas réel du Guide · et pas un de plus : un
 * moteur de formules générique serait invérifiable, alors que ces quatre-là se
 * testent contre les chiffres officiels.
 */
export type ModeMontant =
  /** Le paramètre tel quel. Ex. App. 12 : les frais de recherche de fonds. */
  | { mode: 'PARAMETRE'; parametre: string }
  /**
   * Le paramètre × un taux. Le taux est soit fixe (le texte le donne), soit
   * le nom d'un autre paramètre (le dossier le saisit).
   * Ex. App. 2 : « 15 % = dépôt restituable, 10 % = appel de cotisations ».
   */
  | { mode: 'PROPORTION'; parametre: string; taux: number | string }
  /**
   * Ce qu'il reste pour équilibrer l'écriture · au plus UN par modèle.
   * Ex. App. 2 : « le solde = droit d'entrée », soit 50 M − 15 % − 10 %.
   * Calculé, jamais saisi : le saisir laisserait passer un déséquilibre.
   */
  | { mode: 'COMPLEMENT' }
  /**
   * Annuité : montant ÷ durée × mois ÷ 12. Couvre l'amortissement et la
   * reprise au même rythme, avec ou sans prorata temporis.
   * Ex. App. 5 : « 400 000 000 × 1/30 × 9/12 ». App. 3, reprise du terrain :
   * « 1/10 par exercice, SANS prorata temporis » → mois omis, donc 12/12.
   */
  | { mode: 'ANNUITE'; parametre: string; parametreDuree: string; parametreMois?: string };

export type SensLigne = 'DEBIT' | 'CREDIT';

export interface LigneModele {
  /**
   * Préfixe de compte AU NIVEAU DU PLAN (voir l'en-tête). Le service résout
   * le compte Détail du dossier qui commence par ce préfixe.
   */
  compte: string;
  /**
   * Sous-préfixes à écarter, quand la racine désigne plus large que
   * l'opération. Ex. le don en nature H.A.O. vise 8311 ET 8315, tous deux
   * sous la racine 831 · mais pas 8310 « Charges H.A.O. constatées », qui est
   * un autre compte. Sans cette exclusion, le choix proposé au dossier
   * contiendrait un compte étranger à l'opération.
   */
  exclusions?: string[];
  libelle: string;
  sens: SensLigne;
  montant: ModeMontant;
  /**
   * `true` quand plusieurs comptes du dossier peuvent légitimement convenir
   * et que le texte ne tranche pas · une banque parmi plusieurs, le compte
   * d'immobilisation correspondant au bien reçu. L'utilisateur choisit alors
   * dans la liste des comptes sous ce préfixe. Choisir d'office le premier
   * imputerait au hasard.
   */
  auChoix?: boolean;
  /** Précision de lecture, affichée à côté de la ligne. */
  note?: string;
}

export type TypeParametre = 'MONTANT' | 'TAUX' | 'DUREE_ANNEES' | 'MOIS';

export interface ParametreModele {
  nom: string;
  libelle: string;
  type: TypeParametre;
  /** Valeur proposée quand le texte la fixe (ex. reprise sur 10 ans, art. 3). */
  defaut?: number;
  aide?: string;
}

/**
 * Une écriture-type : les comptes et les sens sont FIGÉS par le référentiel,
 * seuls les montants varient. C'est exactement l'inverse d'une saisie libre,
 * et c'est ce qui permet de la tester contre les chiffres du Guide.
 */
export interface ModeleEcriture {
  code: string;
  libelle: string;
  /** Ce que l'écriture constate, en une phrase · affiché avant la saisie. */
  objet: string;
  /** Citation du référentiel qui fonde l'écriture. Jamais de mémoire. */
  source: string;
  /** Application chiffrée du Guide qui sert de test, quand elle existe. */
  applicationGuide?: string;
  parametres: ParametreModele[];
  lignes: LigneModele[];
  /**
   * Anomalie du texte officiel touchant CE modèle, signalée et non corrigée
   * silencieusement (règle §2.6). Remontée jusqu'à l'écran.
   */
  anomalie?: string;
  /**
   * Écriture d'inventaire à extourner à l'ouverture de l'exercice suivant.
   * Le référentiel le dit expressément pour les dons en nature (Partie 3
   * ch. 4 § 1.2 : « les écritures de fin d'exercice doivent être extournées
   * au début de l'exercice suivant ») · le taire ferait porter deux fois la
   * même régularisation.
   */
  aExtourner?: boolean;
}

/** Le jeu d'états financiers auquel l'opération se rattache. */
export type PorteeOperation = 'ASSOCIATIONS' | 'PROJETS' | 'TOUS';

export interface OperationSpecifique {
  /** Code du plan de complétude (docs/plan-sycebnl-complet.md, bloc B). */
  code: string;
  libelle: string;
  source: string;
  portee: PorteeOperation;
  modeles: ModeleEcriture[];
  /**
   * Politique de dossier que l'opération suppose et que le TEXTE laisse
   * ouverte · à exposer, jamais à trancher d'office. Ex. B6 : la cotisation
   * se constate-t-elle à l'appel ou à l'encaissement ?
   */
  politiqueADecider?: string;
}

// ---------------------------------------------------------------------------
// Résultat de la résolution
// ---------------------------------------------------------------------------

export interface LigneProposee {
  compteId: string | null;
  numero: string;
  intitule: string;
  libelle: string;
  debit: number;
  credit: number;
  note?: string;
  /** Le dossier doit choisir le compte : plusieurs conviennent sous ce préfixe. */
  choixRequis?: { racine: string; candidats: { id: string; numero: string; intitule: string }[] };
}

export interface EcritureProposee {
  modele: string;
  libelle: string;
  objet: string;
  source: string;
  applicationGuide?: string;
  anomalie?: string;
  aExtourner?: boolean;
  lignes: LigneProposee[];
  totalDebit: number;
  totalCredit: number;
  equilibree: boolean;
  /** Comptes du plan que le dossier ne possède pas · le modèle est inapplicable. */
  comptesIntrouvables: { compte: string; libelle: string }[];
}

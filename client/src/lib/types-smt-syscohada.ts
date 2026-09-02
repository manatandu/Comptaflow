import type { CompteDuPoste } from './types';

/**
 * FORMES DE RETOUR DU JEU « SYSTÈME MINIMAL DE TRÉSORERIE » DU SYSCOHADA
 * RÉVISÉ · routes `/etats-financiers-syscohada/smt/...`, servies par
 * `EtatsFinanciersSmtSyscohadaService` (AUDCIF Titre X, ch. 1 à 3).
 *
 * Fichier SÉPARÉ de `types.ts`, et non un ajout dedans, pour deux raisons :
 *
 *  - le cloisonnement des deux référentiels (CLAUDE.md §6). Les types SMT
 *    du SYCEBNL (`BilanSmt`, `CompteDeResultatSmt`, `NotesSmt`…) décrivent
 *    d'AUTRES postes, d'AUTRES notes et d'AUTRES seuils : cinq catégories de
 *    ressources plafonnées à trente millions chacune d'un côté (SYCEBNL
 *    art. 6), trois seuils de chiffre d'affaires de l'autre (AUDCIF art. 13).
 *    Les faire cohabiter dans un même fichier, sous des noms voisins, est la
 *    voie la plus courte vers un écran qui affiche les postes de l'autre
 *    référentiel ;
 *  - `types.ts` est un fichier partagé par tout le client · l'y étendre
 *    pendant que d'autres écrans s'écrivent en parallèle écraserait leur
 *    travail.
 *
 * SEUL emprunt à `types.ts` : `CompteDuPoste`, qui n'est pas une notion
 * comptable mais la forme technique d'un compte cité sous un poste
 * (numéro, intitulé, montant) · exactement ce que le serveur partage entre
 * les deux référentiels dans `etats-financiers.communs.ts`. Aucun poste,
 * aucun libellé, aucun seuil n'est repris du SYCEBNL.
 *
 * Les dates sont des chaînes ISO : elles ont traversé JSON.
 */

/**
 * Un poste résolu du jeu SMT, bilan comme compte de résultat.
 *
 * `note` porte le renvoi que les DEUX maquettes du ch. 2 impriment en
 * colonne « Note » (le jeu SMT du SYCEBNL ne l'a qu'au bilan).
 * `lettre` n'existe que sur les lignes que la maquette du compte de résultat
 * étiquette (A, B, C, F, G) ; `signeOfficiel` que sur les trois lignes de
 * variation, dont la maquette imprime l'opérateur devant le libellé.
 */
export interface PosteSmtSyscohada {
  ref: string;
  libelle: string;
  note: string | null;
  montant: number;
  /** Colonne « Montant Exercice N-1 » · undefined quand il n'y a pas d'exercice antérieur. */
  montantN1?: number;
  comptes: CompteDuPoste[];
  estTotal?: boolean;
  lettre?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  signeOfficiel?: 1 | -1;
}

/**
 * BILAN SMT au 31 décembre N (Titre X ch. 2 § 1), postes SA1 à SAZ et SP1
 * à SPZ.
 *
 * `comptesNonRattaches` porte les comptes de bilan qu'aucun poste ne capte.
 * Il n'est jamais masqué à l'écran : c'est lui qui explique un déséquilibre
 * plutôt que de le laisser sans cause.
 */
export interface BilanSmtSyscohada {
  actif: PosteSmtSyscohada[];
  passif: PosteSmtSyscohada[];
  totalActif: number;
  totalPassif: number;
  totalActifN1?: number;
  totalPassifN1?: number;
  exerciceN1Disponible: boolean;
  equilibre: boolean;
  comptesNonRattaches: CompteDuPoste[];
  /** Renvoi (1) imprimé sous l'actif de la maquette officielle. */
  renvoiImmobilisations: string;
  controle: {
    /** Résultat lu dans les classes 6, 7 et 8 · avant écriture de clôture. */
    resultatClasses678: number;
    /** Résultat lu au compte 13 · après écriture de clôture. */
    resultatCompte13: number;
    /** Les deux sources sont servies en même temps : le résultat serait compté deux fois. */
    doubleComptageProbable: boolean;
  };
}

/**
 * Un encaissement ou un décaissement que le compte de résultat SMT n'a
 * aucune ligne pour recevoir : financement (classe 1) ou investissement
 * (classe 2). Le Titre X ch. 1 § 1 les range parmi les quatre éléments de
 * l'inventaire extra-comptable de fin d'exercice, d'où leur affichage à
 * part · ils ne corrigent PAS le résultat, qui est juste sans eux.
 */
export interface RubriqueHorsResultatSmtSyscohada {
  cle: string;
  intitule: string;
  montant: number;
  comptes: CompteDuPoste[];
}

/**
 * COMPTE DE RÉSULTAT SMT au 31 décembre N (Titre X ch. 2 § 2).
 *
 * `lignes` est la maquette dans son ordre d'impression, totaux compris ;
 * les autres champs servent les encadrés de contrôle sous le tableau.
 */
export interface CompteDeResultatSmtSyscohada {
  lignes: PosteSmtSyscohada[];
  recettes: PosteSmtSyscohada[];
  totalRecettes: number;
  depenses: PosteSmtSyscohada[];
  totalDepenses: number;
  /** C = A - B · solde de trésorerie, excédent ou insuffisance de recettes. */
  soldeCaisse: number;
  /** Les trois variations d'inventaire et la ligne F. */
  retraitements: PosteSmtSyscohada[];
  /** Lettres de la formule G = C - D + E - F, que la maquette invoque sans les attribuer. */
  lettres: { D: number; E: number; F: number };
  /** Quelles lignes de variation composent D et E · lecture fixée par la table de correspondance. */
  lettresDE: { D: readonly string[]; E: readonly string[] };
  /** Sens retenu pour « Variation N / N-1 » · 'N1_MOINS_N', convention du compte 603. */
  definitionVariation: string;
  /** G · reporté au poste « Résultat exercice » du passif du bilan. */
  resultatExercice: number;
  exerciceN1Disponible: boolean;
  fluxHorsResultat: RubriqueHorsResultatSmtSyscohada[];
  /** Contrepartie ni en A/B, ni en classe 1 ou 2 · signalée, jamais rattachée d'office. */
  contrepartiesNonRattachees: CompteDuPoste[];
  controle: {
    /** Poste « Résultat exercice » du bilan, l'autre chemin vers le même nombre. */
    resultatBilan: number;
    ecart: number;
    concordant: boolean;
    /** Décomposition attendue de l'écart · voir le service, qui en donne la démonstration. */
    composantesEcart: {
      classe1: number;
      classe2: number;
      depreciationsTresorerie: number;
      autresComptes: number;
      dotations: number;
      total: number;
    };
    /** Part que la décomposition n'explique pas · doit être nulle. */
    residuel: number;
  };
}

/** Une colonne de ventilation de la NOTE 4 · le NB officiel autorise des rajouts. */
export interface ColonneVentilationSmtSyscohada {
  cle: string;
  libelle: string;
  rajoutAutorise: boolean;
}

export interface OperationTresorerieSmtSyscohada {
  date: string;
  libelle: string;
  reference: string | null;
  sens: 'RECETTE' | 'DEPENSE';
  recette: number;
  depense: number;
  solde: number;
  /** Déplacement entre deux comptes de l'entité : ni recette ni dépense, mais bien un mouvement du compte. */
  virementInterne: boolean;
  /** Une seule caisse ou banque touchée : la ventilation est attribuable sans clé de répartition. */
  ventile: boolean;
  ventilation: Record<string, number>;
}

/** Un journal par banque et un journal pour la caisse · NB officiel de la NOTE 4. */
export interface JournalTresorerieSmtSyscohada {
  compteId: string;
  numero: string;
  intitule: string;
  reportANouveau: number;
  operations: OperationTresorerieSmtSyscohada[];
  soldeAReporter: number;
  totalRecettes: number;
  totalDepenses: number;
  lignesNonVentilees: number;
  /** Solde du compte à la balance · le journal boucle quand il l'égale. */
  soldeBalance: number;
  boucle: boolean;
}

export interface Note4SmtSyscohada {
  journaux: JournalTresorerieSmtSyscohada[];
  colonnesRecettes: ColonneVentilationSmtSyscohada[];
  colonnesDepenses: ColonneVentilationSmtSyscohada[];
  /** NB officiel imprimé sous le journal. */
  nb: string;
}

/** Sous-tableau d'une note qui en compte plusieurs · la NOTE 3 en a deux. */
export interface SousTableauNoteSmtSyscohada {
  cle: string;
  intitule: string;
  colonnes: string[];
  ligneTotal: string;
}

export interface NoteSmtSyscohadaDeclaree {
  numero: number;
  intitule: string;
  partie: 'BILAN' | 'COMPTE_DE_RESULTAT';
  /** null quand la note est faite de plusieurs tableaux, qui portent alors chacun les leurs. */
  colonnes: string[] | null;
  sousTableaux?: SousTableauNoteSmtSyscohada[];
}

/**
 * Structure officielle du jeu · les trois documents du ch. 1 § 2, les
 * quatre notes du ch. 3, les deux journaux de suivi (pièces de base, non
 * numérotées comme notes) et les quatre éléments de l'inventaire
 * extra-comptable de fin d'exercice.
 */
export interface FicheSmtSyscohada {
  documents: readonly string[];
  notes: NoteSmtSyscohadaDeclaree[];
  journauxDeSuivi: readonly { cle: string; intitule: string; colonnes: readonly string[] }[];
  inventaireExtraComptable: readonly string[];
  /** « Mode linéaire sans prorata temporis » · règle propre au SMT (ch. 1 § 1). */
  amortissement: { mode: string; prorataTemporis: boolean };
}

/**
 * Une ligne de la NOTE 1. `origine` distingue les biens tenus au registre
 * des immobilisations de ce que le titre officiel appelle « les cautions »,
 * repris depuis le solde du compte de dépôts et cautionnements versés : ces
 * dernières n'ont ni date d'entrée ni prix de cession.
 */
export interface LigneNote1SmtSyscohada {
  origine: 'REGISTRE' | 'BALANCE';
  date: string | null;
  designation: string;
  montant: number;
  dateSortie: string | null;
  prixCession: number | null;
}

export interface LigneNote2SmtSyscohada {
  reference: string;
  designation: string;
  /** Colonnes de la maquette qu'aucune donnée comptable ne sert · inventaire extra-comptable. */
  quantite: number | null;
  prixUnitaire: number | null;
  montant: number;
}

export interface LigneNote3SmtSyscohada {
  /** Colonne « Date » de la maquette · sans équivalent au niveau d'un compte de tiers. */
  date: string | null;
  numero: string;
  nom: string;
  montantCloture: number;
  montantOuverture: number;
  /** Ce qui alimente réellement les lignes de variation du compte de résultat. */
  variationValeur: number;
  /** Colonne officielle « Variation % » · null quand l'ouverture est nulle. */
  variationPourcent: number | null;
}

export interface NotesSmtSyscohada {
  fiche: FicheSmtSyscohada;
  note1: {
    lignes: LigneNote1SmtSyscohada[];
    total: number;
    totalRegistre: number;
    totalCautions: number;
    amortissement: { mode: string; prorataTemporis: boolean };
    motifCautions: string;
  };
  note2: {
    lignes: LigneNote2SmtSyscohada[];
    /** Les deux lignes de synthèse du bas de tableau, transcrites. */
    lignesSynthese: readonly string[];
    valeurStockFinal: number;
    valeurStockInitial: number;
    /** Ce que la note verse à la ligne de variation des stocks du compte de résultat. */
    variationSv1: number;
    quantitesTenues: boolean;
    motifQuantites: string;
  };
  note3: {
    creances: LigneNote3SmtSyscohada[];
    totalCreances: number;
    dettes: LigneNote3SmtSyscohada[];
    totalDettes: number;
    variationSv2: number;
    variationSv3: number;
    /** Anomalie du texte officiel : « la variation en pourcentage » alimenterait le compte de résultat. */
    reserveVariationPourcent: string;
  };
}

/** Un des trois seuils de l'art. 13, avec sa clause d'équivalence monétaire. */
export interface SeuilSmtSyscohada {
  cle: 'negoce' | 'artisanat' | 'services';
  categorie: string;
  montantFcfa: number;
  clause: string;
  /** Comparaison brute, monnaie de tenue contre F CFA · n'est une conclusion que si le dossier est tenu en F CFA. */
  souSeuilSiMemeMonnaie: boolean;
}

/**
 * CONTRÔLE D'ÉLIGIBILITÉ AU SMT · AUDCIF art. 11 et 13. Le retour ne
 * TRANCHE pas : la qualification de l'activité (négoce, artisanat,
 * services) appartient à l'entité, et les seuils sont en F CFA quand le
 * dossier tient ses comptes dans une autre monnaie.
 */
export interface EligibiliteSmtSyscohada {
  exercice: { dateDebut: string; dateFin: string };
  /** Chiffre d'affaires hors taxes, lu en solde (montant facturé), pas en encaissements. */
  chiffreAffaires: number;
  /** Détail par les quatre postes du Système normal dont le chiffre d'affaires est la somme. */
  ventilation: { ref: string; libelle: string; lettre?: string; montant: number; comptes: CompteDuPoste[] }[];
  comptesHorsVentilation: CompteDuPoste[];
  deviseDossier: string | null;
  systemeActuel: 'NORMAL' | 'MINIMAL_TRESORERIE' | null;
  /** Toujours faux · le cours de conversion n'appartient pas au texte comptable. */
  conversionAppliquee: boolean;
  seuils: SeuilSmtSyscohada[];
  qualificationParLEntite: string;
  rappelArticle11: string;
  avertissementConversion: string;
}

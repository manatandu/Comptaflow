/**
 * TYPES DES ÉTATS FINANCIERS SYSCOHADA · Système normal (AUDCIF Titre IX).
 *
 * Fichier SÉPARÉ de `types.ts` et non une rallonge de celui-ci : les deux
 * référentiels ne partagent ni postes, ni comptes, ni colonnes (CLAUDE.md §6),
 * et un type nommé `LigneBilan` qui servirait aux deux finirait par recevoir
 * les champs de l'un dans l'écran de l'autre. Les noms portent donc tous le
 * suffixe `Syscohada`, comme côté serveur.
 *
 * Ce sont les formes de retour de
 * `src/modules/etats-financiers-syscohada/etats-financiers-syscohada.service.ts`,
 * recopiées à l'identique : toute divergence se corrige EN FACE du serveur,
 * jamais ici, sinon le client afficherait un champ que la route ne sert pas.
 * Aucune règle comptable ne vit dans ce fichier · seulement des formes.
 */

/** Compte qui alimente un poste · sert le drill-down poste par poste. */
export interface CompteDuPosteSyscohada {
  numero: string;
  intitule: string;
  montant: number;
}

/**
 * Ligne de bilan. `brut` et `amortissement` ne sont servis QUE côté actif :
 * le modèle du Titre IX ch. 3 section 2 donne à l'actif les colonnes
 * « BRUT · AMORT. et DÉPREC. · NET » et au passif la seule colonne « NET ».
 * `amortissement` est une magnitude positive, `montant` (net) = brut −
 * amortissement · l'écran l'imprime entre parenthèses, il ne le re-négative
 * pas.
 *
 * `note` est le renvoi de la colonne NOTE du modèle (« 3e » sur CE) et
 * `renvoi` le renvoi de bas de poste (« dont Placement en Net » sur AJ et
 * AK) : deux chaînes d'affichage, aucune valeur calculée.
 */
export interface LigneBilanSyscohada {
  ref: string;
  libelle: string;
  montant: number;
  montantN1?: number;
  brut?: number;
  brutN1?: number;
  amortissement?: number;
  amortissementN1?: number;
  estTotal: boolean;
  comptes: CompteDuPosteSyscohada[];
  note?: string;
  renvoi?: string;
}

export interface BilanSyscohada {
  actif: LigneBilanSyscohada[];
  passif: LigneBilanSyscohada[];
  totalActif: number;
  totalPassif: number;
  totalActifN1?: number;
  totalPassifN1?: number;
  exerciceN1Disponible: boolean;
  equilibre: boolean;
  comptesNonRattaches: CompteDuPosteSyscohada[];
  controle: {
    resultatClasses678: number;
    resultatCompte13: number;
    doubleComptageProbable: boolean;
  };
}

/**
 * Ligne du compte de résultat en liste. Les postes de base (TA à RS) et les
 * neuf lignes X* sont dans la MÊME liste, comme le modèle du ch. 4 les
 * entrelace ; `estSolde` distingue les secondes et `formuleOfficielle` porte
 * alors la formule telle qu'imprimée (« Somme TA à RB »).
 *
 * `montant` est SIGNÉ selon la logique de signe du ch. 4 section 2 : « les
 * postes de charges (préfixe R) sont saisis en négatif ; les formules de
 * totalisation sont des sommes, jamais des différences ». Une charge arrive
 * donc négative et s'affiche telle quelle.
 */
export interface LigneCompteResultatSyscohada {
  ref: string;
  libelle: string;
  montant: number;
  montantN1?: number;
  comptes: CompteDuPosteSyscohada[];
  estSolde?: boolean;
  formuleOfficielle?: string;
  /** Renvois de la colonne NOTE du ch. 4, non développés (« 27 » reste « 27 »). */
  notes: string[];
}

/** Les neuf lignes X* du modèle, nommées · huit soldes de gestion plus XB. */
export interface SoldesCompteResultatSyscohada {
  margeCommerciale: number; // XA
  chiffreAffaires: number; // XB
  valeurAjoutee: number; // XC
  excedentBrutExploitation: number; // XD
  resultatExploitation: number; // XE
  resultatFinancier: number; // XF
  resultatActivitesOrdinaires: number; // XG
  resultatHorsActivitesOrdinaires: number; // XH
  resultatNet: number; // XI
}

export interface CompteResultatSyscohada {
  lignes: LigneCompteResultatSyscohada[];
  soldes: SoldesCompteResultatSyscohada;
  soldesN1?: SoldesCompteResultatSyscohada;
  exerciceN1Disponible: boolean;
  comptesNonRattaches: CompteDuPosteSyscohada[];
  controle: {
    resultatToutesClassesDeGestion: number;
    ecart: number;
    coherent: boolean;
  };
}

/** Ligne chiffrée du tableau des flux · `repere` porte la clé A à H du modèle. */
export interface LigneFluxSyscohada {
  ref: string;
  libelle: string;
  montant: number;
  montantN1?: number;
  comptes: CompteDuPosteSyscohada[];
  estTotal?: boolean;
  repere?: string;
}

/** Intitulé de rubrique intercalé par le modèle entre deux blocs de postes. */
export interface SectionFluxSyscohada {
  section: string;
}

/**
 * Poste que la balance ne permet pas de chiffrer, ou pas entièrement, avec
 * la raison telle que le serveur la formule. Affichée mot pour mot : c'est
 * elle qui dit au comptable si la donnée MANQUE (pas d'exercice antérieur)
 * ou si une part est INDÉTERMINABLE par numéro de compte.
 */
export interface PosteNonCalculableSyscohada {
  ref: string;
  raison: string;
}

export interface TableauFluxTresorerieSyscohada {
  lignes: Array<LigneFluxSyscohada | SectionFluxSyscohada>;
  exerciceN1Disponible: boolean;
  comptesNonVentiles: CompteDuPosteSyscohada[];
  postesNonCalculables: PosteNonCalculableSyscohada[];
  controle: {
    tresorerieOuverture: number;
    variation: number;
    tresorerieClotureParFlux: number;
    tresorerieClotureParBilan: number;
    ecart: number;
    coherent: boolean;
  };
}

/** Distingue une rubrique intercalée d'une ligne chiffrée du tableau des flux. */
export function estSectionFlux(
  ligne: LigneFluxSyscohada | SectionFluxSyscohada,
): ligne is SectionFluxSyscohada {
  return 'section' in ligne;
}

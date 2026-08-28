/**
 * Tableau de correspondance officiel « poste → comptes » du BILAN SYCEBNL —
 * projets de développement et assimilés, Système normal.
 *
 * Source unique : skill `sycebnl`,
 * `references/partie4-ch3-etats-projets-developpement.md`, sections
 * « Section 4 : Bilan » et « Section 4 (correspondance) : TABLEAU DE
 * CORRESPONDANCE - BILAN » (transcription du Journal officiel OHADA,
 * n° spécial du 22 février 2023, Partie 4, chapitre 3, p. 397-432).
 * Jamais de mémoire, jamais complété depuis le jeu « associations et ordres
 * professionnels » (`correspondance-bilan.ts`) ni depuis le SYSCOHADA
 * (règle §2.6 du plan de construction) : les codes REF de ce bilan (AA-DZ)
 * recoupent en partie ceux de l'autre jeu par la lettre, mais PAS par le
 * libellé ni par les comptes rattachés — deux tableaux distincts, transcrits
 * séparément.
 *
 * ## Convention de lecture des numéros de comptes / de signe
 *
 * Identiques à `correspondance-bilan.ts` : préfixe de 2 chiffres = tous ses
 * divisionnaires, préfixe de 3+ chiffres = lui-même et ses subdivisions ;
 * `exclusions` retranche du préfixe qui les contient ; un poste actif porte
 * son solde débiteur net en positif, un poste passif son solde créditeur
 * net en positif.
 *
 * ## Différences structurelles avec le bilan « associations »
 *
 * - Pas de distinction Immobilisations incorporelles / corporelles /
 *   financières en sous-totaux intermédiaires : une seule ligne « TOTAL
 *   ACTIF IMMOBILISE » (AZ) chapeaute directement 8 postes de détail.
 * - CC (Solde des opérations de l'exercice) correspond au compte 13, comme
 *   CH côté associations, mais ici SANS clôture-vs-avant-clôture documentée
 *   par un compte de gestion séparé : le compte d'exploitation de ce jeu
 *   (voir `correspondance-projet-compte-exploitation.ts`) est construit pour
 *   toujours boucler à somme nulle (XC = 0, voir l'anomalie signalée sur
 *   REF « TJ »/« TK » dans ce fichier), donc CC est calculé UNIQUEMENT
 *   depuis le compte 13 — pas de double source à arbitrer comme CH.
 * - Pas de ligne "report à nouveau" séparée des fonds propres classiques :
 *   CB (Report à nouveau) et CA (Fonds affectés aux investissements) sont
 *   deux postes de fonds propres distincts, pas hiérarchisés entre eux.
 *
 * ## Anomalies du texte officiel, signalées et non corrigées en silence
 *
 * 1. **DE (Dettes circulantes HAO)** porte la même Note (3) que BA (Actif
 *    circulant HAO) dans le bilan vierge (Section 4) — cohérent avec le
 *    tableau de correspondance, qui ne donne pas de comptes distincts pour
 *    BA et DE au-delà de 485/481-484-4998 déjà répartis par sens de solde.
 *    Pas une anomalie de comptes, seulement de renvoi de Note — signalé
 *    pour mémoire, sans incidence sur ce fichier.
 * 2. **DH (Autres dettes)** : le texte donne « 419, Soldes créditeurs : 42,
 *    43, 44, 47 (sauf 478) » — même ambiguïté de tiers polyvalents que BE
 *    (Autres créances) côté actif ; un qualificatif de sens est appliqué
 *    des deux côtés comme dans `correspondance-bilan.ts` (même
 *    justification, anomalie n° 2 de ce fichier-là).
 */

export type SensBilan = 'ACTIF' | 'PASSIF';
export type QualificatifSens = 'DEBITEUR' | 'CREDITEUR';

export interface PosteBilanProjetDeBase {
  ref: string;
  libelle: string;
  sens: SensBilan;
  comptes: string[];
  exclusions?: string[];
  comptesAmortissement?: string[];
  exclusionsAmortissement?: string[];
  sens_qualificatif?: QualificatifSens;
}

/** Postes ACTIF portant directement des comptes (hors sous-totaux/totaux). */
export const POSTES_ACTIF: PosteBilanProjetDeBase[] = [
  { ref: 'AA', libelle: 'Immobilisations incorporelles', sens: 'ACTIF', comptes: ['21'], comptesAmortissement: ['281', '291'] },
  {
    ref: 'AB',
    libelle: 'Terrains et bâtiments',
    sens: 'ACTIF',
    comptes: ['22', '231', '232', '233', '2391', '2392', '2393', '2396'],
    comptesAmortissement: ['282', '2831', '2832', '2833', '292', '2931', '2932', '2933'],
  },
  {
    ref: 'AC',
    libelle: 'Aménagements, agencements et installations',
    sens: 'ACTIF',
    comptes: ['234', '235', '238', '2394', '2395', '2398'],
    comptesAmortissement: ['2834', '2835', '2838', '2934', '2935', '2938', '2939'],
  },
  {
    ref: 'AD',
    libelle: 'Matériel, mobilier et actifs biologiques',
    sens: 'ACTIF',
    comptes: ['24'],
    exclusions: ['245', '2495'],
    comptesAmortissement: ['284', '294'],
    exclusionsAmortissement: ['2845', '2945', '2949'],
  },
  {
    ref: 'AE',
    libelle: 'Matériel de transport',
    sens: 'ACTIF',
    comptes: ['245', '2495'],
    comptesAmortissement: ['2845', '2945', '2949'],
  },
  { ref: 'AF', libelle: 'Avances et acomptes versés sur immobilisations', sens: 'ACTIF', comptes: ['25'], comptesAmortissement: ['295'] },
  { ref: 'AG', libelle: 'Dépôts et cautionnements', sens: 'ACTIF', comptes: ['275'], comptesAmortissement: ['297'] },
  {
    ref: 'AH',
    libelle: 'Autres immobilisations corporelles et financières',
    sens: 'ACTIF',
    comptes: ['26', '27'],
    exclusions: ['275'],
    comptesAmortissement: ['296', '297'],
  },
  { ref: 'BA', libelle: 'Actif circulant H.A.O.', sens: 'ACTIF', comptes: ['485'] },
  { ref: 'BB', libelle: 'Stocks et encours', sens: 'ACTIF', comptes: ['31', '32', '33', '34', '36', '37', '38'], comptesAmortissement: ['39'] },
  { ref: 'BC', libelle: 'Fournisseurs débiteurs', sens: 'ACTIF', comptes: ['409'] },
  { ref: 'BD', libelle: 'Clients-usagers', sens: 'ACTIF', comptes: ['41'], exclusions: ['419'] },
  {
    ref: 'BE',
    libelle: 'Autres créances',
    sens: 'ACTIF',
    comptes: ['42', '43', '44', '47'],
    exclusions: ['478'],
    sens_qualificatif: 'DEBITEUR',
  },
  { ref: 'BV', libelle: 'Valeurs à encaisser', sens: 'ACTIF', comptes: ['51'] },
  {
    ref: 'BW',
    libelle: 'Banques, établissements financiers, caisses et assimilés',
    sens: 'ACTIF',
    comptes: ['52', '53', '55', '57'],
  },
  { ref: 'BY', libelle: 'Écart de conversion — Actif', sens: 'ACTIF', comptes: ['478'] },
];

/** Postes PASSIF portant directement des comptes (hors sous-totaux/totaux). */
export const POSTES_PASSIF: PosteBilanProjetDeBase[] = [
  { ref: 'CA', libelle: 'Fonds affectés aux investissements', sens: 'PASSIF', comptes: ['16'] },
  { ref: 'CB', libelle: 'Report à nouveau (+ ou -)', sens: 'PASSIF', comptes: ['12'] },
  // CC n'est PAS listé ici : calculé uniquement depuis le compte 13, voir
  // calculerCC() dans le service (pas de double source à arbitrer — voir
  // note de tête de fichier).
  { ref: 'CD', libelle: "Subventions d'investissement", sens: 'PASSIF', comptes: ['14'] },
  { ref: 'DA', libelle: 'Emprunts et dettes assimilées', sens: 'PASSIF', comptes: ['18'] },
  { ref: 'DB', libelle: 'Provisions pour risques et charges', sens: 'PASSIF', comptes: ['19'] },
  { ref: 'DE', libelle: 'Dettes circulantes H.A.O.', sens: 'PASSIF', comptes: ['481', '484', '4998'] },
  { ref: 'DF', libelle: "Fonds d'administration", sens: 'PASSIF', comptes: ['46'] },
  { ref: 'DG', libelle: 'Fournisseurs', sens: 'PASSIF', comptes: ['40'], exclusions: ['409'] },
  {
    ref: 'DH',
    libelle: 'Autres dettes',
    sens: 'PASSIF',
    // Anomalie n° 2 : 419 (adhérents créditeurs) + qualificatif "solde
    // créditeurs" sur 42/43/44/47 (sinon double compte avec BE).
    comptes: ['419', '42', '43', '44', '47'],
    exclusions: ['478'],
    sens_qualificatif: 'CREDITEUR',
  },
  { ref: 'DI', libelle: 'Provisions pour risques et charges à court terme', sens: 'PASSIF', comptes: ['20'] },
  {
    ref: 'DW',
    libelle: 'Banques, établissements financiers et crédits de trésorerie',
    sens: 'PASSIF',
    comptes: ['56'],
  },
  { ref: 'DY', libelle: 'Écart de conversion — Passif', sens: 'PASSIF', comptes: ['479'] },
];

/**
 * DW capte aussi 52/53 côté créditeur — même mécanisme que dans
 * `correspondance-bilan.ts` (BW/DW), sur les mêmes numéros de compte que la
 * trésorerie actif (BW ci-dessus), distingués uniquement par le sens du
 * solde.
 */
export const COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR = ['52', '53'];

export function trouvePosteActif(ref: string): PosteBilanProjetDeBase | undefined {
  return POSTES_ACTIF.find((p) => p.ref === ref);
}
export function trouvePostePassif(ref: string): PosteBilanProjetDeBase | undefined {
  return POSTES_PASSIF.find((p) => p.ref === ref);
}

export interface TotalBilanProjet {
  ref: string;
  libelle: string;
  deRefs: string[];
}

export const TOTAUX_ACTIF: TotalBilanProjet[] = [
  { ref: 'AZ', libelle: 'TOTAL ACTIF IMMOBILISE', deRefs: ['AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH'] },
  { ref: 'BF', libelle: 'TOTAL ACTIF CIRCULANT', deRefs: ['BA', 'BB', 'BC', 'BD', 'BE'] },
  { ref: 'BX', libelle: 'TOTAL TRESORERIE ACTIF', deRefs: ['BV', 'BW'] },
  { ref: 'BZ', libelle: 'TOTAL GENERAL', deRefs: ['AZ', 'BF', 'BX', 'BY'] },
];

export const TOTAUX_PASSIF: TotalBilanProjet[] = [
  { ref: 'CZ', libelle: 'TOTAL RESSOURCES PROPRES ET ASSIMILEES', deRefs: ['CA', 'CB', 'CC', 'CD'] },
  { ref: 'DC', libelle: 'TOTAL DETTES FINANCIERES ET RESSOURCES ASSIMILEES', deRefs: ['DA', 'DB'] },
  { ref: 'DD', libelle: 'TOTAL RESSOURCES STABLES', deRefs: ['CZ', 'DC'] },
  { ref: 'DJ', libelle: 'TOTAL PASSIF CIRCULANT', deRefs: ['DE', 'DF', 'DG', 'DH', 'DI'] },
  { ref: 'DX', libelle: 'TOTAL TRESORERIE PASSIF', deRefs: ['DW'] },
  { ref: 'DZ', libelle: 'TOTAL GENERAL', deRefs: ['DD', 'DJ', 'DX', 'DY'] },
];

/** Ordre d'affichage officiel — mélange détail et totaux, comme la maquette (Section 4). */
export const ORDRE_AFFICHAGE_ACTIF = [
  'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AZ',
  'BA', 'BB', 'BC', 'BD', 'BE', 'BF', 'BV', 'BW', 'BX', 'BY', 'BZ',
];
export const ORDRE_AFFICHAGE_PASSIF = [
  'CA', 'CB', 'CC', 'CD', 'CZ',
  'DA', 'DB', 'DC', 'DD', 'DE', 'DF', 'DG', 'DH', 'DI', 'DJ', 'DW', 'DX', 'DY', 'DZ',
];

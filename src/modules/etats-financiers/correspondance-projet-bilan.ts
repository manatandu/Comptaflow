/**
 * Tableau de correspondance officiel « poste → comptes » du BILAN SYCEBNL ·
 * projets de développement et assimilés, Système normal.
 *
 * Source unique : skill `sycebnl`,
 * `references/partie4-ch3-etats-projets-developpement.md`, sections
 * « Section 4 : Bilan » et « Section 4 (correspondance) : TABLEAU DE
 * CORRESPONDANCE - BILAN » (Journal officiel OHADA, n° spécial du 22 février
 * 2023, Partie 4, chapitre 3, p. 397-432). Les codes REF de ce bilan
 * (AA-DZ) recoupent en partie ceux du jeu « associations » par la lettre,
 * mais PAS par le libellé ni par les comptes rattachés : deux tableaux
 * distincts, transcrits séparément.
 *
 * ## PAS de colonnes Brut / Amortissement / Net dans ce jeu
 *
 * Le texte officiel donne, pour ce bilan :
 *     « Colonnes : REF | ACTIF | Note | EXERCICE AU 31/12/N | EXERCICE AU 31/12/N-1 »
 * soit DEUX colonnes de valeur. Le bilan des associations (ch. 2) prévoit au
 * contraire explicitement « Brut / Amortissements et dépréciations / Net »
 * · pas celui-ci. Et le tableau de correspondance ci-dessous ne cite AUCUN
 * compte 28x/29x.
 *
 * Une première version de ce fichier (2026-08-28, matin) avait recopié les
 * mappings d'amortissement du jeu associations et affiché 4 colonnes. C'était
 * une violation directe de la règle §2.6 · combler une lacune depuis un autre
 * jeu · et l'en-tête affirmait pourtant l'inverse. Retiré à l'audit du même
 * jour.
 *
 * Cette absence est cohérente avec le reste du jeu : le compte d'exploitation
 * projet ne cite AUCUN compte 68 (dotations aux amortissements) non plus, et
 * la Partie 3 ch. 3 (fonds propres des projets) ne parle jamais
 * d'amortissement · les immobilisations d'un projet sont décomptabilisées en
 * fin de projet contre les comptes 162-164, pas amorties. Un projet qui
 * porterait malgré tout des comptes 28x/29x les verra ressortir en
 * « comptes non rattachés » : visibles, jamais absorbés en silence.
 *
 * ## Convention de lecture des numéros de comptes / de signe
 *
 * Identiques à `correspondance-bilan.ts` : préfixe de 2 chiffres = tous ses
 * divisionnaires, préfixe de 3+ chiffres = lui-même et ses subdivisions ;
 * `exclusions` retranche du préfixe qui les contient ; un poste actif porte
 * son solde débiteur net en positif, un poste passif son solde créditeur net
 * en positif.
 *
 * ## Anomalies du texte officiel, signalées et jamais corrigées en silence
 *
 * 1. **DI « Provisions pour risques et charges à court terme » = compte 20**
 *    `[texte officiel]`. Le compte 20 du plan SYCEBNL est « Immobilisations
 *    destinées à la vente provenant de dons et legs non encore reçus et
 *    usufruit temporaire » (Partie 2, ch. 3, COMPTE 20) : un ACTIF de
 *    classe 2, pas une provision de passif. C'est très probablement une
 *    corruption de scan de 499/599 (« Provisions pour risques à court
 *    terme »), ce que retient d'ailleurs le poste DI du jeu associations.
 *    **Transcrit tel quel malgré tout** : le corriger en 499/599 serait une
 *    interprétation, pas une transcription. Deux conséquences à connaître ·
 *    (a) un compte 20xxxxx débiteur fera ressortir DI en NÉGATIF au passif,
 *    anomalie visible plutôt que silencieuse ; (b) les comptes 499/599 ne
 *    sont réclamés par AUCUN poste de ce bilan et ressortiront donc en
 *    « comptes non rattachés ». Vérifier sur le PDF officiel avant de s'y
 *    fier.
 * 2. **BX** est intitulé « TOTAL TRESORERIE ACTIF » dans la maquette
 *    (Section 4) et « TOTAL TRESORERIE » dans le tableau de correspondance
 *    `[texte officiel]`. Le libellé de la maquette est retenu (c'est elle
 *    qui est présentée aux tiers) ; divergence sans incidence sur les
 *    montants.
 * 3. **BW / DW · double comptage des découverts** : ce n'est pas une
 *    anomalie du texte mais un piège d'implémentation, identique à celui du
 *    jeu associations et corrigé en même temps (2026-08-28, audit). Le
 *    texte affecte les soldes 52/53 CRÉDITEURS à DW ; si BW les capte aussi
 *    (en négatif), le découvert est compté des deux côtés et le bilan ne
 *    boucle plus. Voir `comptesTransferesSiCrediteur`.
 *
 * ## Ce qui n'est PAS une anomalie (contrairement au jeu associations)
 *
 * BE et DH : le texte projet écrit lui-même « Soldes débiteurs : 42, 43, 44,
 * 47 » et « Soldes créditeurs : 42, 43, 44, 47 ». Aucune ambiguïté à
 * résoudre ici · les `sens_qualificatif` ci-dessous ne font que transcrire.
 * (Une version précédente de cet en-tête présentait ça comme une « anomalie
 * n° 2 » corrigée par nos soins, en transposant l'anomalie réelle du tableau
 * ASSOCIATIONS, qui lui ne qualifiait pas le sens. Rectifié à l'audit.)
 */

export type SensBilan = 'ACTIF' | 'PASSIF';
export type QualificatifSens = 'DEBITEUR' | 'CREDITEUR';

export interface PosteBilanProjetDeBase {
  ref: string;
  libelle: string;
  sens: SensBilan;
  comptes: string[];
  exclusions?: string[];
  sens_qualificatif?: QualificatifSens;
  /**
   * ACTIF seulement : comptes qui QUITTENT ce poste quand leur solde est
   * créditeur, parce qu'un poste de PASSIF les réclame alors (voir
   * anomalie n° 3 en tête de fichier).
   */
  comptesTransferesSiCrediteur?: string[];
}

/**
 * Postes ACTIF portant directement des comptes (hors sous-totaux/totaux).
 * Aucun `comptesAmortissement` : le tableau officiel n'en cite aucun (voir
 * en-tête, « PAS de colonnes Brut / Amortissement / Net dans ce jeu »).
 */
export const POSTES_ACTIF: PosteBilanProjetDeBase[] = [
  { ref: 'AA', libelle: 'Immobilisations incorporelles', sens: 'ACTIF', comptes: ['21'] },
  {
    ref: 'AB',
    libelle: 'Terrains et bâtiments',
    sens: 'ACTIF',
    comptes: ['22', '231', '232', '233', '2391', '2392', '2393', '2396'],
  },
  {
    ref: 'AC',
    libelle: 'Aménagements, agencements et installations',
    sens: 'ACTIF',
    comptes: ['234', '235', '238', '2394', '2395', '2398'],
  },
  {
    ref: 'AD',
    libelle: 'Matériel, mobilier et actifs biologiques',
    sens: 'ACTIF',
    comptes: ['24'],
    exclusions: ['245', '2495'],
  },
  { ref: 'AE', libelle: 'Matériel de transport', sens: 'ACTIF', comptes: ['245', '2495'] },
  { ref: 'AF', libelle: 'Avances et acomptes versés sur immobilisations', sens: 'ACTIF', comptes: ['25'] },
  { ref: 'AG', libelle: 'Dépôts et cautionnements', sens: 'ACTIF', comptes: ['275'] },
  {
    ref: 'AH',
    libelle: 'Autres immobilisations corporelles et financières',
    sens: 'ACTIF',
    comptes: ['26', '27'],
    exclusions: ['275'],
  },
  { ref: 'BA', libelle: 'Actif circulant H.A.O.', sens: 'ACTIF', comptes: ['485'] },
  { ref: 'BB', libelle: 'Stocks et encours', sens: 'ACTIF', comptes: ['31', '32', '33', '34', '36', '37', '38'] },
  { ref: 'BC', libelle: 'Fournisseurs débiteurs', sens: 'ACTIF', comptes: ['409'] },
  // Le texte officiel dit « 41 (sauf 411 et 419) » · les DEUX exclusions.
  // 411 n'est réclamé par aucun autre poste de ce bilan : il ressortira donc
  // en « comptes non rattachés », ce qui est le comportement fidèle. Une
  // version précédente n'excluait que 419 et absorbait 411 en silence.
  { ref: 'BD', libelle: 'Clients-usagers', sens: 'ACTIF', comptes: ['41'], exclusions: ['411', '419'] },
  {
    ref: 'BE',
    libelle: 'Autres créances',
    sens: 'ACTIF',
    comptes: ['42', '43', '44', '47'],
    exclusions: ['478'],
    sens_qualificatif: 'DEBITEUR', // « Soldes débiteurs : » au texte officiel
  },
  { ref: 'BV', libelle: 'Valeurs à encaisser', sens: 'ACTIF', comptes: ['51'] },
  {
    ref: 'BW',
    libelle: 'Banques, établissements financiers, caisses et assimilés',
    sens: 'ACTIF',
    comptes: ['52', '53', '55', '57'],
    // 52/53 créditeurs = découvert bancaire : ils relèvent de DW. 55/57
    // (monnaie électronique, caisse) ne sont pas transférés · une caisse
    // créditrice est une anomalie de saisie qui doit rester visible.
    comptesTransferesSiCrediteur: ['52', '53'],
  },
  { ref: 'BY', libelle: 'Écart de conversion · Actif', sens: 'ACTIF', comptes: ['478'] },
];

/** Postes PASSIF portant directement des comptes (hors sous-totaux/totaux). */
export const POSTES_PASSIF: PosteBilanProjetDeBase[] = [
  { ref: 'CA', libelle: 'Fonds affectés aux investissements', sens: 'PASSIF', comptes: ['16'] },
  { ref: 'CB', libelle: 'Report à nouveau (+ ou -)', sens: 'PASSIF', comptes: ['12'] },
  // CC n'est PAS listé ici : calculé uniquement depuis le compte 13, voir
  // calculerCC() dans le service.
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
    comptes: ['419', '42', '43', '44', '47'],
    exclusions: ['478'],
    sens_qualificatif: 'CREDITEUR', // « Soldes créditeurs : » au texte officiel
  },
  // Anomalie n° 1 (voir en-tête) : le texte dit « 20 », un compte d'ACTIF.
  // Transcrit tel quel, jamais corrigé en silence.
  { ref: 'DI', libelle: 'Provisions pour risques et charges à court terme', sens: 'PASSIF', comptes: ['20'] },
  {
    ref: 'DW',
    libelle: 'Banques, établissements financiers et crédits de trésorerie',
    sens: 'PASSIF',
    comptes: ['56'],
  },
  { ref: 'DY', libelle: 'Écart de conversion · Passif', sens: 'PASSIF', comptes: ['479'] },
];

/** DW capte aussi 52/53 côté créditeur · voir `comptesTransferesSiCrediteur` sur BW. */
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
  // Anomalie n° 2 : libellé de la maquette retenu (« TOTAL TRESORERIE ACTIF »),
  // le tableau de correspondance dit « TOTAL TRESORERIE ».
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

/** Ordre d'affichage officiel · mélange détail et totaux, comme la maquette (Section 4). */
export const ORDRE_AFFICHAGE_ACTIF = [
  'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AZ',
  'BA', 'BB', 'BC', 'BD', 'BE', 'BF', 'BV', 'BW', 'BX', 'BY', 'BZ',
];
export const ORDRE_AFFICHAGE_PASSIF = [
  'CA', 'CB', 'CC', 'CD', 'CZ',
  'DA', 'DB', 'DC', 'DD', 'DE', 'DF', 'DG', 'DH', 'DI', 'DJ', 'DW', 'DX', 'DY', 'DZ',
];

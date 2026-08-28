/**
 * Tableau de correspondance officiel « poste → comptes » du COMPTE DE
 * RÉSULTAT SYCEBNL — associations et ordres professionnels, Système normal.
 *
 * Source unique : skill `sycebnl`,
 * `references/partie4-ch2-etats-associations.md`, section « TABLEAU DE
 * CORRESPONDANCE - COMPTE DE RESULTAT » (transcription du Journal officiel
 * OHADA, n° spécial du 22 février 2023, Partie 4, chapitre 2, section 6).
 * Chaque poste ci-dessous reprend son code REF, son libellé et ses numéros
 * de comptes tels qu'ils figurent au texte — jamais de mémoire, jamais
 * complété depuis le SYSCOHADA (règle §2.6 du plan de construction).
 *
 * Contrairement au bilan — dont le regroupement classe→poste reste
 * simplifié/MVP dans `etats-financiers.service.ts` —, ce compte de résultat
 * est donc réellement adossé au tableau officiel.
 *
 * ## Convention de lecture des numéros de comptes
 *
 * Reprise du moteur `liasse/` du skill : un jeton de 2 chiffres englobe tous
 * ses divisionnaires (« 71 » couvre 71xxxxx) ; un jeton de 3 ou 4 chiffres
 * ne vaut que pour lui-même et ses subdivisions (« 601 » couvre 601xxxx mais
 * pas 6031). Le rapprochement se fait donc par PRÉFIXE, et en cas de
 * chevauchement le préfixe le PLUS LONG l'emporte (voir
 * `posteDuCompte()`) — les jetons du tableau officiel sont disjoints, mais
 * la règle du préfixe le plus long protège d'un plan de comptes
 * personnalisé qui introduirait une subdivision plus fine.
 *
 * ## Convention de signe
 *
 * Chaque poste porte le montant dans SON sens naturel de lecture, comme
 * l'état officiel le présente :
 *   - postes de produits (R*) : montant = crédit − débit ;
 *   - postes de charges  (T*) : montant = débit − crédit.
 * Les charges apparaissent donc en positif, ce qui rend les formules
 * officielles littéralement vraies : XA = ΣR, XB = ΣT, XC = XA − XB.
 * Les postes marqués « +/- » au texte officiel (variations de stocks TB/TE,
 * comptes 73 et 87) peuvent légitimement ressortir négatifs — c'est le même
 * calcul, aucun traitement particulier n'est nécessaire.
 */

export type SensPoste = 'PRODUIT' | 'CHARGE';

export interface PosteCompteResultat {
  /** Code REF officiel (RA, TA, TM...). */
  ref: string;
  libelle: string;
  sens: SensPoste;
  /** Préfixes de comptes, tels que cités au tableau officiel. */
  comptes: string[];
}

/**
 * Produits — postes RA à RH.
 *
 * ⚠️ Anomalie du texte officiel, signalée et non corrigée en silence
 * (règle §2.6) : le libellé du poste XA indique « Somme RA à RG », ce qui
 * exclurait RH (reprises de provisions, dépréciations, subventions). RH est
 * pourtant un produit ordinaire, et l'exclure romprait l'égalité entre le
 * résultat du compte de résultat et le résultat logé au bilan dès qu'une
 * entité a des reprises. RH est donc inclus dans XA — même correction, pour
 * la même raison, que celle retenue par le moteur `liasse/` du skill
 * `sycebnl` (voir `liasse/references/anomalies.md`, anomalie n° 4).
 */
export const POSTES_PRODUITS: PosteCompteResultat[] = [
  { ref: 'RA', libelle: 'Cotisations', sens: 'PRODUIT', comptes: ['701'] },
  {
    ref: 'RB',
    libelle: 'Dotations consomptibles transférées au compte de résultat',
    sens: 'PRODUIT',
    comptes: ['703'],
  },
  { ref: 'RC', libelle: 'Revenus liés à la générosité', sens: 'PRODUIT', comptes: ['704'] },
  { ref: 'RD', libelle: 'Ventes de marchandises', sens: 'PRODUIT', comptes: ['7051'] },
  {
    ref: 'RE',
    libelle: 'Ventes de services et produits finis',
    sens: 'PRODUIT',
    // ⚠️ Lacune du texte officiel, signalée et NON comblée (règle §2.6) : le
    // plan des comptes (Partie 2, ch. 3, classe 7) subdivise 705 en 7051 à
    // 7055, mais le tableau de correspondance ne cite que 7051 (RD) et
    // 7052/7053 (RE). Les comptes 7054 (ventes de produits intermédiaires)
    // et 7055 (ventes de produits résiduels) n'entrent donc dans AUCUN
    // poste du compte de résultat. Les rattacher d'office à RE serait une
    // interprétation, pas une transcription : ils ressortent en
    // « comptes non rattachés » (feuille Anomalies de l'export), où le
    // contrôle d'écart les rend visibles plutôt que silencieux.
    comptes: ['7052', '7053'],
  },
  { ref: 'RF', libelle: "Subventions d'exploitation", sens: 'PRODUIT', comptes: ['71'] },
  {
    ref: 'RG',
    libelle: 'Autres produits et transferts de charges',
    sens: 'PRODUIT',
    // « 73 (+/-) » au texte officiel : variation de stocks de biens produits,
    // qui peut ressortir négative — géré par la convention de signe ci-dessus.
    comptes: ['706', '707', '708', '72', '73', '75', '77', '78'],
  },
  {
    ref: 'RH',
    libelle: 'Reprises de provisions, dépréciations, subventions et autres reprises',
    sens: 'PRODUIT',
    comptes: ['79'],
  },
];

/** Charges — postes TA à TL. */
export const POSTES_CHARGES: PosteCompteResultat[] = [
  { ref: 'TA', libelle: "Achats de biens et services liés à l'activité", sens: 'CHARGE', comptes: ['601'] },
  {
    ref: 'TB',
    libelle: "Variation de stocks des achats de biens et services liés à l'activité",
    sens: 'CHARGE',
    comptes: ['6031'], // « +/- » au texte officiel
  },
  { ref: 'TC', libelle: 'Achats de marchandises et matières premières', sens: 'CHARGE', comptes: ['602'] },
  { ref: 'TD', libelle: 'Autres achats', sens: 'CHARGE', comptes: ['604', '605', '606', '608'] },
  {
    ref: 'TE',
    libelle: 'Variation de stocks de marchandises, de matières premières et autres',
    sens: 'CHARGE',
    comptes: ['6032', '6033', '6034', '6035'], // « +/- » au texte officiel
  },
  { ref: 'TF', libelle: 'Transports', sens: 'CHARGE', comptes: ['61'] },
  { ref: 'TG', libelle: 'Services extérieurs', sens: 'CHARGE', comptes: ['62', '63'] },
  { ref: 'TH', libelle: 'Impôts et taxes', sens: 'CHARGE', comptes: ['64'] },
  { ref: 'TI', libelle: 'Autres charges', sens: 'CHARGE', comptes: ['65'] },
  { ref: 'TJ', libelle: 'Charges de personnel', sens: 'CHARGE', comptes: ['66'] },
  { ref: 'TK', libelle: 'Frais financiers et charges assimilées', sens: 'CHARGE', comptes: ['67'] },
  {
    ref: 'TL',
    libelle: 'Dotations aux amortissements, aux provisions, aux dépréciations et autres',
    sens: 'CHARGE',
    comptes: ['68', '69'],
  },
];

/** Hors activités ordinaires — postes TM (produits) et TN (charges). */
export const POSTES_HAO: PosteCompteResultat[] = [
  { ref: 'TM', libelle: 'Produits H.A.O.', sens: 'PRODUIT', comptes: ['82', '84', '86', '88'] },
  {
    ref: 'TN',
    libelle: 'Charges H.A.O.',
    sens: 'CHARGE',
    comptes: ['81', '83', '85', '87'], // « 87 (+/-) » au texte officiel
  },
];

export const TOUS_LES_POSTES: PosteCompteResultat[] = [...POSTES_PRODUITS, ...POSTES_CHARGES, ...POSTES_HAO];

/**
 * Poste auquel rattacher un numéro de compte, ou `null` s'il n'entre dans
 * aucun poste du compte de résultat (comptes de bilan classes 1-5, et
 * comptes de classe 9 qui sont hors bilan ET hors compte de résultat par
 * construction de l'Acte uniforme).
 *
 * Le préfixe le plus long l'emporte (voir la convention de lecture en tête
 * de fichier).
 */
export function posteDuCompte(numeroCompte: string): PosteCompteResultat | null {
  let meilleur: PosteCompteResultat | null = null;
  let longueurMeilleurPrefixe = 0;

  for (const poste of TOUS_LES_POSTES) {
    for (const prefixe of poste.comptes) {
      if (numeroCompte.startsWith(prefixe) && prefixe.length > longueurMeilleurPrefixe) {
        meilleur = poste;
        longueurMeilleurPrefixe = prefixe.length;
      }
    }
  }

  return meilleur;
}

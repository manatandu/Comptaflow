import type { JeuEtatsFinanciersSycebnl, Referentiel, SystemeComptableSyscohada } from './types';

/**
 * CE QU'UN DOSSIER AU SYSTÈME MINIMAL DE TRÉSORERIE NE VOIT PAS DANS SES MENUS.
 * Décision de Manasse du 2026-09-26 sur l'audit `docs/audit-modules-par-profil.md`
 * (colonnes Sb et So). Le SMT est une comptabilité de trésorerie (SYCEBNL
 * Partie 4 ch. 1 § 1.3 ; AUDCIF art. 21 et Titre X) · ce qui suit n'y a pas
 * d'objet.
 *
 * TROIS RÈGLES À NE PAS DÉFAIRE.
 *  1. MASQUER N'EST PAS REFUSER · la route reste ouverte (l'aiguillage
 *     d'AppShell ne lit pas cette liste) et les données restent. Un dossier qui
 *     passe au Système normal retrouve ses menus. Ce qui est CONTRAIRE au
 *     système est refusé au serveur (`src/common/systeme-minimal.ts`), pas ici.
 *  2. NE FIGURENT PAS ICI les tiers, la facturation, le lettrage ni la variation
 *     de stocks · les états SMT d'OmegaX lisent les notes 2 et 3 et leurs
 *     lignes de variation dans les comptes de tiers et de stocks. Les masquer
 *     viderait ces notes sans qu'aucun total ne bouge.
 *  3. NI LE REGISTRE DES DONATEURS · SYCEBNL art. 17, « pour chaque entité à but
 *     non lucratif », SMT compris.
 */
export const CHEMINS_SANS_OBJET_SMT: readonly string[] = [
  // Tiers et trésorerie · la Note 3 et les journaux de suivi du Titre X
  // tiennent lieu de balance âgée ; aucun texte ne prévoit d'échéancier.
  '/balance-agee',
  '/echeancier',
  // Clôture · le fait générateur est l'encaissement ; les créances et dettes
  // s'établissent en inventaire extra-comptable.
  '/regularisations',
  '/devises',
  '/balance-fonctionnelle',
  // Aucun poste de provision dans les deux modèles SMT · le registre ne passe
  // aucune écriture, il se masque, et la dépréciation se refuse au serveur.
  '/provisions',
  // Inventaire permanent et consignation · au SMT, les stocks s'établissent
  // par inventaire extra-comptable de fin d'exercice.
  '/magasin',
  '/emballages',
  // Pilotage, analytique et budget · aucun état budgétaire au SMT.
  '/plans-analytiques',
  '/od-analytiques',
  '/etats-analytiques',
  '/simulations-budgetaires',
  '/etats-personnalises',
  '/palmares-journaux',
  '/engagements',
  // Révision du cabinet · décision d'OmegaX pour une petite entité.
  '/circularisation',
  '/questionnaire-revision',
  '/faiblesses',
  '/dossier-revision',
  // AUDCIF art. 73-1 vise les titres cotés et l'appel public à l'épargne ·
  // masqué sans refus, c'est un jugement d'OmegaX et non une règle du texte.
  '/ifrs',
];

export interface RegimeDossierClient {
  referentiel: Referentiel;
  /** Fait déclaré · voir `CHEMINS_SELON_UN_FAIT`. Absent = inconnu. */
  ongEtrangere?: boolean | null;
  jeuEtatsFinanciersSycebnl?: JeuEtatsFinanciersSycebnl | null;
  systemeComptableSyscohada?: SystemeComptableSyscohada | null;
}

/** Même règle que le serveur (`estSystemeMinimal`) · le jeu au SYCEBNL, le système au SYSCOHADA. */
export function estSystemeMinimalDossier(t: RegimeDossierClient | null | undefined): boolean {
  if (!t) return false;
  return t.referentiel === 'SYCEBNL'
    ? t.jeuEtatsFinanciersSycebnl === 'SYSTEME_MINIMAL_TRESORERIE'
    : t.systemeComptableSyscohada === 'MINIMAL_TRESORERIE';
}

/**
 * Le chemin figure-t-il au menu de ce dossier ? Un dossier pas encore chargé
 * voit tout · retirer une entrée faute de savoir cacherait à un dossier normal
 * ce qu'il est en droit d'avoir.
 */
export function cheminAuMenu(chemin: string, t: RegimeDossierClient | null | undefined): boolean {
  const base = chemin.split('?')[0];
  const fait = CHEMINS_SELON_UN_FAIT[base];
  if (fait && t && fait(t) === false) return false;
  if (!estSystemeMinimalDossier(t)) return true;
  return !CHEMINS_SANS_OBJET_SMT.includes(base);
}

/**
 * MASQUES SELON UN FAIT DÉCLARÉ, pas selon le profil. Un seul fait est assez
 * sûr pour masquer : la forme de l'entité et son droit, que le dossier
 * déclare et que le module lit déjà. Rendre `false` masque ; `true` ou
 * `null` (inconnu, ou sans objet dans ce référentiel) laisse l'entrée.
 *
 * VOLONTAIREMENT ABSENTS · la paie (l'effectif vaut 0 par défaut, et c'est
 * dans cette fenêtre qu'on inscrit le premier salarié), la TVA
 * (`assujettiTva` vaut faux par défaut, il ne distingue pas « non assujetti »
 * de « pas encore dit ») et la facturation d'une ASBL (aucun champ ne dit
 * qu'elle vend). Masquer sur une valeur par défaut cacherait un module à qui
 * en a besoin.
 */
export const CHEMINS_SELON_UN_FAIT: Record<string, (t: RegimeDossierClient) => boolean | null> = {
  // Loi n° 004/2001, art. 37 · l'accord-cadre ne vise que l'ONG étrangère.
  '/accord-cadre': (t) => (t.ongEtrangere === undefined ? null : t.ongEtrangere),
};

/**
 * LES SOUS-FONCTIONS D'UNE FENÊTRE UTILE · même règle, un cran plus bas. La
 * fenêtre reste au menu du SMT ; ce qui, à l'intérieur, n'y a pas d'objet
 * disparaît. Masquer, jamais refuser · un composant déjà porté se renouvelle
 * encore, un ordre déjà émis se relit encore.
 *  - lots et ordres de virement · moyens de paiement de Sage, aucun texte ne
 *    les prévoit (colonne Sb et So de l'audit) ;
 *  - composants et reconstitution d'une révision majeure · la Note 1 des deux
 *    SMT ne connaît que le bien, avec sa date et sa durée.
 */
export type SousFonction = 'lots-virement' | 'ordre-virement' | 'composants' | 'revision-majeure';

export const SOUS_FONCTIONS_SANS_OBJET_SMT: readonly SousFonction[] = [
  'lots-virement',
  'ordre-virement',
  'composants',
  'revision-majeure',
];

export function sousFonctionServie(cle: SousFonction, t: RegimeDossierClient | null | undefined): boolean {
  return !estSystemeMinimalDossier(t) || !SOUS_FONCTIONS_SANS_OBJET_SMT.includes(cle);
}

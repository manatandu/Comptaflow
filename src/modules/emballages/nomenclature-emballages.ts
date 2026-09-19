import { Referentiel } from '@prisma/client';

/**
 * LA NOMENCLATURE DES EMBALLAGES · la seule source des numéros de ce cycle, et
 * jamais un numéro sans son référentiel.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LE CYCLE OÙ LES DEUX PLANS COÏNCIDENT, SAUF AU BOUT QUI COMPTE.
 *
 * Le cycle des stocks est la plus grande occurrence du premier piège du dépôt :
 * douze numéros sur quatorze changent de sens entre les deux plans. Les
 * emballages sont le PREMIER cycle où l'essentiel de la nomenclature se
 * recouvre · 4094, 4194, 6082, 6224, 243, 3351 à 3358 et 6081 à 6089 portent
 * le même numéro et le même intitulé dans les deux textes, vérifiés dans les
 * deux semis.
 *
 * LA DIVERGENCE EST AU BOUT PRODUIT, ET C'EST LÀ QUE LE CYCLE SE DÉNOUE. Les
 * deux fiches du compte 41 écrivent la même règle avec une PROFONDEUR
 * différente :
 *
 *  · AUDCIF, fiche du compte 41 · le 4194 « est soldé par […] le crédit du
 *    compte 7074 (bonis sur cession d'emballages) s'il s'agit d'un emballage,
 *    ou du compte 82 […] s'il s'agit d'un matériel, en cas de conservation par
 *    le client ; le crédit du compte 7074 (bonis sur reprises d'emballage) en
 *    cas de reprise à un prix inférieur à celui de la consignation » ;
 *
 *  · SYCEBNL, fiche du compte 41 · même phrase, mais « le crédit du compte
 *    707 PRODUITS ACCESSOIRES s'il s'agit d'un emballage », et « le crédit du
 *    compte 707 Produits accessoires en cas de reprise à un prix inférieur ».
 *
 * Le SYCEBNL n'ouvre AUCUNE subdivision sous son 707 · la liste des
 * subdivisions du compte 70 s'y arrête à « 707 Produits accessoires », et
 * c'est donc le 707 lui-même qui reçoit. L'AUDCIF, lui, ouvre 7071 à 7078, et
 * son 707 est un EN-TÊTE DE DIVISION, semé en type TOTAL. Servir « 7074 » à
 * une association l'enverrait sur un compte que son plan n'ouvre pas ; servir
 * « 707 » à une société l'enverrait sur un en-tête, et l'écriture serait
 * refusée à la saisie APRÈS que tout a été chiffré · exactement le défaut du
 * 734 et du 735 au chantier de la variation de stocks.
 * ────────────────────────────────────────────────────────────────────────
 *
 * ET LE LIVRE DE COURS DONNAIT UN TROISIÈME NUMÉRO QUI N'EXISTE NI DANS L'UN
 * NI DANS L'AUTRE. Il porte un « 6588 Emballages à rendre perdus » ; le 6588
 * du SYSCOHADA est « Autres charges diverses » et le SYCEBNL n'a qu'un 658
 * « Charges diverses » sans subdivision. Un emballage perdu y serait
 * comptabilisé sans qu'aucune balance ne cesse de boucler, et la Note annexe
 * publierait « Autres charges diverses ». Il n'est donc PAS repris · une note
 * de cours commente le texte, elle ne le promulgue pas.
 */

/** Un compte du cycle, et le numéro qu'il porte dans CE référentiel. */
export interface CompteEmballage {
  /** Clé stable, indépendante du plan · c'est elle qui circule dans le code. */
  role: RoleCompteEmballage;
  numero: string;
  intitule: string;
}

export type RoleCompteEmballage =
  /** Créance sur le fournisseur pour les emballages et matériels à rendre. */
  | 'CREANCE_CONSIGNATION'
  /** Dette envers le client pour les emballages et matériels consignés. */
  | 'DETTE_CONSIGNATION'
  /** Achat d'emballages récupérables · le client qui conserve. */
  | 'ACHAT_EMBALLAGE_RECUPERABLE'
  /** Mali sur emballages · le client repris sous le prix de consignation. */
  | 'MALI_SUR_EMBALLAGES'
  /** Boni sur reprises et cessions d'emballages · côté fournisseur. */
  | 'BONI_SUR_EMBALLAGES'
  /** Matériel d'emballage récupérable et identifiable · immobilisation. */
  | 'MATERIEL_EMBALLAGE'
  /** Produits des cessions d'immobilisations corporelles. */
  | 'PRODUIT_CESSION_IMMO'
  /** Valeurs comptables des cessions d'immobilisations corporelles. */
  | 'VALEUR_COMPTABLE_CESSION';

/**
 * LES SEPT PREMIERS RÔLES PORTENT LE MÊME NUMÉRO DES DEUX CÔTÉS, et le
 * huitième NON. La table reste néanmoins par référentiel, sans facteur commun :
 * factoriser « ce qui est pareil » obligerait le prochain lecteur à vérifier
 * que ça l'est encore, alors que deux tables complètes se relisent seules.
 */
const SYSCOHADA: CompteEmballage[] = [
  { role: 'CREANCE_CONSIGNATION', numero: '4094', intitule: 'Fournisseurs, créances pour emballages et matériels à rendre' },
  { role: 'DETTE_CONSIGNATION', numero: '4194', intitule: 'Clients, dettes pour emballages et matériels consignés' },
  { role: 'ACHAT_EMBALLAGE_RECUPERABLE', numero: '6082', intitule: 'Emballages récupérables non identifiables' },
  { role: 'MALI_SUR_EMBALLAGES', numero: '6224', intitule: 'Malis sur emballages' },
  { role: 'BONI_SUR_EMBALLAGES', numero: '7074', intitule: "Bonis sur reprises et cessions d'emballages" },
  { role: 'MATERIEL_EMBALLAGE', numero: '243', intitule: "Matériel d'emballage récupérable et identifiable" },
  { role: 'PRODUIT_CESSION_IMMO', numero: '822', intitule: 'Produits des cessions · immobilisations corporelles' },
  { role: 'VALEUR_COMPTABLE_CESSION', numero: '812', intitule: 'Valeurs comptables des cessions · immobilisations corporelles' },
];

const SYCEBNL: CompteEmballage[] = [
  { role: 'CREANCE_CONSIGNATION', numero: '4094', intitule: 'Fournisseurs, créances pour emballages et matériels à rendre' },
  { role: 'DETTE_CONSIGNATION', numero: '4194', intitule: 'Adhérents, clients-usagers créditeurs · dettes pour emballages et matériels consignés' },
  { role: 'ACHAT_EMBALLAGE_RECUPERABLE', numero: '6082', intitule: "Achats d'emballages · Emballages récupérables non identifiables" },
  { role: 'MALI_SUR_EMBALLAGES', numero: '6224', intitule: 'Malis sur emballages' },
  // LE SEUL RÔLE QUI DIVERGE · le SYCEBNL n'ouvre aucune subdivision sous son
  // 707, et sa fiche du compte 41 écrit « le crédit du compte 707 Produits
  // accessoires ». C'est donc le 707 qui reçoit, là où l'AUDCIF écrit 7074.
  { role: 'BONI_SUR_EMBALLAGES', numero: '707', intitule: 'Produits accessoires' },
  { role: 'MATERIEL_EMBALLAGE', numero: '243', intitule: "Matériel d'emballage récupérable et identifiable" },
  { role: 'PRODUIT_CESSION_IMMO', numero: '822', intitule: 'Produits des cessions · immobilisations corporelles' },
  { role: 'VALEUR_COMPTABLE_CESSION', numero: '812', intitule: 'Valeurs comptables des cessions · immobilisations corporelles' },
];

export function comptesDuReferentiel(referentiel: Referentiel): CompteEmballage[] {
  return referentiel === Referentiel.SYCEBNL ? SYCEBNL : SYSCOHADA;
}

/**
 * Le compte qui tient ce rôle dans ce référentiel.
 *
 * LÈVE PLUTÔT QUE DE RENDRE UN DÉFAUT · un rôle non couvert est une erreur de
 * programmation, et lui servir « le plus proche » recréerait exactement le
 * piège que cette table existe pour fermer.
 */
export function compteDuRole(role: RoleCompteEmballage, referentiel: Referentiel): CompteEmballage {
  const trouve = comptesDuReferentiel(referentiel).find((c) => c.role === role);
  if (!trouve) {
    throw new Error(`Aucun compte ne tient le rôle ${role} dans le plan ${referentiel}.`);
  }
  return trouve;
}

/**
 * LES DEUX NUMÉROS QUE LE TEXTE ÉCRIT EN TÊTE DE DIVISION, ET QUE LE MODULE
 * DESCEND D'UN CRAN.
 *
 * Les deux fiches du compte 40 et du compte 41 écrivent « le compte 24
 * Matériel, mobilier et actifs biologiques » et « le compte 82 Produits des
 * cessions d'immobilisations ». Les deux sont des EN-TÊTES DE DIVISION dans
 * les deux plans, et un compte TOTAL ne reçoit jamais d'écriture (CLAUDE.md
 * § 7) · la proposition serait refusée à la saisie.
 *
 * Le module descend donc au 243 (matériel d'emballage récupérable et
 * identifiable) et au 822 (immobilisations corporelles), qui sont les
 * subdivisions que l'objet consigné appelle, ET IL LE DIT · le texte écrit le
 * numéro générique, une autre subdivision peut convenir selon la nature du
 * matériel, et c'est au cabinet de trancher.
 */
export const DESCENTES_DEPUIS_UN_EN_TETE: Readonly<Record<string, string>> = {
  '24': '243',
  '82': '822',
};

export const RESERVE_DESCENTE =
  "Les fiches des comptes 40 et 41 écrivent « le compte 24 » et « le compte 82 », qui sont des " +
  "EN-TÊTES DE DIVISION dans les deux plans et ne reçoivent jamais d'écriture. Le module propose " +
  'le 243 (matériel d\'emballage récupérable et identifiable) et le 822 (immobilisations ' +
  'corporelles), qui sont les subdivisions que l\'objet consigné appelle. Une autre subdivision ' +
  'peut convenir selon la nature du matériel : le choix appartient au cabinet.';

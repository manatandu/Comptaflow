import { Referentiel } from '@prisma/client';

/**
 * LA CONTREPARTIE D'UNE ACQUISITION D'IMMOBILISATION · une liste FERMÉE, lue
 * dans la fiche des comptes 21 à 24 de chaque texte. L'écran proposait tout
 * le plan et le serveur acceptait n'importe quel compte · une charge, un
 * client ou une TVA passait en contrepartie d'un matériel sur une écriture
 * équilibrée, et la balance bouclait.
 *
 * AUDCIF, Titre VII, comptes 21 à 24 · débités « par le crédit du 10
 * (Capital) ; du 46 (Apporteurs, Associés et Groupe) ; des comptes de tiers
 * et de trésorerie concernés ; du 72 (Production immobilisée) ». Les tiers
 * concernés sont les fournisseurs d'immobilisations · la fiche du compte 40
 * EXCLUT les fournisseurs d'immobilisations et les renvoie au 481 ; le 404
 * « acquisitions courantes d'immobilisations » est ouvert au plan.
 *
 * SYCEBNL, Partie 2 ch. 3, comptes 21 à 24 · « par le crédit du compte 10 –
 * Dotation, ou du compte 16 – Fonds affectés aux investissements du projet de
 * développement et assimilés, ou du compte 45 – Fondateurs, ou des comptes de
 * tiers, ou des comptes de trésorerie ». Pas de 72 dans ces fiches.
 *
 * LA NATURE DU BIEN CHOISIT LE SOUS-COMPTE DU FOURNISSEUR · 4811 et 4821
 * (et 4041, 4046 au SYSCOHADA) pour un incorporel (21), 4812 et 4822 (4042,
 * 4047) pour un corporel. Les 4813 (titres non libérés) et 4817 (retenues de
 * garantie) ne sont pas des contreparties d'acquisition d'un bien.
 *
 * Les en-cours (219, 229, 239, 249) qui se soldent à l'achèvement ne passent
 * pas par la création d'une fiche · ils ne sont pas ici.
 */
const TRESORERIE = ['52', '53', '55', '57'];

/**
 * RÉSERVE DE PROPRIÉTÉ (4816) ET FACTURES NON PARVENUES (4818) · LA NATURE DU
 * BIEN SE LIT À UN CRAN PLUS BAS AU SYCEBNL, ET NULLE PART AU SYSCOHADA.
 *
 * SYCEBNL · la fiche du compte 48 (Partie 2 ch. 3) n'ouvre que « 4816 Réserve
 * de propriété » et « 4818 Factures non parvenues », sans les ventiler. Le
 * semis, lui, les subdivise · 48161000 « réserve de propriété
 * (incorporelles) », 48162000 « (corporelles) », 48181000 et 48182000 de même.
 * L'affectation n'est donc PAS du texte · elle vient de l'intitulé du semis et
 * de la symétrie avec 4811 (incorporelles) et 4812 (corporelles), que la fiche
 * écrit, elle. Servir '4816' aux deux natures admettait (et proposait) un
 * matériel crédité au 48161, réserve de propriété d'un INCORPOREL · le compte
 * existe, l'écriture s'équilibre, la balance boucle.
 *
 * SYSCOHADA · le semis ne subdivise pas (48160000, 48170000, 48180000), le
 * compte ne dit pas la nature du bien · '4816' et '4818' restent communs aux
 * deux natures, faute de quoi rien ne pourrait y être crédité. Le Titre VII
 * (compte 48) demande pourtant de « créer des sous-comptes pour distinguer
 * les immobilisations corporelles des incorporelles » · aucun numéro n'en
 * est écrit, et un sous-compte que le cabinet ouvrirait sous le 4816 reste
 * admis pour les deux natures, faute de convention lisible.
 */
const FOURNISSEURS_INCORPORELS: Record<Referentiel, readonly string[]> = {
  [Referentiel.SYSCOHADA]: ['4811', '4816', '4818', '4821'],
  [Referentiel.SYCEBNL]: ['4811', '48161', '48181', '4821'],
};
const FOURNISSEURS_CORPORELS: Record<Referentiel, readonly string[]> = {
  [Referentiel.SYSCOHADA]: ['4812', '4816', '4818', '4822'],
  [Referentiel.SYCEBNL]: ['4812', '48162', '48182', '4822'],
};

const PROPRES: Record<Referentiel, readonly string[]> = {
  // Capital, dotation, capital personnel, compte de l'exploitant · jamais
  // les primes (105), écarts de réévaluation (106) ni le non-appelé (109).
  [Referentiel.SYSCOHADA]: ['101', '102', '103', '104', '46', '72'],
  // Dotations (101, 102, 104) · le 103 est le droit d'entrée des membres,
  // le 106 les écarts de réévaluation. Fonds affectés aux investissements
  // (162 à 165) et dons et legs d'immobilisations (167) · jamais le 161,
  // avances de fonds à justifier, ni le 169, fonds à recevoir.
  [Referentiel.SYCEBNL]: ['101', '102', '104', '162', '163', '164', '165', '167', '45'],
};

export function racinesContrepartieAcquisition(referentiel: Referentiel, compteImmobilisation: string): string[] {
  const incorporel = compteImmobilisation.startsWith('21');
  const fournisseurs = incorporel ? [...FOURNISSEURS_INCORPORELS[referentiel]] : [...FOURNISSEURS_CORPORELS[referentiel]];
  if (referentiel === Referentiel.SYSCOHADA) fournisseurs.push(...(incorporel ? ['4041', '4046'] : ['4042', '4047']));
  return [...PROPRES[referentiel], ...fournisseurs, ...TRESORERIE];
}

export function contrepartieAcquisitionAdmise(referentiel: Referentiel, compteImmobilisation: string, contrepartie: string): boolean {
  return racinesContrepartieAcquisition(referentiel, compteImmobilisation).some((r) => contrepartie.startsWith(r));
}

export function motifRefusContrepartie(referentiel: Referentiel, compteImmobilisation: string, contrepartie: string): string | null {
  if (contrepartieAcquisitionAdmise(referentiel, compteImmobilisation, contrepartie)) return null;
  const texte =
    referentiel === Referentiel.SYSCOHADA
      ? 'AUDCIF, Titre VII, comptes 21 à 24 : capital (10), apporteurs (46), fournisseurs d’investissements (481, 482, 404), trésorerie, production immobilisée (72)'
      : 'SYCEBNL, Partie 2 ch. 3, comptes 21 à 24 : dotation (10), fonds affectés aux investissements (16), fondateurs (45), fournisseurs d’investissements (481), trésorerie';
  return `Le compte ${contrepartie} n'est pas une contrepartie d'acquisition d'immobilisation · ${texte}.`;
}

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

const FOURNISSEURS_INCORPORELS = ['4811', '4816', '4818', '4821'];
const FOURNISSEURS_CORPORELS = ['4812', '4816', '4818', '4822'];

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
  const fournisseurs = incorporel ? [...FOURNISSEURS_INCORPORELS] : [...FOURNISSEURS_CORPORELS];
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

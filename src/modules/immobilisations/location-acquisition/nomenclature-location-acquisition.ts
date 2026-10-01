import { NatureLocationAcquisition, Referentiel } from '@prisma/client';

/**
 * LES COMPTES DE LA LOCATION-ACQUISITION, PAR RÉFÉRENTIEL · aucun numéro de
 * ce cycle n'est écrit ailleurs (même règle que les stocks et la paie), et
 * aucun sans son référentiel. Tous relus dans les deux semis
 * (`nomenclature-location-acquisition.spec.ts`).
 *
 * UN NUMÉRO, DEUX SENS · le 6722 est l'intérêt du crédit-bail IMMOBILIER au
 * SYSCOHADA et celui du crédit-bail MOBILIER au SYCEBNL ; la dette est au 17
 * d'un côté (172, 173, 174, 178), au 187 de l'autre (1871, 1872, 1873) ; les
 * intérêts courus aux 1762 à 1768 d'un côté, au seul 1876 de l'autre.
 *
 * Sources · AUDCIF Titre VII (comptes 17, 62 et 67) et Titre VIII ch. 8
 * § 2.1.7 et 2.1.8 ; SYCEBNL Partie 2 ch. 2 et ch. 3, fiches des comptes 18,
 * 62 et 67. La fiche 18 du SYCEBNL renvoie au « Chapitre 3 : Contrat de
 * location » du SYSCOHADA · le chapitre est le 8 dans l'AUDCIF [texte
 * officiel], signalé et non corrigé.
 */
export interface ComptesLocationAcquisition {
  /** Dette de location-acquisition (crédit à l'entrée, débit du principal). */
  dette: string;
  /** Intérêts courus à la clôture. */
  interetsCourus: string;
  /** Intérêts dans loyers (672x). */
  interets: string;
  /** Redevances de location-acquisition (623x), où vont les loyers. */
  redevances: string;
}

export const COMPTES_LOCATION_ACQUISITION: Record<
  Referentiel,
  Partial<Record<NatureLocationAcquisition, ComptesLocationAcquisition>>
> = {
  [Referentiel.SYSCOHADA]: {
    CREDIT_BAIL_IMMOBILIER: { dette: '17200000', interetsCourus: '17620000', interets: '67220000', redevances: '62320000' },
    CREDIT_BAIL_MOBILIER: { dette: '17300000', interetsCourus: '17630000', interets: '67230000', redevances: '62330000' },
    LOCATION_VENTE: { dette: '17400000', interetsCourus: '17640000', interets: '67240000', redevances: '62340000' },
    AUTRE: { dette: '17800000', interetsCourus: '17680000', interets: '67280000', redevances: '62380000' },
  },
  [Referentiel.SYCEBNL]: {
    CREDIT_BAIL_IMMOBILIER: { dette: '18710000', interetsCourus: '18760000', interets: '67210000', redevances: '62320000' },
    CREDIT_BAIL_MOBILIER: { dette: '18720000', interetsCourus: '18760000', interets: '67220000', redevances: '62330000' },
    LOCATION_VENTE: { dette: '18730000', interetsCourus: '18760000', interets: '67230000', redevances: '62340000' },
    // Le 187 n'ouvre que 1871, 1872, 1873 et 1876 · aucune dette pour une
    // autre location-acquisition. Absente ici, la nature est refusée avec
    // son motif, jamais logée dans un compte voisin.
  },
};

/**
 * LES SOUS-COMPTES DU BIEN « DE LOCATION-ACQUISITION » · mêmes numéros aux
 * deux semis (2286, 2316, 2326, 2416, 2426, 2446, 2456), relus par le spec.
 * AUDCIF Titre VIII ch. 8 § 2.1.7 · le bien est inscrit « au débit des
 * différents comptes usuels de la classe 2 selon leur nature (immobilisations
 * corporelles – location acquisition) », et le § 2.4.1 en exige la mention
 * aux Notes annexes · porté sur ces sous-comptes, il se retrouve.
 */
export const BIENS_IMMOBILIERS_LOCATION_ACQUISITION = ['2286', '2316', '2326'] as const;
export const BIENS_MOBILIERS_LOCATION_ACQUISITION = ['2416', '2426', '2446', '2456'] as const;

export function estCompteDeLocationAcquisition(numero: string): boolean {
  return [...BIENS_IMMOBILIERS_LOCATION_ACQUISITION, ...BIENS_MOBILIERS_LOCATION_ACQUISITION].some((r) => numero.startsWith(r));
}

/** Le motif qui refuse le couple (nature du contrat, compte du bien), ou null. */
export function motifRefusNatureEtCompte(
  referentiel: Referentiel,
  nature: NatureLocationAcquisition,
  numeroBien: string,
): string | null {
  if (!estCompteDeLocationAcquisition(numeroBien)) {
    return (
      `Le compte ${numeroBien} n'est pas un sous-compte « de location-acquisition » · le bien se porte au ` +
      '2286, 2316, 2326, 2416, 2426, 2446 ou 2456 selon sa nature (AUDCIF Titre VIII ch. 8 § 2.1.7 et § 2.4.1).'
    );
  }
  if (!COMPTES_LOCATION_ACQUISITION[referentiel][nature]) {
    return (
      'Le plan SYCEBNL n\'ouvre aucune dette pour une autre location-acquisition (compte 187 · 1871 crédit-bail ' +
      'immobilier, 1872 crédit-bail mobilier, 1873 location-vente, 1876 intérêts courus).'
    );
  }
  const immobilier = BIENS_IMMOBILIERS_LOCATION_ACQUISITION.some((r) => numeroBien.startsWith(r));
  if (nature === NatureLocationAcquisition.CREDIT_BAIL_IMMOBILIER && !immobilier) {
    return `Un crédit-bail immobilier porte un terrain ou un bâtiment (2286, 2316, 2326), pas le ${numeroBien}.`;
  }
  if (nature === NatureLocationAcquisition.CREDIT_BAIL_MOBILIER && immobilier) {
    return `Un crédit-bail mobilier porte un matériel (2416, 2426, 2446, 2456), pas le ${numeroBien}.`;
  }
  return null;
}

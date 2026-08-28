/**
 * Familles d'immobilisations proposées par défaut à la création d'un tenant —
 * un point de départ courant pour une association/ONG (informatique,
 * mobilier, véhicules, bâtiments), pas une liste exhaustive : le cabinet en
 * crée d'autres au besoin via l'écran (même logique que le plan de comptes,
 * volontairement pas seedé "à l'exhaustive" au-delà du raisonnable — voir
 * compte-seed.ts).
 *
 * Comptes rattachés : voir compte-seed.ts (classe 2 = immobilisation, classe
 * 28 = amortissement cumulé, 681200/681300 = dotation incorporelle/
 * corporelle — skill sycebnl, COMPTE 21 à 28).
 *
 * Durées par défaut : arrêté ministériel n° 013/CAB/MIN/FINANCES/2025 du
 * 19/02/2025 (skill fiscalite-rdc/socle, `amortissements-am-013-2025.md`),
 * taux d'amortissement linéaire, entré en vigueur le 01/01/2026. Le SYCEBNL
 * lui-même ne fixe aucune durée chiffrée (« selon les usages de la
 * profession » — COMPTE 28) ; l'arrêté RDC est la source la plus concrète
 * disponible pour un défaut réaliste. Modifiable au cas par cas (art. 4 de
 * l'arrêté : taux dérogatoires possibles si justifiés au contrôle).
 */
export const FAMILLES_IMMOBILISATION_DEFAUT: Array<{
  code: string;
  intitule: string;
  numeroCompteImmobilisation: string;
  numeroCompteAmortissement: string;
  numeroCompteDotation: string;
  dureeAmortissementAns: number;
}> = [
  {
    code: 'LOGICIELS',
    intitule: 'Logiciels et brevets',
    numeroCompteImmobilisation: '21310000',
    numeroCompteAmortissement: '28130000',
    numeroCompteDotation: '68120000',
    dureeAmortissementAns: 5, // arrêté 013/2025, I.1 "Brevets, licences et logiciels"
  },
  {
    code: 'BATIMENTS',
    intitule: 'Bâtiments administratifs',
    numeroCompteImmobilisation: '23130000',
    numeroCompteAmortissement: '28310000',
    numeroCompteDotation: '68130000',
    dureeAmortissementAns: 20, // arrêté 013/2025, II.2 "Bâtiments commerciaux, industriels, garages, hangars, ateliers"
  },
  {
    code: 'INFORMATIQUE',
    intitule: 'Matériel informatique et bureautique',
    numeroCompteImmobilisation: '24420000',
    numeroCompteAmortissement: '28440000',
    numeroCompteDotation: '68130000',
    dureeAmortissementAns: 5, // arrêté 013/2025, VI.4 "Matériels de bureau"
  },
  {
    code: 'MOBILIER',
    intitule: 'Mobilier de bureau',
    numeroCompteImmobilisation: '24410000',
    numeroCompteAmortissement: '28440000',
    numeroCompteDotation: '68130000',
    dureeAmortissementAns: 10, // arrêté 013/2025, VI.2 "Mobiliers de bureau ou autres"
  },
  {
    code: 'VEHICULES',
    intitule: 'Véhicules automobiles',
    numeroCompteImmobilisation: '24510000',
    numeroCompteAmortissement: '28450000',
    numeroCompteDotation: '68130000',
    dureeAmortissementAns: 3, // arrêté 013/2025, V.14-16 "Véhicules automobiles..."
  },
  {
    code: 'AGENCEMENTS',
    intitule: 'Agencements et aménagements',
    numeroCompteImmobilisation: '23450000',
    numeroCompteAmortissement: '28350000',
    numeroCompteDotation: '68130000',
    dureeAmortissementAns: 10, // arrêté 013/2025, VI.1 "Agencements, aménagements, installations"
  },
];

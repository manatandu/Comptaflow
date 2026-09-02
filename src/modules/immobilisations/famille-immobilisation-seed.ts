/**
 * Familles d'immobilisations proposées par défaut à la création d'un tenant ·
 * un point de départ courant pour une association/ONG (informatique,
 * mobilier, véhicules, bâtiments), pas une liste exhaustive : le cabinet en
 * crée d'autres au besoin via l'écran (même logique que le plan de comptes,
 * volontairement pas seedé "à l'exhaustive" au-delà du raisonnable · voir
 * compte-seed.ts).
 *
 * Comptes rattachés : voir compte-seed.ts (classe 2 = immobilisation, classe
 * 28 = amortissement cumulé, 681200/681300 = dotation incorporelle/
 * corporelle · skill sycebnl, COMPTE 21 à 28).
 *
 * Durées par défaut : arrêté ministériel n° 013/CAB/MIN/FINANCES/2025 du
 * 19/02/2025 (skill fiscalite-rdc/socle, `amortissements-am-013-2025.md`),
 * taux d'amortissement linéaire, entré en vigueur le 01/01/2026. Le SYCEBNL
 * lui-même ne fixe aucune durée chiffrée (« selon les usages de la
 * profession » · COMPTE 28) ; l'arrêté RDC est la source la plus concrète
 * disponible pour un défaut réaliste. Modifiable au cas par cas (art. 4 de
 * l'arrêté : taux dérogatoires possibles si justifiés au contrôle).
 *
 * DEUX LISTES, une par référentiel · les numéros coïncident presque partout
 * (les deux plans descendent de la même ossature OHADA), mais pas partout,
 * et un numéro copié du mauvais plan est exactement la faute que la règle
 * « jamais un compte de mémoire » interdit. Divergences vérifiées dans le
 * plan SYSCOHADA (skill syscohada, plan-comptes.tsv) :
 *  - mobilier de bureau : 2444 en SYSCOHADA (2441 y est « Matériel de
 *    bureau »), là où le SYCEBNL le range en 2441 « Matériel et mobilier de
 *    bureau » ;
 *  - amortissement des agencements : 2834 en SYSCOHADA (« aménagements,
 *    agencements et installations techniques », l'exact vis-à-vis du 234),
 *    là où le semis SYCEBNL passe par 2835.
 */
type FamilleSeed = {
  code: string;
  intitule: string;
  numeroCompteImmobilisation: string;
  numeroCompteAmortissement: string;
  numeroCompteDotation: string;
  dureeAmortissementAns: number;
};

export const FAMILLES_IMMOBILISATION_DEFAUT: FamilleSeed[] = [
  {
    /*
      LE LIBELLÉ POUSSAIT À UNE IMPUTATION FAUSSE. « Logiciels et brevets »
      imputait sur 2131 « Logiciels », amorti en 2813 « Amortissements des
      logiciels et sites internet » : un brevet rangé dans cette famille
      partait donc en logiciel. Les brevets ont leur propre compte, 2121, et
      leur propre compte d'amortissement, 2812.

      Les deux plans portent ces comptes aux mêmes numéros, la correction vaut
      donc pour les deux référentiels. Elle ne déplace aucun montant AU BILAN ·
      le poste AF « Brevets, licences, logiciels et droits similaires » agrège
      212, 213, 214 et leurs amortissements · elle rétablit le détail par
      nature des immobilisations incorporelles, qui est ce que la note annexe
      des immobilisations donne à lire.
    */
    code: 'LOGICIELS',
    intitule: 'Logiciels',
    numeroCompteImmobilisation: '21310000',
    numeroCompteAmortissement: '28130000',
    numeroCompteDotation: '68120000',
    dureeAmortissementAns: 5, // arrêté 013/2025, I.1 "Brevets, licences et logiciels"
  },
  {
    code: 'BREVETS',
    intitule: 'Brevets et licences',
    numeroCompteImmobilisation: '21210000',
    numeroCompteAmortissement: '28120000',
    numeroCompteDotation: '68120000',
    // Même ligne I.1 de l'arrêté 013/2025 que les logiciels. Le durée
    // COMPTABLE, elle, ne peut pas excéder celle de la protection juridique
    // du titre (AUDCIF, Titre VII, commentaire du compte 212) : cinq ans est
    // un défaut, à raccourcir dossier par dossier quand le titre est plus
    // court.
    dureeAmortissementAns: 5,
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

/**
 * Mêmes familles, mêmes durées (l'arrêté 013/2025 s'applique quel que soit
 * le référentiel comptable), comptes du plan SYSCOHADA · voir l'en-tête pour
 * les deux divergences de numérotation.
 */
export const FAMILLES_IMMOBILISATION_DEFAUT_SYSCOHADA: FamilleSeed[] = FAMILLES_IMMOBILISATION_DEFAUT.map((f) => {
  if (f.code === 'MOBILIER') {
    return { ...f, intitule: 'Mobilier de bureau', numeroCompteImmobilisation: '24440000' };
  }
  if (f.code === 'AGENCEMENTS') {
    return { ...f, numeroCompteAmortissement: '28340000' };
  }
  if (f.code === 'INFORMATIQUE') {
    // 2442 « Matériel informatique » en SYSCOHADA (la bureautique a son
    // propre 2443) · même numéro qu'en SYCEBNL, intitulé recadré.
    return { ...f, intitule: 'Matériel informatique' };
  }
  return f;
});

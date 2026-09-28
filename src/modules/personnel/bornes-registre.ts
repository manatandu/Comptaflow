/**
 * LES BORNES DES COLLECTIONS IMBRIQUÉES DU REGISTRE (audit final F259, reste ;
 * CLAUDE.md § 8 bis).
 *
 * Le registre était borné salarié par salarié, mais chaque fiche rendue
 * portait TOUS ses enfants et TOUS ses contrats · mille fiches bornées
 * pouvaient ainsi ramener une collection que rien ne bornait. Ce sont des
 * bornes d'ÉCRAN, jamais une règle de droit : aucune ne limite ce qu'un
 * salarié peut avoir, et une fiche qui les dépasse le DIT (`total` compté par
 * la base, `tronque`).
 *
 * Elles vivent dans ce fichier plutôt que dans le service parce que le DTO du
 * salarié les lit aussi · le service importe le DTO, et l'inverse ferait une
 * importation circulaire.
 */

/**
 * Enfants à charge rendus par fiche · très au-delà d'une famille réelle.
 * C'est AUSSI le plafond du tableau `enfants` du DTO, et ce n'est pas un
 * hasard : la fiche REMPLACE ses enfants en bloc à l'enregistrement, si bien
 * qu'un écran qui n'en aurait montré qu'une partie effacerait les autres en
 * enregistrant une adresse.
 */
export const PLAFOND_ENFANTS_PAR_FICHE = 50;

/**
 * Contrats rendus par fiche · les plus récents, le contrat en cours d'abord.
 * Un contrat ne se remplace jamais en bloc, la troncature n'efface donc rien ;
 * elle se dit, et `nombreContrats` reste le total compté par la base.
 */
export const PLAFOND_CONTRATS_PAR_FICHE = 100;

/**
 * Grilles SMIG du cabinet lues par la confrontation. Le décret n° 25/21
 * ajuste le SMIG « à partir du mois de janvier de chaque année » (art. 11,
 * lu dans `baremes-dossier.ts`), et une version du cabinet ne peut prendre
 * effet qu'un mois après la précédente · deux cent quarante grilles couvrent
 * vingt ans d'ajustements MENSUELS. Au-delà, les plus anciennes ne sont pas
 * lues, et la confrontation s'abstient sur les contrats qu'elles pourraient
 * régir (`verdictRemunerationMinimale`, motif GRILLES_SMIG_NON_LUES) plutôt
 * que de les juger sur une grille qui n'est peut-être pas la leur.
 */
export const PLAFOND_GRILLES_SMIG = 240;

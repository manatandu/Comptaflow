/**
 * LA SITUATION INTERMÉDIAIRE · AUDCIF, Titre VIII ch. 39 « Comptes
 * intermédiaires ».
 *
 * CE QUI N'EXISTAIT PAS. Aucun état ne prenait de date, et la balance
 * elle-même était bornée à l'exercice : il n'y avait AUCUN chemin, pas même
 * manuel, pour obtenir une situation arrêtée au 30 juin. Un cabinet à qui une
 * banque ou un conseil d'administration en demandait une devait la monter hors
 * du logiciel.
 *
 * CE QUE LE CHAPITRE EXIGE, ET CE QU'IL NE FAIT QUE RECOMMANDER. Le verbe
 * compte : les dispositions « RECOMMANDENT aux entités qui établissent des
 * comptes intermédiaires de préparer un jeu complet de comptes », et le
 * chapitre « ne précise pas les catégories d'entités qui doivent publier des
 * comptes intermédiaires » ni « la fréquence ni le délai ». Ce n'est donc pas
 * une obligation du logiciel · c'est une règle DE FORME qui s'applique dès
 * lors qu'un dossier en publie, et c'est elle qui est servie ici.
 *
 * LE PIÈGE DE CE CHAPITRE est qu'une situation servie à moitié est un état
 * INCOMPLET au sens du texte, pas un service rendu : le § 2.1.2 réclame des
 * comparatifs précis et le § 2.1.1 une déclaration sur les méthodes. Les
 * servir tous les deux est la seule façon de ne pas remplacer un manque par un
 * document faux.
 */

/** La déclaration du § 2.1.1, premier tiret · reprise mot pour mot du texte. */
export const DECLARATION_METHODES_IDENTIQUES =
  'Les méthodes comptables et les modalités de calcul adoptées sont identiques à celles utilisées dans les ' +
  "comptes de l'exercice les plus récents (AUDCIF, Titre VIII ch. 39 § 2.1.1). Si elles ont changé, la nature de " +
  'ces changements et leur incidence doivent être décrites, et l’information comparative retraitée pro-forma.';

/**
 * Ce que cette situation N'EST PAS, dit sur le document lui-même.
 *
 * Le § 2.1.2 réclame quatre comparatifs et le § 2.1.1 une liste de mentions
 * que le logiciel ne peut pas produire seul (éléments exceptionnels,
 * changements d'estimation, transactions avec les parties liées, caractère
 * saisonnier de l'activité). Une situation qui se présenterait comme le « jeu
 * complet » du chapitre sans elles serait un document faux · celle-ci se
 * présente pour ce qu'elle est.
 */
export const RESERVE_JEU_INCOMPLET =
  'Situation intermédiaire · elle n’est pas un jeu complet de comptes intermédiaires au sens du ch. 39 : les ' +
  'mentions du § 2.1.1 qui ne se déduisent d’aucun solde (éléments exceptionnels, changements d’estimation, ' +
  'transactions avec les parties liées, caractère saisonnier de l’activité) restent à rédiger.';

export interface BornesExercice {
  dateDebut: Date;
  dateFin: Date;
}

/**
 * REFUS D'UNE DATE HORS DE L'EXERCICE, et il n'est pas cosmétique.
 *
 * En deçà de l'ouverture, la balance perdrait l'écriture de report à-nouveau
 * (datée de l'ouverture) et présenterait des soldes amputés du bilan
 * d'ouverture, sans qu'aucun total ne le trahisse. Au-delà de la clôture, la
 * borne ne retiendrait rien de plus que l'exercice entier tout en faisant
 * porter au document la mention « arrêté au », qui serait alors fausse.
 */
export function motifRefusDateArrete(arreteAu: Date, exercice: BornesExercice): string | null {
  if (arreteAu < exercice.dateDebut) {
    return (
      `Une situation ne s’arrête pas avant l’ouverture de l’exercice (${jour(exercice.dateDebut)}) · en deçà, ` +
      'le report à-nouveau sort de la lecture et les soldes seraient amputés du bilan d’ouverture sans qu’aucun ' +
      'total ne le signale.'
    );
  }
  if (arreteAu > exercice.dateFin) {
    return (
      `Une situation ne s’arrête pas après la clôture de l’exercice (${jour(exercice.dateFin)}) · au-delà, la ` +
      'borne ne retient rien de plus que l’exercice entier, et la mention « arrêté au » du document serait fausse.'
    );
  }
  return null;
}

/**
 * LA MÊME PÉRIODE DE L'EXERCICE PRÉCÉDENT · § 2.1.2, deuxième tiret.
 *
 * Le texte réclame, pour le compte de résultat, TROIS colonnes : le cumulé de
 * la période, « le compte de résultat pour la même période de l'exercice
 * précédent », et celui de l'exercice précédent entier. La deuxième est celle
 * qui donne du sens à la première · comparer un semestre à une année entière
 * ferait conclure à un effondrement là où il n'y a qu'une demi-période.
 *
 * La date équivalente est le MÊME JOUR DU MÊME MOIS sur l'exercice précédent,
 * ce que l'art. 7 rend non ambigu en faisant coïncider l'exercice avec l'année
 * civile. Elle est rendue NULLE quand elle tombe hors de cet exercice, ce qui
 * arrive sur un premier exercice court ou un exercice de liquidation : mieux
 * vaut une colonne absente qu'une colonne qui compare deux périodes de
 * longueurs différentes sans le dire.
 */
export function memePeriodeExercicePrecedent(arreteAu: Date, exerciceN1: BornesExercice | null): Date | null {
  if (!exerciceN1) return null;
  const equivalent = new Date(
    Date.UTC(
      exerciceN1.dateFin.getUTCFullYear(),
      arreteAu.getUTCMonth(),
      arreteAu.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
  if (equivalent < exerciceN1.dateDebut || equivalent > exerciceN1.dateFin) return null;
  return equivalent;
}

/**
 * La date d'arrêté telle qu'elle doit être LUE · fin de journée.
 *
 * Une écriture datée du 30 juin appartient à la situation au 30 juin. Sans
 * cette borne à la fin de la journée, une date reçue à minuit exclurait toutes
 * les écritures du jour même, et la situation serait celle de la veille sous
 * un titre qui dirait autre chose.
 */
export function finDeJournee(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
  );
}

const jour = (d: Date) => d.toISOString().slice(0, 10);

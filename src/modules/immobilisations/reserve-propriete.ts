import { Referentiel } from '@prisma/client';

/**
 * LA CLAUSE DE RÉSERVE DE PROPRIÉTÉ · LOT 15 (première part). Une
 * INFORMATION de fiche, jamais une règle de calcul.
 *
 * Le bien entre à l'actif comme si l'entité en était propriétaire ·
 * « malgré l'existence de la clause, l'achat-vente est enregistré comme une
 * vente ordinaire et en produit tous les effets » ; l'acheteur « procède aux
 * évaluations et constitue, le cas échéant, des amortissements ou des
 * provisions comme s'il était propriétaire » (AUDCIF Titre VIII ch. 9, en
 * tête et § 2.1). SYCEBNL, cadre conceptuel § 3.3.1.1.6 · « inscription à
 * l'actif du bilan (comme si l'entité en était propriétaire) des biens
 * détenus avec clause de "réserve de propriété" ». Le compte, le plan
 * d'amortissement et la sortie ne bougent donc pas.
 *
 * CE QUE LA CLAUSE DEMANDE · l'information. AUDCIF ch. 9 § 3 · les montants
 * « des immobilisations frappées de R/P » sont indiqués aux Notes annexes,
 * « quelle que soit l'importance relative des montants », jusqu'au
 * « règlement final », où « l'effet de la clause disparaît » sans incidence
 * sur les écritures (§ 1.2). D'où la date du règlement final, déclarée.
 *
 * Le SYCEBNL n'écrit pas cette note · la liste lui est servie comme
 * information, citée à son cadre conceptuel, sans prétendre qu'elle est due.
 * Les comptes d'engagements 90 et 91 du § 3.1 sont « facultatifs » · le
 * module ne les passe pas.
 */

/**
 * La dette d'un fournisseur d'investissements à clause de réserve de
 * propriété · 4816 aux deux plans (48160000 au SYSCOHADA ; 48161000 et
 * 48162000 au SYCEBNL, subdivisés par nature). Une acquisition qui la
 * crédite porte la clause, et la fiche ne peut pas dire le contraire.
 */
export const RACINE_DETTE_RESERVE_PROPRIETE = '4816';

export function contrepartieAReserveDePropriete(numeroContrepartie: string | null | undefined): boolean {
  return !!numeroContrepartie && numeroContrepartie.startsWith(RACINE_DETTE_RESERVE_PROPRIETE);
}

/** Le motif qui interdit la déclaration, ou `null`. */
export function motifRefusReserveDePropriete(e: {
  reserveDePropriete: boolean;
  leveeLe: Date | null;
  dateAcquisition: Date;
  /** Le compte crédité à l'acquisition, quand il est connu. */
  numeroContrepartie?: string | null;
}): string | null {
  if (!e.reserveDePropriete) {
    if (contrepartieAReserveDePropriete(e.numeroContrepartie)) {
      return (
        `La dette d'acquisition est portée au ${e.numeroContrepartie} « Réserve de propriété » · la fiche ne peut pas ` +
        "dire que le bien n'est pas frappé de la clause. Déclarez plutôt la date du règlement final."
      );
    }
    if (e.leveeLe) return 'Une date de règlement final ne se déclare que pour un bien frappé de la clause.';
    return null;
  }
  if (e.leveeLe && e.leveeLe < e.dateAcquisition) {
    return "Le règlement final ne peut pas précéder l'acquisition du bien.";
  }
  return null;
}

/**
 * Le bien est-il frappé de la clause à cette date ? Acquis, pas encore
 * sorti, et le règlement final pas encore intervenu.
 */
export function frappeDeReserveALaDate(
  immo: { reserveDePropriete: boolean; reserveProprieteLeveeLe: Date | null; dateAcquisition: Date; dateSortie: Date | null },
  date: Date,
): boolean {
  if (!immo.reserveDePropriete) return false;
  if (immo.dateAcquisition > date) return false;
  if (immo.dateSortie && immo.dateSortie <= date) return false;
  if (immo.reserveProprieteLeveeLe && immo.reserveProprieteLeveeLe <= date) return false;
  return true;
}

/**
 * UNE DÉCLARATION NE RÉÉCRIT PAS LA LISTE D'UN EXERCICE CLOS (relecture du lot
 * 15a, défaut MINEUR). La liste des biens frappés est servie à la clôture de
 * chaque exercice (AUDCIF ch. 9 § 3, Notes annexes) · déclarer, lever ou
 * redater la clause après coup changerait en silence ce qu'un exercice
 * clôturé a publié. Refusé dès qu'une clôture verrait le bien autrement
 * qu'avant ; une déclaration qui ne touche que les exercices ouverts passe.
 * `null` quand rien de clos ne change.
 */
export function motifRefusReserveSurExerciceClos(
  avant: { reserveDePropriete: boolean; reserveProprieteLeveeLe: Date | null; dateAcquisition: Date; dateSortie: Date | null },
  apres: { reserveDePropriete: boolean; reserveProprieteLeveeLe: Date | null },
  exercicesClos: ReadonlyArray<{ dateFin: Date }>,
): string | null {
  const nouveau = { ...avant, ...apres };
  const touche = exercicesClos.find((e) => frappeDeReserveALaDate(avant, e.dateFin) !== frappeDeReserveALaDate(nouveau, e.dateFin));
  if (!touche) return null;
  return (
    `L'exercice clos le ${touche.dateFin.toISOString().slice(0, 10)} verrait sa liste des biens sous réserve de ` +
    'propriété changée · la clause et la date du règlement final ne se déclarent que sur ce que voient les ' +
    'exercices encore ouverts.'
  );
}

export function sourceReserveDePropriete(referentiel: Referentiel): string {
  return referentiel === Referentiel.SYSCOHADA
    ? 'AUDCIF, Titre VIII ch. 9 § 3 (Notes annexes)'
    : 'SYCEBNL, cadre conceptuel § 3.3.1.1.6 (information, le texte n’écrit pas la note)';
}

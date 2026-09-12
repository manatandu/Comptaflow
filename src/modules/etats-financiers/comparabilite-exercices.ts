import { Referentiel } from '@prisma/client';

/**
 * COMPARABILITÉ DE LA COLONNE N-1 · le second alinéa que le logiciel servait
 * sans jamais le lire.
 *
 * Les deux textes imposent la colonne comparative, et ils imposent dans la
 * MÊME phrase ce qu'il faut faire quand elle ne vaut rien :
 *
 *   « chacun des postes des états financiers comporte l'indication du chiffre
 *   relatif au poste correspondant de l'exercice précédent.
 *   Lorsque l'un des postes chiffrés d'un état financier N'EST PAS COMPARABLE
 *   à celui de l'exercice précédent, C'EST CE DERNIER QUI DOIT ÊTRE ADAPTÉ.
 *   L'ABSENCE DE COMPARABILITÉ ou l'adaptation des chiffres EST SIGNALÉE DANS
 *   LES NOTES ANNEXES. »
 *
 * OmegaX servait le premier alinéa à treize endroits et ignorait le second :
 * la colonne N-1 partait d'office, sans qu'aucun écran ne se demande si les
 * deux exercices se comparent. C'est un défaut du § 10 bis dans sa forme la
 * plus discrète · tous les totaux sont justes, le bilan boucle, la colonne
 * est remplie, et le lecteur en tire un taux de croissance qui ne veut rien
 * dire.
 *
 * DEUX CHEMINS D'ARTICLE, ET ILS NE SE SERVENT JAMAIS L'UN POUR L'AUTRE.
 * Côté SYSCOHADA, AUDCIF art. 34, dernier alinéa. Côté SYCEBNL, l'art. 34 est
 * justement dans la liste d'exclusion de son art. 3 (« à l'exception des
 * articles 5, 8, 10 à 13, 17 alinéas 7 et 8, 18, 19 quatrième tiret, 21,
 * 25 À 34, 49, 69, 70, 71, 73 à 113 ») · la règle lui vient de son PROPRE
 * art. 16, 7°, qui l'écrit mot pour mot. Citer l'AUDCIF à une association
 * serait invoquer un article que son référentiel écarte.
 *
 * LE LOGICIEL N'ADAPTE JAMAIS, ET C'EST LE REFUS DE CE CHANTIER. Le texte dit
 * « c'est ce dernier qui doit être adapté » · par l'ENTITÉ, dans ses états.
 * Proratiser un compte de résultat sur le rapport des durées fabriquerait des
 * chiffres que personne n'a décidés, et proratiser un bilan n'a même pas de
 * sens · un bilan est un stock à une date, pas un flux. Une adaptation
 * automatique donnerait une colonne plausible, comparable, et inventée : le
 * pire des trois états possibles. Le module CONSTATE et NOMME ; l'adaptation
 * et la mention en Notes annexes appartiennent au cabinet. Un test gèle
 * l'absence de tout prorata dans ce fichier.
 */

/** Ce qui peut rendre deux exercices non comparables, et que le logiciel sait lire. */
export type CodeNonComparabilite = 'DUREE_DIFFERENTE';

export interface MotifNonComparabilite {
  code: CodeNonComparabilite;
  phrase: string;
}

export interface Comparabilite {
  /** Il existe un exercice antérieur · sans lui il n'y a pas de colonne du tout. */
  disponible: boolean;
  /** Vrai quand rien de ce que le logiciel sait lire ne s'oppose à la comparaison. */
  comparable: boolean;
  motifs: MotifNonComparabilite[];
  /** Le chemin par lequel la règle atteint CE dossier. */
  article: string;
}

export interface BorneExercice {
  dateDebut: Date;
  dateFin: Date;
}

/**
 * Durée d'un exercice, EN MOIS DE CALENDRIER et non en jours.
 *
 * L'unité est celle du texte · AUDCIF art. 7, « une période de DOUZE MOIS,
 * appelée exercice ». Compter en jours ferait de toute année bissextile une
 * non-comparabilité (366 contre 365) et le signalement crierait un an sur
 * quatre sur tous les dossiers du parc · exactement l'avertissement qu'on
 * apprend à ignorer avant le jour où il compte.
 *
 * LIMITE ASSUMÉE, écrite plutôt que cachée : le compte porte sur les mois que
 * l'exercice TRAVERSE. Un exercice qui ne commence pas un premier ni ne finit
 * un dernier jour de mois (une reprise de dossier en cours de mois) est compté
 * par le mois où tombe sa borne. Le cas est irrégulier au regard de l'art. 7
 * lui-même, et aucune source lue ne dit comment l'arrondir.
 */
export function moisCouverts(borne: BorneExercice): number {
  const d = borne.dateDebut;
  const f = borne.dateFin;
  return (f.getUTCFullYear() - d.getUTCFullYear()) * 12 + (f.getUTCMonth() - d.getUTCMonth()) + 1;
}

/**
 * L'article applicable au dossier. Jamais celui de l'autre référentiel · voir
 * l'en-tête de ce fichier pour la raison, et un test le vérifie dans les deux
 * sens.
 */
export function articleComparabilite(referentiel: Referentiel): string {
  return referentiel === Referentiel.SYCEBNL
    ? "SYCEBNL art. 16, 7°, deuxième alinéa · l'art. 34 de l'AUDCIF, qui porte la même règle côté SYSCOHADA, " +
        "fait partie des articles 25 à 34 que l'art. 3 du SYCEBNL écarte expressément"
    : 'AUDCIF art. 34, dernier alinéa';
}

/**
 * Confronte l'exercice à son précédent. `precedent` à `null` (premier
 * exercice du dossier) rend `disponible: false` et AUCUN motif · il n'y a pas
 * de colonne à qualifier, et signaler une non-comparabilité là serait
 * reprocher à un dossier neuf de n'avoir pas de passé.
 *
 * L'exercice est réputé COMPARABLE par défaut. Le texte fait de la colonne la
 * règle et de l'exception l'exception ; présumer l'inverse ferait naître un
 * avertissement sur chaque dossier normal.
 */
export function evaluerComparabilite(
  referentiel: Referentiel,
  courant: BorneExercice,
  precedent: BorneExercice | null,
): Comparabilite {
  const article = articleComparabilite(referentiel);
  if (!precedent) return { disponible: false, comparable: true, motifs: [], article };

  const motifs: MotifNonComparabilite[] = [];
  const moisN = moisCouverts(courant);
  const moisN1 = moisCouverts(precedent);
  if (moisN !== moisN1) {
    // Le cas n'a rien d'exotique · l'art. 7 l'autorise nommément (« La durée
    // de l'exercice est exceptionnellement inférieure à douze mois pour le
    // premier exercice débutant au cours du premier semestre […] supérieure à
    // douze mois pour le premier exercice commencé au cours du deuxième
    // semestre »). C'est donc la DEUXIÈME liasse de tout dossier ouvert en
    // cours d'année qui porte la colonne fautive.
    motifs.push({
      code: 'DUREE_DIFFERENTE',
      phrase:
        `L’exercice couvre ${moisN} mois et le précédent ${moisN1}. Les charges et les produits d’une ` +
        'période plus courte ne se comparent pas terme à terme à ceux d’une période plus longue.',
    });
  }

  return { disponible: true, comparable: motifs.length === 0, motifs, article };
}

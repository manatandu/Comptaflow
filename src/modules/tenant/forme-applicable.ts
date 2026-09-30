import { FormeJuridiqueSyscohada } from '@prisma/client';
import { FORMES_SOCIETES_COMMERCIALES } from './mentions-societe';

/**
 * LA FORME JURIDIQUE D'UN EXERCICE, ET PAS CELLE DU JOUR (passe O1a, D3).
 *
 * `modifierFormeSyscohada` écrivait la forme sans date, et tout ce qui en
 * dépend (réserve légale, rapport de gestion, obligation de contrôleur) lisait
 * la forme du jour, quel que soit l'exercice examiné. Or l'AUSCGIE dit :
 *
 *  · art. 182 · « La transformation prend effet à compter du jour où la
 *    décision la constatant est prise. […] La transformation ne peut avoir
 *    d'effet rétroactif. » ;
 *  · art. 183, al. 2 · « Les états financiers de synthèse de l'exercice au
 *    cours duquel la transformation est intervenue sont arrêtés et approuvés
 *    suivant les règles régissant la nouvelle forme juridique de la société. Il
 *    en est de même de la répartition des bénéfices. »
 *
 * D'où la règle, et elle ne vit qu'ici : un exercice qui se termine AVANT la
 * date d'effet garde l'ancienne forme ; celui au cours duquel elle intervient,
 * et les suivants, prennent la nouvelle. Une SARL devenue SA en 2027 ne se voit
 * pas réclamer pour 2025 un commissaire « sans condition de taille », au titre
 * d'une forme qu'elle n'avait pas.
 *
 * UNE CORRECTION N'EST PAS UNE TRANSFORMATION · sans date d'effet déclarée, la
 * forme vaut pour tous les exercices, comme une saisie erronée qu'on rectifie.
 * Et une transformation n'existe qu'entre sociétés de l'AUSCGIE (art. 181) ·
 * le passage vers une forme qui n'en est pas une relève d'un autre événement
 * (art. 188), et ne se déclare pas ici.
 */
export interface FormeDatee {
  formeJuridiqueSyscohada: FormeJuridiqueSyscohada | null;
  formeJuridiqueSyscohadaAnterieure?: FormeJuridiqueSyscohada | null;
  dateTransformationForme?: Date | null;
}

export function formeApplicable(t: FormeDatee, dateFinExercice: Date): FormeJuridiqueSyscohada | null {
  if (t.dateTransformationForme && t.formeJuridiqueSyscohadaAnterieure && dateFinExercice < t.dateTransformationForme) {
    return t.formeJuridiqueSyscohadaAnterieure;
  }
  return t.formeJuridiqueSyscohada;
}

/** La transformation intervient-elle AU COURS de cet exercice ? (art. 183 et 185) */
export function exerciceDeTransformation(t: FormeDatee, exercice: { dateDebut: Date; dateFin: Date }): boolean {
  const d = t.dateTransformationForme;
  return Boolean(d && t.formeJuridiqueSyscohadaAnterieure && d >= exercice.dateDebut && d <= exercice.dateFin);
}

/** Pourquoi ce changement de forme ne peut pas se déclarer comme une transformation, ou null. */
export function motifRefusTransformation(
  ancienne: FormeJuridiqueSyscohada | null,
  nouvelle: FormeJuridiqueSyscohada,
  dateEffet: Date,
  aujourdHui: Date,
): string | null {
  if (!ancienne || ancienne === nouvelle) {
    return 'Une transformation change la forme d’une société (AUSCGIE art. 181) · la forme actuelle n’est pas renseignée, ou elle est la même.';
  }
  if (!FORMES_SOCIETES_COMMERCIALES.includes(ancienne) || !FORMES_SOCIETES_COMMERCIALES.includes(nouvelle)) {
    return (
      'La transformation de l’art. 181 de l’AUSCGIE change la forme d’une société commerciale en une autre · un ' +
      'passage vers ou depuis une forme qui n’en est pas une relève d’un autre texte (art. 188) et ne se déclare ' +
      'pas comme une transformation. Enregistrez la forme sans date d’effet si c’est une correction.'
    );
  }
  if (dateEffet > aujourdHui) {
    return 'La transformation prend effet au jour de la décision qui la constate (AUSCGIE art. 182) · une décision future ne se déclare pas.';
  }
  return null;
}

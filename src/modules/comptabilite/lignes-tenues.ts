import { designationLettrage, estTenueParUnLettrage } from '../lettrage/ligne-lettree';

/**
 * LES ISSUES RÉELLES, nommées par les gestes qui existent (septième
 * relecture, m2) · relues dans le code, pas supposées.
 *  · RAPPROCHEMENT CLOS · `RapprochementService.rouvrir` (`POST
 *    /rapprochements/:id/rouvrir`), administrateur seul, motif, le DERNIER
 *    clos du compte seulement ; en cours, on dépointe directement.
 *  · LETTRAGE FIGÉ · `gel-cloture.ts` · une clôture TOTALE, de PÉRIODE ou
 *    d'EXERCICE fige le lettrage, et `ExerciceService.annulerCloture` refuse
 *    les deux premières (« définitive et ne peut pas être annulée ») · aucun
 *    geste ne rouvre la période, et on ne le promet pas. Seule la PARTIELLE
 *    s'annule, et elle ne fige rien.
 */
const ISSUE_RAPPROCHEMENT_CLOS =
  'Un rapprochement encore en cours se dépointe directement ; clos, seul l’administrateur le rouvre (« Rouvrir le rapprochement », ' +
  'le dernier clos du compte seulement, motif exigé), puis la ligne se dépointe.';
/**
 * Second tour d'A7 ter, B-1 · l'issue d'un lettrage FIGÉ dépend de l'exercice.
 * Clôturé, l'erreur relève du report à nouveau (AUDCIF art. 20, al. 3). Encore
 * OUVERT (une clôture de période ou totale seulement), l'erreur est de
 * l'exercice en cours · son inscription en négatif reste due (art. 20, al. 2),
 * au premier jour non clôturé (art. 22, 4°) · renvoyer au report à nouveau
 * était faux. Le module des créances douteuses l'inscrit à côté de son groupe
 * figé ; pour une autre écriture, OmegaX ne l'inscrit pas sur une ligne
 * lettrée, et le message le dit plutôt que de promettre une issue (relevé au
 * suivi).
 */
const ISSUE_LETTRAGE_FIGE =
  'Une ligne figée par une clôture totale, de période ou d’exercice ne se délettre plus · ces clôtures sont définitives. ' +
  'Exercice clôturé · l’erreur relève du report à nouveau (AUDCIF art. 20, al. 3). Exercice encore ouvert · l’inscription en ' +
  'négatif reste due dans l’exercice (art. 20, al. 2), au premier jour non clôturé (art. 22, 4°), mais OmegaX ne l’inscrit pas ' +
  'sur une ligne lettrée, hors les gestes des créances douteuses, qui l’inscrivent à côté de leur lettrage figé · ce cas est ' +
  'relevé au suivi.';

/** Une ligne telle que le refus la lit · son lettrage et son pointage. */
export interface LigneTenue {
  lettre: string | null;
  lettrageId: string | null;
  rapprochementId: string | null;
}

/**
 * UNE ÉCRITURE DONT UNE LIGNE EST LETTRÉE OU POINTÉE NE SE CORRIGE NI NE
 * S'ANNULE · le lettrage affirme que ses lignes sont soldées entre elles, le
 * pointage qu'elles concordent avec un relevé. Corriger ou annuler sans les
 * défaire laisse l'affirmation en place, devenue fausse · un groupe « soldé »
 * d'une seule ligne, un crédit fantôme à la balance âgée et aux relances
 * (relecture adverse d'A6, B1). Une seule écriture du refus, servie à la
 * correction par inscription en négatif (`verifierCorrigeable`) et à
 * l'annulation d'une réévaluation des devises (D6). `objet` nomme ce qui est
 * lu (« cette écriture », « l'écriture n° 12 »), `geste` ce qui est refusé.
 * `null` si rien ne tient.
 *
 * `groupeTolere` · le SEUL groupe qu'un module a posé sur ses propres lignes
 * et qu'il garde en place parce qu'une clôture l'a figé (ligne A7 ter, B2b ·
 * une créance douteuse éteinte dont une ligne tombe dans une période close).
 * L'annulation s'inscrit alors en négatif à côté du groupe, qui reste soldé
 * sur les lignes qu'il réunit ; la ligne en négatif, ouverte, porte le reste
 * rétabli. Toute autre ligne lettrée ou pointée refuse comme avant.
 */
export function motifLignesTenues(
  lignes: LigneTenue[],
  objet: string,
  geste: string,
  issue = '',
  groupeTolere: string | null = null,
): string | null {
  const lettrees = lignes.filter((l) => estTenueParUnLettrage(l) && !(groupeTolere !== null && l.lettrageId === groupeTolere));
  if (lettrees.length > 0) {
    return (
      `${lettrees.length} ligne(s) de ${objet} sont lettrées (${[...new Set(lettrees.map(designationLettrage))].join(', ')}). ` +
      `Le lettrage affirme que ces lignes sont soldées entre elles ; ${geste} sans délettrer laisserait cette ` +
      `affirmation en place, devenue fausse. Délettrez-les d’abord${issue}. ${ISSUE_LETTRAGE_FIGE}`
    );
  }
  const pointees = lignes.filter((l) => l.rapprochementId);
  if (pointees.length > 0) {
    return (
      `${pointees.length} ligne(s) de ${objet} sont pointées dans un rapprochement bancaire. Le pointage ` +
      `affirme la concordance avec un relevé ; dépointez-les d’abord${issue}. ${ISSUE_RAPPROCHEMENT_CLOS}`
    );
  }
  return null;
}

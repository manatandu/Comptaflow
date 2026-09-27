import { BadRequestException } from '@nestjs/common';

/**
 * LE REPÈRE H DU TABLEAU DE RÉCONCILIATION · « paiements en instance »,
 * extra-comptable, saisi par l'entité (audit final F13).
 *
 * Absent n'est PAS zéro. Les exports n'envoyaient pas la saisie de l'écran,
 * le serveur la remplaçait par 0, et le fichier déposé au bailleur portait
 * H = 0 et un I différent de l'écran. Non renseigné, H le dit et I n'est pas
 * calculé. Illisible, le montant est refusé plutôt que lu comme zéro.
 */
export function lirePaiementsEnInstance(valeur?: string): number | null {
  if (valeur === undefined || valeur.trim() === '') return null;
  const montant = Number(valeur);
  if (!Number.isFinite(montant)) {
    throw new BadRequestException(
      "Paiements en instance illisibles · saisissez un montant, ou laissez le champ vide s'ils ne sont pas renseignés.",
    );
  }
  return montant;
}

import { NotFoundException } from '@nestjs/common';

/**
 * LE REFUS D'UN EXERCICE INCONNU DU DOSSIER, en un seul texte (audit final
 * F222). Les états des deux référentiels le posent, et les exports lisent
 * l'identité du dossier EN MÊME TEMPS que les états (`Promise.all`) · la
 * première lecture qui échoue fait la réponse, et elle doit être la même,
 * statut et message, quel que soit l'ordre d'arrivée.
 *
 * Il vivait dans `etats-financiers.communs.ts`, qui le réexporte. Il descend
 * ici parce que la balance âgée, le justificatif de solde, la balance cumulée
 * et le tableau des amortissements le posent aussi (2026-09-28) · ce sont des
 * états que leurs exports lisent avec la même identité, et le module de la
 * comptabilité ne dépend pas de celui des états financiers. Le texte dit
 * « aucun état » et non plus « aucun état financier » : une balance âgée n'en
 * est pas un, et la phrase doit rester vraie de chacun des lecteurs.
 */
export const MOTIF_EXERCICE_INTROUVABLE = 'Exercice introuvable dans ce dossier : aucun état ne peut être établi.';

/**
 * L'exercice lu dans le dossier, ou le 404 nommé. `findFirstOrThrow` rendait
 * l'erreur brute de Prisma (P2025), que Nest sert en 500 · et une lecture sans
 * contrôle rendait un état tout à zéro, présentable et faux. Le filtre
 * `{ id, tenantId }` reste à l'appelant, qui sait ce qu'il lit.
 */
export function exerciceDuDossierOuRefus<T>(exercice: T | null): T {
  if (!exercice) throw new NotFoundException(MOTIF_EXERCICE_INTROUVABLE);
  return exercice;
}

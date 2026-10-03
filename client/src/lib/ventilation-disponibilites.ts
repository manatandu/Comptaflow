import type { VentilationAExiger } from './types';

/**
 * LA VENTILATION SAISIE DE L'ÉCART DES DISPONIBILITÉS (relecture adverse
 * d'A5 bis, B1 ; troisième tour, mineur 2). Chaque devise lue sur le compte
 * se déclare, ZÉRO COMPRIS · le serveur l'exige. Un champ laissé vide partait
 * pourtant à zéro (`Number('')` vaut 0) · l'oubli passait pour une
 * déclaration, sans qu'aucun cours ne s'affiche à côté. Le champ vide est
 * donc refusé AVANT l'envoi, et le refus dit de taper 0.
 */
export function lireVentilationSaisie(
  aExiger: VentilationAExiger[],
  saisies: Record<string, string>,
): { ventilation: { compteId: string; deviseId: string; ecart: number }[]; refus: null } | { ventilation: null; refus: string } {
  const ventilation: { compteId: string; deviseId: string; ecart: number }[] = [];
  for (const c of aExiger) {
    for (const d of c.devises) {
      const brut = (saisies[`${c.compteId}|${d.deviseId}`] ?? '').trim();
      if (brut === '') {
        return {
          ventilation: null,
          refus: `Écart ${d.code} du compte ${c.numero} non saisi · chaque devise se déclare, zéro compris ; tapez 0 si elle n'a reçu aucun écart.`,
        };
      }
      const ecart = Number(brut.replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(ecart)) {
        return {
          ventilation: null,
          refus: `Écart ${d.code} du compte ${c.numero} illisible · saisissez un montant en francs, signé (perte en négatif).`,
        };
      }
      ventilation.push({ compteId: c.compteId, deviseId: d.deviseId, ecart });
    }
  }
  return { ventilation, refus: null };
}

import type { EcartInventaire, EditionPvInventaire } from './types';

/**
 * LES ÉDITIONS DE L'INVENTAIRE À L'ÉCRAN (ligne A19, relevé CPCC C16).
 *
 * Le CONTENU est servi par le serveur (`editions-inventaire.ts`) · l'écran ne
 * recalcule rien, il met en page. Ici ne vivent que les libellés et les
 * chemins, pour qu'un test les relise sans monter l'écran.
 */

/** Les quatre décisions de l'enum `DecisionEcartInventaire` (CPCC, étape 5). */
export const LIBELLE_DECISION_ECART: Record<NonNullable<EcartInventaire['decision']>, string> = {
  A_REDRESSER: 'À redresser',
  EXPLIQUE: 'Expliqué, non redressé',
  EXCEDENT_NON_COMPTABILISE: 'Excédent laissé au bilan',
  RENVOYE_COMMISSION_PRINCIPALE: 'Renvoyé à la commission principale',
};

/** L'écart dit par un mot, jamais par la seule couleur (seconde passe A10, k). */
export const LIBELLE_SENS_ECART: Record<EditionPvInventaire['ecarts'][number]['sens'], string> = {
  MANQUANT: 'Manquant',
  EXCEDENT: 'Excédent',
  SANS_ECART: 'Aucun écart',
};

/** Les routes de lecture des trois éditions. */
export function cheminEdition(
  e:
    | { nature: 'FICHES_DE_COMPTAGE'; campagneId: string; sousCommissionId?: string | null }
    | { nature: 'PROCES_VERBAL_INVENTAIRE'; campagneId: string }
    | { nature: 'PROCES_VERBAL_CAISSE'; pvId: string },
): string {
  switch (e.nature) {
    case 'FICHES_DE_COMPTAGE':
      return (
        `/inventaire/${encodeURIComponent(e.campagneId)}/editions/fiches-de-comptage` +
        (e.sousCommissionId ? `?sousCommissionId=${encodeURIComponent(e.sousCommissionId)}` : '')
      );
    case 'PROCES_VERBAL_INVENTAIRE':
      return `/inventaire/${encodeURIComponent(e.campagneId)}/editions/proces-verbal`;
    case 'PROCES_VERBAL_CAISSE':
      return `/inventaire/pv-caisse/${encodeURIComponent(e.pvId)}/edition`;
  }
}

/**
 * Une QUANTITÉ n'est pas un montant · elle garde sa précision (trois
 * décimales au schéma), sans zéros imposés. Absente, elle se dit « · »,
 * jamais « 0 » · « pas encore compté » n'est pas zéro.
 */
export function quantiteImprimee(q: number | null | undefined): string {
  if (q === null || q === undefined || !Number.isFinite(q)) return '·';
  return q.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
}

/** Un jour servi à minuit UTC, lu en UTC · à l'heure du poste il reculait d'un jour à l'ouest de Greenwich. */
export function jourImprime(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '·';
}

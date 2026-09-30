import type { NatureElementPaie } from './assiettes-paie';

/**
 * L'INDEMNITÉ DE LOGEMENT VERSÉE À KINSHASA · une obligation de l'EMPLOYEUR
 * que la paie ne nommait pas (passe F11).
 *
 * O.-L. n° 69/009, art. 4, al. 2 (disposition maintenue) · « Sont assimilées à
 * des revenus de location, les indemnités de logement accordées à des
 * rémunérés occupant leur propre habitation ou celle de leurs épouses. » À
 * Kinshasa, l'arrêté provincial n° 016/CAB/MIN.PROV/FIN.ECO/2023 du 7 décembre
 * 2023, en vigueur au 1er janvier 2024 (art. 11), en tire trois choses :
 *  · art. 2 · le redevable de l'impôt est le BÉNÉFICIAIRE, pas l'employeur ;
 *  · art. 3 · l'employeur qui accorde l'indemnité communique à la DGRK, dans
 *    les DIX JOURS du paiement, le relevé des bénéficiaires et des montants ;
 *  · art. 7 · à défaut, une astreinte de 100 USD par jour de retard pour une
 *    personne morale, 25 USD pour une personne physique.
 *
 * CE QUE LE LOGICIEL NE SAIT PAS, ET LA RÉSERVE LE DIT · si le salarié occupe
 * sa propre habitation (la condition de l'art. 4, al. 2), et l'étendue exacte
 * du relevé, l'art. 3 visant « les indemnités de logement » sans répéter la
 * condition. Rien n'est calculé, aucune retenue n'est posée · l'impôt est
 * celui du bénéficiaire. Un logement fourni EN NATURE n'est pas une
 * indemnité. `Tenant.ville` est une chaîne libre qui ne dit que le siège du
 * dossier · la réserve n'est servie qu'à un siège déclaré à Kinshasa, et rien
 * pour les autres provinces, dont les arrêtés ne sont pas au corpus.
 */
export const RESERVE_INDEMNITE_LOGEMENT_KINSHASA =
  "INDEMNITÉ DE LOGEMENT, KINSHASA · versée à un salarié qui occupe sa propre habitation (ou celle de son " +
  "conjoint), elle est assimilée à un revenu de location (O.-L. n° 69/009, art. 4, al. 2), et l'impôt est dû " +
  "par le bénéficiaire (arrêté provincial n° 016/CAB/MIN.PROV/FIN.ECO/2023, art. 2). L'EMPLOYEUR qui l'accorde " +
  "communique à la DGRK, dans les dix jours du paiement, le relevé des bénéficiaires et des montants (art. 3), " +
  "sous astreinte de 100 USD par jour de retard pour une personne morale, 25 USD pour une personne physique " +
  "(art. 7). OmegaX ne sait pas si le salarié occupe sa propre habitation, et ne retient rien.";

const EN_VIGUEUR_DU_MOIS = '2024-01';

export function reserveIndemniteLogementKinshasa(
  elements: readonly { nature: NatureElementPaie | string; montantFc: number; enNature?: boolean }[],
  ville: string | null | undefined,
  moisDePaie: string,
): string | null {
  if (moisDePaie < EN_VIGUEUR_DU_MOIS) return null;
  const aKinshasa = (ville ?? '').trim().toLowerCase().includes('kinshasa');
  if (!aKinshasa) return null;
  const indemnite = elements.some(
    (e) => e.nature === 'LOGEMENT_OU_SON_INDEMNITE' && e.montantFc > 0 && e.enNature !== true,
  );
  return indemnite ? RESERVE_INDEMNITE_LOGEMENT_KINSHASA : null;
}

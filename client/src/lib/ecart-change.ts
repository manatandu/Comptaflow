/**
 * ÉCART DE CHANGE RÉALISÉ · ce que l'écran en tient (ligne A6). Les règles et
 * leurs sources vivent au serveur (`src/modules/reglements/
 * ecart-change-realise.ts`) · AUDCIF art. 55, Titre VIII ch. 22 § 2.3. Ici,
 * seulement la liste de choix du compte quand le texte n'en donne aucun
 * (créance ou dette commerciale au SYCEBNL), et le corps du règlement en
 * devise. Le serveur rejoue tout et refuse ce qui ne tient pas.
 *
 * AUCUN IMPORT DE REACT (comme `comptes-proposes.ts`).
 */

export type SensEcart = 'PERTE' | 'GAIN';

/**
 * Les comptes PROPOSABLES pour l'écart d'une créance ou d'une dette
 * commerciale au SYCEBNL · sous le 65 (hors 659) pour une perte, sous le 75
 * (hors 759) pour un gain, jamais le 676 ni le 776 que ses fiches 67 et 77
 * réservent au change financier. Le sens n'est pas connu avant le calcul du
 * serveur (`null`) · les deux racines sont alors proposées.
 */
export function comptesProposablesEcart<C extends { numero: string }>(comptes: readonly C[], sens: SensEcart | null): C[] {
  return comptes.filter((c) => {
    const perte = c.numero.startsWith('65') && !c.numero.startsWith('659');
    const gain = c.numero.startsWith('75') && !c.numero.startsWith('759');
    return sens === 'PERTE' ? perte : sens === 'GAIN' ? gain : perte || gain;
  });
}

/** Un nombre saisi à la française (« 1 750,5 »), ou `null` s'il est vide ou illisible. */
export function nombreSaisi(saisie: string | undefined): number | null {
  if (saisie === undefined) return null;
  const propre = saisie.replace(/\s/g, '').replace(',', '.');
  if (propre === '') return null;
  const n = Number(propre);
  return Number.isFinite(n) ? n : null;
}

/**
 * Le corps d'un règlement EN DEVISE pour un tiers · montant en devise (absent,
 * le dû entier), cours du jour exigé, compte d'écart s'il a été choisi. Le
 * montant en francs n'est jamais envoyé · c'est la contrevaleur au cours, que
 * le serveur calcule.
 */
export function corpsReglementEnDevise(p: {
  compteId: string;
  ligneIds: string[];
  montantDevise: string | undefined;
  cours: string | undefined;
  compteEcartChangeId: string | undefined;
  reference: string | undefined;
}): { corps: Record<string, unknown> | null; motif: string | null } {
  const cours = nombreSaisi(p.cours);
  if (cours === null || !(cours > 0)) return { corps: null, motif: 'Saisissez le cours du jour du règlement.' };
  const montantDevise = nombreSaisi(p.montantDevise);
  if (montantDevise !== null && !(montantDevise > 0)) return { corps: null, motif: 'Le montant en devise doit être positif.' };
  return {
    motif: null,
    corps: {
      compteId: p.compteId,
      ligneIds: p.ligneIds,
      coursReglement: cours,
      ...(montantDevise !== null ? { montantDevise } : {}),
      ...(p.compteEcartChangeId ? { compteEcartChangeId: p.compteEcartChangeId } : {}),
      ...(p.reference ? { reference: p.reference } : {}),
    },
  };
}

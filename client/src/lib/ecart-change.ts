/**
 * ÉCART DE CHANGE RÉALISÉ · ce que l'écran en tient (ligne A6). Les règles et
 * leurs sources vivent au serveur (`src/modules/reglements/
 * ecart-change-realise.ts`) · AUDCIF art. 55, Titre VIII ch. 22 § 2.3. Ici,
 * la RECOPIE de ce qu'il faut à l'écran pour proposer · la nature du compte,
 * les racines admises (une seule table, jouée à l'identique par les deux
 * specs), l'écart estimé pour savoir s'il s'agit d'une perte ou d'un gain, et
 * le corps du règlement en devise. Le serveur rejoue tout et refuse ce qui ne
 * tient pas.
 *
 * AUCUN IMPORT DE REACT (comme `comptes-proposes.ts`).
 */

export type SensEcart = 'PERTE' | 'GAIN';
export type Referentiel = 'SYCEBNL' | 'SYSCOHADA';
export type NatureCreanceDette = 'COMMERCIALE' | 'FINANCIERE';

/**
 * La nature d'une créance ou d'une dette, lue sur son compte · 40 et 41
 * commerciaux ; emprunts (16 SYSCOHADA, 18 SYCEBNL), location acquisition
 * (17 SYSCOHADA, 187 SYCEBNL sous le 18), prêts (27) et fournisseurs
 * d'investissements (481) financiers ; le reste `null`.
 */
export function natureDuCompte(numero: string, referentiel: Referentiel): NatureCreanceDette | null {
  if (numero.startsWith('40') || numero.startsWith('41')) return 'COMMERCIALE';
  const financieres = referentiel === 'SYSCOHADA' ? ['16', '17', '27', '481'] : ['18', '27', '481'];
  if (financieres.some((r) => numero.startsWith(r))) return 'FINANCIERE';
  return null;
}

export interface RacineAdmise {
  racine: string;
  sauf?: string;
}

/** Les racines où l'écart peut aller · voir `racinesAdmises` au serveur. */
export function racinesAdmises(referentiel: Referentiel, nature: NatureCreanceDette | null, sens: SensEcart): RacineAdmise[] {
  const perte = sens === 'PERTE';
  const financier: RacineAdmise = { racine: perte ? '676' : '776' };
  const commercial: RacineAdmise =
    referentiel === 'SYSCOHADA' ? { racine: perte ? '656' : '756' } : perte ? { racine: '65', sauf: '659' } : { racine: '75', sauf: '759' };
  if (nature === 'FINANCIERE') return [financier];
  if (nature === 'COMMERCIALE') return [commercial];
  return [commercial, financier];
}

export function compteAdmisPourEcart(racines: RacineAdmise[], numero: string): boolean {
  return racines.some((r) => numero.startsWith(r.racine) && !(r.sauf && numero.startsWith(r.sauf)));
}

/**
 * Les comptes PROPOSABLES pour l'écart · ceux des racines admises, dans le
 * sens de l'écart. Le sens encore inconnu (`null`) · les deux sens.
 */
export function comptesProposablesEcart<C extends { numero: string }>(
  comptes: readonly C[],
  p: { referentiel: Referentiel; nature: NatureCreanceDette | null; sens: SensEcart | null },
): C[] {
  const sens: SensEcart[] = p.sens ? [p.sens] : ['PERTE', 'GAIN'];
  const racines = sens.flatMap((x) => racinesAdmises(p.referentiel, p.nature, x));
  return comptes.filter((c) => compteAdmisPourEcart(racines, c.numero));
}

/** « Perte de change réalisée », « Gain de change réalisé » · le même accord que le serveur. */
export function libelleEcartRealise(ecart: number): string {
  return ecart > 0 ? 'Perte de change réalisée' : 'Gain de change réalisé';
}

/**
 * L'ÉCART ESTIMÉ d'un règlement en devise, signé (positif = perte) · le coût
 * historique de ce qui est réglé, factures les plus anciennes d'abord, la
 * dernière au prorata de sa devise, contre les francs payés. Sert à l'écran à
 * savoir s'il propose le 65 ou le 75 ; le serveur le refait.
 */
export function ecartEstime(p: {
  sens: 'FOURNISSEUR' | 'CLIENT';
  factures: Array<{ francs: number; montantDevise: number; date: string }>;
  montantDevise: number;
  francsPayes: number;
}): number {
  const ordonnees = [...p.factures].sort((a, b) => a.date.localeCompare(b.date));
  let reste = p.montantDevise;
  let historique = 0;
  for (const f of ordonnees) {
    if (reste <= 1e-9) break;
    if (reste + 1e-9 >= f.montantDevise) {
      historique += Math.round(f.francs * 100);
      reste -= f.montantDevise;
    } else {
      historique += Math.round((f.francs * reste * 100) / f.montantDevise);
      reste = 0;
    }
  }
  const h = historique / 100;
  return Math.round((p.sens === 'FOURNISSEUR' ? p.francsPayes - h : h - p.francsPayes) * 100) / 100;
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
 * le dû entier), cours du jour OU débit réel en francs (le serveur déduit
 * alors le cours, comme pour toute ligne en devise), compte d'écart s'il a
 * été choisi.
 */
export function corpsReglementEnDevise(p: {
  compteId: string;
  ligneIds: string[];
  montantDevise: string | undefined;
  cours: string | undefined;
  montantFrancs?: string | undefined;
  compteEcartChangeId: string | undefined;
  reference: string | undefined;
}): { corps: Record<string, unknown> | null; motif: string | null } {
  const cours = nombreSaisi(p.cours);
  const francs = nombreSaisi(p.montantFrancs);
  if (francs !== null && !(francs > 0)) return { corps: null, motif: 'Le montant payé en francs doit être positif.' };
  if (cours !== null && !(cours > 0)) return { corps: null, motif: 'Le cours du jour doit être positif.' };
  if (cours === null && francs === null) {
    return { corps: null, motif: 'Saisissez le cours du jour du règlement, ou le montant réellement payé en francs.' };
  }
  const montantDevise = nombreSaisi(p.montantDevise);
  if (montantDevise !== null && !(montantDevise > 0)) return { corps: null, motif: 'Le montant en devise doit être positif.' };
  return {
    motif: null,
    corps: {
      compteId: p.compteId,
      ligneIds: p.ligneIds,
      ...(cours !== null ? { coursReglement: cours } : {}),
      ...(francs !== null ? { montant: francs } : {}),
      ...(montantDevise !== null ? { montantDevise } : {}),
      ...(p.compteEcartChangeId ? { compteEcartChangeId: p.compteEcartChangeId } : {}),
      ...(p.reference ? { reference: p.reference } : {}),
    },
  };
}

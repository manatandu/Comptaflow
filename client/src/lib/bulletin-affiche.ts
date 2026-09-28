import { montant } from './montants';

/**
 * LE BULLETIN ÉMIS TEL QU'IL SE LIT (audit final F20, F21, F22).
 *
 * Tout vient du bulletin figé ; cet écran ne recalcule rien, il RANGE. Trois
 * défauts tenaient au rangement. Un bulletin stipulé en dollars n'avait de
 * montant en francs que dans sa conversion, et l'écran formatait `undefined`
 * (la fenêtre tombait). Les retenues d'avance et de prêt, que le net déduit,
 * n'avaient aucune ligne · le décompte remis au travailleur ne se soldait pas
 * sur son net, ce que l'art. 103 du Code du travail rend opposable. Et
 * l'avantage en nature, reçu en nature, n'est pas une somme versée.
 */

export interface ElementDuBulletin {
  libelle: string;
  nature: string;
  /** En francs · lu sur l'élément, sinon sur la conversion au même rang. */
  montantFc: number | null;
  montantUsd: number | null;
  /** Faux pour un avantage en nature · il entre dans les assiettes, pas dans ce qui est versé. */
  verse: boolean;
}

export interface RetenueDuBulletin {
  libelle: string;
  littera: string | null;
  montantFc: number;
}

type Json = Record<string, unknown>;
const objet = (x: unknown): Json | null => (x && typeof x === 'object' ? (x as Json) : null);
const nombre = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export function elementsDuBulletin(entree: unknown, calcul: unknown): ElementDuBulletin[] {
  const elements = objet(entree)?.elements;
  const convertis = objet(objet(calcul)?.conversion)?.elements;
  if (!Array.isArray(elements)) return [];
  return elements.map((brut, i) => {
    const e = objet(brut) ?? {};
    const converti = Array.isArray(convertis) ? objet(convertis[i]) : null;
    return {
      libelle: String(e.libelle ?? ''),
      nature: String(e.nature ?? ''),
      montantFc: nombre(e.montantFc) ?? nombre(converti?.montantFc),
      montantUsd: nombre(e.montantUsd) ?? nombre(converti?.montantUsd),
      verse: e.nature !== 'AVANTAGE_EN_NATURE',
    };
  });
}

export function retenuesDuBulletin(calcul: unknown): RetenueDuBulletin[] {
  const retenues = objet(calcul)?.retenuesAvances;
  if (!Array.isArray(retenues)) return [];
  return retenues
    .map((r) => objet(r))
    .filter((r): r is Json => r !== null && nombre(r.montantFc) !== null)
    .map((r) => ({ libelle: String(r.libelle ?? ''), littera: typeof r.littera === 'string' ? r.littera : null, montantFc: nombre(r.montantFc)! }));
}

/**
 * L'ÉCART DU DÉCOMPTE · total versé, moins les retenues ouvrières, l'impôt et
 * les retenues d'avance, moins le net. Zéro quand le tableau imprimé se solde
 * sur le net ; tout autre chiffre dit qu'une ligne manque.
 */
export function ecartDuDecompte(b: {
  totalVerseFc: number;
  cotisationsTravailleurFc: number;
  irppFc: number;
  netAPayerFc: number;
  calcul: unknown;
}): number {
  const retenues = retenuesDuBulletin(b.calcul).reduce((n, r) => n + r.montantFc, 0);
  const centimes = Math.round((b.totalVerseFc - b.cotisationsTravailleurFc - b.irppFc - retenues - b.netAPayerFc) * 100);
  return centimes / 100;
}

/** Un montant, jamais `undefined` formaté · « · » quand il manque. */
export function montantAffiche(n: number | null | undefined): string {
  return montant(n);
}

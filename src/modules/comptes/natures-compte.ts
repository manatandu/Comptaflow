import { ModeReportANouveau, NatureCompteType } from '@prisma/client';

/**
 * NATURES DE COMPTE (point 14 de la comparaison Sage i7).
 *
 * Sage, « Paramètres société / comptes généraux / nature de compte » (manuel
 * i7) : « Cette option permet de définir, pour chaque nature de compte, une
 * fourchette de numéros de comptes. Ainsi, en création de compte, le
 * programme affecte automatiquement la nature du compte en fonction de son
 * numéro. » Le manuel en donne sept, que l'on reprend telles quelles · Stock,
 * Clients, Fournisseurs, Banque, Caisse, Charges, Produits. OmegaX codait ces
 * familles par préfixe, en dur ; elles deviennent un paramétrage du dossier.
 *
 * CE QUE LA NATURE COMMANDE, ET RIEN D'AUTRE.
 *  · les DÉFAUTS d'un compte créé ensuite · mode de report à-nouveau et
 *    lettrage. Un défaut, jamais une contrainte : le compte reste modifiable ;
 *  · la COHÉRENCE du report à-nouveau · Sage la confronte à la clôture (« une
 *    incohérence pour le compte général 3421 a été détectée sur le code
 *    report à nouveau ») et propose de rétablir le code de la nature. OmegaX
 *    liste les écarts et laisse aligner, sans rien corriger d'office.
 * Elle ne touche NI aux états financiers, NI aux contrôles par référentiel,
 * qui lisent les numéros du plan officiel et non ce paramétrage · déplacer
 * une fourchette ne doit jamais déplacer un poste du bilan.
 */

export interface Fourchette {
  du: string;
  au: string;
}

export interface NatureParametree {
  nature: NatureCompteType;
  fourchettes: Fourchette[];
  modeReportANouveau: ModeReportANouveau;
  lettrable: boolean;
}

export const LIBELLES_NATURE: Record<NatureCompteType, string> = {
  STOCK: 'Stock',
  CLIENT: 'Clients',
  FOURNISSEUR: 'Fournisseurs',
  BANQUE: 'Banque',
  CAISSE: 'Caisse',
  CHARGE: 'Charges',
  PRODUIT: 'Produits',
};

/**
 * DÉFAUTS, les mêmes pour les deux référentiels · les racines 3, 40, 41, 52,
 * 57, 6 et 7 portent ces familles dans les deux plans, et le mode de report
 * est celui que les deux semis posent déjà sur leurs comptes (DÉTAIL pour les
 * tiers, SOLDE pour stocks et trésorerie, AUCUN pour la gestion) ·
 * `natures-compte.spec.ts` relit les deux semis pour le vérifier. Le lettrage
 * suit la règle déjà en place (`estLettrableParDefaut` · classe 4).
 */
export const NATURES_PAR_DEFAUT: NatureParametree[] = [
  { nature: NatureCompteType.STOCK, fourchettes: [{ du: '3', au: '3' }], modeReportANouveau: ModeReportANouveau.SOLDE, lettrable: false },
  { nature: NatureCompteType.CLIENT, fourchettes: [{ du: '41', au: '41' }], modeReportANouveau: ModeReportANouveau.DETAIL, lettrable: true },
  { nature: NatureCompteType.FOURNISSEUR, fourchettes: [{ du: '40', au: '40' }], modeReportANouveau: ModeReportANouveau.DETAIL, lettrable: true },
  { nature: NatureCompteType.BANQUE, fourchettes: [{ du: '52', au: '52' }], modeReportANouveau: ModeReportANouveau.SOLDE, lettrable: false },
  { nature: NatureCompteType.CAISSE, fourchettes: [{ du: '57', au: '57' }], modeReportANouveau: ModeReportANouveau.SOLDE, lettrable: false },
  { nature: NatureCompteType.CHARGE, fourchettes: [{ du: '6', au: '6' }], modeReportANouveau: ModeReportANouveau.AUCUN, lettrable: false },
  { nature: NatureCompteType.PRODUIT, fourchettes: [{ du: '7', au: '7' }], modeReportANouveau: ModeReportANouveau.AUCUN, lettrable: false },
];

/**
 * Un numéro est dans la fourchette « de 342 à 342ZZZZ » s'il commence par une
 * racine comprise entre `du` et `au`, comparées sur la longueur de la plus
 * longue des deux · 40110000 est dans « 40 à 40 », 31200000 dans « 311 à
 * 315 », 31600000 n'y est pas.
 */
export function dansFourchette(numero: string, f: Fourchette): boolean {
  const n = Math.max(f.du.length, f.au.length);
  const tete = numero.slice(0, n);
  return tete >= f.du.padEnd(n, '0') && tete <= f.au.padEnd(n, '9');
}

/** La nature d'un numéro, ou null. Les fourchettes ne se chevauchent pas (motifRefusFourchettes). */
export function natureDe(numero: string, natures: NatureParametree[]): NatureParametree | null {
  return natures.find((n) => n.fourchettes.some((f) => dansFourchette(numero, f))) ?? null;
}

/**
 * Refuse une liste de fourchettes illisible · des chiffres seulement, du ≤ au,
 * et AUCUN chevauchement avec une autre nature : un même compte rattaché à
 * deux natures recevrait un défaut ou l'autre selon l'ordre de lecture, sans
 * que personne ne sache lequel.
 */
export function motifRefusFourchettes(nature: NatureCompteType, fourchettes: Fourchette[], autres: NatureParametree[]): string | null {
  if (fourchettes.length === 0) return `La nature ${LIBELLES_NATURE[nature]} doit garder au moins une fourchette.`;
  for (const f of fourchettes) {
    if (!/^\d{1,13}$/.test(f.du) || !/^\d{1,13}$/.test(f.au)) {
      return `Fourchette « ${f.du} à ${f.au} » · des chiffres seulement, comme les racines du plan.`;
    }
    const n = Math.max(f.du.length, f.au.length);
    if (f.du.padEnd(n, '0') > f.au.padEnd(n, '9')) return `Fourchette « ${f.du} à ${f.au} » · le début dépasse la fin.`;
  }
  for (const autre of autres.filter((a) => a.nature !== nature)) {
    for (const f of fourchettes) {
      for (const g of autre.fourchettes) {
        const n = Math.max(f.du.length, f.au.length, g.du.length, g.au.length);
        const [a1, a2] = [f.du.padEnd(n, '0'), f.au.padEnd(n, '9')];
        const [b1, b2] = [g.du.padEnd(n, '0'), g.au.padEnd(n, '9')];
        if (a1 <= b2 && b1 <= a2) {
          return `La fourchette « ${f.du} à ${f.au} » chevauche « ${g.du} à ${g.au} » de la nature ${LIBELLES_NATURE[autre.nature]}.`;
        }
      }
    }
  }
  return null;
}

/** Lit la colonne JSON · une valeur malformée en base vaut « aucune fourchette », jamais une exception en lecture. */
export function lireFourchettes(json: unknown): Fourchette[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (f): f is Fourchette => typeof f === 'object' && f !== null && typeof (f as Fourchette).du === 'string' && typeof (f as Fourchette).au === 'string',
  );
}

/**
 * Comptes de détail dont le mode de report contredit leur nature · ce que
 * Sage signale à la clôture. Un compte hors de toute nature n'est jamais
 * signalé : rien ne dit ce qu'il devrait porter.
 */
export function incoherencesDeReport<C extends { numero: string; typeCompte: string; modeReportANouveau: ModeReportANouveau }>(
  comptes: C[],
  natures: NatureParametree[],
): Array<C & { nature: NatureCompteType; modeAttendu: ModeReportANouveau }> {
  const sortie: Array<C & { nature: NatureCompteType; modeAttendu: ModeReportANouveau }> = [];
  for (const c of comptes) {
    if (c.typeCompte === 'TOTAL') continue;
    const n = natureDe(c.numero, natures);
    if (n && n.modeReportANouveau !== c.modeReportANouveau) {
      sortie.push({ ...c, nature: n.nature, modeAttendu: n.modeReportANouveau });
    }
  }
  return sortie;
}

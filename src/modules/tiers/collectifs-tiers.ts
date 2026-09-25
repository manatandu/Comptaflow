import { Referentiel, TypeTiers } from '@prisma/client';

/**
 * COMPTE COLLECTIF ET COMPTE INDIVIDUEL DE TIERS (point 13 de la comparaison
 * Sage i7).
 *
 * Sage propose à la création d'un tiers le compte général de son type
 * (support Sage 100 : « Compte générale selon le type des tiers .client
 * (3421) 4411(fournisseurs) », numéros du plan marocain). OmegaX garde un
 * compte INDIVIDUEL par tiers, créé sous ce collectif · choix de Manasse du
 * 2026-09-25 : le lettrage, les relances, la balance âgée et les règlements
 * lisent tous un compte, et aucun texte OHADA n'impose l'un ou l'autre
 * modèle. Le collectif regroupe ses comptes individuels à la balance générale
 * (`regrouperSurCollectifs`) et la balance auxiliaire les rend tiers par tiers.
 *
 * AUCUN NUMÉRO N'EST ÉCRIT AILLEURS QU'ICI, ET AUCUN SANS SON RÉFÉRENTIEL · le
 * 411 est « Adhérents » au SYCEBNL et « Clients » au SYSCOHADA, le 412
 * « Clients-usagers » d'un côté et « effets à recevoir » de l'autre (voir les
 * deux semis, et `collectifs-tiers.spec.ts`, qui les relit).
 *
 * DEUX TYPES N'ONT PAS DE COLLECTIF PROPOSÉ, et c'est voulu. SALARIÉ · la
 * paie passe le net au 422 global (passation-paie.ts), et un compte par
 * salarié serait un second chemin pour la même dette. AUTRE · un débiteur ou
 * un créditeur divers (4711 ou 4712) : le sens n'est pas connu à la création,
 * et le deviner rangerait une dette en créance. Le compte se rattache à la
 * main, comme avant.
 */
export const COLLECTIFS_TIERS: Record<Referentiel, Partial<Record<TypeTiers, string>>> = {
  // SYCEBNL, Partie 2 ch. 2 · 401 (4011 Fournisseurs), 411 Adhérents,
  // 412 Clients-usagers.
  [Referentiel.SYCEBNL]: {
    [TypeTiers.FOURNISSEUR]: '40110000',
    [TypeTiers.ADHERENT]: '41100000',
    [TypeTiers.CLIENT]: '41200000',
  },
  // SYSCOHADA (AUDCIF, Titre VII) · 4011 Fournisseurs, 4111 Clients. Pas
  // d'adhérent : le type est refusé hors SYCEBNL (TiersService).
  [Referentiel.SYSCOHADA]: {
    [TypeTiers.FOURNISSEUR]: '40110000',
    [TypeTiers.CLIENT]: '41110000',
  },
};

export function numeroCollectif(referentiel: Referentiel, type: TypeTiers): string | null {
  return COLLECTIFS_TIERS[referentiel][type] ?? null;
}

/** La racine sous laquelle naissent les comptes individuels · 40110000 → 4011. */
export function racineCollectif(numero: string): string {
  return numero.replace(/0+$/, '');
}

/**
 * Premier numéro libre sous le collectif, à la longueur du dossier · 40110001,
 * 40110002… Le numéro tout-à-zéro est celui du collectif lui-même et n'est
 * jamais pris. Rend null quand la racine ne laisse aucune place (longueur trop
 * courte, ou toutes les positions prises) · jamais un numéro plus long que
 * `Tenant.longueurCompte`, que la création de compte refuserait.
 */
export function prochainNumeroIndividuel(racine: string, longueur: number, existants: string[]): string | null {
  const largeur = longueur - racine.length;
  if (largeur < 1) return null;
  const pris = new Set(existants.filter((n) => n.length === longueur && n.startsWith(racine)));
  const max = 10 ** largeur - 1;
  for (let i = 1; i <= max; i++) {
    const numero = racine + String(i).padStart(largeur, '0');
    if (!pris.has(numero)) return numero;
  }
  return null;
}

/** Une ligne de balance, telle que `EcritureService.balance` la rend. */
export interface LigneBalanceRegroupable {
  compteId: string;
  numero: string;
  intitule: string;
  totalDebit: number;
  totalCredit: number;
  reportDebit: number;
  reportCredit: number;
  mouvementDebit: number;
  mouvementCredit: number;
  solde: number;
}

/**
 * BALANCE GÉNÉRALE REGROUPÉE · chaque compte individuel est fondu dans la
 * ligne de son collectif, comme la balance générale de Sage n'affiche que le
 * 4011 et renvoie le détail à la balance des tiers. Le collectif ressort même
 * s'il n'a aucun mouvement propre, et la ligne dit combien de comptes elle
 * regroupe. Les totaux ne bougent pas · c'est un regroupement, pas un calcul.
 */
export function regrouperSurCollectifs<L extends LigneBalanceRegroupable>(
  lignes: L[],
  collectifDe: Map<string, { id: string; numero: string; intitule: string }>,
): Array<L & { regroupe: number }> {
  const sortie = new Map<string, L & { regroupe: number }>();
  const CHAMPS = ['totalDebit', 'totalCredit', 'reportDebit', 'reportCredit', 'mouvementDebit', 'mouvementCredit', 'solde'] as const;
  for (const l of lignes) {
    const collectif = collectifDe.get(l.compteId);
    const cle = collectif?.id ?? l.compteId;
    const existant = sortie.get(cle);
    if (!existant) {
      sortie.set(
        cle,
        collectif
          ? { ...l, compteId: collectif.id, numero: collectif.numero, intitule: collectif.intitule, regroupe: 1 }
          : { ...l, regroupe: 0 },
      );
      continue;
    }
    for (const c of CHAMPS) existant[c] += l[c];
    if (collectif) existant.regroupe += 1;
  }
  return [...sortie.values()].sort((a, b) => a.numero.localeCompare(b.numero));
}

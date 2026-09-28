import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';

/**
 * LA BALANCE EN TROIS COLONNES · un seul calcul, deux lecteurs (audit final
 * F190). `EcritureService.balance` lit un dossier, la lecture du groupe
 * (`groupe/lecture-des-dossiers.ts`) lit une tranche de dossiers d'un coup ;
 * les deux posent les mêmes trois filtres et rangent les sommes de la même
 * façon, parce qu'une balance de cellule vue du siège doit être EXACTEMENT
 * celle que la cellule voit chez elle. Deux calculs écrits à part auraient
 * divergé au premier correctif, et l'écart ne se serait vu nulle part · les
 * deux balances sont plausibles séparément.
 *
 * TROIS COLONNES ET NON DEUX (audit final F4, F5). L'écriture qui solde les
 * classes 6 à 8 sur le 13, datée de la FIN de l'exercice clos, portait le même
 * drapeau que le report à-nouveau et tombait avec lui en « ouverture » ·
 * l'écran et le classeur présentaient alors en solde d'ouverture l'inverse de
 * toute l'activité de l'année. Elle a sa colonne, `cloture*` : ni une
 * ouverture, ni un mouvement de l'exercice.
 */

/** Les trois filtres d'écriture, posés sur un même filtre de départ. */
export function filtresDesTroisColonnes<F extends object>(filtreEcriture: F) {
  return {
    reports: { ...filtreEcriture, estGenereeParCloture: true, estSoldeDesComptesDeGestion: false },
    mouvements: { ...filtreEcriture, estGenereeParCloture: false },
    clotures: { ...filtreEcriture, estSoldeDesComptesDeGestion: true },
  };
}

export interface AgregatsBalance {
  totalDebit: number;
  totalCredit: number;
  reportDebit: number;
  reportCredit: number;
  mouvementDebit: number;
  mouvementCredit: number;
  clotureDebit: number;
  clotureCredit: number;
}

const zero = (): AgregatsBalance => ({
  totalDebit: 0,
  totalCredit: 0,
  reportDebit: 0,
  reportCredit: 0,
  mouvementDebit: 0,
  mouvementCredit: 0,
  clotureDebit: 0,
  clotureCredit: 0,
});

type Groupe = { compteId: string; _sum: { debit: unknown; credit: unknown } };

/**
 * Les sommes par compte, accumulées dans un ordre FIXE · l'à-nouveau, puis
 * les mouvements, puis la clôture. L'ordre d'addition décide du dernier bit
 * d'un total flottant, et les deux lecteurs doivent rendre les mêmes nombres.
 */
export function agregatsParCompte(reports: Groupe[], mouvements: Groupe[], clotures: Groupe[]): Map<string, AgregatsBalance> {
  const parCompte = new Map<string, AgregatsBalance>();
  const accumuler = (
    groupes: Groupe[],
    champDebit: 'reportDebit' | 'mouvementDebit' | 'clotureDebit',
    champCredit: 'reportCredit' | 'mouvementCredit' | 'clotureCredit',
  ) => {
    for (const g of groupes) {
      const a = parCompte.get(g.compteId) ?? zero();
      const d = Number(g._sum.debit ?? 0);
      const c = Number(g._sum.credit ?? 0);
      a[champDebit] += d;
      a[champCredit] += c;
      a.totalDebit += d;
      a.totalCredit += c;
      parCompte.set(g.compteId, a);
    }
  };
  accumuler(reports, 'reportDebit', 'reportCredit');
  accumuler(mouvements, 'mouvementDebit', 'mouvementCredit');
  accumuler(clotures, 'clotureDebit', 'clotureCredit');
  return parCompte;
}

export interface CompteDeBalance {
  id: string;
  numero: string;
  intitule: string;
  classe: ClasseCompte;
  typeCompte: TypeCompteDetailTotal;
}

export interface LigneDeBalance extends AgregatsBalance {
  compteId: string;
  numero: string;
  intitule: string;
  classe: ClasseCompte;
  typeCompte: TypeCompteDetailTotal;
  solde: number;
}

/**
 * Les lignes d'une balance, dans l'ordre des comptes reçus (croissant des
 * numéros, que les lecteurs demandent à la base).
 *
 * Les comptes Total sont écartés d'emblée · ils ne reçoivent jamais d'écriture
 * (un numéro à deux ou trois chiffres est structurellement impossible à
 * saisir, CreerCompteDto en exige trois à treize), et additionner un agrégat
 * déjà compté dans leurs enfants doublerait les montants. Un compte sans
 * mouvement n'est pas une ligne de balance · un compte mouvementé dont le
 * solde retombe à zéro, lui, en reste une.
 */
export function lignesDeBalance(comptes: readonly CompteDeBalance[], parCompte: Map<string, AgregatsBalance>): LigneDeBalance[] {
  return comptes
    .filter((c) => c.typeCompte !== TypeCompteDetailTotal.TOTAL)
    .map((c) => {
      const agregats = parCompte.get(c.id) ?? zero();
      return {
        compteId: c.id,
        numero: c.numero,
        intitule: c.intitule,
        classe: c.classe,
        typeCompte: c.typeCompte,
        ...agregats,
        solde: agregats.totalDebit - agregats.totalCredit,
      };
    })
    .filter((l) => l.totalDebit !== 0 || l.totalCredit !== 0);
}

/** Les totaux, sommés sur les lignes dans leur ordre. */
export function totauxDeBalance(lignes: readonly LigneDeBalance[]): { debit: number; credit: number } {
  return {
    debit: lignes.reduce((s, l) => s + l.totalDebit, 0),
    credit: lignes.reduce((s, l) => s + l.totalCredit, 0),
  };
}

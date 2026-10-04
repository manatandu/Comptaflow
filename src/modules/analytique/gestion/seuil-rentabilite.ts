/**
 * SEUIL DE RENTABILITÉ · DÉFINITION D'OMEGAX, règles pures, sans Prisma.
 *
 * Ligne A20 (relevé CPCC C17). Aucun texte du corpus ne définit le seuil de
 * rentabilité · le glossaire de l'AUDCIF (Titre VI) ne le nomme qu'en passant
 * (« AVANCES CONDITIONNÉES », « dépassement d'un certain seuil de
 * rentabilité »), et donne seulement les briques · « CHARGES FIXES ET
 * VARIABLES », « MARGE » (« marge sur coût variable »). La définition suit,
 * dite à l'écran comme celle d'OmegaX.
 *
 *  · Produits d'activité (P) · mouvement net créditeur des comptes de classe 7
 *    que le cabinet a déclarés « produit d'activité ».
 *  · Charges variables (CV) et charges fixes (CF) · mouvement net débiteur des
 *    comptes de classe 6 selon leur comportement DÉCLARÉ, la semi-variable
 *    partagée à sa part variable.
 *  · Marge sur coûts variables M = P − CV ; taux t = M / P.
 *  · Seuil de rentabilité S = CF / t · le niveau de produits qui couvre les
 *    charges fixes.
 *  · Marge de sécurité P − S ; indice de sécurité (P − S) / P.
 *  · Point mort, en mois de l'exercice · S / P × durée, SOUS L'HYPOTHÈSE
 *    d'une activité régulière (dite, jamais présumée vraie).
 *
 * Activités ordinaires seules (classes 6 et 7) · le H.A.O. (classe 8) n'est
 * pas une activité que le seuil mesure, et l'impôt sur le résultat non plus.
 *
 * NULL N'EST PAS ZÉRO · un compte mouvementé sans comportement déclaré rend
 * le seuil incomplet (`seuil: null`) et le nomme. Une marge sur coûts
 * variables nulle ou négative n'a pas de seuil · aucun niveau d'activité ne
 * couvre les charges fixes, et c'est dit plutôt qu'un nombre absurde.
 *
 * UNE EBNL PEUT S'EN SERVIR · la comptabilité de gestion est « ni normalisée,
 * ni obligatoire » (glossaire, « COMPTABILITÉ ANALYTIQUE DE GESTION »), et le
 * plan SYCEBNL laisse les comptes 92 à 99 « à l'initiative des entités »
 * (Partie 2 ch. 3, section 9). Pour une association, le « produit d'activité »
 * est ce que le cabinet déclare tel (cotisations, ventes, prestations) ; une
 * subvention d'exploitation peut l'être ou non, c'est son choix.
 */

import { partageFixeVariable, type Comportement } from './comportement-gestion';

export interface MouvementDeGestion {
  numero: string;
  intitule: string;
  /** Chiffre de classe (« 6 », « 7 »). */
  classe: string;
  mouvementDebit: number;
  mouvementCredit: number;
  comportement: Comportement | null;
  partVariablePct: number | null;
}

export interface SeuilDeRentabilite {
  produits: number;
  chargesVariables: number;
  chargesFixes: number;
  marge: number;
  /** En pour cent, deux décimales ; null si les produits sont nuls. */
  tauxMarge: number | null;
  seuil: number | null;
  margeSecurite: number | null;
  indiceSecurite: number | null;
  pointMortMois: number | null;
  /** Pourquoi le seuil n'est pas rendu, quand il ne l'est pas. */
  motif: string | null;
  horsCalcul: { numero: string; intitule: string; montant: number }[];
  nonDeclares: { numero: string; intitule: string; montant: number }[];
}

const c = (n: number) => Math.round(n * 100);

export function seuilDeRentabilite(mouvements: readonly MouvementDeGestion[], moisExercice: number): SeuilDeRentabilite {
  let produits = 0;
  let variables = 0;
  let fixes = 0;
  const horsCalcul: SeuilDeRentabilite['horsCalcul'] = [];
  const nonDeclares: SeuilDeRentabilite['nonDeclares'] = [];
  for (const m of mouvements) {
    if (m.classe !== '6' && m.classe !== '7') continue;
    const net = m.classe === '6' ? m.mouvementDebit - m.mouvementCredit : m.mouvementCredit - m.mouvementDebit;
    if (c(net) === 0) continue;
    const ligne = { numero: m.numero, intitule: m.intitule, montant: c(net) / 100 };
    if (m.comportement === null) {
      nonDeclares.push(ligne);
      continue;
    }
    if (m.comportement === 'HORS_CALCUL') {
      horsCalcul.push(ligne);
      continue;
    }
    if (m.classe === '7') {
      // Un comportement de charge sur un produit est refusé à la déclaration ·
      // s'il survit (compte reclassé depuis), le compte est mis à part plutôt
      // que compté d'un côté qu'il n'est pas.
      if (m.comportement === 'PRODUIT_ACTIVITE') produits += c(net);
      else horsCalcul.push(ligne);
      continue;
    }
    if (m.comportement === 'PRODUIT_ACTIVITE') {
      horsCalcul.push(ligne);
      continue;
    }
    const p = partageFixeVariable(net, m.comportement, m.partVariablePct);
    variables += c(p.variable);
    fixes += c(p.fixe);
  }
  const marge = produits - variables;
  const base = {
    produits: produits / 100,
    chargesVariables: variables / 100,
    chargesFixes: fixes / 100,
    marge: marge / 100,
    tauxMarge: produits > 0 ? Math.round((marge / produits) * 10000) / 100 : null,
    horsCalcul,
    nonDeclares,
  };
  const vide = { seuil: null, margeSecurite: null, indiceSecurite: null, pointMortMois: null };
  if (nonDeclares.length > 0) {
    return {
      ...base,
      ...vide,
      motif: `${nonDeclares.length} compte(s) mouvementé(s) sans comportement déclaré · le seuil n'est pas calculé sur une partie des charges.`,
    };
  }
  if (produits <= 0) {
    return { ...base, ...vide, motif: "Aucun produit d'activité déclaré n'est mouvementé · le seuil se mesure en produits." };
  }
  if (marge <= 0) {
    return {
      ...base,
      ...vide,
      motif: 'La marge sur coûts variables est nulle ou négative · aucun niveau de produits ne couvre les charges fixes.',
    };
  }
  // S = CF × P / M, calculé en centimes puis arrondi, pour ne pas cumuler
  // l'arrondi du taux affiché.
  const seuil = Math.round((fixes * produits) / marge);
  return {
    ...base,
    seuil: seuil / 100,
    margeSecurite: (produits - seuil) / 100,
    indiceSecurite: Math.round(((produits - seuil) / produits) * 10000) / 100,
    pointMortMois: Math.round((seuil / produits) * moisExercice * 100) / 100,
    motif: null,
  };
}

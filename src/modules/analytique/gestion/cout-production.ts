/**
 * COÛT DE PRODUCTION AVEC IMPUTATION RATIONNELLE DES CHARGES FIXES · règles
 * pures, sans Prisma.
 *
 * Ligne A20 (relevé CPCC C17). AUDCIF Titre VIII, ch. 14 (stocks et en-cours)
 * § 2.3.2 « Prise en compte de la sous-activité » · « L'affectation des frais
 * généraux fixes de production aux coûts de transformation est fondée sur la
 * capacité normale des installations de production. En conséquence, la
 * quote-part de frais fixes de production correspondant à la sous-activité
 * n'est pas incorporable au coût de production. Il s'agit de la méthode
 * d'imputation rationnelle des charges fixes. Ces coûts sont comptabilisés
 * comme une charge de l'exercice au cours duquel ils sont encourus. »
 *
 * ANOMALIE DU RENVOI (à signaler) · la ligne A20 du suivi cite « Titre VIII
 * ch. 13 § 2.3 » ; le ch. 13 du corpus porte sur le PORTEFEUILLE-TITRES, et le
 * § 2.3 du coût de production est celui du ch. 14. C'est lui qui est appliqué.
 *
 * Au SYCEBNL, la fiche de la classe 3 (Partie 2 ch. 3, section 3) demande
 * « l'imputation systématique des frais généraux de production fixes et
 * variables » sans écrire la règle de la capacité normale, et l'AUDCIF art. 37
 * (non exclu par l'art. 3 du SYCEBNL) n'admet les charges indirectes que
 * « dans la mesure où elles peuvent être raisonnablement rattachées à la
 * production du bien ». OmegaX sert le même calcul aux deux référentiels et
 * le dit · c'est un outil de gestion, et la quote-part de sous-activité n'est
 * « raisonnablement rattachée » à aucune unité produite.
 *
 * TROIS RÈGLES, et aucune n'est déduite des comptes.
 *  · La capacité normale et l'activité réelle se DÉCLARENT, dans la même
 *    unité, avec leur source · aucun compte ne les porte.
 *  · Le coefficient d'imputation est activité / capacité, BORNÉ À UN. Le texte
 *    ne traite que la SOUS-activité ; en suractivité, incorporer plus que les
 *    charges fixes réellement encourues mettrait au coût une charge qui n'a
 *    pas eu lieu (glossaire, « COÛT RÉEL » · « charges effectivement
 *    subies »). Lecture d'OmegaX, dite.
 *  · Les charges de la section se rangent par le comportement DÉCLARÉ de leur
 *    compte (`comportement-gestion.ts`). Un compte non déclaré rend le coût
 *    INCOMPLET (`null`), jamais calculé sur la partie connue.
 *
 * RIEN N'EST POSTÉ · ni au grand livre ni au magasin. La valorisation des
 * stocks reste celle du module des stocks (méthode, inventaire, variation) ;
 * ce calcul donne le coût de production unitaire que le cabinet peut y
 * PORTER lui-même comme coût d'entrée, et l'écran le dit.
 */

import { partageFixeVariable, type Comportement } from './comportement-gestion';

export interface ChargeDeSection {
  compteId: string;
  numero: string;
  intitule: string;
  /** Charge nette de la section sur le compte (débit moins crédit). */
  montant: number;
  comportement: Comportement | null;
  partVariablePct: number | null;
}

export interface DonneesDeclarees {
  capaciteNormale: number;
  activiteReelle: number;
  quantiteProduite: number | null;
}

export interface CoutDeProduction {
  chargesVariables: number;
  chargesFixes: number;
  /** activité / capacité, borné à 1, à quatre décimales. */
  coefficient: number;
  suractivite: boolean;
  chargesFixesImputees: number;
  /** Quote-part de sous-activité · charge de la période, jamais au coût. */
  sousActivite: number;
  /** null tant qu'un compte n'est pas déclaré. */
  coutProduction: number | null;
  coutUnitaire: number | null;
  horsCalcul: { numero: string; intitule: string; montant: number }[];
  nonDeclares: { numero: string; intitule: string; montant: number }[];
}

const c = (n: number) => Math.round(n * 100);

export function motifRefusDonnees(d: { capaciteNormale: number; activiteReelle: number; quantiteProduite: number | null; source: string; unite: string }): string | null {
  if (!d.unite || d.unite.trim().length === 0) return "L'unité de mesure de l'activité est exigée (heures-machine, tonnes, pièces).";
  if (!d.source || d.source.trim().length < 3) return "La source de la capacité normale et de l'activité réelle est exigée.";
  if (!Number.isFinite(d.capaciteNormale) || d.capaciteNormale <= 0) return 'La capacité normale est strictement positive.';
  if (!Number.isFinite(d.activiteReelle) || d.activiteReelle < 0) return "L'activité réelle est positive ou nulle.";
  if (d.quantiteProduite !== null && (!Number.isFinite(d.quantiteProduite) || d.quantiteProduite <= 0)) {
    return 'La quantité produite, si elle est déclarée, est strictement positive.';
  }
  return null;
}

export function coutDeProduction(charges: readonly ChargeDeSection[], d: DonneesDeclarees): CoutDeProduction {
  let variables = 0;
  let fixes = 0;
  const horsCalcul: CoutDeProduction['horsCalcul'] = [];
  const nonDeclares: CoutDeProduction['nonDeclares'] = [];
  for (const ch of charges) {
    if (c(ch.montant) === 0) continue;
    const ligne = { numero: ch.numero, intitule: ch.intitule, montant: ch.montant };
    if (ch.comportement === null) {
      nonDeclares.push(ligne);
      continue;
    }
    if (ch.comportement === 'HORS_CALCUL' || ch.comportement === 'PRODUIT_ACTIVITE') {
      horsCalcul.push(ligne);
      continue;
    }
    const p = partageFixeVariable(ch.montant, ch.comportement, ch.partVariablePct);
    variables += c(p.variable);
    fixes += c(p.fixe);
  }
  const brut = d.activiteReelle / d.capaciteNormale;
  const coefficient = Math.round(Math.min(brut, 1) * 10000) / 10000;
  // La quote-part imputée se calcule sur le rapport EXACT (pas sur le
  // coefficient arrondi à l'affichage), arrondie au centime · la sous-activité
  // en est le reste, pour que les deux reconstituent les charges fixes.
  const imputees = Math.round(fixes * Math.min(brut, 1));
  const sousActivite = fixes - imputees;
  const complet = nonDeclares.length === 0;
  const cout = complet ? (variables + imputees) / 100 : null;
  return {
    chargesVariables: variables / 100,
    chargesFixes: fixes / 100,
    coefficient,
    suractivite: brut > 1,
    chargesFixesImputees: imputees / 100,
    sousActivite: sousActivite / 100,
    coutProduction: cout,
    coutUnitaire: cout !== null && d.quantiteProduite ? Math.round((cout / d.quantiteProduite) * 10000) / 10000 : null,
    horsCalcul,
    nonDeclares,
  };
}

import { EtatsIfrs } from './etats-ifrs';

/**
 * ÉTAT DES FLUX DE TRÉSORERIE IFRS · item 15, tranche 3. Moteur PUR.
 *
 * SOURCES, lues le 2026-09-25 · IAS 7 (skill `ifrs`) et ses modifications par
 * IFRS 18, dans le texte français officiel du règlement (UE) 2026/338 du
 * 13 février 2026 (`docs/sources/ias7-modifie-par-ifrs18-reglement-ue-2026-338.md`).
 * Le § 64 modifié · « L'entité qui applique IFRS 18 doit appliquer ces
 * modifications ».
 *
 * LE TABLEAU PART DES FLUX RÉELS DU GRAND LIVRE, jamais des retraitements.
 * Un retraitement IFRS n'est dans aucun journal, il ne déplace aucune
 * trésorerie · ses effets au résultat d'exploitation sont donc RETIRÉS sur une
 * ligne propre (§ 20 b). Les flux sont ceux du tableau SYSCOHADA (AUDCIF
 * Titre IX ch. 5, `resoudreFluxSurLignes`), lu sans réécrire sa table, puis
 * reclassés selon IAS 7 modifiée ·
 *
 *  · méthode indirecte à partir du RÉSULTAT D'EXPLOITATION (§ 18 b et § 20),
 *    et non plus du résultat net ;
 *  · les produits et charges de chaque catégorie de l'état du résultat net
 *    portent leur trésorerie dans l'activité associée · la capacité
 *    d'autofinancement légale (FA), additive compte par compte, est répartie
 *    selon la catégorie où les règles du cabinet rangent chaque compte. Les
 *    intérêts versés vont au financement et les intérêts et dividendes reçus à
 *    l'investissement (§ 34A) dès lors que les règles suivent IFRS 18 ;
 *    une activité principale d'investissement les suit par catégorie
 *    (§ 34B, § 34C) ;
 *  · les dividendes versés au financement (§ 33A), les impôts sur le résultat
 *    à l'exploitation (§ 35).
 *
 * LA TRÉSORERIE EST CELLE D'IAS 7, pas celle du bilan légal · les comptes que
 * les règles rangent en « Trésorerie et équivalents de trésorerie », plus les
 * découverts si l'entité déclare qu'ils font partie intégrante de sa gestion
 * de trésorerie (§ 8). Un compte de la trésorerie légale qui n'en fait pas
 * partie (un titre de placement, § 7) porte sa variation en investissement ;
 * un crédit de trésorerie hors découvert, en financement (§ 8, § 17).
 *
 * RIEN NE SE DÉDUIT · l'effet de change sur la trésorerie en devises (§ 28)
 * se DÉCLARE, avec la catégorie où l'écart a été comptabilisé ; la présence
 * de devises aussi. Ce que les flux n'expliquent pas reste sur un écart
 * nommé, et le tableau n'est pas publiable.
 */

export type CategorieFlux = 'OPERATIONNELLE' | 'INVESTISSEMENT' | 'FINANCEMENT' | 'IMPOTS' | 'ABANDONNEES';
export const CATEGORIES_FLUX: CategorieFlux[] = ['OPERATIONNELLE', 'INVESTISSEMENT', 'FINANCEMENT', 'IMPOTS', 'ABANDONNEES'];

export interface EntreesFluxIfrs {
  /** Les états IFRS de l'exercice · résultat d'exploitation et trésorerie de la situation. */
  etat: EtatsIfrs;
  /** Les flux du tableau SYSCOHADA de l'exercice, par référence du ch. 5 (FA à FQ, ZB à ZG). */
  fluxLegaux: Record<string, number>;
  /** La CAFG légale (FA) répartie par catégorie IFRS 18 des comptes de gestion · la somme vaut FA. */
  cafgParCategorie: Record<CategorieFlux, number>;
  tresorerie: {
    ouverture: number;
    cloture: number;
    /** Comptes de la trésorerie légale (BT, DT) hors de la trésorerie IAS 7, et leur variation de solde (débit positif). */
    horsTresorerieIfrs: { numero: string; intitule: string; activite: 'INVESTISSEMENT' | 'FINANCEMENT'; variation: number }[];
    /** Comptes rangés en trésorerie IAS 7 qui ne sont pas de la trésorerie au bilan légal. */
    horsBilanLegal: string[];
    /** Solde de clôture des découverts inclus dans la trésorerie sans être rangés en « Trésorerie » (§ 8), crédit négatif. */
    decouvertsInclus: number;
    /** Le bilan légal porte une trésorerie passive (DT), à l'ouverture ou à la clôture. */
    tresoreriePassive: boolean;
  };
  declarations: {
    decouvertsDansTresorerie: boolean | null;
    tresorerieEnDevises: boolean | null;
    effetChange: { montant: number; categorie: 'OPERATIONNELLE' | 'INVESTISSEMENT' | 'FINANCEMENT' } | null;
  };
  /** Les réserves du tableau légal (postes non déterminables), reprises telles quelles. */
  reservesLegales: string[];
  /**
   * COMPTES CONSOLIDÉS · les deux flux que le tableau du D4C (ch. XII-8 § 4)
   * lit hors des comptes, montants de son tableau, signe de trésorerie. Les
   * dividendes reçus des entités mises en équivalence y sont en activité
   * opérationnelle ; IAS 7 § 34A b et § 38 les portent à l'investissement.
   */
  consolidation?: {
    dividendesRecusMe: number;
    dividendesMinoritaires: number;
    /** L'activité principale relève du § 34B · le classement des dividendes reçus n'y suit plus le § 34A. */
    activiteSelonParagraphe34B: boolean;
  };
}

export interface LigneFluxIfrs {
  cle: string;
  libelle: string;
  ref?: string;
  section: 'EXPLOITATION' | 'INVESTISSEMENT' | 'FINANCEMENT' | 'TRESORERIE';
  nature: 'FLUX' | 'TOTAL' | 'SOLDE' | 'ECART';
  montant: number;
}

export interface TableauFluxIfrs {
  lignes: LigneFluxIfrs[];
  /** § 45 · du tableau à l'état de la situation financière. */
  rapprochementSituation: { cle: string; libelle: string; montant: number }[];
  /** Du tableau SYSCOHADA au tableau IFRS, activité par activité (sert aussi IFRS 1 § 25). */
  rapprochementLegal: { activite: string; syscohada: number; ifrs: number; ecart: number }[];
  mentions: string[];
  motifsNonPubliable: string[];
}

const r2 = (x: number) => Math.round(x * 100) / 100 || 0;
const EPS = 0.005;

export function construireFluxTresorerieIfrs(p: EntreesFluxIfrs): TableauFluxIfrs {
  const f = (ref: string) => p.fluxLegaux[ref] ?? 0;
  const ligneResultat = (cle: string) => p.etat.resultat.find((l) => l.cle === cle);
  const exploitation = ligneResultat('RESULTAT_OPERATIONNEL');
  const tresoSituation = p.etat.situation.find((l) => l.cle === 'SF_TRESORERIE');

  // L'effet de change comptabilisé dans une catégorie en sort, pour être
  // présenté à part (§ 28) · le total ne bouge pas.
  const cafg = { ...p.cafgParCategorie };
  const change = p.declarations.effetChange;
  if (change) cafg[change.categorie] = r2(cafg[change.categorie] - change.montant);

  const lignes: LigneFluxIfrs[] = [];
  const flux = (section: LigneFluxIfrs['section'], cle: string, libelle: string, montant: number, ref?: string, siNonNul = false) => {
    if (siNonNul && Math.abs(montant) <= EPS) return;
    lignes.push({ cle, libelle, ...(ref ? { ref } : {}), section, nature: 'FLUX', montant: r2(montant) });
  };
  const total = (section: LigneFluxIfrs['section'], cle: string, libelle: string, ref?: string) => {
    const montant = r2(lignes.filter((l) => l.section === section && l.nature === 'FLUX').reduce((s, l) => s + l.montant, 0));
    lignes.push({ cle, libelle, ...(ref ? { ref } : {}), section, nature: 'TOTAL', montant });
    return montant;
  };

  // ─── Activités opérationnelles · méthode indirecte (§ 18 b, § 20) ──────────
  const exploitationIfrs = exploitation?.ifrs ?? 0;
  const exploitationLegal = exploitation?.legal ?? 0;
  flux('EXPLOITATION', 'E_RESULTAT_EXPLOITATION', 'Résultat d’exploitation', exploitationIfrs, 'IAS 7 § 18 b, IFRS 18 § 69 a');
  flux('EXPLOITATION', 'E_RETRAITEMENTS', 'Retraitements IFRS sans effet sur la trésorerie', -(exploitation?.retraitements ?? 0), '§ 20 b');
  flux(
    'EXPLOITATION',
    'E_ELEMENTS_SANS_TRESORERIE',
    'Éléments sans effet sur la trésorerie ou relevant d’une autre activité (dotations, reprises, résultats de cession)',
    cafg.OPERATIONNELLE - exploitationLegal,
    '§ 20 b et c',
  );
  flux('EXPLOITATION', 'E_VARIATION_BFR', 'Variation des stocks, des créances et des dettes opérationnelles', f('FB') + f('FC') + f('FD') + f('FE'), '§ 20 a');
  flux('EXPLOITATION', 'E_IMPOTS', 'Impôts sur le résultat', cafg.IMPOTS, '§ 20 d, § 35');
  flux('EXPLOITATION', 'E_ABANDONNEES', 'Activités abandonnées', cafg.ABANDONNEES, undefined, true);
  const totalExploitation = total('EXPLOITATION', 'E_TOTAL', 'Flux de trésorerie liés aux activités opérationnelles');

  // ─── Activités d'investissement (§ 16) ─────────────────────────────────────
  flux('INVESTISSEMENT', 'I_ACQ_INCORPORELLES', 'Acquisitions d’immobilisations incorporelles', f('FF'), '§ 16 a');
  flux('INVESTISSEMENT', 'I_ACQ_CORPORELLES', 'Acquisitions d’immobilisations corporelles', f('FG'), '§ 16 a');
  flux('INVESTISSEMENT', 'I_ACQ_FINANCIERES', 'Acquisitions d’immobilisations financières', f('FH'), '§ 16 c et e');
  flux('INVESTISSEMENT', 'I_CESSIONS_IMMOBILISATIONS', 'Cessions d’immobilisations incorporelles et corporelles', f('FI'), '§ 16 b');
  flux('INVESTISSEMENT', 'I_CESSIONS_FINANCIERES', 'Cessions d’immobilisations financières', f('FJ'), '§ 16 d et f');
  const placements = p.tresorerie.horsTresorerieIfrs.filter((c) => c.activite === 'INVESTISSEMENT');
  flux(
    'INVESTISSEMENT',
    'I_PLACEMENTS',
    'Placements exclus des équivalents de trésorerie',
    -placements.reduce((s, c) => s + c.variation, 0),
    '§ 7, § 16 c et d',
    true,
  );
  flux('INVESTISSEMENT', 'I_INTERETS_DIVIDENDES', 'Intérêts et dividendes reçus (catégorie « investissement »)', cafg.INVESTISSEMENT, '§ 16 i, § 34A b');
  const conso = p.consolidation;
  if (conso) {
    flux('INVESTISSEMENT', 'I_DIVIDENDES_MEE', 'Dividendes reçus des entités mises en équivalence', conso.dividendesRecusMe, '§ 34A b, § 38', true);
  }
  const totalInvestissement = total('INVESTISSEMENT', 'I_TOTAL', 'Flux de trésorerie liés aux activités d’investissement');

  // ─── Activités de financement (§ 17) ───────────────────────────────────────
  flux('FINANCEMENT', 'F_CAPITAL', 'Augmentations de capital par apports nouveaux', f('FK'), '§ 17 a');
  flux('FINANCEMENT', 'F_SUBVENTIONS', 'Subventions d’investissement reçues', f('FL'), 'classement du tableau SYSCOHADA');
  flux('FINANCEMENT', 'F_PRELEVEMENTS', 'Prélèvements sur le capital', f('FM'), '§ 17 b');
  flux('FINANCEMENT', 'F_DIVIDENDES', conso ? 'Dividendes versés par la société mère' : 'Dividendes versés', f('FN'), '§ 17 f, § 33A');
  if (conso) {
    flux('FINANCEMENT', 'F_DIVIDENDES_MINORITAIRES', 'Dividendes versés aux participations ne donnant pas le contrôle', conso.dividendesMinoritaires, '§ 17 f, § 33A', true);
  }
  flux('FINANCEMENT', 'F_EMPRUNTS', 'Emprunts et autres dettes financières', f('FO') + f('FP'), '§ 17 c');
  flux('FINANCEMENT', 'F_REMBOURSEMENTS', 'Remboursements des emprunts et autres dettes financières', f('FQ'), '§ 17 d');
  const credits = p.tresorerie.horsTresorerieIfrs.filter((c) => c.activite === 'FINANCEMENT');
  flux('FINANCEMENT', 'F_CREDITS_TRESORERIE', 'Crédits de trésorerie exclus de la trésorerie', -credits.reduce((s, c) => s + c.variation, 0), '§ 8, § 17', true);
  flux('FINANCEMENT', 'F_INTERETS', 'Intérêts versés (catégorie « financement »)', cafg.FINANCEMENT, '§ 17 g, § 34A a');
  const totalFinancement = total('FINANCEMENT', 'F_TOTAL', 'Flux de trésorerie liés aux activités de financement');

  // ─── Variation et rapprochement de la trésorerie ───────────────────────────
  const variation = r2(totalExploitation + totalInvestissement + totalFinancement);
  const solde = (cle: string, libelle: string, montant: number, ref?: string, nature: LigneFluxIfrs['nature'] = 'SOLDE') =>
    lignes.push({ cle, libelle, ...(ref ? { ref } : {}), section: 'TRESORERIE', nature, montant: r2(montant) });
  solde('T_VARIATION', 'Variation de la trésorerie et des équivalents de trésorerie', variation, undefined, 'TOTAL');
  if (change) solde('T_CHANGE', 'Incidence des variations des cours de change sur la trésorerie', change.montant, '§ 28', 'FLUX');
  solde('T_OUVERTURE', 'Trésorerie et équivalents de trésorerie à l’ouverture', p.tresorerie.ouverture);
  const attendue = r2(p.tresorerie.ouverture + variation + (change?.montant ?? 0));
  const ecart = r2(p.tresorerie.cloture - attendue);
  if (Math.abs(ecart) > EPS) solde('T_ECART', 'Écart non expliqué', ecart, undefined, 'ECART');
  solde('T_CLOTURE', 'Trésorerie et équivalents de trésorerie à la clôture', p.tresorerie.cloture);

  // § 45 · du tableau à l'état de la situation financière.
  const retraitementsTresorerie = tresoSituation?.retraitements ?? 0;
  const rapprochementSituation = [
    { cle: 'R_SITUATION', libelle: 'Trésorerie et équivalents de trésorerie, état de la situation financière', montant: r2(tresoSituation?.ifrs ?? 0) },
    ...(Math.abs(p.tresorerie.decouvertsInclus) > EPS
      ? [{ cle: 'R_DECOUVERTS', libelle: 'Découverts bancaires inclus dans la trésorerie, présentés au passif (§ 8)', montant: r2(p.tresorerie.decouvertsInclus) }]
      : []),
    ...(Math.abs(retraitementsTresorerie) > EPS ? [{ cle: 'R_RETRAITEMENTS', libelle: 'Retraitements portés sur la trésorerie', montant: r2(-retraitementsTresorerie) }] : []),
    { cle: 'R_TABLEAU', libelle: 'Trésorerie et équivalents de trésorerie du tableau des flux', montant: r2(p.tresorerie.cloture) },
  ];

  const rapprochementLegal = [
    ['Activités opérationnelles', f('ZB'), totalExploitation],
    ['Activités d’investissement', f('ZC'), totalInvestissement],
    ['Activités de financement', f('ZF'), totalFinancement],
    ['Variation de la trésorerie', f('ZG'), r2(variation + (change?.montant ?? 0))],
  ].map(([activite, syscohada, ifrs]) => ({ activite: activite as string, syscohada: r2(syscohada as number), ifrs: ifrs as number, ecart: r2((ifrs as number) - (syscohada as number)) }));

  // ─── Mentions et motifs ────────────────────────────────────────────────────
  const mentions = [
    'Méthode indirecte à partir du résultat d’exploitation (IAS 7 § 18 b et § 20, modifiés par IFRS 18).',
    `Composition de la trésorerie et des équivalents de trésorerie (§ 45, § 46) · les comptes rangés par les règles en « Trésorerie et équivalents de trésorerie »${p.declarations.decouvertsDansTresorerie ? ', plus les découverts bancaires remboursables à vue (§ 8)' : ''}.`,
    'Les intérêts et dividendes suivent la catégorie où les règles rangent leurs comptes au compte de résultat, pour le montant comptabilisé · § 34A, et § 34B à 34D pour une activité principale d’investissement, à condition que les règles suivent IFRS 18.',
    'Les transactions d’investissement et de financement sans effet sur la trésorerie en sont exclues et se décrivent dans les notes (§ 43), comme les variations des passifs issus des activités de financement (§ 44A).',
    ...p.reservesLegales.map((r) => `Tableau SYSCOHADA de départ · ${r}`),
    ...(conso
      ? [
          'Tableau consolidé · même périmètre et mêmes pourcentages d’intérêt qu’à l’exercice précédent, condition de production du tableau consolidé · aucun flux d’obtention ou de perte du contrôle (§ 39 à 42) ni de modification de pourcentage sans perte du contrôle (§ 42A) n’est à présenter.',
          'Tableau consolidé · les flux avec les actionnaires de la société mère sont lus sur ses comptes propres, ceux des participations ne donnant pas le contrôle par la variation de leurs intérêts (tableau du D4C, ch. XII-8 § 4).',
        ]
      : []),
  ];

  const motifsNonPubliable: string[] = [];
  if (Math.abs(ecart) > EPS) {
    motifsNonPubliable.push(`Tableau des flux IFRS · ${ecart} de variation de trésorerie que les flux n’expliquent pas (voir l’écart du tableau SYSCOHADA de départ et les comptes non ventilés).`);
  }
  if (p.tresorerie.tresoreriePassive && p.declarations.decouvertsDansTresorerie == null) {
    motifsNonPubliable.push('Tableau des flux IFRS · le bilan porte une trésorerie passive · déclarez si les découverts bancaires font partie intégrante de la gestion de trésorerie (IAS 7 § 8).');
  }
  if (p.declarations.tresorerieEnDevises == null) {
    motifsNonPubliable.push('Tableau des flux IFRS · déclarez si la trésorerie comprend des soldes en devises, dont l’effet de change se présente à part (IAS 7 § 28).');
  } else if (p.declarations.tresorerieEnDevises && !change) {
    motifsNonPubliable.push('Tableau des flux IFRS · la trésorerie comprend des devises et l’effet de change de l’exercice n’est pas déclaré (IAS 7 § 28).');
  }
  if (p.tresorerie.horsBilanLegal.length > 0) {
    motifsNonPubliable.push(
      `Tableau des flux IFRS · ${p.tresorerie.horsBilanLegal.join(', ')} rangé(s) en trésorerie sans être de la trésorerie au bilan légal · sa variation est déjà un flux du tableau SYSCOHADA, dont l’activité n’est pas connue ici.`,
    );
  }
  if (Math.abs(retraitementsTresorerie) > EPS) {
    motifsNonPubliable.push('Tableau des flux IFRS · un retraitement modifie la trésorerie · la trésorerie ne bouge que par un flux, et un retraitement n’en porte aucun. Rangez le compte par une règle.');
  }
  if (conso?.activiteSelonParagraphe34B && Math.abs(conso.dividendesRecusMe) > EPS) {
    motifsNonPubliable.push(
      'Tableau des flux IFRS consolidé · l’activité principale relève du § 34B, qui classe les dividendes reçus selon la catégorie de leurs produits au résultat · ceux des entités mises en équivalence n’y figurent pas, et ce module ne les classe pas.',
    );
  }
  if (Math.abs(cafg.ABANDONNEES) > EPS) {
    motifsNonPubliable.push('Tableau des flux IFRS · les flux des activités abandonnées ne sont pas ventilés entre les trois activités par ce module.');
  }

  return { lignes, rapprochementSituation, rapprochementLegal, mentions, motifsNonPubliable };
}

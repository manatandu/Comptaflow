import {
  CategorieOci,
  CategorieResultat,
  LIBELLE_CATEGORIE,
  LIBELLE_CATEGORIE_OCI,
  LIBELLE_SECTION,
  motifRefusRegle,
  RUBRIQUE_PAR_CODE,
  RUBRIQUES_IFRS,
  SectionSituation,
} from './rubriques-ifrs';

/**
 * ÉTATS IFRS EN SUS DU JEU LÉGAL · item 15, tranche 1 (AUDCIF art. 73-1,
 * « en sus des états financiers de synthèse SYSCOHADA »). Moteur PUR.
 *
 * L'ARCHITECTURE EST CELLE DE `docs/decision-multi-classification.md` · le
 * grand livre reste SYSCOHADA, et rien n'y est écrit. Le jeu IFRS est la
 * balance LÉGALE projetée sur les rubriques d'IFRS 18 par des règles de
 * correspondance DÉCLARÉES (préfixe de compte → rubrique), plus des
 * RETRAITEMENTS déclarés, écritures équilibrées posées à côté, chacune avec la
 * norme qui la fonde. Aucune règle n'est écrite par OmegaX · classer un compte
 * dans une catégorie d'IFRS 18 (opérationnelle, investissement, financement)
 * dépend de l'activité de l'entité (§ 49 à 66), que seul le cabinet connaît.
 *
 * TRANCHE 2 · l'état présentant le résultat global (§ 86 à 95), en état
 * SÉPARÉ qui commence par le résultat net et suit immédiatement le compte de
 * résultat (§ 12 b). Les autres éléments du résultat global n'ont AUCUN compte
 * au SYSCOHADA · ils n'entrent que par des retraitements déclarés, et leur
 * cumul s'inscrit dans une composante propre des capitaux propres (§ 111).
 * L'état des variations des capitaux propres vit à côté
 * (`variation-capitaux-propres-ifrs.ts`), parce qu'il lit deux exercices.
 *
 * CE QUI N'EST PAS ENCORE SERVI, et qui rend le jeu NON PUBLIABLE · les
 * notes. La première application (IFRS 1) et le tableau des flux (IAS 7)
 * vivent à côté (`premiere-application-ifrs.ts`, `flux-tresorerie-ifrs.ts`).
 */

export interface LigneLegale {
  numero: string;
  intitule: string;
  /** Débit − crédit. */
  solde: number;
}

export interface RegleCorrespondance {
  prefixe: string;
  rubrique: string;
}

export interface RetraitementDeclare {
  id: string;
  libelle: string;
  /** La norme et le paragraphe qui fondent l'écart avec le SYSCOHADA. */
  fondement: string;
  /** Débit positif, crédit négatif · la somme est nulle. */
  lignes: { rubrique: string; montant: number }[];
}

export type ActivitePrincipale = 'AUCUNE' | 'INVESTIR_ACTIFS' | 'FINANCER_CLIENTS';

export interface LigneEtatIfrs {
  cle: string;
  libelle: string;
  ref?: string;
  nature: 'POSTE' | 'TOTAL' | 'NON_CLASSE';
  /** La section du bilan ou la catégorie du compte de résultat, pour grouper à l'écran. */
  groupe?: string;
  /** La balance SYSCOHADA projetée par les règles. */
  legal: number;
  retraitements: number;
  ifrs: number;
  comptes?: { numero: string; intitule: string; solde: number }[];
}

export interface EtatsIfrs {
  situation: LigneEtatIfrs[];
  resultat: LigneEtatIfrs[];
  /** L'état présentant le résultat global · § 86 à 95. */
  resultatGlobal: LigneEtatIfrs[];
  nonClasses: { numero: string; intitule: string; solde: number }[];
  rapprochements: {
    resultatSyscohada: number;
    retraitementsResultat: number;
    resultatIfrs: number;
    capitauxPropresSyscohada: number;
    retraitementsCapitauxPropres: number;
    capitauxPropresIfrs: number;
  };
  controles: { cle: string; libelle: string; ecart: number; ok: boolean }[];
  mentions: string[];
  motifsNonPubliable: string[];
}

export class RefusIfrs extends Error {}

const r2 = (x: number) => Math.round(x * 100) / 100 || 0;
const EPS = 0.005;
const ORDRE_SECTIONS: SectionSituation[] = ['ACTIF_NON_COURANT', 'ACTIF_COURANT', 'CAPITAUX_PROPRES', 'PASSIF_NON_COURANT', 'PASSIF_COURANT'];
const ORDRE_CATEGORIES: CategorieResultat[] = ['OPERATIONNELLE', 'INVESTISSEMENT', 'FINANCEMENT', 'IMPOTS', 'ABANDONNEES'];
/** § 88 · l'ordre du texte, (a) recyclables puis (b) non recyclables. */
const ORDRE_CATEGORIES_OCI: CategorieOci[] = ['OCI_RECYCLABLE', 'OCI_NON_RECYCLABLE'];
/** IFRS 18 § C1 · « annual reporting periods beginning on or after 1 January 2027 ». */
export const ENTREE_EN_VIGUEUR_IFRS18 = Date.UTC(2027, 0, 1);

/** La règle du plus long préfixe · un 2411 va à sa règle propre avant celle du 24. */
export function rubriqueDuCompte(numero: string, regles: RegleCorrespondance[]): string | null {
  let meilleure: RegleCorrespondance | null = null;
  for (const r of regles) {
    if (numero.startsWith(r.prefixe) && (!meilleure || r.prefixe.length > meilleure.prefixe.length)) meilleure = r;
  }
  return meilleure?.rubrique ?? null;
}

/** Pourquoi un retraitement déclaré est irrecevable, ou `null`. La déclaration et le calcul appellent la même règle. */
export function motifRefusRetraitement(r: Pick<RetraitementDeclare, 'libelle' | 'fondement' | 'lignes'>): string | null {
  if (!r.fondement?.trim()) {
    return `Retraitement « ${r.libelle} » sans fondement · écrivez la norme et le paragraphe qui l’imposent (par exemple IFRS 16 § 22).`;
  }
  if (r.lignes.length < 2) return `Retraitement « ${r.libelle} » · une écriture a au moins deux lignes.`;
  for (const l of r.lignes) {
    if (!RUBRIQUE_PAR_CODE.has(l.rubrique)) return `Retraitement « ${r.libelle} » · la rubrique « ${l.rubrique} » n’existe pas au catalogue.`;
    if (!(Math.abs(l.montant) > EPS)) return `Retraitement « ${r.libelle} » · une ligne sans montant.`;
  }
  const ecart = r2(r.lignes.reduce((s, l) => s + l.montant, 0));
  if (Math.abs(ecart) > EPS) return `Retraitement « ${r.libelle} » déséquilibré (écart de ${ecart}) · débits et crédits se balancent.`;
  return null;
}

export function construireEtatsIfrs(
  exercice: { dateDebut: Date },
  lignes: LigneLegale[],
  regles: RegleCorrespondance[],
  retraitements: RetraitementDeclare[],
  activitePrincipale: ActivitePrincipale | null,
): EtatsIfrs {
  for (const r of regles) {
    const m = motifRefusRegle(r.prefixe, r.rubrique);
    if (m) throw new RefusIfrs(m);
  }
  for (const r of retraitements) {
    const m = motifRefusRetraitement(r);
    if (m) throw new RefusIfrs(m);
  }

  // ─── Projection de la balance légale ──────────────────────────────────────
  const legal = new Map<string, number>();
  const comptes = new Map<string, { numero: string; intitule: string; solde: number }[]>();
  const nonClasses: { numero: string; intitule: string; solde: number }[] = [];
  let resultatSyscohada = 0;
  let capitauxPropresSyscohada = 0;
  for (const l of lignes) {
    if (Math.abs(l.solde) <= EPS || /^9/.test(l.numero) || !/^[1-8]/.test(l.numero)) continue;
    if (/^[678]/.test(l.numero)) resultatSyscohada -= l.solde;
    const code = rubriqueDuCompte(l.numero, regles);
    if (!code) {
      nonClasses.push({ numero: l.numero, intitule: l.intitule, solde: r2(l.solde) });
      continue;
    }
    legal.set(code, r2((legal.get(code) ?? 0) + l.solde));
    if (RUBRIQUE_PAR_CODE.get(code)!.section === 'CAPITAUX_PROPRES') capitauxPropresSyscohada -= l.solde;
    comptes.set(code, [...(comptes.get(code) ?? []), { numero: l.numero, intitule: l.intitule, solde: r2(l.solde) }]);
  }
  resultatSyscohada = r2(resultatSyscohada);

  // ─── Retraitements ────────────────────────────────────────────────────────
  const retr = new Map<string, number>();
  for (const r of retraitements) for (const l of r.lignes) retr.set(l.rubrique, r2((retr.get(l.rubrique) ?? 0) + l.montant));

  // Sens de présentation · actifs au débit, capitaux propres, passifs et
  // produits au crédit, les charges en négatif dans le compte de résultat.
  const poste = (code: string, signe: 1 | -1): LigneEtatIfrs => {
    const rb = RUBRIQUE_PAR_CODE.get(code)!;
    const a = r2(signe * (legal.get(code) ?? 0));
    const b = r2(signe * (retr.get(code) ?? 0));
    return { cle: code, libelle: rb.libelle, ref: rb.ref, groupe: rb.section ?? rb.categorie ?? rb.categorieOci, nature: 'POSTE', legal: a, retraitements: b, ifrs: r2(a + b), comptes: comptes.get(code) ?? [] };
  };
  const total = (cle: string, libelle: string, xs: LigneEtatIfrs[], ref?: string): LigneEtatIfrs => ({
    cle,
    libelle,
    ...(ref ? { ref } : {}),
    nature: 'TOTAL',
    legal: r2(xs.reduce((s, x) => s + x.legal, 0)),
    retraitements: r2(xs.reduce((s, x) => s + x.retraitements, 0)),
    ifrs: r2(xs.reduce((s, x) => s + x.ifrs, 0)),
  });

  // ─── Compte de résultat · catégories et sous-totaux (§ 47, § 69 à 72) ─────
  const resultat: LigneEtatIfrs[] = [];
  const parCategorie = new Map<CategorieResultat, LigneEtatIfrs[]>();
  for (const c of ORDRE_CATEGORIES) {
    parCategorie.set(c, RUBRIQUES_IFRS.filter((r) => r.categorie === c).map((r) => poste(r.code, -1)));
  }
  const nonClassesResultat = nonClasses.filter((c) => /^[678]/.test(c.numero));
  const ligneNonClasses = (cle: string, xs: { solde: number }[], signe: 1 | -1): LigneEtatIfrs => {
    const v = r2(signe * xs.reduce((s, x) => s + x.solde, 0));
    return { cle, libelle: 'Comptes sans rubrique', nature: 'NON_CLASSE', legal: v, retraitements: 0, ifrs: v };
  };
  const operationnel = [...parCategorie.get('OPERATIONNELLE')!, ...(nonClassesResultat.length ? [ligneNonClasses('PL_NON_CLASSES', nonClassesResultat, -1)] : [])];
  const tOp = total('RESULTAT_OPERATIONNEL', 'Résultat opérationnel', operationnel, '§ 69 a, § 70');
  const tAvant = total('RESULTAT_AVANT_FINANCEMENT_IMPOTS', 'Résultat avant financement et impôts sur le résultat', [tOp, ...parCategorie.get('INVESTISSEMENT')!], '§ 69 b, § 71');
  const tNet = total(
    'RESULTAT_NET',
    'Résultat net',
    [tAvant, ...parCategorie.get('FINANCEMENT')!, ...parCategorie.get('IMPOTS')!, ...parCategorie.get('ABANDONNEES')!],
    '§ 69 c, § 72',
  );
  resultat.push(...operationnel, tOp, ...parCategorie.get('INVESTISSEMENT')!, tAvant, ...parCategorie.get('FINANCEMENT')!, ...parCategorie.get('IMPOTS')!, ...parCategorie.get('ABANDONNEES')!, tNet);

  // ─── État présentant le résultat global · § 12 b, § 86 à 89 ───────────────
  // Il COMMENCE par le résultat net (§ 12 b), puis les deux catégories du § 88,
  // chacune avec ses deux postes du § 89 et son total, puis les deux totaux
  // du § 86 b et c. Pas d'attribution aux participations ne donnant pas le
  // contrôle (§ 87) · des comptes individuels n'en ont pas.
  const resultatGlobal: LigneEtatIfrs[] = [{ ...tNet, cle: 'RG_RESULTAT_NET', ref: '§ 12 b, § 86 a' }];
  const totauxOci: LigneEtatIfrs[] = [];
  for (const c of ORDRE_CATEGORIES_OCI) {
    const xs = RUBRIQUES_IFRS.filter((r) => r.categorieOci === c).map((r) => poste(r.code, -1));
    const t = total(`TOTAL_${c}`, `Total · ${LIBELLE_CATEGORIE_OCI[c].toLowerCase()}`, xs, '§ 88');
    totauxOci.push(t);
    resultatGlobal.push(...xs, t);
  }
  const tOci = total('TOTAL_OCI', 'Autres éléments du résultat global', totauxOci, '§ 86 b');
  const tGlobal = total('RESULTAT_GLOBAL', 'Résultat global', [tNet, tOci], '§ 86 c');
  resultatGlobal.push(tOci, tGlobal);

  // ─── État de la situation financière (§ 96 à 104) ─────────────────────────
  const situation: LigneEtatIfrs[] = [];
  const totaux = new Map<SectionSituation, LigneEtatIfrs>();
  const nonClassesBilan = nonClasses.filter((c) => !/^[678]/.test(c.numero));
  for (const s of ORDRE_SECTIONS) {
    const actif = s.startsWith('ACTIF');
    const xs = RUBRIQUES_IFRS.filter((r) => r.section === s).map((r) => poste(r.code, actif ? 1 : -1));
    if (s === 'CAPITAUX_PROPRES') {
      xs.push({ cle: 'SF_RESULTAT', libelle: 'Résultat net de l’exercice', ref: '§ 72', nature: 'POSTE', legal: tNet.legal, retraitements: tNet.retraitements, ifrs: tNet.ifrs });
      // L'OCI de l'exercice n'est dans aucun compte · sans cette ligne, un
      // retraitement de réévaluation grossirait l'actif sans contrepartie, et
      // l'état cesserait de boucler.
      xs.push({ cle: 'SF_OCI_EXERCICE', libelle: 'Autres éléments du résultat global de l’exercice', ref: '§ 86 b, § 111', nature: 'POSTE', legal: 0, retraitements: tOci.retraitements, ifrs: tOci.ifrs });
    }
    const t = total(`TOTAL_${s}`, `Total · ${LIBELLE_SECTION[s].toLowerCase()}`, xs);
    totaux.set(s, t);
    situation.push(...xs, t);
  }
  // Les comptes de bilan sans rubrique sont montrés, et comptés, pour que
  // l'état boucle et que rien ne disparaisse · ils le rendent non publiable.
  if (nonClassesBilan.length > 0) {
    const debit = nonClassesBilan.filter((c) => c.solde > 0);
    const credit = nonClassesBilan.filter((c) => c.solde < 0);
    if (debit.length) situation.push({ ...ligneNonClasses('SF_NON_CLASSES_ACTIF', debit, 1), libelle: 'Comptes débiteurs sans rubrique' });
    if (credit.length) situation.push({ ...ligneNonClasses('SF_NON_CLASSES_PASSIF', credit, -1), libelle: 'Comptes créditeurs sans rubrique' });
  }
  const nc = (cle: string) => situation.find((l) => l.cle === cle);
  const totalActif = total('TOTAL_ACTIF', 'Total de l’actif', [totaux.get('ACTIF_NON_COURANT')!, totaux.get('ACTIF_COURANT')!, ...(nc('SF_NON_CLASSES_ACTIF') ? [nc('SF_NON_CLASSES_ACTIF')!] : [])]);
  const totalPassif = total('TOTAL_CAPITAUX_PROPRES_PASSIF', 'Total des capitaux propres et du passif', [
    totaux.get('CAPITAUX_PROPRES')!,
    totaux.get('PASSIF_NON_COURANT')!,
    totaux.get('PASSIF_COURANT')!,
    ...(nc('SF_NON_CLASSES_PASSIF') ? [nc('SF_NON_CLASSES_PASSIF')!] : []),
  ]);
  situation.push(totalActif, totalPassif);

  // ─── Rapprochements et contrôles ──────────────────────────────────────────
  const cpIfrs = totaux.get('CAPITAUX_PROPRES')!.ifrs;
  const cpLegalAvecResultat = r2(capitauxPropresSyscohada + resultatSyscohada);
  const rapprochements = {
    resultatSyscohada,
    retraitementsResultat: tNet.retraitements,
    resultatIfrs: tNet.ifrs,
    capitauxPropresSyscohada: cpLegalAvecResultat,
    retraitementsCapitauxPropres: r2(cpIfrs - cpLegalAvecResultat),
    capitauxPropresIfrs: cpIfrs,
  };
  const controle = (cle: string, libelle: string, a: number, b: number) => {
    const ecart = r2(a - b);
    return { cle, libelle, ecart, ok: Math.abs(ecart) <= EPS };
  };
  const controles = [
    controle('SITUATION_EQUILIBREE', 'Total de l’actif = total des capitaux propres et du passif', totalActif.ifrs, totalPassif.ifrs),
    controle('RESULTAT_SYSCOHADA', 'Résultat de la balance légale = résultat projeté avant retraitements', resultatSyscohada, tNet.legal),
  ];

  const mentions: string[] = [];
  if (exercice.dateDebut.getTime() < ENTREE_EN_VIGUEUR_IFRS18) {
    mentions.push(
      'IFRS 18 est appliquée par anticipation · l’exercice est ouvert avant le 1er janvier 2027, et le fait doit être indiqué dans les notes (IFRS 18 § C1).',
    );
  }
  if (activitePrincipale === 'INVESTIR_ACTIFS') {
    mentions.push('L’entité investit dans des actifs à titre d’activité principale · le fait doit être indiqué (IFRS 18 § 51 a).');
  }

  if (Math.abs(tOci.ifrs) > EPS) {
    mentions.push(
      'Les autres éléments du résultat global sont présentés nets d’impôt (IFRS 18 § 94 a) · l’impôt relatif à chacun, reclassements compris, se donne dans les notes (§ 93), et les reclassements en résultat net aussi s’ils ne sont pas présentés (§ 90).',
    );
  }

  const motifsNonPubliable: string[] = [
    'Jeu incomplet · les notes viennent avec une tranche suivante.',
  ];
  if (activitePrincipale == null) {
    motifsNonPubliable.push(
      'L’activité principale n’est pas déclarée · le classement en catégories opérationnelle, investissement et financement en dépend (IFRS 18 § 49 à 51).',
    );
  }
  if (activitePrincipale === 'FINANCER_CLIENTS') {
    motifsNonPubliable.push(
      'L’entité finance des clients à titre d’activité principale · les choix de méthode des § 56 b et 65 et le sous-total du § 73 ne sont pas servis par cette tranche.',
    );
  }
  if (nonClasses.length > 0) {
    motifsNonPubliable.push(`${nonClasses.length} compte(s) sans rubrique IFRS · ${nonClasses.map((c) => c.numero).join(', ')}.`);
  }
  for (const c of controles.filter((x) => !x.ok)) motifsNonPubliable.push(`Contrôle en échec · ${c.libelle} (écart ${c.ecart}).`);

  return { situation, resultat, resultatGlobal, nonClasses, rapprochements, controles, mentions, motifsNonPubliable };
}

/** Les libellés de regroupement, pour l'écran. */
export const LIBELLES_GROUPES: Record<string, string> = { ...LIBELLE_SECTION, ...LIBELLE_CATEGORIE, ...LIBELLE_CATEGORIE_OCI };

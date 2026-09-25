import {
  CategorieOci,
  CategorieResultat,
  LIBELLE_CATEGORIE,
  LIBELLE_CATEGORIE_OCI,
  LIBELLE_SECTION,
  motifRefusRegle,
  RUBRIQUE_NCI,
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
 * CE QUI N'EST PAS SERVI, et qui rend le jeu NON PUBLIABLE · les informations
 * que chaque autre norme exige dans les notes (IFRS 18 § 113 b). La première
 * application (IFRS 1), le tableau des flux (IAS 7) et les notes d'IFRS 18 et
 * d'IAS 8 vivent à côté (`premiere-application-ifrs.ts`,
 * `flux-tresorerie-ifrs.ts`, `notes-ifrs.ts`).
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
  /**
   * COMPTES CONSOLIDÉS SEULEMENT (IFRS 10 § B94) · la part de chacun des
   * effets du retraitement qui revient aux participations ne donnant pas le
   * contrôle, en valeur créditrice (un profit est positif). Déclarée, jamais
   * déduite · aucun livre ne dit à quelle entité un retraitement se rapporte.
   */
  partMinoritairesResultat?: number | null;
  partMinoritairesOci?: number | null;
  partMinoritairesCapitauxPropres?: number | null;
}

/**
 * Ce que la consolidation apporte au moteur · ses POSTES (écart
 * d'acquisition, titres mis en équivalence, capitaux propres partagés), qui
 * ne sont pas des comptes et se rangent par une table propre, et la part du
 * résultat légal qui revient aux minoritaires.
 */
export interface OptionsConsolidation {
  rubriqueDuPoste: (cle: string) => string | null;
  estPosteDeResultat: (cle: string) => boolean;
  /** Résultat légal attribuable aux minoritaires (D4C), en valeur créditrice. */
  resultatMinoritaires: number;
  /** Résultat de l'ensemble consolidé, tel que le cumul le calcule · contrôlé contre la projection. */
  resultatEnsemble: number;
}

/** Les trois effets d'un retraitement sur les capitaux propres, en valeur créditrice. */
export function effetsRetraitement(r: Pick<RetraitementDeclare, 'lignes'>): { resultat: number; oci: number; capitauxPropres: number } {
  let resultat = 0;
  let oci = 0;
  let capitauxPropres = 0;
  for (const l of r.lignes) {
    const rb = RUBRIQUE_PAR_CODE.get(l.rubrique);
    if (rb?.etat === 'RESULTAT') resultat -= l.montant;
    else if (rb?.etat === 'RESULTAT_GLOBAL') oci -= l.montant;
    else if (rb?.section === 'CAPITAUX_PROPRES') capitauxPropres -= l.montant;
  }
  return { resultat: r2(resultat), oci: r2(oci), capitauxPropres: r2(capitauxPropres) };
}

/**
 * IFRS 10 § B94 · la part des minoritaires d'un retraitement consolidé.
 * Chaque effet non nul l'exige, zéro compris ; elle a le signe de l'effet et
 * ne le dépasse pas. Un retraitement des comptes individuels n'en porte pas.
 */
export function motifRefusPartsMinoritaires(r: RetraitementDeclare, consolide: boolean): string | null {
  const parts = [r.partMinoritairesResultat, r.partMinoritairesOci, r.partMinoritairesCapitauxPropres];
  if (!consolide) {
    return parts.some((x) => x != null)
      ? `Retraitement « ${r.libelle} » · une part des participations ne donnant pas le contrôle n’existe que dans les comptes consolidés.`
      : null;
  }
  const e = effetsRetraitement(r);
  const couples: [number, number | null | undefined, string][] = [
    [e.resultat, r.partMinoritairesResultat, 'au résultat net'],
    [e.oci, r.partMinoritairesOci, 'aux autres éléments du résultat global'],
    [e.capitauxPropres, r.partMinoritairesCapitauxPropres, 'aux capitaux propres'],
  ];
  for (const [effet, part, ou] of couples) {
    if (Math.abs(effet) <= EPS) {
      if (part != null && Math.abs(part) > EPS) return `Retraitement « ${r.libelle} » · une part des minoritaires ${ou} sans effet ${ou}.`;
      continue;
    }
    if (part == null) {
      return `Retraitement « ${r.libelle} » · son effet ${ou} (${effet}) s’attribue aux propriétaires et aux participations ne donnant pas le contrôle (IFRS 10 § B94) · déclarez la part de ces dernières, zéro compris.`;
    }
    if (Math.abs(part) > EPS && (Math.sign(part) !== Math.sign(effet) || Math.abs(part) > Math.abs(effet) + EPS)) {
      return `Retraitement « ${r.libelle} » · la part des minoritaires ${ou} (${part}) a le signe de l’effet (${effet}) et ne le dépasse pas.`;
    }
  }
  return null;
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
    if (l.rubrique === RUBRIQUE_NCI) {
      return `Retraitement « ${r.libelle} » · les participations ne donnant pas le contrôle ne se retraitent pas directement · leur part se déclare avec le retraitement (IFRS 10 § B94).`;
    }
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
  conso?: OptionsConsolidation,
): EtatsIfrs {
  for (const r of regles) {
    const m = motifRefusRegle(r.prefixe, r.rubrique);
    if (m) throw new RefusIfrs(m);
  }
  for (const r of retraitements) {
    const m = motifRefusRetraitement(r) ?? motifRefusPartsMinoritaires(r, !!conso);
    if (m) throw new RefusIfrs(m);
  }

  // ─── Projection de la balance légale ──────────────────────────────────────
  const legal = new Map<string, number>();
  const comptes = new Map<string, { numero: string; intitule: string; solde: number }[]>();
  const nonClasses: { numero: string; intitule: string; solde: number }[] = [];
  let resultatSyscohada = 0;
  let capitauxPropresSyscohada = 0;
  // Un POSTE de consolidation n'est pas un compte · il n'a pas de classe, et
  // c'est la table de la consolidation qui dit s'il est du résultat.
  const estPoste = (numero: string) => !!conso && !/^\d/.test(numero);
  const estGestion = (numero: string) => (estPoste(numero) ? conso!.estPosteDeResultat(numero) : /^[678]/.test(numero));
  for (const l of lignes) {
    if (Math.abs(l.solde) <= EPS) continue;
    if (!estPoste(l.numero) && (/^9/.test(l.numero) || !/^[1-8]/.test(l.numero))) continue;
    if (estGestion(l.numero)) resultatSyscohada -= l.solde;
    const code = estPoste(l.numero) ? conso!.rubriqueDuPoste(l.numero) : rubriqueDuCompte(l.numero, regles);
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
  const nonClassesResultat = nonClasses.filter((c) => estGestion(c.numero));
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

  // ─── Comptes consolidés · la part des minoritaires (IFRS 10 § B94) ────────
  // Légale, elle vient du partage du D4C ; celle des retraitements se déclare
  // avec eux. Aucune n'est déduite d'un pourcentage.
  const sommeParts = (k: 'partMinoritairesResultat' | 'partMinoritairesOci' | 'partMinoritairesCapitauxPropres') =>
    r2(retraitements.reduce((s, r) => s + (r[k] ?? 0), 0));
  const nci = conso
    ? { resultatLegal: r2(conso.resultatMinoritaires), resultat: sommeParts('partMinoritairesResultat'), oci: sommeParts('partMinoritairesOci'), capitauxPropres: sommeParts('partMinoritairesCapitauxPropres') }
    : null;
  const attribution = (cle: string, libelle: string, ref: string, legal: number, retr: number): LigneEtatIfrs => ({
    cle,
    libelle,
    ref,
    nature: 'POSTE',
    legal: r2(legal),
    retraitements: r2(retr),
    ifrs: r2(legal + retr),
  });
  if (nci) {
    // § 76 · hors de toutes les catégories du § 47, sous le résultat net.
    resultat.push(
      attribution('RN_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE', 'Résultat net attribuable aux participations ne donnant pas le contrôle', '§ 76 a', nci.resultatLegal, nci.resultat),
      attribution('RN_PROPRIETAIRES', 'Résultat net attribuable aux propriétaires de la société mère', '§ 76 b', tNet.legal - nci.resultatLegal, tNet.retraitements - nci.resultat),
    );
  }

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
  if (nci) {
    resultatGlobal.push(
      attribution('RG_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE', 'Résultat global attribuable aux participations ne donnant pas le contrôle', '§ 87 a', nci.resultatLegal, nci.resultat + nci.oci),
      attribution('RG_PROPRIETAIRES', 'Résultat global attribuable aux propriétaires de la société mère', '§ 87 b', tGlobal.legal - nci.resultatLegal, tGlobal.retraitements - nci.resultat - nci.oci),
    );
  }

  // ─── État de la situation financière (§ 96 à 104) ─────────────────────────
  const situation: LigneEtatIfrs[] = [];
  const totaux = new Map<SectionSituation, LigneEtatIfrs>();
  const nonClassesBilan = nonClasses.filter((c) => !estGestion(c.numero));
  for (const s of ORDRE_SECTIONS) {
    const actif = s.startsWith('ACTIF');
    const xs = RUBRIQUES_IFRS.filter((r) => r.section === s && r.code !== RUBRIQUE_NCI).map((r) => poste(r.code, actif ? 1 : -1));
    if (s === 'CAPITAUX_PROPRES' && !nci) {
      xs.push({ cle: 'SF_RESULTAT', libelle: 'Résultat net de l’exercice', ref: '§ 72', nature: 'POSTE', legal: tNet.legal, retraitements: tNet.retraitements, ifrs: tNet.ifrs });
      // L'OCI de l'exercice n'est dans aucun compte · sans cette ligne, un
      // retraitement de réévaluation grossirait l'actif sans contrepartie, et
      // l'état cesserait de boucler.
      xs.push({ cle: 'SF_OCI_EXERCICE', libelle: 'Autres éléments du résultat global de l’exercice', ref: '§ 86 b, § 111', nature: 'POSTE', legal: 0, retraitements: tOci.retraitements, ifrs: tOci.ifrs });
    }
    if (s === 'CAPITAUX_PROPRES' && nci) {
      // § 104 · les capitaux propres attribuables aux propriétaires d'abord,
      // puis les participations ne donnant pas le contrôle, qui reçoivent
      // leur part du résultat, des autres éléments et des corrections
      // directes · ce qui leur est donné est retiré aux propriétaires.
      const reserves = xs.find((x) => x.cle === 'SF_RESERVES')!;
      reserves.retraitements = r2(reserves.retraitements - nci.capitauxPropres);
      reserves.ifrs = r2(reserves.ifrs - nci.capitauxPropres);
      xs.push(
        attribution('SF_RESULTAT', 'Résultat net de l’exercice attribuable aux propriétaires de la société mère', '§ 72, § 76 b', tNet.legal - nci.resultatLegal, tNet.retraitements - nci.resultat),
        attribution('SF_OCI_EXERCICE', 'Autres éléments du résultat global de l’exercice attribuables aux propriétaires', '§ 86 b, § 111', 0, tOci.retraitements - nci.oci),
      );
      const proprietaires = total('TOTAL_CAPITAUX_PROPRES_PROPRIETAIRES', 'Capitaux propres attribuables aux propriétaires de la société mère', xs, '§ 104 b');
      const m = poste(RUBRIQUE_NCI, -1);
      const minoritaires: LigneEtatIfrs = {
        ...m,
        libelle: 'Participations ne donnant pas le contrôle (résultat de l’exercice compris)',
        legal: r2(m.legal + nci.resultatLegal),
        retraitements: r2(m.retraitements + nci.resultat + nci.oci + nci.capitauxPropres),
        ifrs: r2(m.ifrs + nci.resultatLegal + nci.resultat + nci.oci + nci.capitauxPropres),
      };
      xs.push(proprietaires, minoritaires);
      const t = total(`TOTAL_${s}`, `Total · ${LIBELLE_SECTION[s].toLowerCase()}`, [proprietaires, minoritaires]);
      totaux.set(s, t);
      situation.push(...xs, t);
      continue;
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
    ...(conso ? [controle('RESULTAT_ENSEMBLE', 'Résultat projeté = résultat de l’ensemble consolidé (D4C)', resultatSyscohada, conso.resultatEnsemble)] : []),
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
    // IFRS 18 § 113 b · les notes d'IFRS 18 et d'IAS 8 sont servies
    // (`notes-ifrs.ts`) ; celles des autres normes ne le sont pas.
    'Jeu incomplet · les informations exigées par les autres normes IFRS (IFRS 18 § 113 b), propres à chaque norme appliquée au dossier, ne sont pas servies par OmegaX.',
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

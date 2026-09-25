import { EtatsIfrs, LigneLegale, RefusIfrs, RetraitementDeclare } from './etats-ifrs';
import { RUBRIQUE_PAR_CODE } from './rubriques-ifrs';

/**
 * PREMIÈRE APPLICATION DES IFRS · item 15, tranche 4. Moteur PUR.
 *
 * SOURCE, lue le 2026-09-25 · IFRS 1, traduction française de l'édition
 * « 2023 Issued Standards » (skill `ifrs`), § 6 à 28 et annexe A. RÉSERVE ·
 * IFRS 18 modifie d'autres normes (son annexe D), et le texte d'IFRS 1 du
 * corpus est antérieur à cette annexe · les paragraphes servis ici (§ 6, 10,
 * 11, 21, 23, 24, 26) sont appliqués tels que le corpus les écrit.
 *
 * LA DATE DE TRANSITION est le « début de la première période pour laquelle
 * une entité présente des informations IFRS comparatives complètes selon les
 * IFRS dans ses premiers états financiers IFRS » (annexe A) · avec un seul
 * exercice comparatif (§ 21), c'est l'OUVERTURE de l'exercice qui précède le
 * premier exercice IFRS. Le bilan d'ouverture IFRS (§ 6) est donc la balance
 * d'OUVERTURE légale de cet exercice (son report à-nouveau, classes 1 à 5)
 * projetée par les mêmes règles, plus les AJUSTEMENTS DE TRANSITION déclarés.
 *
 * UN AJUSTEMENT DE TRANSITION NE PASSE PAS PAR LE RÉSULTAT · § 11, il est
 * comptabilisé « directement en résultats non distribués (ou, le cas échéant,
 * dans une autre catégorie de capitaux propres) à la date de transition ». Il
 * n'y a pas de période derrière une date · une ligne de compte de résultat ou
 * d'autre élément du résultat global y est refusée.
 *
 * LES RAPPROCHEMENTS DU § 24 PARTENT DU CHIFFRE PUBLIÉ, pas de la projection.
 * Les capitaux propres SYSCOHADA sont le total CP du bilan légal (« capitaux
 * propres et ressources assimilées »), lu par la correspondance du Titre IX,
 * jamais réécrite ici. Les règles de correspondance peuvent déplacer un compte
 * de capitaux propres ailleurs (§ 10 c, par exemple une subvention) · ce
 * RECLASSEMENT est une ligne du rapprochement à part entière, puis chaque
 * retraitement a la sienne (§ 25, « suffisamment de détails »), corrections
 * d'erreurs et changements de méthodes séparés (§ 26). Ce qui reste est un
 * écart, montré, jamais absorbé.
 */

export interface RetraitementIfrs1 extends RetraitementDeclare {
  /** § 26 · une correction d'erreur du référentiel antérieur, et non un changement de méthode. */
  correctionErreur: boolean;
}

export interface LigneOuverture {
  numero: string;
  intitule: string;
  reportDebit: number;
  reportCredit: number;
}

export interface LigneRapprochement {
  cle: string;
  libelle: string;
  fondement?: string;
  nature?: 'METHODE' | 'ERREUR';
  montant: number;
}

export interface Rapprochement {
  titre: string;
  ref: string;
  lignes: LigneRapprochement[];
  depart: number;
  arrivee: number;
  ecart: number;
}

export interface PremiereApplication {
  dateTransition: string;
  ouverture: EtatsIfrs;
  rapprochements: Rapprochement[];
  mentions: string[];
  motifsNonPubliable: string[];
}

const r2 = (x: number) => Math.round(x * 100) / 100 || 0;
const EPS = 0.005;

/** Pourquoi un ajustement de transition est irrecevable, ou `null` (§ 11). */
export function motifRefusAjustementTransition(r: Pick<RetraitementDeclare, 'libelle' | 'lignes'>): string | null {
  for (const l of r.lignes) {
    const rb = RUBRIQUE_PAR_CODE.get(l.rubrique);
    if (rb && rb.etat !== 'SITUATION') {
      return `Ajustement de transition « ${r.libelle} » · la rubrique « ${rb.libelle} » n’est pas un poste de la situation financière. À la date de transition, l’ajustement va directement aux capitaux propres (IFRS 1 § 11), jamais au résultat ni aux autres éléments du résultat global.`;
    }
  }
  return null;
}

/**
 * La balance d'OUVERTURE, lue sur le report à-nouveau des classes 1 à 5. Les
 * classes 6 à 8 sont écartées · sur un exercice clôturé leur « report » est la
 * contrepassation de clôture, pas une ouverture (`EcritureService.balance`).
 */
export function lignesOuverture(lignes: LigneOuverture[]): LigneLegale[] {
  return lignes
    .filter((l) => /^[1-5]/.test(l.numero))
    .map((l) => ({ numero: l.numero, intitule: l.intitule, solde: r2(l.reportDebit - l.reportCredit) }))
    .filter((l) => Math.abs(l.solde) > EPS);
}

/**
 * Ce qu'un retraitement change · aux capitaux propres, la somme de ses lignes
 * sur les actifs et passifs (l'écriture étant équilibrée, c'est exactement
 * l'opposé de ce qu'elle porte aux capitaux propres, au résultat et aux autres
 * éléments) ; au résultat net et aux autres éléments, l'opposé de ses lignes
 * de compte de résultat et d'OCI, un produit étant au crédit.
 */
export function effetsRetraitement(r: Pick<RetraitementDeclare, 'lignes'>) {
  let capitauxPropres = 0;
  let resultat = 0;
  let oci = 0;
  for (const l of r.lignes) {
    const rb = RUBRIQUE_PAR_CODE.get(l.rubrique);
    if (!rb) continue;
    if (rb.etat === 'SITUATION' && rb.section !== 'CAPITAUX_PROPRES') capitauxPropres += l.montant;
    if (rb.etat === 'RESULTAT') resultat -= l.montant;
    if (rb.etat === 'RESULTAT_GLOBAL') oci -= l.montant;
  }
  return { capitauxPropres: r2(capitauxPropres), resultat: r2(resultat), oci: r2(oci) };
}

const cpIfrs = (e: EtatsIfrs, colonne: 'legal' | 'ifrs') => e.situation.find((l) => l.cle === 'TOTAL_CAPITAUX_PROPRES')?.[colonne] ?? 0;

function rapprochement(
  titre: string,
  ref: string,
  depart: { libelle: string; montant: number },
  reclassement: number | null,
  ajustements: { r: RetraitementIfrs1; montant: number }[],
  arrivee: { libelle: string; montant: number },
): Rapprochement {
  const lignes: LigneRapprochement[] = [{ cle: 'DEPART', libelle: depart.libelle, montant: r2(depart.montant) }];
  if (reclassement != null && Math.abs(reclassement) > EPS) {
    lignes.push({ cle: 'RECLASSEMENTS', libelle: 'Reclassements de présentation (règles de correspondance)', fondement: 'IFRS 1 § 10 c', montant: r2(reclassement) });
  }
  // § 26 · les changements de méthodes d'abord, les corrections d'erreurs ensuite, chacun sur sa ligne.
  for (const nature of ['METHODE', 'ERREUR'] as const) {
    for (const a of ajustements.filter((x) => (x.r.correctionErreur ? 'ERREUR' : 'METHODE') === nature && Math.abs(x.montant) > EPS)) {
      lignes.push({ cle: `R_${a.r.id}`, libelle: a.r.libelle, fondement: a.r.fondement, nature, montant: a.montant });
    }
  }
  const explique = r2(lignes.reduce((s, l) => s + l.montant, 0));
  const ecart = r2(arrivee.montant - explique);
  if (Math.abs(ecart) > EPS) lignes.push({ cle: 'ECART', libelle: 'Écart non expliqué', montant: ecart });
  lignes.push({ cle: 'ARRIVEE', libelle: arrivee.libelle, montant: r2(arrivee.montant) });
  return { titre, ref, lignes, depart: r2(depart.montant), arrivee: r2(arrivee.montant), ecart };
}

export function construirePremiereApplication(p: {
  dateTransition: Date;
  /** L'état de la situation financière d'ouverture IFRS (§ 6), déjà calculé sur la balance d'ouverture et les ajustements de transition. */
  ouverture: EtatsIfrs;
  ajustementsTransition: RetraitementIfrs1[];
  /** Total CP du bilan SYSCOHADA à la date de transition. */
  capitauxPropresSyscohadaTransition: number;
  /** L'exercice comparatif, dernier exercice présenté selon le référentiel antérieur (§ 24 a ii et b). */
  comparatif: EtatsIfrs;
  retraitementsComparatif: RetraitementIfrs1[];
  capitauxPropresSyscohadaComparatif: number;
}): PremiereApplication {
  for (const r of p.ajustementsTransition) {
    const m = motifRefusAjustementTransition(r);
    if (m) throw new RefusIfrs(m);
  }

  const transition = rapprochement(
    'Capitaux propres à la date de transition',
    'IFRS 1 § 24 a i',
    { libelle: 'Capitaux propres selon le SYSCOHADA (bilan, total CP)', montant: p.capitauxPropresSyscohadaTransition },
    cpIfrs(p.ouverture, 'legal') - p.capitauxPropresSyscohadaTransition,
    p.ajustementsTransition.map((r) => ({ r, montant: effetsRetraitement(r).capitauxPropres })),
    { libelle: 'Capitaux propres selon les IFRS', montant: cpIfrs(p.ouverture, 'ifrs') },
  );
  const cloture = rapprochement(
    'Capitaux propres à la clôture du dernier exercice selon le référentiel antérieur',
    'IFRS 1 § 24 a ii',
    { libelle: 'Capitaux propres selon le SYSCOHADA (bilan, total CP)', montant: p.capitauxPropresSyscohadaComparatif },
    cpIfrs(p.comparatif, 'legal') - p.capitauxPropresSyscohadaComparatif,
    p.retraitementsComparatif.map((r) => ({ r, montant: effetsRetraitement(r).capitauxPropres })),
    { libelle: 'Capitaux propres selon les IFRS', montant: cpIfrs(p.comparatif, 'ifrs') },
  );
  // § 24 b · le SYSCOHADA ne publie pas de résultat global total · le point de
  // départ est donc le résultat net, comme le texte le prévoit dans ce cas.
  const global = rapprochement(
    'Résultat global du dernier exercice selon le référentiel antérieur',
    'IFRS 1 § 24 b',
    { libelle: 'Résultat net selon le SYSCOHADA', montant: p.comparatif.rapprochements.resultatSyscohada },
    null,
    p.retraitementsComparatif.map((r) => {
      const e = effetsRetraitement(r);
      return { r, montant: r2(e.resultat + e.oci) };
    }),
    { libelle: 'Résultat global total selon les IFRS', montant: p.comparatif.resultatGlobal.find((l) => l.cle === 'RESULTAT_GLOBAL')?.ifrs ?? 0 },
  );
  const rapprochements = [transition, cloture, global];

  const mentions = [
    'IFRS 1 § 23 · l’incidence de la transition sur la situation financière, la performance et les flux de trésorerie s’explique dans les notes ; les rapprochements ci-dessous en sont la partie chiffrée (§ 24).',
    'IFRS 1 § 21 · les premiers états financiers IFRS comprennent au moins trois états de la situation financière · celui de clôture, le comparatif, et celui d’ouverture à la date de transition.',
    'Un ajustement de transition vaut à la date de transition · ce qu’il laisse au bilan à la clôture de l’exercice comparatif s’y redéclare en retraitement de cet exercice, le module ne reportant aucun retraitement d’un exercice à l’autre.',
    'Les exemptions des annexes C à E se traduisent dans les ajustements de transition déclarés · leur choix n’est pas enregistré à part, et une exemption ne s’applique pas par analogie à d’autres éléments (§ D1).',
  ];
  if (p.ajustementsTransition.some((r) => /IAS 36/.test(r.fondement))) {
    mentions.push('IFRS 1 § 24 c · une perte de valeur comptabilisée ou reprise à l’ouverture appelle les informations qu’aurait imposées IAS 36 sur la période commençant à la date de transition.');
  }

  const motifsNonPubliable: string[] = [];
  for (const r of rapprochements.filter((x) => Math.abs(x.ecart) > EPS)) {
    motifsNonPubliable.push(`Première application · ${r.titre.toLowerCase()} (${r.ref}) · écart non expliqué de ${r.ecart}.`);
  }
  for (const c of p.ouverture.controles.filter((x) => !x.ok)) {
    motifsNonPubliable.push(`Première application · état d’ouverture · ${c.libelle} (écart ${c.ecart}).`);
  }
  if (p.ouverture.nonClasses.length > 0) {
    motifsNonPubliable.push(`Première application · ${p.ouverture.nonClasses.length} compte(s) d’ouverture sans rubrique IFRS · ${p.ouverture.nonClasses.map((c) => c.numero).join(', ')}.`);
  }
  motifsNonPubliable.push(
    'Première application · les ajustements significatifs du tableau des flux de trésorerie (IFRS 1 § 25) attendent le tableau IAS 7.',
  );

  return { dateTransition: p.dateTransition.toISOString().slice(0, 10), ouverture: p.ouverture, rapprochements, mentions, motifsNonPubliable };
}

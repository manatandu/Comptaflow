/**
 * CLÉS DE RÉPARTITION · règles pures, sans Prisma.
 *
 * Ligne A20 (relevé CPCC C17). AUDCIF Titre VI, « RÉPARTITION » · « Travail de
 * classement des charges, aboutissant à l'inscription dans les comptes de
 * reclassement et les centres d'analyse des éléments qui ne peuvent pas être
 * affectés faute de moyens de mesure. Une répartition s'effectue à l'aide
 * d'une clef de répartition fondée sur des relevés statistiques ou des
 * raisonnements techniques et économiques appropriés. » Et « UNITÉ D'ŒUVRE » ·
 * « L'unité d'œuvre permet de répartir équitablement le coût d'un centre de
 * travail à d'autres centres de travail. »
 *
 * DÉFINITION D'OMEGAX (dite à l'écran) · une clé vide une section (la section
 * « auxiliaire » au sens de l'usage) sur d'autres sections du même plan, en
 * pourcentages ou en unités. Le texte ne dit ni comment arrondir, ni comment
 * traiter les prestations réciproques entre auxiliaires · OmegaX répartit au
 * centime par le plus fort reste et ne résout AUCUNE réciprocité (une cible
 * auxiliaire se répartit à son tour, par sa propre clé, dans l'ordre que le
 * cabinet choisit · la méthode « en escalier », dite).
 *
 * LA RÉPARTITION PASSE PAR DES OD ANALYTIQUES, une par compte général · une
 * OD d'OmegaX porte UN compte et s'équilibre (`od-analytique.ts`). Le total du
 * plan ne bouge pas, le grand livre non plus · ce qui sort de la section
 * source, compte par compte, entre dans les cibles sur le même compte. Rien
 * n'est écrit dans `Ecriture` ni `LigneEcriture`.
 */

export type ModeCle = 'POURCENTAGE' | 'UNITES';

export interface LigneCle {
  sectionCibleId: string;
  valeur: number;
}

export interface SectionDuPlan {
  id: string;
  planId: string;
  code: string;
  estTotal: boolean;
  estActive: boolean;
}

const centimes = (n: number) => Math.round(n * 100);

export function motifRefusCle(params: {
  planId: string;
  sectionSourceId: string;
  mode: ModeCle;
  lignes: LigneCle[];
  sections: SectionDuPlan[];
  source: string;
}): string | null {
  const { planId, sectionSourceId, mode, lignes, sections, source } = params;
  if (!source || source.trim().length < 3) {
    return "La source de la clé est exigée (relevé, plan des surfaces, feuille de temps) · une clé sans fondement ne se justifie pas.";
  }
  const sourceSection = sections.find((s) => s.id === sectionSourceId);
  if (!sourceSection || sourceSection.planId !== planId) return "La section à répartir n'appartient pas au plan de la clé.";
  if (sourceSection.estTotal) {
    return `${sourceSection.code} est une rubrique (section Total) · elle ne porte rien à répartir, ses sections Détail si.`;
  }
  if (lignes.length === 0) return 'Une clé répartit sur au moins une section.';
  const vues = new Set<string>();
  let total = 0;
  for (const [i, l] of lignes.entries()) {
    const rang = i + 1;
    if (!Number.isFinite(l.valeur) || l.valeur <= 0) return `Ligne ${rang} · la valeur de la clé est strictement positive.`;
    if (l.sectionCibleId === sectionSourceId) return `Ligne ${rang} · une section ne se répartit pas sur elle-même.`;
    if (vues.has(l.sectionCibleId)) return `Ligne ${rang} · la section figure deux fois dans la clé.`;
    vues.add(l.sectionCibleId);
    const s = sections.find((x) => x.id === l.sectionCibleId);
    if (!s || s.planId !== planId) return `Ligne ${rang} · la section n'appartient pas au plan de la clé.`;
    if (s.estTotal) return `Ligne ${rang} · ${s.code} est une rubrique (section Total) · elle totalise ses sections, elle ne reçoit rien.`;
    if (!s.estActive) return `Ligne ${rang} · la section ${s.code} est en sommeil.`;
    total += l.valeur;
  }
  // En pourcentages, la somme fait cent au centième près · une clé à 99 %
  // laisserait un pour cent sur la section source sans que rien ne le dise.
  if (mode === 'POURCENTAGE' && centimes(total) !== 10000) {
    return `Les pourcentages de la clé totalisent ${total.toFixed(2)} % · ils doivent faire 100 %.`;
  }
  return null;
}

/**
 * Partage d'un montant selon des poids, au centime, par le PLUS FORT RESTE ·
 * la somme des parts est exactement le montant. À reste égal, l'ordre de la
 * clé départage (stable), pour que deux calculs rendent la même OD.
 */
export function repartirAuCentime(montant: number, poids: readonly number[]): number[] {
  const total = poids.reduce((t, p) => t + p, 0);
  if (total <= 0) throw new Error('Poids de répartition nuls.');
  const c = Math.round(montant * 100);
  const brutes = poids.map((p) => (c * p) / total);
  const parts = brutes.map((b) => Math.floor(b));
  let reste = c - parts.reduce((t, p) => t + p, 0);
  const ordre = brutes
    .map((b, i) => ({ i, fraction: b - Math.floor(b) }))
    .sort((a, b) => (b.fraction !== a.fraction ? b.fraction - a.fraction : a.i - b.i));
  for (const { i } of ordre) {
    if (reste <= 0) break;
    parts[i] += 1;
    reste -= 1;
  }
  return parts.map((p) => p / 100);
}

export interface CumulCompteSection {
  compteId: string;
  numero: string;
  intitule: string;
  debit: number;
  credit: number;
}

export interface OdProposee {
  compteId: string;
  numero: string;
  intitule: string;
  /** Solde de la section source sur ce compte (débit moins crédit). */
  solde: number;
  lignes: { sectionId: string; debit: number; credit: number }[];
}

/**
 * La proposition · pour chaque compte où la section source porte un solde, une
 * OD qui le vide sur les cibles. Un solde DÉBITEUR (une charge) sort au crédit
 * de la source et entre au débit des cibles ; un solde CRÉDITEUR (un produit,
 * un avoir) dans l'autre sens. Un compte à solde nul ne produit rien.
 */
export function propositionRepartition(
  cumuls: readonly CumulCompteSection[],
  sectionSourceId: string,
  lignes: readonly LigneCle[],
): OdProposee[] {
  const poids = lignes.map((l) => l.valeur);
  const ods: OdProposee[] = [];
  for (const c of [...cumuls].sort((a, b) => a.numero.localeCompare(b.numero))) {
    const solde = (centimes(c.debit) - centimes(c.credit)) / 100;
    if (centimes(solde) === 0) continue;
    const absolu = Math.abs(solde);
    const parts = repartirAuCentime(absolu, poids);
    const debiteur = solde > 0;
    ods.push({
      compteId: c.compteId,
      numero: c.numero,
      intitule: c.intitule,
      solde,
      lignes: [
        { sectionId: sectionSourceId, debit: debiteur ? 0 : absolu, credit: debiteur ? absolu : 0 },
        ...lignes
          .map((l, i) => ({ sectionId: l.sectionCibleId, debit: debiteur ? parts[i] : 0, credit: debiteur ? 0 : parts[i] }))
          // Une part arrondie à zéro (poids infime sur un petit montant) ne fait
          // pas de ligne · une ligne à zéro serait refusée par l'OD.
          .filter((l) => l.debit > 0 || l.credit > 0),
      ],
    });
  }
  return ods;
}

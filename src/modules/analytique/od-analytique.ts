/**
 * OD ANALYTIQUES · règles pures, sans Prisma.
 *
 * Sage 100 i7, manuel de formation, « Saisie des OD analytiques » : « Les OD
 * analytiques sont des écritures analytiques pures, totalement
 * extra-comptables. Elles permettent de corriger une ventilation analytique
 * sans pour autant modifier les ventilations analytiques d'origine, ou
 * d'enregistrer de nouvelles écritures générales. Elles n'ont aucun impact sur
 * la comptabilité générale. »
 *
 * L'OD S'ÉQUILIBRE, ET C'EST L'ÉCART VOULU AVEC SAGE. Sage admet aussi une OD
 * qui ne se solde pas (« enregistrer de nouvelles écritures générales »). Elle
 * ferait diverger l'analytique du grand livre sans que rien ne dise pourquoi ·
 * le réalisé d'un projet dépasserait ce que les comptes ont réellement
 * enregistré, et c'est ce réalisé qu'un bailleur rapproche des comptes. Une OD
 * d'OmegaX est donc un RECLASSEMENT entre sections d'un même plan, sur un même
 * compte général : ce qui sort d'une section entre dans une autre, et le total
 * du plan ne bouge pas.
 */

export interface LigneOd {
  sectionId: string;
  debit?: number;
  credit?: number;
}

export interface SectionConnue {
  id: string;
  planId: string;
  code: string;
  estTotal: boolean;
}

const centimes = (n: number) => Math.round(n * 100);

export function motifRefusOd(params: {
  planId: string;
  lignes: LigneOd[];
  sections: SectionConnue[];
  /** Chiffre de classe du compte général (« 6 » pour un 601…). */
  classeCompte: string;
  /** Classes que le plan ventile, telles que `PlanAnalytique.classesVentilees`. */
  classesVentilees: string;
}): string | null {
  const { planId, lignes, sections, classeCompte, classesVentilees } = params;
  const classes = classesVentilees.split(',').map((c) => c.trim());
  if (!classes.includes(classeCompte)) {
    return (
      `Le plan ne ventile pas la classe ${classeCompte} (classes ventilées : ${classes.join(', ')}) · ` +
      "une OD analytique corrige une ventilation, elle n'en crée pas sur un compte que le plan ne suit pas."
    );
  }
  if (lignes.length < 2) {
    return 'Une OD analytique a au moins deux lignes · ce qui sort d’une section entre dans une autre.';
  }
  let debit = 0;
  let credit = 0;
  for (const [i, l] of lignes.entries()) {
    const d = l.debit ?? 0;
    const c = l.credit ?? 0;
    if (d < 0 || c < 0) return `Ligne ${i + 1} · un montant ne peut pas être négatif.`;
    if ((d > 0) === (c > 0)) return `Ligne ${i + 1} · porter un montant au débit OU au crédit.`;
    const s = sections.find((x) => x.id === l.sectionId);
    if (!s || s.planId !== planId) return `Ligne ${i + 1} · la section n'appartient pas au plan de l'OD.`;
    if (s.estTotal) {
      return `Ligne ${i + 1} · ${s.code} est une rubrique (section Total) · elle totalise ses sections, elle ne reçoit rien.`;
    }
    debit += d;
    credit += c;
  }
  if (centimes(debit) !== centimes(credit)) {
    return (
      `L'OD ne s'équilibre pas (débit ${debit.toFixed(2)}, crédit ${credit.toFixed(2)}) · ` +
      "une OD qui ne se solde pas ferait diverger l'analytique du grand livre."
    );
  }
  return null;
}

/** Ajoute les cumuls des OD à ceux des ventilations, section par section. */
export function fusionnerCumuls(
  ventilations: Map<string, { debit: number; credit: number }>,
  od: Map<string, { debit: number; credit: number }>,
): Map<string, { debit: number; credit: number }> {
  const r = new Map(ventilations);
  for (const [id, v] of od) {
    const a = r.get(id) ?? { debit: 0, credit: 0 };
    r.set(id, { debit: a.debit + v.debit, credit: a.credit + v.credit });
  }
  return r;
}

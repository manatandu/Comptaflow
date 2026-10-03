import type { PrismaService } from '../../common/prisma.service';
import { compteAdmisPourEcart, racinesAdmises, type Referentiel } from './ecart-change-realise';

type Lecteur = Pick<PrismaService, 'ligneEcriture'>;

/** Borne de lecture · les lignes en devise des lettrages partiels d'un exercice. */
export const PLAFOND_LIGNES_EXAMINEES = 20_000;

/** Un règlement en devise qui a soldé le tiers AU PAYÉ, sans ligne d'écart. */
export interface ReglementSansEcart {
  compteNumero: string;
  piece: string;
  date: Date;
  montantDevise: number;
  francsPortes: number;
  francsHistoriques: number;
  /** Signé · positif pour une perte non constatée. */
  ecart: number;
}

const centimes = (x: number) => Math.round(x * 100) / 100;

/**
 * LES ANCIENS RÈGLEMENTS EN DEVISE SANS LIGNE D'ÉCART (décision D4 du
 * 2026-10-03, Manasse, « réfère-toi à la loi »). Avant la ligne A6, un
 * règlement partiel soldait le tiers AU PAYÉ · la ligne du tiers portait les
 * francs du jour, l'écart réalisé sur la part réglée (art. 55) n'était pas
 * constaté, et il se mêlait au latent de la réévaluation. AUCUN RETRAITEMENT ·
 * AUDCIF art. 20, al. 2, l'erreur de l'exercice en cours se corrige
 * « exclusivement par inscription en négatif des éléments erronés ;
 * l'enregistrement exact est ensuite opéré » ; al. 3, l'erreur significative
 * d'un exercice antérieur passe par le report à nouveau · deux actes du
 * cabinet, jamais du logiciel.
 *
 * RECONNAISSABLE SEULEMENT DANS UN LETTRAGE PARTIEL · c'est le groupe qui dit
 * quelle facture la ligne règle. Le côté de la ligne la plus ANCIENNE est
 * celui des factures ; une ligne de l'autre côté dont les francs ne sont pas
 * la contrevaleur au coût historique des factures du groupe (leur cours
 * moyen) est un règlement au payé, sauf si sa pièce porte une ligne de change
 * (`racinesAdmises`, nature non lue). Un règlement NON LETTRÉ n'est pas
 * reconnaissable · rien ne dit quelle facture il éteint, ni à quel coût
 * historique ; un groupe SOLDE a vu son écart passé (A6) ; un partiel dénoué
 * dans sa devise relève de la proposition d'écart et du refus de la clôture
 * (D3).
 */
export async function reglementsSansEcart(
  prisma: Lecteur,
  p: { tenantId: string; exerciceId: string; referentiel: Referentiel },
): Promise<{ elements: ReglementSansEcart[]; tronque: boolean }> {
  const lignes = await prisma.ligneEcriture.findMany({
    where: {
      lettrageId: { not: null },
      lettre: null,
      deviseId: { not: null },
      lettrage: { statut: 'PARTIEL' },
      ecriture: { tenantId: p.tenantId, exerciceId: p.exerciceId },
      compte: { OR: [{ numero: { startsWith: '40' } }, { numero: { startsWith: '41' } }] },
    },
    select: {
      id: true,
      ecritureId: true,
      lettrageId: true,
      debit: true,
      credit: true,
      montantDevise: true,
      compte: { select: { numero: true } },
      ecriture: { select: { date: true, numeroPiece: true, journal: { select: { code: true } } } },
    },
    orderBy: { id: 'asc' },
    take: PLAFOND_LIGNES_EXAMINEES + 1,
  });
  const tronque = lignes.length > PLAFOND_LIGNES_EXAMINEES;
  const parGroupe = new Map<string, typeof lignes>();
  for (const l of lignes.slice(0, PLAFOND_LIGNES_EXAMINEES)) {
    parGroupe.set(l.lettrageId!, [...(parGroupe.get(l.lettrageId!) ?? []), l]);
  }

  const candidats: Array<ReglementSansEcart & { ecritureId: string }> = [];
  for (const groupe of parGroupe.values()) {
    const signe = (l: (typeof groupe)[number]) => (Number(l.debit) - Number(l.credit) >= 0 ? 1 : -1);
    const soldeDevise = groupe.reduce((t, l) => t + signe(l) * Number(l.montantDevise ?? 0), 0);
    if (Math.abs(soldeDevise) < 0.005) continue;
    const ordonnees = [...groupe].sort((a, b) => a.ecriture.date.getTime() - b.ecriture.date.getTime() || a.id.localeCompare(b.id));
    const cote = signe(ordonnees[0]!);
    const factures = ordonnees.filter((l) => signe(l) === cote);
    const devisesFactures = factures.reduce((t, l) => t + Number(l.montantDevise ?? 0), 0);
    if (!(devisesFactures > 0)) continue;
    const coursHistorique = factures.reduce((t, l) => t + Math.abs(Number(l.debit) - Number(l.credit)), 0) / devisesFactures;
    for (const r of ordonnees.filter((l) => signe(l) !== cote)) {
      const devise = Number(r.montantDevise ?? 0);
      const portes = centimes(Math.abs(Number(r.debit) - Number(r.credit)));
      const historiques = centimes(devise * coursHistorique);
      // Au coût historique (règlement A6), à l'arrondi du cours près · rien à dire.
      if (Math.abs(portes - historiques) <= 0.01 + devise * 1e-6) continue;
      // Factures au crédit (fournisseur) · payer plus que l'origine est une perte.
      const ecart = centimes(cote < 0 ? portes - historiques : historiques - portes);
      candidats.push({
        ecritureId: r.ecritureId,
        compteNumero: r.compte.numero,
        piece: `${r.ecriture.journal.code} n° ${r.ecriture.numeroPiece ?? ''}`.trim(),
        date: r.ecriture.date,
        montantDevise: devise,
        francsPortes: portes,
        francsHistoriques: historiques,
        ecart,
      });
    }
  }
  if (candidats.length === 0) return { elements: [], tronque };

  // Une pièce qui porte une ligne de change a constaté son écart · elle sort.
  const racines = [...racinesAdmises(p.referentiel, null, 'PERTE'), ...racinesAdmises(p.referentiel, null, 'GAIN')];
  const lignesDesPieces = await prisma.ligneEcriture.findMany({
    where: { ecritureId: { in: [...new Set(candidats.map((c) => c.ecritureId))] }, ecriture: { tenantId: p.tenantId } },
    select: { ecritureId: true, compte: { select: { numero: true } } },
  });
  const avecChange = new Set(lignesDesPieces.filter((l) => compteAdmisPourEcart(racines, l.compte.numero)).map((l) => l.ecritureId));
  const elements = candidats
    .filter((c) => !avecChange.has(c.ecritureId))
    .map(({ ecritureId: _e, ...reste }) => reste)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return { elements, tronque };
}

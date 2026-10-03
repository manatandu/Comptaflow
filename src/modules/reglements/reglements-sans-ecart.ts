import type { PrismaService } from '../../common/prisma.service';
import { compteAdmisPourEcart, coutsHistoriquesSuccessifs, ordreDeReglement, racinesAdmises, type Referentiel } from './ecart-change-realise';

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
 * quelle facture la ligne règle. Le RÈGLEMENT se reconnaît à SA PIÈCE (une
 * ligne de trésorerie 5x dans la même écriture, ou un journal de trésorerie),
 * jamais une écriture de CLÔTURE ni d'À-NOUVEAU (A6 bis, M2 · le report porte
 * aussi les lignes du 52 et du 57, et sa ligne du tiers passait pour un
 * règlement), les autres lignes sont les factures ; un règlement dont les
 * francs ne sont pas le coût historique de ce qu'il règle a soldé au payé,
 * sauf si sa pièce porte une ligne de change (`racinesAdmises`, nature non
 * lue). LE COÛT HISTORIQUE SE LIT PAR LA RÈGLE D'A6 (A6 bis, M1) · les
 * factures les plus anciennes d'abord, le même jour par l'identifiant de
 * ligne (`ordreDeReglement`), chaque règlement reprenant où le précédent
 * s'est arrêté (`coutsHistoriquesSuccessifs`). Le cours MOYEN des factures,
 * lu jusque-là, fabriquait un « écart non constaté » sur tout règlement A6 de
 * factures à des cours différents. Un groupe où ce n'est pas reconnaissable
 * (factures de deux sens, comme un avoir ; règlement antérieur à la première
 * facture, comme un acompte ; règlements qui dépassent les factures dans leur
 * devise) est ÉCARTÉ et COMPTÉ (`nonReconnaissables`). Un règlement NON LETTRÉ n'est pas
 * reconnaissable · rien ne dit quelle facture il éteint, ni à quel coût
 * historique ; un groupe SOLDE a vu son écart passé (A6) ; un partiel dénoué
 * dans sa devise relève de la proposition d'écart et du refus de la clôture
 * (D3).
 */
export async function reglementsSansEcart(
  prisma: Lecteur,
  p: { tenantId: string; exerciceId: string; referentiel: Referentiel },
): Promise<{ elements: ReglementSansEcart[]; tronque: boolean; nonReconnaissables: number }> {
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
      ecriture: {
        select: {
          date: true,
          numeroPiece: true,
          // Une écriture de clôture ou d'à-nouveau n'est jamais un règlement (M2).
          estGenereeParCloture: true,
          estANouveauProvisoire: true,
          journal: { select: { code: true, type: true } },
          // La pièce dit ce qu'est la ligne · une ligne de trésorerie (5x) dans
          // la même écriture fait d'elle un règlement (relecture adverse M5).
          lignes: { where: { compte: { numero: { startsWith: '5' } } }, select: { id: true }, take: 1 },
        },
      },
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
  let nonReconnaissables = 0;
  for (const groupe of parGroupe.values()) {
    const signe = (l: (typeof groupe)[number]) => (Number(l.debit) - Number(l.credit) >= 0 ? 1 : -1);
    const soldeDevise = groupe.reduce((t, l) => t + signe(l) * Number(l.montantDevise ?? 0), 0);
    if (Math.abs(soldeDevise) < 0.005) continue;
    // LE RÈGLEMENT SE RECONNAÎT À SA PIÈCE, jamais à son rang dans le groupe
    // (relecture adverse M5, § 10 bis) · une ligne de trésorerie (5x) dans
    // la même écriture, ou un journal de trésorerie. Lire « la plus ancienne
    // est la facture » prenait un acompte ou un avoir antérieurs pour la
    // facture, et fabriquait une anomalie.
    const estReglement = (l: (typeof groupe)[number]) =>
      !l.ecriture.estGenereeParCloture &&
      !l.ecriture.estANouveauProvisoire &&
      (l.ecriture.journal.type === 'TRESORERIE' || l.ecriture.lignes.length > 0);
    const reglements = groupe.filter(estReglement);
    const factures = groupe.filter((l) => !estReglement(l));
    // RECONNAISSABLE, OU ÉCARTÉ ET DIT · des factures toutes d'un sens, des
    // règlements tous de l'autre, et aucun règlement antérieur à la première
    // facture (un acompte · son cours ne se compare pas au coût historique
    // d'une facture qui n'existait pas encore). Sinon rien ne se conclut.
    const premiereFacture = Math.min(...factures.map((l) => l.ecriture.date.getTime()));
    const cote = factures.length > 0 ? signe(factures[0]!) : 0;
    if (
      factures.length === 0 ||
      reglements.length === 0 ||
      factures.some((l) => signe(l) !== cote) ||
      reglements.some((l) => signe(l) === cote || l.ecriture.date.getTime() < premiereFacture)
    ) {
      nonReconnaissables += 1;
      continue;
    }
    const devisesFactures = factures.reduce((t, l) => t + Number(l.montantDevise ?? 0), 0);
    const devisesReglees = reglements.reduce((t, l) => t + Number(l.montantDevise ?? 0), 0);
    if (!(devisesFactures > 0) || devisesReglees > devisesFactures + 0.005) {
      nonReconnaissables += 1;
      continue;
    }
    // LA RÈGLE D'A6, REJOUÉE (M1) · les règlements dans leur ordre, chacun
    // éteignant les factures les plus anciennes à partir d'où le précédent
    // s'est arrêté.
    const enOrdre = (l: (typeof groupe)[number]) => ({ id: l.id, date: l.ecriture.date });
    const reglementsEnOrdre = [...reglements].sort((a, b) => ordreDeReglement(enOrdre(a), enOrdre(b)));
    const couts = coutsHistoriquesSuccessifs(
      factures.map((l) => ({ id: l.id, date: l.ecriture.date, francs: Math.abs(Number(l.debit) - Number(l.credit)), montantDevise: Number(l.montantDevise ?? 0) })),
      reglementsEnOrdre.map((l) => Number(l.montantDevise ?? 0)),
    );
    for (const [i, r] of reglementsEnOrdre.entries()) {
      const devise = Number(r.montantDevise ?? 0);
      const portes = centimes(Math.abs(Number(r.debit) - Number(r.credit)));
      const historiques = couts[i]!;
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
  if (candidats.length === 0) return { elements: [], tronque, nonReconnaissables };

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
  return { elements, tronque, nonReconnaissables };
}

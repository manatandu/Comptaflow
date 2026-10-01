import { StatutEcriture, StatutExercice, TypeCompteDetailTotal } from '@prisma/client';
import { EcritureService } from './ecriture.service';

// LE CÂBLAGE · la règle pure est juste ; ce spec vérifie que le service la
// joue sur les bonnes lignes et n'écrit rien quand une seule est refusée.
function ligne(id: string, statut: StatutEcriture, extra: Record<string, unknown> = {}) {
  return {
    id,
    ecritureId: `e-${id}`,
    compteId: 'c601',
    compte: { numero: '60110000' },
    libelle: 'Achat',
    debit: 1000,
    credit: 0,
    lettre: null,
    rapprochementId: null,
    tauxTvaId: null,
    dateEcheance: null,
    dateVersement: null,
    ventilations: [{ sectionId: 's1', planId: 'p1', debit: 1000, credit: 0 }],
    ecriture: {
      id: `e-${id}`,
      statut,
      exerciceId: 'ex',
      journalId: 'j',
      journal: { code: 'ACH' },
      date: new Date('2026-03-15'),
      libelle: 'Facture FA-1',
      reference: 'FA-1',
      estGenereeParCloture: false,
      exercice: { statut: StatutExercice.OUVERT, dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') },
      immobilisationAcquisition: null,
      immobilisationSortie: null,
      dotationAmortissement: null,
    },
    ...extra,
  };
}

// Les modèles qui peuvent tenir une écriture · voir
// `EcritureService.detenteursDe`. Une doublure muette sur ces comptages
// validerait un service qui ne les lit pas.
const MODELES_DETENTEURS = [
  'immobilisation', 'dotationAmortissement', 'depreciationImmobilisation', 'reclassementImmobilisation', 'reevaluation', 'regularisation',
  'echeanceAbonnement', 'liquidationTva', 'donation', 'affectationResultat', 'executionEngagement',
  'mouvementStock', 'bulletinPaie', 'amortissementDerogatoire', 'ligneOrdreVirement', 'consignation',
  'ecartInventaire', 'clotureLocationAcquisition', 'repriseSubventionImmobilisation', 'reductionSubventionImmobilisation', 'revisionPlanAmortissement',
];

function service(
  lignes: ReturnType<typeof ligne>[],
  options: { tenus?: Record<string, number>; verrou?: (journalId: string, date: Date) => void } = {},
) {
  const tx = {
    ligneEcriture: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    ecriture: { create: jest.fn().mockResolvedValue({ numeroPiece: 7 }) },
  };
  const prisma = {
    compte: {
      findFirst: jest.fn().mockResolvedValue({ id: 'c604', numero: '60410000', typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true }),
    },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    ...Object.fromEntries(
      MODELES_DETENTEURS.map((m) => [m, { count: jest.fn().mockResolvedValue(options.tenus?.[m] ?? 0) }]),
    ),
  };
  const journal = { prochainNumeroPiece: jest.fn().mockResolvedValue(7) };
  const exercice = {
    verifierEcritureAutorisee: jest.fn().mockImplementation(async (_t: string, journalId: string, date: Date) =>
      options.verrou?.(journalId, date),
    ),
  };
  const s = new EcritureService(prisma as never, journal as never, exercice as never, {} as never);
  return { s, tx, prisma, exercice };
}

describe('Réimputation · le service', () => {
  it('change le compte au brouillard, et passe négatif + exact pour une ligne validée, analytique comprise', async () => {
    const { s, tx } = service([ligne('b', StatutEcriture.BROUILLARD), ligne('v', StatutEcriture.VALIDEE)]);
    const r = await s.reimputer('t', 'u', { ligneIds: ['b', 'v'], compteCibleId: 'c604', date: '2026-06-30', motif: 'Mauvais compte' });
    expect(tx.ligneEcriture.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['b'] } }, data: { compteId: 'c604' } });
    expect(tx.ligneEcriture.updateMany).toHaveBeenCalledTimes(1);
    const data = tx.ecriture.create.mock.calls[0][0].data;
    expect(data.motifCorrection).toBe('Mauvais compte');
    expect(data.journalId).toBe('j');
    const [neg, exact] = data.lignes.create;
    expect(neg).toMatchObject({ compteId: 'c601', debit: -1000 });
    expect(exact).toMatchObject({ compteId: 'c604', debit: 1000 });
    expect(neg.ventilations.create[0]).toMatchObject({ sectionId: 's1', debit: -1000 });
    expect(exact.ventilations.create[0]).toMatchObject({ sectionId: 's1', debit: 1000 });
    expect(r).toEqual({ auBrouillard: 1, validees: 1, ecrituresPassees: [{ numeroPiece: 7, journal: 'ACH' }] });
  });

  // AUDIT FINAL F1 · la devise suit la ligne, sans signe, sur les deux
  // inscriptions · sans elle, la position en devise gardait la ligne
  // déplacée sur le compte erroné et l'ignorait sur le bon.
  it('recopie la devise sur l’inscription en négatif et sur l’enregistrement exact', async () => {
    const { s, tx } = service([
      ligne('v', StatutEcriture.VALIDEE, { deviseId: 'usd', montantDevise: 1000, coursApplique: 2800 }),
    ]);
    await s.reimputer('t', 'u', { ligneIds: ['v'], compteCibleId: 'c604', date: '2026-06-30', motif: 'Mauvais compte' });
    const [neg, exact] = tx.ecriture.create.mock.calls[0][0].data.lignes.create;
    expect([neg, exact].map((l) => [l.deviseId, l.montantDevise, l.coursApplique])).toEqual([
      ['usd', 1000, 2800],
      ['usd', 1000, 2800],
    ]);
  });

  // AUDIT FINAL F2 · la fusion d'un compte chargé passe par ici, et la
  // transaction bornée à cinq secondes par défaut tombait entière.
  it('pose un délai de transaction à la mesure des lignes réimputées', async () => {
    const { s, prisma } = service([ligne('v', StatutEcriture.VALIDEE), ligne('w', StatutEcriture.VALIDEE)]);
    await s.reimputer('t', 'u', { ligneIds: ['v', 'w'], compteCibleId: 'c604', date: '2026-06-30', motif: 'Mauvais compte' });
    const options = (prisma.$transaction.mock.calls[0] as unknown[])[1] as { timeout?: number } | undefined;
    expect(options?.timeout ?? 0).toBeGreaterThan(5_000);
  });

  // AUDIT FINAL F50 · une ligne d'un groupe PARTIEL n'a pas de lettre, et
  // passait la garde · le service lit le groupe, pas seulement la lettre.
  it('refuse une ligne d’un lettrage partiel, et n’écrit rien', async () => {
    const { s, tx } = service([ligne('v', StatutEcriture.VALIDEE, { lettrageId: 'g1' })]);
    await expect(s.reimputer('t', 'u', { ligneIds: ['v'], compteCibleId: 'c604', motif: 'x' })).rejects.toThrow(
      /lettrée \(lettrage partiel\)/,
    );
    expect(tx.ecriture.create).not.toHaveBeenCalled();
  });

  it("n'écrit RIEN si une seule ligne est refusée", async () => {
    const { s, tx } = service([ligne('b', StatutEcriture.BROUILLARD), ligne('v', StatutEcriture.VALIDEE, { lettre: 'AA' })]);
    await expect(s.reimputer('t', 'u', { ligneIds: ['b', 'v'], compteCibleId: 'c604', motif: 'x' })).rejects.toThrow(/lettrée/);
    expect(tx.ligneEcriture.updateMany).not.toHaveBeenCalled();
    expect(tx.ecriture.create).not.toHaveBeenCalled();
  });

  // AUDIT DU SERVEUR DU 2026-09-27, F2 · seuls les trois détenteurs de
  // l'immobilisation refusaient. Une ligne de la liquidation de TVA, au
  // brouillard comme validée, se réimputait, et le marqueur de la liquidation
  // affirmait ensuite une imputation que l'écriture ne portait plus.
  it.each([StatutEcriture.BROUILLARD, StatutEcriture.VALIDEE])(
    "refuse une ligne %s dont l'écriture est tenue par un module, et n'écrit rien",
    async (statut) => {
      const { s, tx, prisma } = service([ligne('x', statut)], { tenus: { liquidationTva: 1 } });
      await expect(
        s.reimputer('t', 'u', { ligneIds: ['x'], compteCibleId: 'c604', date: '2026-06-30', motif: 'x' }),
      ).rejects.toThrow(/liquidation de TVA · elle ne se réimpute pas/);
      expect(tx.ligneEcriture.updateMany).not.toHaveBeenCalled();
      expect(tx.ecriture.create).not.toHaveBeenCalled();
      // La requête vise bien l'écriture de la ligne, et le dossier.
      expect((prisma as unknown as Record<string, { count: jest.Mock }>).liquidationTva.count).toHaveBeenCalledWith({
        where: { tenantId: 't', ecritureId: { in: ['e-x'] } },
      });
    },
  );

  // F3 · le verrou de période n'était lu que pour les lignes VALIDÉES. Une
  // ligne au brouillard d'une période close changeait de compte, là où
  // `modifier` l'aurait refusée. Le verrou se lit à la date de SA pièce.
  it('refuse une ligne au brouillard datée dans une période close, et n\'écrit rien', async () => {
    const { s, tx, exercice } = service([ligne('b', StatutEcriture.BROUILLARD)], {
      verrou: (_j, date) => {
        if (date <= new Date('2026-03-31')) throw new Error('période close');
      },
    });
    await expect(
      s.reimputer('t', 'u', { ligneIds: ['b'], compteCibleId: 'c604', motif: 'x' }),
    ).rejects.toThrow(/période close/);
    expect(exercice.verifierEcritureAutorisee).toHaveBeenCalledWith('t', 'j', new Date('2026-03-15'));
    expect(tx.ligneEcriture.updateMany).not.toHaveBeenCalled();
  });
});

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

function service(lignes: ReturnType<typeof ligne>[]) {
  const tx = {
    ligneEcriture: { update: jest.fn().mockResolvedValue({}) },
    ecriture: { create: jest.fn().mockResolvedValue({ numeroPiece: 7 }) },
  };
  const prisma = {
    compte: {
      findFirst: jest.fn().mockResolvedValue({ id: 'c604', numero: '60410000', typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true }),
    },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const journal = { prochainNumeroPiece: jest.fn().mockResolvedValue(7) };
  const exercice = { verifierEcritureAutorisee: jest.fn().mockResolvedValue(undefined) };
  const s = new EcritureService(prisma as never, journal as never, exercice as never, {} as never);
  return { s, tx };
}

describe('Réimputation · le service', () => {
  it('change le compte au brouillard, et passe négatif + exact pour une ligne validée, analytique comprise', async () => {
    const { s, tx } = service([ligne('b', StatutEcriture.BROUILLARD), ligne('v', StatutEcriture.VALIDEE)]);
    const r = await s.reimputer('t', 'u', { ligneIds: ['b', 'v'], compteCibleId: 'c604', date: '2026-06-30', motif: 'Mauvais compte' });
    expect(tx.ligneEcriture.update).toHaveBeenCalledWith({ where: { id: 'b' }, data: { compteId: 'c604' } });
    expect(tx.ligneEcriture.update).toHaveBeenCalledTimes(1);
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

  it("n'écrit RIEN si une seule ligne est refusée", async () => {
    const { s, tx } = service([ligne('b', StatutEcriture.BROUILLARD), ligne('v', StatutEcriture.VALIDEE, { lettre: 'AA' })]);
    await expect(s.reimputer('t', 'u', { ligneIds: ['b', 'v'], compteCibleId: 'c604', motif: 'x' })).rejects.toThrow(/lettrée/);
    expect(tx.ligneEcriture.update).not.toHaveBeenCalled();
    expect(tx.ecriture.create).not.toHaveBeenCalled();
  });
});

import { StatutExercice } from '@prisma/client';
import { ExerciceService } from './exercice.service';

const N = { id: 'n', tenantId: 't', statut: StatutExercice.OUVERT, dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
const N1 = { id: 'n1', tenantId: 't', statut: StatutExercice.OUVERT, dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31') };
const ligne = (debit: number, credit: number) => ({ debit, credit, lettre: null, libelle: 'L', dateEcheance: null, ecriture: { libelle: 'E' } });
const COMPTES = [
  { id: '601', numero: '60110000', intitule: 'Achats', modeReportANouveau: 'AUCUN', lignesEcriture: [ligne(1000, 0)] },
  { id: '701', numero: '70110000', intitule: 'Ventes', modeReportANouveau: 'AUCUN', lignesEcriture: [ligne(0, 1500)] },
  { id: '521', numero: '52110000', intitule: 'Banque', modeReportANouveau: 'SOLDE', lignesEcriture: [ligne(1500, 0), ligne(0, 1000)] },
  { id: '131', numero: '13100000', intitule: 'Excédent', modeReportANouveau: 'SOLDE', lignesEcriture: [] },
];

function service(provisoire: { id: string; numeroPiece: number; lignes: { lettre: string | null; rapprochementId: string | null }[] } | null) {
  const tx = {
    compte: {
      findMany: jest.fn().mockResolvedValue(COMPTES),
      findUnique: jest.fn().mockResolvedValue({ id: '131', numero: '13100000' }),
    },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'od', code: 'OD' }) },
    exercice: { findFirst: jest.fn().mockResolvedValue(N1), create: jest.fn() },
    ecriture: {
      findFirst: jest.fn().mockResolvedValue(provisoire),
      delete: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    ligneEcriture: { deleteMany: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    exercice: { findFirst: jest.fn().mockResolvedValue(N) },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
    ecriture: { count: jest.fn().mockResolvedValue(2) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const journalService = { prochainNumeroPiece: jest.fn().mockResolvedValue(99) };
  return { s: new ExerciceService(prisma as never, journalService as never), tx, journalService };
}

describe('À-nouveaux provisoires', () => {
  it('passe au brouillard, marqué provisoire, le report du livre-journal avec le résultat sur le 13 · équilibré', async () => {
    const { s, tx } = service(null);
    const r = await s.genererANouveauxProvisoires('t', 'n', 'u');
    const data = tx.ecriture.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ exerciceId: 'n1', estANouveauProvisoire: true, estGenereeParCloture: true, numeroPiece: 99 });
    expect(data.statut).toBeUndefined(); // brouillard par défaut, jamais validé d'office
    const lignes = data.lignes.create as { compteId: string; debit: number; credit: number }[];
    expect(lignes.find((l) => l.compteId === '131')).toMatchObject({ credit: 500 });
    expect(lignes.reduce((t, l) => t + l.debit - l.credit, 0)).toBe(0);
    // Le livre-journal seul · le brouillard restant est DIT.
    expect(tx.compte.findMany.mock.calls[0][0].include.lignesEcriture.where.ecriture.statut).toBe('VALIDEE');
    expect(r.brouillardNonRepris).toBe(2);
  });

  it('la relance REMPLACE le report précédent et reprend son numéro de pièce', async () => {
    const { s, tx, journalService } = service({ id: 'p', numeroPiece: 3, lignes: [{ lettre: null, rapprochementId: null }] });
    await s.genererANouveauxProvisoires('t', 'n', 'u');
    expect(tx.ecriture.delete).toHaveBeenCalledWith({ where: { id: 'p' } });
    expect(tx.ecriture.create.mock.calls[0][0].data.numeroPiece).toBe(3);
    expect(journalService.prochainNumeroPiece).not.toHaveBeenCalled();
  });

  it('refuse de remplacer un report dont une ligne a été lettrée sur le nouvel exercice', async () => {
    const { s, tx } = service({ id: 'p', numeroPiece: 3, lignes: [{ lettre: 'AA', rapprochementId: null }] });
    await expect(s.genererANouveauxProvisoires('t', 'n', 'u')).rejects.toThrow(/lettrées ou pointées/);
    expect(tx.ecriture.delete).not.toHaveBeenCalled();
    expect(tx.ecriture.create).not.toHaveBeenCalled();
  });
});

import { EcritureService } from '../comptabilite/ecriture.service';

describe('Le report provisoire ne se valide pas', () => {
  it('valider le refuse en le nommant', async () => {
    const prisma = {
      ecriture: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'p', statut: 'BROUILLARD', estANouveauProvisoire: true, lignes: [], exercice: { statut: 'OUVERT' }, journal: { code: 'OD' }, numeroPiece: 3 },
        ]),
      },
    };
    const s = new EcritureService(prisma as never, {} as never, {} as never, {} as never);
    await expect(s.valider('t', 'u', ['p'])).rejects.toThrow(/PROVISOIRE ne se valide pas/);
  });
});

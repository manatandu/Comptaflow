import { Prisma, StatutEcriture, StatutExercice } from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';
import { motifRefusLigne, type LigneAReimputer } from '../comptabilite/reimputation';
import { designationLettrage, estTenueParUnLettrage } from './ligne-lettree';

/**
 * AUDIT FINAL F50 · les gardes ne testaient que `lettre`, qui reste nulle
 * dans un groupe PARTIEL. Modifier, supprimer, corriger ou réimputer une
 * ligne d'une facture payée à moitié dénouait le groupe en silence · solde
 * stocké faux, groupe à cheval sur deux comptes. Un test par geste ; le
 * report provisoire et la passation de la paie ont le leur dans leur spec.
 */

describe('F50 · la règle', () => {
  it('une ligne d’un groupe partiel est tenue, comme une ligne soldée', () => {
    expect(estTenueParUnLettrage({ lettre: null, lettrageId: 'g1' })).toBe(true);
    expect(estTenueParUnLettrage({ lettre: 'A', lettrageId: 'g1' })).toBe(true);
    expect(estTenueParUnLettrage({ lettre: null, lettrageId: null })).toBe(false);
    // Un champ non lu n'est pas un lettrage.
    expect(estTenueParUnLettrage({ lettre: null } as never)).toBe(false);
    expect(designationLettrage({ lettre: null, lettrageId: 'g1' })).toBe('lettrage partiel');
    expect(designationLettrage({ lettre: 'AB', lettrageId: 'g1' })).toBe('AB');
  });
});

const exerciceOuvert = { statut: StatutExercice.OUVERT, dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
const lignesPartielles = [
  { id: 'l1', compteId: 'c401', debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(1000), lettre: null, lettrageId: 'g1', rapprochementId: null, ventilations: [] },
  { id: 'l2', compteId: 'c601', debit: new Prisma.Decimal(1000), credit: new Prisma.Decimal(0), lettre: null, lettrageId: null, rapprochementId: null, ventilations: [] },
];

function service(statut: StatutEcriture) {
  const ecriture = {
    id: 'e1',
    tenantId: 't1',
    numeroPiece: 12,
    statut,
    date: new Date('2026-05-10'),
    journalId: 'j1',
    exerciceId: 'ex',
    exercice: exerciceOuvert,
    journal: { id: 'j1', code: 'ACH' },
    libelle: 'Facture',
    reference: null,
    estGenereeParCloture: false,
    corrigeEcritureId: null,
    correction: null,
    immobilisationAcquisition: null,
    immobilisationSortie: null,
    dotationAmortissement: null,
    lignes: lignesPartielles,
  };
  const tx = {
    ecriture: { create: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    ligneEcriture: { deleteMany: jest.fn() },
  };
  // Tout détenteur d'écriture répond « aucun » · la garde du lettrage doit
  // refuser d'elle-même.
  const prisma = new Proxy(
    {
      ecriture: { findFirst: jest.fn().mockResolvedValue(ecriture), delete: jest.fn(), deleteMany: jest.fn() },
      $transaction: jest.fn((f: (t: typeof tx) => unknown) => f(tx)),
    } as Record<string, unknown>,
    { get: (cible, cle: string) => cible[cle] ?? { count: jest.fn().mockResolvedValue(0) } },
  );
  const journal = { trouver: jest.fn(), prochainNumeroPiece: jest.fn().mockResolvedValue(13) };
  const exercice = { verifierEcritureAutorisee: jest.fn().mockResolvedValue(undefined) };
  const s = new EcritureService(prisma as never, journal as never, exercice as never, {} as never);
  return { s, tx, prisma };
}

describe('F50 · les quatre gestes refusent une ligne d’un groupe partiel', () => {
  it('modifier', async () => {
    const { s, tx } = service(StatutEcriture.BROUILLARD);
    await expect(s.modifier('t1', 'e1', { libelle: 'x' })).rejects.toThrow(/lettrée \(lettrage partiel\)/);
    expect(tx.ecriture.update).not.toHaveBeenCalled();
  });

  it('supprimer', async () => {
    const { s, tx, prisma } = service(StatutEcriture.BROUILLARD);
    await expect(s.supprimer('t1', 'e1')).rejects.toThrow(/lettrée \(lettrage partiel\)/);
    expect(tx.ecriture.delete).not.toHaveBeenCalled();
    expect((prisma.ecriture as { delete: jest.Mock }).delete).not.toHaveBeenCalled();
  });

  it('corriger par inscription en négatif', async () => {
    const { s, tx } = service(StatutEcriture.VALIDEE);
    await expect(s.corrigerParInscriptionEnNegatif('t1', 'u', 'e1', { motif: 'erreur' } as never)).rejects.toThrow(
      /1 ligne\(s\) de cette écriture sont lettrées \(lettrage partiel\)/,
    );
    expect(tx.ecriture.create).not.toHaveBeenCalled();
  });

  it('réimputer', () => {
    const ligne: LigneAReimputer = {
      id: 'l1',
      compteId: 'c401',
      compteNumero: '40110000',
      debit: 0,
      credit: 1000,
      lettre: null,
      lettrageId: 'g1',
      rapprochementId: null,
      tauxTvaId: null,
      statut: 'VALIDEE',
      exerciceClos: false,
      estGenereeParCloture: false,
      tenueParImmobilisation: false,
    };
    expect(motifRefusLigne(ligne, 'c408')).toMatch(/est lettrée \(lettrage partiel\)/);
    expect(motifRefusLigne({ ...ligne, lettrageId: null }, 'c408')).toBeNull();
  });
});

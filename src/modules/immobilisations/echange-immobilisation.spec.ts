import { Referentiel, StatutImmobilisation } from '@prisma/client';
import { ImmobilisationService } from './immobilisation.service';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';

/**
 * L'ÉCHANGE (chantier d) · Guide d'application SYSCOHADA, Partie 1 ch. 5
 * § 4.5 · vente de l'ancien au prix de reprise (485 / 82), acquisition du
 * nouveau à prix de reprise + soulte (2 / 481). Le câblage se teste avec la
 * règle (F4a).
 */
const PLAN: Record<string, string> = {
  c2451: '24510000',
  c4812: '48120000',
  c4851: '48510000',
  c5211: '52110000',
  c4141: '41410000',
  c2315: '23150000',
};
const DTO = {
  dateEchange: '2026-06-30',
  exerciceId: 'e1',
  journalId: 'j1',
  prixDeReprise: 2_000_000,
  soulte: 6_000_000,
  compteCreanceId: 'c4851',
  compteFournisseurId: 'c4812',
  compteImmobilisationId: 'c2451',
  designation: 'Camion neuf',
  dureeAmortissementAns: 5,
};

function monter(o: { statut?: StatutImmobilisation; sortieEchoue?: boolean } = {}) {
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA }) },
    compte: { findFirst: jest.fn().mockImplementation(({ where }) => Promise.resolve(PLAN[where.id] ? { numero: PLAN[where.id] } : null)) },
    immobilisation: {
      findFirst: jest.fn().mockResolvedValue({ ecritureAcquisitionId: 'acq' }),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const svc = new ImmobilisationService(prisma as never, {} as never);
  const s = svc as unknown as Record<string, jest.Mock>;
  s.trouver = jest.fn().mockResolvedValue({ id: 'ancien', designation: 'Vieux camion', statut: o.statut ?? StatutImmobilisation.EN_SERVICE });
  const creer = jest.spyOn(svc, 'creer').mockResolvedValue({ id: 'nouveau' } as never);
  const sortir = jest
    .spyOn(svc, 'sortir')
    .mockImplementation(() => (o.sortieEchoue ? Promise.reject(new Error('sortie refusée')) : Promise.resolve({ id: 'ancien' } as never)));
  s.annulerEcritureOrpheline = jest.fn();
  return { svc, creer, sortir, prisma, annuler: s.annulerEcritureOrpheline };
}

describe('échange d’immobilisations', () => {
  it('le nouveau bien entre à prix de reprise + soulte, au crédit du 481 ; l’ancien sort au prix de reprise, au 485', async () => {
    const { svc, creer, sortir } = monter();
    const r = await svc.echanger('t', 'u', 'ancien', DTO);
    expect(r.valeurOrigine).toBe(8_000_000);
    expect(creer.mock.calls[0][2]).toMatchObject({ valeurOrigine: 8_000_000, compteContrepartieId: 'c4812', dateAcquisition: '2026-06-30' });
    expect(sortir.mock.calls[0][3]).toMatchObject({ type: 'CESSION', prixCession: 2_000_000, compteContrepartieId: 'c4851', dateSortie: '2026-06-30' });
  });

  it('une soulte reçue se retranche', async () => {
    const { svc, creer } = monter();
    await svc.echanger('t', 'u', 'ancien', { ...DTO, soulte: -500_000 });
    expect(creer.mock.calls[0][2].valeurOrigine).toBe(1_500_000);
  });

  it('une sortie refusée retire le bien reçu et son écriture', async () => {
    const { svc, prisma, annuler } = monter({ sortieEchoue: true });
    await expect(svc.echanger('t', 'u', 'ancien', DTO)).rejects.toThrow('sortie refusée');
    expect(prisma.immobilisation.delete).toHaveBeenCalledWith({ where: { id: 'nouveau' } });
    expect(annuler).toHaveBeenCalledWith('acq');
  });

  it('refus · bien déjà sorti, valeur nulle, contrepartie hors schéma, immeuble de placement', async () => {
    await expect(monter({ statut: StatutImmobilisation.CEDEE }).svc.echanger('t', 'u', 'ancien', DTO)).rejects.toThrow('déjà sorti');
    await expect(monter().svc.echanger('t', 'u', 'ancien', { ...DTO, soulte: -2_000_000 })).rejects.toThrow('aucune valeur');
    await expect(monter().svc.echanger('t', 'u', 'ancien', { ...DTO, compteFournisseurId: 'c5211' })).rejects.toThrow('fournisseur');
    await expect(monter().svc.echanger('t', 'u', 'ancien', { ...DTO, compteCreanceId: 'c5211' })).rejects.toThrow('485');
    await expect(monter().svc.echanger('t', 'u', 'ancien', { ...DTO, compteCreanceId: 'c4141' })).rejects.toThrow('485');
    await expect(monter().svc.echanger('t', 'u', 'ancien', { ...DTO, cessionCourante: true, compteCreanceId: 'c4141' })).resolves.toBeTruthy();
    await expect(monter().svc.echanger('t', 'u', 'ancien', { ...DTO, compteImmobilisationId: 'c2315' })).rejects.toThrow('§ 2.1.2.2');
  });

  it('les comptes du schéma sont semés aux deux plans, et l’immeuble de placement y garde son sens', () => {
    for (const plan of [PLAN_COMPTES_SYSCOHADA, PLAN_COMPTES_SYCEBNL]) {
      const n = new Map(plan.map((c) => [c.numero, c.intitule]));
      for (const c of ['48120000', '48510000', '82200000']) expect(n.has(c)).toBe(true);
      for (const c of ['22810000', '23150000', '23250000']) expect(n.get(c)).toMatch(/immeubles? de placement/i);
    }
  });
});

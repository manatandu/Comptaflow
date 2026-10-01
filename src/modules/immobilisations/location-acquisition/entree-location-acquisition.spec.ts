import { NatureLocationAcquisition, Referentiel } from '@prisma/client';
import { ImmobilisationService } from '../immobilisation.service';

/**
 * L'ENTRÉE DU BIEN (§ 2.1.5, § 2.1.7) · le câblage se teste avec la règle
 * (F4a) · dette au crédit pour sa valeur actualisée, coûts directs nets par
 * leur contrepartie, bien mis en service à la prise d'effet, contrat gardé,
 * et rien ne reste si le contrat ne s'écrit pas.
 */
const PLAN = [
  { id: 'c2456', numero: '24560000' },
  { id: 'c1730', numero: '17300000' },
  { id: 'c5211', numero: '52110000' },
  { id: 'c2451', numero: '24510000' },
];
const DTO = {
  compteImmobilisationId: 'c2456',
  nature: NatureLocationAcquisition.CREDIT_BAIL_MOBILIER,
  datePriseEffet: '2026-01-01',
  dureeMois: 96,
  periodicite: 'ANNUELLE' as const,
  termeAEchoir: false,
  loyer: 90000,
  prixOption: 0,
  tauxAnnuel: null,
  valeurContrat: 520000,
  optionRaisonnablementCertaine: true,
  bienDeFaibleValeur: false,
  designation: 'Presse',
  dureeAmortissementAns: 10,
  reference: 'CB-01',
  dateConclusion: '2025-12-15',
  exerciceId: 'ex1',
  journalId: 'j1',
};

function monter(opts: { contratEchoue?: boolean; sansDette?: boolean } = {}) {
  const parId = (where: { id?: string; numero?: string }) =>
    PLAN.find((c) => (where.id ? c.id === where.id : c.numero === where.numero)) ?? null;
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA }) },
    compte: {
      findFirst: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve(opts.sansDette && where.numero === '17300000' ? null : parId(where)),
      ),
    },
    tiers: { findFirst: jest.fn() },
    contratLocationAcquisition: {
      create: jest.fn().mockImplementation(() => (opts.contratEchoue ? Promise.reject(new Error('échec')) : Promise.resolve({}))),
    },
    immobilisation: {
      findFirst: jest.fn().mockResolvedValue({ ecritureAcquisitionId: 'e1' }),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const svc = new ImmobilisationService(prisma as never, {} as never);
  const creer = jest.spyOn(svc, 'creer').mockResolvedValue({ id: 'b1' } as never);
  const annuler = jest.fn();
  (svc as unknown as { annulerEcritureOrpheline: jest.Mock }).annulerEcritureOrpheline = annuler;
  return { svc, prisma, creer, annuler };
}

describe('entrée en location-acquisition', () => {
  it('crédite la dette du 17 pour sa valeur actualisée, met en service à la prise d’effet', async () => {
    const { svc, creer, prisma } = monter();
    await svc.creerEnLocationAcquisition('t1', 'u1', DTO);
    const [, , dto, interne] = creer.mock.calls[0];
    expect(dto).toMatchObject({ compteImmobilisationId: 'c2456', valeurOrigine: 520000, dateMiseEnService: '2026-01-01' });
    expect(interne).toEqual({ lignesCredit: [{ compteId: 'c1730', montant: 520000 }] });
    expect(prisma.contratLocationAcquisition.create.mock.calls[0][0].data).toMatchObject({
      immobilisationId: 'b1',
      dette: 520000,
      reference: 'CB-01',
    });
  });

  it('coûts directs moins avantages · ajoutés à la valeur du bien, par leur contrepartie (§ 2.1.5)', async () => {
    const { svc, creer } = monter();
    await svc.creerEnLocationAcquisition('t1', 'u1', { ...DTO, coutsDirects: 3000, avantagesRecus: 1000, compteContrepartieCoutsId: 'c5211' });
    const [, , dto, interne] = creer.mock.calls[0];
    expect(dto.valeurOrigine).toBe(522000);
    expect(interne?.lignesCredit).toEqual([
      { compteId: 'c1730', montant: 520000 },
      { compteId: 'c5211', montant: 2000 },
    ]);
  });

  it('refuse sans contrepartie des coûts, sur un compte ordinaire, sans dette au plan', async () => {
    await expect(monter().svc.creerEnLocationAcquisition('t1', 'u1', { ...DTO, coutsDirects: 500 })).rejects.toThrow('contrepartie');
    await expect(monter().svc.creerEnLocationAcquisition('t1', 'u1', { ...DTO, compteImmobilisationId: 'c2451' })).rejects.toThrow(
      'location-acquisition',
    );
    const { svc, creer } = monter({ sansDette: true });
    await expect(svc.creerEnLocationAcquisition('t1', 'u1', DTO)).rejects.toThrow('17300000');
    expect(creer).not.toHaveBeenCalled();
  });

  it('un contrat qui ne s’écrit pas emporte la fiche et son écriture', async () => {
    const { svc, prisma, annuler } = monter({ contratEchoue: true });
    await expect(svc.creerEnLocationAcquisition('t1', 'u1', DTO)).rejects.toThrow('échec');
    expect(prisma.immobilisation.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
    expect(annuler).toHaveBeenCalledWith('e1');
  });
});

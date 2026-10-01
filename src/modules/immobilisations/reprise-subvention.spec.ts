import { Prisma, Referentiel, StatutImmobilisation } from '@prisma/client';
import { proposerReprise } from './reprise-subvention';
import { RepriseSubventionService } from './reprise-subvention.service';
import { motifRefusContrepartie, racinesContrepartieAcquisition } from './contrepartie-acquisition';
import { modeDuCompteDeContrepartie } from './compte-du-bien';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';

/**
 * L'ACQUISITION GRATUITE (chantier c, décision de Manasse du 2026-10-01).
 * Fiche du compte 14 aux deux textes ; AUDCIF art. 36 et 42, Titre VIII
 * ch. 2 § 1.3.2 et ch. 11 § 1.4.
 */
describe('contrepartie d’un bien reçu gratuitement · SYSCOHADA', () => {
  const S = Referentiel.SYSCOHADA;
  it('la subvention en nature (14) est admise, avec son mode', () => {
    expect(motifRefusContrepartie(S, '24510000', '14170000')).toBeNull();
    expect(modeDuCompteDeContrepartie(S, '14170000', racinesContrepartieAcquisition(S, '24510000'))).toBe('SUBVENTION_EN_NATURE');
  });
  it('le 841 seulement pour un bâtiment sur sol propre (231), hors location-acquisition', () => {
    expect(motifRefusContrepartie(S, '23130000', '84100000')).toBeNull();
    expect(modeDuCompteDeContrepartie(S, '84100000', racinesContrepartieAcquisition(S, '23130000'))).toBe('CONSTRUCTION_FIN_DE_BAIL');
    expect(motifRefusContrepartie(S, '24510000', '84100000')).not.toBeNull();
    expect(motifRefusContrepartie(S, '23160000', '84100000')).not.toBeNull();
  });
  it('un droit public reçu gratuitement a une valeur nulle · refusé avec son texte', () => {
    // Le texte est au ch. 2 (brevets, licences et droits), jamais au ch. 1 (R&D) · renvoi corrigé le 2026-10-01.
    expect(motifRefusContrepartie(S, '21280000', '14110000')).toContain('valeur nulle');
    expect(motifRefusContrepartie(S, '21280000', '14110000')).toContain('Titre VIII ch. 2 § 1.3.2');
  });
  it('le 845 n’est pas ouvert, et aucun 841 au SYCEBNL', () => {
    expect(motifRefusContrepartie(S, '23130000', '84500000')).not.toBeNull();
    expect(racinesContrepartieAcquisition(Referentiel.SYCEBNL, '23130000')).not.toContain('841');
  });
  it('les comptes visés sont semés · 14x, 79900000, 84100000 aux plans qui les servent', () => {
    const sys = PLAN_COMPTES_SYSCOHADA.map((c) => c.numero);
    const syc = PLAN_COMPTES_SYCEBNL.map((c) => c.numero);
    for (const n of ['14110000', '14170000', '79900000', '84100000', '21280000', '23130000']) expect(sys).toContain(n);
    for (const n of ['14170000', '79900000']) expect(syc).toContain(n);
  });
});

describe('reprise au 799 · fiche du compte 14', () => {
  const base = { subvention: 600_000, valeurOrigine: 600_000, amortissable: true, dotationExercice: 120_000, cumulRepris: 0, sorti: false };
  it('bien amortissable entièrement subventionné · la reprise vaut la dotation', () => {
    expect(proposerReprise(base)).toEqual({ montant: 120_000, nature: 'EXERCICE', motif: null });
  });
  it('subvention partielle · la même part de la dotation', () => {
    expect(proposerReprise({ ...base, subvention: 300_000 }).montant).toBe(60_000);
  });
  it('sans dotation passée, rien n’est proposé', () => {
    expect(proposerReprise({ ...base, dotationExercice: null }).motif).toContain('dotation');
  });
  it('non amortissable · le dixième, ou la durée d’inaliénabilité', () => {
    expect(proposerReprise({ ...base, amortissable: false }).montant).toBe(60_000);
    expect(proposerReprise({ ...base, amortissable: false, dureeInalienabiliteAns: 4 }).montant).toBe(150_000);
  });
  it('sortie · le solde non encore repris ; jamais au-delà de la subvention', () => {
    expect(proposerReprise({ ...base, cumulRepris: 360_000, sorti: true })).toEqual({ montant: 240_000, nature: 'SORTIE', motif: null });
    expect(proposerReprise({ ...base, cumulRepris: 550_000 }).montant).toBe(50_000);
    expect(proposerReprise({ ...base, cumulRepris: 600_000 }).motif).toContain('entièrement');
  });
});

describe('reprise au 799 · le service', () => {
  const E = { id: 'e26', tenantId: 't', dateDebut: new Date('2026-01-01T00:00:00Z'), dateFin: new Date('2026-12-31T00:00:00Z') };
  function monter(o: { statut?: StatutImmobilisation; dateSortie?: Date | null; dotation?: number | null; lignes?: unknown[]; doublon?: boolean } = {}) {
    const creer = jest.fn().mockResolvedValue({ id: 'ec' });
    const retirer = jest.fn();
    const prisma = {
      immobilisation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'b1',
          designation: 'Véhicule reçu',
          valeurOrigine: 600_000,
          statut: o.statut ?? StatutImmobilisation.EN_SERVICE,
          dateSortie: o.dateSortie ?? null,
          ecritureAcquisitionId: 'acq',
          compteImmobilisation: { numero: '24510000' },
          dotations: o.dotation === null ? [] : [{ montant: o.dotation ?? 120_000 }],
          reprisesSubvention: [],
        }),
      },
      exercice: { findFirst: jest.fn().mockResolvedValue(E) },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA }) },
      ligneEcriture: {
        findMany: jest.fn().mockResolvedValue(
          o.lignes ?? [
            { compteId: 'c1417', credit: 400_000, debit: 0, compte: { numero: '14170000' } },
            { compteId: 'c1411', credit: 200_000, debit: 0, compte: { numero: '14110000' } },
          ],
        ),
      },
      compte: { findUnique: jest.fn().mockResolvedValue({ id: 'c799' }) },
      repriseSubventionImmobilisation: {
        create: jest.fn().mockImplementation(({ data }) =>
          o.doublon ? Promise.reject(new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: '5' })) : Promise.resolve(data),
        ),
      },
    };
    return { svc: new RepriseSubventionService(prisma as never, { creer, retirerCompensation: retirer } as never), creer, retirer, prisma };
  }

  it('D 14 au prorata des comptes crédités à l’acquisition, C 799, à la clôture', async () => {
    const { svc, creer } = monter();
    await svc.passer('t', 'u', 'b1', { exerciceId: 'e26', journalId: 'j' });
    const { lignes, date } = creer.mock.calls[0][2];
    expect(date).toBe('2026-12-31');
    expect(lignes).toEqual([
      { compteId: 'c1417', debit: 80_000, credit: 0 },
      { compteId: 'c1411', debit: 40_000, credit: 0 },
      { compteId: 'c799', debit: 0, credit: 120_000 },
    ]);
  });

  it('sortie dans l’exercice · le solde, à la date de cession', async () => {
    const { svc, creer, prisma } = monter({ statut: StatutImmobilisation.CEDEE, dateSortie: new Date('2026-06-30T00:00:00Z') });
    await svc.passer('t', 'u', 'b1', { exerciceId: 'e26', journalId: 'j' });
    expect(creer.mock.calls[0][2].date).toBe('2026-06-30');
    expect(prisma.repriseSubventionImmobilisation.create.mock.calls[0][0].data).toMatchObject({ nature: 'SORTIE', montant: 600_000 });
  });

  it('refus · bien sans 14 à l’acquisition, dotation non passée ; doublon retiré en 409', async () => {
    await expect(monter({ lignes: [] }).svc.passer('t', 'u', 'b1', { exerciceId: 'e26', journalId: 'j' })).rejects.toThrow('compte 14');
    await expect(monter({ dotation: null }).svc.passer('t', 'u', 'b1', { exerciceId: 'e26', journalId: 'j' })).rejects.toThrow('dotation');
    const { svc, retirer } = monter({ doublon: true });
    await expect(svc.passer('t', 'u', 'b1', { exerciceId: 'e26', journalId: 'j' })).rejects.toThrow('déjà passée');
    expect(retirer).toHaveBeenCalledWith('t', 'ec');
  });
});

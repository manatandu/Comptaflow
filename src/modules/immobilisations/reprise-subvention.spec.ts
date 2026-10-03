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
  it('le 845 n’est pas ouvert', () => {
    expect(motifRefusContrepartie(S, '23130000', '84500000')).not.toBeNull();
  });
  it('les comptes visés sont semés · 14x, 79900000, 84100000 aux plans qui les servent', () => {
    const sys = PLAN_COMPTES_SYSCOHADA.map((c) => c.numero);
    const syc = PLAN_COMPTES_SYCEBNL.map((c) => c.numero);
    for (const n of ['14110000', '14170000', '79900000', '84100000', '21280000', '23130000']) expect(sys).toContain(n);
    for (const n of ['14170000', '79900000']) expect(syc).toContain(n);
  });
});

/**
 * LOT 15 · LA CONSTRUCTION REÇUE EN FIN DE BAIL AU SYCEBNL · fiche du compte 23
 * du SYCEBNL, qui écrit « compte 845 Produits HAO constatés » quand son plan
 * n'ouvre que le 841 sous cet intitulé. Racine « 8410 » · 8411, 8412 et 8415
 * sont des contributions volontaires en nature.
 */
describe('construction reçue en fin de bail · SYCEBNL (lot 15)', () => {
  const B = Referentiel.SYCEBNL;
  it('le 84100000 est admis pour un bâtiment sur sol propre, avec son mode', () => {
    expect(motifRefusContrepartie(B, '23130000', '84100000')).toBeNull();
    expect(modeDuCompteDeContrepartie(B, '84100000', racinesContrepartieAcquisition(B, '23130000'))).toBe('CONSTRUCTION_FIN_DE_BAIL');
  });
  it('jamais un don en nature vendu, une prestation en nature ni un don à distribuer (8411, 8412, 8415)', () => {
    for (const n of ['84110000', '84120000', '84150000']) expect(motifRefusContrepartie(B, '23130000', n)).not.toBeNull();
  });
  it('ni hors du 231, ni au 2316 de location-acquisition, ni au 845 qu’il n’ouvre pas', () => {
    expect(motifRefusContrepartie(B, '24440000', '84100000')).not.toBeNull();
    expect(motifRefusContrepartie(B, '23210000', '84100000')).not.toBeNull();
    expect(motifRefusContrepartie(B, '23160000', '84100000')).not.toBeNull();
    expect(PLAN_COMPTES_SYCEBNL.map((c) => c.numero)).not.toContain('84500000');
  });
  it('le 84100000 est semé au SYCEBNL sous l’intitulé que la fiche cite', () => {
    const c = PLAN_COMPTES_SYCEBNL.find((x) => x.numero === '84100000');
    expect(c?.intitule).toMatch(/Produits H\.A\.O\. constatés/);
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
  function monter(o: { statut?: StatutImmobilisation; dateSortie?: Date | null; dotation?: number | null; lignes?: unknown[]; doublon?: boolean; referentiel?: Referentiel; depreciation?: number; numero?: string } = {}) {
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
          compteImmobilisation: { numero: o.numero ?? '24510000' },
          dotations: o.dotation === null ? [] : [{ montant: o.dotation ?? 120_000, exerciceId: 'e26', exercice: { dateDebut: E.dateDebut } }],
          depreciations: o.depreciation ? [{ sens: 'DOTATION', montant: o.depreciation, exerciceId: 'e26', exercice: { dateDebut: E.dateDebut } }] : [],
          reprisesSubvention: [],
        }),
      },
      exercice: { findFirst: jest.fn().mockResolvedValue(E) },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: o.referentiel ?? Referentiel.SYSCOHADA }) },
      ligneEcriture: {
        findMany: jest.fn().mockResolvedValue(
          o.lignes ?? [
            { compteId: 'c1417', credit: 400_000, debit: 0, compte: { numero: '14170000' } },
            { compteId: 'c1411', credit: 200_000, debit: 0, compte: { numero: '14110000' } },
          ],
        ),
      },
      compte: {
        findUnique: jest.fn(({ where }: { where: { tenantId_numero: { numero: string } } }) =>
          Promise.resolve({ id: where.tenantId_numero.numero === '79900000' ? 'c799' : `n${where.tenantId_numero.numero}` }),
        ),
      },
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
    await expect(monter({ lignes: [] }).svc.passer('t', 'u', 'b1', { exerciceId: 'e26', journalId: 'j' })).rejects.toThrow('fonds qui se reprend');
    await expect(monter({ dotation: null }).svc.passer('t', 'u', 'b1', { exerciceId: 'e26', journalId: 'j' })).rejects.toThrow('dotation');
    const { svc, retirer } = monter({ doublon: true });
    await expect(svc.passer('t', 'u', 'b1', { exerciceId: 'e26', journalId: 'j' })).rejects.toThrow('déjà passée');
    expect(retirer).toHaveBeenCalledWith('t', 'ec');
  });
});

/**
 * LES FONDS DU SYCEBNL REPRIS DEPUIS LA FICHE (lot 4) · Partie 3 ch. 2.
 * 167 au 7923 sur la dotation ET la dépréciation (§ 1.2.2, Application 5),
 * 171 au 7961 dans la même quotité que l'amortissement (§ 2.3), 172 au 7962
 * pour solde à la cession seulement (§ 2.2.3). Au SYSCOHADA, le 172 est une
 * dette de location-acquisition et ne se reprend jamais.
 */
describe('reprise des fonds du SYCEBNL · 167, 171, 172', () => {
  const E = { id: 'e26', dateDebut: new Date('2026-01-01T00:00:00Z'), dateFin: new Date('2026-12-31T00:00:00Z') };
  function monter(o: { lignes: unknown[]; numero?: string; dotation?: number | null; depreciation?: number; statut?: StatutImmobilisation; dateSortie?: Date | null; referentiel?: Referentiel }) {
    const creer = jest.fn().mockResolvedValue({ id: 'ec' });
    const prisma = {
      immobilisation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'b1', designation: 'Bien reçu', valeurOrigine: 600_000,
          statut: o.statut ?? StatutImmobilisation.EN_SERVICE, dateSortie: o.dateSortie ?? null, ecritureAcquisitionId: 'acq',
          compteImmobilisation: { numero: o.numero ?? '23130000' },
          dotations: o.dotation === null ? [] : [{ montant: o.dotation ?? 20_000, exerciceId: 'e26', exercice: { dateDebut: E.dateDebut } }],
          depreciations: o.depreciation ? [{ sens: 'DOTATION', montant: o.depreciation, exerciceId: 'e26', exercice: { dateDebut: E.dateDebut } }] : [],
          reprisesSubvention: [],
        }),
      },
      exercice: { findFirst: jest.fn().mockResolvedValue(E) },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: o.referentiel ?? Referentiel.SYCEBNL }) },
      ligneEcriture: { findMany: jest.fn().mockResolvedValue(o.lignes) },
      compte: {
        findUnique: jest.fn(({ where }: { where: { tenantId_numero: { numero: string } } }) =>
          Promise.resolve({ id: `n${where.tenantId_numero.numero}` }),
        ),
      },
      repriseSubventionImmobilisation: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)) },
    };
    return { svc: new RepriseSubventionService(prisma as never, { creer, retirerCompensation: jest.fn() } as never), creer };
  }
  const corps = { exerciceId: 'e26', journalId: 'j' };
  const l167 = [
    { compteId: 'c2313', credit: 0, debit: 600_000, compte: { numero: '23130000' } },
    { compteId: 'c1671', credit: 600_000, debit: 0, compte: { numero: '16710000' } },
  ];

  it('167 · D 167 / C 7923 pour la dotation ET la dépréciation de l’exercice', async () => {
    const { svc, creer } = monter({ lignes: l167, dotation: 20_000, depreciation: 5_000 });
    await svc.passer('t', 'u', 'b1', corps);
    expect(creer.mock.calls[0][2].lignes).toEqual([
      { compteId: 'c1671', debit: 25_000, credit: 0 },
      { compteId: 'n79230000', debit: 0, credit: 25_000 },
    ]);
    expect(creer.mock.calls[0][2].libelle).toMatch(/dons et legs/);
  });

  it('167 · le 1679 engagement auprès du donateur n’est pas un fonds reçu', async () => {
    const { svc } = monter({ lignes: [{ compteId: 'c1679', credit: 600_000, debit: 0, compte: { numero: '16790000' } }] });
    await expect(svc.passer('t', 'u', 'b1', corps)).rejects.toThrow('fonds qui se reprend');
  });

  it('167 · à la sortie du bien, rien n’est proposé, le texte ne le règle pas', async () => {
    const { svc } = monter({ lignes: l167, statut: StatutImmobilisation.MISE_HORS_SERVICE, dateSortie: new Date('2026-06-30T00:00:00Z') });
    await expect(svc.passer('t', 'u', 'b1', corps)).rejects.toThrow(/ne règle pas/);
  });

  it('171 · D 171 / C 7961 dans la même quotité que l’amortissement', async () => {
    const { svc, creer } = monter({
      numero: '20110000',
      lignes: [{ compteId: 'c171', credit: 600_000, debit: 0, compte: { numero: '17100000' } }],
      dotation: 60_000,
      depreciation: 9_000,
    });
    await svc.passer('t', 'u', 'b1', corps);
    expect(creer.mock.calls[0][2].lignes).toEqual([
      { compteId: 'c171', debit: 60_000, credit: 0 },
      { compteId: 'n79610000', debit: 0, credit: 60_000 },
    ]);
  });

  it('172 · rien au fil des exercices, le solde au 7962 à la cession', async () => {
    const lignes = [{ compteId: 'c172', credit: 600_000, debit: 0, compte: { numero: '17200000' } }];
    await expect(monter({ numero: '20300000', lignes, dotation: null }).svc.passer('t', 'u', 'b1', corps)).rejects.toThrow(/pour solde à la cession/);
    const { svc, creer } = monter({ numero: '20300000', lignes, dotation: null, statut: StatutImmobilisation.CEDEE, dateSortie: new Date('2026-06-30T00:00:00Z') });
    await svc.passer('t', 'u', 'b1', corps);
    expect(creer.mock.calls[0][2].lignes).toEqual([
      { compteId: 'c172', debit: 600_000, credit: 0 },
      { compteId: 'n79620000', debit: 0, credit: 600_000 },
    ]);
  });

  it('au SYSCOHADA, le 172 est une dette de location-acquisition · aucune reprise', async () => {
    const lignes = [{ compteId: 'c172', credit: 600_000, debit: 0, compte: { numero: '17200000' } }];
    await expect(monter({ lignes, referentiel: Referentiel.SYSCOHADA }).svc.passer('t', 'u', 'b1', corps)).rejects.toThrow('fonds qui se reprend');
  });

  it('les comptes de reprise existent au semis SYCEBNL', () => {
    const numeros = new Set(PLAN_COMPTES_SYCEBNL.map((c) => c.numero));
    expect(['79230000', '79610000', '79620000', '79900000'].filter((n) => !numeros.has(n))).toEqual([]);
  });
});

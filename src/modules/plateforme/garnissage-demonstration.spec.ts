import { GarnissageDemonstrationService } from './garnissage-demonstration.service';
import { scenarioDemonstration } from './scenario-demonstration';

function monde(referentiel: 'SYCEBNL' | 'SYSCOHADA') {
  const s = scenarioDemonstration(referentiel as never);
  const numeros = [...new Set(s.operations.flatMap((o) => o.lignes.flatMap((l) => ('nature' in l ? [l.nature] : []))))];
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn(async () => ({ referentiel })) },
    exercice: { findFirst: jest.fn(async () => ({ id: 'ex', dateDebut: new Date('2026-01-01T00:00:00Z') })) },
    journal: { findMany: jest.fn(async () => ['ACH', 'VEN', 'BQ', 'OD'].map((code) => ({ id: `j-${code}`, code, compteTresorerieId: code === 'BQ' ? 'c-banque' : null }))) },
    compte: { findMany: jest.fn(async () => numeros.map((numero) => ({ id: `c-${numero}`, numero }))) },
  };
  const tiers = { creer: jest.fn(async (_t: string, dto: { code: string }) => ({ compteIndividuel: { id: `c-${dto.code}` } })) };
  let n = 0;
  const ecritures = { creer: jest.fn(async () => ({ id: `e${++n}` })), valider: jest.fn(async () => ({})) };
  return { svc: new GarnissageDemonstrationService(prisma as never, tiers as never, ecritures as never), s, tiers, ecritures };
}

describe.each(['SYCEBNL', 'SYSCOHADA'] as const)('garnissage %s', (referentiel) => {
  it('crée les tiers, passe chaque opération par la saisie ordinaire, et valide tout', async () => {
    const m = monde(referentiel);
    const r = await m.svc.garnir('t', 'u');
    expect(r).toEqual({ tiers: m.s.tiers.length, ecritures: m.s.operations.length });
    expect(m.tiers.creer).toHaveBeenCalledTimes(m.s.tiers.length);
    expect(m.ecritures.creer).toHaveBeenCalledTimes(m.s.operations.length);
    expect(m.ecritures.valider).toHaveBeenCalledWith('t', 'u', m.s.operations.map((_, i) => `e${i + 1}`));
  });

  it('le tiers passe par son compte individuel, la trésorerie par le compte du journal de banque', async () => {
    const m = monde(referentiel);
    await m.svc.garnir('t', 'u');
    const appels = (m.ecritures.creer.mock.calls as unknown as [string, string, { journalId: string; date: string; lignes: { compteId: string }[] }][]).map((c) => c[2]);
    const comptes = appels.flatMap((a) => a.lignes.map((l) => l.compteId));
    expect(comptes).toContain('c-banque');
    for (const t of m.s.tiers) expect(comptes).toContain(`c-${t.code}`);
    // Aucun compte collectif · le tiers ne se saisit jamais sur son 401 ou 411 nu.
    expect(comptes.some((c) => /^c-4(01|11)[0-9]*0000$/.test(c))).toBe(false);
    expect(appels.every((a) => a.date.startsWith('2026-'))).toBe(true);
    expect(appels.filter((a) => a.journalId === 'j-BQ').length).toBeGreaterThan(0);
  });
});

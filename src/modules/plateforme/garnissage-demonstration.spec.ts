import { GarnissageDemonstrationService } from './garnissage-demonstration.service';
import { scenarioDemonstration } from './scenario-demonstration';

type Existant = { tiers?: string[]; ecritures?: { journalId: string; date: string; libelle: string }[] };

function monde(referentiel: 'SYCEBNL' | 'SYSCOHADA', existant: Existant = {}) {
  const s = scenarioDemonstration(referentiel as never);
  const numeros = [...new Set(s.operations.flatMap((o) => o.lignes.flatMap((l) => ('nature' in l ? [l.nature] : []))))];
  const prisma = {
    // Ce qu'une vitrine interrompue a déjà reçu (audit final F174) · la
    // doublure HONORE la recherche par code et par journal, date et libellé.
    tiers: {
      findUnique: jest.fn(async ({ where }: { where: { tenantId_code: { code: string } } }) =>
        existant.tiers?.includes(where.tenantId_code.code)
          ? { comptesRattaches: [{ compteId: `c-${where.tenantId_code.code}` }] }
          : null,
      ),
    },
    ecriture: {
      findFirst: jest.fn(async ({ where }: { where: { journalId: string; date: Date; libelle: string } }) => {
        const i = (existant.ecritures ?? []).findIndex(
          (e) => e.journalId === where.journalId && e.date === where.date.toISOString().slice(0, 10) && e.libelle === where.libelle,
        );
        return i < 0 ? null : { id: `deja-${i}` };
      }),
    },
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
    expect(r).toEqual({ tiers: m.s.tiers.length, ecritures: m.s.operations.length, crees: m.s.tiers.length + m.s.operations.length });
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

  it('se reprend sans rien recréer · un tiers et une écriture déjà là sont retrouvés (audit final F174)', async () => {
    const vierge = monde(referentiel);
    await vierge.svc.garnir('t', 'u');
    const premiere = (vierge.ecritures.creer.mock.calls as unknown as [string, string, { journalId: string; date: string; libelle: string }][])[0][2];
    const m = monde(referentiel, {
      tiers: [vierge.s.tiers[0].code],
      ecritures: [{ journalId: premiere.journalId, date: premiere.date, libelle: premiere.libelle }],
    });
    const r = await m.svc.garnir('t', 'u');
    expect(m.tiers.creer).toHaveBeenCalledTimes(m.s.tiers.length - 1);
    expect(m.ecritures.creer).toHaveBeenCalledTimes(m.s.operations.length - 1);
    expect(r.crees).toBe(m.s.tiers.length + m.s.operations.length - 2);
    // L'écriture retrouvée est validée avec les autres, à sa place.
    expect((m.ecritures.valider.mock.calls as unknown as [string, string, string[]][])[0][2][0]).toBe('deja-0');
    // Le tiers retrouvé porte son compte principal dans les écritures.
    const comptes = (m.ecritures.creer.mock.calls as unknown as [string, string, { lignes: { compteId: string }[] }][]).flatMap((c) => c[2].lignes.map((l) => l.compteId));
    const tiersRetrouve = m.s.tiers[0].code;
    const utiliseLeTiers = m.s.operations.slice(1).some((o) => o.lignes.some((l) => 'tiers' in l && l.tiers === tiersRetrouve));
    expect(utiliseLeTiers).toBe(true);
    expect(comptes).toContain(`c-${tiersRetrouve}`);
  });
});

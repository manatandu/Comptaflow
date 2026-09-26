import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { base32, codeHotp, depuisBase32, empreinteCodeSecours, pasDe } from './double-authentification';

const SECRET = base32(Buffer.from('12345678901234567890'));
const MAINTENANT = new Date('2026-09-26T10:00:00Z');
const codeA = (d: Date, decalagePas = 0) => codeHotp(depuisBase32(SECRET), pasDe(d.getTime()) + decalagePas);

async function monde(etat: Record<string, unknown> = {}) {
  const u: Record<string, unknown> = {
    id: 'u1', email: 'admin@vmg.cd', estActif: true, estOperateurPlateforme: true,
    motDePasse: await bcrypt.hash('bon-mot-de-passe', 4),
    tentativesEchouees: 0, verrouilleJusqua: null,
    secretDoubleAuth: null, doubleAuthActiveDepuis: null, dernierPasDoubleAuth: null, codesSecoursDoubleAuth: [],
    ...etat,
  };
  const ecritures: Record<string, unknown>[] = [];
  const prisma = {
    user: {
      findUnique: jest.fn(async () => ({ ...u })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        ecritures.push(data);
        Object.assign(u, data);
        return {};
      }),
    },
  };
  const none = undefined as never;
  const s = new AuthService(prisma as never, { sign: () => 'jeton' } as never, none, none, none, none, none, none, none, none);
  return { s, u, ecritures };
}

describe('connexion · le second facteur', () => {
  const ACTIVE = { secretDoubleAuth: SECRET, doubleAuthActiveDepuis: new Date('2026-01-01T00:00:00Z') };

  it('sans double authentification, rien ne change', async () => {
    const m = await monde();
    await expect(m.s.login({ email: 'admin@vmg.cd', motDePasse: 'bon-mot-de-passe' })).resolves.toHaveProperty('accessToken');
  });

  it('active, le mot de passe seul ne rend AUCUNE session, seulement la demande de code', async () => {
    const m = await monde(ACTIVE);
    await expect(m.s.login({ email: 'admin@vmg.cd', motDePasse: 'bon-mot-de-passe' })).resolves.toEqual({ deuxiemeFacteurRequis: true });
  });

  it('un mot de passe faux ne dit pas qu’un code serait attendu', async () => {
    const m = await monde(ACTIVE);
    await expect(m.s.login({ email: 'admin@vmg.cd', motDePasse: 'faux' })).rejects.toThrow('Identifiants invalides');
  });

  it('le bon code ouvre la session et consomme son pas', async () => {
    const m = await monde(ACTIVE);
    const code = codeA(new Date());
    await expect(m.s.login({ email: 'admin@vmg.cd', motDePasse: 'bon-mot-de-passe', code })).resolves.toHaveProperty('accessToken');
    expect(m.u.dernierPasDoubleAuth).toBe(pasDe(Date.now()));
    // Le même code ne resert pas.
    await expect(m.s.login({ email: 'admin@vmg.cd', motDePasse: 'bon-mot-de-passe', code })).rejects.toThrow(/Code de vérification invalide/);
  });

  it('un code faux compte comme un échec et arme le verrou', async () => {
    const m = await monde(ACTIVE);
    await expect(m.s.login({ email: 'admin@vmg.cd', motDePasse: 'bon-mot-de-passe', code: '000000' })).rejects.toThrow(/Code de vérification invalide/);
    expect(m.u.tentativesEchouees).toBe(1);
  });

  it('un code de secours ouvre la session une fois', async () => {
    const m = await monde({ ...ACTIVE, codesSecoursDoubleAuth: [empreinteCodeSecours('ABCDE-FGHIJ'), 'autre'] });
    await expect(m.s.login({ email: 'admin@vmg.cd', motDePasse: 'bon-mot-de-passe', code: 'abcde fghij' })).resolves.toHaveProperty('accessToken');
    expect(m.u.codesSecoursDoubleAuth).toEqual(['autre']);
    await expect(m.s.login({ email: 'admin@vmg.cd', motDePasse: 'bon-mot-de-passe', code: 'ABCDE-FGHIJ' })).rejects.toThrow(/Code de vérification invalide/);
  });
});

describe('activer, retirer, renouveler', () => {
  it('le secret posé ne vaut rien avant le premier code juste', async () => {
    const m = await monde();
    const { secret, uri } = await m.s.initierDoubleAuth('u1');
    expect(uri).toContain(`secret=${secret}`);
    expect(m.u.doubleAuthActiveDepuis).toBeNull();
    await expect(m.s.activerDoubleAuth('u1', '000000', MAINTENANT)).rejects.toThrow(/Code invalide/);
    expect(m.u.doubleAuthActiveDepuis).toBeNull();
  });

  it('le premier code juste l’active, rend huit codes de secours une fois et ferme les autres sessions', async () => {
    const m = await monde({ secretDoubleAuth: SECRET });
    const r = await m.s.activerDoubleAuth('u1', codeA(MAINTENANT), MAINTENANT);
    expect(r.codesSecours).toHaveLength(8);
    expect(r).toHaveProperty('accessToken');
    expect(m.u.doubleAuthActiveDepuis).toEqual(MAINTENANT);
    expect(m.u.sessionsInvalidesAvant).toEqual(MAINTENANT);
    // Seules les empreintes sont gardées.
    expect((m.u.codesSecoursDoubleAuth as string[]).some((e) => r.codesSecours.includes(e))).toBe(false);
  });

  it('le retrait exige le mot de passe ET un code, et efface tout', async () => {
    const m = await monde({ secretDoubleAuth: SECRET, doubleAuthActiveDepuis: MAINTENANT });
    await expect(m.s.desactiverDoubleAuth('u1', 'faux', codeA(MAINTENANT), MAINTENANT)).rejects.toThrow(/mot de passe/);
    await expect(m.s.desactiverDoubleAuth('u1', 'bon-mot-de-passe', '000000', MAINTENANT)).rejects.toThrow(/Code/);
    expect(m.ecritures).toHaveLength(0);
    await m.s.desactiverDoubleAuth('u1', 'bon-mot-de-passe', codeA(MAINTENANT), MAINTENANT);
    expect(m.u).toMatchObject({ secretDoubleAuth: null, doubleAuthActiveDepuis: null, codesSecoursDoubleAuth: [] });
  });

  it('de nouveaux codes de secours exigent un code, et remplacent les anciens', async () => {
    const m = await monde({ secretDoubleAuth: SECRET, doubleAuthActiveDepuis: MAINTENANT, codesSecoursDoubleAuth: ['vieux'] });
    await expect(m.s.regenererCodesSecours('u1', '000000', MAINTENANT)).rejects.toThrow(/Code/);
    const r = await m.s.regenererCodesSecours('u1', codeA(MAINTENANT), MAINTENANT);
    expect(m.u.codesSecoursDoubleAuth).toHaveLength(8);
    expect(m.u.codesSecoursDoubleAuth).not.toContain('vieux');
    expect(r.codesSecours).toHaveLength(8);
  });

  it('l’état dit si la console l’exige', async () => {
    const m = await monde({ secretDoubleAuth: SECRET, doubleAuthActiveDepuis: MAINTENANT, codesSecoursDoubleAuth: ['a', 'b'] });
    await expect(m.s.etatDoubleAuth('u1')).resolves.toMatchObject({ active: true, codesSecoursRestants: 2, exigeePourLaConsole: true });
  });
});

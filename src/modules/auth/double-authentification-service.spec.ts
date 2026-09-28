import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { base32, codeHotp, depuisBase32, empreinteCodeSecours, pasDe } from './double-authentification';

const SECRET = base32(Buffer.from('12345678901234567890'));
const MAINTENANT = new Date('2026-09-26T10:00:00Z');
const codeA = (d: Date, decalagePas = 0) => codeHotp(depuisBase32(SECRET), pasDe(d.getTime()) + decalagePas);

async function monde(etat: Record<string, unknown> = {}, courrier: { mettreEnFile: jest.Mock } | undefined = undefined) {
  const u: Record<string, unknown> = {
    id: 'u1', tenantId: 't1', email: 'admin@vmg.cd', estActif: true, estOperateurPlateforme: true,
    motDePasse: await bcrypt.hash('bon-mot-de-passe', 4),
    tentativesEchouees: 0, verrouilleJusqua: null, dernierEchecLe: null,
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
  const s = new AuthService(prisma as never, { sign: () => 'jeton' } as never, none, none, none, none, none, none, none, none, none, courrier as never);
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
    await expect(m.s.activerDoubleAuth('u1', 'bon-mot-de-passe', '000000', MAINTENANT)).rejects.toThrow(/Code invalide/);
    expect(m.u.doubleAuthActiveDepuis).toBeNull();
  });

  it('le premier code juste l’active, rend huit codes de secours une fois et ferme les autres sessions', async () => {
    const m = await monde({ secretDoubleAuth: SECRET });
    const r = await m.s.activerDoubleAuth('u1', 'bon-mot-de-passe', codeA(MAINTENANT), MAINTENANT);
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

  it('de nouveaux codes de secours exigent le mot de passe ET un code, et remplacent les anciens', async () => {
    const m = await monde({ secretDoubleAuth: SECRET, doubleAuthActiveDepuis: MAINTENANT, codesSecoursDoubleAuth: ['vieux'] });
    await expect(m.s.regenererCodesSecours('u1', 'faux', codeA(MAINTENANT), MAINTENANT)).rejects.toThrow(/mot de passe/);
    await expect(m.s.regenererCodesSecours('u1', 'bon-mot-de-passe', '000000', MAINTENANT)).rejects.toThrow(/Code/);
    expect(m.ecritures).toHaveLength(0);
    expect(m.u.codesSecoursDoubleAuth).toEqual(['vieux']);
    const r = await m.s.regenererCodesSecours('u1', 'bon-mot-de-passe', codeA(MAINTENANT), MAINTENANT);
    expect(m.u.codesSecoursDoubleAuth).toHaveLength(8);
    expect(m.u.codesSecoursDoubleAuth).not.toContain('vieux');
    expect(r.codesSecours).toHaveLength(8);
  });

  it('l’état dit si la console l’exige', async () => {
    const m = await monde({ secretDoubleAuth: SECRET, doubleAuthActiveDepuis: MAINTENANT, codesSecoursDoubleAuth: ['a', 'b'] });
    await expect(m.s.etatDoubleAuth('u1')).resolves.toMatchObject({ active: true, codesSecoursRestants: 2, exigeePourLaConsole: true });
  });
});

describe('activer exige le mot de passe actuel (OWASP ASVS 5.0, 7.5.1)', () => {
  it('un mot de passe faux est refusé AVANT le code · rien n’est activé, aucune session fermée', async () => {
    const m = await monde({ secretDoubleAuth: SECRET });
    await expect(m.s.activerDoubleAuth('u1', 'faux', codeA(MAINTENANT), MAINTENANT)).rejects.toThrow('Le mot de passe actuel est incorrect');
    expect(m.ecritures).toHaveLength(0);
    expect(m.u.doubleAuthActiveDepuis).toBeNull();
    expect(m.u.sessionsInvalidesAvant).toBeUndefined();
  });

  it('comme au retrait, un mot de passe faux ne compte pas au verrou de connexion', async () => {
    const m = await monde({ secretDoubleAuth: SECRET });
    await expect(m.s.activerDoubleAuth('u1', 'faux', codeA(MAINTENANT), MAINTENANT)).rejects.toThrow();
    expect(m.u.tentativesEchouees).toBe(0);
  });
});

describe('l’avis hors bande au titulaire (NIST SP 800-63B-4)', () => {
  const file = () => ({ mettreEnFile: jest.fn(async () => ({ id: 'm1', statut: 'SANS_TRANSPORT', erreur: null })) });

  it('activer met en file un courriel au titulaire, dans son dossier, sans aucun secret', async () => {
    const courrier = file();
    const m = await monde({ secretDoubleAuth: SECRET }, courrier);
    const r = await m.s.activerDoubleAuth('u1', 'bon-mot-de-passe', codeA(MAINTENANT), MAINTENANT);
    expect(courrier.mettreEnFile).toHaveBeenCalledTimes(1);
    const [tenantId, message] = courrier.mettreEnFile.mock.calls[0] as unknown as [string, { destinataire: string; sujet: string; corps: string; origine: string }];
    expect(tenantId).toBe('t1');
    expect(message.destinataire).toBe('admin@vmg.cd');
    expect(message.origine).toBe('DOUBLE_AUTHENTIFICATION');
    expect(message.sujet).toContain('activée');
    expect(message.corps).not.toContain(SECRET);
    for (const c of r.codesSecours) expect(message.corps).not.toContain(c);
  });

  it('retirer et renouveler les codes avertissent aussi', async () => {
    const courrier = file();
    const m = await monde({ secretDoubleAuth: SECRET, doubleAuthActiveDepuis: MAINTENANT }, courrier);
    await m.s.regenererCodesSecours('u1', 'bon-mot-de-passe', codeA(MAINTENANT), MAINTENANT);
    await m.s.desactiverDoubleAuth('u1', 'bon-mot-de-passe', codeA(MAINTENANT, 1), MAINTENANT);
    const sujets = courrier.mettreEnFile.mock.calls.map((c) => (c as unknown as [string, { sujet: string }])[1].sujet);
    expect(sujets).toEqual([expect.stringContaining('codes de secours'), expect.stringContaining('retirée')]);
  });

  it('un refus n’avertit personne · rien n’a changé', async () => {
    const courrier = file();
    const m = await monde({ secretDoubleAuth: SECRET }, courrier);
    await expect(m.s.activerDoubleAuth('u1', 'faux', codeA(MAINTENANT), MAINTENANT)).rejects.toThrow();
    expect(courrier.mettreEnFile).not.toHaveBeenCalled();
  });

  it('un échec de mise en file ne défait JAMAIS l’activation', async () => {
    const courrier = { mettreEnFile: jest.fn(async () => { throw new Error('Adresse inutilisable'); }) };
    const m = await monde({ secretDoubleAuth: SECRET }, courrier);
    const r = await m.s.activerDoubleAuth('u1', 'bon-mot-de-passe', codeA(MAINTENANT), MAINTENANT);
    expect(r.codesSecours).toHaveLength(8);
    expect(m.u.doubleAuthActiveDepuis).toEqual(MAINTENANT);
    expect(courrier.mettreEnFile).toHaveBeenCalledTimes(1);
  });

  it('AuthModule importe la file des courriels · sans elle, l’avis se tairait en silence', () => {
    // Le service la reçoit en @Optional (les specs le construisent sans) ·
    // c'est donc l'import du module qui garantit qu'elle est là en production.
    const source = require('fs').readFileSync(require('path').join(__dirname, 'auth.module.ts'), 'utf8') as string;
    const imports = source.slice(source.indexOf('imports: ['), source.indexOf('controllers:'));
    expect(imports).toMatch(/^\s+CourrierModule,$/m);
  });
});

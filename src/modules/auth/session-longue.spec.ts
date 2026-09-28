import 'reflect-metadata';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { RoleUtilisateur } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy, sessionRevoquee } from './jwt.strategy';
import { COOKIE_SESSION, OPTIONS_COOKIE_SESSION } from './session.constants';
import {
  ChargeJeton,
  CLE_SESSION_REQUETE,
  DUREE_INACTIVITE_SESSION_LONGUE_S,
  DUREE_MAXIMALE_SESSION_LONGUE_S,
  emettreSession,
  MOTIF_CONSOLE_SANS_SESSION_LONGUE,
  prolongationDue,
  SECONDES_PAR_JOUR,
  SessionDeRequete,
  sessionDuJeton,
} from './session-longue';
import { CLE_SORTIE_MOT_DE_PASSE } from '../../common/decorators/sortie-mot-de-passe.decorator';
import { CLE_ACCES_ROLES_CANTONNES } from '../../common/decorators/acces-roles-cantonnes.decorator';
import { base32, codeHotp, depuisBase32, pasDe } from './double-authentification';

/**
 * « RESTER CONNECTÉ SUR CET APPAREIL » · audit final F270, décision de
 * Manasse. Chaque garantie ici casserait en silence · une session trop
 * longue ne lève aucune erreur, elle reste ouverte.
 *
 *  1. Décochée · cookie DE SESSION (fermé avec le navigateur), jeton de huit
 *     heures, et une réémission ne rend pas huit heures neuves.
 *  2. Cochée · trente jours au plus depuis la connexion d'ORIGINE, sept jours
 *     sans usage, prolongée à l'usage au plus une fois par jour, origine et
 *     jeton CSRF recopiés.
 *  3. Jamais pour la console de l'éditeur, refusé au serveur.
 *  4. « Déconnecter mes autres appareils » ferme les autres, garde celui-ci.
 */

// Un secret de test, jamais une valeur réelle · il signe et relit des jetons
// jetables pour vérifier leurs dates.
const jwt = new JwtService({ secret: 'secret-de-test', signOptions: { expiresIn: '8h' } });
// La signature est vérifiée, l'échéance non · les jetons sont datés de 2026-09
// et le test ne doit pas tomber le jour où cette date sera passée.
const lireJeton = (jeton: string) => jwt.verify<ChargeJeton & { iat: number; exp: number }>(jeton, { ignoreExpiration: true });

const T0 = Date.UTC(2026, 8, 1, 10, 0, 0);
const S0 = T0 / 1000;
const JOUR_MS = SECONDES_PAR_JOUR * 1000;

describe('1 · la session courte, par défaut', () => {
  it('le cookie de base n’a ni durée ni échéance · fermé avec le navigateur', () => {
    expect(OPTIONS_COOKIE_SESSION).not.toHaveProperty('maxAge');
    expect(OPTIONS_COOKIE_SESSION).not.toHaveProperty('expires');
    expect(OPTIONS_COOKIE_SESSION).toMatchObject({ httpOnly: true, secure: true, sameSite: 'none' });
  });

  it('huit heures, comme avant F270, et aucune durée de cookie', () => {
    const e = emettreSession(jwt, 'u1', { longue: false }, T0);
    const c = lireJeton(e.accessToken);
    expect(c.exp - c.iat).toBe(8 * 3600);
    expect(c.longue).toBeUndefined();
    expect(c.origine).toBe(S0);
    expect(e).toMatchObject({ sessionLongue: false, maxAgeMs: null });
  });

  it('une réémission garde l’échéance · pas huit heures neuves à la septième heure', () => {
    const debut = lireJeton(emettreSession(jwt, 'u1', { longue: false }, T0).accessToken);
    const session = sessionDuJeton(debut, S0 + 7 * 3600);
    const reemis = lireJeton(
      emettreSession(jwt, 'u1', { longue: false, origine: session.origine, expCourte: session.exp }, T0 + 7 * 3600_000).accessToken,
    );
    expect(reemis.exp).toBe(debut.exp);
    expect(reemis.origine).toBe(S0);
  });
});

describe('2 · la session longue', () => {
  it('neuve · sept jours, cookie de sept jours, marquée longue', () => {
    const e = emettreSession(jwt, 'u1', { longue: true }, T0);
    const c = lireJeton(e.accessToken);
    expect(c.exp - c.iat).toBe(DUREE_INACTIVITE_SESSION_LONGUE_S);
    expect(c).toMatchObject({ longue: true, origine: S0 });
    expect(e.maxAgeMs).toBe(DUREE_INACTIVITE_SESSION_LONGUE_S * 1000);
  });

  it('prolongée au vingt-cinquième jour, elle s’arrête au trentième depuis l’ORIGINE', () => {
    const e = emettreSession(jwt, 'u1', { longue: true, origine: S0 }, T0 + 25 * JOUR_MS);
    const c = lireJeton(e.accessToken);
    expect(c.exp).toBe(S0 + DUREE_MAXIMALE_SESSION_LONGUE_S);
    expect(c.origine).toBe(S0);
    expect(e.maxAgeMs).toBe(5 * JOUR_MS);
  });

  it('la prolongation attend un jour, et cesse quand elle ne recule plus rien', () => {
    const longue = (iatS: number, expS: number) =>
      sessionDuJeton({ sub: 'u1', longue: true, origine: S0, iat: iatS, exp: expS }, iatS);
    // Émise il y a une heure · rien.
    expect(prolongationDue(longue(S0, S0 + 7 * SECONDES_PAR_JOUR), S0 + 3600)).toBe(false);
    // Émise il y a un jour · prolongée.
    expect(prolongationDue(longue(S0, S0 + 7 * SECONDES_PAR_JOUR), S0 + SECONDES_PAR_JOUR)).toBe(true);
    // Déjà à la borne des trente jours · rien à reculer.
    const aLaBorne = longue(S0 + 24 * SECONDES_PAR_JOUR, S0 + DUREE_MAXIMALE_SESSION_LONGUE_S);
    expect(prolongationDue(aLaBorne, S0 + 26 * SECONDES_PAR_JOUR)).toBe(false);
    // Une session courte ne se prolonge jamais.
    const courte = sessionDuJeton({ sub: 'u1', iat: S0, exp: S0 + 8 * 3600 }, S0);
    expect(prolongationDue(courte, S0 + 2 * SECONDES_PAR_JOUR)).toBe(false);
  });
});

describe('2 bis · la prolongation par la stratégie et la garde', () => {
  const UTILISATEUR = {
    id: 'u1',
    tenantId: 't1',
    email: 'a@a.cd',
    role: 'COMPTABLE',
    estActif: true,
    estOperateurPlateforme: false,
    sessionsInvalidesAvant: null,
    doubleAuthActiveDepuis: null,
    tenant: { referentiel: 'SYCEBNL', licence: null },
  };
  const strategie = (u: Record<string, unknown> = UTILISATEUR) =>
    new JwtStrategy({ getOrThrow: () => 'secret-de-test' } as never, { user: { findUnique: async () => u } } as never, jwt);
  const requete = (bearer = false): Record<string, unknown> => ({
    method: 'GET',
    cookies: bearer ? {} : { [COOKIE_SESSION]: 'jeton' },
    headers: bearer ? { authorization: 'Bearer jeton' } : {},
  });
  const maintenantS = () => Math.floor(Date.now() / 1000);

  it('un usage après un jour prolonge · origine et jeton CSRF recopiés', async () => {
    const origine = maintenantS() - 10 * SECONDES_PAR_JOUR;
    const charge = { sub: 'u1', csrf: 'csrf-1', longue: true, origine, iat: maintenantS() - 2 * SECONDES_PAR_JOUR, exp: maintenantS() + 5 * SECONDES_PAR_JOUR };
    const req = requete();
    await strategie().validate(req as never, charge);
    const session = req[CLE_SESSION_REQUETE] as SessionDeRequete;
    expect(session.prolongation).toBeDefined();
    const neuf = lireJeton(session.prolongation!.accessToken);
    // L'origine ne bouge pas · sinon la session vivrait indéfiniment.
    expect(neuf.origine).toBe(origine);
    // Le CSRF ne change pas · sinon la session survivrait et le jeton de l'écran mourrait.
    expect(neuf.csrf).toBe('csrf-1');
    expect(neuf.longue).toBe(true);
    expect(neuf.exp - neuf.iat).toBe(DUREE_INACTIVITE_SESSION_LONGUE_S);
    expect(session.prolongation!.maxAgeMs).toBe(DUREE_INACTIVITE_SESSION_LONGUE_S * 1000);
  });

  it('une révocation posée dans la seconde de la prolongation frappe le jeton prolongé (relecture adverse)', async () => {
    // La requête lit le compte AVANT la révocation, puis prolonge · le jeton
    // neuf est émis dans la même seconde que la révocation. Comparée à son
    // émission, la révocation le laissait vivre, et il se prolongeait ensuite
    // jusqu'aux trente jours sans mot de passe.
    const origine = maintenantS() - 10 * SECONDES_PAR_JOUR;
    const charge = {
      sub: 'u1',
      csrf: 'c',
      longue: true,
      origine,
      authentification: origine,
      iat: maintenantS() - 2 * SECONDES_PAR_JOUR,
      exp: maintenantS() + 5 * SECONDES_PAR_JOUR,
    };
    const req = requete();
    await strategie().validate(req as never, charge);
    const prolonge = lireJeton((req[CLE_SESSION_REQUETE] as SessionDeRequete).prolongation!.accessToken);
    // La prolongation n'est pas un acte · elle recopie l'authentification.
    expect(prolonge.authentification).toBe(origine);
    const revoque = { ...UTILISATEUR, sessionsInvalidesAvant: new Date(prolonge.iat * 1000 + 500) };
    await expect(strategie(revoque).validate(requete() as never, prolonge)).rejects.toThrow('Session close · reconnectez-vous');
    // Le même jeton, sans révocation, passe · c'est bien la révocation qui le refuse.
    await expect(strategie().validate(requete() as never, prolonge)).resolves.toMatchObject({ userId: 'u1' });
  });

  it('pas avant un jour, et jamais pour un jeton porté par l’en-tête Authorization', async () => {
    const charge = { sub: 'u1', csrf: 'c', longue: true, origine: maintenantS(), iat: maintenantS() - 3600, exp: maintenantS() + 6 * SECONDES_PAR_JOUR };
    const recente = requete();
    await strategie().validate(recente as never, charge);
    expect((recente[CLE_SESSION_REQUETE] as SessionDeRequete).prolongation).toBeUndefined();

    const vieille = { ...charge, iat: maintenantS() - 2 * SECONDES_PAR_JOUR };
    const parEntete = requete(true);
    await strategie().validate(parEntete as never, vieille);
    expect((parEntete[CLE_SESSION_REQUETE] as SessionDeRequete).prolongation).toBeUndefined();
  });

  it('la garde pose le cookie prolongé une fois la requête ADMISE, et seulement alors', async () => {
    const garde = new JwtAuthGuard(new Reflector());
    const parent = Object.getPrototypeOf(JwtAuthGuard.prototype) as { canActivate: () => Promise<boolean> };
    jest.spyOn(parent, 'canActivate').mockResolvedValue(true);
    const cookies: unknown[][] = [];
    const contexte = (user: unknown, handler: object) => {
      const req = {
        user,
        method: 'GET',
        [CLE_SESSION_REQUETE]: { longue: true, origine: 1, iat: 1, exp: 2, csrf: 'c', prolongation: { accessToken: 'prolonge', maxAgeMs: 42_000 } },
      };
      const res = { cookie: (...a: unknown[]) => cookies.push(a), req: { secure: true, hostname: 'oomega.web.app' } };
      return {
        switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
        getHandler: () => handler,
        getClass: () => class {},
      } as unknown as ExecutionContext;
    };
    await expect(garde.canActivate(contexte({ role: RoleUtilisateur.COMPTABLE }, () => undefined))).resolves.toBe(true);
    expect(cookies).toHaveLength(1);
    const [nom, valeur, options] = cookies[0] as [string, string, Record<string, unknown>];
    expect([nom, valeur, options.maxAge, options.httpOnly]).toEqual([COOKIE_SESSION, 'prolonge', 42_000, true]);

    // Refusée (rôle cantonné sur une route fermée) · rien n'est prolongé.
    cookies.length = 0;
    await expect(garde.canActivate(contexte({ role: RoleUtilisateur.GESTIONNAIRE_PAIE }, () => undefined))).rejects.toThrow();
    expect(cookies).toHaveLength(0);
    jest.restoreAllMocks();
  });
});

describe('3 · jamais pour la console de l’éditeur', () => {
  const service = (user: Record<string, unknown>) =>
    new AuthService(
      { user: { findUnique: async () => user, update: async () => ({}) } } as never,
      jwt,
      ...([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as [never, never, never, never, never, never, never, never]),
    );
  let hash: string;
  beforeAll(async () => {
    hash = await bcrypt.hash('le-bon', 4);
  });
  const compte = (estOperateurPlateforme: boolean) => ({
    id: 'u1',
    motDePasse: hash,
    estActif: true,
    estOperateurPlateforme,
    tentativesEchouees: 0,
    verrouilleJusqua: null,
    doubleAuthActiveDepuis: null,
  });

  it('case cochée · session longue pour un compte ordinaire', async () => {
    const r = await service(compte(false)).login({ email: 'a@b.cd', motDePasse: 'le-bon', resterConnecte: true });
    if ('deuxiemeFacteurRequis' in r) throw new Error('inattendu');
    expect(lireJeton(r.accessToken).longue).toBe(true);
    expect(r.sessionLongue).toBe(true);
  });

  it('case cochée · un opérateur reçoit une session COURTE, et la réponse le dit', async () => {
    const r = await service(compte(true)).login({ email: 'a@b.cd', motDePasse: 'le-bon', resterConnecte: true });
    if ('deuxiemeFacteurRequis' in r) throw new Error('inattendu');
    expect(lireJeton(r.accessToken).longue).toBeUndefined();
    expect(r).toMatchObject({ sessionLongue: false, maxAgeMs: null, motifSessionCourte: MOTIF_CONSOLE_SANS_SESSION_LONGUE });
  });

  it('case absente · session courte, pour tout le monde', async () => {
    const r = await service(compte(false)).login({ email: 'a@b.cd', motDePasse: 'le-bon' });
    if ('deuxiemeFacteurRequis' in r) throw new Error('inattendu');
    expect(r).toMatchObject({ sessionLongue: false, maxAgeMs: null });
  });

  it('un jeton long porté par un compte devenu opérateur est refusé à la requête suivante', async () => {
    const operateur = { ...compte(true), tenantId: 't1', email: 'a@b.cd', role: 'ADMIN_CABINET', sessionsInvalidesAvant: null, tenant: { referentiel: 'SYCEBNL', licence: null } };
    const s = new JwtStrategy({ getOrThrow: () => 'x' } as never, { user: { findUnique: async () => operateur } } as never, jwt);
    const req = { method: 'GET', cookies: { [COOKIE_SESSION]: 'j' }, headers: {} };
    await expect(s.validate(req as never, { sub: 'u1', longue: true, origine: 1, iat: Math.floor(Date.now() / 1000) })).rejects.toThrow(
      new UnauthorizedException(MOTIF_CONSOLE_SANS_SESSION_LONGUE),
    );
    // Une session courte de l'opérateur, elle, passe.
    await expect(s.validate(req as never, { sub: 'u1', iat: Math.floor(Date.now() / 1000) })).resolves.toMatchObject({ userId: 'u1' });
  });

  it('la réémission d’un opérateur ne rend jamais une session longue', async () => {
    const r = await service(compte(true)).changerMotDePasse('u1', 'le-bon', 'nouveau-tres-long', {
      longue: true,
      origine: S0,
      iat: S0,
      exp: S0 + 3600,
      csrf: 'c',
    });
    expect(lireJeton(r.accessToken).longue).toBeUndefined();
  });
});

describe('la case voyage avec le code du second facteur · aucun état n’est gardé', () => {
  it('sans la case au second appel, la session est courte · avec, elle est longue', async () => {
    const secret = base32(Buffer.from('12345678901234567890'));
    const hash = await bcrypt.hash('le-bon', 4);
    const service = () =>
      new AuthService(
        {
          user: {
            findUnique: async () => ({
              id: 'u1',
              motDePasse: hash,
              estActif: true,
              estOperateurPlateforme: false,
              tentativesEchouees: 0,
              verrouilleJusqua: null,
              secretDoubleAuth: secret,
              doubleAuthActiveDepuis: new Date('2026-01-01T00:00:00Z'),
              dernierPasDoubleAuth: null,
              codesSecoursDoubleAuth: [],
            }),
            update: async () => ({}),
          },
        } as never,
        jwt,
        ...([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as [never, never, never, never, never, never, never, never]),
      );
    const code = codeHotp(depuisBase32(secret), pasDe(Date.now()));
    await expect(service().login({ email: 'a@b.cd', motDePasse: 'le-bon', resterConnecte: true })).resolves.toEqual({
      deuxiemeFacteurRequis: true,
    });
    const sansCase = await service().login({ email: 'a@b.cd', motDePasse: 'le-bon', code });
    const avecCase = await service().login({ email: 'a@b.cd', motDePasse: 'le-bon', code, resterConnecte: true });
    if ('deuxiemeFacteurRequis' in sansCase || 'deuxiemeFacteurRequis' in avecCase) throw new Error('inattendu');
    expect([sansCase.sessionLongue, avecCase.sessionLongue]).toEqual([false, true]);
  });
});

describe('4 · déconnecter mes autres appareils', () => {
  const service = (capture: { data?: Record<string, unknown> }, hash: string) =>
    new AuthService(
      {
        user: {
          findUnique: async () => ({ id: 'u1', motDePasse: hash, estOperateurPlateforme: false }),
          update: async ({ data }: { data: Record<string, unknown> }) => {
            capture.data = data;
            return {};
          },
        },
      } as never,
      jwt,
      ...([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as [never, never, never, never, never, never, never, never]),
    );
  const MAINTENANT = new Date(T0 + 12 * JOUR_MS + 400);
  const SESSION = { longue: true, origine: S0, iat: S0 + 11 * SECONDES_PAR_JOUR, exp: S0 + 18 * SECONDES_PAR_JOUR, csrf: 'ancien' };

  it('exige le mot de passe actuel, sans rien écrire sinon', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const hash = await bcrypt.hash('le-bon', 4);
    await expect(service(capture, hash).deconnecterAutresAppareils('u1', 'faux', SESSION, MAINTENANT)).rejects.toThrow(
      /mot de passe actuel est incorrect/,
    );
    expect(capture.data).toBeUndefined();
  });

  it('ferme les autres sessions à cet instant et garde celle-ci, son régime et son origine', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const hash = await bcrypt.hash('le-bon', 4);
    const r = await service(capture, hash).deconnecterAutresAppareils('u1', 'le-bon', SESSION, MAINTENANT);
    expect(capture.data).toEqual({ sessionsInvalidesAvant: MAINTENANT });
    const neuf = lireJeton(r.accessToken);
    expect(neuf).toMatchObject({ longue: true, origine: S0 });
    // Le jeton neuf n'est pas tenu pour antérieur à sa propre révocation, à
    // la seconde près · un jeton de la seconde précédente, si.
    expect(sessionRevoquee(neuf.iat, MAINTENANT)).toBe(false);
    expect(sessionRevoquee(neuf.iat - 1, MAINTENANT)).toBe(true);
    // Et c'est son AUTHENTIFICATION que la stratégie lit · la réémission est
    // un acte, elle en pose une neuve, qui passe sa propre révocation.
    expect(neuf.authentification).toBe(neuf.iat);
    const strategie = new JwtStrategy(
      { getOrThrow: () => 'secret-de-test' } as never,
      {
        user: {
          findUnique: async () => ({
            id: 'u1',
            tenantId: 't1',
            email: 'a@a.cd',
            role: 'COMPTABLE',
            estActif: true,
            estOperateurPlateforme: false,
            sessionsInvalidesAvant: MAINTENANT,
            doubleAuthActiveDepuis: null,
            tenant: { referentiel: 'SYCEBNL', licence: null },
          }),
        },
      } as never,
      jwt,
    );
    const req = { method: 'GET', cookies: {}, headers: { authorization: 'Bearer j' } };
    await expect(strategie.validate(req as never, neuf)).resolves.toMatchObject({ userId: 'u1' });
    await expect(strategie.validate(req as never, { ...neuf, authentification: neuf.iat - 1 })).rejects.toThrow('Session close');
    // Le cookie de cet appareil reste un cookie long, borné aux trente jours.
    expect(r.maxAgeMs).toBe(DUREE_INACTIVITE_SESSION_LONGUE_S * 1000);
    expect(r.csrfToken).not.toBe('ancien');
  });

  it('une session courte le reste, avec son échéance', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const hash = await bcrypt.hash('le-bon', 4);
    const courte = { longue: false, origine: S0, iat: S0, exp: S0 + 8 * 3600, csrf: 'c' };
    const r = await service(capture, hash).deconnecterAutresAppareils('u1', 'le-bon', courte, new Date(T0 + 3600_000));
    expect(r.maxAgeMs).toBeNull();
    expect(lireJeton(r.accessToken).exp).toBe(S0 + 8 * 3600);
  });

  it('le changement de mot de passe garde lui aussi le régime · « Rester connecté » ne se perd pas', async () => {
    const hash = await bcrypt.hash('le-bon', 4);
    const r = await service({}, hash).changerMotDePasse('u1', 'le-bon', 'nouveau-tres-long', SESSION);
    expect(lireJeton(r.accessToken)).toMatchObject({ longue: true, origine: S0 });
  });
});

describe('le contrôleur · un seul chemin pour le cookie, et la route nouvelle', () => {
  const reponse = () => {
    const cookies: unknown[][] = [];
    return { cookies, res: { cookie: (...a: unknown[]) => cookies.push(a), req: { secure: true, hostname: 'oomega.web.app' } } as never };
  };

  it('session longue · cookie à durée ; courte · cookie de session ; le corps ne porte ni jeton ni durée', async () => {
    for (const [maxAgeMs, attendu] of [
      [604_800_000, 604_800_000],
      [null, undefined],
    ] as const) {
      const { cookies, res } = reponse();
      const c = new AuthController(
        { login: async () => ({ accessToken: 'jwt', csrfToken: 'csrf', sessionLongue: maxAgeMs !== null, maxAgeMs }) } as never,
        { get: () => undefined } as never,
      );
      const corps = await c.login({ email: 'a@a.cd', motDePasse: 'x' } as never, res);
      expect(corps).toEqual({ csrfToken: 'csrf', sessionLongue: maxAgeMs !== null });
      const [nom, valeur, options] = cookies[0] as [string, string, Record<string, unknown>];
      expect([nom, valeur, options.maxAge, options.expires]).toEqual([COOKIE_SESSION, 'jwt', attendu, undefined]);
    }
  });

  it('/auth/me rend le jeton CSRF de la session en cours · il suit la session', async () => {
    const c = new AuthController({ me: async () => ({ id: 'u1' }) } as never, { get: () => undefined } as never);
    const req = { [CLE_SESSION_REQUETE]: { longue: true, origine: 1, iat: 1, exp: 2, csrf: 'csrf-du-jeton' } };
    await expect(c.me({ userId: 'u1' } as never, req as never)).resolves.toEqual({
      id: 'u1',
      csrfToken: 'csrf-du-jeton',
      sessionLongue: true,
    });
  });

  it('la route passe la session de la requête au service et pose le cookie rendu', async () => {
    const appels: unknown[][] = [];
    const { cookies, res } = reponse();
    const session = { longue: true, origine: 5, iat: 5, exp: 9, csrf: 'c' };
    (res as unknown as Record<string, Record<string, unknown>>).req[CLE_SESSION_REQUETE] = session;
    const c = new AuthController(
      {
        deconnecterAutresAppareils: async (...a: unknown[]) => {
          appels.push(a);
          return { autresAppareilsDeconnectes: true, accessToken: 'neuf', csrfToken: 'csrf-neuf', sessionLongue: true, maxAgeMs: 1000 };
        },
      } as never,
      { get: () => undefined } as never,
    );
    const corps = await c.deconnecterAutresAppareils({ userId: 'u1' } as never, { motDePasseActuel: 'le-bon' }, res);
    expect(appels).toEqual([['u1', 'le-bon', session]]);
    expect(corps).toEqual({ autresAppareilsDeconnectes: true, csrfToken: 'csrf-neuf', sessionLongue: true });
    expect((cookies[0] as unknown[]).slice(0, 2)).toEqual([COOKIE_SESSION, 'neuf']);
  });

  it('chaque route qui éprouve un secret porte la garde et le débit de la connexion (audit de cohérence du lot F270)', () => {
    // Une session longue volée tient trente jours, et ces routes n'arment pas
    // le verrou par compte · leur seule borne est `@Throttle`, vingt essais par
    // minute comme `/auth/login`. Sans elle, le mot de passe se devinerait à
    // la vitesse du réseau derrière une session ouverte. Lue sur la
    // métadonnée que Nest lit, route par route, pour que le retrait du
    // décorateur fasse tomber le test.
    const proto = AuthController.prototype as unknown as Record<string, object>;
    const eprouventUnSecret = [
      'changerMotDePasse',
      'changerAdresse',
      'activerDoubleAuth',
      'desactiverDoubleAuth',
      'regenererCodesSecours',
      'deconnecterAutresAppareils',
    ];
    for (const m of [...eprouventUnSecret, 'login']) {
      expect([m, Reflect.getMetadata('THROTTLER:LIMITdefault', proto[m]), Reflect.getMetadata('THROTTLER:TTLdefault', proto[m])]).toEqual([
        m,
        20,
        60_000,
      ]);
    }
    // Et chaque route du contrôleur, hors les trois portes d'entrée, passe par
    // JwtAuthGuard · c'est elle qui lit la révocation et le mot de passe
    // provisoire.
    const sansGarde = Object.getOwnPropertyNames(proto)
      .filter((m) => m !== 'constructor' && Reflect.getMetadata(PATH_METADATA, proto[m]) !== undefined)
      .filter((m) => !((Reflect.getMetadata(GUARDS_METADATA, proto[m]) ?? []) as unknown[]).includes(JwtAuthGuard))
      .sort();
    expect(sansGarde).toEqual(['login', 'logout', 'register']);
  });

  it('la route est ouverte à tous les rôles, et n’est PAS une sortie de mot de passe provisoire', () => {
    const route = AuthController.prototype.deconnecterAutresAppareils;
    expect(Reflect.getMetadata(CLE_ACCES_ROLES_CANTONNES, route)).toEqual({ gestionnairePaie: true });
    // Présence de la marque là où elle doit être, pour que l'absence veuille dire quelque chose.
    expect(Reflect.getMetadata(CLE_SORTIE_MOT_DE_PASSE, AuthController.prototype.deconnecterPartout)).toBe(true);
    expect(Reflect.getMetadata(CLE_SORTIE_MOT_DE_PASSE, route)).toBeUndefined();
  });
});

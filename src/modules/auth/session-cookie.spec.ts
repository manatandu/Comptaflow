import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { JwtStrategy, extraireJetonDuCookie } from './jwt.strategy';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { COOKIE_SESSION } from './session.constants';

/**
 * SESSION EN COOKIE httpOnly + CSRF · les garanties qui font tenir le
 * montage :
 *  · toute MUTATION portée par le cookie doit présenter l'en-tête
 *    X-CSRF-Token égal au claim `csrf` du JWT · sans lui, un site tiers
 *    pourrait soumettre un formulaire vers l'API avec le cookie de la
 *    victime ;
 *  · les lectures (GET) et les requêtes authentifiées par l'en-tête
 *    Authorization (improuvable en soumission inter-site) sont exemptées ;
 *  · un jeton d'avant la migration (sans claim csrf) ne peut pas prouver
 *    son origine sur une mutation · refusé ;
 *  · le corps des réponses login/register ne porte JAMAIS le jeton de
 *    session · seul le cookie httpOnly le transporte.
 */

const UTILISATEUR = {
  id: 'u1',
  tenantId: 't1',
  email: 'a@a.cd',
  role: 'ADMIN_CABINET',
  estActif: true,
  estOperateurPlateforme: false,
  tenant: { referentiel: 'SYCEBNL', licence: null },
};

const strategie = () =>
  new JwtStrategy(
    { getOrThrow: () => 'secret-de-test' } as never,
    { user: { findUnique: async () => UTILISATEUR } } as never,
  );

const requete = (options: { method: string; cookie?: boolean; csrf?: string; bearer?: boolean }) =>
  ({
    method: options.method,
    cookies: options.cookie ? { [COOKIE_SESSION]: 'jeton' } : {},
    headers: {
      ...(options.bearer ? { authorization: 'Bearer jeton' } : {}),
      ...(options.csrf !== undefined ? { 'x-csrf-token': options.csrf } : {}),
    },
  }) as never;

describe('JwtStrategy · contrôle CSRF sur le cookie de session', () => {
  const charge = { sub: 'u1', csrf: 'abc123' };

  it('une lecture portée par le cookie passe sans en-tête CSRF', async () => {
    const u = await strategie().validate(requete({ method: 'GET', cookie: true }), charge);
    expect(u.userId).toBe('u1');
  });

  it('une mutation portée par le cookie exige l’en-tête apparié · absent ou faux, refus', async () => {
    await expect(strategie().validate(requete({ method: 'POST', cookie: true }), charge)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      strategie().validate(requete({ method: 'DELETE', cookie: true, csrf: 'autre' }), charge),
    ).rejects.toThrow(ForbiddenException);
    const u = await strategie().validate(requete({ method: 'POST', cookie: true, csrf: 'abc123' }), charge);
    expect(u.userId).toBe('u1');
  });

  it('une mutation authentifiée par Authorization est exemptée · un en-tête personnalisé ne se forge pas inter-site', async () => {
    const u = await strategie().validate(requete({ method: 'POST', bearer: true }), charge);
    expect(u.userId).toBe('u1');
  });

  it('un jeton d’avant la migration (sans claim csrf) est refusé sur une mutation cookie', async () => {
    await expect(
      strategie().validate(requete({ method: 'POST', cookie: true, csrf: 'abc123' }), { sub: 'u1' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('extraireJetonDuCookie lit le cookie de session, et rien d’autre', () => {
    expect(extraireJetonDuCookie({ cookies: { [COOKIE_SESSION]: 'x' } } as never)).toBe('x');
    expect(extraireJetonDuCookie({ cookies: {} } as never)).toBeNull();
    expect(extraireJetonDuCookie({} as never)).toBeNull();
  });
});

describe('AuthService · jeton CSRF apparié au jeton de session', () => {
  it('login émet un JWT dont le claim csrf égale le csrfToken renvoyé', async () => {
    let payload: Record<string, unknown> | undefined;
    const hash = await bcrypt.hash('mot-de-passe-correct', 4);
    const s = new AuthService(
      { user: { findUnique: async () => ({ id: 'u1', motDePasse: hash, estActif: true }) } } as never,
      { sign: (p: Record<string, unknown>) => ((payload = p), 'jwt-signe') } as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
    const resultat = await s.login({ email: 'a@a.cd', motDePasse: 'mot-de-passe-correct' });
    expect(resultat.csrfToken).toBe(payload!.csrf);
    expect(resultat.csrfToken).toMatch(/^[0-9a-f]{32}$/);
    expect(resultat.accessToken).toBe('jwt-signe');
  });
});

describe('AuthController · le jeton de session ne sort que par le cookie', () => {
  const reponse = () => {
    const appels: Array<{ nom: string; args: unknown[] }> = [];
    return {
      appels,
      res: {
        cookie: (...args: unknown[]) => appels.push({ nom: 'cookie', args }),
        clearCookie: (...args: unknown[]) => appels.push({ nom: 'clearCookie', args }),
      } as never,
    };
  };

  it('login pose le cookie httpOnly et le corps ne porte que le jeton CSRF', async () => {
    const { appels, res } = reponse();
    const controleur = new AuthController({
      login: async () => ({ accessToken: 'jwt-secret', csrfToken: 'csrf-1' }),
    } as never);
    const corps = await controleur.login({ email: 'a@a.cd', motDePasse: 'x' } as never, res);
    expect(corps).toEqual({ csrfToken: 'csrf-1' });
    expect(corps).not.toHaveProperty('accessToken');
    const [nomCookie, valeur, options] = appels[0].args as [string, string, Record<string, unknown>];
    expect(nomCookie).toBe(COOKIE_SESSION);
    expect(valeur).toBe('jwt-secret');
    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe('none');
  });

  it('logout efface le cookie de session', async () => {
    const { appels, res } = reponse();
    const controleur = new AuthController({} as never);
    await controleur.logout(res);
    expect(appels[0].nom).toBe('clearCookie');
    expect((appels[0].args as [string])[0]).toBe(COOKIE_SESSION);
  });
});

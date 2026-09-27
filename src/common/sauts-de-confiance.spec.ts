import * as express from 'express';
import { lastValueFrom, of } from 'rxjs';
import { AuditContexteInterceptor } from './audit/audit-contexte.interceptor';
import { acteurCourant } from './audit/contexte-audit';
import { SAUTS_EN_LIGNE, sautsDeConfiance } from './sauts-de-confiance';

/**
 * AUDIT FINAL F160 · l'adresse notée au journal n'est plus celle que le client
 * écrit, et elle n'est plus celle du relais Firebase.
 */

/**
 * `requete.ip` tel qu'Express le calcule VRAIMENT · la vraie application, le
 * vrai réglage, la vraie fonction de confiance. Une valeur posée à la main
 * validerait une arithmétique que personne n'a faite.
 */
function ipVue(sauts: number, xff: string | undefined, pair = '10.0.0.9'): string | undefined {
  const app = express();
  app.set('trust proxy', sauts || false);
  const requete = Object.create((express as unknown as { request: object }).request);
  requete.app = app;
  requete.headers = xff === undefined ? {} : { 'x-forwarded-for': xff };
  requete.connection = requete.socket = { remoteAddress: pair };
  return requete.ip;
}

describe('F160 · le nombre de relais de confiance', () => {
  it('en ligne, deux relais · Firebase ajoute le client, Cloud Run ajoute Firebase', () => {
    expect(sautsDeConfiance({})).toBe(SAUTS_EN_LIGNE);
    expect(SAUTS_EN_LIGNE).toBe(2);
    // « forgée » est écrite par le client, 41.0.0.7 par Firebase, 151.101.1.1
    // (le relais) par Cloud Run.
    expect(ipVue(sautsDeConfiance({}), '6.6.6.6, 41.0.0.7, 151.101.1.1')).toBe('41.0.0.7');
    // Un seul relais de confiance rendait l'adresse du relais Firebase.
    expect(ipVue(1, '6.6.6.6, 41.0.0.7, 151.101.1.1')).toBe('151.101.1.1');
  });

  it('sur site, aucun relais · l’en-tête écrit par le poste appelant ne compte pas', () => {
    expect(sautsDeConfiance({ MODE_INSTALLATION: 'SUR_SITE' })).toBe(0);
    expect(ipVue(sautsDeConfiance({ MODE_INSTALLATION: 'SUR_SITE' }), '6.6.6.6', '192.168.1.20')).toBe('192.168.1.20');
  });

  it('la variable prime, zéro compris, et une valeur illisible arrête le démarrage', () => {
    expect(sautsDeConfiance({ SAUTS_PROXY_CONFIANCE: '1' })).toBe(1);
    expect(sautsDeConfiance({ SAUTS_PROXY_CONFIANCE: '0' })).toBe(0);
    expect(sautsDeConfiance({ SAUTS_PROXY_CONFIANCE: '3', MODE_INSTALLATION: 'SUR_SITE' })).toBe(3);
    expect(() => sautsDeConfiance({ SAUTS_PROXY_CONFIANCE: 'deux' })).toThrow(/SAUTS_PROXY_CONFIANCE/);
    expect(() => sautsDeConfiance({ SAUTS_PROXY_CONFIANCE: '-1' })).toThrow(/SAUTS_PROXY_CONFIANCE/);
  });
});

describe('F160 · le journal d’audit note requete.ip, jamais la tête de X-Forwarded-For', () => {
  it('une adresse écrite par le client dans l’en-tête n’atteint pas le journal', async () => {
    let noteee: string | undefined = 'jamais lu';
    const requete = {
      user: { userId: 'u1', email: 'a@b.cd', tenantId: 't1', role: 'COMPTABLE' },
      headers: { 'x-forwarded-for': '6.6.6.6, 41.0.0.7, 151.101.1.1' },
      ip: '41.0.0.7',
    };
    const contexte = { switchToHttp: () => ({ getRequest: () => requete }) } as never;
    const suite = {
      handle: () => {
        noteee = acteurCourant()?.adresseIp;
        return of(null);
      },
    };
    await lastValueFrom(new AuditContexteInterceptor().intercept(contexte, suite));
    expect(noteee).toBe('41.0.0.7');
  });
});

describe('F160 · le démarrage pose le réglage de la règle, et lui seul', () => {
  function reglagePose(env: Record<string, string | undefined>): unknown {
    const avant = { ...process.env };
    Object.assign(process.env, env);
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
    const poses: Record<string, unknown> = {};
    const app = {
      use: () => undefined,
      getHttpAdapter: () => ({ getInstance: () => ({ set: (cle: string, valeur: unknown) => (poses[cle] = valeur) }) }),
      enableCors: () => undefined,
      useGlobalPipes: () => undefined,
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../bootstrap').configurerApplication(app);
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in avant)) delete process.env[k];
      Object.assign(process.env, avant);
    }
    return poses['trust proxy'];
  }

  it('deux en ligne, false sur site · jamais 0, qu’Express lirait comme une valeur', () => {
    expect(reglagePose({ MODE_INSTALLATION: undefined, SAUTS_PROXY_CONFIANCE: undefined })).toBe(2);
    expect(reglagePose({ MODE_INSTALLATION: 'SUR_SITE', SAUTS_PROXY_CONFIANCE: undefined })).toBe(false);
  });
});

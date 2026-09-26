import { Referentiel, TypeLicence } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { OPTIONS_COOKIE_SESSION, optionsCookieSession } from '../auth/session.constants';
import { entetesInterface, POLITIQUE_INTERFACE } from './interface-sur-site';
import { copiesARetirer, nomSauvegarde, parametresConnexion, SauvegardeSurSiteService } from './sauvegarde-sur-site.service';

describe('sur site · le cookie de session change de régime', () => {
  it('en ligne, Secure et SameSite=None, inchangés', () => {
    expect(optionsCookieSession(false)).toBe(OPTIONS_COOKIE_SESSION);
    expect(OPTIONS_COOKIE_SESSION).toMatchObject({ secure: true, sameSite: 'none', httpOnly: true });
  });
  it('sur site, sans Secure (http du réseau local) et en lax · toujours httpOnly', () => {
    expect(optionsCookieSession(true)).toMatchObject({ secure: false, sameSite: 'lax', httpOnly: true });
  });
});

describe('sur site · l’interface servie par le poste', () => {
  it('sa politique n’ouvre que la même origine · aucune API extérieure', () => {
    expect(POLITIQUE_INTERFACE).toContain("connect-src 'self';");
    expect(POLITIQUE_INTERFACE).not.toMatch(/https?:\/\//);
    expect(POLITIQUE_INTERFACE).toContain("script-src 'self';");
  });
  it('les fichiers à empreinte se gardent, la page d’entrée se relit à chaque mise à jour', () => {
    const entetes: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => void (entetes[k] = v) } as never;
    entetesInterface(res, '/app/client/assets/index-abc123.js');
    expect(entetes['Cache-Control']).toContain('immutable');
    entetesInterface(res, '/app/client/index.html');
    expect(entetes['Cache-Control']).toBe('no-cache');
    expect(entetes['Content-Security-Policy']).toBe(POLITIQUE_INTERFACE);
  });
});

describe('sur site · les sauvegardes', () => {
  it('la chaîne de connexion devient des variables PG*, mot de passe décodé, jamais un argument', () => {
    expect(parametresConnexion('postgresql://omegax:p%40ss%20w@127.0.0.1:5433/omegax?schema=public')).toEqual({
      PGHOST: '127.0.0.1',
      PGPORT: '5433',
      PGUSER: 'omegax',
      PGPASSWORD: 'p@ss w',
      PGDATABASE: 'omegax',
    });
    expect(parametresConnexion('mysql://x@y/z')).toBeNull();
    expect(parametresConnexion(undefined)).toBeNull();
    expect(parametresConnexion('postgresql://x@y:5432/')).toBeNull();
  });

  it('on garde les N plus récentes, on ne touche qu’aux copies d’OmegaX, et jamais la dernière', () => {
    const noms = ['omegax-20260101-100000.dump', 'omegax-20260103-100000.dump', 'omegax-20260102-100000.dump', 'rapport.pdf', 'omegax-autre.dump'];
    expect(copiesARetirer(noms, 2)).toEqual(['omegax-20260101-100000.dump']);
    expect(copiesARetirer(noms, 0)).toEqual(['omegax-20260102-100000.dump', 'omegax-20260101-100000.dump']);
  });

  it('le nom se trie comme la date', () => {
    expect(nomSauvegarde(new Date(2026, 8, 6, 7, 5, 3))).toBe('omegax-20260906-070503.dump');
  });

  it('en ligne, une sauvegarde sur site est refusée · la plateforme a les siennes', async () => {
    await expect(new SauvegardeSurSiteService({} as NodeJS.ProcessEnv).lancer()).rejects.toThrow(/plateforme/);
  });
});

describe('sur site · la création d’un dossier passe par la licence de l’installation', () => {
  function auth(plafond: (n: number) => void, dossiersOuverts: number) {
    const creerTenant = jest.fn(async () => ({ id: 't1', nom: 'X', referentiel: Referentiel.SYCEBNL }));
    const tx = { user: { create: async () => ({ id: 'u1' }) } };
    const rien = async () => undefined;
    const s = new AuthService(
      { user: { findUnique: async () => null }, tenant: { count: async () => dossiersOuverts }, $transaction: async (fn: (t: unknown) => unknown) => fn(tx) } as never,
      { sign: () => 'jeton' } as never,
      { creerTenant } as never,
      { seedPlan: rien } as never,
      { creerExerciceCourant: async () => ({ id: 'ex1' }) } as never,
      { seedJournauxDefaut: rien } as never,
      { seedTauxDefaut: rien } as never,
      { seedFamillesDefaut: rien } as never,
      { seedPlansDefaut: rien } as never,
      { seedNiveauxDefaut: rien } as never,
      { surSite: true, verifierPlafondDossiers: plafond } as never,
    );
    return { s, creerTenant };
  }
  const DTO = { nomEntite: 'X', email: 'a@b.cd', motDePasse: 'motdepasse12', referentiel: Referentiel.SYCEBNL, typeLicence: TypeLicence.ABONNEMENT };

  it('au-delà du plafond, rien n’est créé', async () => {
    const { s, creerTenant } = auth((n) => {
      if (n >= 2) throw new Error('plafond atteint');
    }, 2);
    await expect(s.register(DTO as never)).rejects.toThrow('plafond atteint');
    expect(creerTenant).not.toHaveBeenCalled();
  });

  it('le dossier naît sous la licence de l’installation, quoi que demande l’appelant', async () => {
    const vus: number[] = [];
    const { s, creerTenant } = auth((n) => void vus.push(n), 1);
    await s.register(DTO as never);
    expect(vus).toEqual([1]);
    expect((creerTenant.mock.calls[0] as unknown[])[0]).toMatchObject({ typeLicence: TypeLicence.PERPETUEL_ONPREMISE });
  });
});

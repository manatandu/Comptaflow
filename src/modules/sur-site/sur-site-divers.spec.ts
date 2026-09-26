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

describe('sur site · la copie des sauvegardes hors du poste', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { tmpdir } = require('os') as typeof import('os');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { join } = require('path') as typeof import('path');

  const monter = () => {
    const racine = fs.mkdtempSync(join(tmpdir(), 'omegax-ext-'));
    const donnees = join(racine, 'donnees');
    const externe = join(racine, 'usb');
    fs.mkdirSync(join(donnees, 'sauvegardes'), { recursive: true });
    fs.mkdirSync(externe);
    const s = new SauvegardeSurSiteService({ MODE_INSTALLATION: 'SUR_SITE', DOSSIER_DONNEES: donnees, SAUVEGARDES_A_GARDER: '2' } as NodeJS.ProcessEnv);
    const poser = (nom: string) => fs.writeFileSync(join(donnees, 'sauvegardes', nom), nom);
    return { s, externe, donnees, poser, racine };
  };

  it('désigner le dossier y recopie aussitôt la dernière sauvegarde, et chaque suivante', () => {
    const m = monter();
    m.poser('omegax-20260101-010101.dump');
    const e = m.s.definirCopieExterne(m.externe);
    expect(e).toMatchObject({ dossier: m.externe, derniere: 'omegax-20260101-010101.dump', erreur: null });
    expect(fs.existsSync(join(m.externe, 'omegax-20260101-010101.dump'))).toBe(true);
    for (const n of ['omegax-20260102-010101.dump', 'omegax-20260103-010101.dump']) {
      m.poser(n);
      m.s.recopier(n);
    }
    // Le même nombre de copies qu'en local · jamais une accumulation sans fin.
    expect(fs.readdirSync(m.externe).sort()).toEqual(['omegax-20260102-010101.dump', 'omegax-20260103-010101.dump']);
    fs.rmSync(m.racine, { recursive: true, force: true });
  });

  it('un dossier introuvable, relatif ou égal au dossier local est refusé', () => {
    const m = monter();
    expect(() => m.s.definirCopieExterne(join(m.racine, 'absent'))).toThrow(/introuvable/);
    expect(() => m.s.definirCopieExterne('usb')).toThrow(/chemin complet/);
    expect(() => m.s.definirCopieExterne(join(m.donnees, 'sauvegardes'))).toThrow(/ailleurs/);
    fs.rmSync(m.racine, { recursive: true, force: true });
  });

  it('une recopie qui échoue est notée, jamais tue, et la sauvegarde locale reste', () => {
    const m = monter();
    m.poser('omegax-20260101-010101.dump');
    m.s.definirCopieExterne(m.externe);
    fs.rmSync(m.externe, { recursive: true, force: true });
    m.poser('omegax-20260102-010101.dump');
    expect(() => m.s.recopier('omegax-20260102-010101.dump')).not.toThrow();
    const e = m.s.copieExterne();
    expect(e.erreur).toMatch(/ENOENT|no such file/);
    expect(e.derniere).toBe('omegax-20260101-010101.dump');
    fs.rmSync(m.racine, { recursive: true, force: true });
  });
});

describe('sur site · la sauvegarde appelle la recopie', () => {
  it('chaque sauvegarde écrite est recopiée hors du poste', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require('fs').readFileSync(require('path').join(__dirname, 'sauvegarde-sur-site.service.ts'), 'utf8') as string;
    const corps = src.slice(src.indexOf('private async executer('), src.indexOf('copieExterne(): EtatCopieExterne'));
    expect(corps).toContain('this.recopier(nom);');
  });
});

import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AuthService } from '../auth/auth.service';
import { AuthController } from '../auth/auth.controller';
import { garderCloisonnement } from '../../common/cloisonnement/extension-cloisonnement';
import { dansContexteAudit } from '../../common/audit/contexte-audit';
import { AdministrateurInstallationGuard } from './administrateur-installation.guard';
import { SurSiteController } from './sur-site.controller';

/**
 * AUDIT FINAL F44 · sur site, n'importe quel poste du réseau obtenait la copie
 * de la base de tous les dossiers · l'inscription publique rendait un
 * administrateur de dossier, et les routes de sauvegarde ne demandaient que
 * ce rôle. Désormais · sauvegardes et dossiers suivants à l'administrateur du
 * DOSSIER D'INSTALLATION (le premier du poste), inscription publique fermée
 * dès qu'un dossier existe, copie externe chiffrée (sur-site-divers.spec.ts).
 */

const surSiteAsync = async <T>(f: () => Promise<T>): Promise<T> => {
  const avant = process.env.MODE_INSTALLATION;
  process.env.MODE_INSTALLATION = 'SUR_SITE';
  try {
    return await f();
  } finally {
    if (avant === undefined) delete process.env.MODE_INSTALLATION;
    else process.env.MODE_INSTALLATION = avant;
  }
};

// Deux dossiers sur le poste · « premier » a été créé avant « second ».
const DOSSIERS = [
  { id: 'second', createdAt: new Date('2026-03-01T10:00:00Z') },
  { id: 'premier', createdAt: new Date('2026-01-15T09:00:00Z') },
];

/** Un AuthService dont la seule dépendance lue est Prisma, passé par la vraie garde de cloisonnement. */
function service(dossiers = DOSSIERS) {
  const brut = {
    tenant: {
      // La doublure honore le tri demandé · le plus ancien d'abord.
      findFirst: async ({ orderBy }: { orderBy: { createdAt?: 'asc' | 'desc' }[] }) => {
        const sens = orderBy[0]?.createdAt === 'asc' ? 1 : -1;
        const t = [...dossiers].sort((a, b) => sens * (a.createdAt.getTime() - b.createdAt.getTime()))[0];
        return t ? { id: t.id } : null;
      },
      count: async () => dossiers.length,
    },
  };
  const garde = (op: keyof typeof brut.tenant) => (args: unknown) =>
    garderCloisonnement(brut as never, {
      model: 'Tenant',
      operation: op,
      args,
      query: () => (brut.tenant[op] as (a: unknown) => Promise<unknown>)(args),
    });
  const prisma = { tenant: { findFirst: garde('findFirst'), count: garde('count') } };
  const deps = Array.from({ length: 9 }, () => ({}));
  return new (AuthService as unknown as new (...a: unknown[]) => AuthService)(prisma, ...deps);
}

const dansLeDossier = <T>(tenantId: string, f: () => Promise<T>) =>
  dansContexteAudit({ acteurId: 'u', acteurEmail: 'u@poste.cd', tenantId } as never, f);

describe('F44 · le dossier d’installation, lu à travers la vraie garde', () => {
  it('est le premier dossier créé sur le poste, quel que soit le dossier de la session', async () => {
    await expect(dansLeDossier('second', () => service().dossierDInstallation())).resolves.toBe('premier');
  });

  it('l’inscription publique n’attend que le premier dossier', async () => {
    await expect(dansLeDossier('second', () => service().premierDossierAttendu())).resolves.toBe(false);
    await expect(service([]).premierDossierAttendu()).resolves.toBe(true);
  });
});

describe('F44 · la garde des routes de l’installation', () => {
  const contexte = (user: Record<string, unknown> | undefined) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as never;
  const garde = () => new AdministrateurInstallationGuard({ dossierDInstallation: async () => 'premier' } as never);

  it('laisse passer l’administrateur du premier dossier', async () => {
    await expect(surSiteAsync(() => garde().canActivate(contexte({ role: 'ADMIN_CABINET', tenantId: 'premier' })))).resolves.toBe(true);
  });

  it('refuse l’administrateur d’un autre dossier · il obtiendrait la base de ses voisins', async () => {
    await expect(surSiteAsync(() => garde().canActivate(contexte({ role: 'ADMIN_CABINET', tenantId: 'second' })))).rejects.toThrow(
      /dossier d’installation/,
    );
  });

  it('refuse un autre rôle du premier dossier, et hors installation sur site', async () => {
    await expect(surSiteAsync(() => garde().canActivate(contexte({ role: 'COMPTABLE', tenantId: 'premier' })))).rejects.toThrow(
      ForbiddenException,
    );
    await expect(garde().canActivate(contexte({ role: 'ADMIN_CABINET', tenantId: 'premier' }))).rejects.toThrow(/pas une installation sur site/);
  });

  it('est posée sur les trois routes de sauvegarde et sur la création des dossiers suivants', () => {
    const p = SurSiteController.prototype as unknown as Record<string, object>;
    for (const route of ['lister', 'copieExterne', 'sauvegarder', 'creerDossier']) {
      const gardes = (Reflect.getMetadata(GUARDS_METADATA, p[route]) ?? []) as unknown[];
      expect({ route, garde: gardes.includes(AdministrateurInstallationGuard) }).toEqual({ route, garde: true });
    }
    for (const route of ['etat', 'deposer']) {
      expect(Reflect.getMetadata(GUARDS_METADATA, p[route])).toBeUndefined();
    }
  });
});

describe('F44 · l’inscription publique sur site ne sert qu’au premier dossier', () => {
  const res = { cookie: () => undefined, clearCookie: () => undefined, req: { headers: {} } } as never;
  const controleur = (premier: boolean) => {
    const register = jest.fn(async () => ({ accessToken: 'x', csrfToken: 'y' }));
    const c = new AuthController({ register, premierDossierAttendu: async () => premier } as never, { get: () => undefined } as never);
    return { c, register };
  };

  it('un dossier existe · refusée, rien n’est créé', async () => {
    const { c, register } = controleur(false);
    await expect(surSiteAsync(() => c.register({} as never, res))).rejects.toThrow(/déjà son premier dossier/);
    expect(register).not.toHaveBeenCalled();
  });

  it('poste neuf · ouverte, sans lire INSCRIPTION_PUBLIQUE', async () => {
    const { c, register } = controleur(true);
    await surSiteAsync(() => c.register({} as never, res));
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('en ligne, la règle d’INSCRIPTION_PUBLIQUE ne change pas', async () => {
    const { c, register } = controleur(true);
    await expect(c.register({} as never, res)).rejects.toThrow(/VMG Consulting/);
    expect(register).not.toHaveBeenCalled();
  });
});

describe('F44 · l’écran d’ouverture sait si le poste attend son premier dossier', () => {
  it('l’état public le dit, sur site seulement', async () => {
    const licence = { etat: () => ({ surSite: true, statut: 'VALIDE', motif: null, empreinte: 'e', dateVersion: null, contenu: null }) };
    const c = (premier: boolean) => new SurSiteController(licence as never, {} as never, { premierDossierAttendu: async () => premier } as never);
    await expect(c(true).etat()).resolves.toMatchObject({ surSite: true, premierDossierAttendu: true });
    await expect(c(false).etat()).resolves.toMatchObject({ premierDossierAttendu: false });
    const enLigne = new SurSiteController({ etat: () => ({ surSite: false }) } as never, {} as never, {} as never);
    await expect(enLigne.etat()).resolves.toEqual({ surSite: false });
  });
});

describe('F44 · un dossier suivant naît sans rendre la session de son administrateur', () => {
  it('la réponse ne porte que le nom et l’adresse, jamais un jeton', async () => {
    const c = new SurSiteController({} as never, {} as never, {
      register: async () => ({ tenant: { nom: 'Beta' }, accessToken: 'jeton-du-nouvel-admin', csrfToken: 'z' }),
    } as never);
    const r = await surSiteAsync(() => c.creerDossier({ email: ' Admin@Beta.CD ' } as never));
    expect(r).toEqual({ dossier: 'Beta', email: 'admin@beta.cd' });
  });
});

describe('F44 · le paquet', () => {
  const lire = (f: string) => readFileSync(join(__dirname, '../../..', f), 'utf8');

  it('l’installation n’ouvre plus l’inscription par la configuration, et la mise à jour la retire', () => {
    const init = lire('installation/windows/initialiser.ps1');
    expect(init).not.toMatch(/^\s*'INSCRIPTION_PUBLIQUE=true',?$/m);
    expect(init).toMatch(/-notmatch '\^\(DOSSIER_INTERFACE\|PG_BIN\|INSCRIPTION_PUBLIQUE\)='/);
  });

  it('l’outil de déchiffrement voyage avec le serveur et lit le module du serveur', () => {
    expect(lire('.github/workflows/paquet-sur-site.yml')).toContain('Copy-Item installation/dechiffrer-sauvegarde.cjs $S');
    expect(lire('installation/dechiffrer-sauvegarde.cjs')).toContain("require(path.join(__dirname, 'dist', 'modules', 'sur-site', 'chiffrement-sauvegarde.js'))");
  });
});


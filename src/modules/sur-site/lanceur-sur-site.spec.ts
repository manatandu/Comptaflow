/**
 * Le lanceur du service Windows (`installation/demarrer.cjs`) · des lectures
 * qui, fausses, ne se verraient que chez un client : une configuration dont
 * la première clé est perdue, une mise à jour migrée sans copie, une copie
 * écrasée au redémarrage (audit final F191), une version hors maintenance
 * qui migre avant d'être refusée (F193), des copies qui s'accumulent (F265).
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as regles from './copies-avant-mise-a-jour';
import { SauvegardeSurSiteService } from './sauvegarde-sur-site.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { analyserEnv, identiteVersion, moduleCompile, preparerMiseAJour, refusDeLaLicence } = require('../../../installation/demarrer.cjs');

describe('lanceur sur site', () => {
  it('lit la configuration écrite par PowerShell 5, marque d’ordre des octets comprise', () => {
    const v = analyserEnv('﻿DATABASE_URL=postgresql://a:b@127.0.0.1:5433/omegax\r\n# PORT=1\r\nPORT = 8080 \r\nX="entre guillemets"\n');
    expect(v.DATABASE_URL).toBe('postgresql://a:b@127.0.0.1:5433/omegax');
    expect(v.PORT).toBe('8080');
    expect(v.X).toBe('entre guillemets');
    expect(Object.keys(v)).toHaveLength(3);
  });

  it('identifie une version par son commit · deux paquets du même jour ne se confondent pas', () => {
    expect(identiteVersion({ date: '2026-09-26', commit: 'aaa' })).not.toBe(identiteVersion({ date: '2026-09-26', commit: 'bbb' }));
    expect(identiteVersion({ date: '2026-09-26' })).toBe('2026-09-26');
    expect(identiteVersion({})).toBeNull();
  });
});

describe('lanceur sur site · avant les migrations', () => {
  const racines: string[] = [];
  afterAll(() => racines.forEach((r) => rmSync(r, { recursive: true, force: true })));

  /** Un poste · son dossier de données, ses sauvegardes, et le repère d'une installation déjà en service à la version P. */
  function poste(repere: string | null = JSON.stringify({ commit: 'aaa111bbb222' })) {
    const racine = mkdtempSync(join(tmpdir(), 'omegax-lanceur-'));
    racines.push(racine);
    const donnees = join(racine, 'donnees');
    const dossier = join(donnees, 'sauvegardes');
    mkdirSync(donnees, { recursive: true });
    if (repere !== null) writeFileSync(join(donnees, 'derniere-version.json'), repere);
    const etat = { base: 'base saine en P', refus: null as string | null, gestes: [] as string[], date: new Date(2026, 8, 28, 10, 0, 0) };
    const preparer = (version: string, x: { copier?: (f: string) => void } = {}) =>
      preparerMiseAJour({
        donnees,
        dossier,
        version,
        maintenant: etat.date,
        regles,
        garder: 2,
        journal: () => undefined,
        refusLicence: () => {
          etat.gestes.push('licence');
          return etat.refus;
        },
        copier:
          x.copier ??
          ((f: string) => {
            etat.gestes.push('copie');
            writeFileSync(f, etat.base);
          }),
      });
    const copies = () => (existsSync(dossier) ? readdirSync(dossier).filter((n) => n.endsWith('.dump')) : []);
    const repere$ = () => JSON.parse(readFileSync(join(donnees, 'derniere-version.json'), 'utf8'));
    return { racine, donnees, dossier, etat, preparer, copies, repere$ };
  }

  it('F191 · après une migration échouée, le redémarrage de WinSW ne réécrit pas la copie saine', () => {
    const p = poste();
    const m = p.preparer('ccc333ddd444');
    expect(m.plan.action).toBe('COPIER');
    const [copie] = p.copies();
    expect(readFileSync(join(p.dossier, copie), 'utf8')).toBe('base saine en P');
    // La migration échoue à mi-chemin · `apresMigration` n'est pas appelé.
    p.etat.base = 'base à moitié migrée';
    p.etat.date = new Date(2026, 8, 28, 10, 0, 30);
    p.etat.gestes = [];
    expect(p.preparer('ccc333ddd444').plan.action).toBe('REPRENDRE');
    expect(p.etat.gestes).toEqual(['licence']);
    expect(p.copies()).toEqual([copie]);
    expect(readFileSync(join(p.dossier, copie), 'utf8')).toBe('base saine en P');
  });

  it('F191 · un correctif livré après l’échec reprend la même copie, et la migration aboutie la clôt', () => {
    const p = poste();
    p.preparer('ccc333ddd444');
    const [copie] = p.copies();
    p.etat.base = 'base à moitié migrée';
    const m = p.preparer('eee555fff666');
    expect(m.plan).toEqual({ action: 'REPRENDRE', copie });
    m.apresMigration();
    expect(p.repere$()).toEqual({ commit: 'eee555fff666' });
    expect(p.copies()).toEqual([copie]);
  });

  it('F191 · la copie s’écrit sous un nom provisoire · interrompue, elle ne passe pas pour faite', () => {
    const p = poste();
    let vu = '';
    expect(() =>
      p.preparer('ccc333ddd444', {
        copier: (f) => {
          vu = f;
          expect(f.endsWith('.partiel')).toBe(true);
          expect(existsSync(f.replace(/\.partiel$/, ''))).toBe(false);
          writeFileSync(f, 'à moitié');
          throw new Error('pg_dump interrompu');
        },
      }),
    ).toThrow('pg_dump interrompu');
    expect(existsSync(vu)).toBe(false);
    expect(p.copies()).toEqual([]);
    // Le repère ne nomme aucune copie · le prochain démarrage refait la copie.
    expect(p.repere$()).toEqual({ commit: 'aaa111bbb222' });
    // Une coupure de courant ne passe par aucun catch · le reste, d'une autre
    // heure que la copie qui suit, est retiré au démarrage suivant.
    const reste = join(p.dossier, `${regles.nomCopieAvantMiseAJour(new Date(2026, 8, 27, 23, 0, 0), 'aaa111bbb222')}.partiel`);
    writeFileSync(reste, 'reste d’une coupure');
    expect(p.preparer('ccc333ddd444').plan.action).toBe('COPIER');
    expect(existsSync(reste)).toBe(false);
    expect(readdirSync(p.dossier).filter((n) => n.endsWith('.partiel'))).toEqual([]);
    expect(p.copies()).toHaveLength(1);
  });

  it('F265 · le reste d’une copie interrompue part après une migration aboutie, même sans nouvelle copie', () => {
    const p = poste();
    mkdirSync(p.dossier, { recursive: true });
    const reste = join(p.dossier, `${regles.nomCopieAvantMiseAJour(new Date(2026, 8, 27, 23, 0, 0), 'aaa111bbb222')}.partiel`);
    writeFileSync(reste, 'reste d’une coupure');
    // Retour à la version en place · aucune copie, et le reste ne doit pas attendre la mise à jour suivante.
    const m = p.preparer('aaa111bbb222');
    expect(m.plan.action).toBe('AUCUNE');
    m.apresMigration();
    expect(existsSync(reste)).toBe(false);
  });

  it('F191 · une copie déjà là n’est jamais écrasée, même sous le même nom', () => {
    const p = poste();
    mkdirSync(p.dossier, { recursive: true });
    const nom = regles.nomCopieAvantMiseAJour(p.etat.date, 'aaa111bbb222');
    writeFileSync(join(p.dossier, nom), 'copie précédente');
    expect(() => p.preparer('ccc333ddd444')).toThrow(/jamais écrasée/);
    expect(readFileSync(join(p.dossier, nom), 'utf8')).toBe('copie précédente');
  });

  it('F193 · une licence qui ne couvre pas la version arrête tout AVANT la copie et les migrations', () => {
    const p = poste();
    p.etat.refus = 'Version non couverte par la maintenance.';
    expect(() => p.preparer('ccc333ddd444')).toThrow(
      'Mise à jour arrêtée avant la copie et les migrations · la base n’a pas été modifiée. Version non couverte par la maintenance.',
    );
    expect(p.etat.gestes).toEqual(['licence']);
    expect(p.copies()).toEqual([]);
    expect(p.repere$()).toEqual({ commit: 'aaa111bbb222' });
  });

  it('F193 · arrêtée sur la reprise d’une migration échouée, la mise à jour ne dit pas la base intacte', () => {
    const p = poste();
    p.preparer('ccc333ddd444');
    const [copie] = p.copies();
    // La migration échoue, puis un correctif publié hors maintenance arrive.
    p.etat.base = 'base à moitié migrée';
    p.etat.refus = 'Version non couverte par la maintenance.';
    p.etat.gestes = [];
    let message = '';
    try {
      p.preparer('eee555fff666');
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe(`${regles.etatDeLaBaseAuRefus({ action: 'REPRENDRE', copie })} Version non couverte par la maintenance.`);
    expect(message).toContain(copie);
    expect(message).toContain('à moitié migrée');
    expect(p.etat.gestes).toEqual(['licence']);
    // Rien n'a bougé · la copie saine et le repère qui la nomme restent.
    expect(p.copies()).toEqual([copie]);
    expect(readFileSync(join(p.dossier, copie), 'utf8')).toBe('base saine en P');
    expect(p.repere$()).toEqual({ commit: 'aaa111bbb222', enCours: { vers: 'ccc333ddd444', copie } });
  });

  it('F193 · la licence passe avant la copie, jamais sur un redémarrage de la version en place', () => {
    const p = poste();
    p.preparer('ccc333ddd444').apresMigration();
    expect(p.etat.gestes).toEqual(['licence', 'copie']);
    p.etat.gestes = [];
    p.etat.refus = 'refus';
    expect(p.preparer('ccc333ddd444').plan.action).toBe('AUCUNE');
    expect(p.etat.gestes).toEqual([]);
  });

  it('F193 · un poste neuf migre sans copie, après avoir demandé la licence', () => {
    const p = poste(null);
    const m = p.preparer('ccc333ddd444');
    expect(m.plan.action).toBe('PREMIER_DEMARRAGE');
    expect(p.etat.gestes).toEqual(['licence']);
    m.apresMigration();
    expect(p.repere$()).toEqual({ commit: 'ccc333ddd444' });
    expect(p.copies()).toEqual([]);
  });

  it('F265 · les copies sont listées par le service, tournées, et une copie non aboutie reste', () => {
    const p = poste();
    const versions = ['v1', 'v2', 'v3', 'v4'];
    const copiesFaites: string[] = [];
    versions.forEach((v, i) => {
      p.etat.date = new Date(2026, 8, 28, 10, i, 0);
      const avant = new Set(p.copies());
      const m = p.preparer(v);
      copiesFaites.push(p.copies().find((n) => !avant.has(n))!);
      if (i === 1) {
        // L'essai vers v2 échoue, et le poste revient à v1 · la copie prise avant v2 n'a jamais servi.
        const retour = p.preparer('v1');
        expect(retour.plan.action).toBe('AUCUNE');
        retour.apresMigration();
      } else m.apresMigration();
    });
    // Chaque copie porte la version dont la base avait la forme · après le
    // retour, la base est de nouveau en v1.
    expect(copiesFaites).toEqual(['aaa111bbb222', 'v1', 'v1', 'v3'].map((v, i) => regles.nomCopieAvantMiseAJour(new Date(2026, 8, 28, 10, i, 0), v)));
    // Garder 2 · les copies avant v3 et avant v4 restent, celle avant v1
    // part, celle de l'essai vers v2 reste.
    expect(p.copies().sort()).toEqual([copiesFaites[1], copiesFaites[2], copiesFaites[3]].sort());
    const s = new SauvegardeSurSiteService({ MODE_INSTALLATION: 'SUR_SITE', DOSSIER_DONNEES: p.donnees } as NodeJS.ProcessEnv);
    expect(s.lister().map((c) => c.nom)).toEqual([...p.copies()].sort().reverse());
  });

  it('F193 · la licence se lit sur le service COMPILÉ du paquet, avec le dossier du paquet', () => {
    const ici = mkdtempSync(join(tmpdir(), 'omegax-paquet-'));
    racines.push(ici);
    expect(() => refusDeLaLicence(ici, {})).toThrow(/introuvable dans ce paquet/);
    mkdirSync(join(ici, 'dist', 'modules', 'sur-site'), { recursive: true });
    writeFileSync(
      join(ici, 'dist', 'modules', 'sur-site', 'licence-sur-site.service.js'),
      'exports.LicenceSurSiteService = class { constructor(a, env, c, ici) { this.v = [a, env.X, c, ici]; } motifRefusMigration() { return JSON.stringify(this.v); } };',
    );
    expect(JSON.parse(refusDeLaLicence(ici, { X: 'env du poste' }))).toEqual([null, 'env du poste', null, ici]);
    expect(moduleCompile(ici, 'modules/sur-site/licence-sur-site.service.js').LicenceSurSiteService).toBeDefined();
  });

  it('l’enchaînement du lanceur · licence et copie avant les migrations, repère après', () => {
    const src = readFileSync(join(__dirname, '../../../installation/demarrer.cjs'), 'utf8');
    const corps = src.slice(src.indexOf('function principal()'), src.indexOf('if (require.main === module)'));
    const i = (s: string) => {
      expect(corps).toContain(s);
      return corps.indexOf(s);
    };
    expect(i('preparerMiseAJour({')).toBeLessThan(i("'migrate', 'deploy'"));
    expect(i("'migrate', 'deploy'")).toBeLessThan(i('miseAJour.apresMigration();'));
    expect(i('miseAJour.apresMigration();')).toBeLessThan(i('require(entree);'));
    expect(corps).toContain('refusLicence: () => refusDeLaLicence(ICI, process.env)');
    expect(corps).toContain("moduleCompile(ICI, 'modules/sur-site/copies-avant-mise-a-jour.js')");
    // Le dossier que le service des sauvegardes liste · après la configuration du poste.
    expect(corps).toContain("dossier: process.env.DOSSIER_SAUVEGARDES || path.join(process.env.DOSSIER_DONNEES, 'sauvegardes'),");
    expect(i("process.env.DOSSIER_DONNEES = process.env.DOSSIER_DONNEES || DONNEES;")).toBeLessThan(i('preparerMiseAJour({'));
  });
});

import {
  avantMiseAJourAGarder,
  copiesAvantMiseAJourARetirer,
  copiesProtegees,
  etatDeLaBaseAuRefus,
  lireRepere,
  MOTIF_AVANT_MISE_A_JOUR,
  nomCopieAvantMiseAJour,
  planMiseAJour,
  provisoiresAvantMiseAJour,
  repereApresCopie,
  repereApresMigration,
  repereApresReprise,
} from './copies-avant-mise-a-jour';
import { nomSauvegarde } from './sauvegarde-sur-site.service';

/**
 * AUDIT FINAL F191 ET F265 · les règles des copies avant mise à jour, sans
 * disque. L'enchaînement réel (lanceur, fichiers) est dans
 * lanceur-sur-site.spec.ts.
 */
const T = new Date(2026, 8, 28, 10, 15, 0);
const COPIE = nomCopieAvantMiseAJour(T, 'aaa111bbb222');

describe('copies avant mise à jour · le nom et le motif', () => {
  it('le nom porte l’horodatage d’une copie quotidienne et la version dont la base a la forme', () => {
    expect(COPIE).toBe('omegax-20260928-101500-avant-mise-a-jour-aaa111bbb222.dump');
    expect(COPIE.startsWith(nomSauvegarde(T).replace(/\.dump$/, ''))).toBe(true);
    expect(MOTIF_AVANT_MISE_A_JOUR.test(COPIE)).toBe(true);
  });

  it('une version par date ou inconnue donne encore un nom reconnu', () => {
    expect(nomCopieAvantMiseAJour(T, '2026-09-26')).toBe('omegax-20260928-101500-avant-mise-a-jour-20260926.dump');
    expect(nomCopieAvantMiseAJour(T, null)).toMatch(/-avant-mise-a-jour-inconnue\.dump$/);
    for (const v of ['2026-09-26', null, 'x'.repeat(40), '../..']) expect(MOTIF_AVANT_MISE_A_JOUR.test(nomCopieAvantMiseAJour(T, v))).toBe(true);
  });

  it('une copie quotidienne et une copie avant mise à jour ne se confondent pas', () => {
    expect(MOTIF_AVANT_MISE_A_JOUR.test(nomSauvegarde(T))).toBe(false);
    expect(MOTIF_AVANT_MISE_A_JOUR.test(`${COPIE}.partiel`)).toBe(false);
    expect(provisoiresAvantMiseAJour([`${COPIE}.partiel`, COPIE, `${nomSauvegarde(T)}.partiel`, 'notes.txt'])).toEqual([`${COPIE}.partiel`]);
  });

  it('cinq copies gardées par défaut, réglables sur le poste', () => {
    expect(avantMiseAJourAGarder({} as NodeJS.ProcessEnv)).toBe(5);
    expect(avantMiseAJourAGarder({ SAUVEGARDES_AVANT_MISE_A_JOUR_A_GARDER: '2' } as NodeJS.ProcessEnv)).toBe(2);
    expect(avantMiseAJourAGarder({ SAUVEGARDES_AVANT_MISE_A_JOUR_A_GARDER: '0' } as NodeJS.ProcessEnv)).toBe(5);
  });
});

describe('copies avant mise à jour · le repère et le plan (audit final F191)', () => {
  const existe = (noms: string[]) => (n: string) => noms.includes(n);

  it('poste neuf, même version, nouvelle version', () => {
    expect(planMiseAJour(null, 'V', existe([]))).toEqual({ action: 'PREMIER_DEMARRAGE' });
    expect(planMiseAJour({ commit: 'V' }, 'V', existe([]))).toEqual({ action: 'AUCUNE' });
    expect(planMiseAJour({ commit: 'P' }, 'V', existe([]))).toEqual({ action: 'COPIER', versionDeLaBase: 'P', copiePerdue: null });
  });

  it('une migration inachevée REPREND sa copie, même si un correctif a changé la version à installer', () => {
    const r = repereApresCopie({ commit: 'P' }, 'V', COPIE);
    expect(planMiseAJour(r, 'V', existe([COPIE]))).toEqual({ action: 'REPRENDRE', copie: COPIE });
    expect(planMiseAJour(r, 'W', existe([COPIE]))).toEqual({ action: 'REPRENDRE', copie: COPIE });
    expect(repereApresReprise(r, 'W')).toEqual({ commit: 'P', enCours: { vers: 'W', copie: COPIE } });
  });

  it('une copie en cours que le disque n’a plus est dite perdue, et une nouvelle part', () => {
    const r = repereApresCopie({ commit: 'P' }, 'V', COPIE);
    expect(planMiseAJour(r, 'V', existe([]))).toEqual({ action: 'COPIER', versionDeLaBase: 'P', copiePerdue: COPIE });
  });

  it('un repère illisible n’est pas un poste neuf · la copie part, de version inconnue', () => {
    expect(lireRepere('{"com')).toEqual({ commit: null });
    expect(planMiseAJour(lireRepere('{"com'), 'V', existe([]))).toEqual({ action: 'COPIER', versionDeLaBase: null, copiePerdue: null });
    expect(lireRepere(null)).toBeNull();
  });

  it('le repère d’avant ce correctif se relit, et un nom retouché à la main n’est ni repris ni protégé', () => {
    expect(lireRepere('{"commit":"P"}')).toEqual({ commit: 'P' });
    expect(lireRepere(JSON.stringify({ commit: 'P', enCours: { vers: 'V', copie: '../omegax.env' }, nonAbouties: ['pgdata', COPIE] }))).toEqual({
      commit: 'P',
      nonAbouties: [COPIE],
    });
  });

  it('une migration aboutie clôt la copie · un retour à la version précédente la garde hors rotation', () => {
    const r = repereApresCopie({ commit: 'P' }, 'V', COPIE);
    expect(repereApresMigration(r, 'V')).toEqual({ commit: 'V' });
    // Retour à P après l'échec vers V · la migration vers V n'a jamais abouti.
    expect(planMiseAJour(r, 'P', existe([COPIE]))).toEqual({ action: 'AUCUNE' });
    const retour = repereApresMigration(r, 'P');
    expect(retour).toEqual({ commit: 'P', nonAbouties: [COPIE] });
    expect(repereApresMigration(retour, 'P')).toEqual(retour);
    expect(copiesProtegees(r, retour)).toEqual([COPIE]);
  });

  it('la copie de la mise à jour qui vient d’aboutir est protégée par le repère d’avant la migration', () => {
    // Un poste dont l'horloge a reculé nomme cette copie plus ancienne que les
    // autres · c'est la protection, pas le rang, qui la garde.
    const r = repereApresCopie({ commit: 'P' }, 'V', COPIE);
    expect(copiesProtegees(r, repereApresMigration(r, 'V'))).toEqual([COPIE]);
    expect(copiesProtegees({ commit: 'P' }, { commit: 'V' })).toEqual([]);
  });

  it('arrêtée par la licence, la mise à jour dit l’état de la base selon qu’un essai l’a déjà touchée (audit final F193)', () => {
    expect(etatDeLaBaseAuRefus({ action: 'COPIER', versionDeLaBase: 'P', copiePerdue: null })).toMatch(/la base n’a pas été modifiée\.$/);
    expect(etatDeLaBaseAuRefus({ action: 'PREMIER_DEMARRAGE' })).toMatch(/la base n’a pas été modifiée\.$/);
    const reprise = etatDeLaBaseAuRefus({ action: 'REPRENDRE', copie: COPIE });
    expect(reprise).toContain(COPIE);
    expect(reprise).toContain('à moitié migrée');
    expect(reprise).toMatch(/^Mise à jour arrêtée avant les migrations · une migration précédente/);
  });
});

describe('copies avant mise à jour · la rotation (audit final F265)', () => {
  const nom = (jour: number) => nomCopieAvantMiseAJour(new Date(2026, 0, jour, 9, 0, 0), 'abc');
  const noms = [nom(1), nom(2), nom(3), nom(4), 'omegax-20260105-090000.dump', 'rapport.pdf'];

  it('garde les N plus récentes, ne touche qu’à sa série, et jamais à tout', () => {
    expect(copiesAvantMiseAJourARetirer(noms, 2)).toEqual([nom(2), nom(1)]);
    expect(copiesAvantMiseAJourARetirer(noms, 0)).toEqual([nom(3), nom(2), nom(1)]);
  });

  it('une copie protégée ne part jamais, même au-delà du nombre gardé', () => {
    expect(copiesAvantMiseAJourARetirer(noms, 2, [nom(1)])).toEqual([nom(2)]);
  });
});

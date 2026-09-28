import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tachesDuRole } from './accueil-par-metier';

// Aucun import de « vitest » · convention du dépôt.

/**
 * ACCUEIL PAR MÉTIER · chaque rôle reçoit ses tâches, chaque raccourci porte
 * le titre de sa fenêtre, et l'accueil ne donne aucun droit.
 */
function titresDuRegistre(): Map<string, string> {
  const src = readFileSync(join(__dirname, 'registre-fenetres.tsx'), 'utf8');
  const titres = new Map<string, string>();
  for (const m of src.matchAll(/motif: \/\^\\\/([a-z0-9-]+)\$\/,\s*titre: (['"])(.*?)\2/g)) titres.set('/' + m[1], m[3]);
  return titres;
}

describe('accueil par métier', () => {
  it('le gestionnaire de paie ne reçoit que la paie', () => {
    const { taches } = tachesDuRole('GESTIONNAIRE_PAIE');
    expect(taches.map((t) => t.chemin.split('?')[0]).every((c) => c === '/personnel' || c === '/devises')).toBe(true);
  });

  it('la lecture seule ne reçoit aucune tâche de saisie', () => {
    const chemins = tachesDuRole('LECTURE_SEULE').taches.map((t) => t.chemin);
    expect(chemins).not.toContain('/saisie');
    expect(chemins).toContain('/etats-financiers');
  });

  it('le comptable commence par la saisie, l’administrateur a en plus ses paramètres', () => {
    expect(tachesDuRole('COMPTABLE').taches[0].chemin).toBe('/saisie');
    expect(tachesDuRole('AIDE_COMPTABLE').taches[0].chemin).toBe('/saisie');
    const admin = tachesDuRole('ADMIN_CABINET').taches;
    expect(admin.find((t) => t.chemin === '/parametres-dossier')?.admin).toBe(true);
  });

  it('un raccourci sans paramètre porte le titre de sa fenêtre', () => {
    const titres = titresDuRegistre();
    const roles = ['ADMIN_CABINET', 'COMPTABLE', 'AIDE_COMPTABLE', 'LECTURE_SEULE', 'GESTIONNAIRE_PAIE'] as const;
    const ecarts = roles
      .flatMap((r) => tachesDuRole(r).taches)
      .filter((t) => !t.chemin.includes('?') && titres.has(t.chemin) && titres.get(t.chemin) !== t.label)
      .map((t) => `${t.chemin} « ${t.label} » ≠ « ${titres.get(t.chemin)} »`);
    expect(ecarts).toEqual([]);
  });

  it('l’accueil filtre les raccourcis comme les menus, et réserve les tâches d’administration', () => {
    const page = readFileSync(join(__dirname, '../pages/AccueilPage.tsx'), 'utf8');
    const bloc = page.slice(page.indexOf('const tachesVisibles'), page.indexOf('const dateCourte'));
    expect(bloc).toContain('!t.admin || estAdmin');
    expect(bloc).toContain('cheminAuMenu(t.chemin, utilisateur?.tenant)');
  });
});

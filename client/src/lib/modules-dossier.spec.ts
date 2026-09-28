import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODULES, cheminAuMenu, moduleDuChemin } from './profil-dossier';

// Aucun import de « vitest » · convention du dépôt.

/**
 * MODULES ACTIVABLES PAR DOSSIER · masquer n'est pas refuser, et rien de ce
 * qu'un texte impose à tous n'est masquable.
 */
const NORMAL = { referentiel: 'SYSCOHADA' as const, systemeComptableSyscohada: 'NORMAL' as const };

describe('modules activables', () => {
  it('le catalogue suit l’énumération du serveur', () => {
    const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');
    const bloc = schema.match(/enum ModuleOptionnel \{([^}]+)\}/)![1];
    const serveur = bloc.split('\n').map((l) => l.trim()).filter(Boolean).sort();
    expect(MODULES.map((m) => m.cle).sort()).toEqual(serveur);
  });

  it('un module désactivé masque ses fenêtres, activé il les montre', () => {
    expect(cheminAuMenu('/ifrs', { ...NORMAL, modulesActives: [] })).toBe(false);
    expect(cheminAuMenu('/ifrs', { ...NORMAL, modulesActives: ['IFRS'] })).toBe(true);
    expect(cheminAuMenu('/personnel?onglet=bulletins', { ...NORMAL, modulesActives: [] })).toBe(false);
    expect(cheminAuMenu('/circularisation', { ...NORMAL, modulesActives: ['PAIE'] })).toBe(false);
  });

  it('sans la liste (dossier pas encore chargé), rien ne se masque', () => {
    expect(cheminAuMenu('/ifrs', NORMAL)).toBe(true);
    expect(cheminAuMenu('/ifrs', null)).toBe(true);
  });

  it('ce qu’un texte impose à tous reste toujours au menu', () => {
    for (const chemin of ['/facturation', '/inventaire', '/provisions', '/documents-obligatoires', '/registre-donateurs', '/saisie']) {
      expect(moduleDuChemin(chemin)).toBeNull();
      expect(cheminAuMenu(chemin, { ...NORMAL, modulesActives: [] })).toBe(true);
    }
  });
});

describe('modules activables · l’écran des paramètres', () => {
  const page = readFileSync(join(__dirname, '../pages/ParametresDossierPage.tsx'), 'utf8');
  it('chaque module du catalogue a sa case, envoyée à /dossier/modules, et le menu se relit', () => {
    expect(page).toContain('{MODULES.map((m) => (');
    expect(page).toContain("api.patch<ParametresDossier>('/dossier/modules'");
    const corps = page.slice(page.indexOf('const changerModule'), page.indexOf('const changerRegime'));
    expect(corps).toContain('await rafraichir()');
  });
  it('la case est réservée à l’administrateur, comme la route', () => {
    const debut = page.indexOf('{MODULES.map((m) => (');
    expect(page.slice(debut, page.indexOf('</fieldset>', debut))).toContain('disabled={!estAdmin || envoi}');
  });
});

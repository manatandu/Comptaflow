import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bandeauDemonstration, LIBELLE_BANDEAU_DEMONSTRATION } from './bandeau-demonstration';

// Aucun import de « vitest » · convention du dépôt, le spec tourne aussi sous
// le jest de la racine.

const lire = (chemin: string) => readFileSync(join(__dirname, '..', chemin), 'utf8');

/** Le corps JSX rendu par AppShell, commentaires retirés, pour lire l'ordre des éléments. */
function rendu(): string {
  const src = lire('components/chrome/AppShell.tsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return src.slice(src.lastIndexOf('return ('));
}

describe('le bandeau de la vitrine', () => {
  it('se dit fictif, dans les mots du propriétaire, et sans tiret cadratin', () => {
    expect(LIBELLE_BANDEAU_DEMONSTRATION).toBe('Dossier de démonstration · données fictives');
    expect(LIBELLE_BANDEAU_DEMONSTRATION).not.toContain(String.fromCharCode(0x2014));
  });

  it('se lit sur le DRAPEAU du dossier, jamais sur son nom', () => {
    expect(bandeauDemonstration({ estDemonstration: true })).toBe(LIBELLE_BANDEAU_DEMONSTRATION);
    expect(bandeauDemonstration({ estDemonstration: false })).toBeNull();
    // Un client nommé « Démo » n'est pas une vitrine.
    expect(bandeauDemonstration({ estDemonstration: false, nom: 'Démo SARL' } as { estDemonstration: boolean })).toBeNull();
  });

  it('une valeur absente n’est pas une vitrine · un serveur d’avant, sans le champ, ne montre rien', () => {
    expect(bandeauDemonstration({})).toBeNull();
    expect(bandeauDemonstration({ estDemonstration: null })).toBeNull();
    expect(bandeauDemonstration(null)).toBeNull();
    expect(bandeauDemonstration(undefined)).toBeNull();
  });

  it('le composant appelle la règle sur le dossier de la session, et ne rend rien hors vitrine', () => {
    const src = lire('components/chrome/BandeauDemonstration.tsx');
    expect(src).toContain('bandeauDemonstration(utilisateur?.tenant)');
    expect(src).toMatch(/if \(!texte\) return null;/);
    // Aux couleurs d'avertissement doux de la charte, jamais une couleur écrite en dur.
    expect(src).toContain('bg-warning-soft');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    // À 360 px le libellé se coupe au lieu de pousser l'espace de côté.
    expect(src).toContain('min-w-0');
    expect(src).toContain('<span className="truncate">');
  });

  it('le bandeau ne se ferme pas · aucun bouton, aucun état qui le masquerait', () => {
    const src = lire('components/chrome/BandeauDemonstration.tsx');
    expect(src).not.toMatch(/<button/);
    expect(src).not.toMatch(/useState/);
  });

  it('il est posé dans le chrome, sous la barre de menus et avant l’espace de travail', () => {
    const corps = rendu();
    const menus = corps.indexOf('<MenuBar');
    const bandeau = corps.indexOf('<BandeauDemonstration />');
    const travail = corps.indexOf('<main');
    expect(menus).toBeGreaterThan(-1);
    expect(bandeau).toBeGreaterThan(menus);
    expect(travail).toBeGreaterThan(bandeau);
  });
});

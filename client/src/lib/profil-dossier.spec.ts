import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHEMINS_SANS_OBJET_SMT, cheminAuMenu, estSystemeMinimalDossier } from './profil-dossier';
import { filtrerParProfil, type MenuDef } from '../components/chrome/menu-groupes';

// Aucun import de « vitest » · convention du dépôt, le spec tourne aussi sous
// le jest de la racine.

/**
 * MENUS PAR PROFIL DE DOSSIER · docs/audit-modules-par-profil.md. Un dossier au
 * Système minimal de trésorerie ne voit pas ce qui n'a pas d'objet chez lui ;
 * les trois autres profils voient tout. Masquer n'est pas refuser.
 */

const ASSOCIATIONS = { referentiel: 'SYCEBNL' as const, jeuEtatsFinanciersSycebnl: 'ASSOCIATIONS_ORDRES_PROFESSIONNELS' as const };
const PROJETS = { referentiel: 'SYCEBNL' as const, jeuEtatsFinanciersSycebnl: 'PROJETS_DEVELOPPEMENT' as const };
const SMT_SYCEBNL = { referentiel: 'SYCEBNL' as const, jeuEtatsFinanciersSycebnl: 'SYSTEME_MINIMAL_TRESORERIE' as const };
const NORMAL = { referentiel: 'SYSCOHADA' as const, systemeComptableSyscohada: 'NORMAL' as const };
const SMT_SYSCOHADA = { referentiel: 'SYSCOHADA' as const, systemeComptableSyscohada: 'MINIMAL_TRESORERIE' as const };

describe('le profil se lit sur le jeu au SYCEBNL, sur le système au SYSCOHADA', () => {
  it('reconnaît les deux SMT et eux seuls', () => {
    expect(estSystemeMinimalDossier(SMT_SYCEBNL)).toBe(true);
    expect(estSystemeMinimalDossier(SMT_SYSCOHADA)).toBe(true);
    for (const t of [ASSOCIATIONS, PROJETS, NORMAL]) expect(estSystemeMinimalDossier(t)).toBe(false);
    expect(estSystemeMinimalDossier(null)).toBe(false);
  });
});

describe('ce qu’un SMT ne voit pas, et ce qu’il garde', () => {
  it('masque la balance âgée et les régularisations au SMT, pas ailleurs', () => {
    for (const chemin of ['/balance-agee', '/regularisations', '/provisions', '/magasin']) {
      expect(cheminAuMenu(chemin, SMT_SYCEBNL)).toBe(false);
      expect(cheminAuMenu(chemin, SMT_SYSCOHADA)).toBe(false);
      for (const t of [ASSOCIATIONS, PROJETS, NORMAL]) expect(cheminAuMenu(chemin, t)).toBe(true);
    }
  });

  it('un dossier pas encore chargé voit tout', () => {
    expect(cheminAuMenu('/balance-agee', undefined)).toBe(true);
  });

  it('ignore la chaîne de requête', () => {
    expect(cheminAuMenu('/balance-agee?compte=41', SMT_SYSCOHADA)).toBe(false);
  });

  it('GARDE ce qui nourrit les notes 2 et 3 du SMT, et le registre des donateurs (SYCEBNL art. 17)', () => {
    // Les états SMT d'OmegaX lisent les comptes de tiers et de stocks · les
    // masquer viderait ces notes sans qu'aucun total ne bouge.
    for (const chemin of [
      '/tiers',
      '/lettrage',
      '/facturation',
      '/variation-stocks',
      '/inventaire',
      '/immobilisations',
      '/registre-donateurs',
      '/etats-financiers',
      '/notes-annexes',
      '/rapprochement',
      '/personnel',
      '/declaration-tva',
    ]) {
      expect(cheminAuMenu(chemin, SMT_SYCEBNL)).toBe(true);
      expect(cheminAuMenu(chemin, SMT_SYSCOHADA)).toBe(true);
    }
  });

  it('chaque chemin masqué est une fenêtre qui existe au registre', () => {
    // Un chemin mal orthographié ne masquerait rien, en silence.
    const registre = readFileSync(join(__dirname, 'registre-fenetres.tsx'), 'utf8');
    for (const chemin of CHEMINS_SANS_OBJET_SMT) {
      const motif = `/^${chemin.replace(/\//g, '\\/')}$/`;
      expect({ chemin, present: registre.includes(motif) }).toEqual({ chemin, present: true });
    }
  });
});

describe('filtrerParProfil', () => {
  const menus: MenuDef[] = [
    {
      titre: 'État',
      items: [
        { label: 'Tableau de bord', chemin: '/tableau-de-bord' },
        { titre: 'Analyse', items: [{ label: 'Balance âgée', chemin: '/balance-agee' }] },
        { titre: 'Livres', items: [{ label: 'Journal', chemin: '/journal' }, { label: 'Balance âgée', chemin: '/balance-agee' }] },
        { label: 'Sans chemin' },
      ],
    },
  ];
  const servi = (c: string) => c !== '/balance-agee';

  it('retire la commande, vide le groupe, garde ce qui n’a pas de chemin', () => {
    const [etat] = filtrerParProfil(menus, servi);
    expect(etat.items).toEqual([
      { label: 'Tableau de bord', chemin: '/tableau-de-bord' },
      { titre: 'Analyse', items: [] },
      { titre: 'Livres', items: [{ label: 'Journal', chemin: '/journal' }] },
      { label: 'Sans chemin' },
    ]);
  });
});

describe('le câblage d’AppShell', () => {
  const source = readFileSync(join(__dirname, '../components/chrome/AppShell.tsx'), 'utf8');
  const menus = source.slice(source.indexOf('const menusComplets'), source.indexOf("titre: 'Fenêtre'"));

  it('toute commande du menu qui ouvre une fenêtre déclare son chemin', () => {
    const navigations = menus.match(/onClick: \(\) => navigate\('\//g) ?? [];
    const chemins = menus.match(/chemin: '\//g) ?? [];
    expect(navigations.length).toBeGreaterThan(40);
    expect(chemins.length).toBe(navigations.length);
  });

  it('les menus servis passent par le filtre de profil', () => {
    expect(source).toMatch(/filtrerParProfil\(menusComplets, \(chemin\) => cheminAuMenu\(chemin, utilisateur\?\.tenant\)\)/);
  });

  it('masquer n’est pas refuser · l’aiguillage des fenêtres ne lit pas le profil', () => {
    const debut = source.indexOf("if (location.pathname === '/') return;");
    const fin = source.indexOf('ouvrir(location.pathname', debut);
    expect(debut).toBeGreaterThan(0);
    expect(source.slice(debut, fin)).toContain('fenetreDisponible(def');
    expect(source.slice(debut, fin)).not.toContain('cheminAuMenu');
  });
});

describe('l’accueil applique le même filtre', () => {
  it('les tuiles passent par cheminAuMenu', () => {
    const accueil = readFileSync(join(__dirname, '../pages/AccueilPage.tsx'), 'utf8');
    expect(accueil).toMatch(/\.filter\(\(t\) => cheminAuMenu\(t\.chemin, utilisateur\?\.tenant\)\)/);
  });
});

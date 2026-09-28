import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADRESSES_PAIE, ADRESSES_UTILES_A_LA_PAIE, fenetreOuverteAuRole } from '../../lib/roles-cantonnes';

// Pas d'import de « vitest » · convention du dépôt (voir calcul.spec.ts).

/**
 * LE MENU RÉDUIT DU GESTIONNAIRE DE PAIE MÈNE À TOUTES SES FENÊTRES, ET À
 * ELLES SEULES (audit final F247, 2026-09-28).
 *
 * La fenêtre Devises lui était ouverte (`fenetreOuverteAuRole`) pour qu'il y
 * cote l'USD du jour, sans lequel sa paie en dollars ne se calcule pas, et
 * aucun menu n'y menait · le refus du calcul l'envoyait vers une fenêtre qu'il
 * ne pouvait atteindre qu'en tapant l'adresse. Le menu et la règle vivent dans
 * deux fichiers, et c'est leur accord que ce spec tient · une fenêtre ouverte
 * sans entrée est une porte sans poignée, une entrée sans ouverture un clic
 * qui retombe sur le personnel.
 *
 * Lu sur la SOURCE, faute de monter React · le bloc est celui que
 * `mon-compte.spec.ts` découpe déjà, du test de rôle au menu complet.
 */

const shell = readFileSync(join(__dirname, 'AppShell.tsx'), 'utf8');
const debut = shell.indexOf("utilisateur?.role === 'GESTIONNAIRE_PAIE'\n");
const menu = shell.slice(debut, shell.indexOf('filtrerParProfil(menusComplets', debut));

/** Les entrées qui ouvrent une fenêtre, avec l'adresse qu'elles annoncent et celle qu'elles ouvrent. */
const entrees = [...menu.matchAll(/\{ label: '([^']+)', chemin: '([^']+)', onClick: \(\) => navigate\('([^']+)'\) \}/g)].map(
  (m) => ({ label: m[1], chemin: m[2], cible: m[3] }),
);

describe('menu du gestionnaire de paie · ses fenêtres, toutes et rien d’autre', () => {
  it('le découpage trouve encore le menu · un garde-fou qui ne lit rien ne vérifie rien', () => {
    expect(debut).toBeGreaterThan(0);
    expect(menu).toContain("titre: 'Fichier'");
    expect(entrees.length).toBeGreaterThan(0);
  });

  it('aucune navigation du menu n’échappe au relevé', () => {
    // Une entrée écrite sans `chemin`, ou sous une autre forme, sortirait du
    // relevé ci-dessus et passerait sans contrôle.
    const navigations = [...menu.matchAll(/navigate\('([^']+)'\)/g)].map((m) => m[1]);
    expect(navigations.sort()).toEqual(entrees.map((e) => e.cible).sort());
  });

  it('chaque entrée ouvre l’adresse qu’elle annonce', () => {
    for (const e of entrees) expect([e.label, e.cible]).toEqual([e.label, e.chemin]);
  });

  it('les adresses du menu sont exactement celles que son rôle ouvre', () => {
    const ouvertes = [...ADRESSES_PAIE, ...ADRESSES_UTILES_A_LA_PAIE].sort();
    expect(entrees.map((e) => e.chemin).sort()).toEqual(ouvertes);
    for (const e of entrees) {
      expect([e.chemin, fenetreOuverteAuRole(e.chemin, 'GESTIONNAIRE_PAIE')]).toEqual([e.chemin, true]);
    }
  });

  it('Devises y est, pour le cours de l’USD du jour', () => {
    expect(entrees.map((e) => e.chemin)).toContain('/devises');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Aucun import de « vitest » · convention du dépôt.

/**
 * COMPTES RETENUS · chaque liste de choix de saisie demande `retenus=true`
 * (le serveur y ajoute les comptes utilisés). La fenêtre Plan comptable,
 * elle, lit tout le plan avec son usage.
 */
const LISTES = [
  'pages/SaisiePage.tsx',
  'pages/LettragePage.tsx',
  'pages/ModelesSaisiePage.tsx',
  'components/ModaleReimputation.tsx',
  'pages/RegularisationPage.tsx',
  'pages/ProvisionsPage.tsx',
  'pages/OdAnalytiquesPage.tsx',
  'components/PasserEcritureFacture.tsx',
  'pages/BrouillardPage.tsx',
  'components/HistoriqueRappels.tsx',
];

describe('comptes retenus à l’écran', () => {
  it.each(LISTES)('%s ne propose que les comptes retenus ou utilisés', (f) => {
    const src = readFileSync(join(__dirname, '..', f), 'utf8');
    expect(src).toMatch(/\/comptes\?[^'`]*retenus=true/);
  });

  it('le plan comptable lit tout le plan, avec son usage', () => {
    const src = readFileSync(join(__dirname, '../pages/PlanComptesPage.tsx'), 'utf8');
    expect(src).toContain('`/comptes?usage=true${params}`');
    expect(src).toContain("api.post('/comptes/ne-retenir-que-les-utilises'");
  });
});

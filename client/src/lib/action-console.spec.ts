import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { actionDeConsole } from './action-console';

/**
 * « NOUVEAU FICHIER COMPTABLE… » OUVRE LA CRÉATION, PAS LA CONSOLE NUE.
 * Audit de l'interface du 2026-09-27, C1.
 */

const lire = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('action de la console par son adresse', () => {
  it('lit ?action=nouveau-cabinet, et rien d’autre', () => {
    expect(actionDeConsole('/plateforme?action=nouveau-cabinet')).toBe('nouveau-cabinet');
    expect(actionDeConsole('/plateforme')).toBeNull();
    expect(actionDeConsole('/plateforme?action=autre')).toBeNull();
    expect(actionDeConsole(undefined)).toBeNull();
  });

  it('le menu, le registre et la page sont reliés', () => {
    expect(lire('components/chrome/AppShell.tsx')).toContain(
      "label: 'Nouveau fichier comptable…', chemin: '/plateforme?action=nouveau-cabinet'",
    );
    expect(lire('lib/registre-fenetres.tsx')).toContain('rendre: ({ adresse }) => <PlateformePage adresse={adresse} />');
    const page = lire('pages/PlateformePage.tsx');
    expect(page).toContain("useState(() => actionDeConsole(adresse) === 'nouveau-cabinet')");
    // Resynchronisée quand le menu redemande la fenêtre déjà ouverte.
    const effet = page.slice(page.indexOf('useEffect(() => {\n    if (actionDeConsole(adresse)'));
    expect(effet.slice(0, effet.indexOf('}, ['))).toContain('setNouveauOuvert(true)');
    expect(effet).toMatch(/^[\s\S]*?\}, \[adresse\]\)/);
  });
});

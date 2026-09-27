import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ongletPersonnelDe } from './onglets-personnel';

/**
 * PAIE DU MOIS SOUS TRAITEMENT, ET FIN DE CONTRAT À L'ÉCRAN.
 * Audit de l'interface du 2026-09-27, I10 et F2.
 */

const lire = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('fenêtre Personnel', () => {
  it('lit son onglet dans l’adresse, avec repli sur le registre', () => {
    expect(ongletPersonnelDe('/personnel?onglet=bulletins')).toBe('bulletins');
    expect(ongletPersonnelDe('/personnel')).toBe('registre');
    expect(ongletPersonnelDe('/personnel?onglet=inconnu')).toBe('registre');
  });

  it('le menu, le registre et la page sont reliés', () => {
    const shell = lire('components/chrome/AppShell.tsx');
    const traitement = shell.slice(shell.indexOf("titre: 'Traitement',"), shell.indexOf("titre: 'État',"));
    expect(traitement).toContain(
      "...(peutValider ? [{ label: 'Paie du mois', chemin: '/personnel?onglet=bulletins'",
    );
    expect(lire('lib/registre-fenetres.tsx')).toContain('rendre: ({ adresse }) => <PersonnelPage adresse={adresse} />');
    const page = lire('pages/PersonnelPage.tsx');
    expect(page).toContain('useState<OngletPersonnel>(() => ongletPersonnelDe(adresse))');
    const effet = page.slice(page.indexOf('useEffect(() => {\n    setOnglet(ongletPersonnelDe(adresse));'));
    expect(effet.slice(0, effet.indexOf(')', effet.indexOf('}, [')) + 1)).toMatch(/\}, \[adresse\]\)$/);
  });

  it('la fin de contrat appelle la route du serveur, avec les seules clés du DTO', () => {
    const page = lire('pages/PersonnelPage.tsx');
    const debut = page.indexOf("await api.post(`/personnel/contrats/${finContrat.contratId}/fin`, {");
    expect(debut).toBeGreaterThan(0);
    const corps = page.slice(page.indexOf('{', debut + 50), page.indexOf('});', debut));
    const cles = [...corps.matchAll(/^\s*([a-zA-Z]+)\s*:/gm)].map((m) => m[1]);
    const dto = readFileSync(join(__dirname, '../../../src/modules/personnel/dto/personnel.dto.ts'), 'utf8');
    const classe = dto.slice(dto.indexOf('export class TerminerContratDto {'), dto.indexOf('}', dto.indexOf('export class TerminerContratDto {')));
    const proprietes = [...classe.matchAll(/^\s{2}([a-zA-Z]+)[?!]:/gm)].map((m) => m[1]);
    expect(cles.sort()).toEqual(['dateFin', 'motifFin']);
    expect(cles.filter((c) => !proprietes.includes(c))).toEqual([]);
    const controleur = readFileSync(join(__dirname, '../../../src/modules/personnel/personnel.controller.ts'), 'utf8');
    expect(controleur).toContain("@Post('contrats/:contratId/fin')");
  });
});

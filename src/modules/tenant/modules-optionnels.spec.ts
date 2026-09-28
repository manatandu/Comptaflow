import { readFileSync } from 'fs';
import { join } from 'path';
import { ModuleOptionnel } from '@prisma/client';
import { MODULES_OPTIONNELS, normaliserModules } from './modules-optionnels';

/**
 * Modules activables · masquer n'est pas refuser, les dossiers existants
 * gardent tout, la vitrine montre tout.
 */
describe('modules activables par dossier', () => {
  it('le catalogue couvre exactement l’énumération du schéma', () => {
    expect([...MODULES_OPTIONNELS].sort()).toEqual(Object.values(ModuleOptionnel).sort());
  });

  it('la liste est normalisée dans l’ordre du catalogue, sans doublon', () => {
    expect(normaliserModules([ModuleOptionnel.IFRS, ModuleOptionnel.PAIE, ModuleOptionnel.IFRS])).toEqual([
      ModuleOptionnel.PAIE,
      ModuleOptionnel.IFRS,
    ]);
  });

  it('la migration active tous les modules sur les dossiers existants', () => {
    const sql = readFileSync(
      join(__dirname, '../../../prisma/migrations/20261213000000_modules_optionnels/migration.sql'),
      'utf8',
    );
    const maj = sql.match(/UPDATE "tenants" SET "modulesActives" = ARRAY\[([^\]]+)\]/);
    expect(maj).not.toBeNull();
    const actives = maj![1].split(',').map((x) => x.trim().replace(/'/g, ''));
    expect(actives.sort()).toEqual(Object.values(ModuleOptionnel).sort());
  });

  it('la vitrine de démonstration reçoit tous les modules', () => {
    const src = readFileSync(join(__dirname, '../plateforme/plateforme.service.ts'), 'utf8');
    const debut = src.indexOf('async preparerDossierDemonstration(');
    const corps = src.slice(debut, src.indexOf('private async reprendreGarnissage(', debut));
    expect(corps).toContain('modulesActives: [...MODULES_OPTIONNELS]');
  });

  it('la route est réservée à l’administrateur du dossier', () => {
    const src = readFileSync(join(__dirname, 'tenant.controller.ts'), 'utf8');
    expect(src).toMatch(/@Patch\('modules'\)\s*@Roles\(RoleUtilisateur\.ADMIN_CABINET\)/);
  });
});

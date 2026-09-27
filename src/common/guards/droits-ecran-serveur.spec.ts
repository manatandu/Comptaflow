import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { CLE_ACCES_ROLES_CANTONNES } from '../decorators/acces-roles-cantonnes.decorator';
import { EtatsPersonnalisesController } from '../../modules/etats-personnalises/etats-personnalises.controller';
import { SimulationsController } from '../../modules/simulations/simulations.controller';

/**
 * UN ÉCRAN QUI RÉSERVE AU COMPTABLE S'APPUIE SUR UNE ROUTE QUI LE RÉSERVE AUSSI.
 *
 * Audit du 2026-09-26 · les fenêtres États personnalisés et Simulateur
 * budgétaire masquent leurs actions derrière `peutValider` (administrateur et
 * comptable). Leurs routes ne portaient que `@Roles(ADMIN, COMPTABLE)`, sous
 * lequel l'aide-comptable se lit comme le comptable : un appel direct passait
 * ce que l'écran refusait. Masquer sans refuser (CLAUDE.md § 6).
 *
 * Lu sur les MÉTADONNÉES des routes, pas sur la source · c'est ce que la
 * garde lit elle-même.
 */

const RACINE_CLIENT = join(__dirname, '../../../client/src/pages');

const PAIRES: Array<[string, new (...a: never[]) => object]> = [
  ['EtatsPersonnalisesPage.tsx', EtatsPersonnalisesController],
  ['SimulationsBudgetairesPage.tsx', SimulationsController],
];

const ECRITURES = new Set([RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE]);

describe('droits de l’écran et de la route', () => {
  it.each(PAIRES)('%s lit peutValider', (page) => {
    const source = readFileSync(join(RACINE_CLIENT, page), 'utf8');
    expect(source).toMatch(/const \{[^}]*\bpeutValider\b[^}]*\} = useAuth\(\);/);
  });

  it.each(PAIRES)('les routes d’écriture derrière %s refusent les rôles cantonnés', (_page, controleur) => {
    const proto = controleur.prototype as Record<string, unknown>;
    const routes = Object.getOwnPropertyNames(proto)
      .filter((n) => n !== 'constructor')
      .map((n) => ({ n, f: proto[n] as object }))
      .filter(({ f }) => ECRITURES.has(Reflect.getMetadata(METHOD_METADATA, f)));
    expect(routes.length).toBe(3);
    for (const { n, f } of routes) {
      expect([n, Reflect.getMetadata(CLE_ACCES_ROLES_CANTONNES, f)]).toEqual([
        n,
        { aideComptable: false, gestionnairePaie: false },
      ]);
    }
  });
});

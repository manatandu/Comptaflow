import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrepartieCessionProposee } from './contrepartie-cession';

// Aucun import de « vitest » · convention du dépôt, le spec lit des sources.

/**
 * PASSE R1, B6 · la liste « Encaissé sur » d'une cession ne propose pas ce que
 * le serveur refuse (`motifRefusContrepartieCession`).
 */
describe('la créance née d’une cession · fiches des comptes 41 et 48 de l’AUDCIF', () => {
  it('SYSCOHADA · une cession H.A.O. écarte les clients, une cession courante écarte le 485', () => {
    expect([
      contrepartieCessionProposee('SYSCOHADA', false, '41110000'),
      contrepartieCessionProposee('SYSCOHADA', false, '48510000'),
      contrepartieCessionProposee('SYSCOHADA', true, '48510000'),
      contrepartieCessionProposee('SYSCOHADA', true, '41410000'),
      contrepartieCessionProposee('SYSCOHADA', false, '52110000'),
      contrepartieCessionProposee('SYSCOHADA', true, '52110000'),
    ]).toEqual([false, true, false, true, true, true]);
  });

  it('SYCEBNL · rien n’est écarté, ses propres fiches n’ont pas été lues ici', () => {
    expect(contrepartieCessionProposee('SYCEBNL', false, '41110000')).toBe(true);
    expect(contrepartieCessionProposee('SYCEBNL', true, '48510000')).toBe(true);
  });

  it('le client porte les deux racines que le serveur refuse', () => {
    const serveur = readFileSync(join(__dirname, '../../../src/modules/immobilisations/comptes-du-bien.ts'), 'utf8');
    const debut = serveur.indexOf('export function motifRefusContrepartieCession');
    const corps = serveur.slice(debut, serveur.indexOf('\n}\n', debut));
    expect(corps).toContain("if (!cessionCourante && numeroContrepartie.startsWith('41'))");
    expect(corps).toContain("if (cessionCourante && numeroContrepartie.startsWith('485'))");
  });

  it('l’écran filtre la liste par cette règle et envoie la qualification au serveur', () => {
    const page = readFileSync(join(__dirname, '../pages/ImmobilisationsPage.tsx'), 'utf8');
    expect(page).toContain('contrepartieCessionProposee(utilisateur?.tenant.referentiel, sCessionCourante, c.numero)');
    expect(page).toContain("...(sType === 'CESSION' && syscohada ? { cessionCourante: sCessionCourante } : {})");
  });
});

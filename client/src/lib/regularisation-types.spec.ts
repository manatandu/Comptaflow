import { readFileSync } from 'fs';
import { join } from 'path';
import { estRattachement, naturesTiersProposees, porteUneCharge } from './regularisation-types';

/**
 * AUDIT FINAL F67 · l'écran des régularisations sert les cinq types du
 * serveur, et la nature du tiers que la table du serveur ouvre pour chacun.
 */
const racine = join(__dirname, '../../..');
const service = readFileSync(join(racine, 'src/modules/regularisation/regularisation.service.ts'), 'utf8');
const schema = readFileSync(join(racine, 'prisma/schema.prisma'), 'utf8');
const page = readFileSync(join(__dirname, '../pages/RegularisationPage.tsx'), 'utf8');

describe('F67 · les régularisations à l’écran', () => {
  it('l’écran propose chacun des types du serveur', () => {
    const bloc = /enum TypeRegularisation \{([\s\S]*?)\n\}/.exec(schema)![1];
    const types = bloc
      .split('\n')
      .map((l) => /^\s*([A-Z_]+)\b/.exec(l)?.[1])
      .filter((t): t is string => !!t);
    expect(types).toHaveLength(5);
    for (const t of types) expect([t, page.includes(`valeur: '${t}'`)]).toEqual([t, true]);
  });

  it('les natures proposées sont celles que la table du serveur ouvre, type par type', () => {
    const table = /const RATTACHEMENT[\s\S]*?= \{([\s\S]*?)\n\};/.exec(service)![1];
    const lignes = [...table.matchAll(/(\w+): \{ charge: '(\d*)', produit: '(\d*)'/g)];
    expect(lignes).toHaveLength(5);
    const ouvertes = (colonne: 2 | 3) => lignes.filter((l) => l[colonne] !== '').map((l) => l[1]).sort();
    expect([...naturesTiersProposees('CHARGE_A_PAYER')].sort()).toEqual(ouvertes(2));
    expect([...naturesTiersProposees('PRODUIT_A_RECEVOIR')].sort()).toEqual(ouvertes(3));
    expect(naturesTiersProposees('CHARGE_CONSTATEE_AVANCE')).toEqual([]);
  });

  it('le compte de gestion suit le type · charge en classe 6, produit en classe 7', () => {
    expect(porteUneCharge('CHARGE_A_PAYER')).toBe(true);
    expect(porteUneCharge('CHARGE_CONSTATEE_AVANCE')).toBe(true);
    expect(porteUneCharge('PRODUIT_A_RECEVOIR')).toBe(false);
    expect(porteUneCharge('SUBVENTION_PLURIANNUELLE')).toBe(false);
    expect(estRattachement('PRODUIT_A_RECEVOIR')).toBe(true);
    expect(estRattachement('PRODUIT_CONSTATE_AVANCE')).toBe(false);
  });

  it('la nature du tiers part avec la demande, et l’aperçu d’un rattachement n’est pas un prorata', () => {
    expect(page).toContain('...(estRattachement(type) && natureTiers ? { natureTiers } : {})');
    expect(page).toMatch(/simulation\?\.rattachement && \([\s\S]*?Rattaché entièrement à cet exercice/);
  });
});

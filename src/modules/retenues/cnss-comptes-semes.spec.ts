import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NATURES_RETENUES, compteRelevantDe } from './correspondance-retenues';

/**
 * AUDIT FINAL F115 · LA CNSS, ET ELLE SEULE, SOUS SA CLÉ. La prémisse se relit
 * dans les deux semis (règle sortie de F2b) · chaque compte de détail du 431
 * et du 432 est rangé dans UNE nature, et la retraite complémentaire ou
 * facultative ne l'est jamais sous la CNSS.
 */
const semis = (f: string) => readFileSync(join(__dirname, '..', 'comptes', f), 'utf8');
const detailsDe = (source: string, racine: RegExp) => [...source.matchAll(/'(43[12]\d{5})'/g)].map((m) => m[1]).filter((n) => racine.test(n));

const nature = (cle: string) => NATURES_RETENUES.find((n) => n.cle === cle)!;
const naturesDe = (numero: string) => NATURES_RETENUES.filter((n) => compteRelevantDe(numero, n)).map((n) => n.cle);

describe('F115 · la CNSS du registre des retenues, lue sur les deux plans semés', () => {
  const syscohada = semis('compte-seed-syscohada.ts');
  const sycebnl = semis('compte-seed.ts');

  it('chaque compte de détail du 431 et du 432 relève d’une nature et d’une seule', () => {
    for (const source of [syscohada, sycebnl]) {
      const comptes = detailsDe(source, /^43[12]/);
      expect(comptes.length).toBeGreaterThan(3);
      for (const n of comptes) expect(naturesDe(n)).toHaveLength(1);
    }
  });

  it('la retraite obligatoire est CNSS dans les deux plans · 4313 et 4321', () => {
    expect(syscohada).toContain("'43130000', 'Caisse de retraite obligatoire'");
    expect(sycebnl).toContain("'43210000', 'Caisses de retraite · obligatoire'");
    expect(compteRelevantDe('43130000', nature('cnss'))).toBe(true);
    expect(compteRelevantDe('43210000', nature('cnss'))).toBe(true);
  });

  it('les retraites complémentaires et facultatives ne sont pas la CNSS', () => {
    expect(syscohada).toContain("'43200000', 'Caisses de retraite complémentaire'");
    expect(syscohada).toContain("'43140000', 'Caisse de retraite facultative'");
    expect(sycebnl).toContain("'43220000', 'Caisses de retraite · complémentaire'");
    for (const n of ['43200000', '43140000', '43220000', '43280000']) {
      expect(naturesDe(n)).toEqual(['autresOrganismesSociaux']);
    }
  });
});

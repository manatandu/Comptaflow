import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ecartDuDecompte, elementsDuBulletin, montantAffiche, retenuesDuBulletin } from './bulletin-affiche';

describe('Bulletin émis · ce qui se lit (audit final F20, F21, F22)', () => {
  it('un bulletin en dollars montre ses francs de conversion, rang pour rang, sans jamais formater du vide', () => {
    const entree = {
      elements: [
        { nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantUsd: 400 },
        { nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantUsd: 100 },
      ],
    };
    const calcul = { conversion: { elements: [{ montantUsd: 400, montantFc: 1_000_000 }, { montantUsd: 100, montantFc: 250_000 }] } };
    expect({
      francs: elementsDuBulletin(entree, calcul).map((e) => [e.montantUsd, e.montantFc]),
      sansConversion: elementsDuBulletin(entree, {}).map((e) => montantAffiche(e.montantFc)),
    }).toEqual({ francs: [[400, 1_000_000], [100, 250_000]], sansConversion: ['·', '·'] });
  });

  it('l’avantage en nature est montré, et dit non versé', () => {
    const e = elementsDuBulletin({ elements: [{ nature: 'AVANTAGE_EN_NATURE', libelle: 'Véhicule', montantFc: 300_000 }] }, {});
    expect(e.map((x) => [x.montantFc, x.verse])).toEqual([[300_000, false]]);
  });

  it('les retenues d’avance ont leur ligne, et le décompte se solde sur le net avec elles seulement', () => {
    const calcul = { retenuesAvances: [{ libelle: 'Avance du 2026-02-01', littera: 'c', montantFc: 100_000 }] };
    const bulletin = { totalVerseFc: 1_400_000, cotisationsTravailleurFc: 50_000, irppFc: 100_000, netAPayerFc: 1_150_000, calcul };
    expect({
      lignes: retenuesDuBulletin(calcul),
      ecart: ecartDuDecompte(bulletin),
      sansLaRetenue: ecartDuDecompte({ ...bulletin, calcul: {} }),
    }).toEqual({
      lignes: [{ libelle: 'Avance du 2026-02-01', littera: 'c', montantFc: 100_000 }],
      ecart: 0,
      sansLaRetenue: 100_000,
    });
  });

  it('l’écran lit ces trois règles, et imprime une ligne par retenue d’avance', () => {
    const page = readFileSync(join(__dirname, '..', 'pages', 'BulletinsPaie.tsx'), 'utf8');
    expect([
      page.includes('elementsDuBulletin(ouvert.entree, ouvert.calcul)'),
      page.includes('retenuesDuBulletin(ouvert.calcul).map('),
      page.includes('ecartDuDecompte(ouvert)'),
      page.includes('const fc = montantAffiche;'),
    ]).toEqual([true, true, true, true]);
  });
});

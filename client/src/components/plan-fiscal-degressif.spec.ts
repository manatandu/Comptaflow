import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'OPTION DÉGRESSIVE À L'ÉCRAN · passe F12, constats B1 et B5.
 *
 * B1 · un bien mis en service avant le 1er janvier 2026 ne relève pas de la
 * loi n° 23/053 (art. 153) · le serveur rend le motif (`regimeAnterieur`),
 * et l'écran doit le montrer au lieu d'offrir une option que le serveur
 * refusera, ou un plan vide sans rien dire.
 *
 * B5 · la durée fiscale se PROPOSE depuis la nature du barème que le bien
 * porte (arrêté n° 013/2025, art. 2), et l'écart se signale (art. 4). La
 * règle vit UNE fois, au serveur · l'écran lit `natureBareme` et
 * `avertissements`, il ne recalcule rien.
 */

const source = readFileSync(join(__dirname, 'PlanFiscalDegressif.tsx'), 'utf8');

// Le corps de `charger`, de sa déclaration à l'effet qui l'appelle.
function corpsDeCharger(): string {
  const i = source.indexOf('const charger = () =>');
  const j = source.indexOf('useEffect(', i);
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return source.slice(i, j);
}

describe('PlanFiscalDegressif · borne de 2026 et nature du barème', () => {
  it('le chargement pré-remplit la durée depuis la nature du barème, sans écraser une saisie', () => {
    const charger = corpsDeCharger();
    expect(charger).toContain('p.natureBareme?.dureeAns');
    expect(charger).toMatch(/setOption\(\(o\) => \(o\.dureeFiscaleAns \? o : \{ \.\.\.o, dureeFiscaleAns: String\(proposee\) \}\)\)/);
  });

  it('le motif du régime antérieur s’affiche, et le formulaire d’option ne s’offre pas quand il est rendu', () => {
    expect(source).toContain('{plan.regimeAnterieur && <div className="text-warning">{plan.regimeAnterieur}</div>}');
    expect(source).toContain('{!plan.degressifFiscal && !plan.regimeAnterieur && peutEcrire && (');
  });

  it('les avertissements du serveur s’affichent tels quels', () => {
    expect(source).toMatch(/plan\.avertissements\?\.map\(\(a\) => \(\s*<div key=\{a\} className="text-warning">\s*\{a\}/);
  });
});

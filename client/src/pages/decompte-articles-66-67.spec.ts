import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A9 · Code du travail, art. 66 (départ à mi-préavis) et art. 67 (nouvel
 * emploi). On gèle ce que l'écran PROPOSE et ENVOIE · le serveur tranche.
 */
const page = readFileSync(join(__dirname, 'PersonnelPage.tsx'), 'utf8');

/** Le bloc qui commence à `debut` et se ferme sur `fin`. */
function bloc(texte: string, debut: string, fin: string): string {
  const i = texte.indexOf(debut);
  expect(i).toBeGreaterThan(0);
  return texte.slice(i, texte.indexOf(fin, i));
}

describe('A9 · les deux départs anticipés du travailleur qui reçoit le préavis', () => {
  it("propose les deux départs, réservés au préavis donné par l'employeur", () => {
    const choix = bloc(page, 'value={dec.executionPreavis}', '</select>');
    expect(choix).toMatch(/value="DEPART_A_MI_PREAVIS" disabled=\{dec\.initiative !== 'EMPLOYEUR'\}/);
    expect(choix).toMatch(/value="DEPART_POUR_NOUVEL_EMPLOI" disabled=\{dec\.initiative !== 'EMPLOYEUR'\}/);
  });

  it('envoie les faits nouveaux, et une justification non déclarée part VIDE, jamais « non »', () => {
    const corps = bloc(page, 'const corpsDecompte = () => {', '\n  };');
    expect(corps).toContain('avantagesEnNatureRestantsFc: nombre(dec.avantagesEnNatureRestantsFc)');
    expect(corps).toContain('delaiDepartNouvelEmploiJours: nombre(dec.delaiDepartNouvelEmploiJours)');
    expect(corps).toContain("nouvelEmploiJustifie: dec.nouvelEmploiJustifie === '' ? undefined : dec.nouvelEmploiJustifie === 'OUI'");
  });

  it('demande les jours restant à courir au départ pour un nouvel emploi, et le délai en jours de calendrier (B1, M7)', () => {
    const bloc67 = bloc(page, "dec.executionPreavis === 'DEPART_POUR_NOUVEL_EMPLOI' && (", '</>');
    expect(bloc67).toContain('Jours restant à courir');
    expect(bloc67).toContain('value={dec.joursPreavisNonObserves}');
    expect(bloc67).toContain('Délai convenu (jours de calendrier)');
  });

  it('ne ventile les avantages du préavis que là où sa rubrique en porte (M2)', () => {
    expect(page).toContain(
      'const preavisAvecAvantages = preavisPorteDesAvantages(dec.executionPreavis, dec.partieResponsable, dec.initiative);',
    );
    expect(page).toContain('avantagesDuPreavisFc > 0');
  });

  it('demande la justification sans réponse présélectionnée', () => {
    const choix = bloc(page, 'value={dec.nouvelEmploiJustifie}', '</select>');
    expect(choix).toContain('<option value="">Non déclaré</option>');
  });
});

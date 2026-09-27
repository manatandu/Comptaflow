import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F49 · LA GRILLE PORTE LA DEVISE D'UNE LIGNE, JUSQU'AU SERVEUR.
 *
 * Une colonne qu'aucun écran ne renseigne reste nulle · la réévaluation de
 * clôture ne trouvait aucune position et le lettrage aucun écart de change.
 * Ce spec découpe les corps concernés de SaisiePage et y cherche la propriété
 * (§ 10 · un test de source s'ancre sur une structure).
 */

const page = readFileSync(join(__dirname, 'SaisiePage.tsx'), 'utf8');

/** Le texte entre `debut` et le premier `fin` qui le suit. */
function corps(debut: string, fin: string): string {
  const i = page.indexOf(debut);
  expect(i).toBeGreaterThanOrEqual(0);
  const j = page.indexOf(fin, i + debut.length);
  expect(j).toBeGreaterThan(i);
  return page.slice(i, j);
}

describe('F49 · la saisie d’une ligne en devise', () => {
  it('les devises proposées sont celles du dossier, sans la monnaie de tenue', () => {
    expect(page).toMatch(/api\.get<DeviseDuDossier\[\]>\('\/devises'\)\.then\(\s*\(ds\) => setDevises\(devisesEtrangeres\(ds\)\)/);
  });

  it('la ligne validée emporte l’opération en devise, vérifiée avant', () => {
    const valider = corps('const validerLigne = () => {', 'setCompteChoisi(null);');
    expect(valider).toContain('motifLigneEnDevise(');
    expect(valider).toContain('...enDevise,');
    // Et la ligne suivante repart en francs.
    const apres = corps('setCompteChoisi(null);', 'compteRef.current?.focus();');
    expect(apres).toContain("setDeviseSaisie('');");
  });

  it('la pièce envoyée porte devise, montant et cours de chaque ligne', () => {
    const envoi = corps("await api.post('/ecritures', {", 'setSucces(');
    for (const champ of ['deviseId: l.deviseId', 'montantDevise: l.montantDevise', 'coursApplique: l.coursApplique']) {
      expect(envoi).toContain(champ);
    }
  });

  it('une ligne dupliquée sans son montant perd aussi sa devise', () => {
    const dupliquer = corps('const dupliquerLigne = (i: number) => {', 'return copie;');
    expect(dupliquer).toContain('...SANS_DEVISE');
    const ctrlD = corps("if (touche === 'd') {", "} else if (touche === 'k')");
    expect(ctrlD).toContain('...SANS_DEVISE');
  });
});

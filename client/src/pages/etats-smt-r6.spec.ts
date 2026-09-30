import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Aucun import de « vitest » (globales) · convention du dépôt. L'écran se
// vérifie sur sa SOURCE, comme ses voisins (`etats-smt-note4-f258.spec.ts`).
// Chaque test gèle une PRÉSENCE : ce que l'écran doit lire pour montrer ce
// que le serveur sert depuis la passe R6.

const page = readFileSync(join(__dirname, 'EtatsSmtPage.tsx'), 'utf8');

describe('états S.M.T SYCEBNL · passe R6 à l’écran', () => {
  it('le compte de résultat porte les colonnes NOTE et EXERCICE N-1 de la maquette', () => {
    // Partie 4, ch. 4, section 2 : « REF | LIBELLES | NOTE | MONTANT
    // (Exercice N ; Exercice N-1) » ; SYCEBNL art. 16, 7°.
    expect(page).toContain("entete(['REF', 'LIBELLÉ', 'NOTE', 'EXERCICE N', 'EXERCICE N-1'], GRILLE_CR)");
    expect(page).toContain('{p.note ?? \'\'}');
    expect(page).toContain('{montant(p.montantN1)}');
    expect(page).toContain('{montant(r.montantN1)}');
    expect(page).toContain('cr.resultatNet, cr.resultatNetN1)');
  });

  it('l’infobulle de la NOTE 4 montre les libellés du côté de l’opération, jamais la clé', () => {
    expect(page).toContain(
      "(o.sens === 'RECETTE' ? journalNote4.colonnesRecettes : journalNote4.colonnesDepenses)",
    );
    expect(page).toContain('`${c.libelle} : ${montant(o.ventilation[c.cle])}`');
    expect(page).toContain('Ventilation de la NOTE 4');
  });

  it('la fiche récapitulative coche A ou N/A selon les notes applicables servies', () => {
    expect(page).toContain('notes.applicables.includes(n.numero)');
    expect(page).toContain('title="Non applicable">N/A</span>');
  });

  it('la Note 1 sépare les biens sortis et nomme les comptes que GA porte hors des fiches', () => {
    expect(page).toContain('notes.note1.sortiesDeLExercice.map(ligneNote1)');
    expect(page).toContain('notes.note1.ecartsGA.map(');
    expect(page).toContain("l.origine === 'REGISTRE' ? 'Non mis en service' : '·'");
  });

  it('la Note 3 porte les dépréciations en déduction et les créances nettes (poste GC)', () => {
    expect(page).toContain('notes.note3.depreciationsCreances.map(');
    expect(page).toContain('{montant(notes.note3.totalCreancesNettes)}');
  });

  it('la Note 5 montre le 106 hors rubriques, le poste HA, la quatrième colonne et le motif des deux colonnes', () => {
    expect(page).toContain('notes.note5.horsRubriques.map(');
    expect(page).toContain('{montant(notes.note5.totalPosteHA)}');
    expect(page).toContain('title="Préciser avec droit d\'entrée ou sans droit d\'entrée"');
    expect(page).toContain('{notes.note5.motifColonnesNonTenues}');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// La recherche d'écritures (Sage i7) vit dans le panneau de filtres du
// journal · on gèle la PRÉSENCE des critères dans la requête envoyée, qui est
// la même pour la fenêtre et pour son export.
describe("Recherche d'écritures · le panneau du journal", () => {
  const src = readFileSync(join(__dirname, 'JournalPage.tsx'), 'utf8');
  it('envoie compte, montant, fourchette, pièce et référence', () => {
    expect(src).toMatch(/\['compte', 'montant', 'montantMax', 'numeroPiece', 'reference'\] as const/);
    for (const cle of ['compte', 'montant', 'montantMax', 'numeroPiece', 'reference']) {
      expect(src).toMatch(new RegExp(`value=\\{filtres\\.${cle}\\}`));
    }
  });

  it("ne dit « actif » que si un filtre s'écarte des filtres vides, case du brouillard comprise", () => {
    expect(src).toMatch(/filtresAppliques\[k\] !== FILTRES_VIDES\[k\]/);
  });
});

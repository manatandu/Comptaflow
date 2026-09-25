import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// La réimputation part d'une recherche filtrée sur un compte · on gèle la
// PRÉSENCE du câblage, jamais une absence de mot.
describe('Réimputation · à l’écran', () => {
  const journal = readFileSync(join(__dirname, '..', 'pages', 'JournalPage.tsx'), 'utf8');
  const modale = readFileSync(join(__dirname, 'ModaleReimputation.tsx'), 'utf8');
  it("ne s'ouvre que sur un filtre de compte, pour qui peut valider", () => {
    expect(journal).toMatch(/peutValider && filtresAppliques\.compte\.trim\(\) && \(/);
    expect(journal).toMatch(/racineCompte=\{filtresAppliques\.compte\.trim\(\)\}/);
  });
  it('envoie les lignes cochées, le compte cible et le motif, cases décochées au départ', () => {
    expect(modale).toMatch(/'\/ecritures\/reimputation'/);
    expect(modale).toMatch(/\{ ligneIds: \[\.\.\.cochees\], compteCibleId: cibleId, date, motif \}/);
    expect(modale).toMatch(/useState<Set<string>>\(new Set\(\)\)/);
  });
});

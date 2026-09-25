import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// La fusion est proposée là où l'on supprime · on gèle la PRÉSENCE du câblage.
describe('Fusion de structures · à l’écran', () => {
  const lire = (f: string) => readFileSync(join(__dirname, '..', 'pages', f), 'utf8');
  it('le plan comptable fusionne deux comptes de détail de même classe, motif compris', () => {
    const src = lire('PlanComptesPage.tsx');
    expect(src).toMatch(/'\/ecritures\/fusion-comptes'/);
    expect(src).toMatch(/c\.classe === selection\.classe/);
    expect(src).toMatch(/<ModaleFusion[\s\S]*?avecMotif\n/);
  });
  it('le plan des tiers fusionne un doublon de même type dans la fiche conservée', () => {
    const src = lire('TiersPage.tsx');
    expect(src).toMatch(/`\/tiers\/\$\{tiersSelectionne\.id\}\/fusion\/\$\{cibleId\}`/);
    expect(src).toMatch(/t\.type === tiersSelectionne\.type/);
  });
});

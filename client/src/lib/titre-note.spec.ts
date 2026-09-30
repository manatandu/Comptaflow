import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sousTitreDuTableau } from './titre-note';

describe('sousTitreDuTableau · le nom du tableau sous le titre de la note (passe R6)', () => {
  it('une note à plusieurs tableaux montre le nom du tableau', () => {
    expect(
      sousTitreDuTableau({
        titreNote: 'ACTIF CIRCULANT ET DETTES CIRCULANTES HAO',
        sousTableau: 'ACTIF CIRCULANT HAO',
        titre: 'ACTIF CIRCULANT HAO',
      }),
    ).toBe('ACTIF CIRCULANT HAO');
  });

  it('une note à un seul tableau n’a pas de sous-titre', () => {
    expect(sousTitreDuTableau({ titreNote: 'DISPONIBILITES', titre: 'DISPONIBILITES' })).toBeNull();
  });

  it('un sous-titre égal au titre de la note ne se répète pas', () => {
    expect(sousTitreDuTableau({ titreNote: 'X', sousTableau: 'X', titre: 'X' })).toBeNull();
  });

  it('sans titre de note (jeu SYSCOHADA), le titre du tableau tient lieu de titre', () => {
    expect(sousTitreDuTableau({ titre: 'IMMOBILISATIONS BRUTES' })).toBeNull();
  });
});

describe('la colonne « Note » imprime le renvoi à l’écran (passe R6)', () => {
  it('le rendu lit porteLeRenvoi et y écrit le renvoi de la ligne', () => {
    const source = readFileSync(join(__dirname, '../components/NotesAnnexesRendu.tsx'), 'utf8');
    expect(source).toMatch(/c\.porteLeRenvoi\s*\n?\s*\?\s*\(ligne\.renvoi \?\? ''\)/);
  });
});

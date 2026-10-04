import { readFileSync } from 'fs';
import { join } from 'path';
import { naturesSortieOffertes } from './nature-sortie';

// Ligne A14 · l'écran n'offre que ce que le serveur admet
// (src/modules/immobilisations/nature-sortie.ts), et jamais l'échange, qui
// a son propre geste.
describe('natures de sortie offertes', () => {
  it('une cession · la vente seule, présélectionnable', () => {
    expect(naturesSortieOffertes({ type: 'CESSION', projetDeveloppement: false, usufruit: false })).toEqual(['VENTE']);
  });

  it('une mise hors service · rebut, destruction, vol, disparition', () => {
    expect(naturesSortieOffertes({ type: 'MISE_HORS_SERVICE', projetDeveloppement: false, usufruit: false })).toEqual([
      'MISE_AU_REBUT',
      'DESTRUCTION',
      'VOL',
      'DISPARITION',
    ]);
  });

  it('fin de projet · remise gratuite et restitution ; usufruit · restitution', () => {
    expect(naturesSortieOffertes({ type: 'MISE_HORS_SERVICE', projetDeveloppement: true, usufruit: false })).toContain('REMISE_GRATUITE');
    const usufruit = naturesSortieOffertes({ type: 'MISE_HORS_SERVICE', projetDeveloppement: false, usufruit: true });
    expect(usufruit).toContain('RESTITUTION');
    expect(usufruit).not.toContain('REMISE_GRATUITE');
  });

  it('le formulaire de sortie envoie nature et pièce', () => {
    const page = readFileSync(join(__dirname, '../pages/ImmobilisationsPage.tsx'), 'utf8');
    const corps = page.slice(page.indexOf('const onSortir = async'), page.indexOf("setInfo('Sortie enregistrée.')"));
    expect(corps).toMatch(/natureSortie,/);
    expect(corps).toMatch(/referencePieceSortie: sRefPiece/);
    expect(corps).toMatch(/datePieceSortie: sDatePiece/);
  });
});

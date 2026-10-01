import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fondsPreselectionne, messageFondsProjet, type CompteFondsProjet } from './fonds-projet-sortie';

const c = (id: string): CompteFondsProjet => ({ id, numero: id, intitule: id });

describe('Sortie de fin de projet · fonds affecté repris (SYCEBNL Partie 3 ch. 3 § 2.5)', () => {
  it('un seul compte ouvert se présélectionne', () => {
    expect(fondsPreselectionne([c('16200000')])).toBe('16200000');
  });

  it('plusieurs comptes, ou aucun, et rien n’est deviné · aucun solde ne décide', () => {
    expect(fondsPreselectionne([c('16200000'), c('16300000')])).toBeNull();
    expect(fondsPreselectionne([])).toBeNull();
  });

  it('null n’est pas vide · une liste non lue ne dit pas « aucun »', () => {
    expect(messageFondsProjet(null, null)).toContain('Lecture');
    expect(messageFondsProjet(null, 'refus')).toContain('illisibles');
    expect(messageFondsProjet({ projet: true, comptes: [], enSommeil: 0, motifVide: 'Ouvrez le 162' }, null)).toBe('Ouvrez le 162');
    expect(messageFondsProjet({ projet: true, comptes: [c('16200000')], enSommeil: 0, motifVide: null }, null)).toBeNull();
    expect(messageFondsProjet({ projet: true, comptes: [c('16200000')], enSommeil: 2, motifVide: null }, null)).toContain('sommeil');
  });

  it('l’écran lit la liste servie et présélectionne', () => {
    const page = readFileSync(join(__dirname, '../pages/ImmobilisationsPage.tsx'), 'utf8');
    expect(page).toContain("'/immobilisations/comptes-fonds-projet'");
    expect(page).toContain('fondsPreselectionne(r.comptes)');
    // Le motif est RENDU sous la liste · une liste vide muette était le défaut.
    expect(page).toContain('{messageFonds}');
  });
});

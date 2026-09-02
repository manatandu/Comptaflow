import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareCodesNotes } from './tri-notes';

// AUCUN import de « vitest » ici, volontairement · convention du dépôt (voir
// calcul.spec.ts et chrome-etroit.spec.ts) : describe/it/expect arrivent par
// les globales, ce qui rend le fichier exécutable par les DEUX lanceurs.

/**
 * Le tri des codes de notes annexes, côté client.
 *
 * Ce qui casserait EN SILENCE sans ces tests : une fiche récapitulative dont
 * les notes ne sortent pas dans l'ordre officiel. Rien ne lève d'erreur, rien
 * n'échoue à la compilation · l'écart ne se voit qu'en relisant la liasse
 * imprimée, note par note.
 */
describe('compareCodesNotes', () => {
  /**
   * L'ordre officiel n'est pas réécrit ici de mémoire : il est LU dans la
   * transcription du dépôt, `CODES_NOTES_CH6`, elle-même prise des en-têtes
   * du ch. 6 de l'AUDCIF (Titre IX, section 2 « Liste officielle des Notes
   * annexes »). Le tableau y est déjà dans l'ordre du texte.
   */
  const codesOfficielsSyscohada = (): string[] => {
    const src = readFileSync(
      join(__dirname, '../../../src/modules/etats-financiers-syscohada/correspondance-compte-resultat-syscohada.ts'),
      'utf8',
    );
    const bloc = /export const CODES_NOTES_CH6: readonly string\[\] = \[([\s\S]*?)\];/.exec(src);
    if (!bloc) throw new Error('CODES_NOTES_CH6 introuvable · le tri client ne peut plus être confronté à la liste officielle');
    return [...bloc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };

  it("restitue l'ordre officiel des 46 codes du ch. 6, quel que soit l'ordre reçu du serveur", () => {
    const officiels = codesOfficielsSyscohada();
    expect(officiels.length).toBe(46); // 46 codes pour 36 numéros de note
    // Mélange déterministe (pas de hasard dans un test) : l'ordre inverse,
    // le pire cas possible pour un tri.
    const melanges = [...officiels].reverse();
    expect([...melanges].sort(compareCodesNotes)).toEqual(officiels);
  });

  it('classe « 16B bis » entre 16B et 16C, et non après la note 36', () => {
    // Le défaut que ce test empêche : un suffixe restreint aux lettres
    // ([A-Za-z]*) ne reconnaît pas « 16B bis » · le code tombait alors dans
    // la branche de secours (MAX_SAFE_INTEGER) et s'affichait en dernier.
    expect(['36', '16C', '16B bis', '16B', '16A'].sort(compareCodesNotes)).toEqual([
      '16A',
      '16B',
      '16B bis',
      '16C',
      '36',
    ]);
  });

  it('trie par NUMÉRO et non par chaîne · 2 avant 10, 15B avant 16A', () => {
    // Un tri alphabétique brut donnerait 1, 10, 15B, 2 : c'est le défaut
    // classique, et il passe inaperçu tant que la liasse ne dépasse pas
    // neuf notes.
    expect(['10', '2', '16A', '15B', '1'].sort(compareCodesNotes)).toEqual(['1', '2', '10', '15B', '16A']);
  });

  it('rend aux codes SYCEBNL exactement le même ordre qu\'avant l\'extraction', () => {
    // L'écran SYCEBNL partage désormais ce tri : il ne doit rien changer
    // pour lui. Ses codes (Partie 4) n'ont pas d'espace.
    expect(['29B', '5H', '17A', '5A', '29A', '17B', '1'].sort(compareCodesNotes)).toEqual([
      '1',
      '5A',
      '5H',
      '17A',
      '17B',
      '29A',
      '29B',
    ]);
  });

  it('garde un code inattendu à la fin plutôt que de le perdre', () => {
    // Une note dont le code ne commencerait pas par un chiffre reste
    // affichée · un tri ne doit jamais faire disparaître une ligne.
    const trie = ['3A', 'ANNEXE', '1'].sort(compareCodesNotes);
    expect(trie).toEqual(['1', '3A', 'ANNEXE']);
  });
});

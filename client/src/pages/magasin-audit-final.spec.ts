import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F133 · la fenêtre Magasin annule un mouvement avec son motif,
 * et montre la ligne annulée au lieu de la taire. Chaque test découpe le bloc
 * qui porte la propriété, jamais une distance fixe.
 */
const page = readFileSync(join(__dirname, 'MagasinPage.tsx'), 'utf8');

function bloc(debut: string, fin: string): string {
  const i = page.indexOf(debut);
  expect(i).toBeGreaterThan(0);
  return page.slice(i, page.indexOf(fin, i));
}

describe('F133 · l’annulation motivée d’un mouvement', () => {
  it('l’envoi porte le motif, vers la route d’annulation du mouvement', () => {
    const envoi = bloc('const annulerMouvement = async', 'const ajouterMouvement = async');
    expect(envoi).toContain('`/magasin/articles/${selection}/mouvements/${aAnnuler.id}/annulation`');
    expect(envoi).toContain('{ motif: aAnnuler.motif.trim() }');
  });

  it('le bouton n’est offert qu’à qui écrit, et jamais sur une ligne déjà annulée', () => {
    expect(page).toContain('{peutEcrire && !l.annuleLe && aAnnuler?.id !== l.id && (');
  });

  it('la ligne annulée reste, avec sa date, son motif et l’écriture restée au journal', () => {
    const ligne = bloc('{fiche.lignes.map((l) => (', '</tbody>');
    expect(ligne).toContain("className={l.annuleLe ? 'line-through text-text-dim' : undefined}");
    expect(ligne).toContain('(annulé le {l.annuleLe}');
    expect(ligne).toContain('{l.ecritureACorriger && (');
  });
});

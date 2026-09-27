import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F95 · l'écran des documents obligatoires imprimait l'article 14
 * du SYCEBNL et la sanction de son article 24 à une société, et fermait la
 * fenêtre des événements postérieurs sur « (art. 16-3) ». L'article vient du
 * serveur (`fondement`, `fenetreEvenementsPosterieurs.article`) · chaque test
 * découpe le bloc qui le lit, jamais une distance fixe.
 */
const page = readFileSync(join(__dirname, 'DocumentsObligatoiresPage.tsx'), 'utf8');

/** Le bloc qui commence à `debut` et se ferme sur `fin`. */
function bloc(debut: string, fin: string): string {
  const i = page.indexOf(debut);
  expect(i).toBeGreaterThan(0);
  return page.slice(i, page.indexOf(fin, i));
}

describe('F95 · le livre d’inventaire cite le texte du dossier', () => {
  it('l’onglet porte l’article servi par le serveur', () => {
    expect(bloc("'inventaire',", 'confInv?.complete')).toContain('confInv.fondement.article');
  });

  it('les états exigés portent l’article et le périmètre du dossier', () => {
    // Le libellé lui-même, pas seulement la bulle qui le suit.
    expect(bloc('ÉTATS EXIGÉS', '<Aide')).toContain('ÉTATS EXIGÉS · {confInv.fondement.article}');
    expect(bloc('titre="États exigés"', '/>')).toContain('confInv.fondement.perimetre');
  });

  it('la sanction pénale est celle du texte du dossier', () => {
    // Le texte de la bulle, pas seulement sa source.
    expect(bloc('titre="Sanction pénale"', 'source=')).toContain('confInv.fondement.sanction');
  });
});

describe('F95 · la fenêtre des événements postérieurs cite l’article du rapport', () => {
  it('l’article vient de la fenêtre elle-même', () => {
    expect(bloc('Fenêtre des événements postérieurs', '</div>')).toContain('confRap.fenetreEvenementsPosterieurs.article');
  });
});

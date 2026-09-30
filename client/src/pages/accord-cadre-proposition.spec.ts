import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F146 · l'écran affirmait « OmegaX ne détient aucun effectif »
 * alors que le registre du personnel calcule la part de main-d'œuvre
 * locale (art. 37, 4°) expressément pour cet engagement. La déclaration est désormais
 * PRÉ-REMPLIE par la proposition du serveur, et reste modifiable.
 */
const page = readFileSync(join(__dirname, 'AccordCadrePage.tsx'), 'utf8');

describe('F146 · la déclaration part de la proposition du registre', () => {
  it('la part proposée est la valeur par défaut de l’invite, la source suit', () => {
    const i = page.indexOf('async function declarerMainOeuvre');
    const corps = page.slice(i, page.indexOf('async function denoncer', i));
    expect(corps).toContain('const p = etat?.propositionMainOeuvre ?? null;');
    expect(corps).toContain('window.prompt(invite, proposee)');
    expect(corps).toContain("p?.part != null && part.trim() === proposee ? p.source : ''");
  });

  it('l’aide dit la règle en vigueur', () => {
    expect(page).toContain('le registre du personnel la propose sans la substituer');
  });
});

describe('D1-B4 · la dénonciation se lit à sa date de réception', () => {
  it('la colonne dit la date de RÉCEPTION, et une dénonciation tardive est dite sur la ligne', () => {
    // Modèle Kahasha, annexe VIII, art. IX · « Le préavis commence à courir
    // à la date de réception ».
    expect(page).toContain('Dénonciation reçue au plus tard le');
    expect(page).toMatch(
      /a\.etat\.denonciationHorsPreavis\s*\?\s*' · préavis de l’accord non respecté, l’effet dépend de l’accord signé'/,
    );
  });
});

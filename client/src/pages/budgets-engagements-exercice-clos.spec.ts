import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F143 · le serveur refuse de toucher au budget et aux
 * engagements d'un exercice clôturé ; l'écran ne propose donc pas le geste.
 * Chaque test découpe le bloc qui porte la propriété.
 */
const engagements = readFileSync(join(__dirname, 'EngagementsPage.tsx'), 'utf8');
const plans = readFileSync(join(__dirname, 'PlansAnalytiquesPage.tsx'), 'utf8');

describe('F143 · un exercice clôturé se lit, il ne se retouche pas', () => {
  it('les engagements · chaque geste passe par le droit ET l’exercice ouvert', () => {
    expect(engagements).toContain("const exerciceClos = exerciceCourant?.statut === 'CLOTURE';");
    expect(engagements).toContain('const modifiable = peutEcrire && !exerciceClos;');
    // Les six gestes de la fenêtre (créer, rattacher, clore, rouvrir,
    // supprimer, détacher) · un geste ajouté se range ici en le décidant.
    expect(engagements.match(/\{modifiable && /g)?.length).toBe(6);
  });

  it('le budget · la dotation et la retouche d’un mois aussi', () => {
    expect(plans).toContain("const budgetModifiable = estAdmin && exerciceCourant?.statut !== 'CLOTURE';");
    const i = plans.indexOf('Dotation budgétaire');
    const bloc = plans.slice(i, plans.indexOf('Aucune dotation sur cet exercice.', i));
    expect(bloc).toContain('{budgetModifiable && (');
    expect(bloc).toContain('{budgetModifiable ? (');
  });
});

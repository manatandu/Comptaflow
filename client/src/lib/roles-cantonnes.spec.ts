import { fenetreOuverteAuRole, peutEcrirePourRole, peutValiderPourRole } from './roles-cantonnes';

// Pas d'import de « vitest » · convention du dépôt (voir calcul.spec.ts).

describe('rôles cantonnés · ce que l’écran propose', () => {
  it('le gestionnaire de paie ne voit que le personnel', () => {
    expect(fenetreOuverteAuRole('/personnel', 'GESTIONNAIRE_PAIE')).toBe(true);
    expect(fenetreOuverteAuRole('/personnel?onglet=bulletins', 'GESTIONNAIRE_PAIE')).toBe(true);
    expect(fenetreOuverteAuRole('/comptes', 'GESTIONNAIRE_PAIE')).toBe(false);
    expect(fenetreOuverteAuRole('/brouillard', 'GESTIONNAIRE_PAIE')).toBe(false);
  });

  it('l’aide-comptable voit tout sauf le personnel', () => {
    expect(fenetreOuverteAuRole('/personnel', 'AIDE_COMPTABLE')).toBe(false);
    expect(fenetreOuverteAuRole('/saisie', 'AIDE_COMPTABLE')).toBe(true);
  });

  it('les trois rôles d’origine ne sont pas touchés', () => {
    for (const role of ['ADMIN_CABINET', 'COMPTABLE', 'LECTURE_SEULE'] as const) {
      expect(fenetreOuverteAuRole('/personnel', role)).toBe(true);
      expect(fenetreOuverteAuRole('/comptes', role)).toBe(true);
    }
  });

  it('saisir n’est pas valider', () => {
    expect([peutEcrirePourRole('AIDE_COMPTABLE'), peutValiderPourRole('AIDE_COMPTABLE')]).toEqual([true, false]);
    expect([peutEcrirePourRole('GESTIONNAIRE_PAIE'), peutValiderPourRole('GESTIONNAIRE_PAIE')]).toEqual([true, false]);
    expect([peutEcrirePourRole('COMPTABLE'), peutValiderPourRole('COMPTABLE')]).toEqual([true, true]);
    expect([peutEcrirePourRole('LECTURE_SEULE'), peutValiderPourRole('LECTURE_SEULE')]).toEqual([false, false]);
  });
});

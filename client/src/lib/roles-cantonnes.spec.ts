import {
  cotationBorneeAuCoursDuJour,
  DEVISE_COTEE_PAR_LA_PAIE,
  fenetreOuverteAuRole,
  jourDeKinshasaIso,
  peutEcrirePourRole,
  peutValiderPourRole,
} from './roles-cantonnes';

// Pas d'import de « vitest » · convention du dépôt (voir calcul.spec.ts).

describe('rôles cantonnés · ce que l’écran propose', () => {
  it('le gestionnaire de paie ne voit que le personnel', () => {
    expect(fenetreOuverteAuRole('/personnel', 'GESTIONNAIRE_PAIE')).toBe(true);
    expect(fenetreOuverteAuRole('/personnel?onglet=bulletins', 'GESTIONNAIRE_PAIE')).toBe(true);
    expect(fenetreOuverteAuRole('/comptes', 'GESTIONNAIRE_PAIE')).toBe(false);
    expect(fenetreOuverteAuRole('/brouillard', 'GESTIONNAIRE_PAIE')).toBe(false);
  });

  it('le gestionnaire de paie ouvre Devises pour le cours du jour, et rien d’autre (audit final F247)', () => {
    // Sa paie en dollars exige le cours de l'USD du jour · la fenêtre lui
    // était fermée, et le refus du calcul l'y renvoyait.
    expect(fenetreOuverteAuRole('/devises', 'GESTIONNAIRE_PAIE')).toBe(true);
    expect(fenetreOuverteAuRole('/devises-et-autre', 'GESTIONNAIRE_PAIE')).toBe(false);
    expect(fenetreOuverteAuRole('/regularisations', 'GESTIONNAIRE_PAIE')).toBe(false);
    expect(cotationBorneeAuCoursDuJour('GESTIONNAIRE_PAIE')).toBe(true);
    expect(DEVISE_COTEE_PAR_LA_PAIE).toBe('USD');
  });

  it('ouvrir Devises au gestionnaire ne la ferme pas à l’aide-comptable, qui la garde entière', () => {
    // ADRESSES_PAIE sert aussi à fermer le personnel à l'aide · y verser
    // Devises la lui aurait retirée.
    expect(fenetreOuverteAuRole('/devises', 'AIDE_COMPTABLE')).toBe(true);
    for (const role of ['ADMIN_CABINET', 'COMPTABLE', 'AIDE_COMPTABLE', 'LECTURE_SEULE'] as const) {
      expect([role, cotationBorneeAuCoursDuJour(role)]).toEqual([role, false]);
    }
  });

  it('le jour coté est celui de Kinshasa · à 23 h 30 UTC le 27, c’est déjà le 28', () => {
    expect(jourDeKinshasaIso(new Date('2026-09-27T23:30:00Z'))).toBe('2026-09-28');
    expect(jourDeKinshasaIso(new Date('2026-09-28T09:00:00Z'))).toBe('2026-09-28');
    expect(jourDeKinshasaIso(new Date('2026-09-27T22:59:00Z'))).toBe('2026-09-27');
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

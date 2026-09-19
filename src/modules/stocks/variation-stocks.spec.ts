import { Referentiel } from '@prisma/client';
import {
  lignesDeLEcriture,
  proposerVariations,
  totaux,
  type CompteAVarier,
} from './variation-stocks';

/**
 * LA VARIATION DE STOCKS · ce que le compte de résultat attendait et que rien
 * ne produisait.
 *
 * Les cas chiffrés suivent le schéma que les deux textes écrivent mot pour
 * mot au fonctionnement de leurs comptes de stock : annulation du stock
 * initial POUR SOLDE, puis constatation du stock final.
 */

const compte = (over: Partial<CompteAVarier> = {}): CompteAVarier => ({
  numero: '31100000',
  intitule: 'Marchandises A',
  soldeInitial: 0,
  stockFinal: 0,
  source: "Campagne d'inventaire 2026",
  ...over,
});

describe('Variation de stocks · le schéma des deux textes', () => {
  it('annule le stock initial POUR SOLDE, puis constate le stock final', () => {
    const p = proposerVariations(
      [compte({ soldeInitial: 300_000, stockFinal: 450_000 })],
      Referentiel.SYSCOHADA,
    );
    expect(p.retenues).toHaveLength(1);
    expect(p.retenues[0].lignes).toEqual([
      expect.objectContaining({ compte: '31100000', sens: 'CREDIT', montant: 300_000 }),
      expect.objectContaining({ compte: '6031', sens: 'DEBIT', montant: 300_000 }),
      expect.objectContaining({ compte: '31100000', sens: 'DEBIT', montant: 450_000 }),
      expect.objectContaining({ compte: '6031', sens: 'CREDIT', montant: 450_000 }),
    ]);
  });

  it('l’écriture est ÉQUILIBRÉE par construction, sur plusieurs comptes', () => {
    const p = proposerVariations(
      [
        compte({ numero: '31100000', soldeInitial: 300_000, stockFinal: 450_000 }),
        compte({ numero: '32100000', soldeInitial: 1_200_000, stockFinal: 900_000 }),
        compte({ numero: '33100000', soldeInitial: 0, stockFinal: 75_000 }),
      ],
      Referentiel.SYSCOHADA,
    );
    const t = totaux(lignesDeLEcriture(p));
    expect(t.debit).toBe(t.credit);
    expect(t.debit).toBeGreaterThan(0);
  });

  it('LA FORME EST BRUTE, PAS NETTE · le stock initial est réellement soldé', () => {
    // Les deux textes admettent la forme nette, mais ils écrivent « POUR
    // SOLDE ». Une variation nette de 150 000 laisserait les 300 000 du stock
    // initial au bilan, sur un compte que le texte veut vidé.
    const p = proposerVariations(
      [compte({ soldeInitial: 300_000, stockFinal: 450_000 })],
      Referentiel.SYSCOHADA,
    );
    const surLeStock = p.retenues[0].lignes.filter((l) => l.compte === '31100000');
    expect(surLeStock).toHaveLength(2);
    expect(surLeStock.some((l) => l.montant === 150_000)).toBe(false);
  });

  it('un stock qui n’a jamais rien porté ne produit AUCUNE ligne', () => {
    const p = proposerVariations([compte({ soldeInitial: 0, stockFinal: 0 })], Referentiel.SYSCOHADA);
    expect(p.retenues).toHaveLength(0);
    expect(p.sansMouvement).toEqual(['31100000']);
  });

  it('un stock entièrement consommé solde le compte et ne constate rien', () => {
    const p = proposerVariations(
      [compte({ soldeInitial: 500_000, stockFinal: 0 })],
      Referentiel.SYSCOHADA,
    );
    expect(p.retenues[0].lignes).toEqual([
      expect.objectContaining({ compte: '31100000', sens: 'CREDIT', montant: 500_000 }),
      expect.objectContaining({ compte: '6031', sens: 'DEBIT', montant: 500_000 }),
    ]);
  });
});

describe('Variation de stocks · le référentiel commande, et il commande tout', () => {
  it('le MÊME 31 part au 6031 des deux côtés, sous deux intitulés différents', () => {
    const societe = proposerVariations(
      [compte({ soldeInitial: 100, stockFinal: 200 })],
      Referentiel.SYSCOHADA,
    );
    const association = proposerVariations(
      [compte({ soldeInitial: 100, stockFinal: 200 })],
      Referentiel.SYCEBNL,
    );
    expect(societe.retenues[0].correspondance.intitule).toBe('Marchandises');
    expect(association.retenues[0].correspondance.intitule).toBe("Biens liés à l'activité");
  });

  it('le 32 du SYCEBNL se sépare · marchandises au 6032, matières au 6033', () => {
    const p = proposerVariations(
      [
        compte({ numero: '32100000', soldeInitial: 0, stockFinal: 10 }),
        compte({ numero: '32300000', soldeInitial: 0, stockFinal: 20 }),
      ],
      Referentiel.SYCEBNL,
    );
    expect(p.retenues[0].correspondance.variation).toBe('6032');
    expect(p.retenues[1].correspondance.variation).toBe('6033');
  });

  it('le 34 est un stock au SYSCOHADA et un DON EN NATURE au SYCEBNL', () => {
    // Le piège dans sa forme la plus coûteuse : le même numéro, deux
    // mécanismes comptables entièrement différents.
    const societe = proposerVariations(
      [compte({ numero: '34100000', soldeInitial: 0, stockFinal: 50 })],
      Referentiel.SYSCOHADA,
    );
    expect(societe.retenues[0].correspondance.variation).toBe('7341');

    const association = proposerVariations(
      [compte({ numero: '34100000', soldeInitial: 0, stockFinal: 50 })],
      Referentiel.SYCEBNL,
    );
    expect(association.retenues).toHaveLength(0);
    expect(association.refusees[0].motif).toBe('HORS_VARIATION_AUTOMATIQUE');
    expect(association.refusees[0].explication).toContain('EXTOURNÉES');
  });
});

describe('Variation de stocks · les refus, et ce qu’ils empêchent', () => {
  it('PAS ENCORE COMPTÉ n’est pas ZÉRO', () => {
    // Lu comme zéro, le stock entier partirait en charge et le résultat
    // serait faux du montant du stock, sur une écriture équilibrée.
    const p = proposerVariations(
      [compte({ soldeInitial: 800_000, stockFinal: null })],
      Referentiel.SYSCOHADA,
    );
    expect(p.retenues).toHaveLength(0);
    expect(p.refusees[0].motif).toBe('STOCK_FINAL_NON_COMPTE');
    expect(p.refusees[0].explication).toContain('inventaire extra-comptable');
  });

  it('un stock final NÉGATIF est refusé', () => {
    const p = proposerVariations([compte({ stockFinal: -5 })], Referentiel.SYSCOHADA);
    expect(p.refusees[0].motif).toBe('STOCK_FINAL_NEGATIF');
  });

  it('un montant sans SOURCE est refusé · c’est elle que le réviseur demande', () => {
    const p = proposerVariations(
      [compte({ stockFinal: 1_000, source: '   ' })],
      Referentiel.SYSCOHADA,
    );
    expect(p.refusees[0].motif).toBe('SOURCE_ABSENTE');
  });

  it('un compte qui n’est pas un stock de CE référentiel est refusé et NOMMÉ', () => {
    const p = proposerVariations(
      [compte({ numero: '60110000', stockFinal: 10 })],
      Referentiel.SYSCOHADA,
    );
    expect(p.refusees[0].motif).toBe('PAS_UN_COMPTE_DE_STOCK');
    expect(p.refusees[0].explication).toContain('ne se transposent pas');
  });

  it('UN REFUS N’EMPORTE PAS LES AUTRES COMPTES', () => {
    // Un dossier à dix comptes dont un seul n'est pas compté doit voir les
    // neuf autres · sinon le comptable ne sait pas par où commencer.
    const p = proposerVariations(
      [
        compte({ numero: '31100000', soldeInitial: 100, stockFinal: null }),
        compte({ numero: '32100000', soldeInitial: 200, stockFinal: 300 }),
      ],
      Referentiel.SYSCOHADA,
    );
    expect(p.refusees).toHaveLength(1);
    expect(p.retenues).toHaveLength(1);
    expect(p.retenues[0].numero).toBe('32100000');
  });

  it('un solde CRÉDITEUR sur un stock est signalé, pas refusé', () => {
    // Aucun texte lu ne le traite. La variation reste calculable ; le taire
    // figerait une imputation fautive dans les états.
    const p = proposerVariations(
      [compte({ soldeInitial: -40_000, stockFinal: 10_000 })],
      Referentiel.SYSCOHADA,
    );
    expect(p.retenues).toHaveLength(1);
    expect(p.avertissements[0]).toContain('CRÉDITEUR');
    // Et l'annulation prend le sens inverse, sinon l'écriture se déséquilibre.
    expect(p.retenues[0].lignes[0]).toEqual(
      expect.objectContaining({ compte: '31100000', sens: 'DEBIT', montant: 40_000 }),
    );
    const t = totaux(lignesDeLEcriture(p));
    expect(t.debit).toBe(t.credit);
  });
});

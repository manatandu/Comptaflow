import { lignesNoteStocks, motifQuantitesNote2 } from './stocks-depuis-inventaire';

/**
 * AUDIT FINAL F85 · la note 2 du SMT sert les quantités de l'inventaire
 * physique du dossier, sans jamais laisser ses lignes diverger du total du
 * bilan.
 */
const CAMPAGNE = (fiches: Array<{ compte: string; q: number | null; v: number | null; d?: string }>) => ({
  libelle: 'Inventaire de clôture',
  dateInventaire: new Date('2026-12-31T00:00:00Z'),
  fiches: fiches.map((f) => ({
    compteNumero: f.compte,
    designation: f.d ?? 'Article',
    uniteMesure: null,
    quantiteComptee: f.q,
    valeurInventaire: f.v,
  })),
});

describe('lignesNoteStocks', () => {
  it('une fiche non comptée ou non valorisée garde la ligne du compte', () => {
    const note = lignesNoteStocks(
      [{ numero: '31100000', intitule: 'Marchandises', montant: 3000 }],
      CAMPAGNE([
        { compte: '31100000', q: 10, v: 1000 },
        { compte: '31100000', q: null, v: 2000 },
      ]),
    );
    expect(note.lignes).toEqual([
      { reference: '31100000', designation: 'Marchandises', quantite: null, prixUnitaire: null, montant: 3000 },
    ]);
    expect(note.manques[0]).toContain('non comptée(s) ou non valorisée(s)');
    expect(note.quantitesTenues).toBe(false);
  });

  it('une valeur sans quantité n’est pas un comptage', () => {
    const note = lignesNoteStocks(
      [{ numero: '31100000', intitule: 'Marchandises', montant: 1000 }],
      CAMPAGNE([{ compte: '31100000', q: 10, v: null }]),
    );
    expect(note.lignes[0].quantite).toBeNull();
    expect(note.quantitesTenues).toBe(false);
  });

  it('une quantité nulle n’a pas de prix unitaire · jamais l’infini sur un état', () => {
    const note = lignesNoteStocks(
      [{ numero: '31100000', intitule: 'Marchandises', montant: 0 }],
      CAMPAGNE([{ compte: '31100000', q: 0, v: 0 }]),
    );
    expect(note.lignes).toEqual([
      { reference: '31100000', designation: 'Article', quantite: 0, prixUnitaire: null, montant: 0 },
    ]);
  });

  it('une dépréciation (39) reste sans quantité, sans compter comme un manque', () => {
    const note = lignesNoteStocks(
      [
        { numero: '31100000', intitule: 'Marchandises', montant: 3000 },
        { numero: '39100000', intitule: 'Dépréciations', montant: -500 },
      ],
      CAMPAGNE([{ compte: '31100000', q: 30, v: 3000 }]),
    );
    expect(note.lignes.map((l) => l.reference)).toEqual(['31100000', '39100000']);
    expect(note.lignes[1].quantite).toBeNull();
    expect(note.quantitesTenues).toBe(true);
  });

  it('un compte soldé sans fiche n’est pas un manque, un compte chiffré sans fiche en est un', () => {
    const note = lignesNoteStocks(
      [
        { numero: '31100000', intitule: 'Marchandises', montant: 0 },
        { numero: '32100000', intitule: 'Matières', montant: 800 },
      ],
      CAMPAGNE([]),
    );
    expect(note.manques).toEqual(['32100000, aucune fiche dans la campagne']);
  });

  it('le total des lignes est toujours celui des comptes', () => {
    const comptes = [
      { numero: '31100000', intitule: 'Marchandises', montant: 3000 },
      { numero: '32100000', intitule: 'Matières', montant: 800 },
    ];
    const note = lignesNoteStocks(
      comptes,
      CAMPAGNE([
        { compte: '31100000', q: 10, v: 1000 },
        { compte: '31100000', q: 20, v: 2000 },
        { compte: '32100000', q: 5, v: 700 },
      ]),
    );
    const total = (xs: Array<{ montant: number }>) => xs.reduce((t, l) => t + l.montant, 0);
    expect(total(note.lignes)).toBe(total(comptes));
  });

  it('sans campagne, le motif dit le chemin, avec la référence propre au texte', () => {
    const note = lignesNoteStocks([{ numero: '31100000', intitule: 'Marchandises', montant: 3000 }], null);
    expect(note.source).toBeNull();
    expect(motifQuantitesNote2(note, ', suffixe du texte')).toContain('fenêtre Inventaire physique');
    expect(motifQuantitesNote2(note, ', suffixe du texte')).toContain(', suffixe du texte.');
  });
});

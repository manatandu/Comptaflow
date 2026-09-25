import { MODELE_ETAT, ligneNeuve, titreColonne } from './etats-personnalises';

describe('États personnalisés · aides d’écran', () => {
  it('une ligne neuve ne reprend jamais une clé prise', () => {
    expect(ligneNeuve([{ cle: 'L2', libelle: '' }]).cle).toBe('L3');
    expect(ligneNeuve([{ cle: 'A', libelle: '' }, { cle: 'L3', libelle: '' }]).cle).toBe('L4');
  });

  it('le modèle proposé se tient · le total ne cite que des lignes précédentes', () => {
    const vues = new Set<string>();
    for (const l of MODELE_ETAT) {
      if (l.total) for (const t of l.total.split(/[+-]/)) expect(vues.has(t)).toBe(true);
      vues.add(l.cle);
    }
  });

  it('colonne · l’année d’un exercice civil, les dates sinon', () => {
    expect(titreColonne('2026-01-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z')).toBe('2026');
    expect(titreColonne('2026-07-01T00:00:00.000Z', '2027-06-30T00:00:00.000Z')).toContain('au');
  });
});

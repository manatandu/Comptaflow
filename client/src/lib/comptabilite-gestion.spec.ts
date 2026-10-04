import { comportementsAdmis, lireNombre, soldesMontres, totalCle } from './comptabilite-gestion';

describe('comptabilité de gestion · aides de l’écran', () => {
  it('une charge et un produit n’offrent pas les mêmes comportements, un compte de bilan aucun', () => {
    expect(comportementsAdmis('6')).toEqual(['CHARGE_FIXE', 'CHARGE_VARIABLE', 'CHARGE_SEMI_VARIABLE', 'HORS_CALCUL']);
    expect(comportementsAdmis('7')).toEqual(['PRODUIT_ACTIVITE', 'HORS_CALCUL']);
    expect(comportementsAdmis('5')).toEqual([]);
  });

  it('une saisie vide ou illisible est null, jamais zéro', () => {
    expect(lireNombre('')).toBeNull();
    expect(lireNombre('12a')).toBeNull();
    expect(lireNombre('1 250,5')).toBe(1250.5);
    expect(lireNombre('0')).toBe(0);
  });

  it('le total d’une clé se lit au centième, une valeur absente n’ajoute rien', () => {
    expect(totalCle([33.33, 33.33, 33.34])).toBe(100);
    expect(totalCle([60, null])).toBe(60);
  });

  it('les soldes montrés partent compte par compte', () => {
    expect(soldesMontres([{ compteId: 'a', solde: 1000 }, { compteId: 'b', solde: -250 }])).toEqual({ a: 1000, b: -250 });
  });
});

import { evaluerExpression } from './calcul';
import { fenetreDisponible } from './referentiel-fenetre';

/**
 * L'analyseur de la calculette est écrit à la main plutôt que confié à
 * `eval` : une zone de saisie ne doit jamais devenir un point d'exécution de
 * code. Ces tests figent ce qu'il accepte, ce qu'il calcule, et surtout ce
 * qu'il REFUSE.
 */
describe('evaluerExpression', () => {
  it.each([
    ['1250*12', 15000],
    ['1250 * 12 + 300', 15300],
    ['(100+50)*2', 300],
    ['1000/3', 333.33],
    ['-250+1000', 750],
    ['1 234,56 + 1', 1235.56],
    ['12', 12],
  ])('calcule « %s » = %s', (entree, attendu) => {
    expect(evaluerExpression(entree)).toBeCloseTo(attendu, 2);
  });

  it('respecte la priorité des opérateurs', () => {
    expect(evaluerExpression('2+3*4')).toBe(14);
    expect(evaluerExpression('(2+3)*4')).toBe(20);
  });

  it('refuse une expression incomplète', () => {
    expect(evaluerExpression('12+')).toBeNull();
    expect(evaluerExpression('(12+3')).toBeNull();
    expect(evaluerExpression('')).toBeNull();
  });

  it('refuse la division par zéro plutôt que de renvoyer l’infini', () => {
    expect(evaluerExpression('100/0')).toBeNull();
  });

  it('refuse tout ce qui n’est pas de l’arithmétique', () => {
    // Le point essentiel : rien de ce qui ressemble à du code ne passe.
    expect(evaluerExpression('alert(1)')).toBeNull();
    expect(evaluerExpression("1;console.log('x')")).toBeNull();
    expect(evaluerExpression('window.location')).toBeNull();
    expect(evaluerExpression('1+a')).toBeNull();
  });
});

describe('fenetreDisponible · division SYCEBNL / SYSCOHADA', () => {
  it("une fenêtre sans référentiel déclaré est disponible pour n'importe quel dossier", () => {
    expect(fenetreDisponible({ referentielsApplicables: undefined } as never, 'SYSCOHADA')).toBe(true);
    expect(fenetreDisponible({ referentielsApplicables: undefined } as never, undefined)).toBe(true);
  });

  it('une fenêtre SYCEBNL est cachée à un dossier SYSCOHADA', () => {
    expect(fenetreDisponible({ referentielsApplicables: ['SYCEBNL'] } as never, 'SYSCOHADA')).toBe(false);
  });

  it('une fenêtre SYCEBNL est visible pour un dossier SYCEBNL', () => {
    expect(fenetreDisponible({ referentielsApplicables: ['SYCEBNL'] } as never, 'SYCEBNL')).toBe(true);
  });

  it('une fenêtre propre à un référentiel reste cachée tant que le référentiel du dossier est inconnu', () => {
    // Plus sûr que de l'afficher, puis la retirer, une fois le dossier chargé.
    expect(fenetreDisponible({ referentielsApplicables: ['SYCEBNL'] } as never, undefined)).toBe(false);
  });
});

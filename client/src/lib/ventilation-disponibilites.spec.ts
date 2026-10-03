// Aucun import de « vitest » · convention du dépôt, le spec tourne aussi sous jest.
import { lireVentilationSaisie } from './ventilation-disponibilites';
import type { VentilationAExiger } from './types';

/**
 * A5 BIS, TROISIÈME TOUR, MINEUR 2 · un champ vide partait à zéro
 * (`Number('')`), et l'oubli passait pour la déclaration « zéro compris ».
 */
const BANQUE: VentilationAExiger[] = [
  {
    compteId: 'c-5211',
    numero: '52110000',
    passe: 50_000,
    devises: [
      { deviseId: 'usd', code: 'USD', montantDevise: 1000, francs: 1_000_000 },
      { deviseId: 'eur', code: 'EUR', montantDevise: 500, francs: 1_200_000 },
    ],
  },
];

describe('lireVentilationSaisie', () => {
  it('un champ vide est refusé avant l’envoi · le refus dit de taper 0', () => {
    const r = lireVentilationSaisie(BANQUE, { 'c-5211|usd': '100000' });
    expect(r.ventilation).toBeNull();
    expect(r.refus).toMatch(/Écart EUR du compte 52110000 non saisi · chaque devise se déclare, zéro compris ; tapez 0/);
  });

  it('des blancs ne sont pas une saisie', () => {
    expect(lireVentilationSaisie(BANQUE, { 'c-5211|usd': '100000', 'c-5211|eur': '   ' }).refus).toMatch(/non saisi/);
  });

  it('un zéro TAPÉ est une déclaration ; la virgule décimale est lue', () => {
    expect(lireVentilationSaisie(BANQUE, { 'c-5211|usd': '50000,5', 'c-5211|eur': '0' })).toEqual({
      ventilation: [
        { compteId: 'c-5211', deviseId: 'usd', ecart: 50000.5 },
        { compteId: 'c-5211', deviseId: 'eur', ecart: 0 },
      ],
      refus: null,
    });
  });

  it('un montant illisible est refusé, nommé', () => {
    expect(lireVentilationSaisie(BANQUE, { 'c-5211|usd': 'abc', 'c-5211|eur': '0' }).refus).toMatch(/Écart USD du compte 52110000 illisible/);
  });
});

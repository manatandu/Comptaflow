import { readFileSync } from 'fs';
import { join } from 'path';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import {
  COMPTES_RESULTAT_DE_L_EXERCICE,
  estCompteDuResultatDeLExercice,
  estResultatEnInstanceDAffectation,
} from './resultat-de-l-exercice';

/**
 * UNE SEULE LECTURE DU RÉSULTAT (audit du serveur, I5) · jusqu'au
 * 2026-09-27, l'impôt lisait le 131 et le 139, le bilan SYSCOHADA 131 à 139,
 * le Système minimal et la consolidation tout le 13. Ce spec tient la règle
 * et vérifie que chaque lecteur l'appelle au lieu de la réécrire.
 */
describe('résultat de l’exercice · 131 à 139, jamais le 130', () => {
  it('retient les neuf subdivisions 131 à 139 et écarte le 130', () => {
    expect([...COMPTES_RESULTAT_DE_L_EXERCICE]).toEqual(['131', '132', '133', '134', '135', '136', '137', '138', '139']);
    for (const n of ['13100000', '13200000', '13700000', '13810000', '13900000']) expect(estCompteDuResultatDeLExercice(n)).toBe(true);
    for (const n of ['13010000', '13090000', '12100000', '14100000']) expect(estCompteDuResultatDeLExercice(n)).toBe(false);
    expect(estResultatEnInstanceDAffectation('13010000')).toBe(true);
    expect(estResultatEnInstanceDAffectation('13100000')).toBe(false);
  });

  it('prémisse relue au semis SYSCOHADA · sous le 13, seul le 130 est écarté', () => {
    const sous13 = PLAN_COMPTES_SYSCOHADA.filter((c) => c.numero.startsWith('13') && c.numero.length === 8).map((c) => c.numero);
    expect(sous13.filter((n) => !estCompteDuResultatDeLExercice(n)).sort()).toEqual(['13010000', '13090000']);
  });

  it('une cascade de soldes intermédiaires arrêtée en chemin rend le résultat (Titre VIII ch. 19 § 2.4)', () => {
    // Chaque virement solde le compte précédent · restent le 137 et le 138.
    const balance = [
      { numero: '13700000', solde: -1_700 },
      { numero: '13800000', solde: 900 },
      { numero: '13010000', solde: -5_000 },
    ];
    const resultat = -balance.filter((l) => estCompteDuResultatDeLExercice(l.numero)).reduce((s, l) => s + l.solde, 0);
    expect(resultat).toBe(800);
  });

  it('chaque lecteur du résultat appelle la règle commune', () => {
    const lecteurs = [
      'etats-financiers/etats-financiers.service.ts',
      'etats-financiers/etats-financiers-smt.service.ts',
      'etats-financiers/etats-financiers-projet.service.ts',
      'etats-financiers-syscohada/correspondance-bilan-syscohada.ts',
      'etats-financiers-syscohada/correspondance-smt-syscohada.ts',
      'fiscalite/fiscalite.service.ts',
      'consolidation/cumul-consolidation.ts',
    ];
    const sansLaRegle = lecteurs.filter(
      (f) => !readFileSync(join(__dirname, '..', f), 'utf8').includes("from '../etats-financiers/resultat-de-l-exercice'") &&
        !readFileSync(join(__dirname, '..', f), 'utf8').includes("from './resultat-de-l-exercice'"),
    );
    expect(sansLaRegle).toEqual([]);
  });
});

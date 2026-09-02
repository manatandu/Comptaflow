import { COMPTES_SORTIE, natureImmobilisation } from './immobilisation.service';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { FAMILLES_IMMOBILISATION_DEFAUT } from './famille-immobilisation-seed';

/**
 * LE COMPTE DE SORTIE SUIT LA NATURE DU BIEN.
 *
 * Le PCGO (AUDCIF Titre VII ch. 3, section 8) subdivise les deux comptes de
 * sortie de la même façon : 811 / 812 / 816 pour la valeur comptable des
 * cessions, 821 / 822 / 826 pour le produit, selon que l'immobilisation est
 * incorporelle, corporelle ou financière.
 *
 * Le service servait 812 et 822 à TOUTE sortie, en assumant par écrit le cas
 * le plus fréquent. La cession d'un logiciel (2131, incorporel) sortait donc
 * sur « immobilisations corporelles ». L'écriture reste équilibrée et le
 * résultat exact · seule la ventilation des cessions dans les notes annexes
 * est fausse, et rien ne le signale. C'est la définition d'un défaut muet.
 */
describe('sortie d’immobilisation · compte de classe 8 selon la nature', () => {
  it('un logiciel ou un brevet sort en 811 / 821, pas en 812 / 822', () => {
    // 2131 « Logiciels », 2120 « Brevets, licences » · classe 21, incorporel.
    expect(natureImmobilisation('21310000')).toBe('INCORPORELLE');
    expect(COMPTES_SORTIE.INCORPORELLE).toEqual({ valeurComptable: '81100000', produitCession: '82100000' });
  });

  it('un matériel, un bâtiment ou un véhicule sort en 812 / 822', () => {
    for (const numero of ['22000000', '23110000', '24410000', '24500000']) {
      expect(natureImmobilisation(numero)).toBe('CORPORELLE');
    }
    expect(COMPTES_SORTIE.CORPORELLE).toEqual({ valeurComptable: '81200000', produitCession: '82200000' });
  });

  it('un titre de participation ou un prêt sort en 816 / 826', () => {
    expect(natureImmobilisation('26100000')).toBe('FINANCIERE');
    expect(natureImmobilisation('27500000')).toBe('FINANCIERE');
    expect(COMPTES_SORTIE.FINANCIERE).toEqual({ valeurComptable: '81600000', produitCession: '82600000' });
  });

  /**
   * Le garde-fou qui compte vraiment : les six comptes servis doivent EXISTER
   * dans les deux plans semés. Une résolution fine qui viserait un compte
   * absent échangerait un défaut muet contre une écriture impossible.
   */
  it.each([
    ['SYCEBNL', PLAN_COMPTES_SYCEBNL],
    ['SYSCOHADA', PLAN_COMPTES_SYSCOHADA],
  ] as const)('les six comptes de sortie existent au plan %s', (_, plan) => {
    const numeros = new Set(plan.map((c) => c.numero));
    const attendus = Object.values(COMPTES_SORTIE).flatMap((c) => [c.valeurComptable, c.produitCession]);
    expect(attendus.filter((n) => !numeros.has(n))).toEqual([]);
  });

  /**
   * Et le garde-fou de bout en bout : toute famille d'immobilisation semée
   * doit tomber sur une nature dont le compte de sortie existe. Ajouter
   * demain une famille sur un compte de classe 2 inconnu de la résolution le
   * ferait voir ici, pas en production.
   */
  it('chaque famille semée résout vers un compte de sortie qui existe', () => {
    const numeros = new Set(PLAN_COMPTES_SYSCOHADA.map((c) => c.numero));
    for (const f of FAMILLES_IMMOBILISATION_DEFAUT) {
      const compteImmo = (f as { compteImmobilisation?: string }).compteImmobilisation;
      if (!compteImmo) continue;
      const sortie = COMPTES_SORTIE[natureImmobilisation(compteImmo)];
      expect({ famille: f.code, compte: sortie.valeurComptable, existe: numeros.has(sortie.valeurComptable) }).toEqual({
        famille: f.code,
        compte: sortie.valeurComptable,
        existe: true,
      });
    }
  });
});

import { Referentiel } from '@prisma/client';
import { COMPTES_SORTIE, REPRISE_DEPRECIATION_HAO, REPRISE_DEPRECIATION_SORTIE, natureImmobilisation } from './immobilisation.service';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { FAMILLES_IMMOBILISATION_DEFAUT } from './famille-immobilisation-seed';

/**
 * LE COMPTE DE SORTIE SUIT LA NATURE DU BIEN · ET LA NATURE SUIT LE
 * RÉFÉRENTIEL DU DOSSIER.
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
 *
 * LE SECOND DÉFAUT ÉTAIT DU MÊME GENRE, ET IL A SURVÉCU AU PREMIER. La
 * résolution classait `/^2[01]/` en INCORPORELLE, règle écrite pour le seul
 * plan SYSCOHADA, où la classe 2 commence à 21. Au SYCEBNL, la division 20
 * porte en entier les « Immobilisations destinées à la vente (dons et legs
 * non encore reçus) et usufruit temporaire » : 202 Terrains, 203 Bâtiments,
 * 204 Matériels, 205 Titres. Un bâtiment légué sortait en 811
 * « incorporelles », alors que le COMPTE 81 SYCEBNL lui ouvre sa propre
 * subdivision, « 818 Immobilisations reçues en dons et legs destinées à la
 * vente » (et le COMPTE 82 son 828), tous deux semés et jusqu'ici
 * inatteignables.
 */
describe('sortie d’immobilisation · compte de classe 8 selon la nature', () => {
  it('un logiciel ou un brevet sort en 811 / 821, pas en 812 / 822', () => {
    // 2131 « Logiciels », 2120 « Brevets, licences » · classe 21, incorporel.
    expect(natureImmobilisation('21310000', Referentiel.SYSCOHADA)).toBe('INCORPORELLE');
    expect(natureImmobilisation('21310000', Referentiel.SYCEBNL)).toBe('INCORPORELLE');
    expect(COMPTES_SORTIE.INCORPORELLE).toEqual({ valeurComptable: '81100000', produitCession: '82100000' });
  });

  it('un matériel, un bâtiment ou un véhicule sort en 812 / 822', () => {
    for (const numero of ['22000000', '23110000', '24410000', '24500000']) {
      expect(natureImmobilisation(numero, Referentiel.SYSCOHADA)).toBe('CORPORELLE');
      expect(natureImmobilisation(numero, Referentiel.SYCEBNL)).toBe('CORPORELLE');
    }
    expect(COMPTES_SORTIE.CORPORELLE).toEqual({ valeurComptable: '81200000', produitCession: '82200000' });
  });

  it('un titre de participation ou un prêt sort en 816 / 826', () => {
    expect(natureImmobilisation('26100000', Referentiel.SYSCOHADA)).toBe('FINANCIERE');
    expect(natureImmobilisation('27500000', Referentiel.SYSCOHADA)).toBe('FINANCIERE');
    expect(COMPTES_SORTIE.FINANCIERE).toEqual({ valeurComptable: '81600000', produitCession: '82600000' });
  });

  /**
   * LE DÉFAUT LUI-MÊME · un legs n'est pas un incorporel.
   */
  it('au SYCEBNL, TOUTE la division 20 sort en 818 / 828, terrains et titres compris', () => {
    // Les quatre comptes 20x semés, plus les incorporelles 201x qui relèvent
    // de la même division « destinées à la vente ».
    for (const numero of ['20110000', '20200000', '20300000', '20400000', '20500000']) {
      expect(`${numero} → ${natureImmobilisation(numero, Referentiel.SYCEBNL)}`).toBe(`${numero} → DONS_LEGS_VENTE`);
    }
    expect(COMPTES_SORTIE.DONS_LEGS_VENTE).toEqual({ valeurComptable: '81800000', produitCession: '82800000' });
  });

  it('et le SYSCOHADA n’atteint JAMAIS cette nature · son COMPTE 81 n’a pas de 818', () => {
    // La fiche AUDCIF du COMPTE 81 n'énumère que 811, 812 et 816. Le plan
    // SYSCOHADA n'ouvre d'ailleurs aucun compte 20x (sa classe 2 commence à
    // 21) : la règle `^2[01]` y reste juste, et le 818 y serait une écriture
    // impossible.
    const vingt = PLAN_COMPTES_SYSCOHADA.filter((c) => c.numero.startsWith('20'));
    expect(vingt.map((c) => c.numero)).toEqual([]);
    for (const compte of PLAN_COMPTES_SYSCOHADA.filter((c) => c.numero.startsWith('2'))) {
      expect(natureImmobilisation(compte.numero, Referentiel.SYSCOHADA)).not.toBe('DONS_LEGS_VENTE');
    }
  });

  /**
   * Le garde-fou qui compte vraiment : les comptes servis doivent EXISTER
   * dans le plan du référentiel qui les sert. Une résolution fine qui viserait
   * un compte absent échangerait un défaut muet contre une écriture
   * impossible · et 818 / 828 n'existent QUE du côté SYCEBNL.
   */
  it('les huit comptes de sortie existent au plan SYCEBNL', () => {
    const numeros = new Set(PLAN_COMPTES_SYCEBNL.map((c) => c.numero));
    const attendus = Object.values(COMPTES_SORTIE).flatMap((c) => [c.valeurComptable, c.produitCession]);
    expect(attendus.filter((n) => !numeros.has(n))).toEqual([]);
  });

  it('les six comptes atteignables au SYSCOHADA existent à son plan, et 818 / 828 en sont bien absents', () => {
    const numeros = new Set(PLAN_COMPTES_SYSCOHADA.map((c) => c.numero));
    const atteignables = (['INCORPORELLE', 'CORPORELLE', 'FINANCIERE'] as const).flatMap((n) => [
      COMPTES_SORTIE[n].valeurComptable,
      COMPTES_SORTIE[n].produitCession,
    ]);
    expect(atteignables.filter((n) => !numeros.has(n))).toEqual([]);
    expect(['81800000', '82800000'].filter((n) => numeros.has(n))).toEqual([]);
  });

  /**
   * LA REPRISE DE DÉPRÉCIATION EST SERVIE PAR NUMÉRO, ELLE AUSSI · même
   * exigence : le compte visé doit exister au plan qui le sert, sinon la
   * sortie d'un bien déprécié devient impossible au lieu d'être fausse.
   *
   * Fiche du COMPTE 79 · 7913 incorporelles, 7914 corporelles, 7972
   * financières ; et, au SYCEBNL seulement, 795 « Reprises des dépréciations
   * d'immobilisations reçues provenant des dons et legs et d'usufruit
   * temporaire ». Le plan SYCEBNL semé s'arrête au compte de détail 79100000
   * et 79700000, là où le plan SYSCOHADA descend à 79130000 / 79140000 /
   * 79720000 · les deux tables ne se recopient donc pas.
   */
  it.each([
    ['SYCEBNL', Referentiel.SYCEBNL, PLAN_COMPTES_SYCEBNL],
    ['SYSCOHADA', Referentiel.SYSCOHADA, PLAN_COMPTES_SYSCOHADA],
  ] as const)('les comptes de reprise de dépréciation existent au plan %s', (_, referentiel, plan) => {
    const numeros = new Set(plan.map((c) => c.numero));
    const attendus = [...Object.values(REPRISE_DEPRECIATION_SORTIE[referentiel]), REPRISE_DEPRECIATION_HAO];
    expect(attendus.filter((n) => !numeros.has(n))).toEqual([]);
  });

  it('chaque nature atteignable a son compte de reprise, dans les deux référentiels', () => {
    // SYCEBNL : les quatre natures. SYSCOHADA : les trois, le 818 n'y
    // existant pas.
    expect(Object.keys(REPRISE_DEPRECIATION_SORTIE[Referentiel.SYCEBNL]).sort()).toEqual(
      ['CORPORELLE', 'DONS_LEGS_VENTE', 'FINANCIERE', 'INCORPORELLE'],
    );
    expect(Object.keys(REPRISE_DEPRECIATION_SORTIE[Referentiel.SYSCOHADA]).sort()).toEqual(
      ['CORPORELLE', 'FINANCIERE', 'INCORPORELLE'],
    );
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
      const sortie = COMPTES_SORTIE[natureImmobilisation(compteImmo, Referentiel.SYSCOHADA)];
      expect({ famille: f.code, compte: sortie.valeurComptable, existe: numeros.has(sortie.valeurComptable) }).toEqual({
        famille: f.code,
        compte: sortie.valeurComptable,
        existe: true,
      });
    }
  });
});

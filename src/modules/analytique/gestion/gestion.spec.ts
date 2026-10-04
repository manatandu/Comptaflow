import { motifRefusComportement, partageFixeVariable } from './comportement-gestion';
import { motifRefusCle, propositionRepartition, repartirAuCentime, type SectionDuPlan } from './cles-repartition';
import { coutDeProduction, motifRefusDonnees, type ChargeDeSection } from './cout-production';
import { seuilDeRentabilite, type MouvementDeGestion } from './seuil-rentabilite';
import { motifRefusOd } from '../od-analytique';

/**
 * Ligne A20 · chiffres tenus à la main, écrits dans chaque cas. Un moteur de
 * gestion faux ne casse rien en aval (le grand livre n'en sait rien) · seul un
 * calcul confronté à sa main le voit.
 */

describe('comportement des comptes de gestion (glossaire, CHARGES FIXES ET VARIABLES)', () => {
  it('une charge fixe, variable ou semi-variable ; un produit d’activité ou hors calcul ; rien hors des classes 6 et 7', () => {
    expect(motifRefusComportement({ numero: '60110000', classe: '6', comportement: 'CHARGE_FIXE', partVariablePct: null })).toBeNull();
    expect(motifRefusComportement({ numero: '70110000', classe: '7', comportement: 'PRODUIT_ACTIVITE', partVariablePct: null })).toBeNull();
    expect(motifRefusComportement({ numero: '70110000', classe: '7', comportement: 'CHARGE_FIXE', partVariablePct: null })).toMatch(/produit/);
    expect(motifRefusComportement({ numero: '60110000', classe: '6', comportement: 'PRODUIT_ACTIVITE', partVariablePct: null })).toMatch(/charge/);
    expect(motifRefusComportement({ numero: '52110000', classe: '5', comportement: 'CHARGE_FIXE', partVariablePct: null })).toMatch(/classes 6 et 7/);
    // Effacer la déclaration est un geste admis (retour à « non déclaré »).
    expect(motifRefusComportement({ numero: '60110000', classe: '6', comportement: null, partVariablePct: null })).toBeNull();
  });

  it('la semi-variable exige sa part variable strictement entre 0 et 100, et elle seule en porte une', () => {
    expect(motifRefusComportement({ numero: '66110000', classe: '6', comportement: 'CHARGE_SEMI_VARIABLE', partVariablePct: null })).toMatch(/part variable/);
    expect(motifRefusComportement({ numero: '66110000', classe: '6', comportement: 'CHARGE_SEMI_VARIABLE', partVariablePct: 100 })).toMatch(/strictement/);
    expect(motifRefusComportement({ numero: '66110000', classe: '6', comportement: 'CHARGE_SEMI_VARIABLE', partVariablePct: 60 })).toBeNull();
    expect(motifRefusComportement({ numero: '66110000', classe: '6', comportement: 'CHARGE_FIXE', partVariablePct: 60 })).toMatch(/semi-variable/);
  });

  it('le partage d’une semi-variable reconstitue le montant au centime', () => {
    expect(partageFixeVariable(200000, 'CHARGE_SEMI_VARIABLE', 60)).toEqual({ fixe: 80000, variable: 120000 });
    const p = partageFixeVariable(100.01, 'CHARGE_SEMI_VARIABLE', 33.33);
    expect(Math.round((p.fixe + p.variable) * 100)).toBe(10001);
  });
});

const sections: SectionDuPlan[] = [
  { id: 'aux', planId: 'p', code: 'ATEL-ENT', estTotal: false, estActive: true },
  { id: 'a', planId: 'p', code: 'PROD-A', estTotal: false, estActive: true },
  { id: 'b', planId: 'p', code: 'PROD-B', estTotal: false, estActive: true },
  { id: 'c', planId: 'p', code: 'DISTRIB', estTotal: false, estActive: true },
  { id: 'tot', planId: 'p', code: 'PROD', estTotal: true, estActive: true },
  { id: 'dort', planId: 'p', code: 'ANCIEN', estTotal: false, estActive: false },
  { id: 'autre', planId: 'q', code: 'X', estTotal: false, estActive: true },
];

describe('clés de répartition (glossaire, RÉPARTITION, UNITÉ D’ŒUVRE)', () => {
  const base = { planId: 'p', sectionSourceId: 'aux', mode: 'POURCENTAGE' as const, sections, source: 'Plan des surfaces 2026' };

  it('une clé en pourcentages fait cent, sur des sections Détail actives du même plan, sans la source', () => {
    const ok = [{ sectionCibleId: 'a', valeur: 50 }, { sectionCibleId: 'b', valeur: 30 }, { sectionCibleId: 'c', valeur: 20 }];
    expect(motifRefusCle({ ...base, lignes: ok })).toBeNull();
    expect(motifRefusCle({ ...base, lignes: ok.slice(0, 2) })).toMatch(/80\.00 %/);
    expect(motifRefusCle({ ...base, lignes: [{ sectionCibleId: 'aux', valeur: 100 }] })).toMatch(/elle-même/);
    expect(motifRefusCle({ ...base, lignes: [{ sectionCibleId: 'tot', valeur: 100 }] })).toMatch(/rubrique/);
    expect(motifRefusCle({ ...base, lignes: [{ sectionCibleId: 'dort', valeur: 100 }] })).toMatch(/sommeil/);
    expect(motifRefusCle({ ...base, lignes: [{ sectionCibleId: 'autre', valeur: 100 }] })).toMatch(/plan de la clé/);
    expect(motifRefusCle({ ...base, lignes: [{ sectionCibleId: 'a', valeur: 50 }, { sectionCibleId: 'a', valeur: 50 }] })).toMatch(/deux fois/);
    expect(motifRefusCle({ ...base, source: ' ', lignes: ok })).toMatch(/source/);
    expect(motifRefusCle({ ...base, sectionSourceId: 'tot', lignes: ok })).toMatch(/rubrique/);
  });

  it('en unités, la somme est libre · seules des valeurs positives', () => {
    const lignes = [{ sectionCibleId: 'a', valeur: 120 }, { sectionCibleId: 'b', valeur: 80 }];
    expect(motifRefusCle({ ...base, mode: 'UNITES', lignes })).toBeNull();
    expect(motifRefusCle({ ...base, mode: 'UNITES', lignes: [{ sectionCibleId: 'a', valeur: 0 }] })).toMatch(/strictement positive/);
  });

  it('le plus fort reste rend le montant exact · 100,00 en trois tiers = 33,34 + 33,33 + 33,33', () => {
    expect(repartirAuCentime(100, [1, 1, 1])).toEqual([33.34, 33.33, 33.33]);
    expect(repartirAuCentime(1000, [50, 30, 20])).toEqual([500, 300, 200]);
    // 10,00 sur 120 et 80 unités · 6,00 et 4,00.
    expect(repartirAuCentime(10, [120, 80])).toEqual([6, 4]);
  });

  it('une OD par compte, équilibrée, que la règle des OD accepte · le sens suit le solde', () => {
    const cle = [{ sectionCibleId: 'a', valeur: 50 }, { sectionCibleId: 'b', valeur: 30 }, { sectionCibleId: 'c', valeur: 20 }];
    const ods = propositionRepartition(
      [
        { compteId: 'c624', numero: '62410000', intitule: 'Entretien', debit: 1200, credit: 200 },
        { compteId: 'c601', numero: '60110000', intitule: 'Achats', debit: 300, credit: 300 },
        { compteId: 'c707', numero: '70700000', intitule: 'Produits accessoires', debit: 0, credit: 250 },
      ],
      'aux',
      cle,
    );
    // Le 601 soldé ne produit rien ; 624 débiteur de 1 000 ; 707 créditeur de 250.
    expect(ods.map((o) => [o.numero, o.solde])).toEqual([['62410000', 1000], ['70700000', -250]]);
    expect(ods[0].lignes).toEqual([
      { sectionId: 'aux', debit: 0, credit: 1000 },
      { sectionId: 'a', debit: 500, credit: 0 },
      { sectionId: 'b', debit: 300, credit: 0 },
      { sectionId: 'c', debit: 200, credit: 0 },
    ]);
    expect(ods[1].lignes).toEqual([
      { sectionId: 'aux', debit: 250, credit: 0 },
      { sectionId: 'a', debit: 0, credit: 125 },
      { sectionId: 'b', debit: 0, credit: 75 },
      { sectionId: 'c', debit: 0, credit: 50 },
    ]);
    for (const od of ods) {
      const classe = od.numero[0];
      expect(
        motifRefusOd({
          planId: 'p',
          lignes: od.lignes,
          sections: sections.map((s) => ({ id: s.id, planId: s.planId, code: s.code, estTotal: s.estTotal })),
          classeCompte: classe,
          classesVentilees: '2,6,7,9',
        }),
      ).toBeNull();
    }
  });
});

describe('coût de production et imputation rationnelle (AUDCIF Titre VIII ch. 14 § 2.3.2)', () => {
  const charges: ChargeDeSection[] = [
    { compteId: '1', numero: '60110000', intitule: 'Matières', montant: 400000, comportement: 'CHARGE_VARIABLE', partVariablePct: null },
    { compteId: '2', numero: '62410000', intitule: 'Entretien', montant: 300000, comportement: 'CHARGE_FIXE', partVariablePct: null },
    { compteId: '3', numero: '66110000', intitule: 'Salaires', montant: 200000, comportement: 'CHARGE_SEMI_VARIABLE', partVariablePct: 60 },
  ];

  it('sous-activité · 800 h sur 1 000 h, la quote-part de 20 % des fixes reste en charge de la période', () => {
    // Variables 400 000 + 120 000 = 520 000 ; fixes 300 000 + 80 000 = 380 000.
    // Imputées 380 000 × 0,8 = 304 000 ; sous-activité 76 000 ; coût 824 000 ;
    // 400 unités produites · 2 060 l'unité.
    const r = coutDeProduction(charges, { capaciteNormale: 1000, activiteReelle: 800, quantiteProduite: 400 });
    expect(r).toMatchObject({
      chargesVariables: 520000,
      chargesFixes: 380000,
      coefficient: 0.8,
      suractivite: false,
      chargesFixesImputees: 304000,
      sousActivite: 76000,
      coutProduction: 824000,
      coutUnitaire: 2060,
    });
  });

  it('suractivité · le coefficient est borné à un, rien au-delà des charges fixes encourues', () => {
    const r = coutDeProduction(charges, { capaciteNormale: 1000, activiteReelle: 1200, quantiteProduite: null });
    expect(r).toMatchObject({ coefficient: 1, suractivite: true, chargesFixesImputees: 380000, sousActivite: 0, coutProduction: 900000, coutUnitaire: null });
  });

  it('un compte non déclaré rend le coût incomplet, jamais calculé sur la partie connue', () => {
    const r = coutDeProduction(
      [...charges, { compteId: '4', numero: '61810000', intitule: 'Voyages', montant: 5000, comportement: null, partVariablePct: null }],
      { capaciteNormale: 1000, activiteReelle: 800, quantiteProduite: 400 },
    );
    expect(r.coutProduction).toBeNull();
    expect(r.coutUnitaire).toBeNull();
    expect(r.nonDeclares).toEqual([{ numero: '61810000', intitule: 'Voyages', montant: 5000 }]);
  });

  it('les données déclarées portent leur unité et leur source', () => {
    const d = { capaciteNormale: 1000, activiteReelle: 800, quantiteProduite: null, source: 'Relevé des compteurs', unite: 'heures-machine' };
    expect(motifRefusDonnees(d)).toBeNull();
    expect(motifRefusDonnees({ ...d, capaciteNormale: 0 })).toMatch(/capacité normale/);
    expect(motifRefusDonnees({ ...d, source: '' })).toMatch(/source/);
    expect(motifRefusDonnees({ ...d, unite: '' })).toMatch(/unité/);
  });
});

describe('seuil de rentabilité (définition d’OmegaX)', () => {
  const m = (numero: string, classe: string, d: number, cr: number, comportement: MouvementDeGestion['comportement'], pct: number | null = null): MouvementDeGestion => ({
    numero,
    intitule: numero,
    classe,
    mouvementDebit: d,
    mouvementCredit: cr,
    comportement,
    partVariablePct: pct,
  });

  it('P 2 000 000, CV 800 000, CF 600 000 · marge 60 %, seuil 1 000 000, point mort au sixième mois', () => {
    const r = seuilDeRentabilite(
      [
        m('70110000', '7', 0, 2000000, 'PRODUIT_ACTIVITE'),
        m('60110000', '6', 700000, 0, 'CHARGE_VARIABLE'),
        // Semi-variable 250 000 à 40 % · 100 000 variables, 150 000 fixes.
        m('66110000', '6', 250000, 0, 'CHARGE_SEMI_VARIABLE', 40),
        m('62210000', '6', 450000, 0, 'CHARGE_FIXE'),
        m('77100000', '7', 0, 30000, 'HORS_CALCUL'),
        m('81200000', '8', 999, 0, null),
      ],
      12,
    );
    expect(r).toMatchObject({
      produits: 2000000,
      chargesVariables: 800000,
      chargesFixes: 600000,
      marge: 1200000,
      tauxMarge: 60,
      seuil: 1000000,
      margeSecurite: 1000000,
      indiceSecurite: 50,
      pointMortMois: 6,
      motif: null,
    });
    expect(r.horsCalcul.map((h) => h.numero)).toEqual(['77100000']);
  });

  it('un compte mouvementé non déclaré · pas de seuil, le compte est nommé', () => {
    const r = seuilDeRentabilite([m('70110000', '7', 0, 1000, 'PRODUIT_ACTIVITE'), m('60110000', '6', 100, 0, null)], 12);
    expect(r.seuil).toBeNull();
    expect(r.nonDeclares.map((x) => x.numero)).toEqual(['60110000']);
    expect(r.motif).toMatch(/sans comportement déclaré/);
  });

  it('une marge sur coûts variables négative n’a pas de seuil, et c’est dit', () => {
    const r = seuilDeRentabilite([m('70110000', '7', 0, 1000, 'PRODUIT_ACTIVITE'), m('60110000', '6', 1500, 0, 'CHARGE_VARIABLE')], 12);
    expect(r.seuil).toBeNull();
    expect(r.motif).toMatch(/nulle ou négative/);
  });
});

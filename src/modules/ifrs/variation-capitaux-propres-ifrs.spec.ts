import { construireEtatsIfrs, LigneLegale, RefusIfrs, RegleCorrespondance, RetraitementDeclare } from './etats-ifrs';
import { motifRefusRegle } from './rubriques-ifrs';
import { construireVariationCapitauxPropres, construireVariationCapitauxPropresConsolidee, motifRefusMouvementCp, MouvementCpDeclare } from './variation-capitaux-propres-ifrs';

/**
 * TRANCHE 2 · état présentant le résultat global et état des variations des
 * capitaux propres (IFRS 18 § 86 à 95 et § 107 à 112). Chaque montant est
 * chiffré à la main dans son commentaire.
 *
 * N-1 · capital 1 000, réserves 150, résultat 150 (1 500 − 1 350) · capitaux
 * propres 1 300. N · le résultat de N-1 est passé en réserves (300), et le
 * contrat de location d'IFRS 16 porte le résultat IFRS à 190.
 */
const b = (xs: [string, number][]): LigneLegale[] => xs.map(([numero, solde]) => ({ numero, intitule: numero, solde }));
const R = (prefixe: string, rubrique: string): RegleCorrespondance => ({ prefixe, rubrique });
const REGLES = [
  R('24', 'SF_IMMOBILISATIONS_CORPORELLES'), R('284', 'SF_IMMOBILISATIONS_CORPORELLES'), R('31', 'SF_STOCKS'), R('41', 'SF_CREANCES_CLIENTS'),
  R('52', 'SF_TRESORERIE'), R('101', 'SF_CAPITAL'), R('11', 'SF_RESERVES'), R('16', 'SF_PASSIFS_FINANCIERS_NC'), R('40', 'SF_FOURNISSEURS'),
  R('465', 'SF_FOURNISSEURS'), R('70', 'PL_PRODUITS'), R('60', 'PL_ACHATS_CONSOMMES'), R('66', 'PL_CHARGES_PERSONNEL'), R('68', 'PL_AMORTISSEMENTS'),
  R('62', 'PL_AUTRES_CHARGES_OPERATIONNELLES'), R('67', 'PL_CHARGES_FINANCEMENT'), R('89', 'PL_IMPOT_RESULTAT'),
];
const N1 = b([['24100000', 1000], ['52100000', 700], ['16200000', -400], ['10100000', -1000], ['11800000', -150], ['70100000', -1500], ['60100000', 1350]]);
const lignesN = (reserves: number, dividende = 0) =>
  b([
    ['24100000', 1000], ['28410000', -200], ['31100000', 300], ['41100000', 750], ['52100000', 500],
    ['10100000', -1000], ['11800000', reserves], ['16200000', -600], ['40100000', -250], ...(dividende ? ([['46500000', dividende]] as [string, number][]) : []),
    ['70100000', -2070], ['60100000', 1200], ['66100000', 400], ['68100000', 100], ['62200000', 70], ['67100000', 50], ['89100000', 50],
  ]);
const LOCATION: RetraitementDeclare[] = [
  { id: 'a', libelle: 'Droit d’utilisation', fondement: 'IFRS 16 § 22', lignes: [{ rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: 300 }, { rubrique: 'SF_PASSIFS_FINANCIERS_NC', montant: -300 }] },
  {
    id: 'b',
    libelle: 'Amortissement, intérêt et loyer',
    fondement: 'IFRS 16 § 31 et § 36',
    lignes: [
      { rubrique: 'PL_AMORTISSEMENTS', montant: 60 }, { rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: -60 },
      { rubrique: 'PL_CHARGES_FINANCEMENT', montant: 20 }, { rubrique: 'SF_PASSIFS_FINANCIERS_NC', montant: -20 },
      { rubrique: 'PL_AUTRES_CHARGES_OPERATIONNELLES', montant: -70 }, { rubrique: 'SF_PASSIFS_FINANCIERS_NC', montant: 70 },
    ],
  },
];
const REEVALUATION: RetraitementDeclare = {
  id: 'r',
  libelle: 'Réévaluation du terrain',
  fondement: 'IAS 16 § 39',
  lignes: [{ rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: 100 }, { rubrique: 'OCI_NR_AUTRES', montant: -100 }],
};
const EX = { dateDebut: new Date('2026-01-01') };
const ouverture = construireEtatsIfrs({ dateDebut: new Date('2025-01-01') }, N1, REGLES, [], 'AUCUNE');
const L = (xs: { cle: string }[], cle: string) => xs.find((x) => x.cle === cle) as any;
const mvt = (m: Partial<MouvementCpDeclare>): MouvementCpDeclare => ({ type: 'APPORT', composante: 'CAPITAL', montant: 1, libelle: 'x', justification: 'PV', ...m });

describe('état présentant le résultat global · § 86 à 89', () => {
  it('sans autre élément, le résultat global est le résultat net', () => {
    const e = construireEtatsIfrs(EX, lignesN(-300), REGLES, LOCATION, 'AUCUNE');
    expect(e.resultatGlobal[0]).toMatchObject({ cle: 'RG_RESULTAT_NET', ifrs: 190 });
    expect(L(e.resultatGlobal, 'TOTAL_OCI').ifrs).toBe(0);
    expect(L(e.resultatGlobal, 'RESULTAT_GLOBAL').ifrs).toBe(190);
  });

  it('une réévaluation IAS 16 entre par retraitement, au non recyclable, et la situation boucle par sa composante', () => {
    const e = construireEtatsIfrs(EX, lignesN(-300), REGLES, [...LOCATION, REEVALUATION], 'AUCUNE');
    // 190 + 100 · la réévaluation ne touche pas le résultat net.
    expect(L(e.resultatGlobal, 'OCI_NR_AUTRES').ifrs).toBe(100);
    expect(L(e.resultatGlobal, 'TOTAL_OCI_NON_RECYCLABLE').ifrs).toBe(100);
    expect(L(e.resultatGlobal, 'TOTAL_OCI_RECYCLABLE').ifrs).toBe(0);
    expect(L(e.resultatGlobal, 'RG_RESULTAT_NET').ifrs).toBe(190);
    expect(L(e.resultatGlobal, 'RESULTAT_GLOBAL').ifrs).toBe(290);
    // Actif 2 590 + 100 · capitaux propres 1 490 + 100.
    expect(L(e.situation, 'SF_OCI_EXERCICE').ifrs).toBe(100);
    expect(L(e.situation, 'TOTAL_ACTIF').ifrs).toBe(2690);
    expect(e.controles.every((c) => c.ok)).toBe(true);
    expect(e.mentions.join(' ')).toMatch(/nets d’impôt \(IFRS 18 § 94 a\).*§ 93/);
  });

  it('les recyclables viennent avant les non recyclables, dans l’ordre du § 88', () => {
    const e = construireEtatsIfrs(EX, lignesN(-300), REGLES, [], 'AUCUNE');
    const cles = e.resultatGlobal.map((l) => l.cle);
    expect(cles.indexOf('TOTAL_OCI_RECYCLABLE')).toBeLessThan(cles.indexOf('OCI_NR_AUTRES'));
  });

  it('une correspondance ne peut pas viser un autre élément du résultat global · c’est un flux, il se déclare', () => {
    expect(motifRefusRegle('106', 'OCI_NR_AUTRES')).toMatch(/se déclare en retraitement.*§ B86-B87/);
  });
});

describe('état des variations des capitaux propres · § 107 à 112', () => {
  it('ouverture 1 300, résultat 190, clôture 1 490 · aucun écart, composante par composante', () => {
    const v = construireVariationCapitauxPropres(construireEtatsIfrs(EX, lignesN(-300), REGLES, LOCATION, 'AUCUNE'), ouverture, []);
    expect(L(v.lignes, 'OUVERTURE_RETRAITEE')).toMatchObject({ capital: 1000, reserves: 300, autres: 0, total: 1300 });
    expect(L(v.lignes, 'RESULTAT_NET')).toMatchObject({ reserves: 190, total: 190 });
    expect(L(v.lignes, 'CLOTURE')).toMatchObject({ capital: 1000, reserves: 490, autres: 0, total: 1490 });
    expect(L(v.lignes, 'ECART_NON_EXPLIQUE')).toBeUndefined();
    expect(v.motifsNonPubliable).toEqual([]);
  });

  it('un dividende non déclaré reste un écart nommé · déclaré en distribution, il l’explique (§ 107 c iii)', () => {
    // Réserves 250 au lieu de 300, 50 au 465 · la clôture des réserves tombe à 440.
    const cloture = construireEtatsIfrs(EX, lignesN(-250, -50), REGLES, LOCATION, 'AUCUNE');
    const sans = construireVariationCapitauxPropres(cloture, ouverture, []);
    expect(L(sans.lignes, 'ECART_NON_EXPLIQUE')).toMatchObject({ reserves: -50, total: -50 });
    expect(sans.motifsNonPubliable.join(' ')).toMatch(/-50 de variation.*réserves et résultats non distribués -50/);
    const avec = construireVariationCapitauxPropres(cloture, ouverture, [mvt({ type: 'DISTRIBUTION', composante: 'RESERVES', montant: -50, libelle: 'Dividende 2025' })]);
    expect(L(avec.lignes, 'DISTRIBUTIONS').reserves).toBe(-50);
    expect(L(avec.lignes, 'ECART_NON_EXPLIQUE')).toBeUndefined();
    expect(avec.mentions.join(' ')).toMatch(/par action.*§ 110/);
  });

  it('les autres éléments du résultat global vont à leur composante, jamais aux réserves', () => {
    const v = construireVariationCapitauxPropres(construireEtatsIfrs(EX, lignesN(-300), REGLES, [...LOCATION, REEVALUATION], 'AUCUNE'), ouverture, []);
    expect(L(v.lignes, 'OCI')).toMatchObject({ reserves: 0, autres: 100 });
    expect(L(v.lignes, 'RESULTAT_GLOBAL').total).toBe(290);
    expect(L(v.lignes, 'CLOTURE').autres).toBe(100);
    expect(L(v.lignes, 'ECART_NON_EXPLIQUE')).toBeUndefined();
  });

  it('une correction d’erreur IAS 8 remonte au solde publié sans se compter deux fois (§ 107 b, § 108)', () => {
    const v = construireVariationCapitauxPropres(construireEtatsIfrs(EX, lignesN(-300), REGLES, LOCATION, 'AUCUNE'), ouverture, [
      mvt({ type: 'CORRECTION_ERREUR', composante: 'RESERVES', montant: 20 }),
    ]);
    // L'ouverture retraitée est la clôture IFRS de N-1 · la publiée est 20 plus bas.
    expect(L(v.lignes, 'OUVERTURE_PUBLIEE').reserves).toBe(280);
    expect(L(v.lignes, 'CORRECTION_ERREUR').reserves).toBe(20);
    expect(L(v.lignes, 'OUVERTURE_RETRAITEE').reserves).toBe(300);
    expect(L(v.lignes, 'ECART_NON_EXPLIQUE')).toBeUndefined();
  });

  it('des transferts entre composantes qui ne se soldent pas rendent l’état non publiable', () => {
    const v = construireVariationCapitauxPropres(construireEtatsIfrs(EX, lignesN(-300), REGLES, LOCATION, 'AUCUNE'), ouverture, [
      mvt({ type: 'TRANSFERT', composante: 'RESERVES', montant: 30 }),
    ]);
    expect(v.motifsNonPubliable.join(' ')).toMatch(/transferts entre composantes ne se soldent pas \(30\)/);
  });

  it('refus · sans ouverture, un apport négatif, une distribution positive, un mouvement sans justification', () => {
    const cloture = construireEtatsIfrs(EX, lignesN(-300), REGLES, LOCATION, 'AUCUNE');
    expect(() => construireVariationCapitauxPropres(cloture, null, [])).toThrow(RefusIfrs);
    expect(motifRefusMouvementCp(mvt({ type: 'APPORT', montant: -10 }))).toMatch(/son montant est positif/);
    expect(motifRefusMouvementCp(mvt({ type: 'DISTRIBUTION', montant: 10 }))).toMatch(/son montant est négatif/);
    expect(motifRefusMouvementCp(mvt({ justification: ' ' }))).toMatch(/sans justification/);
    expect(() => construireVariationCapitauxPropres(cloture, ouverture, [mvt({ montant: 0 })])).toThrow(/sans montant/);
  });
});

describe('variation des capitaux propres consolidée · la colonne des minoritaires (§ 107 a, IFRS 10 § B94)', () => {
  // États consolidés chiffrés à la main · les attributions sont LUES sur l'état
  // du résultat global. Ouverture · capital 500, réserves 300, minoritaires 100.
  // Clôture · résultat du groupe 200 et OCI 10, minoritaires 100 + 40 + 5 − 15.
  const etatConso = (x: { reserves: number; resultat: number; oci: number; nci: number; rn?: [number, number]; rg?: [number, number] }) =>
    ({
      situation: [
        { cle: 'SF_CAPITAL', ifrs: 500 }, { cle: 'SF_RESERVES', ifrs: x.reserves }, { cle: 'SF_RESULTAT', ifrs: x.resultat },
        { cle: 'SF_OCI_EXERCICE', ifrs: x.oci }, { cle: 'SF_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE', ifrs: x.nci },
      ],
      resultat: [
        { cle: 'RN_PROPRIETAIRES', ifrs: x.rn?.[0] ?? 0 }, { cle: 'RN_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE', ifrs: x.rn?.[1] ?? 0 },
      ],
      resultatGlobal: [
        { cle: 'RG_PROPRIETAIRES', ifrs: x.rg?.[0] ?? 0 }, { cle: 'RG_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE', ifrs: x.rg?.[1] ?? 0 },
      ],
    }) as any;
  const OUV = etatConso({ reserves: 300, resultat: 0, oci: 0, nci: 100 });
  const CLO = etatConso({ reserves: 300, resultat: 200, oci: 10, nci: 130, rn: [200, 40], rg: [210, 45] });
  const DIV_NCI: MouvementCpDeclare = { type: 'DISTRIBUTION', composante: 'MINORITAIRES', montant: -15, libelle: 'Dividende de la filiale aux minoritaires', justification: 'PV AGO filiale' };
  const L = (v: ReturnType<typeof construireVariationCapitauxPropresConsolidee>, cle: string) => v.lignes.find((l) => l.cle === cle);

  it('le résultat et les autres éléments se répartissent comme l’état du résultat global les attribue, la clôture boucle', () => {
    const v = construireVariationCapitauxPropresConsolidee(CLO, OUV, [DIV_NCI]);
    expect(L(v, 'RESULTAT_NET')).toMatchObject({ reserves: 200, groupe: 200, minoritaires: 40, total: 240 });
    expect(L(v, 'OCI')).toMatchObject({ autres: 10, minoritaires: 5 });
    expect(L(v, 'DISTRIBUTIONS')).toMatchObject({ groupe: 0, minoritaires: -15, total: -15 });
    expect(L(v, 'CLOTURE')).toMatchObject({ groupe: 1010, minoritaires: 130, total: 1140 });
    expect(L(v, 'ECART_NON_EXPLIQUE')).toBeUndefined();
    expect(v.motifsNonPubliable).toEqual([]);
  });

  it('un dividende des minoritaires non déclaré reste un écart, dans leur colonne', () => {
    const v = construireVariationCapitauxPropresConsolidee(CLO, OUV, []);
    expect(L(v, 'ECART_NON_EXPLIQUE')).toMatchObject({ groupe: 0, minoritaires: -15 });
    expect(v.motifsNonPubliable.join(' ')).toContain('participations ne donnant pas le contrôle -15');
  });

  it('§ 107 c iii · une variation de parts d’intérêts sans perte du contrôle a sa ligne', () => {
    const achat: MouvementCpDeclare[] = [
      { type: 'VARIATION_PARTS_INTERETS', composante: 'MINORITAIRES', montant: -20, libelle: 'Rachat de 5 % aux minoritaires', justification: 'Acte de cession' },
      { type: 'VARIATION_PARTS_INTERETS', composante: 'RESERVES', montant: -4, libelle: 'Surcoût du rachat', justification: 'Acte de cession' },
    ];
    const clo = etatConso({ reserves: 296, resultat: 200, oci: 10, nci: 110, rn: [200, 40], rg: [210, 45] });
    const v = construireVariationCapitauxPropresConsolidee(clo, OUV, [DIV_NCI, ...achat]);
    expect(L(v, 'VARIATIONS_PARTS_INTERETS')).toMatchObject({ reserves: -4, minoritaires: -20, total: -24 });
    expect(L(v, 'ECART_NON_EXPLIQUE')).toBeUndefined();
  });

  it('les comptes individuels n’ont ni minoritaires ni variation de parts d’intérêts, et n’en montrent pas la colonne', () => {
    expect(motifRefusMouvementCp(DIV_NCI)).toMatch(/n’existent que dans les comptes consolidés/);
    expect(motifRefusMouvementCp({ ...DIV_NCI, composante: 'RESERVES', type: 'VARIATION_PARTS_INTERETS', montant: -3 })).toMatch(/§ 107 c iii/);
    expect(motifRefusMouvementCp(DIV_NCI, true)).toBeNull();
    const ind = construireVariationCapitauxPropres(CLO, OUV, []);
    expect(ind.lignes.some((l) => 'minoritaires' in l || l.cle === 'VARIATIONS_PARTS_INTERETS')).toBe(false);
  });
});

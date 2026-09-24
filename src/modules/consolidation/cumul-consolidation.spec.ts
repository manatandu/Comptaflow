import {
  AcquisitionDeclaree,
  cumulerConsolidation,
  EntiteACumuler,
  ConversionIndividuelle,
  FiscaliteEntite,
  LigneBalanceEntree,
  OperationReciproque,
  ResultatInterne,
} from './cumul-consolidation';

/**
 * CUMUL ET ÉLIMINATIONS · chaque cas est chiffré à la main dans son
 * commentaire, parce qu'un montant de consolidation « plausible » est
 * exactement ce que ce moteur ne doit pas rendre.
 */
const EX = { dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
const b = (lignes: [string, number][]): LigneBalanceEntree[] => lignes.map(([numero, solde]) => ({ numero, intitule: numero, solde }));
const ent = (id: string, methode: EntiteACumuler['methode'], pctInteret: number, balance: LigneBalanceEntree[] | null, estConsolidante = false): EntiteACumuler => ({
  id,
  nom: id,
  estConsolidante,
  methode,
  pctInteret,
  balance,
});
const acq = (detentriceId: string, detenueId: string, pct: number, cout: number, cpEntree: number, extra: Partial<AcquisitionDeclaree> = {}): AcquisitionDeclaree => ({
  detentriceId,
  detenueId,
  pctCapital: pct,
  coutAcquisition: cout,
  compteTitres: '26100000',
  dateEntree: new Date('2024-01-01'),
  capitauxPropresEntree: cpEntree,
  modeDureeEcart: 'NON_DETERMINABLE',
  ...extra,
});
const ligne = (r: ReturnType<typeof cumulerConsolidation>, cle: string) => r.lignes.find((l) => l.cle === cle)?.solde ?? 0;

// Mère · titres 800, autres actifs 1 200, capital 1 000, réserves 500, produits 700, charges 200.
const M = ent('M', 'IG', 100, b([['26100000', 800], ['24100000', 1200], ['10100000', -1000], ['11800000', -500], ['70100000', -700], ['60100000', 200]]), true);
// Filiale · actifs 2 000, capital 1 000, réserves 600, produits 1 000, charges 600 (résultat 400).
const F = ent('F', 'IG', 80, b([['24500000', 2000], ['10100000', -1000], ['11800000', -600], ['70100000', -1000], ['60100000', 600]]));

describe('intégration globale, écart d’acquisition, intérêts minoritaires', () => {
  // Coût 800, capitaux propres à l'entrée 900, 80 % · quote-part 720, écart 80.
  // Dix ans (durée non déterminable) depuis janvier 2024 · 24 mois à l'ouverture
  // (16), 36 à la clôture (24), dotation de l'exercice 8.
  const r = cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 800, 900)], []);

  it('les titres disparaissent, l’écart d’acquisition apparaît avec son plan (art. 81 et 82)', () => {
    expect(ligne(r, '26100000')).toBe(0);
    expect(ligne(r, 'ECART_ACQUISITION')).toBe(80);
    expect(ligne(r, 'AMORTISSEMENT_ECART_ACQUISITION')).toBe(-24);
    expect(ligne(r, 'DOTATION_ECART_ACQUISITION')).toBe(8);
    expect(r.ecarts[0]).toMatchObject({ ecart: 80, dureeAnnees: 10, amortissementCumuleOuverture: 16, dotationExercice: 8 });
  });

  it('les capitaux propres se partagent · réserves groupe = mère + 80 % du post-acquisition − amortissements antérieurs', () => {
    // 500 + 0,8 × (1 600 − 900) − 16 = 1 044 ; minoritaires 20 % × 1 600 = 320.
    expect(r.capitauxPropres).toMatchObject({
      capital: 1000,
      reservesGroupe: 1044,
      interetsMinoritairesHorsResultat: 320,
      resultatGroupe: 812, // 500 − 8 + 0,8 × 400
      resultatMinoritaires: 80,
      resultatEnsemble: 892,
    });
  });

  it('la balance consolidée est équilibrée', () => {
    expect(r.equilibre).toBe(0);
    expect(ligne(r, '24100000') + ligne(r, '24500000')).toBe(3200);
  });
});

describe('chaîne M → A → B · la consolidation directe rend ce que rendraient les paliers (ch. XII-5 § 7)', () => {
  // B · capital 500, réserves 300 ; entrée à 500, A la détient à 60 % pour 300.
  // A · titres B 300, autres actifs 700, capital 600, réserves 400 ; entrée à 600, M à 80 % pour 480.
  // Paliers, calculés à la main · sous-groupe A = 1 000 − 300 + 0,6 × 800 = 1 180 ;
  // minoritaires = 0,4 × 800 + 0,2 × 1 180 = 556 ; groupe = 0,8 × 1 180 − 480 = 464.
  const B = ent('B', 'IG', 48, b([['24100000', 800], ['10100000', -500], ['11800000', -300]]));
  const A = ent('A', 'IG', 80, b([['26100000', 300], ['24100000', 700], ['10100000', -600], ['11800000', -400]]));
  const M2 = ent('M', 'IG', 100, b([['26100000', 480], ['24100000', 520], ['10100000', -1000]]), true);
  const r = cumulerConsolidation(EX, [M2, A, B], [acq('M', 'A', 80, 480, 600), acq('A', 'B', 60, 300, 500)], []);

  it('minoritaires 556, réserves groupe 464, aucun écart', () => {
    expect(r.capitauxPropres.interetsMinoritairesHorsResultat).toBe(556);
    expect(r.capitauxPropres.reservesGroupe).toBe(464);
    expect(r.ecarts.every((e) => e.ecart === 0)).toBe(true);
    expect(r.equilibre).toBe(0);
  });
});

describe('mise en équivalence (art. 81, al. 3 · ch. XII-5 § 6)', () => {
  // E · capitaux propres 1 200 et résultat 100 ; M à 30 % pour 300, entrée à 1 000.
  // Valeur des titres = 0,3 × 1 300 = 390 ; quote-part de résultat 30 ; le reste, 60, en réserves.
  const E = ent('E', 'ME', 30, b([['24100000', 1300], ['10100000', -1000], ['11800000', -200], ['70100000', -100]]));
  const Mme = ent('M', 'IG', 100, b([['26300000', 300], ['24100000', 700], ['10100000', -1000]]), true);

  it('la valeur des titres est la quote-part des capitaux propres, résultat compris', () => {
    const r = cumulerConsolidation(EX, [Mme, E], [acq('M', 'E', 30, 300, 1000, { compteTitres: '26300000' })], []);
    expect(ligne(r, 'TITRES_MIS_EN_EQUIVALENCE')).toBe(390);
    expect(ligne(r, 'QUOTE_PART_RESULTAT_ME')).toBe(-30);
    expect(ligne(r, '24100000')).toBe(700); // les actifs de E ne sont PAS cumulés
    expect(r.capitauxPropres).toMatchObject({ reservesGroupe: 60, resultatGroupe: 30, interetsMinoritairesHorsResultat: 0 });
    expect(r.equilibre).toBe(0);
  });

  it('une quote-part négative est retenue pour zéro, et le dit ; déclarée, elle passe en provision', () => {
    const Eneg = ent('E', 'ME', 30, b([['24100000', 100], ['10100000', -1000], ['11800000', 1500], ['70100000', -100], ['60100000', 0], ['40100000', -500]]));
    const zero = cumulerConsolidation(EX, [Mme, Eneg], [acq('M', 'E', 30, 300, 1000, { compteTitres: '26300000' })], []);
    expect(ligne(zero, 'TITRES_MIS_EN_EQUIVALENCE')).toBe(0);
    expect(zero.avertissements.join(' ')).toContain('valeur nulle');
    expect(zero.equilibre).toBe(0);
    const prov = cumulerConsolidation(EX, [Mme, Eneg], [acq('M', 'E', 30, 300, 1000, { compteTitres: '26300000', obligationNonDesengagement: true })], []);
    expect(ligne(prov, 'PROVISION_ME_NEGATIVE')).toBe(-120); // 0,3 × (−400)
    expect(prov.equilibre).toBe(0);
  });
});

describe('dividendes intra-groupe (art. 86, 4° · ch. XII-5 § 4)', () => {
  it('sortent du résultat et rejoignent les réserves', () => {
    const Md = ent('M', 'IG', 100, b([['26100000', 800], ['24100000', 1150], ['10100000', -1000], ['11800000', -500], ['70100000', -700], ['77210000', -50], ['60100000', 300]]), true);
    const sans = cumulerConsolidation(EX, [Md, F], [acq('M', 'F', 80, 800, 900)], []);
    const avec = cumulerConsolidation(EX, [Md, F], [acq('M', 'F', 80, 800, 900, { dividendesExercice: 50, compteDividendes: '77210000' })], []);
    expect(ligne(avec, '77210000')).toBe(0);
    expect(avec.capitauxPropres.resultatGroupe).toBe(sans.capitauxPropres.resultatGroupe - 50);
    expect(avec.capitauxPropres.reservesGroupe).toBe(sans.capitauxPropres.reservesGroupe + 50);
    expect(avec.equilibre).toBe(0);
  });
});

describe('comptes réciproques (art. 86, 6°)', () => {
  const Mr = ent('M', 'IG', 100, b([['26100000', 800], ['41100000', 100], ['24100000', 1100], ['10100000', -1000], ['11800000', -500], ['70100000', -700], ['60100000', 200]]), true);
  const Fr = ent('F', 'IG', 80, b([['24500000', 2100], ['40100000', -100], ['10100000', -1000], ['11800000', -600], ['70100000', -1000], ['60100000', 600]]));
  const recip: OperationReciproque = { entiteAId: 'M', compteA: '41100000', entiteBId: 'F', compteB: '40100000', montant: 100, libelle: 'Créance M sur F' };

  it('la créance et la dette s’annulent des deux côtés', () => {
    const r = cumulerConsolidation(EX, [Mr, Fr], [acq('M', 'F', 80, 800, 900)], [recip]);
    expect(ligne(r, '41100000')).toBe(0);
    expect(ligne(r, '40100000')).toBe(0);
    expect(r.equilibre).toBe(0);
  });

  it('une vente interne éliminée ne déplace RIEN entre groupe et minoritaires', () => {
    const vente: OperationReciproque = { entiteAId: 'M', compteA: '70100000', entiteBId: 'F', compteB: '60100000', montant: 300, libelle: 'Vente M à F' };
    const sans = cumulerConsolidation(EX, [Mr, Fr], [acq('M', 'F', 80, 800, 900)], []);
    const avec = cumulerConsolidation(EX, [Mr, Fr], [acq('M', 'F', 80, 800, 900)], [vente]);
    expect(avec.capitauxPropres.resultatGroupe).toBe(sans.capitauxPropres.resultatGroupe);
    expect(avec.capitauxPropres.resultatMinoritaires).toBe(sans.capitauxPropres.resultatMinoritaires);
    expect(ligne(avec, '70100000')).toBe(ligne(sans, '70100000') + 300);
  });

  it('deux comptes de même sens, ou un montant qui excède un solde, sont refusés', () => {
    expect(() => cumulerConsolidation(EX, [Mr, Fr], [acq('M', 'F', 80, 800, 900)], [{ ...recip, compteB: '24500000' }])).toThrow(/sens contraire/);
    expect(() => cumulerConsolidation(EX, [Mr, Fr], [acq('M', 'F', 80, 800, 900)], [{ ...recip, montant: 150 }])).toThrow(/confirmation de solde/);
  });
});

describe('intégration proportionnelle (art. 81, al. 2 · ch. XII-5 § 5)', () => {
  // P · actifs 1 000, capital 800, résultat 200 ; M à 50 % pour 400, entrée à 800.
  const P = ent('P', 'IP', 50, b([['24100000', 1000], ['10100000', -800], ['70100000', -200]]));
  const Mp = ent('M', 'IG', 100, b([['26200000', 400], ['41100000', 100], ['10100000', -500]]), true);

  it('la fraction est cumulée, sans intérêts minoritaires', () => {
    const r = cumulerConsolidation(EX, [Mp, P], [acq('M', 'P', 50, 400, 800, { compteTitres: '26200000' })], []);
    expect(ligne(r, '24100000')).toBe(500);
    expect(r.capitauxPropres).toMatchObject({ interetsMinoritairesHorsResultat: 0, resultatMinoritaires: 0, resultatGroupe: 100 });
    expect(r.equilibre).toBe(0);
  });

  it('un compte réciproque avec une entité IP ne s’élimine que dans la limite de sa fraction', () => {
    const P2 = ent('P', 'IP', 50, b([['24100000', 1100], ['40100000', -100], ['10100000', -800], ['70100000', -200]]));
    const r = cumulerConsolidation(EX, [Mp, P2], [acq('M', 'P', 50, 400, 800, { compteTitres: '26200000' })], [
      { entiteAId: 'M', compteA: '41100000', entiteBId: 'P', compteB: '40100000', montant: 100, libelle: 'Prêt' },
    ]);
    // 50 éliminés de chaque côté · 50 de créance restent, « assimilés à une créance envers l'extérieur ».
    expect(ligne(r, '41100000')).toBe(50);
    expect(ligne(r, '40100000')).toBe(0);
  });

  it('une entité IP à deux détentrices est refusée, faute de texte', () => {
    expect(() =>
      cumulerConsolidation(EX, [Mp, P, ent('Q', 'IG', 100, b([['26200000', 10], ['10100000', -10]]))], [
        acq('M', 'P', 50, 400, 800, { compteTitres: '26200000' }),
        acq('Q', 'P', 10, 10, 800, { compteTitres: '26200000' }),
      ], []),
    ).toThrow(/plusieurs/);
  });
});

describe('écart d’acquisition négatif et dépréciation', () => {
  it('l’écart négatif est rapporté au résultat sur sa durée', () => {
    // Coût 600, quote-part 720 · écart −120 sur 5 ans · 24 mois à l'ouverture (48), 36 à la clôture (72).
    const r = cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 600, 900, { modeDureeEcart: 'LIMITEE', dureeEcartAnnees: 5 })], []);
    expect(ligne(r, 'ECART_ACQUISITION_NEGATIF')).toBe(-48);
    expect(ligne(r, 'REPRISE_ECART_ACQUISITION_NEGATIF')).toBe(-24);
  });

  it('la dépréciation s’ajoute à la dotation, et ne se reprend jamais', () => {
    const r = cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 800, 900, { depreciationEcartOuverture: 5, depreciationEcartCloture: 12 })], []);
    expect(ligne(r, 'DEPRECIATION_ECART_ACQUISITION')).toBe(-12);
    expect(ligne(r, 'DOTATION_ECART_ACQUISITION')).toBe(15);
    expect(() =>
      cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 800, 900, { depreciationEcartOuverture: 12, depreciationEcartCloture: 5 })], []),
    ).toThrow(/jamais reprise/);
  });

  it('un écart sans durée est refusé (art. 82)', () => {
    expect(() => cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 800, 900, { modeDureeEcart: 'LIMITEE' })], [])).toThrow(/art\. 82/);
  });
});

describe('refus et signalements', () => {
  it('une balance manquante ou déséquilibrée arrête le cumul', () => {
    expect(() => cumulerConsolidation(EX, [M, ent('F', 'IG', 80, null)], [], [])).toThrow(/balance de « F » manque/);
    expect(() => cumulerConsolidation(EX, [M, ent('F', 'IG', 80, b([['24100000', 10]]))], [], [])).toThrow(/pas équilibrée/);
  });

  it('une entrée en cours d’exercice est refusée, la part de résultat antérieure ne se lisant pas', () => {
    expect(() => cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 800, 900, { dateEntree: new Date('2026-04-01') })], [])).toThrow(
      /en cours d’exercice/,
    );
  });

  it('une subvention d’investissement (14) d’une filiale est signalée, avec les deux paragraphes qui ne s’articulent pas', () => {
    const F14 = ent('F', 'IG', 80, b([['24500000', 2100], ['14100000', -100], ['10100000', -1000], ['11800000', -600], ['70100000', -1000], ['60100000', 600]]));
    const r = cumulerConsolidation(EX, [M, F14], [acq('M', 'F', 80, 800, 900)], []);
    expect(r.avertissements.join(' ')).toMatch(/« F » porte des subventions d’investissement \(14\).*ch\. XII-8 § 2.*ch\. XII-3 § 2/);
  });

  it('des titres déclarés au-delà du solde du compte sont signalés', () => {
    const r = cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 900, 900)], []);
    expect(r.avertissements.join(' ')).toContain('vérifiez le compte ou le coût');
  });
});

describe('balances déjà clôturées', () => {
  it('un résultat porté au compte 13 reste du résultat, partagé comme lui', () => {
    // Même filiale, mais clôturée · ses produits et charges sont soldés au 13.
    const Fc = ent('F', 'IG', 80, b([['24500000', 2000], ['10100000', -1000], ['11800000', -600], ['13100000', -400]]));
    const r = cumulerConsolidation(EX, [M, Fc], [acq('M', 'F', 80, 800, 900)], []);
    expect(r.capitauxPropres).toMatchObject({ reservesGroupe: 1044, resultatGroupe: 812, resultatMinoritaires: 80 });
    expect(ligne(r, 'RESULTAT_DEJA_CONSTATE')).toBe(-400);
    expect(r.equilibre).toBe(0);
  });
});

/**
 * ORACLES · les quatre applications chiffrées du cours de S. Bamba Makola
 * (CPCC, « Consolidation des comptes en système comptable OHADA révisé »,
 * version du 10 novembre 2025, ch. 3). UN COURS N'EST PAS UNE SOURCE · il
 * confirme ici l'arithmétique du moteur, la règle vient du D4C. Deux écarts
 * de mise en scène, dits et non corrigés dans le cours :
 * - le cours n'y calcule jamais d'écart d'acquisition · les capitaux propres à
 *   l'entrée sont donc déclarés égaux au coût divisé par le pourcentage, ce qui
 *   rend un écart nul, comme le cours le suppose ;
 * - le cas A date l'acquisition du 1er juillet 2021 « lors de la création »,
 *   et BLEU CIEL porte pourtant 80 000 de réserves au 31 décembre · le cours
 *   traite tout comme postérieur à l'acquisition, d'où une entrée à
 *   l'ouverture ici (le moteur refuse l'entrée en cours d'exercice).
 */
describe('oracles · cours de consolidation CPCC (Bamba Makola, ch. 3)', () => {
  const EX21 = { dateDebut: new Date('2021-01-01'), dateFin: new Date('2021-12-31') };
  const entree = new Date('2021-01-01');
  const ginger = (titres: [string, number][], ac: number, passif: number) =>
    ent('GINGER', 'IG', 100, b([['24100000', 2700000], ...titres, ['52100000', ac], ['10100000', -2000000], ['11800000', -500000], ['70100000', -8000000], ['60100000', 7900000], ['40100000', -passif]]), true);
  const bleuCiel = (methode: 'IG' | 'IP', pct: number) =>
    ent('BLEU CIEL', methode, pct, b([['24100000', 200000], ['52100000', 110000], ['10100000', -100000], ['11800000', -80000], ['70100000', -900000], ['60100000', 870000], ['40100000', -100000]]));

  it('A · intégration globale à 55 % · réserves consolidées 544 000, résultat groupe 116 500, minoritaires 94 500', () => {
    const r = cumulerConsolidation(EX21, [ginger([['26100000', 55000]], 245000, 400000), bleuCiel('IG', 55)], [
      acq('GINGER', 'BLEU CIEL', 55, 55000, 100000, { dateEntree: entree }),
    ], []);
    expect(r.capitauxPropres).toMatchObject({ capital: 2000000, reservesGroupe: 544000, resultatGroupe: 116500, resultatEnsemble: 130000 });
    expect(r.capitauxPropres.interetsMinoritairesHorsResultat + r.capitauxPropres.resultatMinoritaires).toBe(94500);
    expect(ligne(r, '24100000')).toBe(2900000);
    expect(ligne(r, '52100000')).toBe(355000);
    expect(r.equilibre).toBe(0);
  });

  it('B · intégration proportionnelle à 50 % · réserves 540 000, résultat 115 000, aucun minoritaire', () => {
    const r = cumulerConsolidation(EX21, [ginger([['26200000', 50000]], 250000, 400000), bleuCiel('IP', 50)], [
      acq('GINGER', 'BLEU CIEL', 50, 50000, 100000, { dateEntree: entree, compteTitres: '26200000' }),
    ], []);
    expect(r.capitauxPropres).toMatchObject({ reservesGroupe: 540000, resultatGroupe: 115000, interetsMinoritairesHorsResultat: 0, resultatMinoritaires: 0 });
    expect(ligne(r, '24100000')).toBe(2800000);
    expect(ligne(r, '70100000')).toBe(-8450000);
    expect(ligne(r, '60100000')).toBe(8335000);
    expect(r.equilibre).toBe(0);
  });

  it('C · mise en équivalence à 25 % · titres 110 000, réserves 1 020 000, résultat 290 000', () => {
    const gm = ent('GINGER', 'IG', 100, b([['24100000', 1950000], ['26300000', 50000], ['26800000', 10000], ['52100000', 2750000], ['10100000', -1000000], ['11800000', -975000], ['13100000', -275000], ['19100000', -250000], ['40100000', -2260000]]), true);
    const bc = ent('BLEU CIEL', 'ME', 25, b([['24100000', 400000], ['52100000', 460000], ['10100000', -200000], ['11800000', -180000], ['13100000', -60000], ['40100000', -420000]]));
    const r = cumulerConsolidation(EX21, [gm, bc], [acq('GINGER', 'BLEU CIEL', 25, 50000, 200000, { dateEntree: entree, compteTitres: '26300000' })], []);
    expect(ligne(r, 'TITRES_MIS_EN_EQUIVALENCE')).toBe(110000);
    expect(ligne(r, '26800000')).toBe(10000); // GECAMINES, non consolidée, reste au coût
    expect(r.capitauxPropres).toMatchObject({ reservesGroupe: 1020000, resultatGroupe: 290000 });
    expect(r.equilibre).toBe(0);
  });

  it('D et E · chaîne AMOR → BOUMAT 80 % → KONGO CEMENT 60 % · réserves 118 000, résultat 94 800, minoritaires 97 200', () => {
    const amor = ent('AMOR', 'IG', 100, b([['24100000', 400000], ['26100000', 150000], ['31100000', 100000], ['10100000', -450000], ['11800000', -100000], ['13100000', -50000], ['40100000', -50000]]), true);
    const boumat = ent('BOUMAT', 'IG', 80, b([['24100000', 200000], ['26100000', 50000], ['31100000', 20000], ['10100000', -150000], ['11800000', -50000], ['13100000', -50000], ['40100000', -20000]]));
    const kc = ent('KONGO CEMENT', 'IG', 48, b([['24100000', 100000], ['31100000', 40000], ['10100000', -80000], ['11800000', -20000], ['13100000', -10000], ['40100000', -30000]]));
    const r = cumulerConsolidation(EX21, [amor, boumat, kc], [
      acq('AMOR', 'BOUMAT', 80, 150000, 187500, { dateEntree: entree }),
      acq('BOUMAT', 'KONGO CEMENT', 60, 50000, 83333.33, { dateEntree: entree }),
    ], []);
    expect(r.capitauxPropres).toMatchObject({ capital: 450000, reservesGroupe: 118000, resultatGroupe: 94800 });
    expect(r.capitauxPropres.interetsMinoritairesHorsResultat + r.capitauxPropres.resultatMinoritaires).toBe(97200);
    expect(ligne(r, '24100000')).toBe(700000);
    expect(ligne(r, '31100000')).toBe(160000);
    expect(r.equilibre).toBe(0);
  });
});

describe('le compte 10 de la consolidante · capital, primes et réévaluation séparés (D4C ch. XII-8 § 2)', () => {
  // Mère · capital 1 000 dont 100 non appelé (109), primes 300, réévaluation 200.
  // Filiale · capital 800, primes 200 (tout part en réserves et minoritaires).
  const M2 = ent('M', 'IG', 100, b([['26100000', 800], ['24100000', 700], ['10110000', -1000], ['10900000', 100], ['10500000', -300], ['10600000', -200], ['70100000', -100], ['60100000', 0]]), true);
  const F2 = ent('F', 'IG', 80, b([['24500000', 1000], ['10100000', -800], ['10500000', -200]]));
  const r = cumulerConsolidation(EX, [M2, F2], [acq('M', 'F', 80, 800, 1000)], []);

  it('le capital n’est que 101 à 104 et 109 ; 105 et 106 ont leur poste', () => {
    // Capital 1 000 − 100 = 900 ; primes 300 ; réévaluation 200.
    expect(r.capitauxPropres).toMatchObject({ capital: 900, primes: 300, ecartsReevaluation: 200 });
    expect(ligne(r, 'CAPITAL')).toBe(-900);
    expect(ligne(r, 'PRIMES_CONSOLIDANTE')).toBe(-300);
    expect(ligne(r, 'ECARTS_REEVALUATION_CONSOLIDANTE')).toBe(-200);
  });

  it('les primes d’une filiale se partagent comme le reste de ses capitaux propres', () => {
    // Quote-part d'entrée 0,8 × 1 000 = 800 = coût · écart nul, réserves groupe 0, minoritaires 200.
    expect(r.capitauxPropres).toMatchObject({ reservesGroupe: 0, interetsMinoritairesHorsResultat: 200 });
    expect(r.equilibre).toBe(0);
  });

  it('la subvention d’investissement de la consolidante est signalée comme celle d’une filiale', () => {
    const M3 = ent('M', 'IG', 100, b([['24100000', 500], ['10100000', -400], ['14100000', -100]]), true);
    const s = cumulerConsolidation(EX, [M3], [], []);
    expect(s.avertissements.join(' ')).toMatch(/« M » porte des subventions d’investissement/);
  });
});

describe('résultats internes inclus dans les actifs (art. 86, 4°)', () => {
  // Mère · titres 800, stock 300, banque 900, capital 1 000, réserves 500,
  // ventes 1 000, achats 500. Filiale 80 % · stock 500, banque 1 500,
  // capital 1 000, réserves 600, ventes 1 000, achats 600 (résultat 400).
  // Capitaux propres à l'entrée 1 000 · coût 800 = 0,8 × 1 000, écart nul.
  const M = ent('M', 'IG', 100, b([['26100000', 800], ['31100000', 300], ['52100000', 900], ['10100000', -1000], ['11800000', -500], ['70100000', -1000], ['60100000', 500]]), true);
  const F = ent('F', 'IG', 80, b([['31100000', 500], ['52100000', 1500], ['10100000', -1000], ['11800000', -600], ['70100000', -1000], ['60100000', 600]]));
  const A = [acq('M', 'F', 80, 800, 1000)];
  const sans = cumulerConsolidation(EX, [M, F], A, []);
  const ri = (vendeuseId: string, acheteuseId: string, extra: Partial<ResultatInterne> = {}): ResultatInterne => ({
    vendeuseId,
    acheteuseId,
    nature: 'STOCK',
    compteActif: '31100000',
    margeOuverture: 40,
    margeCloture: 100,
    libelle: 'marge sur stock',
    ...extra,
  });

  it('la consolidante vend · le stock perd la marge de clôture, le résultat la variation, les réserves l’ouverture, tout au groupe', () => {
    const r = cumulerConsolidation(EX, [M, F], A, [], [ri('M', 'F')]);
    expect(ligne(r, '31100000')).toBe(ligne(sans, '31100000') - 100);
    expect(ligne(r, 'ELIMINATION_RESULTATS_INTERNES')).toBe(60);
    expect(r.capitauxPropres.resultatGroupe).toBe(sans.capitauxPropres.resultatGroupe - 60);
    expect(r.capitauxPropres.reservesGroupe).toBe(sans.capitauxPropres.reservesGroupe - 40);
    expect(r.capitauxPropres.resultatMinoritaires).toBe(sans.capitauxPropres.resultatMinoritaires);
    expect(r.equilibre).toBe(0);
  });

  it('la filiale à 80 % vend · la vendeuse porte l’élimination, partagée 80 / 20', () => {
    const r = cumulerConsolidation(EX, [M, F], A, [], [ri('F', 'M', { margeCloture: 100, margeOuverture: 40 })]);
    // Résultat · −60 dont −48 groupe, −12 minoritaires. Réserves · −40 dont −32 et −8.
    expect(r.capitauxPropres.resultatGroupe).toBe(sans.capitauxPropres.resultatGroupe - 48);
    expect(r.capitauxPropres.resultatMinoritaires).toBe(sans.capitauxPropres.resultatMinoritaires - 12);
    expect(r.capitauxPropres.reservesGroupe).toBe(sans.capitauxPropres.reservesGroupe - 32);
    expect(r.capitauxPropres.interetsMinoritairesHorsResultat).toBe(sans.capitauxPropres.interetsMinoritairesHorsResultat - 8);
    expect(r.equilibre).toBe(0);
  });

  it('une entité intégrée proportionnellement · au produit des pourcentages d’intégration (D4C ch. XII-5 § 6)', () => {
    const P = ent('F', 'IP', 50, F.balance!);
    const r = cumulerConsolidation(EX, [M, P], [acq('M', 'F', 50, 500, 1000)], [], [ri('M', 'F', { margeOuverture: 0 })]);
    const s = cumulerConsolidation(EX, [M, P], [acq('M', 'F', 50, 500, 1000)], []);
    expect(ligne(r, 'ELIMINATION_RESULTATS_INTERNES')).toBe(50);
    expect(ligne(r, '31100000')).toBe(ligne(s, '31100000') - 50);
  });

  it('quatre refus · mise en équivalence, même entité, marge négative, marge au-delà du solde de l’actif', () => {
    const ME = ent('F', 'ME', 30, F.balance!);
    expect(() => cumulerConsolidation(EX, [M, ME], [acq('M', 'F', 30, 300, 1000)], [], [ri('M', 'F')])).toThrow(/mise en équivalence/);
    expect(() => cumulerConsolidation(EX, [M, F], A, [], [ri('F', 'F')])).toThrow(/même entité/);
    expect(() => cumulerConsolidation(EX, [M, F], A, [], [ri('M', 'F', { margeCloture: -5 })])).toThrow(/positive/);
    expect(() => cumulerConsolidation(EX, [M, F], A, [], [ri('M', 'F', { margeCloture: 600 })])).toThrow(/excède le solde/);
  });

  it('une immobilisation s’inscrit en classe 2, un stock en classe 3', () => {
    expect(() => cumulerConsolidation(EX, [M, F], A, [], [ri('M', 'F', { nature: 'IMMOBILISATION' })])).toThrow(/classe 2/);
  });
});

describe('tranche 4a · écarts d’évaluation et impôts différés (art. 82 et 92, D4C ch. XII-3 § 3 et XII-6)', () => {
  const fiscal = (entiteId: string, tauxImpot: number | null, extra: Partial<FiscaliteEntite> = {}): FiscaliteEntite => ({
    entiteId,
    tauxImpot,
    idaOuverture: 0,
    idaCloture: 0,
    idpOuverture: 0,
    idpCloture: 0,
    ...extra,
  });
  const FISC = [fiscal('M', 30), fiscal('F', 30)];
  const batiment = { compte: '23100000', compteAmortissement: '28310000', libelle: 'Bâtiment', montant: 100, mode: 'AMORTISSABLE' as const, dureeAnnees: 5 };

  describe('un bâtiment réestimé de 100, amorti sur cinq ans depuis janvier 2024, taux 30 %', () => {
    // Capitaux propres réestimés · 900 + 100 × 0,7 = 970 ; quote-part 80 % = 776 ; écart d'acquisition 24.
    // Écart d'évaluation · 40 amortis à l'ouverture (24 mois / 60), 60 à la clôture · reste 60 puis 40.
    // Impôt différé passif · 30 % × 40 = 12 ; produit d'impôt de l'exercice · 30 % × 20 = 6.
    // F partage · capitaux propres 1 600 + 60 × 0,7 = 1 642 ; résultat 400 − 20 + 6 = 386.
    const r = cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 800, 900, { ecartsEvaluation: [batiment] })], [], [], FISC);

    it('l’écart d’évaluation passe en priorité, l’écart d’acquisition n’est que le reste (art. 82)', () => {
      expect(r.ecarts[0]).toMatchObject({ quotePartCapitauxPropresEntree: 776, ecart: 24, dotationExercice: 2.4 });
      expect(ligne(r, '23100000')).toBe(100);
      expect(ligne(r, '28310000')).toBe(-60);
      expect(ligne(r, 'ECARTS_EVALUATION_RESULTAT')).toBe(20);
    });

    it('l’impôt différé passif et son produit de l’exercice · jamais sur l’écart d’acquisition', () => {
      expect(ligne(r, 'IMPOTS_DIFFERES_PASSIF')).toBe(-12);
      expect(ligne(r, 'IMPOTS_DIFFERES_ACTIF')).toBe(0);
      expect(ligne(r, 'IMPOTS_DIFFERES_RESULTAT')).toBe(-6);
      expect(r.ecartsEvaluation[0]).toMatchObject({ restantOuverture: 60, restantCloture: 40, impotDiffereCloture: -12, tauxImpot: 30 });
    });

    it('il appartient aux majoritaires ET aux minoritaires (ch. XII-6 § 3)', () => {
      // Réserves groupe · 500 + 0,8 × (1 642 − 970) − 4,8 = 1 032,8 ; minoritaires · 20 % × 1 642 = 328,4.
      // Résultat groupe · 500 − 2,4 + 0,8 × 386 = 806,4 ; minoritaires · 20 % × 386 = 77,2.
      expect(r.capitauxPropres).toMatchObject({
        reservesGroupe: 1032.8,
        interetsMinoritairesHorsResultat: 328.4,
        resultatGroupe: 806.4,
        resultatMinoritaires: 77.2,
        resultatEnsemble: 883.6,
      });
      expect(r.equilibre).toBe(0);
      expect(r.impotsDifferesIncomplets).toEqual([]);
    });
  });

  it('un stock réestimé puis vendu dans l’exercice · tout passe au résultat, le tableau des flux en est averti', () => {
    const stock = { compte: '31100000', libelle: 'Stock', montant: 50, mode: 'REALISE' as const, dateRealisation: new Date('2026-06-30') };
    const r = cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 800, 900, { ecartsEvaluation: [stock] })], [], [], FISC);
    expect(ligne(r, '31100000')).toBe(0);
    expect(ligne(r, 'ECARTS_EVALUATION_RESULTAT')).toBe(50);
    expect(ligne(r, 'IMPOTS_DIFFERES_RESULTAT')).toBe(-15);
    expect(ligne(r, 'IMPOTS_DIFFERES_PASSIF')).toBe(0);
    expect(r.ecartsEvaluationStocksResultat).toBe(50);
    expect(r.equilibre).toBe(0);
  });

  it('un passif réestimé en hausse · impôt différé ACTIF, et un écart d’acquisition plus grand', () => {
    // Provision de 100 · capitaux propres réestimés 900 − 70 = 830 ; quote-part 664 ; écart 136.
    const litige = { compte: '19100000', libelle: 'Litige', montant: 100, mode: 'NON_AMORTISSABLE' as const };
    const r = cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 800, 900, { ecartsEvaluation: [litige] })], [], [], FISC);
    expect(r.ecarts[0].ecart).toBe(136);
    expect(ligne(r, '19100000')).toBe(-100);
    expect(ligne(r, 'IMPOTS_DIFFERES_ACTIF')).toBe(30);
    expect(r.equilibre).toBe(0);
  });

  it('refus · sans taux, sur une mise en équivalence, sur les capitaux propres, amortissable hors classe 2', () => {
    expect(() => cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 800, 900, { ecartsEvaluation: [batiment] })], [], [], [fiscal('M', 30), fiscal('F', null)])).toThrow(
      /sans taux d’impôt déclaré/,
    );
    const FME = ent('F', 'ME', 30, F.balance);
    expect(() => cumulerConsolidation(EX, [M, FME], [acq('M', 'F', 30, 800, 900, { ecartsEvaluation: [batiment] })], [], [], FISC)).toThrow(/pas d’écart d’évaluation/);
    expect(() =>
      cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 800, 900, { ecartsEvaluation: [{ ...batiment, compte: '11800000' }] })], [], [], FISC),
    ).toThrow(/jamais aux capitaux propres/);
    expect(() =>
      cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 800, 900, { ecartsEvaluation: [{ ...batiment, compte: '31100000' }] })], [], [], FISC),
    ).toThrow(/amortissable/);
  });

  it('la marge interne éliminée porte un impôt différé ACTIF au taux de la vendeuse (art. 92, 2°)', () => {
    // Marge 100 à la clôture, 40 à l'ouverture · IDA 30, produit d'impôt 18, réserves 12.
    const ri: ResultatInterne = { vendeuseId: 'M', acheteuseId: 'F', nature: 'STOCK', compteActif: '24500000', margeOuverture: 40, margeCloture: 100, libelle: 'x' };
    const r = cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 800, 900)], [], [{ ...ri, nature: 'IMMOBILISATION' }], FISC);
    expect(ligne(r, 'IMPOTS_DIFFERES_ACTIF')).toBe(30);
    expect(ligne(r, 'IMPOTS_DIFFERES_RESULTAT')).toBe(-18);
    expect(r.equilibre).toBe(0);
    const sansTaux = cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 800, 900)], [], [{ ...ri, nature: 'IMMOBILISATION' }], [fiscal('M', null), fiscal('F', 30)]);
    expect(ligne(sansTaux, 'IMPOTS_DIFFERES_ACTIF')).toBe(0);
    expect(sansTaux.impotsDifferesIncomplets).toEqual([expect.stringMatching(/aucun taux d’impôt déclaré pour « M »/)]);
  });

  it('les impôts différés individuels se déclarent · absents, l’état le dit ; un IDA sans motif est refusé', () => {
    const sans = cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 800, 900)], [], [], []);
    expect(sans.impotsDifferesIncomplets).toHaveLength(2);
    expect(sans.impotsDifferesIncomplets[1]).toMatch(/« F » n’a pas déclaré/);
    expect(() => cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 800, 900)], [], [], [fiscal('M', 30), fiscal('F', 30, { idaCloture: 50 })])).toThrow(/probable/);
    // Un seul champ laissé vide suffit · un « pas de réponse » sur l'IDP de clôture n'est pas un zéro.
    const partiel = cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 800, 900)], [], [], [fiscal('M', 30), fiscal('F', 30, { idpCloture: null })]);
    expect(partiel.impotsDifferesIncomplets).toEqual([expect.stringMatching(/« F » n’a pas déclaré/)]);
    // IDA 50 à la clôture, 20 à l'ouverture ; IDP 10 puis 0 · produit 30 + 10 = 40, réserves 20 − 10.
    const r = cumulerConsolidation(EX, [M, F], [acq('M', 'F', 80, 800, 900)], [], [], [
      fiscal('M', 30),
      fiscal('F', 30, { idaOuverture: 20, idaCloture: 50, idpOuverture: 10, idpCloture: 0, justificationIda: 'Budget 2027 bénéficiaire' }),
    ]);
    expect(ligne(r, 'IMPOTS_DIFFERES_ACTIF')).toBe(50);
    expect(ligne(r, 'IMPOTS_DIFFERES_PASSIF')).toBe(0);
    expect(ligne(r, 'IMPOTS_DIFFERES_RESULTAT')).toBe(-40);
    expect(r.equilibre).toBe(0);
  });
});

describe('tranche 4b · provisions réglementées contre-passées (art. 86, 3°, D4C ch. XII-3 § 2)', () => {
  const fiscal = (entiteId: string, tauxImpot: number | null): FiscaliteEntite => ({
    entiteId,
    tauxImpot,
    idaOuverture: 0,
    idaCloture: 0,
    idpOuverture: 0,
    idpCloture: 0,
  });
  // Filiale · amortissements dérogatoires 100 au bilan, dont 40 dotés dans
  // l'exercice (851) ; résultat individuel 400. Taux 30 %.
  // Contre-passation · résultat 400 + 40 − 12 (impôt différé) = 428 ;
  // réserves + 60 − 18 = 42 ; impôt différé passif 30.
  const F15 = ent('F', 'IG', 80, b([['24500000', 2100], ['15100000', -100], ['10100000', -1000], ['11800000', -600], ['70100000', -1000], ['60100000', 560], ['85100000', 40]]));
  const r = cumulerConsolidation(EX, [M, F15], [acq('M', 'F', 80, 800, 900)], [], [], [fiscal('M', 30), fiscal('F', 30)]);
  const ligne = (cle: string) => r.lignes.find((l) => l.cle === cle)?.solde ?? 0;

  it('le 15, le 851 et le 861 disparaissent de la balance consolidée', () => {
    expect(ligne('15100000')).toBe(0);
    expect(ligne('85100000')).toBe(0);
    expect(r.mouvements.some((m) => m.cle.startsWith('15') || m.cle.startsWith('851'))).toBe(false);
  });

  it('exercice → résultat, exercices antérieurs → réserves, avec leur impôt différé passif', () => {
    // Réserves groupe · 500 + 0,8 × (1 642 − 900) − 16 = 1 077,6 ; résultat groupe · 500 − 8 + 0,8 × 428 = 834,4.
    expect(r.capitauxPropres).toMatchObject({ reservesGroupe: 1077.6, resultatGroupe: 834.4, resultatMinoritaires: 85.6 });
    expect(ligne('IMPOTS_DIFFERES_PASSIF')).toBe(-30);
    expect(ligne('IMPOTS_DIFFERES_RESULTAT')).toBe(12);
    expect(r.equilibre).toBe(0);
  });

  it('le 861 porte au résultat, avec son impôt différé · une reprise de 10 réduit l’incidence de l’exercice', () => {
    const F861 = ent('F', 'IG', 80, b([['24500000', 2110], ['15100000', -100], ['10100000', -1000], ['11800000', -600], ['70100000', -1000], ['60100000', 560], ['85100000', 40], ['86100000', -10]]));
    const s = cumulerConsolidation(EX, [M, F861], [acq('M', 'F', 80, 800, 900)], [], [], [fiscal('M', 30), fiscal('F', 30)]);
    // Incidence de l'exercice 40 − 10 = 30, impôt différé au résultat 0,3 × 30 = 9.
    expect(s.lignes.find((l) => l.cle === 'IMPOTS_DIFFERES_RESULTAT')?.solde).toBe(9);
    expect(s.lignes.find((l) => l.cle === '86100000')?.solde ?? 0).toBe(0);
    expect(s.equilibre).toBe(0);
  });

  it('une balance à six colonnes perd aussi les mouvements du 15 et du 851', () => {
    const avecMv = b([['24500000', 2100], ['15100000', -100], ['10100000', -1000], ['11800000', -600], ['70100000', -1000], ['60100000', 560], ['85100000', 40]]).map((l) => ({
      ...l,
      mouvementDebit: Math.max(l.solde, 0),
      mouvementCredit: Math.max(-l.solde, 0),
    }));
    const s = cumulerConsolidation(EX, [M, ent('F', 'IG', 80, avecMv)], [acq('M', 'F', 80, 800, 900)], [], [], [fiscal('M', 30), fiscal('F', 30)]);
    expect(s.mouvements.some((m) => m.cle === '24500000')).toBe(true);
    expect(s.mouvements.filter((m) => m.cle.startsWith('15') || m.cle.startsWith('851'))).toEqual([]);
  });

  it('sans taux, la contre-passation se fait quand même et l’impôt différé est dit incomplet', () => {
    const s = cumulerConsolidation(EX, [M, F15], [acq('M', 'F', 80, 800, 900)], [], [], [fiscal('M', 30), fiscal('F', null)]);
    expect(s.lignes.find((l) => l.cle === '15100000')).toBeUndefined();
    expect(s.impotsDifferesIncomplets).toContainEqual(expect.stringMatching(/« F » · aucun taux.*provisions réglementées/));
    expect(s.equilibre).toBe(0);
  });
});

describe('tranche 4b · écarts de conversion des comptes individuels (D4C ch. XII-3 § 2)', () => {
  const zero = (entiteId: string): FiscaliteEntite => ({ entiteId, tauxImpot: 30, idaOuverture: 0, idaCloture: 0, idpOuverture: 0, idpCloture: 0 });
  // Filiale · 478 = 50, 479 = 20, provision 4991 = 30 (position globale · 50 − 20),
  // dotée de 30 dans l'exercice, 10 repris (provision N-1). Résultat individuel 380.
  // N-1 déclaré · 478 = 10, 479 = 5, soit une perte latente nette de 5 déjà au
  // résultat consolidé N-1 quand la provision individuelle en portait 10.
  const FX = ent(
    'F',
    'IG',
    80,
    b([
      ['24500000', 2000], ['47810000', 50], ['47910000', -20], ['49910000', -30], ['40100000', -20],
      ['10100000', -1000], ['11800000', -600], ['70100000', -1000], ['60100000', 600], ['65910000', 30], ['75910000', -10],
    ]),
  );
  const conv = (extra: Partial<ConversionIndividuelle> = {}): ConversionIndividuelle => ({
    entiteId: 'F',
    actifN1: 10,
    passifN1: 5,
    provisions: [{ compteProvision: '49910000', cloture: 30, dotation: 30, reprise: 10 }],
    ...extra,
  });
  const jouer = (c: ConversionIndividuelle[]) => cumulerConsolidation(EX, [M, FX], [acq('M', 'F', 80, 800, 900)], [], [], [zero('M'), zero('F')], c);

  it('478, 479, la provision, sa dotation et sa reprise sortent · la variation latente nette entre au résultat', () => {
    const r = jouer([conv()]);
    const ligne = (cle: string) => r.lignes.find((l) => l.cle === cle)?.solde ?? 0;
    for (const c of ['47810000', '47910000', '49910000', '65910000', '75910000']) expect(ligne(c)).toBe(0);
    // (50 − 20) − (10 − 5) = 25 de perte latente nette de l'exercice.
    expect(ligne('ECARTS_CONVERSION_INDIVIDUELS_RESULTAT')).toBe(25);
    // Résultat de F · 380 + 30 − 10 − 25 = 375 ; réserves de F · 1 600 + 5.
    // Groupe · réserves 500 + 0,8 × (1 605 − 900) − 16 = 1 048 ; résultat 500 − 8 + 0,8 × 375 = 792.
    expect(r.capitauxPropres).toMatchObject({ reservesGroupe: 1048, resultatGroupe: 792, resultatMinoritaires: 75 });
    expect(r.equilibre).toBe(0);
  });

  it('les mouvements de la dotation et de la reprise sortent · ceux de la provision, compte de bilan, restent', () => {
    const MV: Record<string, [number, number]> = { '49910000': [10, 40], '65910000': [30, 0], '75910000': [0, 10] };
    const FXmv = ent('F', 'IG', 80, FX.balance!.map((l) => {
      const [d, c] = MV[l.numero] ?? [Math.max(l.solde, 0), Math.max(-l.solde, 0)];
      return { ...l, mouvementDebit: d, mouvementCredit: c };
    }));
    const r = cumulerConsolidation(EX, [M, FXmv], [acq('M', 'F', 80, 800, 900)], [], [], [zero('M'), zero('F')], [conv()]);
    const mv = (cle: string) => r.mouvements.find((m) => m.cle === cle);
    expect(mv('65910000')).toMatchObject({ debit: 0, credit: 0 });
    expect(mv('75910000')).toMatchObject({ debit: 0, credit: 0 });
    expect(mv('49910000')).toMatchObject({ debit: 10, credit: 40 });
  });

  it('sans déclaration, rien n’est retraité · les 478 et 479 restent, et l’état les dira à retraiter', () => {
    const r = jouer([]);
    expect(r.lignes.find((l) => l.cle === '47810000')?.solde).toBe(50);
  });

  it('refus · une provision hors 194, 4991, 4997 ; une dotation qu’aucun compte ne porte ; une ouverture négative', () => {
    expect(() => jouer([conv({ provisions: [{ compteProvision: '19100000', cloture: 30, dotation: 30, reprise: 10 }] })])).toThrow(/194, au 4991 ou au 4997/);
    expect(() => jouer([conv({ provisions: [{ compteProvision: '49910000', cloture: 30, dotation: 90, reprise: 10 }] })])).toThrow(/ouverture/);
    expect(() => jouer([conv({ provisions: [{ compteProvision: '49970000', cloture: 30, dotation: 30, reprise: 10 }] })])).toThrow(/aucun compte 4997/);
  });
});

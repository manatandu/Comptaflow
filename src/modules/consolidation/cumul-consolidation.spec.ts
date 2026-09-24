import {
  AcquisitionDeclaree,
  cumulerConsolidation,
  EntiteACumuler,
  LigneBalanceEntree,
  OperationReciproque,
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

  it('des soldes aux comptes 14 ou 15 d’une filiale sont signalés (ch. XII-3 § 2)', () => {
    const F15 = ent('F', 'IG', 80, b([['24500000', 2100], ['15100000', -100], ['10100000', -1000], ['11800000', -600], ['70100000', -1000], ['60100000', 600]]));
    const r = cumulerConsolidation(EX, [M, F15], [acq('M', 'F', 80, 800, 900)], []);
    expect(r.avertissements.join(' ')).toContain('ch. XII-3 § 2');
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

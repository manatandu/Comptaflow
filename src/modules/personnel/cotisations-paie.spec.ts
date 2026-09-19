import {
  BAREMES_INPP,
  BAREMES_ONEM,
  MAJORATION_RISQUES_PROFESSIONNELS_MAXIMUM,
  TAUX_CNSS,
  cotisations,
  netAPayer,
  tauxInpp,
  tauxOnem,
} from './cotisations-paie';

const M = { moisDePaie: '2026-03' as const };

describe('Les taux CNSS, recopiés du décret n° 18/041', () => {
  it('portent 6,5 %, 5 % + 5 % et 1,5 %, et leur total fait DIX-HUIT', () => {
    // Dix-huit, pas dix-neuf. Le total ne figure dans aucun article : il se
    // calcule, et une addition ratée est exactement ce que ce test attrape.
    const total =
      TAUX_CNSS.prestationsAuxFamilles.tauxPourCent +
      TAUX_CNSS.pensionsEmployeur.tauxPourCent +
      TAUX_CNSS.pensionsTravailleur.tauxPourCent +
      TAUX_CNSS.risquesProfessionnels.tauxPourCent;
    expect(total).toBeCloseTo(18, 10);
  });

  it('répartit 13 % côté employeur et 5 % côté travailleur', () => {
    const v = cotisations(1_000_000, { ...M, natureEmployeurInpp: 'PRIVE', effectif: 10 });
    const cnss = v.lignes.filter((l) => l.organisme === 'CNSS');
    const emp = cnss.filter((l) => l.charge === 'EMPLOYEUR').reduce((n, l) => n + l.tauxPourCent, 0);
    const trav = cnss.filter((l) => l.charge === 'TRAVAILLEUR').reduce((n, l) => n + l.tauxPourCent, 0);
    expect(emp).toBeCloseTo(13, 10);
    expect(trav).toBeCloseTo(5, 10);
  });

  it('ne retient sur la paie QUE la quote-part ouvrière des pensions', () => {
    // Le défaut visé : déduire le total des cotisations du brut imposable.
    // L'article 71 ne laisse déduire que ce qui est RETENU sur le revenu.
    const v = cotisations(1_000_000, { ...M, natureEmployeurInpp: 'PRIVE', effectif: 10 });
    const retenues = v.lignes.filter((l) => l.charge === 'TRAVAILLEUR');
    expect(retenues).toHaveLength(1);
    expect(retenues[0].cle).toBe('cnss-pension-travailleur');
    expect(v.totalTravailleurFc).toBeCloseTo(50_000, 6);
    expect(v.totalEmployeurFc).toBeGreaterThan(v.totalTravailleurFc);
  });

  it('ne double le taux des risques professionnels que sur DÉCLARATION', () => {
    const normal = cotisations(1_000_000, { ...M, natureEmployeurInpp: 'PRIVE', effectif: 10 });
    const majore = cotisations(1_000_000, {
      ...M,
      natureEmployeurInpp: 'PRIVE',
      effectif: 10,
      majorationRisquesProfessionnels: true,
    });
    const rp = (v: typeof normal) => v.lignes.find((l) => l.cle === 'cnss-rp')!;
    expect(rp(normal).tauxPourCent).toBeCloseTo(1.5, 10);
    expect(rp(majore).tauxPourCent).toBeCloseTo(1.5 * MAJORATION_RISQUES_PROFESSIONNELS_MAXIMUM, 10);
    expect(rp(majore).reserve).toContain('article 5');
  });
});

describe("L'INPP · la nature d'abord, la tranche ensuite", () => {
  it('porte les deux barèmes, dans leur ordre de date', () => {
    expect(BAREMES_INPP.map((b) => b.aPartirDu)).toEqual(['2006-02-14', '2025-09-24']);
  });

  it('applique le barème de 2006 à un mois de 2025 antérieur à septembre', () => {
    expect(tauxInpp('2025-08', 'PRIVE', 10).tauxPourCent).toBeCloseTo(3, 10);
    expect(tauxInpp('2025-08', 'PUBLIC', null).tauxPourCent).toBeCloseTo(3, 10);
  });

  it('bascule sur le barème de 2025 dès le mois de la signature', () => {
    // L'arrêté est signé le 24 septembre et entre en vigueur ce jour-là : il
    // mord sur la paie de septembre, pas sur celle d'octobre.
    expect(tauxInpp('2025-09', 'PRIVE', 10).tauxPourCent).toBeCloseTo(3.5, 10);
    expect(tauxInpp('2025-09', 'PUBLIC', null).tauxPourCent).toBeCloseTo(4, 10);
  });

  it('lit les trois tranches du privé sur leurs bornes exactes', () => {
    expect(tauxInpp('2026-01', 'PRIVE', 50).tauxPourCent).toBeCloseTo(3.5, 10);
    expect(tauxInpp('2026-01', 'PRIVE', 51).tauxPourCent).toBeCloseTo(3, 10);
    expect(tauxInpp('2026-01', 'PRIVE', 300).tauxPourCent).toBeCloseTo(3, 10);
    expect(tauxInpp('2026-01', 'PRIVE', 301).tauxPourCent).toBeCloseTo(2, 10);
  });

  it("n'applique AUCUNE tranche d'effectif à un employeur public", () => {
    // Le piège : le taux public ne dépend pas de l'effectif, et le faire
    // dépendre ferait payer 3,5 % à un établissement public de dix agents.
    for (const effectif of [1, 100, 5_000]) {
      expect(tauxInpp('2026-01', 'PUBLIC', effectif).tauxPourCent).toBeCloseTo(4, 10);
    }
  });

  it("s'abstient sur un privé dont l'effectif n'est pas renseigné", () => {
    const v = tauxInpp('2026-01', 'PRIVE', null);
    expect(v.tauxPourCent).toBeNull();
    expect(v.motifAbstention).toContain("tranche d'effectif");
  });

  it("s'abstient tant que la NATURE de l'employeur n'est pas déclarée", () => {
    const v = cotisations(1_000_000, { ...M });
    expect(v.lignes.find((l) => l.organisme === 'INPP')).toBeUndefined();
    expect(v.abstentions.join(' ')).toContain('NATURE');
    // Et l'abstention INPP n'emporte ni la CNSS ni l'ONEM.
    expect(v.lignes.some((l) => l.organisme === 'CNSS')).toBe(true);
    expect(v.lignes.some((l) => l.organisme === 'ONEM')).toBe(true);
  });
});

describe("L'ONEM · un exercice à cheval porte les deux taux", () => {
  it('porte les deux barèmes, dans leur ordre de date', () => {
    expect(BAREMES_ONEM.map((b) => b.tauxPourCent)).toEqual([0.2, 0.5]);
  });

  it('rend 0,2 % avant septembre 2025 et 0,5 % à partir de septembre 2025', () => {
    expect(tauxOnem('2025-08').tauxPourCent).toBeCloseTo(0.2, 10);
    expect(tauxOnem('2025-09').tauxPourCent).toBeCloseTo(0.5, 10);
    expect(tauxOnem('2026-03').tauxPourCent).toBeCloseTo(0.5, 10);
  });
});

describe("L'assiette empruntée de l'INPP et de l'ONEM est DÉCLARÉE", () => {
  it('porte la réserve sur chacune des deux lignes', () => {
    const v = cotisations(1_000_000, { ...M, natureEmployeurInpp: 'PRIVE', effectif: 10 });
    for (const cle of ['inpp', 'onem']) {
      const ligne = v.lignes.find((l) => l.cle === cle)!;
      expect(ligne.reserve).toContain("sans renvoyer à l'article 7");
    }
  });

  it("ne porte PAS cette réserve sur la CNSS, dont l'assiette est routée par la loi", () => {
    const v = cotisations(1_000_000, { ...M, natureEmployeurInpp: 'PRIVE', effectif: 10 });
    const pf = v.lignes.find((l) => l.cle === 'cnss-pf')!;
    expect(pf.reserve).toBeNull();
    expect(pf.source).toContain("article 13 de la loi n° 16/009");
  });
});

describe("Le net à payer part du TOTAL VERSÉ, jamais de l'assiette", () => {
  it("ne retranche pas du net ce que l'article 7 sort de l'assiette", () => {
    // 1 000 000 de salaire + 400 000 de logement. L'assiette sociale vaut
    // 1 000 000 ; le travailleur reçoit bien 1 400 000. Partir de l'assiette
    // amputerait son net de 400 000 sur un bulletin aux cotisations exactes.
    const v = netAPayer(1_400_000, 50_000, 30_000);
    expect(v.totalVerseFc).toBe(1_400_000);
    expect(v.netAPayerFc).toBe(1_320_000);
    expect(v.netAPayerFc).not.toBe(920_000);
  });

  it("ne chiffre aucun net tant que l'impôt est indéterminé", () => {
    expect(netAPayer(1_400_000, 50_000, null).netAPayerFc).toBeNull();
  });

  it('ne rend jamais un net négatif', () => {
    expect(netAPayer(100_000, 50_000, 500_000).netAPayerFc).toBe(0);
  });

  it("dit ce qu'il ne retient pas, et pourquoi", () => {
    const r = netAPayer(1_000_000, 50_000, 30_000).reserves.join(' ');
    expect(r).toMatch(/article 112/i);
    expect(r).toMatch(/article 114/i);
    expect(r).toContain('article 139');
    expect(r).toContain('convention collective');
  });
});

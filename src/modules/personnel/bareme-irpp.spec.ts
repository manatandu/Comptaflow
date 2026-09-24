import {
  BORNE_TROISIEME_TRANCHE,
  MAXIMUM_PERSONNES_A_CHARGE,
  MOIS_PAR_AN,
  PLAFOND_IMPOT_POUR_CENT,
  PREMIER_EXERCICE_IRPP,
  QUOTITE_PAR_PERSONNE_A_CHARGE_POUR_CENT,
  SEUIL_OU_LE_PLAFOND_MORD,
  TRANCHES_IRPP,
  arrondirAuMillierInferieur,
  TRANCHES_IRPP_MENSUELLES,
  baremeApplicableAuMois,
  impotAnnuel,
  impotDuBareme,
  regimeApplicable,
  retenueMensuelle,
} from './bareme-irpp';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, 'bareme-irpp.ts'), 'utf8');

describe("Le barème de l'article 118, recopié et non déduit", () => {
  it('porte les quatre tranches de la loi n° 23/053, dans son ordre', () => {
    expect(TRANCHES_IRPP.map((t) => [t.jusqua, t.tauxPourCent])).toEqual([
      [1_944_000, 3],
      [21_600_000, 15],
      [43_200_000, 30],
      [null, 40],
    ]);
  });

  it('est CONTINU · chaque tranche reprend exactement au franc suivant la précédente', () => {
    // La loi tabule les bornes basses en « .001 ». C'est la propriété que
    // cette écriture porte, et un barème troué rendrait un impôt faux sans
    // qu'aucun total ne bouge.
    for (let i = 1; i < TRANCHES_IRPP.length; i += 1) {
      const precedente = TRANCHES_IRPP[i - 1].jusqua;
      expect(precedente).not.toBeNull();
      const borneBasseAnnoncee = (precedente as number) + 1;
      expect(borneBasseAnnoncee).toBeGreaterThan(precedente as number);
    }
    expect(TRANCHES_IRPP[TRANCHES_IRPP.length - 1].jusqua).toBeNull();
  });

  it('est CROISSANT · un barème progressif ne redescend jamais', () => {
    const taux = TRANCHES_IRPP.map((t) => t.tauxPourCent);
    expect([...taux].sort((a, b) => a - b)).toEqual(taux);
  });
});

describe("L'arrondi de l'article 118 porte sur l'assiette, jamais sur l'impôt", () => {
  it('arrondit le revenu net global au millier de francs INFÉRIEUR', () => {
    expect(arrondirAuMillierInferieur(1_944_999)).toBe(1_944_000);
    expect(arrondirAuMillierInferieur(1_944_000)).toBe(1_944_000);
    expect(arrondirAuMillierInferieur(999)).toBe(0);
  });

  it("n'arrondit pas l'impôt rendu", () => {
    // 1 000 FC à 3 % font 30 FC ; 1 500 FC arrondis à 1 000 en font autant.
    // Ce qui est vérifié ici est qu'aucun second arrondi n'écrase les centimes.
    const verdict = impotAnnuel(1_100_100);
    expect(verdict.assietteArrondieFc).toBe(1_100_000);
    expect(verdict.impotDuFc).toBeCloseTo(33_000, 6);
    const centimes = impotAnnuel(1_000_333).impotDuFc;
    expect(centimes).toBeCloseTo(30_000, 6);
  });
});

describe('Le barème progressif, tranche par tranche', () => {
  it('ne mord que la fraction de revenu qui tombe dans chaque tranche', () => {
    // Un revenu à la borne exacte de la troisième tranche.
    const { impotFc, parTranche } = impotDuBareme(BORNE_TROISIEME_TRANCHE);
    expect(parTranche.map((t) => [t.tauxPourCent, t.baseFc])).toEqual([
      [3, 1_944_000],
      [15, 19_656_000],
      [30, 21_600_000],
    ]);
    // 58 320 + 2 948 400 + 6 480 000
    expect(impotFc).toBeCloseTo(9_486_720, 6);
  });

  it('ne rend rien sur une assiette nulle ou négative', () => {
    expect(impotDuBareme(0).impotFc).toBe(0);
    expect(impotDuBareme(-5_000_000).impotFc).toBe(0);
    expect(impotAnnuel(-1).impotDuFc).toBe(0);
  });
});

describe("Le plafond de l'article 118, alinéa 2", () => {
  it('se recalcule depuis les tranches, il ne se croit pas', () => {
    // On ne relit pas la constante : on refait le croisement des deux droites,
    // pour que le jour où une tranche change, le seuil tombe avec elle.
    const impotA43 = impotDuBareme(BORNE_TROISIEME_TRANCHE).impotFc;
    const tauxMarginal = TRANCHES_IRPP[TRANCHES_IRPP.length - 1].tauxPourCent / 100;
    const plafond = PLAFOND_IMPOT_POUR_CENT / 100;
    // impotA43 + marginal × (R - 43 200 000) = plafond × R
    const seuil =
      (impotA43 - tauxMarginal * BORNE_TROISIEME_TRANCHE) / (plafond - tauxMarginal);
    expect(seuil).toBeCloseTo(SEUIL_OU_LE_PLAFOND_MORD, 6);
  });

  it('ne mord PAS juste en dessous du seuil', () => {
    const verdict = impotAnnuel(SEUIL_OU_LE_PLAFOND_MORD - 1_000);
    expect(verdict.plafondApplique).toBe(false);
    expect(verdict.impotArticle118Fc).toBeCloseTo(verdict.impotDuBaremeFc, 6);
  });

  it('mord juste au-dessus, et ramène l\'impôt à 30 % du revenu imposable', () => {
    const revenu = SEUIL_OU_LE_PLAFOND_MORD + 10_000_000;
    const verdict = impotAnnuel(revenu);
    expect(verdict.plafondApplique).toBe(true);
    expect(verdict.impotDuBaremeFc).toBeGreaterThan(verdict.impotArticle118Fc);
    // Le plafond porte sur l'assiette ARRONDIE, pas sur le revenu brut :
    // 87 932 800 FC arrondis font 87 932 000 FC, et 240 FC d'impôt d'écart.
    expect(verdict.impotArticle118Fc).toBeCloseTo(
      (verdict.assietteArrondieFc * 30) / 100,
      6,
    );
    expect(verdict.impotArticle118Fc).not.toBeCloseTo((revenu * 30) / 100, 6);
    expect(verdict.reserves.join(' ')).toMatch(/article 118, alin[ée]a 2/i);
  });

  it("interdit que l'impôt dû dépasse 30 % du revenu imposable, à tout niveau", () => {
    for (const revenu of [
      1_000_000, 21_600_000, 43_200_000, 77_932_800, 120_000_000, 900_000_000,
    ]) {
      const verdict = impotAnnuel(revenu);
      expect(verdict.impotDuFc).toBeLessThanOrEqual(
        (verdict.assietteArrondieFc * PLAFOND_IMPOT_POUR_CENT) / 100 + 1e-6,
      );
    }
  });
});

describe("La quotité de l'article 123", () => {
  it('retranche 2 % par personne à charge', () => {
    const sans = impotAnnuel(10_000_000, 0);
    const avecTrois = impotAnnuel(10_000_000, 3);
    expect(avecTrois.quotitePourCent).toBe(6);
    expect(avecTrois.impotDuFc).toBeCloseTo(sans.impotDuFc * 0.94, 6);
  });

  it('plafonne à neuf personnes et le DIT', () => {
    const verdict = impotAnnuel(10_000_000, 14);
    expect(verdict.personnesAChargeRetenues).toBe(MAXIMUM_PERSONNES_A_CHARGE);
    expect(verdict.quotitePourCent).toBe(
      MAXIMUM_PERSONNES_A_CHARGE * QUOTITE_PAR_PERSONNE_A_CHARGE_POUR_CENT,
    );
    expect(verdict.reserves.join(' ')).toMatch(/article 123/i);
  });

  it("n'accorde AUCUNE réduction sur l'impôt de la part au-delà de la troisième tranche", () => {
    // Le défaut visé : réduire l'impôt TOTAL de 2 % par personne, ce qui
    // ferait profiter la tranche à 40 % d'une quotité que l'alinéa 2 lui refuse.
    const revenu = 60_000_000;
    const verdict = impotAnnuel(revenu, 5);
    const impotSurLaPartBasse = impotDuBareme(BORNE_TROISIEME_TRANCHE).impotFc;
    expect(verdict.baseDeLaQuotiteFc).toBeCloseTo(impotSurLaPartBasse, 6);
    expect(verdict.baseDeLaQuotiteFc).toBeLessThan(verdict.impotArticle118Fc);
    expect(verdict.reductionFc).toBeCloseTo((impotSurLaPartBasse * 10) / 100, 6);
  });

  it('joue APRÈS le plafond, jamais avant', () => {
    // L'article 123 réduit « l'impôt établi par application de l'article 118 »,
    // alinéa 2 compris. L'ordre inverse effacerait la réduction sous le plafond.
    const revenu = 200_000_000;
    const verdict = impotAnnuel(revenu, 9);
    expect(verdict.plafondApplique).toBe(true);
    expect(verdict.impotDuFc).toBeLessThan(verdict.impotArticle118Fc);
    expect(verdict.impotDuFc).toBeCloseTo(
      verdict.impotArticle118Fc - (verdict.baseDeLaQuotiteFc * 18) / 100,
      6,
    );
  });

  it('ne rend jamais une base de quotité supérieure à ce qui est dû', () => {
    for (const revenu of [50_000_000, 100_000_000, 500_000_000]) {
      const verdict = impotAnnuel(revenu, 9);
      expect(verdict.baseDeLaQuotiteFc).toBeLessThanOrEqual(
        verdict.impotArticle118Fc + 1e-6,
      );
      expect(verdict.impotDuFc).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("La retenue mensuelle de l'article 119", () => {
  it("annualise le mois, applique l'article 118, puis ramène au mois", () => {
    const verdict = retenueMensuelle('2026-03', 1_000_000);
    expect(verdict.revenuAnnualiseFc).toBe(12_000_000);
    expect(verdict.annuel.assietteArrondieFc).toBe(12_000_000);
    expect(verdict.retenueFc).toBeCloseTo(verdict.annuel.impotDuFc / MOIS_PAR_AN, 6);
  });

  it("ARRONDIT LE REVENU ANNUALISÉ, jamais le mois", () => {
    // 500 083 FC par mois font 6 000 996 FC par an, arrondis à 6 000 000.
    // Arrondir le mois d'abord (500 000) puis multiplier donnerait 6 000 000
    // aussi ; il faut un mois dont les deux chemins divergent.
    // 1 000 100 × 12 = 12 001 200 -> 12 001 000.
    // Arrondir le mois : 1 000 000 × 12 = 12 000 000. Mille francs d'écart.
    const verdict = retenueMensuelle('2026-03', 1_000_100);
    expect(verdict.annuel.assietteArrondieFc).toBe(12_001_000);
    expect(verdict.annuel.assietteArrondieFc).not.toBe(12_000_000);
  });

  it('ne tombe PAS dans la tranche à 3 % pour un salaire de cadre', () => {
    // Le défaut que la mensualisation existe pour empêcher : appliquer les
    // tranches ANNUELLES à un montant MENSUEL. 1 500 000 FC par mois
    // resteraient sous 1 944 000 et seraient taxés à 3 %.
    const verdict = retenueMensuelle('2026-06', 1_500_000);
    const naif = impotDuBareme(1_500_000).impotFc;
    expect(naif).toBeCloseTo(45_000, 6);
    expect(verdict.retenueFc).toBeGreaterThan(naif * 3);
  });

  it("annonce qu'il s'agit d'un acompte et non de l'impôt définitif", () => {
    const verdict = retenueMensuelle('2026-06', 800_000);
    const reserves = verdict.reserves.join(' ');
    expect(reserves).toContain('MENSUALISATION');
    expect(reserves).toContain('ACOMPTE');
    expect(reserves).toContain('article 121');
  });
});

describe('Les bornes que ce module ne franchit pas', () => {
  it("refuse tout mois antérieur à l'entrée en vigueur de la loi n° 23/053", () => {
    expect(baremeApplicableAuMois('2025-12').applicable).toBe(false);
    expect(baremeApplicableAuMois('2025-12').motif).toContain('1er janvier 2026');
    expect(baremeApplicableAuMois(`${PREMIER_EXERCICE_IRPP}-01`).applicable).toBe(true);
  });

  it('ne calcule que le régime de droit commun, et nomme les deux autres', () => {
    expect(regimeApplicable('BAREME_ARTICLE_118').calculable).toBe(true);
    expect(regimeApplicable('FORFAIT_PERSONNEL_DOMESTIQUE').calculable).toBe(false);
    expect(regimeApplicable('FORFAIT_SALARIE_DE_MICRO_ENTREPRISE').calculable).toBe(false);
    expect(regimeApplicable('FORFAIT_PERSONNEL_DOMESTIQUE').motif).toContain('019/2025');
  });

  it("ne porte NI le minimum de perception de l'article 122 NI le plancher de 2 000 FC du livre de cours", () => {
    // On gèle une PRÉSENCE, jamais une absence de mot : la source doit dire
    // pourquoi chacun est écarté, et aucune constante ne doit les porter.
    expect(SOURCE).toMatch(/ARTICLE 122 \(1 % du chiffre d'affaires\)/);
    expect(SOURCE).toMatch(/PLANCHER DE 2 000 FC N'EXISTE PAS ICI/);
    // Aucun calcul ne les applique : un revenu minuscule rend un impôt minuscule.
    expect(impotAnnuel(12_000).impotDuFc).toBeCloseTo(360, 6);
    expect(impotAnnuel(0).impotDuFc).toBe(0);
  });
});

describe('Le barème lu au mois · ce que montrent l’écran et le bulletin', () => {
  it('divise les bornes annuelles par douze, sans rien écrire à la main', () => {
    // Les mêmes bornes que le barème mensuel de l'IPR que donne le cours de
    // Mbuyamba (chapitre 12, p. 190) · 162 000, 1 800 000 et 3 600 000 FC.
    expect(TRANCHES_IRPP_MENSUELLES.map((t) => [t.deFc, t.aFc, t.tauxPourCent])).toEqual([
      [0, 162_000, 3],
      [162_000, 1_800_000, 15],
      [1_800_000, 3_600_000, 30],
      [3_600_000, null, 40],
    ]);
  });

  it('rend, pour 1 000 000 FC par mois, les 130 560 FC du barème mensuel', () => {
    const v = retenueMensuelle('2026-03', 1_000_000);
    expect(v.mensuel.parTranche.map((t) => [t.tauxPourCent, t.baseFc, t.impotFc])).toEqual([
      [3, 162_000, 4_860],
      [15, 838_000, 125_700],
    ]);
    expect(v.mensuel.impotDuBaremeFc).toBeCloseTo(130_560, 6);
    expect(v.mensuel.retenueFc).toBeCloseTo(130_560, 6);
  });

  it.each([
    [1_000_000, 2],
    [2_500_000, 0],
    [8_000_000, 3],
    [150_000, 9],
    [1_000_083, 1],
  ])('retombe au centime sur la retenue · %d FC, %d personnes', (revenu, personnes) => {
    const v = retenueMensuelle('2026-03', revenu, personnes);
    const m = v.mensuel;
    const somme = m.parTranche.reduce((n, t) => n + t.impotFc, 0);
    expect(somme).toBeCloseTo(m.impotDuBaremeFc, 6);
    expect(m.impotArticle118Fc - m.reductionFc).toBeCloseTo(v.retenueFc, 6);
    expect(m.retenueFc).toBeCloseTo(v.retenueFc, 6);
  });

  it('montre le plafond au mois quand il mord', () => {
    const m = retenueMensuelle('2026-03', 8_000_000).mensuel;
    expect(m.plafondApplique).toBe(true);
    expect(m.plafondFc).toBeCloseTo(2_400_000, 6);
    expect(m.retenueFc).toBeCloseTo(2_400_000, 6);
  });

  it("garde l'arrondi au millier sur l'ANNÉE, comme l'article 118 l'écrit", () => {
    // 1 000 083 FC par mois font 12 000 996 FC par an, arrondis à 12 000 000.
    const m = retenueMensuelle('2026-03', 1_000_083).mensuel;
    expect(m.revenuRetenuFc).toBeCloseTo(1_000_000, 6);
  });
});

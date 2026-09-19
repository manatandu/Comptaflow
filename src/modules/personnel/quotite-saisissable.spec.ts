import {
  FRACTION_AU_DESSUS_DU_SEUIL,
  FRACTION_OBLIGATION_ALIMENTAIRE,
  FRACTION_SOUS_LE_SEUIL,
  JOURS_DU_MOIS,
  MULTIPLE_DU_MINIMUM_CATEGORIEL,
  RESERVE_CUMUL,
  RESERVE_LOGEMENT,
  mensuelMinimumDeLaClasse,
  quotiteSaisissable,
} from './quotite-saisissable';
import { ANNEXES } from './bareme-smig';

/** L'annexe 2 · à partir de la paie de janvier 2026. */
const MOIS = '2026-03';
const CLASSE_1_JOURNALIER = 21_500;

describe("Les fractions de l'article 114, recopiées et non calculées", () => {
  it('porte un cinquième, un tiers et deux cinquièmes', () => {
    expect(FRACTION_SOUS_LE_SEUIL).toEqual({ numerateur: 1, denominateur: 5 });
    expect(FRACTION_AU_DESSUS_DU_SEUIL).toEqual({ numerateur: 1, denominateur: 3 });
    expect(FRACTION_OBLIGATION_ALIMENTAIRE).toEqual({ numerateur: 2, denominateur: 5 });
    expect(MULTIPLE_DU_MINIMUM_CATEGORIEL).toBe(5);
  });

  it("mensualise par le multiplicateur de l'article 7, pas par trente", () => {
    expect(JOURS_DU_MOIS).toBe(26);
  });
});

describe('Le seuil de la classe', () => {
  it("prend le taux de la classe dans l'annexe du mois, fois vingt-six", () => {
    const m = mensuelMinimumDeLaClasse(MOIS, 1);
    expect(m).not.toBeNull();
    expect(m!.montantFc).toBe(CLASSE_1_JOURNALIER * 26);
    expect(m!.annexe.numero).toBe(2);
    // La colonne 19 est celle des allocations · la classe 1 est en colonne 2.
    expect(m!.colonne).toBe(2);
  });

  it('couvre les dix-sept classes, et refuse la dix-huitième', () => {
    for (let c = 1; c <= 17; c += 1) {
      expect(mensuelMinimumDeLaClasse(MOIS, c)).not.toBeNull();
    }
    expect(mensuelMinimumDeLaClasse(MOIS, 18)).toBeNull();
    expect(mensuelMinimumDeLaClasse(MOIS, 0)).toBeNull();
    expect(mensuelMinimumDeLaClasse(MOIS, 1.5)).toBeNull();
  });

  it('change avec le palier · la classe 1 de 2025 est celle du montant PAYÉ', () => {
    expect(mensuelMinimumDeLaClasse('2025-07', 1)!.montantFc).toBe(14_500 * 26);
    expect(ANNEXES[0].tauxParClasse[0]).toBe(14_500);
  });

  it("refuse le mois qu'aucune annexe ne couvre", () => {
    expect(mensuelMinimumDeLaClasse('2025-01', 1)).toBeNull();
  });
});

describe("Les abstentions de l'article 114", () => {
  it("s'abstient sans classe professionnelle, et le dit", () => {
    const v = quotiteSaisissable({ moisDePaie: MOIS, remunerationFc: 5_000_000 });
    expect(v.quotiteOrdinaireFc).toBeNull();
    expect(v.baseFc).toBeNull();
    expect(v.abstentions.map((a) => a.motif)).toContain('CLASSE_PROFESSIONNELLE_ABSENTE');
  });

  it("s'abstient quand un logement est FOURNI EN NATURE", () => {
    const v = quotiteSaisissable({
      moisDePaie: MOIS,
      remunerationFc: 5_000_000,
      classeProfessionnelle: 5,
      logementFourniEnNature: true,
    });
    expect(v.quotiteOrdinaireFc).toBeNull();
    expect(v.abstentions.map((a) => a.motif)).toContain('LOGEMENT_EN_NATURE_NON_CHIFFRABLE');
    expect(v.abstentions[0].explication).toContain('139');
  });

  it("ne s'abstient PAS pour une simple indemnité de logement", () => {
    // Elle est hors rémunération par l'article 7 litera h · rien à déduire.
    const v = quotiteSaisissable({
      moisDePaie: MOIS,
      remunerationFc: 5_000_000,
      classeProfessionnelle: 5,
      logementFourniEnNature: false,
    });
    expect(v.abstentions).toHaveLength(0);
    expect(v.quotiteOrdinaireFc).not.toBeNull();
  });

  it("s'abstient hors période d'annexe", () => {
    const v = quotiteSaisissable({
      moisDePaie: '2024-06',
      remunerationFc: 5_000_000,
      classeProfessionnelle: 3,
    });
    expect(v.abstentions.map((a) => a.motif)).toContain('MOIS_HORS_ANNEXE');
  });
});

describe("LES TROIS SENS DU MOT « LOGEMENT », et la correction qu'ils portent", () => {
  it('nomme les trois objets et refuse de les confondre', () => {
    expect(RESERVE_LOGEMENT).toContain('139');
    expect(RESERVE_LOGEMENT).toContain('25/22');
    expect(RESERVE_LOGEMENT).toContain('25/21');
    expect(RESERVE_LOGEMENT).toContain('138');
    expect(RESERVE_LOGEMENT).toMatch(/litera h/i);
    // LA CONCLUSION, pas seulement les citations · la phrase qui compte est
    // que le décret N'EST PAS l'arrêté, et qu'il faut une MUTATION.
    expect(RESERVE_LOGEMENT).toMatch(/n'est PAS au corpus/i);
    expect(RESERVE_LOGEMENT).toMatch(/MUTATION/i);
    expect(RESERVE_LOGEMENT).toMatch(/décret, pas un arrêté/i);
  });
});

describe("Le calcul de l'alinéa 1er", () => {
  // Classe 1 en 2026 · 21 500 × 26 = 559 000, seuil = 2 795 000.
  const seuil = CLASSE_1_JOURNALIER * 26 * 5;

  it('applique un cinquième quand toute la base est sous le seuil', () => {
    const v = quotiteSaisissable({
      moisDePaie: MOIS,
      remunerationFc: 1_000_000,
      classeProfessionnelle: 1,
    });
    expect(v.seuilFc).toBe(seuil);
    expect(v.baseFc).toBe(1_000_000);
    expect(v.quotiteOrdinaireFc).toBeCloseTo(200_000, 6);
    expect(v.partInsaisissableFc).toBeCloseTo(800_000, 6);
  });

  it('coupe au seuil et passe au tiers sur le surplus', () => {
    const remuneration = seuil + 600_000;
    const v = quotiteSaisissable({
      moisDePaie: MOIS,
      remunerationFc: remuneration,
      classeProfessionnelle: 1,
    });
    expect(v.quotiteOrdinaireFc).toBeCloseTo(seuil / 5 + 600_000 / 3, 6);
    // ET CE N'EST PAS un tiers de tout · l'erreur qu'on attend d'un barème.
    expect(v.quotiteOrdinaireFc).not.toBeCloseTo(remuneration / 3, 2);
  });

  it("déduit les retenues fiscales et sociales AVANT de placer le seuil", () => {
    const v = quotiteSaisissable({
      moisDePaie: MOIS,
      remunerationFc: 1_000_000,
      classeProfessionnelle: 1,
      retenuesFiscalesFc: 120_000,
      retenuesSocialesFc: 50_000,
    });
    expect(v.baseFc).toBe(830_000);
    expect(v.quotiteOrdinaireFc).toBeCloseTo(166_000, 6);
  });

  it('ne rend jamais une base négative', () => {
    const v = quotiteSaisissable({
      moisDePaie: MOIS,
      remunerationFc: 100_000,
      classeProfessionnelle: 1,
      retenuesFiscalesFc: 900_000,
    });
    expect(v.baseFc).toBe(0);
    expect(v.quotiteOrdinaireFc).toBe(0);
  });
});

describe("L'alinéa 2 et le cumul de l'alinéa 3", () => {
  it("n'applique les deux cinquièmes QUE si la créance est alimentaire", () => {
    const sans = quotiteSaisissable({
      moisDePaie: MOIS,
      remunerationFc: 1_000_000,
      classeProfessionnelle: 1,
    });
    expect(sans.quotiteAlimentaireFc).toBe(0);
    expect(sans.quotiteCumuleeFc).toBe(sans.quotiteOrdinaireFc);
  });

  it("applique deux cinquièmes sur TOUTE la base, sans découpage au seuil", () => {
    const seuil = CLASSE_1_JOURNALIER * 26 * 5;
    const v = quotiteSaisissable({
      moisDePaie: MOIS,
      remunerationFc: seuil + 600_000,
      classeProfessionnelle: 1,
      obligationAlimentaireLegale: true,
    });
    expect(v.quotiteAlimentaireFc).toBeCloseTo((v.baseFc! * 2) / 5, 6);
  });

  it('cumule les deux quotités sans les plafonner, et porte la réserve', () => {
    const v = quotiteSaisissable({
      moisDePaie: MOIS,
      remunerationFc: 1_000_000,
      classeProfessionnelle: 1,
      obligationAlimentaireLegale: true,
    });
    expect(v.quotiteCumuleeFc).toBeCloseTo(200_000 + 400_000, 6);
    expect(v.partInsaisissableFc).toBeCloseTo(400_000, 6);
    expect(v.reserves).toContain(RESERVE_CUMUL);
    expect(RESERVE_CUMUL).toMatch(/AUCUN PLAFOND/i);
  });

  it("ne porte pas la réserve du cumul quand il n'y a pas de cumul", () => {
    const v = quotiteSaisissable({
      moisDePaie: MOIS,
      remunerationFc: 1_000_000,
      classeProfessionnelle: 1,
    });
    expect(v.reserves).not.toContain(RESERVE_CUMUL);
  });
});

describe('La classe plutôt que la catégorie · une règle de protection', () => {
  it("prend un seuil AU MOINS égal à celui du premier échelon de la catégorie", () => {
    // Classe 4 (échelon supérieur) contre classe 1 (premier échelon) · le
    // seuil plus haut laisse PLUS de base au cinquième, donc une quotité
    // ordinaire PLUS FAIBLE. C'est le sens protecteur.
    const base = 4_000_000;
    const haute = quotiteSaisissable({
      moisDePaie: MOIS,
      remunerationFc: base,
      classeProfessionnelle: 4,
    });
    const basse = quotiteSaisissable({
      moisDePaie: MOIS,
      remunerationFc: base,
      classeProfessionnelle: 1,
    });
    expect(haute.seuilFc!).toBeGreaterThan(basse.seuilFc!);
    expect(haute.quotiteOrdinaireFc!).toBeLessThan(basse.quotiteOrdinaireFc!);
  });
});

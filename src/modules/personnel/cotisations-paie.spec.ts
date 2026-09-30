import { NATURES_RETENUES } from '../retenues/correspondance-retenues';
import { annexeDuCabinet } from './bareme-smig';
import {
  BAREMES_CNSS,
  BAREMES_INPP,
  BAREMES_ONEM,
  MAJORATION_RISQUES_PROFESSIONNELS_MAXIMUM,
  NON_DUES_APPRENTI,
  RESERVE_SAISIES_ET_CESSIONS,
  RESERVE_REGIME_CNSS_INCONNU,
  TAUX_CNSS,
  cotisations,
  netAPayer,
  plancherCnss,
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

  it('ne majore le taux des risques professionnels que sur DÉCLARATION, au niveau notifié', () => {
    const normal = cotisations(1_000_000, { ...M, natureEmployeurInpp: 'PRIVE', effectif: 10 });
    const rp = (v: typeof normal) => v.lignes.find((l) => l.cle === 'cnss-rp')!;
    expect(rp(normal).tauxPourCent).toBeCloseTo(1.5, 10);
    // PASSE D2 · 50 % (arrêté n° 140/2018, art. 22) fait 2,25 %, jamais 3 %.
    const cinquante = cotisations(1_000_000, { ...M, natureEmployeurInpp: 'PRIVE', effectif: 10, majorationRisquesProfessionnelsPourCent: 50 });
    expect(rp(cinquante).tauxPourCent).toBeCloseTo(2.25, 10);
    expect(rp(cinquante).reserve).toContain('art. 22');
    expect(rp(cinquante).reserve).not.toMatch(/RÉCIDIVE/);
    // 100 % en récidive (art. 24, al. 3) · le double, qui est le plafond.
    const cent = cotisations(1_000_000, { ...M, natureEmployeurInpp: 'PRIVE', effectif: 10, majorationRisquesProfessionnelsPourCent: 100 });
    expect(rp(cent).tauxPourCent).toBeCloseTo(1.5 * MAJORATION_RISQUES_PROFESSIONNELS_MAXIMUM, 10);
    expect(rp(cent).reserve).toContain('art. 24, al. 3');
    expect(rp(cent).reserve).toContain('article 5');
  });

  it('refuse une majoration que l’arrêté n° 140/2018 ne connaît pas', () => {
    expect(() =>
      cotisations(1_000_000, { ...M, majorationRisquesProfessionnelsPourCent: 150 as never }),
    ).toThrow(/50 %.*100 %/);
  });
});

describe("L'APPRENTI · la seule branche des risques professionnels (loi n° 16/009, art. 4)", () => {
  it('ne porte ni pensions ni prestations aux familles, et aucune quote-part ouvrière', () => {
    const v = cotisations(1_000_000, { ...M, natureEmployeurInpp: 'PRIVE', effectif: 10, regimeCnss: 'APPRENTI' });
    const cnss = v.lignes.filter((l) => l.organisme === 'CNSS').map((l) => l.cle);
    expect(cnss).toEqual(['cnss-rp']);
    expect(v.lignes.some((l) => l.cle === 'cnss-pension-travailleur')).toBe(false);
    expect(v.totalTravailleurFc).toBe(0);
    // NON DUES est une réponse, pas une abstention · l'émission n'est pas bloquée.
    expect(v.abstentions.filter((a) => a.startsWith('CNSS'))).toEqual([]);
    expect(v.reserves).toContain(NON_DUES_APPRENTI);
    const rp = v.lignes.find((l) => l.cle === 'cnss-rp')!;
    expect(rp.charge).toBe('EMPLOYEUR');
    expect(rp.reserve).toContain('art. 13, al. 2');
  });

  it('un travailleur garde les trois branches, et sans contrat lu l’hypothèse est dite', () => {
    const t = cotisations(1_000_000, { ...M, natureEmployeurInpp: 'PRIVE', effectif: 10, regimeCnss: 'TRAVAILLEUR' });
    expect(t.lignes.filter((l) => l.organisme === 'CNSS')).toHaveLength(4);
    expect(t.reserves).not.toContain(RESERVE_REGIME_CNSS_INCONNU);
    const inconnu = cotisations(1_000_000, { ...M, natureEmployeurInpp: 'PRIVE', effectif: 10 });
    expect(inconnu.reserves).toContain(RESERVE_REGIME_CNSS_INCONNU);
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
  it("porte la réserve de lecture sur l'ONEM, et sur l'INPP le renvoi au Code qui la crée", () => {
    const v = cotisations(1_000_000, { ...M, natureEmployeurInpp: 'PRIVE', effectif: 10 });
    expect(v.lignes.find((l) => l.cle === 'onem')!.reserve).toContain("sans renvoyer à l'article 7");
    // PASSE D2 · l'INPP naît de l'art. 15 b) du Code du travail, dont l'art. 7
    // définit le mot · pas une lecture. Reste la période du trimestre précédent.
    const inpp = v.lignes.find((l) => l.cle === 'inpp')!;
    expect(inpp.source).toContain('art. 15 b)');
    expect(inpp.reserve).toContain('article 7 du même Code');
    expect(inpp.reserve).toMatch(/trimestre précédent.*calcule sur le mois/);
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
    // CE TEST GELAIT LA GARANTIE PÉRIMÉE « quotité non calculée » (audit final
    // F106) · il gèle désormais la réserve vraie, et d'où la quotité se tire.
    expect(r).toContain("LA QUOTITÉ SAISISSABLE DE L'ARTICLE 114 EST CALCULÉE À PART");
    expect(r).toContain('décret n° 25/22');
    expect(r).toContain('arrêté n° 12/CAB.MIN/TPS/110/2005, art. 10');
    expect(r).toContain("n'est retenue sur aucun bulletin");
  });
});

/**
 * AUDIT FINAL F109 · LES TAUX VIVENT DEUX FOIS, ET ILS SONT CONFRONTÉS. Ce
 * fichier les chiffre pour le calcul ; le registre des retenues les CITE pour
 * la déclaration. L'en-tête prétendait qu'ils se lisaient au même endroit ·
 * ce test fait de la double écriture une double vérification. La phrase qui
 * nomme l'arrêté d'une version doit porter ses taux.
 */
describe('F109 · chaque taux calculé est celui que le registre des retenues cite', () => {
  const texte = (cle: string) => {
    const n = NATURES_RETENUES.find((x) => x.cle === cle);
    expect(n).toBeDefined();
    return `${n!.baseLegale} ${n!.reserve ?? ''}`;
  };
  /** La phrase qui contient `repere` · une fin de phrase suivie d'une majuscule. */
  const phrase = (t: string, repere: string) => {
    const p = t.split(/\.\s+(?=[A-ZÉÀ«])/).find((x) => x.includes(repere));
    expect(p).toBeDefined();
    return p!;
  };
  const pc = (x: number) => `${String(x).replace('.', ',')} %`;
  const numeroDe = (reference: string) => reference.match(/n° \S+/)![0].replace(/,$/, '');

  it('INPP · chaque version, public et tranches du privé', () => {
    const t = texte('inpp');
    for (const v of BAREMES_INPP) {
      const p = phrase(t, numeroDe(v.reference));
      expect(p).toContain(pc(v.publicPourCent));
      const [t1, t2, t3] = v.priveParTranche.map((x) => x.tauxPourCent);
      expect(p).toContain(`${pc(t1)} de 1 à 50`);
      expect(p).toContain(`${pc(t2)} de 51 à 300`);
      expect(p).toContain(`${pc(t3)} au-delà de 300`);
    }
  });

  it('ONEM · chaque version', () => {
    const t = texte('onem');
    for (const v of BAREMES_ONEM) expect(phrase(t, numeroDe(v.reference))).toContain(pc(v.tauxPourCent));
  });

  it('CNSS · la version en vigueur', () => {
    const v = BAREMES_CNSS[BAREMES_CNSS.length - 1];
    const p = phrase(texte('cnss'), 'décret n° 18/041');
    expect(p).toContain(`prestations aux familles ${pc(v.prestationsAuxFamilles!)}`);
    expect(p).toContain(`${pc(v.pensionsEmployeur)} employeur, ${pc(v.pensionsTravailleur)} travailleur`);
    expect(p).toContain(`risques professionnels ${pc(v.risquesProfessionnels)}`);
  });
});

/**
 * AUDIT FINAL F112 · LE PLANCHER DE LA CNSS. Décret n° 18/041, art. 8 · loi
 * n° 16/009, art. 13 · « en aucun cas » la base ne descend sous le SMIG. Le
 * SMIG est JOURNALIER (décret n° 25/22, art. 2), le mois en compte 26 (art. 7).
 */
describe('F112 · le plancher de la CNSS', () => {
  it('sous le décret n° 18/017, le plancher est le SMIG de 7 075 FC (audit D2-C1)', () => {
    expect(plancherCnss('2022-06', 100_000, 26).baseFc).toBe(7_075 * 26);
  });

  it('sans annexe (avant juillet 2019), rien n’est vérifié et c’est dit', () => {
    const p = plancherCnss('2018-06', 100_000);
    expect(p.baseFc).toBe(100_000);
    expect(p.message).toContain('PLANCHER NON VÉRIFIÉ');
    // Le motif est celui du barème · le décret n° 18/017 est au corpus.
    expect(p.message).toContain('décret n° 18/017');
    expect(p.message).toMatch(/paliers/);
  });

  it('au-dessus du SMIG d’un mois entier (21 500 × 26 = 559 000), rien ne change', () => {
    const p = plancherCnss('2026-03', 600_000);
    expect(p).toMatchObject({ baseFc: 600_000, applique: false, message: null, plancherFc: 559_000 });
  });

  it('sous le plancher sans jours payés déclarés, la CNSS s’abstient et demande les jours', () => {
    const p = plancherCnss('2026-03', 300_000);
    expect(p.baseFc).toBeNull();
    expect(p.message).toContain('déclarez les jours payés');
  });

  it('un mois incomplet se mesure au SMIG de ses jours · 10 jours, 215 000 FC', () => {
    expect(plancherCnss('2026-03', 300_000, 10)).toMatchObject({ baseFc: 300_000, applique: false });
    const p = plancherCnss('2026-03', 100_000, 10);
    expect(p).toMatchObject({ baseFc: 215_000, applique: true, plancherFc: 215_000 });
    expect(p.message).toContain('PLANCHER APPLIQUÉ');
  });

  it('mai à décembre 2025 · deux lectures (payé 14 500, fixé 21 500), non tranchées', () => {
    // 400 000 est au-dessus de 14 500 × 26 = 377 000 et sous 559 000.
    const p = plancherCnss('2025-10', 400_000);
    expect(p.baseFc).toBeNull();
    expect(p.message).toContain('PLANCHER NON TRANCHÉ');
    expect(plancherCnss('2025-10', 600_000).baseFc).toBe(600_000);
  });

  it('une grille du cabinet porte un seul taux, et il fait le plancher', () => {
    const grille = annexeDuCabinet({ aPartirDu: '2027-01-01', reference: 'Arrêté de test', smigJournalierFc: 25_000 });
    expect(plancherCnss('2027-02', 600_000, null, [grille]).baseFc).toBeNull();
    expect(plancherCnss('2027-02', 600_000, 26, [grille])).toMatchObject({ baseFc: 650_000, applique: true });
  });

  it('les cotisations CNSS se calculent sur le plancher, l’INPP et l’ONEM sur l’assiette', () => {
    const v = cotisations(100_000, { ...M, joursPayes: 10, natureEmployeurInpp: 'PRIVE', effectif: 10 });
    const par = (cle: string) => v.lignes.find((l) => l.cle === cle)!;
    // Les QUATRE lignes de la CNSS, patronales comprises.
    for (const cle of ['cnss-pf', 'cnss-pension-employeur', 'cnss-pension-travailleur', 'cnss-rp']) {
      expect(par(cle).assietteFc).toBe(215_000);
    }
    expect(par('cnss-pension-travailleur').montantFc).toBeCloseTo(10_750, 6);
    expect(par('inpp').assietteFc).toBe(100_000);
    expect(par('onem').assietteFc).toBe(100_000);
    expect(v.reserves?.join(' ')).toContain('PLANCHER APPLIQUÉ');
  });

  it('une CNSS en abstention ne pose aucune ligne CNSS, et garde l’INPP et l’ONEM', () => {
    const v = cotisations(100_000, { ...M, natureEmployeurInpp: 'PRIVE', effectif: 10 });
    expect(v.lignes.some((l) => l.organisme === 'CNSS')).toBe(false);
    expect(v.abstentions.join(' ')).toContain('ASSIETTE SOUS LE PLANCHER');
    expect(v.lignes.map((l) => l.cle)).toEqual(expect.arrayContaining(['inpp', 'onem']));
  });
});

describe('Passe O4 · la saisie-arrêt et la cession notifiées ne sont plus « un acte que le registre ne porte pas »', () => {
  it('le net les nomme avec leurs articles et le compte 4232', () => {
    for (const avances of [0, 1_000]) {
      const r = netAPayer(1_000_000, 50_000, 10_000, avances).reserves.join(' ');
      expect(r).toContain(RESERVE_SAISIES_ET_CESSIONS);
    }
    expect(RESERVE_SAISIES_ET_CESSIONS).toMatch(/art\. 184, 3° et 206/);
    expect(RESERVE_SAISIES_ET_CESSIONS).toMatch(/personnellement débiteur/);
    expect(RESERVE_SAISIES_ET_CESSIONS).toContain('42320000');
  });
});

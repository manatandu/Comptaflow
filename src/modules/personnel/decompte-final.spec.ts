import {
  CONGE_AJOUT_PAR_TRANCHE_JOURS,
  CONGE_JOURS_PAR_MOIS_MAJEUR,
  CONGE_JOURS_PAR_MOIS_MINEUR,
  DELAI_PAIEMENT_JOURS_OUVRABLES,
  DIVISEUR_ANNUEL,
  JOURS_OUVRABLES_MAXIMUM_EN_TROIS_MOIS,
  JOURS_PAR_MOIS_DE_MOYENNE,
  MOIS_DE_MOYENNE,
  PREAVIS_PAR_ANNEE_JOURS,
  PREAVIS_PLANCHER_JOURS,
  congeLegal,
  decompteFinal,
  joursOuvrablesDeTroisMois,
  motifRefusDecompte,
  preavisLegal,
  prorataAnnuel,
  type ParametresDecompte,
} from './decompte-final';
import { MULTIPLICATEURS_ARTICLE_7 } from './bareme-smig';
import { DECOMPTE_A_LA_RUPTURE, SANCTION_ARTICLE_103 } from './livre-de-paie';

const CDI = 'DUREE_INDETERMINEE' as const;
const CDD = 'DUREE_DETERMINEE' as const;

describe("Le préavis de l'article 64, recopié et non déduit", () => {
  it('porte quatorze jours plus sept par année entière', () => {
    expect(PREAVIS_PLANCHER_JOURS).toBe(14);
    expect(PREAVIS_PAR_ANNEE_JOURS).toBe(7);
    const v = preavisLegal({ anneesAnciennete: 3, initiative: 'EMPLOYEUR', motif: 'LICENCIEMENT', typeContrat: CDI });
    expect(v.joursOuvrables).toBe(14 + 21);
    expect(v.fondement).toBe('Article 64');
  });

  it("n'applique AUCUN barème par catégorie, et dit pourquoi", () => {
    const v = preavisLegal({ anneesAnciennete: 10, initiative: 'EMPLOYEUR', motif: 'LICENCIEMENT', typeContrat: CDI });
    expect(v.joursOuvrables).toBe(14 + 70);
    expect(v.reserves.join(' ')).toContain('ARRÊTÉ');
    expect(v.reserves.join(' ')).toContain('PLANCHER');
  });

  it('porte la durée plus longue que le dossier déclare (convention, contrat)', () => {
    const v = preavisLegal({
      anneesAnciennete: 1,
      initiative: 'EMPLOYEUR',
      motif: 'LICENCIEMENT',
      typeContrat: CDI,
      preavisRetenuJours: 40,
    });
    expect(v.joursOuvrables).toBe(40);
  });

  it('réduit de MOITIÉ le préavis du travailleur qui démissionne', () => {
    const employeur = preavisLegal({ anneesAnciennete: 4, initiative: 'EMPLOYEUR', motif: 'LICENCIEMENT', typeContrat: CDI });
    const travailleur = preavisLegal({ anneesAnciennete: 4, initiative: 'TRAVAILLEUR', motif: 'DEMISSION', typeContrat: CDI });
    expect(travailleur.joursOuvrables).toBe((employeur.joursOuvrables as number) / 2);
    expect(travailleur.reserves.join(' ')).toContain('LA MOITIÉ');
  });

  it('ne doit AUCUN préavis sur faute lourde, terme du CDD ou commun accord, et le motive', () => {
    for (const motif of ['FAUTE_LOURDE', 'TERME_DU_CDD', 'COMMUN_ACCORD'] as const) {
      const v = preavisLegal({ anneesAnciennete: 5, initiative: 'EMPLOYEUR', motif, typeContrat: CDI });
      expect(v.joursOuvrables).toBeNull();
      expect(v.motifAucunPreavis).not.toBeNull();
    }
    expect(
      preavisLegal({ anneesAnciennete: 5, initiative: 'EMPLOYEUR', motif: 'FAUTE_LOURDE', typeContrat: CDI }).motifAucunPreavis,
    ).toContain('Article 72');
    expect(
      preavisLegal({ anneesAnciennete: 5, initiative: 'EMPLOYEUR', motif: 'COMMUN_ACCORD', typeContrat: CDI }).motifAucunPreavis,
    ).toContain('Article 61 bis');
  });

  it("emprunte « jour ouvrable » au CODE DU TRAVAIL, pas à la règle fiscale", () => {
    const r = preavisLegal({ anneesAnciennete: 1, initiative: 'EMPLOYEUR', motif: 'LICENCIEMENT', typeContrat: CDI })
      .reserves.join(' ');
    expect(r).toContain('article 7, point 9');
    expect(r).toContain('LE SAMEDI EST OUVRABLE');
    expect(r).toContain('guichet');
  });
});

describe('D2-A2 · la force majeure est constatée par l’Inspecteur, après deux mois de suspension', () => {
  it("ne dispense du préavis que sur les DEUX faits déclarés", () => {
    const base = { anneesAnciennete: 5, initiative: 'EMPLOYEUR' as const, motif: 'FORCE_MAJEURE' as const, typeContrat: CDI };
    const sans = preavisLegal(base);
    expect(sans.joursOuvrables).toBeNull();
    expect(sans.motifAucunPreavis).toBeNull();
    expect(sans.motifIndetermine).toContain("constaté par l'Inspecteur du Travail");
    expect(sans.motifIndetermine).toContain('deux mois de suspension');
    expect(sans.motifIndetermine).toContain('La faillite et la liquidation judiciaire');
    expect(preavisLegal({ ...base, forceMajeureConstateeParInspecteur: true }).motifIndetermine).not.toBeNull();
    const avec = preavisLegal({ ...base, forceMajeureConstateeParInspecteur: true, deuxMoisDeSuspension: true });
    expect(avec.motifIndetermine).toBeNull();
    expect(avec.motifAucunPreavis).toContain('Article 60 c)');
  });

  it('rend la rubrique indéterminée, jamais zéro, tant que les faits manquent', () => {
    const v = decompteFinal({ ...BASE, motif: 'FORCE_MAJEURE' });
    expect(v.rubriques.find((r) => r.cle === 'preavis')!.montantFc).toBeNull();
    expect(v.totalBrutFc).toBeNull();
  });
});

describe("D2-A3, C6 · le type de contrat et l'essai commandent la durée", () => {
  it("s'abstient sans le type de contrat", () => {
    const v = preavisLegal({ anneesAnciennete: 3, initiative: 'EMPLOYEUR', motif: 'LICENCIEMENT', typeContrat: null });
    expect(v.joursOuvrables).toBeNull();
    expect(v.motifIndetermine).toContain('art. 69');
  });

  it("n'applique jamais l'article 64 à un CDD · il cite l'article 69", () => {
    const v = preavisLegal({ anneesAnciennete: 3, initiative: 'EMPLOYEUR', motif: 'LICENCIEMENT', typeContrat: CDD });
    expect(v.joursOuvrables).toBeNull();
    expect(v.motifAucunPreavis).toContain('nulle de plein droit');
  });

  it("chiffre les dommages-intérêts de l'article 70 sur un CDD rompu par l'employeur", () => {
    const v = decompteFinal({
      ...COMPLET,
      typeContrat: CDD,
      joursRestantsJusquAuTerme: 60,
      avantagesJusquAuTermeFc: 100_000,
    });
    const di = v.rubriques.find((r) => r.cle === 'dommages-interets-art-70')!;
    expect(di.montantFc).toBeCloseTo(60 * 20_000 + 100_000, 6);
    expect(v.rubriques.find((r) => r.cle === 'preavis')!.montantFc).toBe(0);
    expect(decompteFinal({ ...COMPLET, typeContrat: CDD }).rubriques.find((r) => r.cle === 'dommages-interets-art-70')!.montantFc).toBeNull();
  });

  it('met les dommages-intérêts d’un CDD rompu par le travailleur à SA charge, hors du total', () => {
    const v = decompteFinal({ ...COMPLET, typeContrat: CDD, motif: 'DEMISSION', initiative: 'TRAVAILLEUR' });
    expect(v.rubriques.some((r) => r.cle === 'dommages-interets-art-70')).toBe(false);
    expect(v.duParLeTravailleur.map((r) => r.cle)).toContain('dommages-interets-art-70');
  });

  it("porte trois jours pendant l'essai, aucun pendant les trois premiers jours", () => {
    const base = { anneesAnciennete: 0, initiative: 'EMPLOYEUR' as const, motif: 'LICENCIEMENT' as const, typeContrat: CDI, periodeDEssai: true };
    expect(preavisLegal({ ...base, joursDEssaiEcoules: 10 }).joursOuvrables).toBe(3);
    expect(preavisLegal({ ...base, joursDEssaiEcoules: 10 }).fondement).toBe('Article 71');
    expect(preavisLegal({ ...base, joursDEssaiEcoules: 3 }).joursOuvrables).toBeNull();
    expect(preavisLegal({ ...base, joursDEssaiEcoules: 3 }).motifAucunPreavis).toContain('trois premiers jours');
    expect(preavisLegal({ ...base }).motifIndetermine).toContain('Article 71');
  });

  it('refuse les combinaisons que le texte exclut', () => {
    expect(motifRefusDecompte({ initiative: 'EMPLOYEUR', motif: 'DEMISSION' })).toContain('64, alinéa 2');
    expect(motifRefusDecompte({ initiative: 'TRAVAILLEUR', motif: 'LICENCIEMENT' })).not.toBeNull();
    expect(motifRefusDecompte({ initiative: 'EMPLOYEUR', motif: 'TERME_DU_CDD', typeContrat: CDI })).toContain('art. 69');
    expect(motifRefusDecompte({ initiative: 'TRAVAILLEUR', motif: 'DEMISSION', typeContrat: CDI })).toBeNull();
  });
});

describe("D2-B1 · le plancher de trois mois du délégué (art. 258)", () => {
  const delegue = { initiative: 'EMPLOYEUR' as const, motif: 'LICENCIEMENT' as const, typeContrat: CDI, delegueSyndical: true };

  it('compte trois mois de date à date en jours ouvrables, samedi compris, dimanches et fériés exclus', () => {
    // Notification le 2026-01-09 · du 10 janvier au 10 avril exclu. 90 jours,
    // 13 dimanches, et 16 et 17 janvier (vendredi, samedi) et 6 avril (lundi) fériés.
    const t = joursOuvrablesDeTroisMois('2026-01-09');
    expect(t).toEqual({ jours: 90 - 13 - 3, du: '2026-01-10', auExclu: '2026-04-10' });
    expect('refus' in joursOuvrablesDeTroisMois('2022-06-01')).toBe(true);
  });

  it('ne chiffre pas un préavis doublé qui peut rester sous trois mois', () => {
    const v = preavisLegal({ ...delegue, anneesAnciennete: 2 });
    expect(v.joursOuvrables).toBeNull();
    expect(v.motifIndetermine).toContain('TROIS MOIS');
    const d = decompteFinal({ ...COMPLET, delegueSyndical: true, anneesAnciennete: 2 });
    expect(d.rubriques.find((r) => r.cle === 'preavis')!.montantFc).toBeNull();
    expect(d.totalBrutFc).toBeNull();
  });

  it('prend le plus grand du doublé et des trois mois comptés', () => {
    const v = preavisLegal({ ...delegue, anneesAnciennete: 2, dateNotification: '2026-01-09' });
    expect(v.joursOuvrables).toBe(74);
    expect(preavisLegal({ ...delegue, anneesAnciennete: 2, preavisRetenuJours: 78 }).joursOuvrables).toBe(78);
  });

  it('chiffre le doublé quand il dépasse tout ce que trois mois comptent', () => {
    const v = preavisLegal({ ...delegue, anneesAnciennete: 5 });
    expect(2 * (14 + 35)).toBeGreaterThanOrEqual(JOURS_OUVRABLES_MAXIMUM_EN_TROIS_MOIS);
    expect(v.joursOuvrables).toBe(98);
  });

  it("ne double pas le préavis d'un délégué qui démissionne · l'article 258 vise le licenciement", () => {
    const v = preavisLegal({ ...delegue, initiative: 'TRAVAILLEUR', motif: 'DEMISSION', anneesAnciennete: 2 });
    expect(v.joursOuvrables).toBe(14);
  });
});

describe("Le congé de l'article 141, où le séminaire CPCC se trompe trois fois", () => {
  it('donne UN jour au majeur et UN ET DEMI au mineur, pas 1,5 et 2', () => {
    expect(CONGE_JOURS_PAR_MOIS_MAJEUR).toBe(1);
    expect(CONGE_JOURS_PAR_MOIS_MINEUR).toBe(1.5);
    expect(CONGE_AJOUT_PAR_TRANCHE_JOURS).toBe(1);
  });

  it("donne au MINEUR le taux le plus élevé, ce qu'on n'attend pas", () => {
    const majeur = congeLegal({ moisNonCouvertsParUnConge: 12, moinsDeDixHuitAns: false, anneesAnciennete: 1 });
    const mineur = congeLegal({ moisNonCouvertsParUnConge: 12, moinsDeDixHuitAns: true, anneesAnciennete: 1 });
    expect(majeur.joursDeBase).toBe(12);
    expect(mineur.joursDeBase).toBe(18);
  });

  it("ne rend PAS les dix-huit jours du séminaire pour un majeur", () => {
    const v = congeLegal({ moisNonCouvertsParUnConge: 12, moinsDeDixHuitAns: false, anneesAnciennete: 0 });
    expect(v.joursOuvrables).toBe(12);
    expect(v.reserves.join(' ')).toContain('cinquante pour cent trop élevée');
  });

  it("ajoute UN jour par tranche de cinq ans, pas deux, et par tranche ENTIÈRE", () => {
    expect(congeLegal({ moisNonCouvertsParUnConge: 12, moinsDeDixHuitAns: false, anneesAnciennete: 4 }).joursDAnciennete).toBe(0);
    expect(congeLegal({ moisNonCouvertsParUnConge: 12, moinsDeDixHuitAns: false, anneesAnciennete: 5 }).joursDAnciennete).toBe(1);
    expect(congeLegal({ moisNonCouvertsParUnConge: 12, moinsDeDixHuitAns: false, anneesAnciennete: 11 }).joursDAnciennete).toBe(2);
  });

  it('D2-C3 · ajoute la tranche à CHAQUE année non prise, à son ancienneté', () => {
    // Deux années non prises à 11 ans d'ancienneté · la dernière à 11 ans
    // (2 jours), la précédente à 10 ans (2 jours). Ajoutée une fois, 2 jours.
    const deux = congeLegal({ moisNonCouvertsParUnConge: 24, moinsDeDixHuitAns: false, anneesAnciennete: 11 });
    expect(deux.joursDAnciennete).toBe(4);
    expect(deux.joursOuvrables).toBe(28);
    // Et à 6 ans · 6 ans (1), puis 5 ans (1).
    expect(congeLegal({ moisNonCouvertsParUnConge: 24, moinsDeDixHuitAns: false, anneesAnciennete: 6 }).joursDAnciennete).toBe(2);
  });

  it('D2-C3 · proratise la tranche sur une année incomplète, et le dit', () => {
    const v = congeLegal({ moisNonCouvertsParUnConge: 4, moinsDeDixHuitAns: false, anneesAnciennete: 11 });
    expect(v.joursDAnciennete).toBeCloseTo((2 * 4) / 12, 9);
    expect(v.reserves.join(' ')).toContain('au prorata');
  });

  it("compte les mois NON COUVERTS par un congé pris ou payé, qui sont SAISIS", () => {
    const r = congeLegal({ moisNonCouvertsParUnConge: 12, moinsDeDixHuitAns: false, anneesAnciennete: 1 }).reserves.join(' ');
    expect(r).toContain('NON COUVERTS PAR UN CONGÉ PRIS OU PAYÉ');
    expect(r).toContain('incapacité de travail');
  });
});

describe('Le prorata du séminaire, et il est juste', () => {
  it('reprend le 312 du décret SMIG au lieu de le réécrire', () => {
    expect(DIVISEUR_ANNUEL).toBe(MULTIPLICATEURS_ARTICLE_7.ANNEE);
    expect(DIVISEUR_ANNUEL).toBe(312);
  });

  it('proratise sur les jours prestés', () => {
    expect(prorataAnnuel(3_120_000, 156)).toBeCloseTo(1_560_000, 6);
    expect(prorataAnnuel(3_120_000, 0)).toBe(0);
    expect(prorataAnnuel(-1, 100)).toBe(0);
  });
});

const BASE: ParametresDecompte = {
  anneesAnciennete: 3,
  moisNonCouvertsParUnConge: 12,
  moinsDeDixHuitAns: false,
  initiative: 'EMPLOYEUR',
  motif: 'LICENCIEMENT',
  typeContrat: CDI,
  remunerationJournaliereFc: 20_000,
};

/** Tout ce qu'un licenciement non observé demande · 35 jours, 12 jours de congé. */
const COMPLET: ParametresDecompte = {
  ...BASE,
  executionPreavis: 'NON_OBSERVE',
  joursPreavisNonObserves: 35,
  moyenneMensuelleArticle66Fc: 26_000,
  moyenneMensuelleArticle142Fc: 52_000,
  avantagesPendantPreavisFc: 70_000,
  arrieresFc: 150_000,
  gratificationFc: 400_000,
  enfantsBeneficiairesAllocations: 2,
  joursAllocationsFamiliales: 30,
  allocationFamilialeParEnfantFc: 796.3,
};

describe("D2-A1, C4 · l'indemnité de préavis est due par la partie responsable, et seulement si le préavis n'est pas observé", () => {
  it("rend la rubrique indéterminée tant que l'exécution n'est pas déclarée", () => {
    const v = decompteFinal(BASE);
    const p = v.rubriques.find((r) => r.cle === 'preavis')!;
    expect(p.montantFc).toBeNull();
    expect(p.reserve).toContain('63, alinéa 3');
  });

  it("porte ZÉRO sur un préavis presté · il se paie en salaire, pas deux fois", () => {
    const p = decompteFinal({ ...COMPLET, executionPreavis: 'PRESTE' }).rubriques.find((r) => r.cle === 'preavis')!;
    expect(p.montantFc).toBe(0);
    expect(p.fondement).toContain('presté');
  });

  it("crédite le travailleur des seuls jours non observés quand l'employeur est responsable", () => {
    const p = decompteFinal({ ...COMPLET, joursPreavisNonObserves: 10 }).rubriques.find((r) => r.cle === 'preavis')!;
    expect(p.montantFc).toBeCloseTo(10 * (20_000 + 1_000) + 70_000, 6);
  });

  it("met le préavis non observé du démissionnaire à SA charge, hors du total", () => {
    const v = decompteFinal({ ...COMPLET, motif: 'DEMISSION', initiative: 'TRAVAILLEUR', joursPreavisNonObserves: 17.5 });
    expect(v.rubriques.find((r) => r.cle === 'preavis')!.montantFc).toBe(0);
    const du = v.duParLeTravailleur.find((r) => r.cle === 'preavis')!;
    expect(du.montantFc).toBeCloseTo(17.5 * 21_000 + 70_000, 6);
    // Le total dû au travailleur ne contient pas ce qu'il doit.
    const sansPreavis = decompteFinal({ ...COMPLET, motif: 'DEMISSION', initiative: 'TRAVAILLEUR', executionPreavis: 'PRESTE' });
    expect(v.totalBrutFc).toBeCloseTo(sansPreavis.totalBrutFc as number, 6);
  });

  it("fait payer l'employeur qui dispense, jamais le travailleur qui demande la dispense", () => {
    const disp = decompteFinal({ ...COMPLET, executionPreavis: 'DISPENSE_PAR_EMPLOYEUR' }).rubriques.find((r) => r.cle === 'preavis')!;
    expect(disp.montantFc).toBeCloseTo(35 * 21_000 + 70_000, 6);
    const dem = decompteFinal({ ...COMPLET, executionPreavis: 'DISPENSE_A_LA_DEMANDE_DU_TRAVAILLEUR' }).rubriques.find((r) => r.cle === 'preavis')!;
    expect(dem.montantFc).toBe(0);
  });

  it("laisse le commun accord À SAISIR, jamais zéro", () => {
    const v = decompteFinal({ ...COMPLET, motif: 'COMMUN_ACCORD' });
    const p = v.rubriques.find((r) => r.cle === 'preavis')!;
    expect(p.montantFc).toBeNull();
    expect(p.fondement).toContain('61 bis');
    expect(decompteFinal({ ...COMPLET, motif: 'COMMUN_ACCORD', montantConvenuCommunAccordFc: 500_000 }).rubriques.find((r) => r.cle === 'preavis')!.montantFc).toBe(500_000);
  });
});

describe("D2-A4 · l'indemnité compte les avantages de toute nature", () => {
  it('reste indéterminée tant que les avantages ne sont pas renseignés', () => {
    const p = decompteFinal({ ...COMPLET, avantagesPendantPreavisFc: null }).rubriques.find((r) => r.cle === 'preavis')!;
    expect(p.montantFc).toBeNull();
    expect(p.reserve).toContain('avantages de toute nature');
  });
});

describe("D2-B3, C5 · la moyenne des douze mois entre dans la rémunération de chaque jour", () => {
  it("n'est plus une rubrique autonome", () => {
    expect(decompteFinal(COMPLET).rubriques.map((r) => r.cle)).not.toContain('moyenne-douze-mois');
  });

  it('se ramène au jour par vingt-six et suit le nombre de jours', () => {
    expect(JOURS_PAR_MOIS_DE_MOYENNE).toBe(26);
    expect(MOIS_DE_MOYENNE).toBe(12);
    const conge = decompteFinal(COMPLET).rubriques.find((r) => r.cle === 'conge')!;
    expect(conge.montantFc).toBeCloseTo(12 * (20_000 + 2_000), 6);
    expect(conge.fondement).toContain('ramenée au jour');
  });

  it("prend une moyenne par article · gratifications à l'art. 66, prestations supplémentaires à l'art. 142", () => {
    const v = decompteFinal({ ...COMPLET, moyenneMensuelleArticle142Fc: null });
    expect(v.rubriques.find((r) => r.cle === 'conge')!.montantFc).toBeNull();
    expect(v.rubriques.find((r) => r.cle === 'preavis')!.montantFc).not.toBeNull();
    const w = decompteFinal({ ...COMPLET, moyenneMensuelleArticle66Fc: null });
    expect(w.rubriques.find((r) => r.cle === 'preavis')!.montantFc).toBeNull();
    expect(w.rubriques.find((r) => r.cle === 'conge')!.montantFc).not.toBeNull();
  });
});

describe('Le décompte, et ce qui reste indéterminé', () => {
  it("rend le total dès que TOUT est renseigné", () => {
    const v = decompteFinal(COMPLET);
    expect(v.rubriques.every((r) => r.montantFc !== null)).toBe(true);
    const brut = 150_000 + (35 * 21_000 + 70_000) + 12 * 22_000 + 400_000;
    expect(v.totalBrutFc).toBeCloseTo(brut, 6);
    expect(v.totalDuAuTravailleurFc).toBeCloseTo(brut + 2 * 30 * 796.3, 6);
  });

  it("ne rend JAMAIS zéro là où personne n'a répondu", () => {
    const v = decompteFinal(BASE);
    for (const cle of ['arrieres', 'gratification']) {
      expect(v.rubriques.find((r) => r.cle === cle)!.montantFc).toBeNull();
    }
  });

  it('porte un préavis à ZÉRO sur faute lourde, et le motive', () => {
    const v = decompteFinal({ ...BASE, motif: 'FAUTE_LOURDE' });
    const preavis = v.rubriques.find((r) => r.cle === 'preavis')!;
    expect(preavis.montantFc).toBe(0);
    expect(preavis.fondement).toContain('Article 72');
  });

  it("s'abstient sur préavis et congé sans taux journalier", () => {
    const v = decompteFinal({ ...COMPLET, remunerationJournaliereFc: null });
    expect(v.rubriques.find((r) => r.cle === 'preavis')!.montantFc).toBeNull();
    expect(v.rubriques.find((r) => r.cle === 'conge')!.montantFc).toBeNull();
  });

  it("nomme l'échéance des deux jours ouvrables", () => {
    expect(DELAI_PAIEMENT_JOURS_OUVRABLES).toBe(2);
    expect(decompteFinal(BASE).echeancePaiement).toContain('JOURS OUVRABLES');
    expect(decompteFinal(BASE).echeancePaiement).toContain('145');
  });
});

describe('D2-B6 · les allocations familiales, hors du brut mais dans le total dû', () => {
  it('sont indéterminées tant que les enfants et les jours manquent', () => {
    const v = decompteFinal({ ...COMPLET, joursAllocationsFamiliales: null });
    expect(v.horsBrut.find((r) => r.cle === 'allocations-familiales')!.montantFc).toBeNull();
    expect(v.totalBrutFc).not.toBeNull();
    expect(v.totalDuAuTravailleurFc).toBeNull();
  });

  it('sont nulles pour zéro enfant, et ce zéro est une réponse', () => {
    const v = decompteFinal({ ...COMPLET, enfantsBeneficiairesAllocations: 0, joursAllocationsFamiliales: null });
    expect(v.horsBrut[0].montantFc).toBe(0);
    expect(v.totalDuAuTravailleurFc).toBeCloseTo(v.totalBrutFc as number, 6);
  });

  it("disent pourquoi le taux manque", () => {
    const v = decompteFinal({ ...COMPLET, allocationFamilialeParEnfantFc: null, explicationAllocationFamiliale: 'motif du barème' });
    expect(v.horsBrut[0].montantFc).toBeNull();
    expect(v.horsBrut[0].reserve).toBe('motif du barème');
  });
});

describe('Ce que le décompte écarte du séminaire CPCC', () => {
  it("écarte la retenue syndicale de 2 %", () => {
    const r = decompteFinal(COMPLET).reserves.join(' ');
    expect(r).toContain('article 112');
    expect(r).toContain('Aucune retenue « syndicat » n\'est appliquée');
  });

  it("signale l'exception du LOGEMENT de l'article 142", () => {
    const conge = decompteFinal(COMPLET).rubriques.find((x) => x.cle === 'conge')!;
    expect(conge.reserve).toContain('EXCEPTION FAITE SEULEMENT POUR LE LOGEMENT');
  });

  it("D2-B2 · range l'indemnité de logement HORS de la rémunération de l'allocation (art. 7, point 8)", () => {
    const conge = decompteFinal(COMPLET).rubriques.find((x) => x.cle === 'conge')!;
    expect(conge.reserve).toContain("« l'indemnité de logement ou le logement en nature » · ni l'une ni l'autre n'y entre");
  });

  it("ne présume la gratification ni due ni nulle", () => {
    const ligne = decompteFinal(BASE).rubriques.find((x) => x.cle === 'gratification')!;
    expect(ligne.montantFc).toBeNull();
    expect(ligne.fondement).toContain("AUCUN article n'en impose le versement");
  });
});

describe("D2-B4 · le décompte écrit est une OBLIGATION de l'arrêté de 2008", () => {
  it('sert la règle de la rupture et la sanction de l’article 103', () => {
    const r = decompteFinal(BASE).reserves;
    expect(r).toContain(DECOMPTE_A_LA_RUPTURE);
    expect(r).toContain(SANCTION_ARTICLE_103);
    // A8 · la garantie négative a vieilli avec l'émission · la réserve dit
    // désormais où le document daté se fige.
    expect(r.join(' ')).toContain("il le devient à l'ÉMISSION, qui fige le document daté");
  });
});

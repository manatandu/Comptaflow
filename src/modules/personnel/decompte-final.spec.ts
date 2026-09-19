import {
  CONGE_AJOUT_PAR_TRANCHE_JOURS,
  CONGE_JOURS_PAR_MOIS_MAJEUR,
  CONGE_JOURS_PAR_MOIS_MINEUR,
  DELAI_PAIEMENT_JOURS_OUVRABLES,
  DIVISEUR_ANNUEL,
  MOIS_DE_MOYENNE,
  PREAVIS_PAR_ANNEE_JOURS,
  PREAVIS_PLANCHER_JOURS,
  congeLegal,
  decompteFinal,
  preavisLegal,
  prorataAnnuel,
} from './decompte-final';
import { MULTIPLICATEURS_ARTICLE_7 } from './bareme-smig';

describe("Le préavis de l'article 64, recopié et non déduit", () => {
  it('porte quatorze jours plus sept par année entière', () => {
    expect(PREAVIS_PLANCHER_JOURS).toBe(14);
    expect(PREAVIS_PAR_ANNEE_JOURS).toBe(7);
    const v = preavisLegal({ anneesAnciennete: 3, initiative: 'EMPLOYEUR', motif: 'LICENCIEMENT' });
    expect(v.joursOuvrables).toBe(14 + 21);
  });

  it("n'applique AUCUN barème par catégorie, et dit pourquoi", () => {
    // Le séminaire CPCC porte « 1 mois + 9 jours » pour la maîtrise et
    // « 3 mois + 16 jours » pour les cadres. Ces chiffres viennent d'un ARRÊTÉ
    // que l'article 64 annonce et qui n'est pas au corpus.
    const v = preavisLegal({ anneesAnciennete: 10, initiative: 'EMPLOYEUR', motif: 'LICENCIEMENT' });
    expect(v.joursOuvrables).toBe(14 + 70);
    expect(v.reserves.join(' ')).toContain('ARRÊTÉ');
    expect(v.reserves.join(' ')).toContain('PLANCHER');
  });

  it('réduit de MOITIÉ le préavis du travailleur qui démissionne', () => {
    const employeur = preavisLegal({ anneesAnciennete: 4, initiative: 'EMPLOYEUR', motif: 'LICENCIEMENT' });
    const travailleur = preavisLegal({ anneesAnciennete: 4, initiative: 'TRAVAILLEUR', motif: 'DEMISSION' });
    expect(travailleur.joursOuvrables).toBe((employeur.joursOuvrables as number) / 2);
    expect(travailleur.reserves.join(' ')).toContain('LA MOITIÉ');
  });

  it("DOUBLE celui du délégué syndical, et ne convertit PAS les trois mois", () => {
    const simple = preavisLegal({ anneesAnciennete: 2, initiative: 'EMPLOYEUR', motif: 'LICENCIEMENT' });
    const delegue = preavisLegal({
      anneesAnciennete: 2,
      initiative: 'EMPLOYEUR',
      motif: 'LICENCIEMENT',
      delegueSyndical: true,
    });
    expect(delegue.joursOuvrables).toBe((simple.joursOuvrables as number) * 2);
    // Le texte exprime le plancher en MOIS et le préavis en JOURS OUVRABLES ·
    // aucune source lue ne convertit les uns dans les autres.
    expect(delegue.reserves.join(' ')).toContain('TROIS MOIS NE L');
  });

  it('ne doit AUCUN préavis sur faute lourde, force majeure ou terme du CDD', () => {
    for (const motif of ['FAUTE_LOURDE', 'FORCE_MAJEURE', 'TERME_DU_CDD'] as const) {
      const v = preavisLegal({ anneesAnciennete: 5, initiative: 'EMPLOYEUR', motif });
      expect(v.joursOuvrables).toBeNull();
      expect(v.motifAucunPreavis).not.toBeNull();
    }
    expect(
      preavisLegal({ anneesAnciennete: 5, initiative: 'EMPLOYEUR', motif: 'FAUTE_LOURDE' })
        .motifAucunPreavis,
    ).toContain('Article 72');
  });

  it("emprunte « jour ouvrable » au CODE DU TRAVAIL, pas à la règle fiscale", () => {
    // Le dépôt a appris le 18/09 que la question est DEVANT QUI l'obligation
    // s'exécute. Un préavis s'exécute entre l'employeur et le travailleur.
    const r = preavisLegal({ anneesAnciennete: 1, initiative: 'EMPLOYEUR', motif: 'LICENCIEMENT' })
      .reserves.join(' ');
    expect(r).toContain('article 7, point 9');
    expect(r).toContain('LE SAMEDI EST OUVRABLE');
    expect(r).toContain('guichet');
  });
});

describe("Le congé de l'article 141, où le séminaire CPCC se trompe trois fois", () => {
  it('donne UN jour au majeur et UN ET DEMI au mineur, pas 1,5 et 2', () => {
    expect(CONGE_JOURS_PAR_MOIS_MAJEUR).toBe(1);
    expect(CONGE_JOURS_PAR_MOIS_MINEUR).toBe(1.5);
    expect(CONGE_AJOUT_PAR_TRANCHE_JOURS).toBe(1);
  });

  it("donne au MINEUR le taux le plus élevé, ce qu'on n'attend pas", () => {
    const majeur = congeLegal({ moisEntiersDeService: 12, moinsDeDixHuitAns: false, anneesAnciennete: 1 });
    const mineur = congeLegal({ moisEntiersDeService: 12, moinsDeDixHuitAns: true, anneesAnciennete: 1 });
    expect(majeur.joursDeBase).toBe(12);
    expect(mineur.joursDeBase).toBe(18);
    expect(mineur.joursDeBase).toBeGreaterThan(majeur.joursDeBase);
  });

  it("ne rend PAS les dix-huit jours du séminaire pour un majeur", () => {
    // Le défaut visé, et il coûte cinquante pour cent : le séminaire sert au
    // MAJEUR le taux que l'article 141 réserve au MINEUR.
    const v = congeLegal({ moisEntiersDeService: 12, moinsDeDixHuitAns: false, anneesAnciennete: 0 });
    expect(v.joursOuvrables).toBe(12);
    expect(v.joursOuvrables).not.toBe(18);
    expect(v.reserves.join(' ')).toContain('cinquante pour cent trop élevée');
  });

  it("ajoute UN jour par tranche de cinq ans, pas deux, et par tranche ENTIÈRE", () => {
    const quatre = congeLegal({ moisEntiersDeService: 48, moinsDeDixHuitAns: false, anneesAnciennete: 4 });
    const cinq = congeLegal({ moisEntiersDeService: 60, moinsDeDixHuitAns: false, anneesAnciennete: 5 });
    const onze = congeLegal({ moisEntiersDeService: 132, moinsDeDixHuitAns: false, anneesAnciennete: 11 });
    expect(quatre.joursDAnciennete).toBe(0);
    expect(cinq.joursDAnciennete).toBe(1);
    expect(onze.joursDAnciennete).toBe(2);
  });

  it("ne recompose pas les mois de service, qui sont SAISIS", () => {
    const r = congeLegal({ moisEntiersDeService: 12, moinsDeDixHuitAns: false, anneesAnciennete: 1 })
      .reserves.join(' ');
    expect(r).toContain('sont SAISIS');
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

describe('Le décompte, et ce qui reste indéterminé', () => {
  const base = {
    anneesAnciennete: 3,
    moisEntiersDeService: 42,
    moinsDeDixHuitAns: false,
    initiative: 'EMPLOYEUR' as const,
    motif: 'LICENCIEMENT' as const,
    remunerationJournaliereFc: 20_000,
  };

  it('chiffre le préavis et le congé, et laisse le reste ouvert', () => {
    const v = decompteFinal(base);
    const preavis = v.rubriques.find((r) => r.cle === 'preavis')!;
    const conge = v.rubriques.find((r) => r.cle === 'conge')!;
    expect(preavis.montantFc).toBeCloseTo(20_000 * 35, 6);
    expect(conge.montantFc).toBeCloseTo(20_000 * 42, 6);
    expect(v.totalBrutFc).toBeNull();
  });

  it("rend le total dès que TOUT est renseigné", () => {
    const v = decompteFinal({
      ...base,
      arrieresFc: 150_000,
      moyenneDouzeMoisFc: 90_000,
      gratificationFc: 400_000,
    });
    expect(v.rubriques.every((r) => r.montantFc !== null)).toBe(true);
    expect(v.totalBrutFc).toBeCloseTo(150_000 + 700_000 + 840_000 + 90_000 + 400_000, 6);
  });

  it("ne rend JAMAIS zéro là où personne n'a répondu", () => {
    // Un zéro se lit « rien n'est dû », un null « personne n'a répondu ».
    const v = decompteFinal(base);
    for (const cle of ['arrieres', 'moyenne-douze-mois', 'gratification']) {
      expect(v.rubriques.find((r) => r.cle === cle)!.montantFc).toBeNull();
    }
  });

  it('porte un préavis à ZÉRO sur faute lourde, et le motive', () => {
    // Là, le zéro est une RÉPONSE : l'article 72 le dit.
    const v = decompteFinal({ ...base, motif: 'FAUTE_LOURDE' });
    const preavis = v.rubriques.find((r) => r.cle === 'preavis')!;
    expect(preavis.montantFc).toBe(0);
    expect(preavis.fondement).toContain('Article 72');
  });

  it("s'abstient sur préavis et congé sans taux journalier", () => {
    const v = decompteFinal({ ...base, remunerationJournaliereFc: null });
    expect(v.rubriques.find((r) => r.cle === 'preavis')!.montantFc).toBeNull();
    expect(v.rubriques.find((r) => r.cle === 'conge')!.montantFc).toBeNull();
  });

  it("nomme l'échéance des deux jours ouvrables", () => {
    expect(DELAI_PAIEMENT_JOURS_OUVRABLES).toBe(2);
    expect(decompteFinal(base).echeancePaiement).toContain('JOURS OUVRABLES');
    expect(decompteFinal(base).echeancePaiement).toContain('145');
  });
});

describe('Ce que le décompte écarte du séminaire CPCC', () => {
  const v = () =>
    decompteFinal({
      anneesAnciennete: 1,
      moisEntiersDeService: 12,
      moinsDeDixHuitAns: false,
      initiative: 'EMPLOYEUR',
      motif: 'LICENCIEMENT',
      remunerationJournaliereFc: 10_000,
    });

  it("écarte l'IPR à 10 % et la retenue syndicale de 2 %", () => {
    const r = v().reserves.join(' ');
    expect(r).toContain('ABROGÉ');
    expect(r).toContain('article 112');
    expect(r).toContain("syndicat 2 %");
  });

  it("signale l'exception du LOGEMENT de l'article 142", () => {
    const conge = v().rubriques.find((x) => x.cle === 'conge')!;
    expect(conge.reserve).toContain('EXCEPTION FAITE SEULEMENT POUR LE LOGEMENT');
  });

  it('prend la moyenne sur DOUZE mois, jamais le dernier', () => {
    expect(MOIS_DE_MOYENNE).toBe(12);
    const ligne = v().rubriques.find((x) => x.cle === 'moyenne-douze-mois')!;
    expect(ligne.fondement).toContain('DOUZE MOIS');
    expect(ligne.reserve).toContain('plausible et faux');
  });

  it("ne présume la gratification ni due ni nulle", () => {
    const ligne = v().rubriques.find((x) => x.cle === 'gratification')!;
    expect(ligne.montantFc).toBeNull();
    expect(ligne.fondement).toContain("AUCUN article n'en impose le versement");
  });
});

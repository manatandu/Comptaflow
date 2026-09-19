import {
  HORS_REMUNERATION_ARTICLE_7,
  IMMUNITES_ARTICLE_69,
  PLAFOND_LOGEMENT_POUR_CENT,
  assiettes,
  assietteSociale,
  type ElementPaie,
} from './assiettes-paie';

const salaire = (montantFc: number): ElementPaie => ({
  nature: 'SALAIRE_OU_TRAITEMENT',
  libelle: 'Salaire de base',
  montantFc,
});

describe("L'assiette sociale de l'article 7, point 8 du Code du travail", () => {
  it('sort CINQ natures, et la liste est fermée', () => {
    expect([...HORS_REMUNERATION_ARTICLE_7]).toEqual([
      'SOINS_DE_SANTE',
      'LOGEMENT_OU_SON_INDEMNITE',
      'ALLOCATIONS_FAMILIALES_LEGALES',
      'INDEMNITE_DE_TRANSPORT',
      'FRAIS_DE_VOYAGE_OU_AVANTAGE_DE_FONCTION',
    ]);
  });

  it("exclut SANS CONDITION, quel que soit le montant", () => {
    // Une indemnité de logement de 500 % du salaire sort quand même : le
    // Code du travail ne pose aucun seuil. C'est ce qui la distingue de
    // l'assiette fiscale, où l'article 69, 8, a) en pose un.
    const petit = assietteSociale([
      salaire(1_000_000),
      { nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement', montantFc: 100_000 },
    ]);
    const enorme = assietteSociale([
      salaire(1_000_000),
      { nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement', montantFc: 5_000_000 },
    ]);
    expect(petit.montantFc).toBe(1_000_000);
    expect(enorme.montantFc).toBe(1_000_000);
    expect(enorme.horsRemuneration[0].motif).toContain("ne porte aucune condition");
  });

  it("fait entrer dans la rémunération tout ce que l'article 7 n'a pas exclu", () => {
    // La liste d'INCLUSION est ouverte (« comprend notamment »), celle
    // d'EXCLUSION est fermée. Le sens sûr est l'inclusion : présumer
    // l'exclusion minorerait la pension du travailleur.
    const verdict = assietteSociale([
      salaire(500_000),
      { nature: 'PRIME', libelle: 'Prime de rendement', montantFc: 200_000 },
      { nature: 'AVANTAGE_EN_NATURE', libelle: 'Véhicule', montantFc: 300_000 },
      {
        nature: 'INDEMNITE_INCAPACITE_OU_ACCOUCHEMENT',
        libelle: 'Congé de maternité',
        montantFc: 100_000,
      },
    ]);
    expect(verdict.montantFc).toBe(1_100_000);
    expect(verdict.horsRemuneration).toHaveLength(0);
  });
});

describe("Les deux assiettes ne se servent JAMAIS l'une pour l'autre", () => {
  it("impose un logement que l'assiette sociale exclut de plein droit", () => {
    // LE DÉFAUT QUE CE TEST EXISTE POUR ATTRAPER · servir la liste du Code du
    // travail à l'assiette fiscale. Le logement fait 40 % de la rémunération,
    // au-dessus des 30 % de l'article 69, 8, a).
    const elements: ElementPaie[] = [
      salaire(1_000_000),
      { nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement', montantFc: 400_000 },
    ];
    const verdict = assiettes(elements);
    expect(verdict.assietteSocialeFc).toBe(1_000_000);
    expect(verdict.assietteFiscaleBruteFc).toBe(1_400_000);
    expect(verdict.assietteFiscaleBruteFc).not.toBe(verdict.assietteSocialeFc);
  });

  it("n'impose PAS un logement qui reste sous les 30 %", () => {
    const verdict = assiettes([
      salaire(1_000_000),
      { nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement', montantFc: 300_000 },
    ]);
    expect(verdict.assietteSocialeFc).toBe(1_000_000);
    expect(verdict.assietteFiscaleBruteFc).toBe(1_000_000);
  });

  it("bascule à l'exact franc où la condition cesse d'être remplie", () => {
    const plafond = (1_000_000 * PLAFOND_LOGEMENT_POUR_CENT) / 100;
    const juste = assiettes([
      salaire(1_000_000),
      { nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement', montantFc: plafond },
    ]);
    const unFrancDeTrop = assiettes([
      salaire(1_000_000),
      { nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement', montantFc: plafond + 1 },
    ]);
    expect(juste.assietteFiscaleBruteFc).toBe(1_000_000);
    expect(unFrancDeTrop.assietteFiscaleBruteFc).toBe(1_000_000 + plafond + 1);
  });
});

describe("« Pour autant que » n'est pas « dans la limite de »", () => {
  it("impose le logement ENTIER, pas seulement son excédent", () => {
    // 400 000 FC de logement sur 1 000 000 de rémunération : le plafond de
    // comparaison vaut 300 000, l'excédent 100 000. L'article 69, 8, a) étant
    // une CONDITION, c'est 400 000 qui sont imposables, pas 100 000.
    const verdict = assiettes([
      salaire(1_000_000),
      { nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement', montantFc: 400_000 },
    ]);
    const logement = verdict.sortsFiscaux.find((s) => s.libelle === 'Logement');
    expect(logement?.imposableFc).toBe(400_000);
    expect(logement?.imposableFc).not.toBe(100_000);
  });

  it("nomme l'autre lecture et chiffre ce qu'elle changerait", () => {
    const verdict = assiettes([
      salaire(1_000_000),
      { nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement', montantFc: 400_000 },
    ]);
    const reserves = verdict.reserves.join(' ');
    expect(reserves).toContain('article 116');
    expect(reserves).toContain('100000.00 FC');
    expect(reserves).toContain('BASE DES 30 %');
  });

  it("plafonne au contraire les allocations familiales, qui sont écrites « dans la mesure où »", () => {
    const verdict = assiettes(
      [
        salaire(1_000_000),
        {
          nature: 'ALLOCATIONS_FAMILIALES_LEGALES',
          libelle: 'Allocations familiales',
          montantFc: 50_000,
        },
      ],
      { tauxLegalAllocationsFamilialesFc: 30_000 },
    );
    const allocation = verdict.sortsFiscaux.find(
      (s) => s.libelle === 'Allocations familiales',
    );
    // Seul l'excédent, et non le montant entier : les deux formulations de la
    // même loi ne produisent pas le même chiffre.
    expect(allocation?.imposableFc).toBe(20_000);
    expect(verdict.assietteFiscaleBruteFc).toBe(1_020_000);
  });

  it("les deux formes rendent des chiffres différents sur des données identiques", () => {
    const communs = { montantFc: 400_000 };
    const logement = assiettes([
      salaire(1_000_000),
      { nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'L', ...communs },
    ]);
    const allocations = assiettes(
      [
        salaire(1_000_000),
        { nature: 'ALLOCATIONS_FAMILIALES_LEGALES', libelle: 'A', ...communs },
      ],
      { tauxLegalAllocationsFamilialesFc: 300_000 },
    );
    expect(logement.assietteFiscaleBruteFc).toBe(1_400_000);
    expect(allocations.assietteFiscaleBruteFc).toBe(1_100_000);
  });
});

describe("Les abstentions plutôt que les suppositions", () => {
  it("n'immunise JAMAIS un transport dont la condition n'est pas attestée", () => {
    const verdict = assiettes([
      salaire(1_000_000),
      { nature: 'INDEMNITE_DE_TRANSPORT', libelle: 'Transport', montantFc: 120_000 },
    ]);
    expect(verdict.assietteFiscaleBruteFc).toBeNull();
    expect(verdict.assietteFiscaleNetteFc).toBeNull();
    expect(verdict.abstentions).toHaveLength(1);
    expect(verdict.abstentions[0].motif).toBe('CONDITION_ARTICLE_69_NON_ATTESTEE');
    // Et l'assiette SOCIALE, elle, reste chiffrée : l'abstention fiscale ne
    // doit pas emporter la cotisation.
    expect(verdict.assietteSocialeFc).toBe(1_000_000);
  });

  it("immunise le transport quand le cabinet atteste, et l'impose quand il ne peut pas", () => {
    const atteste = assiettes([
      salaire(1_000_000),
      {
        nature: 'INDEMNITE_DE_TRANSPORT',
        libelle: 'Transport',
        montantFc: 120_000,
        conditionArticle69Attestee: true,
      },
    ]);
    const refuse = assiettes([
      salaire(1_000_000),
      {
        nature: 'INDEMNITE_DE_TRANSPORT',
        libelle: 'Transport',
        montantFc: 120_000,
        conditionArticle69Attestee: false,
      },
    ]);
    expect(atteste.assietteFiscaleBruteFc).toBe(1_000_000);
    expect(refuse.assietteFiscaleBruteFc).toBe(1_120_000);
    expect(refuse.abstentions).toHaveLength(0);
  });

  it("s'abstient sur les allocations familiales tant que le taux légal n'est pas fourni", () => {
    // Deux textes portent deux montants et aucune source lue ne dit lequel
    // vaut. OmegaX ne choisit pas.
    const verdict = assiettes([
      salaire(1_000_000),
      {
        nature: 'ALLOCATIONS_FAMILIALES_LEGALES',
        libelle: 'Allocations',
        montantFc: 50_000,
      },
    ]);
    expect(verdict.assietteFiscaleBruteFc).toBeNull();
    expect(verdict.abstentions[0].motif).toBe(
      'TAUX_LEGAL_ALLOCATIONS_FAMILIALES_NON_FOURNI',
    );
    expect(verdict.abstentions[0].explication).toContain('137/2018');
    expect(verdict.abstentions[0].explication).toContain('25/22');
  });
});

describe("Les articles 70 et 71 · l'ordre de calcul", () => {
  it("déduit les retenues de l'article 71 APRÈS l'article 69, jamais avant", () => {
    const verdict = assiettes(
      [salaire(1_000_000), { nature: 'PRIME', libelle: 'Prime', montantFc: 200_000 }],
      { retenuesArticle71Fc: 60_000 },
    );
    expect(verdict.assietteFiscaleBruteFc).toBe(1_200_000);
    expect(verdict.retenuesArticle71Fc).toBe(60_000);
    expect(verdict.assietteFiscaleNetteFc).toBe(1_140_000);
  });

  it("dit pourquoi la quote-part ouvrière de la CNSS y entre, et la patronale non", () => {
    const verdict = assiettes([salaire(1_000_000)], { retenuesArticle71Fc: 50_000 });
    const reserves = verdict.reserves.join(' ');
    expect(reserves).toMatch(/article 71/i);
    expect(reserves).toContain('caisses de pension officielles');
    expect(reserves).toContain('patronales');
  });

  it('ne rend jamais une assiette nette négative', () => {
    const verdict = assiettes([salaire(100_000)], { retenuesArticle71Fc: 500_000 });
    expect(verdict.assietteFiscaleNetteFc).toBe(0);
  });
});

describe("L'article 68, 1 · le remboursement de dépenses professionnelles", () => {
  it("sort du brut fiscal une dépense professionnelle EFFECTIVE, sans passer par l'article 69", () => {
    const verdict = assiettes([
      salaire(1_000_000),
      {
        nature: 'FRAIS_DE_VOYAGE_OU_AVANTAGE_DE_FONCTION',
        libelle: 'Mission Lubumbashi',
        montantFc: 250_000,
        remboursementDeDepenseProfessionnelleEffective: true,
      },
    ]);
    expect(verdict.assietteFiscaleBruteFc).toBe(1_000_000);
    const ligne = verdict.sortsFiscaux.find((s) => s.libelle === 'Mission Lubumbashi');
    expect(ligne?.motif).toContain('Article 68, 1');
  });

  it("impose au contraire un frais de voyage qui n'est pas un remboursement effectif", () => {
    // L'article 69 ferme sa liste d'immunités et n'y porte PAS les frais de
    // voyage, alors que le Code du travail les sort de la rémunération. C'est
    // le second endroit où les deux listes divergent.
    const verdict = assiettes([
      salaire(1_000_000),
      {
        nature: 'FRAIS_DE_VOYAGE_OU_AVANTAGE_DE_FONCTION',
        libelle: 'Billet de congé',
        montantFc: 250_000,
      },
    ]);
    expect(verdict.assietteSocialeFc).toBe(1_000_000);
    expect(verdict.assietteFiscaleBruteFc).toBe(1_250_000);
  });
});

describe("La table des immunités", () => {
  it('ne porte que les points que l\'article 69 applique à un élément de paie', () => {
    expect(IMMUNITES_ARTICLE_69.map((i) => i.point)).toEqual([
      'article 69, 1',
      'article 69, 8, a)',
      'article 69, 8, b)',
      'article 69, 8, c)',
    ]);
  });

  it('distingue la forme de chaque point, et une seule est un plafond', () => {
    const formes = IMMUNITES_ARTICLE_69.map((i) => i.forme);
    expect(formes).toEqual(['PLAFOND', 'CONDITION', 'CONDITION', 'CONDITION']);
    expect(formes.filter((f) => f === 'PLAFOND')).toHaveLength(1);
  });

  it("nomme les deux conditions qu'aucun livre comptable ne porte", () => {
    const nonVerifiables = IMMUNITES_ARTICLE_69.filter(
      (i) => i.conditionNonVerifiableParLeLogiciel,
    ).map((i) => i.point);
    expect(nonVerifiables).toEqual(['article 69, 8, b)', 'article 69, 8, c)']);
  });
});

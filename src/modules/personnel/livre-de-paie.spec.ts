import {
  ARRETE_DU_MODELE,
  DECOMPTE_A_LA_RUPTURE,
  DESTINATION_DES_DOUBLES,
  DOUBLES_DETACHABLES_MINIMUM,
  EFFECTIF_LIVRE_INSPIRE,
  EFFECTIF_LIVRE_INSPIRE_ARRETE,
  EXIGENCE_INALTERABILITE,
  FORMULES_DU_MODELE,
  MENTIONS_ARTICLE_25,
  MENTIONS_MODELE_2008,
  RESERVE_ARTICLE_104,
  RESERVE_CONTRADICTION_DE_SEUIL,
  RESERVE_MISE_EN_FORME,
  RESERVE_MODELE_NON_LU,
  RESERVE_NOTAMMENT,
  SANCTION_ARTICLE_103,
  SANCTION_ARTICLE_328,
  livreDePaie,
} from './livre-de-paie';

const TOUTES = MENTIONS_MODELE_2008.map((m) => m.rang);

describe("Les trente mentions de l'article 25, recopiées", () => {
  it('en porte exactement trente, numérotées de 1 à 30 sans trou', () => {
    expect(MENTIONS_ARTICLE_25).toHaveLength(30);
    expect(MENTIONS_ARTICLE_25.map((m) => m.rang)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
  });

  it('porte les quatre mentions que les autres modules alimentent', () => {
    const libelle = (rang: number) => MENTIONS_ARTICLE_25[rang - 1].libelle;
    expect(libelle(19)).toContain('pension');
    expect(libelle(23)).toContain('retenue fiscale');
    expect(libelle(27)).toContain('allocations familiales');
    // La mention 29 est la preuve, sur la feuille elle-même, que l'assiette
    // des cotisations n'est pas le brut · c'est la deuxième colonne.
    expect(libelle(29)).toContain('pris en considération pour le calcul des cotisations');
  });

  it("n'a aucun libellé vide ni dupliqué", () => {
    const libelles = MENTIONS_ARTICLE_25.map((m) => m.libelle);
    expect(libelles.every((l) => l.trim().length > 3)).toBe(true);
    expect(new Set(libelles).size).toBe(30);
  });
});

describe("L'arrêté du modèle · AU CORPUS depuis le 19/09/2026", () => {
  it('porte son numéro, son signataire, et ce qu\'il abroge', () => {
    // CE TEST GELAIT « lu: false ». L'arrêté est arrivé · l'issue s'inverse.
    expect(ARRETE_DU_MODELE.reference).toContain('12/CAB.MIN/ETPS/042');
    expect(ARRETE_DU_MODELE.reference).toContain('8 août 2008');
    expect(ARRETE_DU_MODELE.lu).toBe(true);
    expect(ARRETE_DU_MODELE.signataire).toBe('Marie Ange Lukiana Mufwankolo');
    expect(ARRETE_DU_MODELE.abroge).toContain('17/67');
    expect(ARRETE_DU_MODELE.viseParLeCodeDuTravail).toEqual([
      'article 103',
      'article 214',
      'article 215',
    ]);
  });

  it('ne certifie TOUJOURS PAS la conformité au modèle, et pour une autre raison', () => {
    const v = livreDePaie({
      siegeDExploitation: 'Kinshasa / Gombe',
      formeDuDocument: 'FICHIER_INFORMATISE',
      effectifHabituel: 12,
      mentionsPortees: TOUTES,
    });
    expect(v.mentionsManquantes).toHaveLength(0);
    expect(v.mentionsPorteesCount).toBe(33);
    expect(v.enonciationsCompletes).toBe(true);
    // TOUT EST VERT, ET LA CONFORMITÉ RESTE REFUSÉE · le modèle annexé est
    // une MISE EN FORME, qu'une liste de mentions ne prouve pas.
    expect(v.conformiteAuModeleCertifiee).toBe(false);
    expect(v.refus.map((r) => r.motif)).toContain('MISE_EN_FORME_NON_VERIFIABLE');
    expect(v.refus.map((r) => r.motif)).not.toContain('ENONCIATIONS_INCOMPLETES');
  });

  it("dit pourquoi la mise en forme ne se vérifie pas depuis une liste", () => {
    expect(RESERVE_MISE_EN_FORME).toMatch(/MODÈLE ANNEXÉ/);
    expect(RESERVE_MISE_EN_FORME).toMatch(/mise en forme/i);
    expect(RESERVE_MISE_EN_FORME).toMatch(/jamais certifiée/i);
  });

  it("garde la liste de l'arrêté n° 146/2018, qui est une AUTRE liste", () => {
    // Les deux coexistent · trente mentions pour la feuille de paie de la
    // sécurité sociale, trente-trois pour le livre de paie du Code.
    expect(MENTIONS_ARTICLE_25).toHaveLength(30);
    expect(MENTIONS_MODELE_2008).toHaveLength(33);
    expect(RESERVE_NOTAMMENT).toMatch(/NOTAMMENT/);
    expect(RESERVE_MODELE_NON_LU).toContain('146/2018');
  });
});

describe("Les trente-trois énonciations de l'article 1er", () => {
  it('sont numérotées de 1 à 33 sans trou et sans doublon', () => {
    expect(TOUTES).toEqual(Array.from({ length: 33 }, (_, i) => i + 1));
    expect(new Set(MENTIONS_MODELE_2008.map((m) => m.libelle)).size).toBe(33);
  });

  it('nomment le SAMEDI, que la liste de la sécurité sociale ne nomme pas', () => {
    expect(MENTIONS_MODELE_2008[10].libelle).toContain('samedi');
    expect(MENTIONS_ARTICLE_25[8].libelle).not.toContain('samedi');
  });

  it("visent l'INSTITUT NATIONAL DE SÉCURITÉ SOCIALE, nom de 2008", () => {
    expect(MENTIONS_MODELE_2008[3].libelle).toContain('Institut National de Sécurité Sociale');
  });
});

describe('Les trois formules de somme, et ce que la première démontre', () => {
  it('ferment le brut, les déductions et les jours', () => {
    expect(FORMULES_DU_MODELE.brut).toEqual({ rang: 20, composantes: [7, 10, 11, 12, 13, 16, 19] });
    expect(FORMULES_DU_MODELE.totalDesDeductions).toEqual({
      rang: 26,
      composantes: [21, 22, 23, 24, 25],
    });
    expect(FORMULES_DU_MODELE.joursDAllocationsFamiliales).toEqual({
      rang: 28,
      composantes: [6, 14, 17],
    });
  });

  it('EXCLUENT les allocations familiales du brut · le modèle corrobore l\'article 7', () => {
    // Les mentions 27 à 30 sont les allocations familiales. Aucune n'est dans
    // la formule du brut. C'est la démonstration, par l'arithmétique du
    // modèle officiel, de l'exclusion de l'article 7 litera h.
    for (const rang of [27, 28, 29, 30]) {
      expect(FORMULES_DU_MODELE.brut.composantes).not.toContain(rang);
    }
    // Et les indemnités compensatrices (22) sont en DÉDUCTION, pas au brut.
    expect(FORMULES_DU_MODELE.brut.composantes).not.toContain(22);
    expect(FORMULES_DU_MODELE.totalDesDeductions.composantes).toContain(22);
  });

  it("n'inclut aucune composante hors de la liste des trente-trois", () => {
    const toutes = new Set(TOUTES);
    for (const f of Object.values(FORMULES_DU_MODELE)) {
      for (const c of f.composantes) expect(toutes.has(c)).toBe(true);
      expect(toutes.has(f.rang)).toBe(true);
      expect(f.composantes).not.toContain(f.rang);
    }
  });
});

describe("LE FICHIER INFORMATISÉ EST UNE FORME DU LIVRE, pas un autre document", () => {
  it("N'EXIGE PLUS d'autorisation pour un fichier informatisé", () => {
    // CE TEST EXIGEAIT L'AUTORISATION DANS TOUS LES CAS, ce qui refusait à un
    // cabinet informatisé une faculté que l'article 1er de l'arrêté lui donne.
    const v = livreDePaie({
      siegeDExploitation: 'Lubumbashi',
      formeDuDocument: 'FICHIER_INFORMATISE',
      mentionsPortees: TOUTES,
    });
    expect(v.remplacementAutorise).toBe(true);
    expect(v.refus.map((r) => r.motif)).not.toContain('AUTORISATION_INSPECTEUR_ABSENTE');
  });

  it("ne l'exige pas davantage pour le livre papier", () => {
    const v = livreDePaie({
      siegeDExploitation: 'Lubumbashi',
      formeDuDocument: 'LIVRE_PAPIER',
      mentionsPortees: TOUTES,
    });
    expect(v.remplacementAutorise).toBe(true);
  });

  it("l'exige pour TOUT AUTRE DOCUMENT, et le dit avec l'article 1er", () => {
    const v = livreDePaie({
      siegeDExploitation: 'Lubumbashi',
      formeDuDocument: 'AUTRE_DOCUMENT',
      mentionsPortees: TOUTES,
    });
    expect(v.remplacementAutorise).toBe(false);
    const refus = v.refus.find((r) => r.motif === 'AUTORISATION_INSPECTEUR_ABSENTE')!;
    expect(refus.explication).toMatch(/Inspecteur du Travail/i);
    expect(refus.explication).toMatch(/OU FICHIER INFORMATISÉ/);
    // Et l'autorisation le débloque.
    expect(
      livreDePaie({
        siegeDExploitation: 'Lubumbashi',
        formeDuDocument: 'AUTRE_DOCUMENT',
        autorisationInspecteurDuTravail: true,
        mentionsPortees: TOUTES,
      }).remplacementAutorise,
    ).toBe(true);
  });

  it("NE SUPPOSE PAS le fichier informatisé quand la forme n'est pas déclarée", () => {
    // Supposer la forme la plus favorable dispenserait d'une autorisation
    // qui est due. L'absence vaut donc AUTRE_DOCUMENT.
    const v = livreDePaie({ siegeDExploitation: 'Matadi', mentionsPortees: TOUTES });
    expect(v.remplacementAutorise).toBe(false);
    expect(v.refus.map((r) => r.motif)).toContain('AUTORISATION_INSPECTEUR_ABSENTE');
  });

  it("ne prend PAS l'absence de réponse pour une autorisation", () => {
    const v = livreDePaie({
      siegeDExploitation: 'Matadi',
      formeDuDocument: 'AUTRE_DOCUMENT',
      autorisationInspecteurDuTravail: null,
    });
    expect(v.remplacementAutorise).toBe(false);
  });
});

describe("L'article 213 · un livre par siège, et une seule dispense", () => {
  it('exige la désignation du siège', () => {
    const v = livreDePaie({ autorisationInspecteurDuTravail: true });
    expect(v.refus.map((r) => r.motif)).toContain('SIEGE_DEXPLOITATION_NON_DESIGNE');
  });

  it("ne dispense QUE l'employeur de personnel exclusivement domestique", () => {
    const v = livreDePaie({ exclusivementPersonnelDomestique: true });
    expect(v.livreDu).toBe(false);
    expect(v.refus.map((r) => r.motif)).not.toContain('AUTORISATION_INSPECTEUR_ABSENTE');
    expect(v.refus.map((r) => r.motif)).not.toContain('SIEGE_DEXPLOITATION_NON_DESIGNE');
    expect(v.refus.map((r) => r.motif)).not.toContain('ENONCIATIONS_INCOMPLETES');
    // Le refus de la mise en forme, lui, ne dépend d'aucune saisie.
    expect(v.refus.map((r) => r.motif)).toContain('MISE_EN_FORME_NON_VERIFIABLE');
  });
});

describe("L'article 215, alinéa 3 · le seuil de vingt-cinq, CONTRE celui de l'arrêté", () => {
  it('retient le seuil de la LOI, pas celui de l\'arrêté', () => {
    // Un arrêté ne déroge pas à la loi · pour dix à vingt-quatre
    // travailleurs, les deux textes disent le contraire, et c'est vingt-cinq.
    expect(EFFECTIF_LIVRE_INSPIRE).toBe(25);
    expect(EFFECTIF_LIVRE_INSPIRE_ARRETE).toBe(10);
    expect(livreDePaie({ effectifHabituel: 15 }).livreInspireAdmis).toBe(true);
    expect(RESERVE_CONTRADICTION_DE_SEUIL).toMatch(/UN ARRÊTÉ NE DÉROGE PAS À LA LOI/);
    expect(RESERVE_CONTRADICTION_DE_SEUIL).toMatch(/OmegaX retient VINGT-CINQ/);
  });

  it('est un seuil STRICT · vingt-cinq travailleurs ne donne pas le régime allégé', () => {
    expect(livreDePaie({ effectifHabituel: 24 }).livreInspireAdmis).toBe(true);
    expect(livreDePaie({ effectifHabituel: 25 }).livreInspireAdmis).toBe(false);
    expect(livreDePaie({ effectifHabituel: 26 }).livreInspireAdmis).toBe(false);
  });

  it("ne l'accorde pas quand l'effectif n'est pas déclaré", () => {
    expect(livreDePaie({}).livreInspireAdmis).toBe(false);
  });
});

describe('Ce que le document ne porte pas', () => {
  it('énumère nommément les mentions manquantes, et REFUSE', () => {
    const v = livreDePaie({ mentionsPortees: [1, 2, 3] });
    expect(v.mentionsPorteesCount).toBe(3);
    expect(v.mentionsManquantes).toHaveLength(30);
    expect(v.mentionsManquantes.map((m) => m.rang)).toContain(32);
    expect(v.enonciationsCompletes).toBe(false);
    const refus = v.refus.find((r) => r.motif === 'ENONCIATIONS_INCOMPLETES')!;
    expect(refus.explication).toMatch(/liste est FERMÉE/i);
    expect(refus.explication).toMatch(/AUTANT DE FOIS/);
  });

  it('compte zéro quand rien n\'est déclaré', () => {
    expect(livreDePaie({}).mentionsManquantes).toHaveLength(33);
  });

  it("ne reproche rien à l'employeur de personnel exclusivement domestique", () => {
    const v = livreDePaie({ exclusivementPersonnelDomestique: true });
    expect(v.refus.map((r) => r.motif)).not.toContain('ENONCIATIONS_INCOMPLETES');
  });
});

describe("L'article 2 de l'arrêté · les deux doubles et le décompte à la rupture", () => {
  it('donne la destination des deux doubles de l\'article 214', () => {
    expect(DESTINATION_DES_DOUBLES.premier).toMatch(/TRAVAILLEUR/);
    expect(DESTINATION_DES_DOUBLES.premier).toMatch(/à chaque paie/i);
    expect(DESTINATION_DES_DOUBLES.second).toMatch(/INSTITUT NATIONAL DE SÉCURITÉ SOCIALE/);
  });

  it('porte le décompte dû à la RUPTURE, en plus du bulletin', () => {
    expect(DECOMPTE_A_LA_RUPTURE).toMatch(/POUR QUELQUE CAUSE QUE CE SOIT/);
    expect(DECOMPTE_A_LA_RUPTURE).toMatch(/SECONDE échéance/i);
    expect(DECOMPTE_A_LA_RUPTURE).toContain('103');
  });

  it("est rendu dans les réserves de tout verdict", () => {
    const v = livreDePaie({});
    expect(v.reserves).toContain(DECOMPTE_A_LA_RUPTURE);
    expect(v.reserves).toContain(EXIGENCE_INALTERABILITE);
    expect(v.reserves).toContain(SANCTION_ARTICLE_328);
  });
});

describe("L'article 4 · l'écriture indélébile devenue inaltérabilité", () => {
  it('vise TOUTE forme, fichier informatisé compris', () => {
    expect(EXIGENCE_INALTERABILITE).toMatch(/QUELLE QUE SOIT LA FORME ADOPTÉE/);
    expect(EXIGENCE_INALTERABILITE).toMatch(/INALTÉRABILITÉ/);
  });
});

describe("L'article 328 a) · l'amende se multiplie par les omissions", () => {
  it('le dit, et signale l\'anomalie du renvoi 323 (9)', () => {
    expect(SANCTION_ARTICLE_328).toMatch(/AUTANT DE FOIS QU'IL Y A DE TRAVAILLEURS/);
    expect(SANCTION_ARTICLE_328).toMatch(/cinquante fois/i);
    expect(SANCTION_ARTICLE_328).toMatch(/qui n'existe pas/i);
  });
});

describe("L'article 103 et sa sanction probatoire", () => {
  it('dit le renversement de la charge de la preuve, et ses trois échappatoires', () => {
    expect(SANCTION_ARTICLE_103).toMatch(/SONT REJETÉES/);
    expect(SANCTION_ARTICLE_103).toMatch(/AU MOMENT DU PAIEMENT/);
    expect(SANCTION_ARTICLE_103).toMatch(/faute du travailleur/i);
    expect(SANCTION_ARTICLE_103).toMatch(/commencement de preuve/i);
    expect(SANCTION_ARTICLE_103).toMatch(/aveu du travailleur/i);
  });

  it("dit que « pour solde de tout compte » ne clôt rien", () => {
    expect(RESERVE_ARTICLE_104).toMatch(/NE VALENT PAS renonciation/i);
    expect(RESERVE_ARTICLE_104).toContain('317');
  });
});

describe("L'article 214", () => {
  it('porte le minimum de deux doubles détachables', () => {
    expect(DOUBLES_DETACHABLES_MINIMUM).toBe(2);
  });
});

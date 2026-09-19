import {
  ARRETE_DU_MODELE,
  DOUBLES_DETACHABLES_MINIMUM,
  EFFECTIF_LIVRE_INSPIRE,
  MENTIONS_ARTICLE_25,
  RESERVE_ARTICLE_104,
  RESERVE_MODELE_NON_LU,
  RESERVE_NOTAMMENT,
  SANCTION_ARTICLE_103,
  livreDePaie,
} from './livre-de-paie';

const TOUTES = MENTIONS_ARTICLE_25.map((m) => m.rang);

describe("Les trente mentions de l'article 25, recopiées", () => {
  it('en porte exactement trente, numérotées de 1 à 30 sans trou', () => {
    expect(MENTIONS_ARTICLE_25).toHaveLength(30);
    expect(TOUTES).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
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

describe("L'arrêté du modèle · identifié, non lu", () => {
  it("porte son numéro et AVOUE qu'il n'est pas lu", () => {
    expect(ARRETE_DU_MODELE.reference).toContain('12/CAB.MIN/ETPS/042');
    expect(ARRETE_DU_MODELE.reference).toContain('8 août 2008');
    expect(ARRETE_DU_MODELE.lu).toBe(false);
    expect(ARRETE_DU_MODELE.viseParLeCodeDuTravail).toEqual([
      'article 103',
      'article 214',
      'article 215',
    ]);
  });

  it('ne certifie JAMAIS la conformité au modèle, même document parfait', () => {
    const v = livreDePaie({
      siegeDExploitation: 'Kinshasa / Gombe',
      autorisationInspecteurDuTravail: true,
      effectifHabituel: 12,
      mentionsPortees: TOUTES,
    });
    expect(v.mentionsManquantes).toHaveLength(0);
    expect(v.mentionsPorteesCount).toBe(30);
    // TOUT EST VERT, ET LA CONFORMITÉ RESTE REFUSÉE.
    expect(v.conformiteAuModeleCertifiee).toBe(false);
    expect(v.refus.map((r) => r.motif)).toContain('MODELE_NON_LU');
  });

  it('dit que la couverture ne vaut pas conformité', () => {
    expect(RESERVE_MODELE_NON_LU).toMatch(/ne vaut pas conformité/i);
    expect(RESERVE_MODELE_NON_LU).toContain('146/2018');
    expect(RESERVE_MODELE_NON_LU).toContain('12/CAB.MIN/ETPS/042');
  });

  it("rappelle que la liste de l'article 25 n'est pas fermée", () => {
    expect(RESERVE_NOTAMMENT).toMatch(/NOTAMMENT/);
    expect(RESERVE_NOTAMMENT).toMatch(/n'est pas fermée/i);
  });
});

describe("L'article 215, alinéa 2 · l'autorisation est un ACTE", () => {
  it("refuse le remplacement tant que l'Inspecteur n'a pas autorisé", () => {
    const v = livreDePaie({ siegeDExploitation: 'Lubumbashi', mentionsPortees: TOUTES });
    expect(v.remplacementAutorise).toBe(false);
    expect(v.refus.map((r) => r.motif)).toContain('AUTORISATION_INSPECTEUR_ABSENTE');
    const refus = v.refus.find((r) => r.motif === 'AUTORISATION_INSPECTEUR_ABSENTE')!;
    expect(refus.explication).toMatch(/Inspecteur du Travail/i);
    expect(refus.explication).toMatch(/le livre papier reste dû/i);
  });

  it("l'accorde quand l'autorisation est déclarée", () => {
    const v = livreDePaie({
      siegeDExploitation: 'Lubumbashi',
      autorisationInspecteurDuTravail: true,
    });
    expect(v.remplacementAutorise).toBe(true);
    expect(v.refus.map((r) => r.motif)).not.toContain('AUTORISATION_INSPECTEUR_ABSENTE');
  });

  it("ne prend PAS l'absence de réponse pour une autorisation", () => {
    const v = livreDePaie({ siegeDExploitation: 'Matadi', autorisationInspecteurDuTravail: null });
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
    // Le refus du modèle non lu, lui, ne dépend d'aucune saisie.
    expect(v.refus.map((r) => r.motif)).toContain('MODELE_NON_LU');
  });
});

describe("L'article 215, alinéa 3 · le seuil de vingt-cinq", () => {
  it('est un seuil STRICT · vingt-cinq travailleurs ne donne pas le régime allégé', () => {
    expect(EFFECTIF_LIVRE_INSPIRE).toBe(25);
    expect(livreDePaie({ effectifHabituel: 24 }).livreInspireAdmis).toBe(true);
    expect(livreDePaie({ effectifHabituel: 25 }).livreInspireAdmis).toBe(false);
    expect(livreDePaie({ effectifHabituel: 26 }).livreInspireAdmis).toBe(false);
  });

  it("ne l'accorde pas quand l'effectif n'est pas déclaré", () => {
    expect(livreDePaie({}).livreInspireAdmis).toBe(false);
  });
});

describe('Ce que le document ne porte pas', () => {
  it('énumère nommément les mentions manquantes', () => {
    const v = livreDePaie({ mentionsPortees: [1, 2, 3] });
    expect(v.mentionsPorteesCount).toBe(3);
    expect(v.mentionsManquantes).toHaveLength(27);
    expect(v.mentionsManquantes.map((m) => m.rang)).toContain(29);
  });

  it('compte zéro quand rien n\'est déclaré', () => {
    expect(livreDePaie({}).mentionsManquantes).toHaveLength(30);
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

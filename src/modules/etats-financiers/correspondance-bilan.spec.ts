import {
  COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR,
  ORDRE_AFFICHAGE_ACTIF,
  ORDRE_AFFICHAGE_PASSIF,
  POSTES_ACTIF,
  POSTES_PASSIF,
  TOTAUX_ACTIF,
  TOTAUX_PASSIF,
} from './correspondance-bilan';

/**
 * Intégrité structurelle du tableau de correspondance du bilan. Le
 * comportement (quel compte va où, BE/DI, CH, amortissements) est couvert
 * par `etats-financiers.service.spec.ts` — ces tests-ci vérifient la
 * cohérence interne du référentiel lui-même : rien de double, rien
 * d'orphelin, l'ordre d'affichage couvre exactement ce qui est défini.
 */
describe('correspondance bilan (SYCEBNL, Partie 4 ch. 2)', () => {
  it('ne comporte aucune ref en double, tous postes et totaux confondus', () => {
    const toutesLesRefs = [
      ...POSTES_ACTIF.map((p) => p.ref),
      ...POSTES_PASSIF.map((p) => p.ref),
      ...TOTAUX_ACTIF.map((t) => t.ref),
      ...TOTAUX_PASSIF.map((t) => t.ref),
      'CH', // résultat net — calculé à part (etats-financiers.service.ts), pas listé dans POSTES_PASSIF
    ];
    expect(new Set(toutesLesRefs).size).toBe(toutesLesRefs.length);
  });

  it("l'ordre d'affichage couvre exactement les postes de détail + totaux, rien de plus, rien de moins", () => {
    const refsActif = new Set([...POSTES_ACTIF.map((p) => p.ref), ...TOTAUX_ACTIF.map((t) => t.ref)]);
    expect(new Set(ORDRE_AFFICHAGE_ACTIF)).toEqual(refsActif);

    const refsPassif = new Set([...POSTES_PASSIF.map((p) => p.ref), ...TOTAUX_PASSIF.map((t) => t.ref), 'CH']);
    expect(new Set(ORDRE_AFFICHAGE_PASSIF)).toEqual(refsPassif);
  });

  it('chaque total ne référence que des refs qui existent réellement (détail ou total imbriqué)', () => {
    const refsConnues = new Set([
      ...POSTES_ACTIF.map((p) => p.ref),
      ...POSTES_PASSIF.map((p) => p.ref),
      ...TOTAUX_ACTIF.map((t) => t.ref),
      ...TOTAUX_PASSIF.map((t) => t.ref),
      'CH',
    ]);
    for (const total of [...TOTAUX_ACTIF, ...TOTAUX_PASSIF]) {
      for (const ref of total.deRefs) {
        expect(refsConnues.has(ref)).toBe(true);
      }
    }
  });

  it('un total ne référence jamais une ref qui vient APRÈS lui dans sa propre liste — sinon le calcul en une passe casserait', () => {
    // etats-financiers.service.ts résout les totaux dans l'ordre de
    // [...TOTAUX_ACTIF, ...TOTAUX_PASSIF] : une ref utilisée avant d'avoir
    // été calculée lirait `undefined` (traité comme 0, silencieusement faux).
    const dejaResolues = new Set([...POSTES_ACTIF.map((p) => p.ref), ...POSTES_PASSIF.map((p) => p.ref), 'CH']);
    for (const total of [...TOTAUX_ACTIF, ...TOTAUX_PASSIF]) {
      for (const ref of total.deRefs) {
        expect(dejaResolues.has(ref)).toBe(true);
      }
      dejaResolues.add(total.ref);
    }
  });

  it('BE (créances) et DI (dettes) portent un qualificatif de sens opposé sur les mêmes préfixes de tiers polyvalents', () => {
    const be = POSTES_ACTIF.find((p) => p.ref === 'BE')!;
    const di = POSTES_PASSIF.find((p) => p.ref === 'DI')!;
    expect(be.sens_qualificatif).toBe('DEBITEUR');
    expect(di.sens_qualificatif).toBe('CREDITEUR');
    // Anomalie n° 1 : 41 n'apparaît dans AUCUN des deux (déjà capté par BD).
    expect(be.comptes).not.toContain('41');
    expect(di.comptes).not.toContain('41');
  });

  it('CJ (provisions réglementées) retient 15, pas 16 — anomalie n° 3', () => {
    const cj = POSTES_PASSIF.find((p) => p.ref === 'CJ')!;
    expect(cj.comptes).toEqual(['15']);
  });

  it('DW couvre 56 EN ENTIER — la restriction à 564/565 perdait 561 et 566 (audit 2026-08-28)', () => {
    // Ce test verrouillait auparavant `['564', '565']`, c'est-à-dire une
    // erreur : 564 n'existe pas au plan SYCEBNL (COMPTE 56 = 561 Crédits de
    // trésorerie / 565 Escompte / 566 intérêts courus) et la restriction
    // faisait disparaître 561 et 566 du bilan. Le texte officiel dit « 56 ».
    const dw = POSTES_PASSIF.find((p) => p.ref === 'DW')!;
    expect(dw.comptes).toEqual(['56']);
    expect(COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR).toEqual(['52', '53']);
  });

  it('BW transfère ses soldes 52/53 CRÉDITEURS vers DW — sinon un découvert est compté des deux côtés', () => {
    const bw = POSTES_ACTIF.find((p) => p.ref === 'BW')!;
    expect(bw.comptesTransferesSiCrediteur).toEqual(['52', '53']);
    // 55/57 volontairement absents : une caisse créditrice doit rester
    // visible en négatif à l'actif, pas migrer au passif.
    expect(bw.comptesTransferesSiCrediteur).not.toContain('57');
  });

  // Garde structurelle portée depuis correspondance-projet-bilan.spec.ts à
  // l'audit du 2026-08-28 : c'est elle qui y avait manqué et laissé passer le
  // compte 297 affecté à deux postes (déduction en double). Vérifiée ici aussi.
  it('aucun compte BRUT n’est réclamé par DEUX postes d’actif à la fois', () => {
    const vus = new Map<string, string>();
    for (const p of POSTES_ACTIF) {
      for (const c of p.comptes) {
        expect(vus.get(c) ?? p.ref).toBe(p.ref);
        vus.set(c, p.ref);
      }
    }
  });

  it('aucun compte d’AMORTISSEMENT n’est déduit par DEUX postes d’actif à la fois', () => {
    const vus = new Map<string, string>();
    for (const p of POSTES_ACTIF) {
      for (const c of p.comptesAmortissement ?? []) {
        expect(vus.get(c) ?? p.ref).toBe(p.ref);
        vus.set(c, p.ref);
      }
    }
  });

  it('2919, 2939 ET 2949 (les trois comptes « p » du texte officiel) ne sont assignés qu’à UN SEUL poste chacun', () => {
    for (const numero of ['2919', '2939', '2949']) {
      const postes = POSTES_ACTIF.filter((p) => p.comptesAmortissement?.includes(numero));
      expect(postes).toHaveLength(1);
    }
  });

  it('2919 et 2939 (ambiguïté non résolue par le texte officiel) ne sont assignés qu’à UN SEUL poste chacun', () => {
    // Documenté en tête de correspondance-bilan.ts : le texte officiel liste
    // ces deux comptes sous deux postes à la fois sans donner de clé de
    // répartition. Les dupliquer gonflerait artificiellement l'actif net.
    const postesAvec2919 = POSTES_ACTIF.filter((p) => p.comptesAmortissement?.includes('2919'));
    const postesAvec2939 = POSTES_ACTIF.filter((p) => p.comptesAmortissement?.includes('2939'));
    expect(postesAvec2919).toHaveLength(1);
    expect(postesAvec2939).toHaveLength(1);
  });
});

import {
  DECRET_SMIG,
  DIVISEUR_ALLOCATION_FAMILIALE,
  DIVISEUR_CONTRE_VALEUR_LOGEMENT,
  LACUNES_DECLAREES,
  MULTIPLICATEURS_ARTICLE_7,
  PALIERS_DE_PAIEMENT,
  RESERVE_SMIG_HORAIRE,
  SMIG_JOURNALIER_FC,
  allocationFamilialeJournaliere,
  contreValeurLogementJournaliere,
  montantJournalierPayable,
  valeurPeriodique,
} from './bareme-smig';

describe('le décret n° 25/22 · ce que le texte fixe', () => {
  it('LE SMIG EST DE 21 500 DEPUIS LE 30 MAI 2025 · l’article 3 échelonne le PAIEMENT', () => {
    // LA LECTURE QUE CE TEST FIGE, ET C'EST LA PLUS IMPORTANTE DU FICHIER.
    // L'article 2 FIXE le SMIG à 21 500. L'article 3 dit que ce taux « EST
    // PAYÉ » à 14 500 puis à 21 500. Lire « le SMIG passe à 21 500 en janvier
    // 2026 » minore, pendant huit mois, tout ce qui se calcule SUR le SMIG :
    // le plancher d'assiette CNSS, la quotité saisissable, les allocations
    // familiales.
    expect(SMIG_JOURNALIER_FC).toBe(21_500);
    expect(DECRET_SMIG.entreEnVigueurLe).toBe('2025-05-30');
    expect(DECRET_SMIG.formuleEntreeEnVigueur).toContain('à la date de sa signature');
    // Le montant PAYABLE en juin 2025 est l'autre chiffre, et il ne se
    // confond pas avec le SMIG.
    expect(montantJournalierPayable('2025-06').montantJournalierFc).toBe(14_500);
    // L'explication rappelle les DEUX chiffres, pour qu'on ne prenne pas le
    // payable du mois pour le SMIG.
    const juin = montantJournalierPayable('2025-06').explication;
    expect(juin).toContain('14500 FC par jour');
    expect(juin).toContain("21500 FC par l'article 2");
    expect(juin).toContain('échelonne son PAIEMENT');
  });

  it('les deux paliers de l’article 3, et pas un de plus', () => {
    expect(PALIERS_DE_PAIEMENT).toHaveLength(2);
    expect(PALIERS_DE_PAIEMENT.map((p) => [p.aPartirDeLaPaieDe, p.montantJournalierFc])).toEqual([
      ['2025-05', 14_500],
      ['2026-01', 21_500],
    ]);
  });

  it('applique le palier en vigueur au MOIS DE PAIE, bornes comprises', () => {
    expect(montantJournalierPayable('2025-05').montantJournalierFc).toBe(14_500);
    expect(montantJournalierPayable('2025-12').montantJournalierFc).toBe(14_500);
    expect(montantJournalierPayable('2026-01').montantJournalierFc).toBe(21_500);
    expect(montantJournalierPayable('2030-07').montantJournalierFc).toBe(21_500);
  });

  it('NE RECONSTITUE RIEN avant mai 2025 · le décret de 2018 n’est pas au corpus', () => {
    // Le décret n° 25/22 abroge celui de 2018 (art. 11) sans en reproduire le
    // montant. Le deviner serait la faute que le dépôt s'interdit.
    const avant = montantJournalierPayable('2025-04');
    expect(avant.montantJournalierFc).toBeNull();
    expect(avant.refus).toBe('ANTERIEUR_AU_DECRET');
    expect(avant.explication).toContain('18/017');
    expect(avant.explication).toContain("n'est PAS au corpus");
  });

  it('refuse un mois mal formé plutôt que d’en deviner un', () => {
    expect(montantJournalierPayable('2025-13').refus).toBe('MOIS_MAL_FORME');
    expect(montantJournalierPayable('mai 2025').refus).toBe('MOIS_MAL_FORME');
    expect(montantJournalierPayable('2025-5').refus).toBe('MOIS_MAL_FORME');
  });
});

describe('article 7 · les trois multiplicateurs sont dans le texte', () => {
  it('6, 26 et 312 · fixes, et non tirés du calendrier', () => {
    // Aucun mois n'a 30 ni 31 jours pour ce calcul, aucune année n'en a 365.
    // Un moteur qui compterait les jours réels donnerait douze montants
    // mensuels différents là où le texte n'en veut qu'un.
    expect(MULTIPLICATEURS_ARTICLE_7).toEqual({ SEMAINE: 6, MOIS: 26, ANNEE: 312 });
    expect(valeurPeriodique(21_500, 'SEMAINE')).toBe(129_000);
    expect(valeurPeriodique(21_500, 'MOIS')).toBe(559_000);
    expect(valeurPeriodique(21_500, 'ANNEE')).toBe(6_708_000);
    // 26 × 12 = 312 · les deux multiplicateurs sont cohérents entre eux, et
    // le texte les donne tous les deux plutôt que de laisser multiplier.
    expect(MULTIPLICATEURS_ARTICLE_7.MOIS * 12).toBe(MULTIPLICATEURS_ARTICLE_7.ANNEE);
  });

  it('ILS VALENT POUR LES TROIS GRANDEURS · l’article les nomme toutes', () => {
    // « du SMIG, de l'allocation familiale minimum ET de la contre-valeur du
    // logement ». Les réserver au SMIG obligerait à inventer une conversion
    // pour les deux autres.
    const alloc = allocationFamilialeJournaliere(21_500).montantFc;
    expect(valeurPeriodique(alloc, 'MOIS')).toBeCloseTo((21_500 / 27) * 26, 6);
  });

  it('NE DONNE AUCUN TAUX HORAIRE, et le dépôt ne le divise pas', () => {
    // Le Guide SYCEBNL évalue le bénévolat « sur la base du SMIG horaire ».
    // Ce décret n'en donne pas : il donne trois MULTIPLICATEURS et aucun
    // diviseur. Passer à l'horaire suppose la durée légale du travail, qui
    // est dans un autre texte.
    expect(RESERVE_SMIG_HORAIRE).toContain('AUCUN taux horaire');
    expect(RESERVE_SMIG_HORAIRE).toContain('durée légale du travail');
    expect(Object.values(MULTIPLICATEURS_ARTICLE_7).every((m) => m > 1)).toBe(true);
  });
});

describe('articles 5 et 6 · les deux grandeurs dérivées', () => {
  it('l’allocation familiale est 1/27e du SMIG, PAR ENFANT', () => {
    expect(DIVISEUR_ALLOCATION_FAMILIALE).toBe(27);
    const un = allocationFamilialeJournaliere(21_500, 1);
    expect(un.montantFc).toBeCloseTo(796.2963, 4);
    expect(allocationFamilialeJournaliere(21_500, 3).montantFc).toBeCloseTo(3 * 796.2963, 3);
    expect(un.article).toBe('art. 5');
  });

  it('N’ARRONDIT PAS, et dit pourquoi · le décret ne prescrit aucun arrondi', () => {
    // 21 500 / 27 = 796,296… Arrondir en silence produirait, sur douze mois
    // et plusieurs enfants, un écart que personne ne saurait expliquer. Et le
    // montant de référence est celui de la COLONNE 19 de l'annexe, que le
    // dépôt n'a pas.
    const a = allocationFamilialeJournaliere(21_500);
    expect(a.exact).toBe(false);
    expect(Number.isInteger(a.montantFc)).toBe(false);
    expect(a.reserve).toContain('COLONNE 19');
    expect(a.reserve).toContain('NON ARRONDIE');
  });

  it('se tait quand la division tombe juste · la réserve n’est pas du bruit', () => {
    // Une réserve servie toujours finit par ne plus être lue.
    const a = allocationFamilialeJournaliere(27 * 100);
    expect(a.exact).toBe(true);
    expect(a.reserve).toBeNull();
  });

  it('LA CONTRE-VALEUR DU LOGEMENT SE CALCULE SUR L’ALLOCATION, PAS SUR LE SMIG', () => {
    // LE PIÈGE DU CHAÎNAGE. L'article 6 écrit « 1/5ème du taux journalier des
    // ALLOCATIONS FAMILIALES ». Le lire « 1/5e du SMIG » donne un montant
    // vingt-sept fois trop élevé, sur une grandeur qui se retient au
    // travailleur.
    expect(DIVISEUR_CONTRE_VALEUR_LOGEMENT).toBe(5);
    const alloc = allocationFamilialeJournaliere(21_500).montantFc;
    const logement = contreValeurLogementJournaliere(alloc);
    expect(logement.montantFc).toBeCloseTo(21_500 / 27 / 5, 6);
    // Et surtout : ce n'est PAS 21 500 / 5.
    expect(logement.montantFc).not.toBeCloseTo(21_500 / 5, 2);
    expect(logement.montantFc * 27).toBeCloseTo(21_500 / 5, 6);
    expect(logement.formule).toContain('ALLOCATIONS FAMILIALES');
    expect(logement.reserve).toContain('25/21');
  });
});

describe('ce que le décret dit et que le logiciel ne porte pas', () => {
  it('nomme quatre lacunes, chacune avec son article et sa conséquence', () => {
    // Une lacune TUE se lit comme une absence de règle. Chacune porte
    // l'article qui la crée et ce qu'elle empêche de chiffrer.
    expect(LACUNES_DECLAREES).toHaveLength(4);
    for (const l of LACUNES_DECLAREES) {
      expect(l.article).toMatch(/art\. \d/);
      expect(l.consequence.length).toBeGreaterThan(60);
    }
    const objets = LACUNES_DECLAREES.map((l) => l.objet).join(' | ');
    expect(objets).toContain('ANNEXE');
    expect(objets).toContain('25/21');
    expect(objets).toContain('18/017');
    expect(objets).toContain('AGRO-INDUSTRIELS');
  });

  it('LA TENSION SALARIALE EST DANS L’ANNEXE · rien au-dessus du manœuvre ne se chiffre', () => {
    // L'article 4 applique la tension salariale « du travailleur manœuvre
    // ordinaire au cadre de collaboration ». Le SMIG de 21 500 est celui du
    // MANŒUVRE ORDINAIRE, et de lui seul · en faire le minimum de toutes les
    // catégories serait le plus gros contresens possible sur ce texte.
    const annexe = LACUNES_DECLAREES.find((l) => l.objet.includes('ANNEXE'))!;
    expect(annexe.consequence).toContain('TENSION SALARIALE');
    expect(annexe.consequence).toContain('cadre de collaboration');
  });
});

import {
  ANNEXES,
  CATEGORIES,
  COLONNE_ALLOCATIONS_FAMILIALES,
  COLONNE_CONTRE_VALEUR_LOGEMENT,
  DECIMALES_ANNEXE,
  DECRET_MODALITES,
  DECRET_SMIG,
  DIVISEUR_ALLOCATION_FAMILIALE,
  DIVISEUR_CONTRE_VALEUR_LOGEMENT,
  LACUNES_DECLAREES,
  MULTIPLICATEURS_ARTICLE_7,
  RESERVE_SMIG_HORAIRE,
  SMIG_JOURNALIER_FC,
  TENSIONS,
  allocationFamilialeJournaliere,
  annexeApplicable,
  colonneDeLaClasse,
  contreValeurLogementJournaliere,
  tauxJournalierDeLaClasse,
  valeurPeriodique,
} from './bareme-smig';

describe('la transcription des annexes est CLOSE · c’est ce qui la prouve', () => {
  it('les trente-quatre taux valent tension × SMIG / 100, sans un écart', () => {
    // LA PREUVE DE LA TRANSCRIPTION, ET ELLE NE VIENT PAS DE MA LECTURE.
    // Les taux sont RECOPIÉS du tableau, pas engendrés par la formule. Le
    // test les confronte ensuite à la formule : si un chiffre avait été mal
    // lu, la grille ne boucherait plus. Elle boucle sur les 34.
    //
    // C'est ce contrôle qui a tranché deux lectures divergentes du scan :
    // la tension du deuxième échelon se lisait « 110 » ou « 116 », et seul
    // 116 × 145 donne les 16 820 FC de la colonne. 110 aurait donné 15 950.
    for (const a of ANNEXES) {
      expect(a.tauxParClasse).toHaveLength(TENSIONS.length);
      a.tauxParClasse.forEach((taux, i) => {
        expect([a.numero, i + 1, taux]).toEqual([
          a.numero,
          i + 1,
          (TENSIONS[i] * a.smigJournalierFc) / 100,
        ]);
      });
      // Le premier taux EST le SMIG du manœuvre ordinaire · base 100.
      expect(a.tauxParClasse[0]).toBe(a.smigJournalierFc);
      expect(TENSIONS[0]).toBe(100);
    }
  });

  it('les colonnes 19 et 20 valent SMIG/27 et son cinquième, au centime', () => {
    for (const a of ANNEXES) {
      const af = a.smigJournalierFc / DIVISEUR_ALLOCATION_FAMILIALE;
      expect(a.allocationFamilialeJournaliereFc).toBeCloseTo(af, DECIMALES_ANNEXE);
      expect(a.contreValeurLogementJournaliereFc).toBeCloseTo(
        af / DIVISEUR_CONTRE_VALEUR_LOGEMENT,
        DECIMALES_ANNEXE,
      );
    }
    // Les deux valeurs exactes du texte, figées telles qu'imprimées.
    expect(ANNEXES[0].allocationFamilialeJournaliereFc).toBe(537.04);
    expect(ANNEXES[0].contreValeurLogementJournaliereFc).toBe(107.41);
    expect(ANNEXES[1].allocationFamilialeJournaliereFc).toBe(796.3);
    expect(ANNEXES[1].contreValeurLogementJournaliereFc).toBe(159.26);
  });

  it('les sept catégories couvrent les dix-sept classes, sans trou ni doublon', () => {
    const classes = CATEGORIES.flatMap((c) => c.classes);
    expect(classes).toEqual([...Array(17)].map((_, i) => i + 1));
    expect(CATEGORIES).toHaveLength(7);
    // Chaque catégorie a autant d'échelons que de classes · sinon l'un des
    // deux tableaux ment sur l'autre.
    for (const c of CATEGORIES) expect([c.rang, c.echelons.length]).toEqual([c.rang, c.classes.length]);
    // Les deux bornes que l'article 4 nomme.
    expect(CATEGORIES[0].libelle).toBe('Manœuvre');
    expect(CATEGORIES[0].echelons[0]).toBe('Ordinaire');
    expect(CATEGORIES[6].libelle).toBe('Cadre de collaboration');
  });

  it('LA COLONNE 19 EST L’ALLOCATION FAMILIALE · l’article 5 fixe la numérotation', () => {
    // C'est la seule phrase du décret qui dise comment les colonnes sont
    // comptées, et elle suffit : si colonne et classe coïncidaient,
    // l'allocation serait en 18 et l'article serait faux.
    expect(COLONNE_ALLOCATIONS_FAMILIALES).toBe(19);
    expect(COLONNE_CONTRE_VALEUR_LOGEMENT).toBe(20);
    expect(colonneDeLaClasse(1)).toBe(2);
    expect(colonneDeLaClasse(17)).toBe(18);
    // Et la classe 17 s'arrête juste avant la colonne 19.
    expect(colonneDeLaClasse(TENSIONS.length) + 1).toBe(COLONNE_ALLOCATIONS_FAMILIALES);
  });
});

describe('l’article 2 fixe, l’article 3 échelonne, et L’ANNEXE TRANCHE', () => {
  it('le SMIG de l’article 2 reste 21 500 depuis le 30 mai 2025', () => {
    expect(SMIG_JOURNALIER_FC).toBe(21_500);
    expect(DECRET_SMIG.entreEnVigueurLe).toBe('2025-05-30');
    expect(DECRET_SMIG.formuleEntreeEnVigueur).toContain('à la date de sa signature');
  });

  it('MAIS LES GRANDEURS DÉRIVÉES S’ASSIENT SUR LE MONTANT PAYÉ, pas sur 21 500', () => {
    // LA QUESTION QUE LES ARTICLES 2 ET 3 LAISSAIENT OUVERTE, ET QUE
    // L'ANNEXE FERME. L'allocation familiale de mai à décembre 2025 est de
    // 537,04 FC, soit 14 500 / 27 · elle s'assied sur le montant PAYÉ. Une
    // version antérieure de ce fichier affirmait l'inverse, sur la seule
    // lecture des articles 2 et 3, avant que l'annexe ne soit disponible.
    const mai = allocationFamilialeJournaliere('2025-06').valeur!;
    expect(mai.parEnfantFc).toBe(537.04);
    expect(mai.parEnfantFc).toBeCloseTo(14_500 / 27, 2);
    expect(mai.parEnfantFc).not.toBeCloseTo(21_500 / 27, 1);

    const apres = allocationFamilialeJournaliere('2026-02').valeur!;
    expect(apres.parEnfantFc).toBe(796.3);
  });

  it('le taux du manœuvre ordinaire suit le palier, classe 1 en tête', () => {
    expect(tauxJournalierDeLaClasse(1, '2025-06').valeur!.tauxFc).toBe(14_500);
    expect(tauxJournalierDeLaClasse(1, '2025-12').valeur!.tauxFc).toBe(14_500);
    expect(tauxJournalierDeLaClasse(1, '2026-01').valeur!.tauxFc).toBe(21_500);
  });

  it('rend la classe AVEC sa catégorie, son échelon et sa colonne', () => {
    // Une catégorie porte jusqu'à quatre classes · servir « Maîtrise » sans
    // l'échelon reviendrait à en choisir une au hasard parmi quatre.
    const m = tauxJournalierDeLaClasse(12, '2026-01').valeur!;
    expect(m.categorie.libelle).toBe('Maîtrise');
    expect(m.categorie.rang).toBe('VI');
    expect(m.echelon).toBe('3');
    expect(m.tension).toBe(488);
    expect(m.tauxFc).toBe(104_920);
    expect(m.colonne).toBe(13);
  });

  it('NE MONTE PAS AU-DESSUS DU CADRE DE COLLABORATION · rien ne s’extrapole', () => {
    // « du travailleur manœuvre ordinaire au cadre de collaboration » est le
    // champ de la tension salariale, et le barème s'y arrête. Prolonger la
    // suite géométrique au-delà de 1 000 serait inventer un texte.
    const r = tauxJournalierDeLaClasse(18, '2026-01');
    expect(r.valeur).toBeNull();
    expect(r.refus).toBe('CLASSE_HORS_BAREME');
    expect(r.explication).toContain('cadre de collaboration');
    expect(tauxJournalierDeLaClasse(0, '2026-01').refus).toBe('CLASSE_HORS_BAREME');
  });

  it('NE RECONSTITUE RIEN avant mai 2025 · le décret de 2018 n’est pas au corpus', () => {
    const avant = annexeApplicable('2025-04');
    expect(avant.valeur).toBeNull();
    expect(avant.refus).toBe('ANTERIEUR_AU_DECRET');
    expect(avant.explication).toContain('18/017');
    expect(allocationFamilialeJournaliere('2025-04').valeur).toBeNull();
    expect(tauxJournalierDeLaClasse(5, '2025-04').valeur).toBeNull();
  });

  it('refuse un mois mal formé plutôt que d’en deviner un', () => {
    expect(annexeApplicable('2025-13').refus).toBe('MOIS_MAL_FORME');
    expect(annexeApplicable('mai 2025').refus).toBe('MOIS_MAL_FORME');
    expect(annexeApplicable('2025-5').refus).toBe('MOIS_MAL_FORME');
  });
});

describe('les deux grandeurs dérivées', () => {
  it('l’allocation est servie PAR ENFANT, et le total suit le nombre', () => {
    const a = allocationFamilialeJournaliere('2026-01', 5).valeur!;
    expect(a.parEnfantFc).toBe(796.3);
    expect(a.totalFc).toBeCloseTo(5 * 796.3, 6);
    expect(a.colonne).toBe(19);
  });

  it('DIT QUE LES CONDITIONS DE SUSPENSION NE SONT PAS AU CORPUS', () => {
    // L'article 13 du décret n° 25/21 renvoie à un arrêté de 2018 qui fixe
    // « le montant, les modalités de paiement ET LES CONDITIONS DE
    // SUSPENSION ». Le montant est dans la colonne 19 ; la suspension, non.
    // Servir le montant sans dire cela laisserait croire que l'allocation
    // est due en toutes circonstances.
    const e = allocationFamilialeJournaliere('2026-01').explication;
    expect(e).toContain('CONDITIONS DE SUSPENSION');
    expect(e).toContain('137/CAB/MINETAT/MTEPS/01/2018');
  });

  it('LA CONTRE-VALEUR DU LOGEMENT SE CALCULE SUR L’ALLOCATION, PAS SUR LE SMIG', () => {
    // Le piège du chaînage : 1/5 de 1/27, et non 1/5 du SMIG. L'écart est
    // d'un facteur 27, sur une grandeur qui se DÉFALQUE au travailleur.
    const c = contreValeurLogementJournaliere('2026-01').valeur!;
    expect(c.montantFc).toBe(159.26);
    expect(c.montantFc).toBeCloseTo(21_500 / 27 / 5, 2);
    expect(c.montantFc).not.toBeCloseTo(21_500 / 5, 2);
    expect(c.montantFc * 27).toBeCloseTo(21_500 / 5, 0);
  });

  it('DIT QUE C’EST UNE DÉFALCATION, et seulement pour cause de mutation', () => {
    // « quotité saisissable par l'employeur » ne veut pas dire une indemnité.
    // L'article 15 du décret n° 25/21 ne l'ouvre que si l'employeur assure
    // un logement EN NATURE pour cause de MUTATION. Hors ce cas, la retenir
    // serait une retenue sans titre, et l'article 112 du Code du travail
    // ferme la liste.
    expect(contreValeurLogementJournaliere('2026-01').explication).toContain('DÉFALCATION');
    expect(contreValeurLogementJournaliere('2026-01').explication).toContain('MUTATION');
    expect(DECRET_MODALITES.defalcationLogementEnNature).toContain('mutation');
  });
});

describe('article 7 · les trois multiplicateurs sont dans le texte', () => {
  it('6, 26 et 312 · fixes, et non tirés du calendrier', () => {
    expect(MULTIPLICATEURS_ARTICLE_7).toEqual({ SEMAINE: 6, MOIS: 26, ANNEE: 312 });
    expect(valeurPeriodique(21_500, 'MOIS')).toBe(559_000);
    expect(valeurPeriodique(14_500, 'MOIS')).toBe(377_000);
    expect(valeurPeriodique(21_500, 'ANNEE')).toBe(6_708_000);
    expect(MULTIPLICATEURS_ARTICLE_7.MOIS * 12).toBe(MULTIPLICATEURS_ARTICLE_7.ANNEE);
  });

  it('ILS VALENT POUR LES TROIS GRANDEURS · l’article les nomme toutes', () => {
    const af = allocationFamilialeJournaliere('2026-01').valeur!.parEnfantFc;
    expect(valeurPeriodique(af, 'MOIS')).toBeCloseTo(796.3 * 26, 6);
    const cv = contreValeurLogementJournaliere('2026-01').valeur!.montantFc;
    expect(valeurPeriodique(cv, 'ANNEE')).toBeCloseTo(159.26 * 312, 6);
  });

  it('NE DONNE AUCUN TAUX HORAIRE, et le dépôt ne le divise pas', () => {
    expect(RESERVE_SMIG_HORAIRE).toContain('AUCUN taux horaire');
    expect(RESERVE_SMIG_HORAIRE).toContain('durée légale du travail');
    expect(Object.values(MULTIPLICATEURS_ARTICLE_7).every((m) => m > 1)).toBe(true);
  });
});

describe('le décret compagnon n° 25/21, et ce qui manque encore', () => {
  it('porte les modalités que le n° 25/22 vise, avec ses deux seuils', () => {
    expect(DECRET_MODALITES.reference).toContain('25/21');
    expect(DECRET_MODALITES.entreEnVigueurLe).toBe('2025-05-30');
    // Art. 5 · le déclencheur d'ajustement.
    expect(DECRET_MODALITES.seuilAjustementIpcPourCent).toBe(50);
    // Art. 11 · et il se prend en janvier, chaque année.
    expect(DECRET_MODALITES.moisDAjustement).toBe('janvier');
    expect(DECRET_MODALITES.abroge).toContain('079/2002');
  });

  it('LES ANNEXES SONT POSTÉRIEURES AU DÉCRET · elles sont du 17 septembre 2025', () => {
    // Le décret est du 30 mai, ses annexes du 17 septembre, et la
    // publication du 28 octobre. Trois dates, et la grille de tension
    // n'existait pas quand le décret a été signé.
    expect(DECRET_SMIG.signeLe).toBe('2025-05-30');
    expect(DECRET_SMIG.annexesArreteesLe).toBe('2025-09-17');
    expect(DECRET_SMIG.publieAu).toContain('28 octobre 2025');
  });

  it('nomme quatre lacunes, chacune avec son article et sa conséquence', () => {
    expect(LACUNES_DECLAREES).toHaveLength(4);
    for (const l of LACUNES_DECLAREES) {
      expect(l.article).toMatch(/art\. \d/);
      expect(l.consequence.length).toBeGreaterThan(60);
    }
    const objets = LACUNES_DECLAREES.map((l) => l.objet).join(' | ');
    expect(objets).toContain('137/CAB/MINETAT');
    expect(objets).toContain('18/017');
    expect(objets).toContain('AGRO-INDUSTRIELS');
    expect(objets).toContain("AJUSTEMENT");
    // L'ANNEXE et le décret n° 25/21 ne sont PLUS des lacunes · ils sont lus.
    expect(objets).not.toContain('25/21');
  });

  it('AVERTIT QUE LES ANNEXES ONT UNE FIN · un ajustement se prend chaque janvier', () => {
    // La seconde annexe n'est pas bornée dans le texte, mais l'article 11 du
    // décret n° 25/21 programme un ajustement annuel. La servir comme
    // définitive ferait liquider 2027 sur le barème de 2026.
    expect(ANNEXES[1].auMoisDePaie).toBeNull();
    const ajustement = LACUNES_DECLAREES.find((l) => l.objet.includes('AJUSTEMENT'))!;
    expect(ajustement.consequence).toContain('JANVIER');
    expect(ajustement.consequence).toContain("qu'aucun ajustement n'est intervenu");
  });
});

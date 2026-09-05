import { PLAN_COMPTES_SYCEBNL } from './compte-seed';

/**
 * COMPTES PRINCIPAUX (2 chiffres) · trois choses doivent tenir, sans quoi
 * l'agrégation par racine (EcritureService.balance()) casse en silence.
 */
describe('comptes principaux (2 chiffres)', () => {
  const totaux = PLAN_COMPTES_SYCEBNL.filter((c) => c.numero.length === 2);
  const detail = PLAN_COMPTES_SYCEBNL.filter((c) => c.numero.length > 2);

  it('sème un en-tête de division par regroupement officiel, tous en type Total', () => {
    // Une entrée par division réellement détaillée plus bas (10 à 19, 20 à
    // 29, 31 à 39, 40 à 49, 50 à 59 hors 54, 60 à 69, 70 à 79 hors 74/76,
    // 81 à 88, 90-91) · 92 à 99 volontairement absentes (§ compte-seed.ts).
    expect(totaux).toHaveLength(76);
    expect(totaux.every((c) => c.typeCompte === 'TOTAL')).toBe(true);
  });

  it("n'entre jamais en collision avec le numéro d'un compte Détail", () => {
    const numerosDetail = new Set(detail.map((c) => c.numero));
    for (const t of totaux) {
      expect(numerosDetail.has(t.numero)).toBe(false);
    }
  });

  it('confirme la raison du non-complètement à 8 chiffres : ça collisionnerait', () => {
    // "90" complété à 8 chiffres donnerait "90000000", déjà pris par le
    // compte 900 « secours en nature ». Ce test documente le contre-exemple
    // qui a tranché le choix fait dans total() · voir son commentaire.
    const numerosDetail = new Set(detail.map((c) => c.numero));
    const auraitCollisionne = totaux.some((t) => numerosDetail.has(`${t.numero}000000`.slice(0, 8)));
    expect(auraitCollisionne).toBe(true);
  });

  it('regroupe au moins un compte Détail réel, sans quoi l’en-tête serait orphelin', () => {
    for (const t of totaux) {
      const enfants = detail.filter((d) => d.numero.startsWith(t.numero) && d.classe === t.classe);
      expect(enfants.length).toBeGreaterThan(0);
    }
  });

  it('ne regroupe jamais un compte Détail d’une autre division', () => {
    // Ex. le total "10" ne doit rien agréger de la division "11".
    const dix = totaux.find((t) => t.numero === '10')!;
    const onze = detail.filter((d) => d.numero.startsWith('11'));
    expect(onze.some((d) => d.numero.startsWith(dix.numero) && d.numero[1] !== '0')).toBe(false);
  });

  it('un compte à 2 chiffres ne peut pas naître autrement que de ce semis', () => {
    // CreerCompteDto borne le numéro à 3-13 chiffres (voir son commentaire) :
    // c'est cette propriété que PlanComptesPage utilise pour verrouiller ces
    // lignes en édition.
    expect(totaux.every((c) => !/^\d{3,13}$/.test(c.numero))).toBe(true);
  });
});

/**
 * COMPTES DIVISIONNAIRES (3 chiffres) · le palier intermédiaire entre les
 * comptes principaux et les comptes d'imputation de base. Mêmes garanties
 * que pour les principaux, adaptées : ici, un code à 3 chiffres SANS
 * subdivision est le compte d'imputation lui-même (déjà semé en 8 chiffres)
 * et ne doit PAS réapparaître comme Total, sous peine de doublon vide.
 */
describe('comptes divisionnaires (3 chiffres)', () => {
  const divisionnaires = PLAN_COMPTES_SYCEBNL.filter((c) => c.numero.length === 3);
  const detail = PLAN_COMPTES_SYCEBNL.filter((c) => c.numero.length > 3);

  it('sème un en-tête par regroupement à 3 chiffres réellement subdivisé, tous en type Total', () => {
    expect(divisionnaires).toHaveLength(121);
    expect(divisionnaires.every((c) => c.typeCompte === 'TOTAL')).toBe(true);
  });

  it("n'entre jamais en collision avec le numéro d'un compte Détail", () => {
    const numerosDetail = new Set(detail.map((c) => c.numero));
    for (const t of divisionnaires) {
      expect(numerosDetail.has(t.numero)).toBe(false);
    }
  });

  it('regroupe au moins un compte Détail réel, sans quoi l’en-tête serait orphelin', () => {
    for (const t of divisionnaires) {
      const enfants = detail.filter((d) => d.numero.startsWith(t.numero) && d.classe === t.classe);
      expect(enfants.length).toBeGreaterThan(0);
    }
  });

  it('un code à 3 chiffres sans subdivision reste un compte de détail, pas un doublon Total', () => {
    // Contre-exemple direct : "103 Droit d'entrée" n'a aucun sous-compte
    // dans le texte, il EST le compte d'imputation ("10300000"). Il ne doit
    // donc jamais apparaître aussi comme Total à 3 chiffres.
    expect(divisionnaires.some((t) => t.numero === '103')).toBe(false);
    const droitEntree = PLAN_COMPTES_SYCEBNL.find((c) => c.numero === '10300000');
    expect(droitEntree?.typeCompte).not.toBe('TOTAL');
  });

  it('les deux anomalies de numérotation (832, 842) sont volontairement omises', () => {
    // Leurs enfants annoncés (8311/8315, 8411/8412/8415) ne commencent pas
    // par leur propre préfixe (831/841 au lieu de 832/842) : un total à
    // 832/842 n'aurait rien à agréger. Voir le commentaire de compte-seed.ts.
    expect(divisionnaires.some((t) => t.numero === '832')).toBe(false);
    expect(divisionnaires.some((t) => t.numero === '842')).toBe(false);
  });

  it('un compte à 3 chiffres ne peut pas naître autrement que de ce semis', () => {
    expect(divisionnaires.every((c) => !/^\d{4,13}$/.test(c.numero))).toBe(true);
  });
});

/**
 * INTITULÉS RELUS SUR LE PLAN DES COMPTES OFFICIEL · Journal officiel OHADA,
 * numéro spécial du 22 février 2023, « Plan des comptes détaillé » (Partie 2,
 * ch. 2), pages 77 à 106.
 *
 * Ce test existe parce que le semis portait des intitulés fabriqués là où le
 * texte officiel en donne un : douze comptes de la famille 45 réduits à
 * « Fondations et assimilées (1) (2) (3) », un 4421 qui répétait l'intitulé de
 * son total, un 498 qui annonçait des créances alors qu'il porte leur
 * dépréciation. Aucune relecture ne les rattrapait : les tests ne vérifiaient
 * que des comptages et des rattachements, jamais le libellé lui-même.
 *
 * Chaque couple ci-dessous a été relu sur la page officielle. La convention du
 * semis (« intitulé du parent · intitulé de l'enfant ») est conservée ; c'est
 * la seconde moitié qui doit dire ce que dit le texte.
 */
describe('intitulés relus sur le plan des comptes officiel', () => {
  const parNumero = new Map(PLAN_COMPTES_SYCEBNL.map((c) => [c.numero, c.intitule]));

  const RELUS: ReadonlyArray<readonly [string, string]> = [
    // 45 · le texte distingue apporteurs en nature, en numéraire et comptes
    // courants ; les suffixes « (1) (2) (3) » effaçaient cette distinction.
    ['45210000', 'Fondations et assimilées · apporteurs en nature'],
    ['45220000', 'Fondations et assimilées · apporteurs en numéraire'],
    ['45250000', 'Fondations et assimilées · fondateurs, dirigeants, comptes courants'],
    ['45310000', 'Ordres professionnels · apporteurs en nature'],
    ['45320000', 'Ordres professionnels · apporteurs en numéraire'],
    ['45350000', 'Ordres professionnels · membres, dirigeants, comptes courants'],
    ['45410000', 'Organisations politiques · apporteurs en nature'],
    ['45420000', 'Organisations politiques · apporteurs en numéraire'],
    ['45450000', 'Organisations politiques · adhérents, dirigeants, comptes courants'],
    ['45510000', 'Organisations syndicales · apporteurs en nature'],
    ['45520000', 'Organisations syndicales · apporteurs en numéraire'],
    ['45550000', 'Organisations syndicales · adhérents, dirigeants, comptes courants'],
    // 471 · le texte sépare débiteurs (4711) et créditeurs (4712).
    ['47110000', 'Débiteurs divers'],
    ['47120000', 'Créditeurs divers'],
    // 4421 est l'impôt d'État, par opposition à 4422 (collectivités publiques).
    ['44210000', "État, impôts et taxes d'État"],
    // 4133 · « autres valeurs impayées » ; les chèques et effets impayés sont
    // en 4131 et 4132.
    ['41330000', 'Adhérents, clients-usagers · autres valeurs impayées'],
    ['66900000', 'Dégrèvements et annulations des charges sociales'],
    ['60310000', "Variations des stocks de biens et services liés à l'activité"],
    // 249x · troncatures : « outillage », « de bureau », « actifs biologiques »
    // et « et identifiable » avaient disparu.
    ['24910000', 'Matériel et outillage industriel et commercial en cours'],
    ['24920000', 'Matériel et outillage agricole en cours'],
    ['24930000', "Matériel d'emballage récupérable et identifiable en cours"],
    ['24940000', 'Matériel et mobilier de bureau en cours'],
    ['24980000', 'Autres matériels et actifs biologiques en cours'],
    ['29470000', 'Dépréciations du matériel · agencements et aménagements du matériel et des actifs biologiques'],
    [
      '79500000',
      "Reprises des dépréciations d'immobilisations reçues destinées à la vente provenant des dons et legs et d'usufruit temporaire",
    ],
  ];

  it.each(RELUS)('%s porte l’intitulé du texte officiel', (numero, intitule) => {
    expect(parNumero.get(numero)).toBe(intitule);
  });

  it('498 porte la dépréciation, pas la créance', () => {
    // 498 est dans la famille 49 (dépréciations) · l'annoncer comme
    // « Créances H.A.O. » le faisait lire comme un actif au bilan.
    expect(parNumero.get('498')).toBe('Dépréciations des comptes de créances H.A.O.');
  });

  /**
   * SUBDIVISIONS QUE LE CHAPITRE 3 N'ÉNONÇAIT PAS · le semis avait été bâti
   * sur le seul chapitre 3, qui abrège (« 4791 à 4798, symétrique du 478 »).
   * Le plan des comptes officiel, lui, les nomme une par une.
   */
  describe('subdivisions rendues par le plan des comptes', () => {
    it('479 est développé en symétrie du 478', () => {
      const passif = PLAN_COMPTES_SYCEBNL.filter((c) => c.numero.startsWith('479') && c.numero.length === 8);
      expect(passif.map((c) => c.numero)).toEqual([
        '47911000',
        '47918000',
        '47920000',
        '47931000',
        '47938000',
        '47940000',
        '47970000',
        '47980000',
      ]);
      // Le générique « Écarts de conversion · passif » ne doit plus subsister.
      expect(parNumero.has('47900000')).toBe(false);
    });

    it('501 et 506 sont développés au lieu de rester des comptes uniques', () => {
      expect(parNumero.get('50110000')).toBe('Titres du Trésor à court terme');
      expect(parNumero.get('50120000')).toBe("Titres d'organismes financiers");
      expect(parNumero.get('50130000')).toBe('Bons de caisse à court terme');
      expect(parNumero.get('50610000')).toBe('Intérêts courus · titres du Trésor et bons de caisse à court terme');
      expect(parNumero.get('50620000')).toBe('Intérêts courus · actions');
      expect(parNumero.get('50630000')).toBe('Intérêts courus · obligations');
      expect(parNumero.has('50100000')).toBe(false);
      expect(parNumero.has('50600000')).toBe(false);
    });
  });
});

import {
  ENONCIATIONS_ARTICLE_212,
  JOURS_CONFIRMATION_APTITUDE,
  JOURS_DECLARATION_ARTICLE_217,
  JOURS_PAR_MOIS_ESSAI,
  aptitudeProvisoirePerimee,
  declarationsDues,
  joursEntre,
  mentionsManquantes,
  requalifications,
  verdictEssai,
  type ContratPourControle,
  type EmployeurPourControle,
  type SalariePourControle,
} from './regles-contrat-travail';

const EMPLOYEUR: EmployeurPourControle = {
  nom: 'ASBL Bomoko',
  numeroAffiliationCnssEmployeur: 'CNSS-EMP-4471',
};

const SALARIE: SalariePourControle = {
  nom: 'Mukendi',
  postNom: 'Tshibangu',
  prenoms: 'Jean',
  sexe: 'MASCULIN',
  numeroAffiliationCnss: 'CNSS-0099',
  dateNaissance: '1990-04-12',
  millesimeNaissance: null,
  lieuNaissance: 'Mbuji-Mayi',
  nationalite: 'Congolaise',
  nomConjoint: null,
  aptitudeConstateeLe: '2026-01-02',
  enfantsSansDateNaissance: 0,
};

const CONTRAT: ContratPourControle = {
  type: 'DUREE_INDETERMINEE',
  constateParEcrit: true,
  dateEntreeEnVigueur: '2026-01-05',
  dateConclusion: '2026-01-02',
  lieuConclusion: 'Kinshasa',
  dateFinPrevue: null,
  ouvrageDetermine: null,
  motifRemplacement: null,
  emploiPermanent: true,
  natureTravail: 'Comptable',
  lieuExecution: 'Kinshasa, Gombe',
  remunerationBase: 1_200_000,
  avantagesConvenus: 'Transport',
  dureePreavisJours: 14,
  separeDeSaFamille: false,
  manoeuvreSansSpecialite: false,
  clauseEssai: false,
  essaiConstateParEcrit: false,
  essaiDureeJours: null,
};

describe('article 212 · les quinze énonciations, et pas une de plus', () => {
  it('en porte exactement quinze, numérotées de 1 à 15 sans trou ni doublon', () => {
    // LE TEXTE EN PORTE QUINZE. Ce test tombe si quelqu'un en ajoute une de
    // mémoire, ou en retire une jugée « pas utile ». C'est la liste du
    // législateur, pas celle du logiciel.
    expect(ENONCIATIONS_ARTICLE_212).toHaveLength(15);
    expect(ENONCIATIONS_ARTICLE_212.map((e) => e.numero)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(new Set(ENONCIATIONS_ARTICLE_212.map((e) => e.point)).size).toBe(15);
    // Chaque énonciation nomme l'écran où la renseigner · un manque muet
    // renvoie l'utilisateur chercher.
    for (const e of ENONCIATIONS_ARTICLE_212) expect(e.ou.trim().length).toBeGreaterThan(0);
  });

  it('un dossier complet ne manque de rien', () => {
    expect(mentionsManquantes(EMPLOYEUR, SALARIE, CONTRAT)).toEqual([]);
  });

  it('LE POINT 2 EST DU CÔTÉ DE L’EMPLOYEUR · une fiche parfaite ne suffit pas', () => {
    // Le piège du module : on soigne la fiche du salarié et on croit le
    // contrat complet. Le point 2 est le numéro CNSS de L'EMPLOYEUR, et il
    // manque à TOUS les contrats du dossier tant qu'il n'est pas saisi.
    const manques = mentionsManquantes(
      { ...EMPLOYEUR, numeroAffiliationCnssEmployeur: null },
      SALARIE,
      CONTRAT,
    );
    expect(manques.map((m) => m.numero)).toEqual([2]);
    expect(manques[0].ou).toContain('Paramètres du dossier');
  });

  it('LE MILLÉSIME SUFFIT · le point 5 prévoit lui-même la date inconnue', () => {
    // « la date de naissance du travailleur OU À DÉFAUT, le millésime de
    // l'année présumée ». Exiger la date pleine serait plus sévère que la loi.
    const sansDate = { ...SALARIE, dateNaissance: null, millesimeNaissance: 1990 };
    expect(mentionsManquantes(EMPLOYEUR, sansDate, CONTRAT)).toEqual([]);
    const sansRien = { ...SALARIE, dateNaissance: null, millesimeNaissance: null };
    expect(mentionsManquantes(EMPLOYEUR, sansRien, CONTRAT).map((m) => m.numero)).toEqual([5]);
  });

  it('UN CÉLIBATAIRE SANS ENFANT SATISFAIT LE POINT 7', () => {
    // Le point 7 énumère ce qu'il faut mentionner SI cela existe. Le lire
    // comme une exigence de conjoint ferait échouer tout contrat de
    // célibataire, et le contrôle deviendrait du bruit qu'on apprend à ignorer.
    expect(mentionsManquantes(EMPLOYEUR, { ...SALARIE, nomConjoint: null }, CONTRAT)).toEqual([]);
  });

  it('un enfant déclaré SANS date de naissance manque au point 7, et le motif le chiffre', () => {
    const manques = mentionsManquantes(
      EMPLOYEUR,
      { ...SALARIE, enfantsSansDateNaissance: 2 },
      CONTRAT,
    );
    expect(manques.map((m) => m.numero)).toEqual([7]);
    expect(manques[0].motif).toContain('2 enfant(s)');
    expect(manques[0].motif).not.toContain('[object Object]');
  });

  it('UN CDI A UNE DURÉE · le point 11 ne lui réclame pas de date de fin', () => {
    // Réclamer un terme à un contrat à durée indéterminée reviendrait à lui
    // demander de cesser d'en être un.
    expect(mentionsManquantes(EMPLOYEUR, SALARIE, { ...CONTRAT, dateFinPrevue: null })).toEqual([]);
    // Un CDD, lui, doit porter l'une des trois formes de l'article 40.
    const cdd: ContratPourControle = {
      ...CONTRAT,
      type: 'DUREE_DETERMINEE',
      emploiPermanent: false,
    };
    expect(mentionsManquantes(EMPLOYEUR, SALARIE, cdd).map((m) => m.numero)).toEqual([11]);
    expect(
      mentionsManquantes(EMPLOYEUR, SALARIE, { ...cdd, ouvrageDetermine: 'Réfection du toit' }),
    ).toEqual([]);
  });

  it('rend les manques DANS L’ORDRE DU TEXTE · c’est l’ordre de lecture d’un inspecteur', () => {
    const vide: ContratPourControle = {
      ...CONTRAT,
      natureTravail: null,
      lieuExecution: null,
      remunerationBase: null,
      dureePreavisJours: null,
      lieuConclusion: null,
    };
    expect(mentionsManquantes(EMPLOYEUR, SALARIE, vide).map((m) => m.numero)).toEqual([
      8, 9, 10, 12, 14,
    ]);
  });

  it('le message de manque cite le texte du point, jamais un code', () => {
    const m = mentionsManquantes(EMPLOYEUR, SALARIE, { ...CONTRAT, natureTravail: null })[0];
    expect(m.motif).toContain('la nature et les modalités du travail à fournir');
    expect(m.motif).toContain("l'article 212");
  });
});

describe('les requalifications de plein droit (art. 40 à 45)', () => {
  const rien = { nombreCdd: 1, nombreRenouvellements: 0 };
  const cdd: ContratPourControle = {
    ...CONTRAT,
    type: 'DUREE_DETERMINEE',
    emploiPermanent: false,
    dateFinPrevue: '2026-12-31',
  };

  it('un CDI régulier ne requalifie rien', () => {
    expect(requalifications(CONTRAT, rien)).toEqual([]);
  });

  it('SANS ÉCRIT · présumé à durée indéterminée (art. 44), et la présomption est dite réfragable', () => {
    const r = requalifications({ ...cdd, constateParEcrit: false }, rien);
    expect(r.map((x) => x.motif)).toContain('PAS_D_ECRIT');
    const sans = r.find((x) => x.motif === 'PAS_D_ECRIT')!;
    expect(sans.formule).toContain("jusqu'à preuve du contraire");
    expect(sans.explication).toContain('preuve contraire');
  });

  it('L’ENGAGEMENT AU JOUR LE JOUR ÉCHAPPE À L’ÉCRIT · l’alinéa 3 l’excepte', () => {
    // Le piège : traiter les quatre types de la même façon ferait réclamer un
    // écrit que la loi n'exige pas, sur la forme d'emploi la plus courante.
    const r = requalifications(
      { ...CONTRAT, type: 'JOUR_LE_JOUR', constateParEcrit: false },
      rien,
    );
    expect(r).toEqual([]);
  });

  it('L’APPRENTISSAGE RELÈVE DU TITRE III · les art. 41 et 42 ne le visent pas', () => {
    const r = requalifications(
      { ...CONTRAT, type: 'APPRENTISSAGE', constateParEcrit: false, emploiPermanent: true },
      { nombreCdd: 5, nombreRenouvellements: 9 },
    );
    expect(r).toEqual([]);
  });

  it('EMPLOI PERMANENT en CDD · réputé conclu pour une durée indéterminée (art. 42)', () => {
    const r = requalifications({ ...cdd, emploiPermanent: true }, rien);
    expect(r.map((x) => x.motif)).toContain('EMPLOI_PERMANENT');
    expect(r.find((x) => x.motif === 'EMPLOI_PERMANENT')!.article).toBe('art. 42');
  });

  it('un CDD sans aucune des trois formes de l’art. 40 est réputé à durée indéterminée (art. 45)', () => {
    const r = requalifications({ ...cdd, dateFinPrevue: null }, rien);
    expect(r.map((x) => x.motif)).toEqual(['CDD_SANS_MENTION_DE_SON_TERME']);
  });

  it('DEUX ANS · le plafond se compte de DATE À DATE, et le contrat ENJAMBE UN 29 FÉVRIER', () => {
    // LE JEU D'ESSAI SE CHERCHE. Un CDD du 5 janvier 2026 au 5 janvier 2028
    // ne prouve RIEN : il ne contient aucun 29 février, il dure 730 jours, et
    // un plafond codé « 730 jours » rend exactement le même verdict qu'un
    // plafond de date à date. Le défaut resterait invisible.
    //
    // Du 5 janvier 2027 au 5 janvier 2029, le contrat enjambe le 29 février
    // 2028 : il dure 731 jours et pourtant exactement DEUX ANS. C'est le seul
    // cas où les deux lectures divergent, et c'est celui qu'il faut poser.
    const deuxAnsBissextiles = {
      ...cdd,
      dateEntreeEnVigueur: '2027-01-05',
      dateFinPrevue: '2029-01-05',
    };
    expect(joursEntre(new Date('2027-01-05'), new Date('2029-01-05'))).toBe(731);
    expect(requalifications(deuxAnsBissextiles, rien)).toEqual([]);

    // Un jour de plus, et le texte mord.
    const trop = requalifications({ ...deuxAnsBissextiles, dateFinPrevue: '2029-01-06' }, rien);
    expect(trop.map((x) => x.motif)).toEqual(['CDD_TROP_LONG']);
    expect(trop[0].formule).toContain('ne peut excéder deux ans');
  });

  it('UN AN · même épreuve, et le motif distingue le travailleur séparé de sa famille', () => {
    // Du 1er juin 2027 au 1er juin 2028 : 366 jours, et exactement un an.
    const unAnBissextile = {
      ...cdd,
      separeDeSaFamille: true,
      dateEntreeEnVigueur: '2027-06-01',
      dateFinPrevue: '2028-06-01',
    };
    expect(joursEntre(new Date('2027-06-01'), new Date('2028-06-01'))).toBe(366);
    expect(requalifications(unAnBissextile, rien)).toEqual([]);

    const r = requalifications({ ...unAnBissextile, dateFinPrevue: '2028-06-02' }, rien);
    expect(r.map((x) => x.motif)).toEqual(['CDD_TROP_LONG_SEPARE_DE_SA_FAMILLE']);
    expect(r[0].formule).toContain('ne peut excéder un an');
  });

  it('LA SÉPARATION NE SE DÉDUIT PAS DU CONJOINT · un marié peut vivre avec sa famille', () => {
    // Même durée, drapeau à faux : rien à requalifier. Déduire la séparation
    // d'un nom de conjoint ferait ramener à un an des CDD parfaitement licites.
    expect(
      requalifications(
        { ...cdd, separeDeSaFamille: false, dateEntreeEnVigueur: '2026-01-05', dateFinPrevue: '2027-06-30' },
        rien,
      ),
    ).toEqual([]);
  });

  it('LE TROISIÈME CDD est de plein droit un CDI (art. 41), le deuxième non', () => {
    expect(requalifications(cdd, { nombreCdd: 2, nombreRenouvellements: 0 })).toEqual([]);
    const r = requalifications(cdd, { nombreCdd: 3, nombreRenouvellements: 0 });
    expect(r.map((x) => x.motif)).toEqual(['TROISIEME_CDD']);
    expect(r[0].explication).toContain('3e contrat');
  });

  it('LE SECOND RENOUVELLEMENT aussi · et l’exception saisonnière n’est jamais déduite', () => {
    expect(requalifications(cdd, { nombreCdd: 1, nombreRenouvellements: 1 })).toEqual([]);
    const r = requalifications(cdd, { nombreCdd: 1, nombreRenouvellements: 2 });
    expect(r.map((x) => x.motif)).toEqual(['SECOND_RENOUVELLEMENT']);
    expect(r[0].explication).toContain("n'est pas déduite");
  });

  it('cumule les motifs sans en perdre · un contrat peut violer plusieurs articles', () => {
    const r = requalifications(
      { ...cdd, constateParEcrit: false, emploiPermanent: true, dateFinPrevue: null },
      { nombreCdd: 4, nombreRenouvellements: 3 },
    );
    expect(r.map((x) => x.motif).sort()).toEqual(
      [
        'CDD_SANS_MENTION_DE_SON_TERME',
        'EMPLOI_PERMANENT',
        'PAS_D_ECRIT',
        'SECOND_RENOUVELLEMENT',
        'TROISIEME_CDD',
      ].sort(),
    );
  });

  it('chaque requalification porte son article ET la formule du texte', () => {
    // Une requalification sans sa formule se lit comme un conseil. C'est la
    // formule (« de plein droit », « est réputé ») qui en fait un effet légal.
    const r = requalifications(
      { ...cdd, constateParEcrit: false, emploiPermanent: true, dateFinPrevue: null },
      { nombreCdd: 4, nombreRenouvellements: 3 },
    );
    for (const x of r) {
      expect(x.article).toMatch(/^art\. \d+/);
      expect(x.formule.length).toBeGreaterThan(40);
    }
  });
});

describe('la clause d’essai (art. 43)', () => {
  it('sans clause · rien à dire, et aucune durée opposable', () => {
    const v = verdictEssai(CONTRAT);
    expect(v.dureeOpposableJours).toBeNull();
    expect(v.reduiteDePleinDroit).toBe(false);
    expect(v.reserve).toBeNull();
  });

  it('RÉDUITE DE PLEIN DROIT à six mois pour un travailleur qualifié', () => {
    const v = verdictEssai({ ...CONTRAT, clauseEssai: true, essaiConstateParEcrit: true, essaiDureeJours: 365 });
    expect(v.plafondJours).toBe(6 * JOURS_PAR_MOIS_ESSAI);
    expect(v.dureeOpposableJours).toBe(180);
    expect(v.reduiteDePleinDroit).toBe(true);
  });

  it('UN MOIS pour le manœuvre sans spécialité · le plafond change avec la qualité', () => {
    const v = verdictEssai({
      ...CONTRAT,
      manoeuvreSansSpecialite: true,
      clauseEssai: true,
      essaiConstateParEcrit: true,
      essaiDureeJours: 90,
    });
    expect(v.plafondJours).toBe(30);
    expect(v.dureeOpposableJours).toBe(30);
    expect(v.reduiteDePleinDroit).toBe(true);
  });

  it('une durée sous le plafond n’est pas touchée', () => {
    const v = verdictEssai({ ...CONTRAT, clauseEssai: true, essaiConstateParEcrit: true, essaiDureeJours: 60 });
    expect(v.dureeOpposableJours).toBe(60);
    expect(v.reduiteDePleinDroit).toBe(false);
  });

  it('SIGNALE L’ÉCRIT MANQUANT · l’alinéa 1er l’exige séparément de la durée', () => {
    const v = verdictEssai({ ...CONTRAT, clauseEssai: true, essaiConstateParEcrit: false, essaiDureeJours: 30 });
    expect(v.ecritManquant).toBe(true);
    // La durée reste correcte : les deux conditions sont distinctes, et
    // confondre l'écrit avec le plafond ferait taire l'un des deux manques.
    expect(v.reduiteDePleinDroit).toBe(false);
  });

  it('AVOUE SA CONVERSION · le texte plafonne en MOIS, le logiciel compte en jours', () => {
    // Un dossier dont l'essai tombe à un jour du plafond doit savoir que
    // c'est la convention du logiciel qui tranche, et non le texte.
    const v = verdictEssai({ ...CONTRAT, clauseEssai: true, essaiConstateParEcrit: true, essaiDureeJours: 181 });
    expect(v.reserve).toContain('MOIS');
    expect(v.reserve).toContain('convention du logiciel');
    // Les deux alinéas que le logiciel ne peut PAS appliquer sont dits.
    expect(v.reserve).toContain('alinéa 4');
    expect(v.reserve).toContain("délais d'engagement et de route");
  });
});

describe('les déclarations de l’article 217 · quinze jours, deux fois', () => {
  const base = {
    dateEntreeEnVigueur: '2026-01-05',
    declarationEngagementLe: null,
    dateFin: null,
    declarationDepartLe: null,
  };

  it('l’engagement ouvre une déclaration à quinze jours, aux DEUX destinataires', () => {
    const d = declarationsDues(base, new Date('2026-01-10'));
    expect(d).toHaveLength(1);
    expect(d[0].objet).toBe('ENGAGEMENT');
    expect(d[0].echeance.toISOString().slice(0, 10)).toBe('2026-01-20');
    expect(JOURS_DECLARATION_ARTICLE_217).toBe(15);
    // Le texte en vise DEUX, et n'en servir qu'un ferait manquer la moitié de
    // l'obligation.
    expect(d[0].destinataires).toContain('ministère');
    expect(d[0].destinataires).toContain("Office national de l'emploi");
  });

  it('signale le retard tant que la déclaration n’est pas faite', () => {
    expect(declarationsDues(base, new Date('2026-01-25'))[0].enRetard).toBe(true);
    expect(
      declarationsDues({ ...base, declarationEngagementLe: '2026-02-01' }, new Date('2026-03-01'))[0]
        .enRetard,
    ).toBe(false);
  });

  it('LE DÉPART EN OUVRE UNE SECONDE · « pour quelque cause que ce soit »', () => {
    const d = declarationsDues({ ...base, dateFin: '2026-08-31' }, new Date('2026-09-30'));
    expect(d.map((x) => x.objet)).toEqual(['ENGAGEMENT', 'DEPART']);
    expect(d[1].echeance.toISOString().slice(0, 10)).toBe('2026-09-15');
    expect(d[1].enRetard).toBe(true);
  });

  it('un contrat en cours n’a PAS de déclaration de départ · on ne la réclame pas d’avance', () => {
    expect(declarationsDues(base, new Date('2026-06-01')).map((x) => x.objet)).toEqual([
      'ENGAGEMENT',
    ]);
  });
});

describe('l’aptitude provisoire de l’article 38', () => {
  it('trois mois pour confirmer, et pas un de plus', () => {
    expect(JOURS_CONFIRMATION_APTITUDE).toBe(90);
    const contrat = { dateEntreeEnVigueur: '2026-01-05' };
    expect(aptitudeProvisoirePerimee({ aptitudeProvisoire: true }, contrat, new Date('2026-03-01'))).toBe(
      false,
    );
    expect(aptitudeProvisoirePerimee({ aptitudeProvisoire: true }, contrat, new Date('2026-06-01'))).toBe(
      true,
    );
  });

  it('une aptitude DÉFINITIVE ne se périme jamais', () => {
    expect(
      aptitudeProvisoirePerimee(
        { aptitudeProvisoire: false },
        { dateEntreeEnVigueur: '2020-01-05' },
        new Date('2026-06-01'),
      ),
    ).toBe(false);
  });

  it('sans date d’entrée en vigueur, le délai ne court pas · on ne l’invente pas', () => {
    expect(
      aptitudeProvisoirePerimee(
        { aptitudeProvisoire: true },
        { dateEntreeEnVigueur: null },
        new Date('2026-06-01'),
      ),
    ).toBe(false);
  });
});

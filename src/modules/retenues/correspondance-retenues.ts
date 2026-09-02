/**
 * REGISTRE DES RETENUES À LA SOURCE ET ÉCHÉANCIER FISCAL.
 *
 * ## Pourquoi cet état existe
 *
 * Une ASBL congolaise régulièrement constituée est exemptée d'impôt sur les
 * sociétés (loi n° 23/053, art. 5 point 5 ; arrêté ministériel
 * n° 007/CAB/MIN/FINANCES/2025 du 19 février 2025). Elle n'est dispensée
 * d'AUCUN impôt qu'elle retient pour le compte d'autrui, ni d'aucune
 * cotisation sociale. C'est là qu'une association se met en défaut, et
 * précisément parce qu'elle croit que « ne rien payer » vaut « ne rien
 * devoir ». Voir `docs/fiscalite-asbl-rdc.md`, section 6.
 *
 * Cet état ne calcule aucun impôt. Il recense ce que la comptabilité porte
 * DÉJÀ sur les comptes de retenue et de cotisation, en regard de l'échéance
 * légale de reversement. La distinction est essentielle : un logiciel
 * comptable qui liquiderait de l'impôt sur un barème qu'il ne contrôle pas
 * rendrait un mauvais service (même note, section 9.2).
 *
 * ## Ce qui est figé, ce qui ne l'est pas
 *
 * Aucun taux n'est inscrit ici. Les ÉCHÉANCES le sont, avec leur base légale
 * citée et la date à laquelle elles ont été vérifiées, parce qu'elles
 * changent aussi : l'article 57 bis de la loi de procédures fiscales a été
 * modifié par la loi de finances n° 25/060 du 29 décembre 2025, qui a déplacé
 * les acomptes provisionnels du 1er août au 25 juillet. Elles sont donc
 * présentées comme des repères datés et sourcés, pas comme une vérité du
 * logiciel.
 */

export interface NatureRetenue {
  cle: string;
  libelle: string;
  /** Comptes du plan SYCEBNL qui portent cette retenue ou cotisation. */
  comptes: string[];
  exclusions?: string[];
  /** Qui en est le bénéficiaire · commande le regroupement à l'écran. */
  beneficiaire: 'ETAT' | 'ORGANISME_SOCIAL';
  /**
   * Nombre de JOURS après la fin du mois de la retenue où le reversement est
   * dû. Quinze pour la plupart ; DIX pour la retenue locative (loi de
   * procédures fiscales, art. 57).
   *
   * Le champ s'appelait `jourEcheance` et désignait un jour du mois suivant.
   * C'était la même chose pour 15, mais faux pour « dans les dix jours » : le
   * registre affichait « 10 jours » et calculait le 15. Un délai en jours est
   * la formulation des textes, et se prête aux deux cas sans ambiguïté.
   */
  joursApresPeriode: number;
  /** Formulation exacte de l'échéance, telle que le texte la pose. */
  echeance: string;
  baseLegale: string;
  /** Précision à afficher quand elle change la lecture de la ligne. */
  reserve?: string;
}

/**
 * OBLIGATION PUREMENT DÉCLARATIVE · elle ne porte aucun montant sur un compte,
 * et c'est précisément pour cela qu'elle échappait au logiciel : le registre
 * ne connaissait que ce que la comptabilité crédite.
 *
 * Or la loi de finances n° 25/060 du 29 décembre 2025 a créé ou refondu trois
 * obligations qui visent directement une association : le relevé TRIMESTRIEL
 * des sommes versées à des tiers (art. 47 de la loi de procédures fiscales,
 * qui nomme les ASBL et les établissements d'utilité publique), la déclaration
 * ANNUELLE sur les revenus salariaux (art. 22 ter) et la liste ANNUELLE des
 * fournisseurs (art. 47 ter). Aucune ne se déduit d'un solde de compte ; toutes
 * sont sanctionnées.
 */
export interface ObligationDeclarative {
  cle: string;
  libelle: string;
  periodicite: 'MENSUELLE' | 'TRIMESTRIELLE' | 'ANNUELLE';
  /** Mensuelle ou trimestrielle : jours après la fin de la période. */
  joursApresPeriode?: number;
  /** Annuelle : mois (1-12) et jour de l'échéance, dans l'année qui suit. */
  moisEcheance?: number;
  jourEcheance?: number;
  echeance: string;
  baseLegale: string;
  /** Ce qu'il faut produire · une échéance sans contenu ne sert à rien. */
  contenu: string;
  /** Sanction chiffrée quand le texte en donne une. */
  sanction?: string;
  /** D'où le logiciel peut tirer la matière de la déclaration. */
  sourceDonnees?: string;
}

/**
 * Date de dernière confrontation de ces échéances aux textes encodés
 * (skill `fiscalite-rdc-socle`, `parametres-2026.md`). Affichée à l'écran :
 * une échéance sans date de vérification n'engage personne.
 */
export const DERNIERE_VERIFICATION = '2026-08-29';

export const NATURES_RETENUES: NatureRetenue[] = [
  {
    cle: 'irppSalaires',
    libelle: 'IRPP retenu sur les revenus salariaux',
    // 447 « Etat, impôts retenus à la source », subdivisions 4471 Impôt
    // général sur le revenu et 4472 Impôts sur salaires (Partie 2, ch. 3,
    // COMPTE 44).
    comptes: ['4471', '4472'],
    beneficiaire: 'ETAT',
    joursApresPeriode: 15,
    echeance: 'Le 15 du mois suivant le versement des rémunérations',
    baseLegale:
      "Article 18 de la loi n° 004/2003 portant réforme des procédures fiscales, tel que modifié par la loi n° 23/052 du 30 novembre 2023.",
    reserve:
      "Depuis le 1er janvier 2026, c'est l'IRPP et non plus l'IPR : la loi n° 23/053 a abrogé l'impôt professionnel sur les rémunérations. Une part importante de la documentation congolaise en ligne, pages de la DGI comprises, décrit encore le régime abrogé.",
  },
  {
    cle: 'contributions',
    libelle: 'Contribution nationale et contribution nationale de solidarité',
    comptes: ['4473', '4474'],
    beneficiaire: 'ETAT',
    joursApresPeriode: 15,
    echeance: 'Le 15 du mois suivant',
    baseLegale: 'Article 18 de la loi de procédures fiscales (retenues à la source).',
  },
  {
    cle: 'retenueLocative',
    libelle: 'Retenue sur les revenus locatifs (20 %)',
    comptes: ['44781'],
    beneficiaire: 'ETAT',
    // DIX jours, et non quinze · c'est le seul prélèvement du registre à ne
    // pas suivre l'échéance commune, et le registre le datait pourtant au 15.
    joursApresPeriode: 10,
    echeance: 'Dans les dix jours du mois suivant le paiement du loyer',
    baseLegale:
      "Article 57 de la loi n° 004/2003 portant réforme des procédures fiscales. Le taux de la retenue est de 20 % du loyer brut (article 11 du régime de retenue, décret-loi n° 109/2000) ; c'est un ACOMPTE, imputable sur l'impôt sur les revenus locatifs de 22 % dû par le bailleur (article 11 de l'ordonnance-loi n° 69/009). Les deux taux ne se confondent pas.",
  },
  {
    cle: 'prestatairesNonResidents',
    libelle: 'Prélèvement sur les sommes payées aux prestataires non-résidents (14 %)',
    comptes: ['44782'],
    beneficiaire: 'ETAT',
    joursApresPeriode: 15,
    echeance: 'Le 15 du mois suivant',
    baseLegale:
      'Article 144 de la loi n° 23/053 ; article 22 bis de la loi de procédures fiscales. Prélèvement de 14 % du montant brut des factures.',
  },
  {
    cle: 'prelevementExpatries',
    libelle: 'Prélèvement exceptionnel sur le personnel expatrié (25 %)',
    comptes: ['44783'],
    beneficiaire: 'ETAT',
    joursApresPeriode: 15,
    echeance: 'Dans les quinze jours suivant le mois du versement',
    baseLegale:
      'Articles 145 à 149 de la loi n° 23/053 ; article 19 de la loi de procédures fiscales. Prélèvement de 25 % du brut.',
    reserve:
      "L'article 145 ne vise que « les entreprises individuelles ou sociétaires », et une ASBL n'est ni l'une ni l'autre : l'assujettissement d'une association à ce prélèvement est une tension du texte, à faire trancher par un conseil et non par ce logiciel. À noter aussi que l'article 147 étend au prélèvement les immunités des articles 64 et 69, et que l'article 50, 2° le rend non déductible.",
  },
  {
    cle: 'capitauxMobiliers',
    libelle: 'Retenue sur les revenus de capitaux mobiliers (20 %)',
    comptes: ['44784'],
    beneficiaire: 'ETAT',
    joursApresPeriode: 15,
    echeance: 'Le 15 du mois suivant',
    baseLegale:
      "Article 120 de la loi n° 23/053 ; article 18 bis de la loi de procédures fiscales ; arrêté ministériel n° 008/CAB/MIN/FINANCES/2025 du 19 février 2025.",
    reserve:
      "Cas réel pour une association qui place sa trésorerie à terme ou qui sert des intérêts sur un emprunt reçu d'un membre.",
  },
  {
    cle: 'plusValues',
    libelle: 'Retenue sur les plus-values (20 %)',
    comptes: ['44785'],
    beneficiaire: 'ETAT',
    joursApresPeriode: 15,
    echeance: 'Dans les quinze jours suivant le mois de réalisation',
    baseLegale: 'Article 120 de la loi n° 23/053 ; article 18 ter de la loi de procédures fiscales.',
  },
  {
    cle: 'autresRetenues',
    libelle: 'Autres impôts et contributions retenus à la source',
    // Le 4478 non subdivisé · filet pour un dossier qui n'a pas ouvert les
    // sous-comptes ci-dessus. Les exclusions évitent qu'une ligne portée sur
    // 44781 soit comptée deux fois, ici et dans sa nature propre.
    comptes: ['4478'],
    exclusions: ['44781', '44782', '44783', '44784', '44785'],
    beneficiaire: 'ETAT',
    joursApresPeriode: 15,
    echeance: 'Le 15 du mois suivant (échéance commune, à défaut de ventilation)',
    baseLegale: 'Loi de procédures fiscales, articles 18 bis, 18 ter, 19, 22 bis et 57 selon la nature du prélèvement.',
    reserve:
      "Ce compte regroupe des prélèvements dont les échéances diffèrent (dix jours pour la retenue locative, quinze pour les autres) : tant qu'ils y sont mêlés, le registre les date tous au 15, ce qui est FAUX pour la retenue locative. Ventilez-les sur les sous-comptes 44781 à 44785 pour que chaque échéance soit juste.",
  },
  {
    cle: 'tva',
    libelle: 'TVA due',
    // 444 « Etat, T.V.A. due ou crédit de T.V.A. ». Le registre de TVA
    // proprement dit vit dans le module TVA ; il figure ici parce que
    // l'échéancier doit être complet.
    //
    // 4449 EXCLU · le SYCEBNL ne subdivise pas son 444, mais le plan
    // SYSCOHADA en tire « 4441 État, TVA due » et « 4449 État, crédit de TVA
    // à reporter ». Or ce registre compte les DÉBITS comme des reversements :
    // le 4449 est un compte de CRÉANCE sur l'État, ses débits n'ont jamais
    // été versés à personne, et les inclure minorait la TVA due du montant du
    // crédit reporté · une dette fiscale annoncée plus faible qu'elle n'est.
    //
    // L'exclusion plutôt qu'un `['4441']` par référentiel, à dessein : elle
    // est INERTE en SYCEBNL, dont le plan n'a pas de 4449, et elle couvre
    // encore un dossier SYSCOHADA qui n'aurait pas ouvert son 4441 · ce que
    // `['4441']` seul aurait perdu. Une seule forme pour les deux.
    comptes: ['444'],
    exclusions: ['4449'],
    beneficiaire: 'ETAT',
    joursApresPeriode: 15,
    echeance: 'Le 15 du mois suivant',
    baseLegale: "Ordonnance-loi n° 10/001 du 20 août 2010 instituant la TVA et son décret d'application n° 011/42.",
    reserve:
      "Le régime dépend du référentiel du dossier. Une ASBL dont les opérations sont conformes à son objet est exonérée de TVA (art. 15.2 et 17.8), et l'exonération d'impôt sur les sociétés ne l'emporte pas : les deux régimes s'apprécient séparément, l'arrêté n° 007/2025 le dit lui-même. Une entreprise, elle, est assujettie de plein droit dès qu'elle franchit le seuil de l'art. 14 · cette réserve ne la concerne pas.",
  },
  {
    cle: 'cnss',
    libelle: 'Cotisations de sécurité sociale (CNSS)',
    // 431 « Sécurité sociale » et 432 « Caisses de retraite ».
    comptes: ['431', '432'],
    beneficiaire: 'ORGANISME_SOCIAL',
    joursApresPeriode: 15,
    echeance: 'Dans les quinze jours suivant le mois civil, déclaration due même sans travailleur',
    baseLegale:
      "Loi n° 16/009 du 15 juillet 2016 (régime général de sécurité sociale) ; décret n° 18/041 du 24 novembre 2018 fixant les taux : prestations aux familles 6,5 % (employeur), pensions 10 % (5 % employeur, 5 % travailleur), risques professionnels 1,5 % (employeur, doublable en cas de non-conformité). Échéances : arrêté ministériel n° 146/2018, article 21 (déclaration) et article 31 (versement), « dans les quinze jours suivant le mois civil » ; article 26 : la déclaration est due même en l'absence de travailleur ; régularisation possible dans les cinq jours.",
    reserve:
      "L'assiette n'est pas l'assiette fiscale : c'est la rémunération au sens de l'article 7, litera h du Code du travail, qui exclut les soins de santé, le logement ou son indemnité, les allocations familiales légales, le transport et les frais de voyage ; un plancher au SMIG s'applique (loi, art. 13 al. 3 ; décret, art. 8). Déclaration mensuelle unique impôts et cotisations au guichet unique (arrêté interministériel du 12 mai 2015) ; télédéclaration obligatoire au-delà de vingt-cinq travailleurs (arrêté n° 146/2018, art. 24).",
  },
  {
    cle: 'inpp',
    libelle: 'Cotisation à la formation professionnelle (INPP)',
    comptes: ['4334'],
    beneficiaire: 'ORGANISME_SOCIAL',
    joursApresPeriode: 15,
    echeance: 'Mensuelle, au plus tard le 15 du mois suivant',
    baseLegale:
      "Arrêté interministériel n° 002/CAB/MET/2025 et suivants, en vigueur depuis le 24 septembre 2025 : 4 % pour le secteur public, 3,5 % de 1 à 50 travailleurs, 3 % de 51 à 300, 2 % au-delà de 300.",
    reserve:
      "Le taux dépend de la TRANCHE D'EFFECTIF : renseignez l'effectif permanent dans Structure > Paramètres du dossier pour que le registre puisse rappeler le taux applicable au vôtre.",
  },
  {
    cle: 'onem',
    libelle: "Cotisation à l'Office national de l'emploi (ONEM)",
    comptes: ['4335'],
    beneficiaire: 'ORGANISME_SOCIAL',
    joursApresPeriode: 15,
    echeance: 'Mensuelle, au plus tard le 15 du mois suivant',
    baseLegale:
      "Arrêté ministériel n° 028/CAB/MIN.ET/FMM/RK/09/2025 du 24 septembre 2025, art. 1er : 0,5 % de la rémunération mensuelle payée aux travailleurs, pour tout employeur public, parapublic ou privé, le secteur humanitaire compris (sous réserve des exonérations légales). Déclaration au plus tard le 10 du mois suivant le paiement de la rémunération (art. 2) ; paiement au plus tard le 15 (art. 3).",
    reserve:
      "DATE D'EFFET · les 0,5 % ne valent qu'à partir du 25 septembre 2025, date de signature de l'arrêté (art. 10). Avant cette date, le taux est de 0,2 % (arrêté ministériel n° 095/CAB/MINETAT/MTEPS/01/2018 du 17 août 2018) · un exercice à cheval sur septembre 2025 porte donc les deux taux. Les arriérés antérieurs non acquittés se recalculent en revanche au nouveau taux (art. 6). SANCTIONS · 50 % de la contribution due en cas de défaut de déclaration ou de déclaration fausse, inexacte ou incomplète (art. 2) ; majoration de retard de 0,5 % PAR JOUR, tout mois commencé compté entier (art. 3). Le logiciel ne LIQUIDE rien : il recense ce que votre comptabilité porte sur le compte 4335.",
  },
  {
    cle: 'autresOrganismesSociaux',
    libelle: 'Autres organismes sociaux',
    comptes: ['433', '438'],
    exclusions: ['4334', '4335'],
    beneficiaire: 'ORGANISME_SOCIAL',
    joursApresPeriode: 15,
    echeance: 'Selon les règles propres à chaque organisme',
    baseLegale: 'Mutuelles, assurances retraite et organismes de santé · conventions propres à chaque organisme.',
  },
];

/**
 * LES OBLIGATIONS DÉCLARATIVES · celles qui ne portent aucun montant sur un
 * compte, et que le registre ne pouvait donc pas voir.
 *
 * Les trois premières viennent de la loi de finances n° 25/060 du 29 décembre
 * 2025. Elles ne sont ni annexes ni théoriques : l'article 47 nomme
 * expressément « les associations sans but lucratif et les établissements
 * d'utilité publique », et l'amende de l'article 94 est chiffrée. Le logiciel
 * les ignorait toutes les trois.
 */
export const OBLIGATIONS_DECLARATIVES: ObligationDeclarative[] = [
  {
    // La DÉCLARATION ONEM (le 10) est distincte du PAIEMENT (le 15, porté par
    // la nature `onem` ci-dessus). Deux dates, deux sanctions : 50 % de la
    // contribution pour la déclaration manquante ou inexacte, 0,5 % par jour
    // pour le versement en retard. Les confondre en une seule échéance
    // laisserait croire qu'être à jour du paiement suffit.
    cle: 'declarationMensuelleOnem',
    libelle: "Déclaration mensuelle de la contribution patronale ONEM",
    periodicite: 'MENSUELLE',
    joursApresPeriode: 10,
    echeance: 'Au plus tard le 10 du mois suivant le paiement de la rémunération',
    baseLegale:
      "Article 2 de l'arrêté ministériel n° 028/CAB/MIN.ET/FMM/RK/09/2025 du 24 septembre 2025.",
    contenu:
      "Déclaration de la rémunération mensuelle payée aux travailleurs et de la contribution de 0,5 % qui en découle. Elle figure comme ligne dédiée de la Déclaration mensuelle unique du guichet unique (DGI, ONEM, INPP, CNSS), aux côtés de l'IPR, de l'INPP et de la CNSS.",
    sanction:
      "50 % du montant de la contribution due en cas de défaut de déclaration ou de déclaration fausse, inexacte ou incomplète (art. 2). Le versement tardif, lui, subit une majoration de 0,5 % par jour, tout mois commencé compté entier (art. 3).",
    sourceDonnees: 'Comptes 66 (charges de personnel) pour l’assiette, et 4335 pour la contribution due.',
  },
  {
    cle: 'releveTrimestrielTiers',
    libelle: 'Relevé des sommes versées à des tiers (hors salaires)',
    periodicite: 'TRIMESTRIELLE',
    joursApresPeriode: 10,
    echeance: 'Dans les dix jours suivant la fin de chaque trimestre',
    baseLegale:
      "Article 47 de la loi n° 004/2003 portant réforme des procédures fiscales, qui vise nommément les associations sans but lucratif et les établissements d'utilité publique.",
    contenu:
      'Relevé des sommes de toute nature versées à des tiers en dehors des rémunérations salariales : honoraires, commissions, courtages, ristournes, vacations, droits d’auteur, loyers.',
    sanction: "Amende de 500 000 francs congolais pour une personne morale (article 94 de la loi de procédures fiscales).",
    sourceDonnees:
      'Comptes de tiers 40 (fournisseurs) et 47 (débiteurs et créditeurs divers), et charges des comptes 62-63 (services extérieurs) et 65.',
  },
  {
    cle: 'declarationAnnuelleSalaires',
    libelle: 'Déclaration annuelle sur les revenus salariaux',
    periodicite: 'ANNUELLE',
    moisEcheance: 3,
    jourEcheance: 31,
    echeance: "Au plus tard le 31 mars de l'année suivante",
    baseLegale:
      'Article 22 ter de la loi de procédures fiscales, créé par la loi de finances n° 25/060 du 29 décembre 2025.',
    contenu:
      "Déclaration récapitulative des revenus salariaux versés, accompagnée des fiches individuelles de chaque bénéficiaire, classées par province et par ordre alphabétique.",
    sourceDonnees: 'Comptes 66 (charges de personnel), 4471 et 4472 (impôts retenus à la source).',
  },
  {
    cle: 'listeFournisseurs',
    libelle: 'Liste annuelle des fournisseurs',
    periodicite: 'ANNUELLE',
    moisEcheance: 3,
    jourEcheance: 31,
    echeance: "Au plus tard le 31 mars de l'année suivante",
    baseLegale:
      'Article 47 ter de la loi de procédures fiscales, créé par la loi de finances n° 25/060 du 29 décembre 2025.',
    contenu:
      "Liste des fournisseurs avec, pour chacun : identité, adresse, boîte postale, Numéro Impôt, montant hors taxes, TVA et montant toutes taxes comprises payé.",
    sourceDonnees:
      "Comptes 401 (fournisseurs) et 445 (TVA récupérable). Le Numéro Impôt de chaque fournisseur se renseigne sur sa fiche, dans le plan des tiers.",
  },
  {
    cle: 'procesVerbalAssemblee',
    libelle: "Procès-verbal de l'assemblée générale approuvant les états financiers",
    periodicite: 'ANNUELLE',
    // Le texte compte dix jours à partir de la TENUE de l'assemblée, date que
    // le logiciel ne connaît pas. Le repère du 30 juin (échéance de dépôt au
    // CPCC) est le plus tardif raisonnable · l'assemblée se tient forcément
    // avant, puisqu'elle arrête les comptes qui y sont déposés.
    moisEcheance: 7,
    jourEcheance: 10,
    echeance: "Dans les dix jours de la tenue de l'assemblée générale",
    baseLegale: 'Article 13 bis de la loi de procédures fiscales, créé par la loi de finances n° 25/060.',
    contenu: "Procès-verbal de l'assemblée générale ayant approuvé les états financiers certifiés.",
    sanction: undefined,
    sourceDonnees:
      "Date calculée à partir de l'échéance de dépôt au CPCC, faute de date d'assemblée renseignée : c'est un repère, à corriger sur la date réelle de votre assemblée.",
  },
];

/**
 * Rappel affiché en tête de l'état · ce n'est pas un ornement, c'est ce qui
 * distingue cet écran d'un calculateur d'impôt.
 */
export const AVERTISSEMENT_REGISTRE =
  "Cet état ne calcule aucun impôt et n'applique aucun barème. Il recense ce que votre comptabilité porte déjà sur " +
  "les comptes de retenue et de cotisation, en regard de l'échéance légale de reversement. Les montants viennent de " +
  'vos écritures ; les échéances viennent des textes cités, à la date de vérification indiquée.';

export const AVERTISSEMENT_EXONERATION =
  "L'exemption d'impôt sur les sociétés dont bénéficie une ASBL régulièrement constituée (loi n° 23/053, art. 5 " +
  "point 5) ne dispense d'aucun impôt retenu pour le compte d'autrui, ni d'aucune cotisation sociale. Elle ne " +
  'dispense pas non plus de DÉCLARER aux échéances prévues, même lorsque rien n\'est dû.';

/**
 * L'argument qui fait comprendre l'enjeu à un trésorier plus vite que tout le
 * reste de l'écran : la retenue qu'on a omis d'opérer, on la doit soi-même.
 */
export const AVERTISSEMENT_REDEVABLE =
  "Le redevable qui n'a pas opéré une retenue, ou qui l'a opérée pour un montant insuffisant, en est PERSONNELLEMENT " +
  'redevable (article 96 bis de la loi de procédures fiscales, créé par la loi de finances n° 25/060 du 29 décembre ' +
  "2025). Une retenue oubliée ne disparaît pas avec le paiement : elle devient une dette de l'entité elle-même.";

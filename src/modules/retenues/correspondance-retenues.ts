import { Referentiel } from '@prisma/client';

/**
 * REGISTRE DES RETENUES À LA SOURCE ET ÉCHÉANCIER FISCAL.
 *
 * ## Pourquoi cet état existe
 *
 * Une ASBL congolaise régulièrement constituée est exemptée d'impôt sur les
 * sociétés (loi n° 23/053, art. 5 ; arrêté ministériel
 * n° 007/CAB/MIN/FINANCES/2025 du 19 février 2025). Elle n'est dispensée
 * d'AUCUN impôt qu'elle retient pour le compte d'autrui, ni d'aucune
 * cotisation sociale. C'est là qu'une association se met en défaut, et
 * précisément parce qu'elle croit que « ne rien payer » vaut « ne rien
 * devoir ». Voir `docs/fiscalite-asbl-rdc.md`, section 6.
 *
 * CETTE EXEMPTION NE VISE QUE LE DOSSIER SYCEBNL, et l'écran l'annonçait à
 * tout le monde. L'article 5 exempte l'État, les provinces, les ETD, les
 * établissements publics, les coopératives agricoles de forme civile, les
 * ASBL, les établissements d'utilité publique et les ONG, et certains
 * établissements privés d'enseignement · pas une société commerciale, qui est
 * au contraire redevable de l'IS par sa forme même (art. 3). Une entreprise
 * lisait donc, en tête de son registre, qu'elle bénéficiait d'une exemption
 * qui n'existe pas. Les textes servis dépendent désormais du référentiel du
 * dossier · voir `avertissementRegimeImpot` et les champs `reserveSyscohada`.
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
  /**
   * Code de l'imprimé de la Direction générale des impôts, quand il est connu.
   *
   * Ce n'est pas décoratif : le comptable qui va déposer demande le formulaire
   * par son code au guichet, et l'imprimé porte les cases dans un ordre que le
   * logiciel n'a pas à deviner. Ne le renseigner QUE d'après un imprimé
   * réellement lu · un code inventé enverrait chercher un papier qui n'existe
   * pas.
   */
  imprime?: string;
  /**
   * Variante de `reserve` pour un dossier SYSCOHADA · absente = `reserve` est
   * servie aux deux. Plusieurs réserves étaient rédigées POUR une association
   * et affichées à une entreprise, dont l'une exactement à l'envers : celle du
   * prélèvement sur expatriés laissait entendre à une société que son
   * assujettissement était douteux, alors qu'elle est la cible même du texte.
   */
  reserveSyscohada?: string;
  /**
   * CONDITION DE DÉDUCTIBILITÉ DE L'ARTICLE 20 · ce que le registre sait déjà
   * et qu'il ne disait à personne.
   *
   * Renseigné quand les sommes qui donnent lieu à cette retenue sont une
   * CHARGE de l'entité. La loi n° 23/053, art. 20, dernier alinéa, range
   * parmi les conditions GÉNÉRALES de déductibilité des charges que « la
   * société apporte la preuve de la déclaration et du paiement de la retenue
   * correspondante pour les sommes donnant lieu à un prélèvement ou à une
   * retenue à la source ». Une retenue collectée et non reversée est donc une
   * preuve qui manque, et la charge qu'elle accompagnait devient contestable.
   *
   * Le champ NOMME la charge visée, parce que le registre, lui, ne la connaît
   * pas : le compte de retenue porte la RETENUE, jamais son assiette, et
   * remonter de l'une à l'autre supposerait un taux que ce module s'interdit
   * d'inscrire. Il avertit ; il ne réintègre rien et ne chiffre aucun
   * redressement.
   *
   * Laissé vide là où le lien n'est PAS établi, et le silence est alors
   * voulu : la retenue sur plus-values ne suit aucune charge, la TVA n'est
   * pas une charge, et une cotisation sociale n'est pas un « prélèvement ou
   * une retenue à la source » au sens de ce texte fiscal.
   */
  chargeSousConditionArticle20?: string;
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
  /**
   * Référentiels concernés · absent = les deux. L'article 47, alinéa 1er ne
   * vise que des entités publiques et non lucratives : une société
   * commerciale privée n'y est PAS tenue, et l'échéancier lui servait
   * pourtant l'obligation et son amende.
   */
  referentiels?: Referentiel[];
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
    // Imprimé lu à la source · « DECLARATION DE LA RETENUE DE L'IMPOT SUR LE
    // REVENU DES PERSONNES PHYSIQUES DANS LA CATEGORIE DE REVENUS SALARIAUX ET
    // REVENUS ASSIMILES (IRPPDR1) », Ministère des Finances. La déclaration est
    // rattachée au MOIS des rémunérations, ce que le registre fait déjà.
    imprime: 'IRPPDR1',
    baseLegale:
      "Article 18 de la loi n° 004/2003 portant réforme des procédures fiscales, tel que modifié par la loi n° 23/052 du 30 novembre 2023.",
    chargeSousConditionArticle20:
      "Les traitements, salaires et autres rémunérations sur lesquels l'IRPP est retenu (comptes 66). L'article 21 y ajoute d'ailleurs sa propre condition : ces rémunérations ne sont déductibles que si elles ont été imposées à l'IRPP.",
    reserve:
      "Depuis le 1er janvier 2026, c'est l'IRPP et non plus l'IPR : la loi n° 23/053 a abrogé l'impôt professionnel sur les rémunérations. Une part importante de la documentation congolaise en ligne, pages de la DGI comprises, décrit encore le régime abrogé.",
  },
  {
    // PAS de `chargeSousConditionArticle20` ici, à dessein : le registre ne
    // sait pas quelle charge ces deux contributions accompagnent, et les
    // rattacher aux rémunérations par ressemblance ferait porter à l'écran
    // une affirmation de droit que rien ne fonde. Le silence vaut mieux.
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
    chargeSousConditionArticle20:
      "Les loyers versés au bailleur, sur lesquels la retenue de 20 % est opérée (comptes 622 et 6221 · locations et charges locatives).",
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
    chargeSousConditionArticle20:
      "Les sommes payées aux prestataires non-résidents · honoraires, études, services et redevances portés en charges de l'exercice.",
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
    // La charge visée est la RÉMUNÉRATION, pas le prélèvement · celui-ci
    // n'est de toute façon jamais déductible (art. 50, 2°), et le module le
    // rappelle déjà en réserve. Les deux règles ne se recouvrent pas.
    chargeSousConditionArticle20:
      "Les rémunérations brutes du personnel expatrié sur lesquelles le prélèvement de 25 % est assis (art. 146). Le prélèvement lui-même n'est pas déductible (art. 50, 2°) : c'est la rémunération qui l'est, et elle relève de la condition de l'article 20.",
    reserve:
      "L'article 145 ne vise que « les entreprises individuelles ou sociétaires », et une ASBL n'est ni l'une ni l'autre : l'assujettissement d'une association à ce prélèvement est une tension du texte, à faire trancher par un conseil et non par ce logiciel. À noter aussi que l'article 147 étend au prélèvement les immunités des articles 64 et 69, et que l'article 50, 2° le rend non déductible.",
    // LA MÊME TENSION, LUE À L'ENVERS. Pour une société, l'article 145 n'a
    // rien d'incertain : « les entreprises individuelles ou sociétaires », ce
    // sont elles. Servir la réserve d'une ASBL à une entreprise lui suggérait
    // de faire trancher un point qui ne se discute pas.
    reserveSyscohada:
      "Prélèvement dû par toute entreprise individuelle ou sociétaire située en RDC employant du personnel expatrié (art. 145), assis sur le montant brut des rémunérations de l'article 68 (art. 146), les exemptions et immunités des articles 64 et 69 s'y appliquant (art. 147). Il est dû lorsque les revenus sont payés ou mis à la disposition de leurs bénéficiaires (art. 149), non lorsque la charge est engagée. Il reste à charge de l'entreprise et n'est pas déductible du bénéfice imposable (art. 50, 2°). Le taux réduit du secteur minier, le plancher au SMIG du pays d'origine et l'assimilation des ressortissants des pays limitrophes sont MORTS avec l'ordonnance-loi n° 69/007, abrogée par l'article 152 : les pages en ligne qui les mentionnent encore décrivent un régime abrogé.",
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
    chargeSousConditionArticle20:
      "Les INTÉRÊTS servis (emprunts, comptes courants d'associés) sur lesquels la retenue est opérée · eux seuls sont une charge, et les articles 39 à 41 leur posent en outre leurs propres limites. Un dividende distribué n'est pas une charge : la condition de l'article 20 ne le concerne pas, mais la retenue lui reste due.",
    reserve:
      "Cas réel pour une association qui place sa trésorerie à terme ou qui sert des intérêts sur un emprunt reçu d'un membre.",
    reserveSyscohada:
      "Cas réel pour une entreprise qui place sa trésorerie à terme, qui distribue des dividendes ou qui sert des intérêts à ses associés.",
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
    chargeSousConditionArticle20:
      "Selon ce que le compte porte réellement · loyers, honoraires de non-résidents et rémunérations sont des charges soumises à la condition de l'article 20, la retenue sur plus-values ne suit aucune charge. Ventilez le 4478 sur ses sous-comptes 44781 à 44785 pour que le signalement désigne la bonne charge.",
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
      "Une ASBL dont les opérations sont conformes à son objet est exonérée de TVA (art. 15.2 et 17.8), et l'exonération d'impôt sur les sociétés ne l'emporte pas : les deux régimes s'apprécient séparément, l'arrêté n° 007/2025 le dit lui-même.",
    reserveSyscohada:
      "L'entreprise est assujettie de plein droit dès qu'elle franchit le seuil de chiffre d'affaires de l'article 14, et le reste tant qu'elle n'en est pas sortie dans les formes. Le solde affiché ici est la TVA DUE seule : le crédit de TVA à reporter (compte 4449) en est exclu, parce que c'est une créance sur l'État et non une dette, et l'y mêler ferait paraître la dette fiscale plus faible qu'elle n'est.",
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
 * ELLES NE VIENNENT PAS TOUTES DU MÊME TEXTE, et l'en-tête l'affirmait à
 * tort. L'article 47 a été modifié par la loi de finances n° 24/011 du
 * 20 décembre 2024, article 40 ; seul l'article 47 ter est de la loi de
 * finances n° 25/060 du 29 décembre 2025, article 30.
 *
 * Et surtout, elles ne visent pas toutes les mêmes redevables :
 *
 *  · art. 47, alinéa 1er · les provinces, les ETD, les services publics, les
 *    établissements publics, les organismes semi-publics, les entreprises
 *    publiques, les ASBL et les établissements d'utilité publique. Une
 *    société commerciale privée n'y est PAS tenue, et le logiciel lui servait
 *    l'obligation avec son amende ;
 *  · art. 47, alinéa 2 · « les entreprises et les associations qui procèdent
 *    au versement des droits d'auteurs ou d'inventeurs », pour les sommes
 *    versées à leurs membres ou mandants · celui-là vise bien les deux ;
 *  · art. 47 ter · « toute personne physique ou morale, soumise à l'impôt sur
 *    les sociétés et à l'impôt sur le revenu des personnes physiques,
 *    exonérée ou non » · les deux également, et sans exception.
 */
/**
 * ACOMPTES PROVISIONNELS · les trois échéances viennent de l'article 57 bis
 * de la loi de procédures fiscales TEL QUE MODIFIÉ par la loi de finances
 * n° 25/060 du 29 décembre 2025.
 *
 * La rédaction de 2023 disait « avant le 1er août, avant le 1er octobre et
 * avant le 1er décembre » : elle est périmée, et c'est elle qu'un praticien
 * risque de citer de mémoire. Le numéro d'article de la loi de finances qui
 * opère la modification n'est PAS repris ici · la source consultée porte une
 * réserve expresse sur sa numérotation, et un numéro faux serait pire qu'une
 * référence par l'intitulé.
 */
const BASE_ACOMPTES =
  "Article 57 bis de la loi de procédures fiscales n° 004/2003, tel que modifié par la loi de finances " +
  'n° 25/060 du 29 décembre 2025 pour l’exercice 2026.';

const SOURCE_ACOMPTES =
  "Impôt déclaré au titre de l'exercice PRÉCÉDENT, augmenté des suppléments établis par l'Administration, ou " +
  "impôt reconstitué d'office à défaut de déclaration · que ces sommes soient contestées ou non. Il ne se lit " +
  "donc dans aucun solde de compte de l'exercice en cours.";

const CONTENU_ACOMPTE = (quotite: string) =>
  `Versement de ${quotite} de l'impôt de référence, au moyen du bordereau de versement d'acomptes ` +
  "provisionnels dont le modèle est défini par l'Administration des Impôts.";

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
      "Article 47, alinéa 1er, de la loi n° 004/2003 portant réforme des procédures fiscales, tel que modifié par la loi de finances n° 24/011 du 20 décembre 2024, article 40. Il vise nommément les associations sans but lucratif et les établissements d'utilité publique.",
    contenu:
      'Relevé, sur support papier ET numérique, des sommes de toute nature versées à des tiers en dehors des rémunérations salariales : honoraires, commissions, courtages, ristournes, vacations, droits d’auteur, loyers. Le modèle du relevé est fixé par l’Administration des Impôts.',
    sanction: "Amende de 500 000 francs congolais pour une personne morale (article 94 de la loi de procédures fiscales).",
    sourceDonnees:
      'Comptes de tiers 40 (fournisseurs) et 47 (débiteurs et créditeurs divers), et charges des comptes 62-63 (services extérieurs) et 65.',
    // L'alinéa 1er énumère limitativement des entités publiques et non
    // lucratives. Une société commerciale privée n'y figure pas · c'est
    // l'alinéa 2 qui peut l'atteindre, et seulement pour les droits d'auteurs
    // ou d'inventeurs. Un dossier SYSCOHADA qui serait entreprise publique ou
    // semi-publique y reste tenu, mais le logiciel ne connaît pas ce
    // caractère : il ne l'invente pas, il sert l'obligation qu'il peut
    // fonder.
    referentiels: [Referentiel.SYCEBNL],
  },
  {
    cle: 'releveTrimestrielDroitsAuteur',
    libelle: 'Relevé trimestriel des droits d’auteurs ou d’inventeurs versés aux membres ou mandants',
    periodicite: 'TRIMESTRIELLE',
    joursApresPeriode: 10,
    echeance: 'Dans les dix jours suivant la fin de chaque trimestre',
    baseLegale:
      "Article 47, alinéa 2, de la loi n° 004/2003 portant réforme des procédures fiscales, tel que modifié par la loi de finances n° 24/011 du 20 décembre 2024, article 40.",
    contenu:
      'Relevé des sommes versées à ses membres ou mandants au titre des droits d’auteurs ou d’inventeurs, dans les mêmes conditions et sur les mêmes supports que le relevé de l’alinéa 1er.',
    sanction: "Amende de 500 000 francs congolais pour une personne morale (article 94 de la loi de procédures fiscales).",
    sourceDonnees:
      'Comptes de redevances et de droits versés, et comptes de tiers 40 et 47 pour les bénéficiaires.',
    // Celui-là vise « les entreprises ET les associations » : il n'est donc
    // filtré pour personne. Il est posé à part parce que son ASSIETTE est
    // beaucoup plus étroite que celle de l'alinéa 1er · les fondre en une
    // ligne aurait annoncé à une entreprise un relevé de toutes ses sommes
    // versées à des tiers.
  },
  /*
    L'IMPÔT PROPRE DE L'ENTITÉ, QUE L'ÉCHÉANCIER OMETTAIT.

    Le registre et l'échéancier ont été bâtis pour une ASBL, exemptée d'impôt
    sur les sociétés (loi n° 23/053, art. 5). Servis à une société commerciale,
    ils énuméraient scrupuleusement tout ce qu'elle retient POUR AUTRUI, et
    passaient sous silence les quatre échéances de son impôt principal.

    Ces quatre-là sont des obligations DÉCLARATIVES et non des retenues : leur
    montant ne se lit dans aucun solde de compte. L'IS se liquide sur le
    résultat fiscal (fenêtre État > Résultat fiscal), les acomptes se calculent
    sur l'impôt de l'exercice PRÉCÉDENT · aucun des deux n'est déductible d'une
    balance. Elles entrent donc ici, où une échéance sans montant reste une
    échéance, et non dans les natures de retenue, qui lisent un crédit de
    compte et n'ont d'ailleurs qu'une périodicité mensuelle.
  */
  {
    cle: 'declarationImpotSocietes',
    libelle: 'Déclaration de l’impôt sur les sociétés',
    periodicite: 'ANNUELLE',
    moisEcheance: 4,
    jourEcheance: 30,
    echeance: "Au plus tard le 30 avril de l'année qui suit celle de la réalisation des revenus",
    baseLegale:
      "Article 12 de la loi de procédures fiscales n° 004/2003, modifié par la loi n° 23/052 du 30 novembre 2023 : " +
      '« Les sociétés et autres personnes morales soumises à l’Impôt sur les Sociétés sont tenues de souscrire ' +
      'chaque année une déclaration de leurs revenus, au plus tard le 30 avril de l’année qui suit celle de la ' +
      'réalisation des revenus. »',
    contenu:
      "Déclaration auto-liquidative des revenus de l'exercice, accompagnée des états financiers certifiés par un " +
      "membre de l'Ordre national des experts-comptables (art. 13 et 14).",
    sourceDonnees:
      "Résultat fiscal de la fenêtre État > Résultat fiscal et impôt sur les bénéfices, et liasse de la fenêtre États financiers.",
    referentiels: [Referentiel.SYSCOHADA],
  },
  {
    cle: 'premierAcompteIs',
    libelle: 'Premier acompte provisionnel (30 %)',
    periodicite: 'ANNUELLE',
    moisEcheance: 7,
    jourEcheance: 25,
    echeance: 'Au plus tard le 25 juillet',
    baseLegale: BASE_ACOMPTES,
    contenu: CONTENU_ACOMPTE('30 %'),
    sourceDonnees: SOURCE_ACOMPTES,
    referentiels: [Referentiel.SYSCOHADA],
  },
  {
    cle: 'deuxiemeAcompteIs',
    libelle: 'Deuxième acompte provisionnel (30 %)',
    periodicite: 'ANNUELLE',
    moisEcheance: 9,
    jourEcheance: 25,
    echeance: 'Au plus tard le 25 septembre',
    baseLegale: BASE_ACOMPTES,
    contenu: CONTENU_ACOMPTE('30 %'),
    sourceDonnees: SOURCE_ACOMPTES,
    referentiels: [Referentiel.SYSCOHADA],
  },
  {
    cle: 'troisiemeAcompteIs',
    libelle: 'Troisième acompte provisionnel (20 %)',
    periodicite: 'ANNUELLE',
    moisEcheance: 11,
    jourEcheance: 25,
    echeance: 'Au plus tard le 25 novembre',
    baseLegale: BASE_ACOMPTES,
    contenu: CONTENU_ACOMPTE('20 %'),
    sourceDonnees: SOURCE_ACOMPTES,
    referentiels: [Referentiel.SYSCOHADA],
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

/**
 * LE RÉGIME D'IMPÔT DU DOSSIER, ET C'EST L'AVERTISSEMENT LE PLUS FAUX QU'ON
 * PUISSE SERVIR AU MAUVAIS RÉFÉRENTIEL.
 *
 * Le texte annonçait à TOUT dossier une exemption d'impôt sur les sociétés.
 * L'article 5 de la loi n° 23/053 ne l'accorde qu'à l'État, aux provinces, aux
 * ETD, aux établissements publics, aux coopératives agricoles de forme civile,
 * aux ASBL, aux établissements d'utilité publique et aux ONG, et à certains
 * établissements privés d'enseignement. Une société commerciale y est au
 * contraire soumise par sa forme même (art. 3) : lui dire l'inverse en tête de
 * son registre fiscal est la pire chose que cet écran puisse faire.
 *
 * La conclusion, elle, est la même des deux côtés, et c'est tout l'objet de
 * l'état : payer ou ne pas payer son propre impôt ne dispense de rien de ce
 * qu'on retient pour le compte d'autrui.
 */
export function avertissementRegimeImpot(referentiel: Referentiel): string {
  if (referentiel === Referentiel.SYSCOHADA) {
    return (
      "La société est redevable de l'impôt sur les sociétés (loi n° 23/053, art. 3). Sa déclaration est due au plus " +
      "tard le 30 avril de l'année qui suit celle de la réalisation des revenus (loi n° 004/2003, art. 12), et ses " +
      'trois acomptes provisionnels au plus tard les 25 juillet, 25 septembre et 25 novembre (art. 57 bis, tel que ' +
      "modifié par la loi de finances n° 25/060 du 29 décembre 2025). Cet impôt ne dispense d'aucun impôt retenu " +
      "pour le compte d'autrui, ni d'aucune cotisation sociale, ni de DÉCLARER aux échéances prévues."
    );
  }
  return (
    "L'exemption d'impôt sur les sociétés dont bénéficie une ASBL régulièrement constituée (loi n° 23/053, art. 5) " +
    "ne dispense d'aucun impôt retenu pour le compte d'autrui, ni d'aucune cotisation sociale. Elle ne dispense pas " +
    "non plus de DÉCLARER aux échéances prévues, même lorsque rien n'est dû."
  );
}

/** Obligations déclaratives applicables au référentiel d'un dossier. */
export function obligationsDeclarativesApplicables(referentiel: Referentiel): ObligationDeclarative[] {
  return OBLIGATIONS_DECLARATIVES.filter((o) => !o.referentiels || o.referentiels.includes(referentiel));
}

/** Réserve à afficher pour une nature, selon le référentiel du dossier. */
export function reservePourReferentiel(nature: NatureRetenue, referentiel: Referentiel): string | undefined {
  return referentiel === Referentiel.SYSCOHADA ? (nature.reserveSyscohada ?? nature.reserve) : nature.reserve;
}

/**
 * L'argument qui fait comprendre l'enjeu à un trésorier plus vite que tout le
 * reste de l'écran : la retenue qu'on a omis d'opérer, on la doit soi-même.
 */
export const AVERTISSEMENT_REDEVABLE =
  "Le redevable qui n'a pas opéré une retenue, ou qui l'a opérée pour un montant insuffisant, en est PERSONNELLEMENT " +
  'redevable (article 96 bis de la loi de procédures fiscales, créé par la loi de finances n° 25/060 du 29 décembre ' +
  "2025). Une retenue oubliée ne disparaît pas avec le paiement : elle devient une dette de l'entité elle-même.";

/**
 * Une nature dont la retenue est ÉCHUE et toujours pas reversée, avec la
 * charge que ce défaut expose. Ce que le service en tire ne sort jamais du
 * constat : une échéance passée, un montant de RETENUE, et le nom de la charge.
 */
export interface SignalementDeductibilite {
  cle: string;
  libelle: string;
  /** Charge dont la déduction est exposée · texte de la nature. */
  charge: string;
  /**
   * Retenue ÉCHUE qui reste non reversée, en francs · retenues des mois dont
   * l'échéance est passée, diminuées de tout ce que la nature a déjà reversé.
   * Voir `retenuEchuNonReverse` dans le service pour ce que cette assiette
   * évite.
   */
  montantEchuNonReverse: number;
  /** Dernière échéance de reversement déjà passée à la date de référence. */
  derniereEcheanceEchue: Date;
}

/**
 * LA CONSÉQUENCE, SUR L'IMPÔT DE L'ENTITÉ, D'UNE RETENUE COLLECTÉE ET NON
 * REVERSÉE · l'information que ce registre détenait sans jamais la dire.
 *
 * Loi n° 23/053, art. 20, dernier alinéa, Sous-section 2, Paragraphe 1 « Des
 * conditions GÉNÉRALES de déductibilité des charges » : « La société apporte
 * la preuve de la déclaration et du paiement de la retenue correspondante
 * pour les sommes donnant lieu à un prélèvement ou à une retenue à la
 * source. » (compilation DGI au 19 juillet 2026,
 * `04-loi23-053-titre2-impot-societes.md`, lignes 422 à 424 ; l'alinéa suit
 * les quatre conditions numérotées de l'article, et la loi de finances
 * n° 25/060 du 29 décembre 2025 ne l'a pas touché.)
 *
 * Ce que le texte exige est une PREUVE · celle de la déclaration ET du
 * paiement. Le registre est précisément l'endroit qui sait quand elle ne peut
 * pas être rapportée : c'est son solde échu. Ce que le texte ne dit pas, en
 * revanche, c'est le montant de ce qui serait réintégré · c'est la CHARGE qui
 * est en cause, pas la retenue, et le registre ne connaît pas l'assiette.
 * D'où un avertissement nommant la charge, et aucun chiffrage.
 *
 * LE RÉGIME D'IMPÔT CHANGE LA PORTÉE, et c'est la leçon déjà tirée pour
 * `avertissementRegimeImpot` : une condition de déductibilité d'une charge
 * n'a d'effet que sur un bénéfice imposable. Une entité effectivement
 * exemptée d'impôt sur les sociétés (art. 5) n'en a pas · le reversement ne
 * lui en reste pas moins dû, à l'échéance rappelée par ce même registre.
 */
export function avertissementDeductibiliteArticle20(
  referentiel: Referentiel,
  signalements: SignalementDeductibilite[],
): string | null {
  if (signalements.length === 0) return null;

  const detail = signalements
    .map(
      (s) =>
        `${s.libelle} · ${s.montantEchuNonReverse.toLocaleString('fr-FR')} FC de retenue échue non reversés au ` +
        `${s.derniereEcheanceEchue.toLocaleDateString('fr-FR')} (charge exposée : ${s.charge})`,
    )
    .join(' ; ');

  const commun =
    'RETENUES ÉCHUES ET NON REVERSÉES · ' +
    detail +
    ". L'article 20, dernier alinéa de la loi n° 23/053 range parmi les conditions générales de déductibilité des " +
    'charges que « la société apporte la preuve de la déclaration et du paiement de la retenue correspondante pour ' +
    'les sommes donnant lieu à un prélèvement ou à une retenue à la source ». Tant que le reversement n’est pas fait, ' +
    'cette preuve manque pour les charges correspondantes.';

  // La réserve qui empêche de lire ce montant comme un constat définitif : le
  // registre ne lit que les écritures de l'exercice affiché. Le reversement
  // de la retenue de décembre, passé en janvier suivant, est hors de sa vue ·
  // c'est le seul cas où ce signalement peut se lever à tort.
  const reserveExercice =
    ' Ce registre ne lit que les écritures de l’exercice affiché : un reversement passé sur l’exercice suivant, ' +
    'celui de la retenue du dernier mois notamment, ne lui est pas visible · vérifiez-le avant de conclure.';

  if (referentiel === Referentiel.SYSCOHADA) {
    return (
      commun +
      ' La déduction de ces charges est donc exposée à une réintégration au résultat fiscal, pour le montant de la ' +
      'CHARGE et non pour celui de la retenue. Ce registre ne le chiffre pas : il ne connaît pas l’assiette et ' +
      'n’applique aucun taux · rapprochez ces retenues des charges qu’elles accompagnent dans État > Résultat fiscal ' +
      'avant de déclarer.' +
      reserveExercice
    );
  }
  return (
    commun +
    " L'entité qui bénéficie EFFECTIVEMENT de l'exemption d'impôt sur les sociétés de l'article 5 n'a pas de " +
    'bénéfice imposable sur lequel cette condition jouerait · exemption qui n’est pas automatique pour un ' +
    'établissement d’utilité publique ou une ONG, puisqu’elle suppose l’attestation et les conditions de fond des ' +
    'articles 2 et 3 de l’arrêté n° 007/CAB/MIN/FINANCES/2025 du 19 février 2025. Le reversement, lui, reste dû à ' +
    'l’échéance rappelée ci-dessus.' +
    reserveExercice
  );
}

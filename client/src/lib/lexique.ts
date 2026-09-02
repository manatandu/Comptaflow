/**
 * LEXIQUE · le contenu des bulles d'aide « ? » posées dans les fenêtres.
 *
 * C'est la valeur ajoutée qu'aucun logiciel généraliste n'apporte : le
 * comptable d'une association n'a pas à ouvrir le Journal officiel pour
 * savoir ce qu'est un fonds affecté ou pourquoi le TFT est en méthode
 * directe · la réponse est dans l'écran, à l'endroit exact où la question
 * se pose.
 *
 * DEUX RÉFÉRENTIELS DANS UN SEUL FICHIER, ET AUCUN MÉLANGE POSSIBLE.
 *
 *  · SYCEBNL · Acte uniforme relatif au système comptable des entités à but
 *    non lucratif (Niamey, 22 décembre 2022, applicable au 1er janvier
 *    2024) : glossaire de la Partie 1 ch. 1, fonctionnement des comptes de
 *    la Partie 2 ch. 3, présentation des états financiers de la Partie 4.
 *  · SYSCOHADA · AUDCIF (Acte uniforme portant organisation et harmonisation
 *    des comptabilités des entités, révision de 2017) : articles 8, 11 et
 *    13, Titre IX pour le Système normal, Titre X pour le Système minimal
 *    de trésorerie.
 *
 * Les entrées propres au SYSCOHADA portent toutes le suffixe `Syscohada`.
 * Une entrée d'un référentiel ne doit JAMAIS être servie à un écran de
 * l'autre : les deux ne partagent ni états, ni postes, ni vocabulaire
 * (CLAUDE.md §6), et une bulle qui compterait « 35 notes » sur un état
 * SYSCOHADA se déposerait telle quelle chez un tiers. Un écran commun aux
 * deux dossiers choisit donc sa clé d'après `tenant.referentiel`.
 *
 * Règle de rédaction : deux à quatre phrases, sans jargon inutile, avec la
 * référence du texte à la fin. Ne jamais inventer une règle qui n'est pas
 * dans le référentiel : en cas de doute, ne pas créer l'entrée.
 */

export interface EntreeLexique {
  titre: string;
  texte: string;
  /** Renvoi au texte officiel, affiché en pied de bulle. */
  source: string;
}

export const LEXIQUE = {
  analytique: {
    titre: 'Comptabilité analytique',
    texte:
      "Le SYCEBNL réserve les comptes 92 à 99 à la comptabilité analytique de gestion, d'usage libre. Pour une entité à but non lucratif, cet usage est le suivi par projet et par bailleur : savoir ce qu'a coûté chaque programme et quel financement le couvre. Chaque ligne d'écriture de charge, de produit, d'immobilisation ou de contribution en nature peut être ventilée sur une ou plusieurs sections.",
    source: 'SYCEBNL, Partie 2 ch. 3, classe 9',
  },
  budget: {
    titre: 'Dotation budgétaire',
    texte:
      "Le budget se porte sur les sections analytiques : chez une EBNL, le budget est celui du projet. Le montant annuel est réparti sur les mois que la convention de financement couvre réellement, puis chaque mois reste modifiable. C'est ce budget qui alimente la note annexe 35 des associations et le tableau d'exécution budgétaire des projets de développement.",
    source: 'SYCEBNL, art. 4 · notes annexes 35 et tableau d’exécution budgétaire',
  },
  controleCumuls: {
    titre: 'Contrôle des cumuls',
    texte:
      "Il compare, pour chaque axe, les mouvements comptables des comptes censés être ventilés aux mouvements effectivement ventilés, et liste les écritures restées sans répartition. Un écart n'est pas une panne : c'est du travail de ventilation qui reste à faire. Sans cet état, un rapport d'exécution adressé à un bailleur n'est pas défendable en audit.",
    source: 'Suivi analytique · rapprochement général / analytique',
  },
  brouillard: {
    titre: 'Brouillard',
    texte:
      "Une écriture y naît modifiable et supprimable : elle n'est pas encore entrée au livre-journal. La valider franchit cette frontière, et l'article 20 ne laisse alors plus qu'une voie de correction, l'inscription en négatif. Le SYCEBNL borne ce séjour : les journaux auxiliaires doivent être centralisés au moins chaque semaine, donc une écriture qui y reste plus de sept jours est signalée.",
    source: 'SYCEBNL, Partie 2 ch. 2 · AUDCIF art. 20',
  },
  import: {
    titre: 'Import de données',
    texte:
      "Trois règles gouvernent l'import. La correspondance entre les colonnes du fichier et les champs attendus est proposée, jamais imposée : un import qui se trompe de colonne de montants est pire que pas d'import du tout. Tout ce qui entre atterrit au brouillard, pour être relu avant de rejoindre le livre-journal. Et une balance de reprise devient une écriture d'à-nouveau équilibrée, datée, corrigeable : le SYCEBNL ne connaît pas de solde sans écriture.",
    source: 'Reprise de dossier · art. 20 et Partie 2 ch. 2',
  },
  controles: {
    titre: 'Analyse et contrôles',
    texte:
      "Une batterie de contrôles cherche ce qu'aucun total ne montre : une caisse créditrice, un compte de tiers au solde inversé, une créance ancienne jamais lettrée, une écriture sans pièce justificative, un compte mal classé. Chaque anomalie dit ce qu'elle risque et ce qu'il faut faire, plutôt que de laisser le diagnostic à faire.",
    source: 'Contrôles de cohérence · SYCEBNL',
  },
  caisse: {
    titre: 'Contrôle de caisse',
    texte:
      "Une caisse ne peut pas être créditrice : cela signifierait qu'on a décaissé de l'argent qu'on n'avait pas. Le contrôle reconstitue le solde jour par jour et nomme la date exacte du passage sous zéro, car une caisse peut finir l'exercice positive tout en ayant été négative un mardi. Le remède habituel est d'enregistrer les approvisionnements avant les dépenses du même jour.",
    source: 'Suivi de trésorerie · pratique courante en RDC',
  },
  regularisation: {
    titre: 'Régularisation des charges et des produits',
    texte:
      "Une charge payée cette année qui couvre en partie la suivante n'est pas une charge de cette année : la spécialisation des exercices l'impose. Elle est différée au compte 476, un produit encaissé d'avance au 477. Pour une subvention accordée sur toute la durée d'un projet, le texte est explicite : on extourne à la clôture la part des exercices ultérieurs au crédit du 477 par le débit du 71, puis on la reprend À LA FIN de chaque exercice concerné · et non par contre-passation à son ouverture.",
    source: 'SYCEBNL, Partie 3 ch. 6 section 1 · comptes 476 et 477',
  },
  devises: {
    titre: 'Écarts de conversion',
    texte:
      "À la clôture, les créances et dettes en devises sont converties au cours du jour. L'écart est LATENT : perte probable au 478, gain probable au 479, et par prudence la perte probable est provisionnée au 194. Les disponibilités en devises suivent une autre règle : leur écart est considéré comme réalisé et va droit au résultat, 676 ou 776. Le texte prend soin de le dire : le 676 ne doit pas être confondu avec le 478, qui n'enregistre que les pertes probables.",
    source: 'SYCEBNL, Partie 2 ch. 3, comptes 47, 67 et 77',
  },
  relance: {
    titre: 'Rappel et relevé',
    texte:
      "Trois états distincts, et non un seul : la relance préventive avant l'échéance, le rappel gradué après, et le relevé de tout ce qui est dû. L'assiette est celle de la balance âgée, les lignes non lettrées des comptes 41 · une ligne lettrée est soldée, il n'y a rien à réclamer. Une EBNL ne relance pas des clients en retard : elle rappelle à ses adhérents une cotisation appelée et non payée.",
    source: 'Suivi des tiers · comptes 411 et 412',
  },
  adherent: {
    titre: 'Adhérent',
    texte:
      "Membre de l'entité qui doit payer sa cotisation conformément aux statuts ou aux délibérations des organes compétents. Ses créances se suivent au compte 411, distinct du 412 des clients-usagers : confondre les deux ferait perdre le suivi des appels de cotisations, qui est le coeur de l'activité d'une association.",
    source: 'SYCEBNL, Partie 2 ch. 3, compte 41',
  },
  clientUsager: {
    titre: 'Client-usager',
    texte:
      "Tiers auquel l'entité vend les biens ou les services objet de son activité. Ses créances se suivent au compte 412. Si ce même tiers est aussi fournisseur ou salarié, seules les opérations de vente figurent ici, les autres allant à leur compte propre.",
    source: 'SYCEBNL, Partie 2 ch. 3, compte 41',
  },
  compte41: {
    titre: 'Compte 41 · Adhérents, clients-usagers',
    texte:
      "Le compte 41 « Adhérents, clients-usagers et comptes rattachés » couvre deux populations que le texte subdivise : 411 Adhérents (membres cotisants) et 412 Clients-usagers (acheteurs de biens et services). S'y rattachent les impayés (413), les créances litigieuses ou douteuses (416), les produits à recevoir (418) et les avances reçues (419).",
    source: 'SYCEBNL, Partie 2 ch. 3, compte 41',
  },
  cotisation: {
    titre: 'Cotisation',
    texte:
      "Somme que le membre verse périodiquement en application des statuts. Elle est constatée en produit au compte 701 dès l'appel de fonds, en contrepartie d'une créance sur l'adhérent (411), et non à l'encaissement : le SYCEBNL est tenu en comptabilité d'engagement.",
    source: 'SYCEBNL, Partie 3 ch. 5',
  },
  fondsAffectes: {
    titre: 'Fonds affectés',
    texte:
      "Ressources reçues avec une affectation précise imposée par le donateur ou le bailleur, que l'entité n'a pas encore consommée. Elles ne sont pas un résultat : elles restent au passif (compte 17) jusqu'à réalisation du projet financé, puis sont reprises au rythme des dépenses engagées.",
    source: 'SYCEBNL, Partie 3 ch. 2',
  },
  fondsReportes: {
    titre: 'Fonds reportés',
    texte:
      "Part d'un financement affecté reçue sur l'exercice mais destinée à un exercice ultérieur. Elle est reportée au passif plutôt que comptabilisée en produit, pour que le résultat de chaque exercice ne reflète que les ressources réellement consommées.",
    source: 'SYCEBNL, Partie 3 ch. 2',
  },
  contributionsVolontaires: {
    titre: 'Contributions volontaires en nature',
    texte:
      "Travail bénévole, biens et services mis gratuitement à disposition de l'entité. Ils sont suivis en classe 9, hors bilan et hors résultat, sur des comptes en miroir (900 à 904 au débit, 910 à 914 au crédit), puis présentés en note annexe : ils ne modifient ni le résultat ni la situation nette.",
    source: 'SYCEBNL, Partie 2 ch. 3, classe 9',
  },
  tft: {
    titre: 'Tableau de flux de trésorerie',
    texte:
      "Le SYCEBNL impose la méthode directe : le tableau part des encaissements et décaissements réels de la période, et non du résultat retraité. La variation de trésorerie qu'il dégage doit boucler avec l'écart de trésorerie entre l'ouverture et la clôture du bilan.",
    source: 'SYCEBNL, art. 10 et Partie 4 ch. 1',
  },
  bilan: {
    titre: 'Bilan',
    texte:
      "État de la situation à la clôture : à l'actif ce que l'entité possède, au passif ses fonds propres et ses dettes. Chaque poste porte un code REF officiel (AA à DZ) qui commande son emplacement · c'est ce code, et non le libellé, qui fait foi dans la liasse.",
    source: 'SYCEBNL, art. 7 et Partie 4 ch. 2',
  },
  compteResultat: {
    titre: 'Compte de résultat',
    texte:
      "Il oppose les produits des activités ordinaires (classe 7) aux charges (classe 6) pour dégager un excédent ou un déficit, et non un bénéfice ou une perte : une entité à but non lucratif ne distribue pas son résultat, elle le reporte ou l'affecte.",
    source: 'SYCEBNL, art. 8 et Partie 4 ch. 2',
  },
  compteExploitation: {
    titre: "Compte d'exploitation",
    texte:
      "Ce que le projet de développement présente à la place du compte de résultat : les emplois et les ressources de la période, lus du point de vue du bailleur qui finance. Il se complète du tableau d'exécution budgétaire et du tableau de réconciliation de trésorerie.",
    source: 'SYCEBNL, art. 9 et Partie 4 ch. 3',
  },
  jeuEtats: {
    titre: "Jeu d'états financiers",
    texte:
      "L'article 4 ne prévoit pas un jeu unique : une association ou un ordre professionnel produit un bilan, un compte de résultat, un TFT et 35 notes annexes ; un projet de développement produit un bilan, un compte d'exploitation, un tableau emplois-ressources, un tableau d'exécution budgétaire, un tableau de réconciliation de trésorerie et 24 notes. Le choix se fait à la création du dossier.",
    source: 'SYCEBNL, art. 4 et Partie 4',
  },
  smt: {
    titre: 'Système Minimal de Trésorerie',
    texte:
      "Régime allégé réservé aux petites entités : comptabilité de trésorerie (le fait générateur est l'encaissement ou le décaissement), journal unique de trésorerie, bilan à cinq lignes d'actif, compte de résultat de caisse et cinq notes annexes. L'article 6 plafonne à 30 millions de FCFA CHACUNE des cinq catégories de ressources annuelles (subventions ; cotisations et autres revenus ; dons et legs ; ressources de projet ; autres) : un seul dépassement, ou un cumul supérieur sur deux exercices, ramène l'entité au Système normal, qui reste la règle.",
    source: 'SYCEBNL, art. 5 et 6, Partie 4 ch. 4',
  },
  systemeSyscohada: {
    titre: 'Système comptable SYSCOHADA',
    texte:
      "L'AUDCIF n'admet que deux présentations des états financiers et de tenue des comptes : le Système normal et le Système minimal de trésorerie. L'ancien Système allégé a été abrogé par la révision de 2017. Le Système normal est la règle · « toute entité est, sauf exception liée à sa taille, soumise au Système normal ». Le SMT est réservé aux entités dont le chiffre d'affaires hors taxes annuel reste sous 60 millions de FCFA pour le négoce, 40 millions pour l'artisanat et assimilés, 30 millions pour les services. Ces seuils sont propres au SYSCOHADA : ne pas les confondre avec ceux du SYCEBNL, qui plafonne cinq catégories de ressources à 30 millions chacune.",
    source: 'AUDCIF, art. 11, 12 et 13',
  },
  formeJuridiqueSyscohada: {
    titre: 'Forme juridique OHADA',
    texte:
      "Le droit OHADA des affaires ne connaît que CINQ sociétés commerciales à raison de leur forme : la société en nom collectif, la société en commandite simple, la société à responsabilité limitée, la société anonyme et la société par actions simplifiée. La liste de l'article 6 est fermée · une entité qui exerce une activité commerciale en société doit choisir l'une d'elles, ou s'associer en groupement d'intérêt économique. S'y ajoutent, hors sociétés commerciales, la société coopérative, le commerçant personne physique, l'entreprenant, la succursale et les entités publiques. Aucune de ces formes n'a de rapport avec celles de la loi congolaise n° 004/2001, qui régit les ASBL et les ONG : ce sont deux référentiels séparés, et une entité à but non lucratif n'est d'ailleurs pas assujettie au SYSCOHADA.",
    source: 'AUSCGIE, art. 3 et 6 ; AUDCG, art. 2 et 30 ; AUDCIF, art. 2 et 5',
  },
  resultatFiscal: {
    titre: 'Résultat fiscal et impôt sur les bénéfices',
    texte:
      "Le bénéfice imposable est l'excédent des produits sur les charges « en application de la législation comptable, sous réserve des dispositions fiscales contraires ». Il part donc du résultat comptable, auquel s'ajoutent les charges que le fisc n'admet pas (réintégrations) et dont se retranchent les produits qu'il n'impose pas (déductions), puis les déficits des trois exercices précédents. L'impôt sur les sociétés est de 30 % de ce résultat, sans pouvoir être inférieur à 1 % du chiffre d'affaires déclaré. Une entreprise individuelle ou un entreprenant relève d'un autre régime, commandé par son chiffre d'affaires : forfait en dessous de 25 millions de FC, 1 % ou 2 % du chiffre d'affaires jusqu'à 300 millions, régime réel au-delà. L'IPR et l'IBP n'existent plus depuis le 1er janvier 2026. Une entité à but non lucratif est exemptée.",
    source: 'Loi n° 23/053 du 30 novembre 2023, art. 5, 9, 51, 56, 57, 107 à 128',
  },
  notesAnnexes: {
    titre: 'Notes annexes',
    texte:
      "Elles font partie intégrante des états financiers et non d'un commentaire facultatif : sans elles la liasse est incomplète. Leur nombre et leur contenu dépendent du jeu d'états retenu (35 notes pour une association, 24 pour un projet de développement, 5 pour le SMT).",
    source: 'SYCEBNL, art. 15 et Partie 4',
  },
  registreDonateurs: {
    titre: 'Registre des donateurs',
    texte:
      "Registre obligatoire où sont consignés les dons, legs et libéralités reçus, avec l'identité du donateur, la nature et la valeur du bien, et l'affectation convenue. Il est tenu au siège et doit pouvoir être présenté à toute réquisition.",
    source: 'SYCEBNL, art. 17 et 18',
  },
  livreInventaire: {
    titre: "Livre d'inventaire",
    texte:
      "Document obligatoire où sont transcrits, à chaque clôture, les états financiers de l'exercice et le détail des éléments d'actif et de passif recensés lors de l'inventaire. Une fois arrêté, il fige la situation : c'est la pièce qu'un auditeur demande en premier.",
    source: 'SYCEBNL, art. 14',
  },
  livreInventaireSyscohada: {
    titre: "Livre d'inventaire",
    texte:
      "Document obligatoire sur lequel sont transcrits le Bilan, le Compte de résultat et le Tableau des flux de trésorerie de chaque exercice, ainsi que le résumé de l'opération d'inventaire. Une fois arrêté, il fige la situation : c'est la pièce qu'un auditeur demande en premier.",
    source: 'AUDCIF, art. 19',
  },
  rapportGestion: {
    titre: 'Rapport de gestion',
    texte:
      "Le gérant, le conseil d'administration ou l'administrateur général y expose la situation de la société durant l'exercice écoulé, son évolution prévisible, les événements importants survenus depuis la clôture et, en particulier, les perspectives de continuation de l'activité, l'évolution de la trésorerie et le plan de financement. Une société coopérative relève de son propre texte, qui y ajoute l'état de promotion des coopérateurs.",
    source: 'AUSCGIE, art. 138 · AUSCOOP, art. 108 pour la coopérative',
  },
  balanceAgee: {
    titre: 'Balance âgée',
    texte:
      "Elle répartit les créances et les dettes non lettrées par ancienneté à une date donnée, à partir de la date d'échéance de chaque ligne (à défaut, la date de l'écriture). Une ligne lettrée en est absente : elle est soldée, donc sans échéance à suivre.",
    source: 'Suivi des tiers · comptes 40 et 41',
  },
  lettrage: {
    titre: 'Lettrage',
    texte:
      "Rapprochement des lignes d'un compte de tiers qui se compensent : une facture et son règlement reçoivent la même lettre et sortent du solde à suivre. Le solde non lettré est ce qui reste réellement dû, et c'est lui qui alimente la balance âgée.",
    source: 'Suivi des tiers',
  },
  exerciceClos: {
    titre: 'Clôture de l’exercice',
    texte:
      "Une fois l'exercice clos, aucune écriture ne peut plus y être ajoutée, modifiée ni supprimée. Une erreur découverte après coup se corrige par une écriture d'inscription en sens inverse sur l'exercice ouvert, jamais en retouchant l'écriture d'origine.",
    source: 'AUDCIF, art. 20 · principe d’intangibilité',
  },
  hao: {
    titre: 'Hors activités ordinaires (H.A.O.)',
    texte:
      "Opérations qui ne relèvent pas de l'activité courante de l'entité : cessions d'immobilisations, subventions d'équilibre, charges et produits exceptionnels. Elles sont isolées en classe 8 pour que le résultat des activités ordinaires reste lisible.",
    source: 'SYCEBNL, Partie 2 ch. 3, classe 8',
  },
  bailleur: {
    titre: 'Bailleur de fonds',
    texte:
      "Organisme qui finance tout ou partie d'un projet, avec une obligation de rendre compte de l'emploi des fonds. Ses versements transitent par les comptes 46 (bailleurs, fonds d'administration) et alimentent, côté états financiers, le tableau d'exécution budgétaire.",
    source: 'SYCEBNL, Partie 2 ch. 3, compte 46 · Partie 3 ch. 3',
  },
  // -------------------------------------------------------------------------
  // SYSCOHADA · AUDCIF. Le Système normal (Titre IX) puis le Système minimal
  // de trésorerie (Titre X). Aucune de ces entrées ne doit être servie à un
  // dossier SYCEBNL, et réciproquement.
  // -------------------------------------------------------------------------
  jeuEtatsSyscohada: {
    titre: "Jeu complet d'états financiers annuels",
    texte:
      "« Un jeu complet d'états financiers annuels comprend le Bilan, le Compte de résultat, le Tableau des flux de trésorerie ainsi que les Notes annexes. » Les états financiers forment un TOUT INDISSOCIABLE : les trois onglets de cette fenêtre plus la fenêtre des notes annexes, jamais l'un sans les autres. Ils sont présentés de façon à permettre leur comparaison dans le temps, exercice par exercice, d'où la colonne N-1 de chaque état. Une entité cotée, ou qui sollicite un financement par appel public à l'épargne, établit EN SUS des états en normes IFRS, destinés aux seuls marchés financiers.",
    source: 'AUDCIF, art. 8',
  },
  bilanSyscohada: {
    titre: 'Bilan du Système normal',
    texte:
      "État de synthèse qui décrit en termes d'actif et de passif la situation patrimoniale de l'entité à une date donnée. Le Système comptable OHADA préconise un bilan AVANT répartition du résultat et un classement FONCTIONNEL, qui range les postes selon les trois fonctions investissement, financement et exploitation, en six grandes masses : actif immobilisé face aux capitaux propres et dettes financières, actif circulant face au passif circulant, trésorerie-actif face à trésorerie-passif. L'actif se lit en trois colonnes (brut, amortissements et dépréciations, net), le passif en net seulement, et chaque poste porte le code REF officiel qui commande son emplacement. Cette structure étant déjà fonctionnelle, le seul retraitement à opérer pour en tirer le fonds de roulement, le besoin de financement et la trésorerie nette porte sur les écarts de conversion.",
    source: 'AUDCIF, Titre IX ch. 3 sections 1 et 2',
  },
  compteResultatSyscohada: {
    titre: 'Compte de résultat du Système normal',
    texte:
      "Il recense, pour une période donnée, les ressources produites par l'activité et les charges consommées ou occasionnées par les moyens mis en oeuvre, en deux rubriques : activité ordinaire (exploitation et financier) et activité hors activités ordinaires, celle des flux non récurrents à caractère accidentel ou extraordinaire. Leur différence donne le résultat de l'exercice, bénéfice ou perte, qui traduit l'enrichissement ou l'appauvrissement de l'entité. Le Plan Comptable OHADA le présente EN LISTE pour mettre en cascade les soldes intermédiaires de gestion : marge commerciale, valeur ajoutée, excédent brut d'exploitation, résultat d'exploitation, résultat financier, résultat des activités ordinaires, résultat H.A.O. et résultat net.",
    source: 'AUDCIF, Titre IX ch. 4 sections 1 et 2',
  },
  tftSyscohada: {
    titre: 'Tableau des flux de trésorerie',
    texte:
      "Il présente les entrées et sorties de trésorerie et d'équivalents de trésorerie en trois catégories : activités opérationnelles, activités d'investissement, activités de financement. Le point d'entrée est la capacité d'autofinancement globale, calculée À PARTIR DE L'EXCÉDENT BRUT D'EXPLOITATION et non du résultat net. Le bouclage imposé par le modèle est celui de la dernière ligne, qui doit égaler la trésorerie-actif moins la trésorerie-passif du bilan. Attention à la lettre-clé : le schéma de la section 1 attribue deux fois la lettre F et note la clôture G ; c'est le modèle de la section 2 qui fait foi (F = D + E, G = B + C + F, H = G + A), et c'est lui que la colonne CLÉ de l'écran affiche.",
    source: 'AUDCIF, Titre IX ch. 5 sections 1 et 2',
  },
  notesSyscohada: {
    titre: 'Notes annexes du Système normal',
    texte:
      "Elles font partie intégrante des états financiers : elles complètent et commentent l'information donnée par le Bilan, le Compte de résultat et le Tableau des flux de trésorerie, en vertu de la convention de l'importance significative. Une information portée aux notes ne peut pas se substituer à une inscription au bilan ou au compte de résultat, et une information déjà portée à l'un des deux n'a pas à y être reprise. Chaque élément des états financiers de synthèse doit faire l'objet d'une référence croisée vers l'information liée figurant dans les notes, et les notes comportent obligatoirement une déclaration explicite de conformité au Plan Comptable OHADA. La liste officielle va de la NOTE 1 à la NOTE 36, mais la numérotation n'est pas continue : les subdivisions (3A à 3F, 15A et 15B, 16A à 16C, 27A et 27B) portent le nombre de codes à 46.",
    source: 'AUDCIF, Titre IX ch. 6 section 1 (§ 1.1 et 1.2) et section 2',
  },
  smtSyscohada: {
    titre: 'Système minimal de trésorerie · SYSCOHADA',
    texte:
      "Il repose sur un état des recettes et des dépenses dégageant le résultat de l'exercice (recette nette ou perte nette), dressé à partir d'une COMPTABILITÉ DE TRÉSORERIE : un journal unique de trésorerie, un journal de suivi des créances impayées, un journal de suivi des dettes à payer, et la conservation des pièces justificatives. Son jeu d'états ne compte que TROIS documents · le Bilan, le Compte de résultat et les Notes annexes, ces dernières composées du tableau de suivi du matériel, du mobilier et des cautions (NOTE 1), de l'état des stocks (NOTE 2) et de l'état des créances et des dettes non échues (NOTE 3) : pas de tableau des flux de trésorerie, qui est propre au Système normal. En fin d'exercice, le responsable de l'entité procède à un inventaire EXTRA-COMPTABLE de quatre éléments : créances et dettes d'exploitation, stocks et travaux en cours, immobilisations acquises ou cédées, emprunts souscrits ou remboursés. Les immobilisations s'amortissent en mode linéaire SANS prorata temporis, simplification propre au SMT. Il est réservé aux entités dont le chiffre d'affaires hors taxes annuel reste sous 60 millions de F CFA pour le négoce, 40 pour l'artisanat et assimilés, 30 pour les services.",
    source: 'AUDCIF, art. 11 et 13 · Titre X ch. 1 sections 1 et 2',
  },
  // -------------------------------------------------------------------------
  // SYSCOHADA · les pendants des entrées des écrans COMMUNS aux deux
  // référentiels. Ce sont elles qui manquaient : douze fenêtres servaient la
  // définition SYCEBNL à un dossier SYSCOHADA, comptes et articles compris,
  // faute d'un aiguillage. `entreeLexique` le fait maintenant tout seul.
  // -------------------------------------------------------------------------
  analytiqueSyscohada: {
    titre: 'Comptabilité analytique',
    texte:
      "Les comptes 92 à 99 portent la comptabilité analytique de gestion (comptes réfléchis, reclassements, coûts, stocks, écarts sur coûts préétablis, différences de traitement, résultats, liaisons internes). Leur usage est facultatif, et la ventilation se fait sur les axes d'exploitation : activité, centre de coûts, produit. Attention à ne pas confondre avec les comptes 90 et 91 de la même classe, qui portent les engagements hors bilan et exigent, eux, une convention écrite.",
    source: 'AUDCIF, Titre VII ch. 3, classe 9',
  },
  budgetSyscohada: {
    titre: 'Dotation budgétaire',
    texte:
      "Le budget se porte sur les sections analytiques : centre de coûts, activité, produit. Le montant annuel est réparti sur les mois de l'exercice, puis chaque mois reste modifiable. C'est un outil de contrôle de gestion interne : il n'alimente aucun des quatre états du jeu complet, qui sont le bilan, le compte de résultat, le tableau des flux de trésorerie et les notes annexes.",
    source: 'AUDCIF, art. 8 · Titre VII ch. 3, classe 9',
  },
  controleCumulsSyscohada: {
    titre: 'Contrôle des cumuls',
    texte:
      "Il compare, pour chaque axe, les mouvements comptables des comptes censés être ventilés aux mouvements effectivement ventilés, et liste les écritures restées sans répartition. Un écart n'est pas une panne : c'est du travail de ventilation qui reste à faire. Sans cet état, une analyse par centre de coûts ou un rapport d'exécution n'est pas défendable en audit.",
    source: 'Suivi analytique · rapprochement général / analytique',
  },
  brouillardSyscohada: {
    titre: 'Brouillard',
    texte:
      "Une écriture y naît modifiable et supprimable : elle n'est pas encore entrée au livre-journal. La valider franchit cette frontière, et l'article 20 ne laisse alors plus qu'une voie de correction, l'inscription en négatif. L'AUDCIF borne ce séjour : les totaux des journaux et livres auxiliaires sont centralisés au moins une fois par mois dans le livre-journal et le grand-livre, donc une écriture qui reste plus d'un mois au brouillard est signalée.",
    source: 'AUDCIF, art. 19 (centralisation mensuelle) · art. 20 (correction en négatif)',
  },
  importSyscohada: {
    titre: 'Import de données',
    texte:
      "Trois règles gouvernent l'import. La correspondance entre les colonnes du fichier et les champs attendus est proposée, jamais imposée : un import qui se trompe de colonne de montants est pire que pas d'import du tout. Tout ce qui entre atterrit au brouillard, pour être relu avant de rejoindre le livre-journal. Et une balance de reprise devient une écriture d'à-nouveau équilibrée, datée, corrigeable : la partie double ne connaît pas de solde sans écriture.",
    source: 'AUDCIF, art. 17, 2° (partie double) et art. 20',
  },
  regularisationSyscohada: {
    titre: 'Régularisation des charges et des produits',
    texte:
      "Le résultat de chaque exercice est indépendant de celui qui le précède et de celui qui le suit : il ne lui est rattaché que les événements et les opérations qui lui sont propres, et ceux-là seulement. Une charge payée cette année qui couvre en partie la suivante est donc différée au compte 476 « Charges constatées d'avance », un produit encaissé d'avance au compte 477 « Produits constatés d'avance ». La part différée revient en charge ou en produit de l'exercice qu'elle concerne réellement.",
    source: 'AUDCIF, art. 59 (indépendance des exercices) · Titre VII ch. 3, comptes 476 et 477',
  },
  devisesSyscohada: {
    titre: 'Écarts de conversion',
    texte:
      "À la clôture, les créances et dettes en devises sont converties au dernier cours de change connu. L'écart est LATENT : perte probable au 478, gain latent au 479. La perte probable est provisionnée, mais pas toujours au même compte · 194 « Provisions pour pertes de change » pour un risque à long terme, 4991 pour une créance d'exploitation, 4997 pour une opération financière à court terme. Les disponibilités en devises suivent une autre règle : leur écart est inscrit DIRECTEMENT dans les produits et charges de l'exercice, 676 ou 776. Enfin, si les opérations concourent à une position globale de change, la dotation est limitée à l'excédent des pertes probables sur les gains latents.",
    source: 'AUDCIF, art. 54 (écarts de conversion), art. 57 (disponibilités en devises), art. 58 (position globale)',
  },
  relanceSyscohada: {
    titre: 'Rappel et relevé',
    texte:
      "Trois états distincts, et non un seul : la relance préventive avant l'échéance, le rappel gradué après, et le relevé de tout ce qui est dû. L'assiette est celle de la balance âgée, les lignes non lettrées des comptes 41 « Clients et comptes rattachés » · une ligne lettrée est soldée, il n'y a rien à réclamer. Le rappel porte sur une facture échue et impayée, pas sur un effet en portefeuille (412) ni sur un client créditeur (419), qui ne sont pas des retards.",
    source: 'AUDCIF, Titre VII ch. 3, compte 41',
  },
  controlesSyscohada: {
    titre: 'Analyse et contrôles',
    texte:
      "Une batterie de contrôles cherche ce qu'aucun total ne montre : une caisse créditrice, un compte de tiers au solde inversé, une créance ancienne jamais lettrée, une écriture sans pièce justificative, un compte mal classé. Chaque anomalie dit ce qu'elle risque et ce qu'il faut faire, plutôt que de laisser le diagnostic à faire.",
    source: 'Contrôles de cohérence · AUDCIF',
  },
  compte41Syscohada: {
    titre: 'Compte 41 · Clients et comptes rattachés',
    texte:
      "Il porte les créances nées de la vente des biens et des services objet de l'activité. Ses subdivisions : 411 Clients (dont 417 Clients, retenues de garantie), 412 Clients, effets à recevoir en portefeuille, 413 Clients, chèques, effets et autres valeurs impayées, 414 Créances sur cessions courantes d'immobilisations, 415 Clients, effets escomptés non échus, 416 Créances clients litigieuses ou douteuses, 418 Clients, produits à recevoir, 419 Clients créditeurs. Un même tiers peut être client et fournisseur : seules ses opérations de vente figurent ici.",
    source: 'AUDCIF, Titre VII ch. 3, compte 41',
  },
} satisfies Record<string, EntreeLexique>;

export type CleLexique = keyof typeof LEXIQUE;

/**
 * L'ENTRÉE À SERVIR POUR UN SUJET DONNÉ, SELON LE RÉFÉRENTIEL DU DOSSIER.
 *
 * Douze fenêtres sont communes aux deux référentiels (brouillard, import,
 * régularisation, devises, relances, tiers, plans et états analytiques…) et
 * appelaient toutes `LEXIQUE[sujet]` en dur. Une entreprise lisait donc, dans
 * la bulle de son propre écran, que « le SYCEBNL veut les journaux centralisés
 * chaque semaine », que le compte 41 porte des adhérents, ou qu'on ne relance
 * pas des clients mais des membres pour une cotisation. Rien ne cassait : une
 * définition fausse s'affiche aussi bien qu'une vraie.
 *
 * La convention est volontairement mécanique : pour un sujet `x`, si le
 * dossier est tenu en SYSCOHADA et qu'une entrée `xSyscohada` existe, c'est
 * elle qui sort. Un écran commun n'a donc rien à changer à son appel, et un
 * sujet sans pendant reste servi tel quel · c'est le cas voulu des entrées
 * neutres (contrôle de caisse, lettrage, exercice clos) comme des entrées
 * propres à un seul référentiel, qui ne sont posées que sur ses écrans.
 */
export function entreeLexique(cle: CleLexique, referentiel?: string): EntreeLexique {
  if (referentiel === 'SYSCOHADA') {
    const pendant = `${cle}Syscohada`;
    if (pendant in LEXIQUE) return LEXIQUE[pendant as CleLexique];
  }
  return LEXIQUE[cle];
}

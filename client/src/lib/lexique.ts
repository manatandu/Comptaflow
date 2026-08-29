/**
 * LEXIQUE SYCEBNL · le contenu des bulles d'aide « ? » posées dans les
 * fenêtres. Chaque entrée reprend la définition du référentiel (Acte uniforme
 * relatif au système comptable des entités à but non lucratif, Niamey,
 * 22 décembre 2022, applicable au 1er janvier 2024) : glossaire de la
 * Partie 1 ch. 1, fonctionnement des comptes de la Partie 2 ch. 3, et
 * présentation des états financiers de la Partie 4.
 *
 * C'est la valeur ajoutée qu'aucun logiciel généraliste n'apporte : le
 * comptable d'une association n'a pas à ouvrir le Journal officiel pour
 * savoir ce qu'est un fonds affecté ou pourquoi le TFT est en méthode
 * directe · la réponse est dans l'écran, à l'endroit exact où la question
 * se pose.
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
    source: 'Contrôles de cohérence · SYCEBNL et AUDCIF',
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
} satisfies Record<string, EntreeLexique>;

export type CleLexique = keyof typeof LEXIQUE;

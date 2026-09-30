/**
 * LE LIVRE DE PAIE ET LE DÉCOMPTE ÉCRIT · ARTICLES 213 À 215 ET 103 DU CODE
 * DU TRAVAIL, ARTICLE 25 DE L'ARRÊTÉ MINISTÉRIEL n° 146/2018.
 *
 * CE FICHIER NE TIENT PAS UN LIVRE DE PAIE. Il dit ce que le livre et le
 * décompte doivent porter, il vérifie ce qu'un document proposé porte
 * réellement, et IL REFUSE DE CERTIFIER UNE CONFORMITÉ qu'il n'est pas en
 * état d'établir. La différence entre les deux est tout l'objet du fichier.
 *
 * ────────────────────────────────────────────────────────────────────────
 * CE QUE LES TEXTES DISENT, VERBATIM.
 *
 * ART. 213 · « Tout employeur, autre que celui qui occupe exclusivement du
 * personnel domestique doit tenir un livre de paie DANS CHACUN DES SIÈGES
 * D'EXPLOITATION de l'entreprise, pour les travailleurs, quelle que soit la
 * nature ou la durée de leur engagement. Le livre de paie doit consigner, à
 * chaque paie, TOUTE SOMME QUELCONQUE attribuée à titre de rémunération. »
 *
 * ART. 214 · « Le livre de paie se compose de feuilles numérotées de manière
 * continue, chacune d'elles comportant AU MOINS DEUX DOUBLES DÉTACHABLES
 * dont la destination est fixée par l'arrêté ministériel conformément à
 * l'article 103 du présent Code. »
 *
 * ART. 215 · « Le livre de paie doit être conforme au MODÈLE FIXÉ PAR ARRÊTÉ
 * du Ministre ayant le Travail et la Prévoyance Sociale dans ses
 * attributions. Dans les entreprises ou établissements dont la comptabilité
 * est tenue par une méthode de décalque ou DE GESTION AUTOMATISÉE,
 * L'INSPECTEUR DU TRAVAIL PEUT AUTORISER le remplacement du livre de paie
 * par tout autre document, pour autant que les mentions essentielles soient
 * conformes à celles reprises dans l'arrêté prévu au premier alinéa du
 * présent article. Les employeurs occupant habituellement moins de
 * VINGT-CINQ travailleurs pourront utiliser un livre de paie INSPIRÉ du
 * modèle fixé. »
 *
 * ART. 103 · « L'employeur est tenu de remettre au travailleur au moment du
 * paiement et selon les modalités fixées par arrêté […] un décompte écrit de
 * la rémunération payée. FAUTE PAR L'EMPLOYEUR D'AVOIR REMPLI CETTE
 * OBLIGATION, SES ALLÉGATIONS CONCERNANT LE DÉCOMPTE DES PAIEMENTS EFFECTUÉS
 * SONT REJETÉES à moins qu'il ne prouve qu'il ne lui a pas été possible de
 * remettre le décompte par la faute du travailleur ou qu'il n'y ait preuve
 * écrite, commencement de preuve par écrit ou aveu du travailleur. »
 * ────────────────────────────────────────────────────────────────────────
 *
 * L'ALINÉA 2 DE L'ARTICLE 215 VISE EXACTEMENT LE CAS D'OMEGAX, ET C'EST LA
 * SEULE BONNE NOUVELLE DE CE FICHIER. Un logiciel de paie est une « gestion
 * automatisée » au sens du texte, et le livre papier peut alors être remplacé
 * par tout autre document. MAIS LA PHRASE PORTE DEUX CONDITIONS, pas une :
 *  · une AUTORISATION de l'Inspecteur du Travail, qui est un acte, pas une
 *    faculté que l'employeur s'accorde ;
 *  · des MENTIONS ESSENTIELLES CONFORMES À CELLES DE L'ARRÊTÉ du premier
 *    alinéa.
 * Sans l'autorisation, l'automatisation ne dispense de rien.
 *
 * ────────────────────────────────────────────────────────────────────────
 * L'ARRÊTÉ DU MODÈLE EST AU CORPUS DEPUIS LE 19/09/2026, ET IL CORRIGE CE
 * FICHIER SUR CINQ POINTS.
 *
 * Arrêté ministériel n° 12/CAB.MIN/ETPS/042 du 8 août 2008, Journal officiel
 * du 15 août 2008, sept articles et une annexe, signé Marie Ange Lukiana
 * Mufwankolo. Il ABROGE l'arrêté n° 17/67 du 3 octobre 1967 que l'on trouve
 * encore en ligne. Ce fichier avait été écrit à partir du seul Code, et la
 * confrontation l'a pris en défaut cinq fois.
 *
 *  1. LE FICHIER INFORMATISÉ EST ADMIS DÈS L'ARTICLE 1er · « Le livre de paie
 *     OU FICHIER INFORMATISÉ, dont la tenue est prescrite par l'article 213 ».
 *     Ce n'est donc pas « un autre document » qui remplacerait le livre au
 *     sens de l'article 215 alinéa 2 : c'est UNE FORME DU LIVRE, sans
 *     autorisation préalable. Ce fichier exigeait l'autorisation de
 *     l'Inspecteur dans tous les cas. C'ÉTAIT FAUX, et cela refusait à un
 *     cabinet informatisé une faculté que le texte lui donne.
 *  2. LES MENTIONS SONT TRENTE-TROIS, PAS TRENTE, et ce ne sont pas celles de
 *     l'article 25 de l'arrêté n° 146/2018. Ce fichier prenait la liste de la
 *     sécurité sociale pour le modèle du livre de paie, faute d'avoir l'autre.
 *  3. TROIS MENTIONS SONT DES FORMULES DE SOMME · la 20 (brut), la 26 (total
 *     des déductions) et la 28 (jours ouvrant droit aux allocations). Le
 *     modèle ferme donc l'arithmétique de la feuille · et il n'est PAS le
 *     seul (passe D2) : l'arrêté ministériel n° 142/2018, art. 12, impose au
 *     bordereau ou bulletin de paie trente-trois mentions avec les MÊMES
 *     trois formules (`MENTIONS_ARRETE_142_2018`). La formule du brut laisse
 *     les allocations familiales dehors dans les deux textes ; celui de 2018
 *     les dit « extra-légales ».
 *  4. LE SEUIL DU LIVRE « INSPIRÉ DU MODÈLE » EST DE DIX dans l'arrêté, et de
 *     VINGT-CINQ dans l'article 215 alinéa 3 du Code. Contradiction réelle,
 *     traitée plus bas · la loi prime, et le code garde vingt-cinq.
 *  5. L'ARTICLE 2 RÈGLE DEUX CHOSES QUE LE CODE RENVOYAIT À L'ARRÊTÉ · la
 *     destination des deux doubles de l'article 214 (un au travailleur, un à
 *     l'Institut National de Sécurité Sociale), et un DÉCOMPTE ÉCRIT DES
 *     PAIEMENTS EFFECTUÉS dû « lors de la résiliation du contrat, pour quelque
 *     cause que ce soit », EN PLUS du bulletin de chaque paie. L'article 103
 *     lu seul ne laissait pas deviner cette seconde échéance.
 *
 * CE QUE LE FICHIER CONTINUE DE REFUSER, et pour une raison qui a changé.
 * L'article 1er exige DEUX choses : les trente-trois énonciations, et la
 * conformité AU MODÈLE ANNEXÉ, qui est une mise en forme. OmegaX sait
 * vérifier les énonciations sur déclaration ; il ne sait pas vérifier qu'un
 * document a la forme du tableau annexé. La conformité au modèle n'est donc
 * toujours pas certifiée, mais ce n'est plus parce que le modèle est inconnu.
 */

/**
 * Article 215 alinéa 3 du CODE · le seuil du livre « inspiré du modèle ».
 * C'EST CELUI-CI QUI EST OPPOSABLE, voir RESERVE_CONTRADICTION_DE_SEUIL.
 */
export const EFFECTIF_LIVRE_INSPIRE = 25;

/** Article 1er de l'ARRÊTÉ de 2008 · le même seuil, mais à dix. */
export const EFFECTIF_LIVRE_INSPIRE_ARRETE = 10;

export const RESERVE_CONTRADICTION_DE_SEUIL =
  "CONTRADICTION DE SEUIL · l'article 215, alinéa 3, du Code laisse le livre « inspiré du modèle » aux " +
  "employeurs de MOINS DE VINGT-CINQ travailleurs ; l'article 1er de l'arrêté n° 12/CAB.MIN/ETPS/042 du " +
  "8 août 2008 impose la conformité au modèle dès DIX travailleurs et ne laisse le livre inspiré qu'en " +
  "dessous de dix. Pour un effectif de dix à vingt-quatre, les deux textes disent le contraire. UN ARRÊTÉ NE " +
  "DÉROGE PAS À LA LOI, et l'article 215 n'a pas été modifié par la loi n° 16/010 du 15 juillet 2016 : OmegaX " +
  "retient VINGT-CINQ. Le seuil de l'arrêté reste à connaître, parce que c'est celui que l'inspection applique.";

/** Article 214 · « au moins deux doubles détachables ». */
export const DOUBLES_DETACHABLES_MINIMUM = 2;

/**
 * L'ARRÊTÉ DU MODÈLE · sa référence, et ce qu'OmegaX en tire. Il est au
 * corpus depuis P6 (`lu: true`) ; `pourquoi` dit ce qui reste non certifié.
 */
export const ARRETE_DU_MODELE = {
  reference: "Arrêté ministériel n° 12/CAB.MIN/ETPS/042 du 8 août 2008",
  objet: "fixant le modèle de livre de paie et de décompte écrit de la rémunération",
  publie:
    "Journal officiel de la République Démocratique du Congo, première partie, 49ème année, n° 16, 15 août 2008",
  signataire: 'Marie Ange Lukiana Mufwankolo',
  viseParLeCodeDuTravail: ['article 103', 'article 214', 'article 215'],
  abroge: "Arrêté ministériel n° 17/67 du 3 octobre 1967",
  avisDuConseilNationalDuTravail: 'troisième session extraordinaire, 25 mars au 8 avril 2008',
  lu: true,
  pourquoi:
    "AU CORPUS DEPUIS LE 19/09/2026, texte intégral et annexe. OmegaX restitue donc ses trente-trois " +
    "énonciations et ses trois formules de total. Il ne certifie toujours pas la conformité AU MODÈLE ANNEXÉ, " +
    "qui est une mise en forme et non une liste · voir RESERVE_MISE_EN_FORME.",
} as const;

export type MentionFeuilleDePaie = {
  /**
   * Le rang de la mention dans SA liste · de 1 à 30 à l'article 25 de l'arrêté
   * n° 146/2018, de 1 à 33 à l'article 1er de l'arrêté de 2008.
   */
  readonly rang: number;
  /** Le libellé du texte, recopié. */
  readonly libelle: string;
};

/**
 * LES TRENTE MENTIONS DE L'ARTICLE 25 DE L'ARRÊTÉ n° 146/2018, RECOPIÉES.
 * « La feuille de paie doit comporter notamment les mentions ci-après ».
 * Le mot « NOTAMMENT » est dans le texte · la liste n'est pas fermée, et un
 * document qui les porte toutes n'est pas pour autant complet.
 */
export const MENTIONS_ARTICLE_25: readonly MentionFeuilleDePaie[] = [
  { rang: 1, libelle: 'nom du travailleur' },
  { rang: 2, libelle: 'emploi et catégorie professionnelle' },
  { rang: 3, libelle: "numéro d'immatriculation attribué par la Caisse" },
  { rang: 4, libelle: 'salaire horaire, journalier ou mensuel' },
  { rang: 5, libelle: "nombre d'heures ou de jours pour lesquels le salaire est payé" },
  {
    rang: 6,
    libelle: 'rémunération totale à payer pour la période à laquelle se rapporte le décompte',
  },
  { rang: 7, libelle: 'taux auxquels sont payées les heures supplémentaires effectuées' },
  { rang: 8, libelle: 'montant total à payer pour les heures supplémentaires' },
  {
    rang: 9,
    libelle:
      'suppléments éventuellement payés pour le travail du dimanche et des jours fériés légaux',
  },
  { rang: 10, libelle: 'primes éventuelles' },
  {
    rang: 11,
    libelle:
      "arriérés de rémunération portés sous la rubrique divers et accompagnés le cas échéant, d'une note sous la rubrique observation",
  },
  { rang: 12, libelle: 'nombre de jours de congés payés' },
  { rang: 13, libelle: 'taux journalier des allocations de congé' },
  { rang: 14, libelle: 'total des allocations dues pour le congé' },
  {
    rang: 15,
    libelle:
      "nombre de jours pour lesquels le salaire est payé aux deux tiers en cas de maladie ou d'accident et de congé de maternité",
  },
  { rang: 16, libelle: "taux journalier de salaire en cas de maladie ou d'accident" },
  { rang: 17, libelle: "total du salaire pour les journées d'incapacité" },
  { rang: 18, libelle: 'total de la rémunération brute' },
  { rang: 19, libelle: 'cotisation retenue à charge du travailleur pour la pension' },
  { rang: 20, libelle: 'montant des indemnités compensatoires' },
  { rang: 21, libelle: "montant de l'avance hebdomadaire ou autre" },
  {
    rang: 22,
    libelle: 'déductions pour motifs divers accompagnés d’une note dans la rubrique fiscale',
  },
  { rang: 23, libelle: 'retenue fiscale' },
  { rang: 24, libelle: 'total des déductions' },
  { rang: 25, libelle: "nombre d'enfants pour lesquels les allocations familiales sont dues" },
  { rang: 26, libelle: 'nombre de jours donnant droit à des allocations familiales' },
  { rang: 27, libelle: 'taux journalier des allocations familiales' },
  { rang: 28, libelle: 'montant à payer' },
  { rang: 29, libelle: 'montant pris en considération pour le calcul des cotisations' },
  { rang: 30, libelle: 'observations' },
] as const;

// Deux réserves vivaient ici, lues par les seuls tests (audit du serveur, C2).
// « NOTAMMENT » rappelait que la liste de l'art. 25 n'est pas fermée ; la
// seconde disait l'arrêté de 2008 « identifié mais NON LU », ce qui est faux
// depuis P6 · ses trente-trois énonciations sont juste en dessous. Ce qui en
// reste de vrai tient en une phrase : la liste ci-dessus est celle de la
// SÉCURITÉ SOCIALE (arrêté n° 146/2018), gardée pour qu'on ne la confonde
// jamais avec le modèle du livre de paie · aucun calcul ne la sert.

/**
 * LES TRENTE-TROIS ÉNONCIATIONS DE L'ARTICLE 1er DE L'ARRÊTÉ DE 2008,
 * RECOPIÉES. « Il doit contenir les énonciations ci-après » · la liste est
 * FERMÉE, à la différence de l'article 25 de l'arrêté n° 146/2018, qui dit
 * « notamment ».
 */
export const MENTIONS_MODELE_2008: readonly MentionFeuilleDePaie[] = [
  { rang: 1, libelle: "le numéro d'ordre du travailleur, s'il lui en est attribué un dans l'établissement ou l'entreprise" },
  { rang: 2, libelle: "les noms et prénoms du travailleur, en majuscules d'imprimerie" },
  { rang: 3, libelle: "l'emploi et la catégorie professionnelle" },
  { rang: 4, libelle: "le numéro d'affiliation à l'Institut National de Sécurité Sociale" },
  { rang: 5, libelle: 'le salaire horaire, journalier ou mensuel' },
  { rang: 6, libelle: "le nombre d'heures ou de jours pour lesquels le salaire est payé à 100 %" },
  { rang: 7, libelle: 'la rémunération totale à payer de ce chef pour la période à laquelle se rapporte le décompte' },
  { rang: 8, libelle: "le nombre d'heures supplémentaires prestées" },
  { rang: 9, libelle: 'les taux auxquels sont payées les heures supplémentaires' },
  { rang: 10, libelle: 'le montant total à payer pour les heures supplémentaires' },
  { rang: 11, libelle: 'les suppléments éventuellement payés pour le travail du samedi, du dimanche et des jours fériés légaux' },
  { rang: 12, libelle: 'les primes éventuelles' },
  { rang: 13, libelle: "les arriérés de rémunération, portés sous la rubrique « divers » et accompagnés, le cas échéant, d'une note sous la rubrique « observations »" },
  { rang: 14, libelle: 'le nombre de jours de congés payés' },
  { rang: 15, libelle: "le taux journalier de l'allocation de congé" },
  { rang: 16, libelle: "le total de l'allocation due pour le congé" },
  { rang: 17, libelle: "le nombre de jours pour lesquels le salaire est payé aux deux tiers en cas de maladie ou d'accident" },
  { rang: 18, libelle: "le taux journalier de salaire, en cas de maladie ou d'accident" },
  { rang: 19, libelle: "le total du salaire pour les journées d'incapacité" },
  { rang: 20, libelle: "le total de la rémunération brute, c'est-à-dire, le total des mentions visées ci-dessus sous les numéros 7, 10, 11, 12, 13, 16 et 19" },
  { rang: 21, libelle: 'la cotisation retenue à charge du travailleur pour la pension' },
  { rang: 22, libelle: 'le montant des indemnités compensatrices' },
  { rang: 23, libelle: "le montant des avances hebdomadaires ou autres" },
  { rang: 24, libelle: "les déductions pour motifs divers, accompagnés d'une note dans la rubrique « observations »" },
  { rang: 25, libelle: 'la retenue fiscale' },
  { rang: 26, libelle: "le total des déductions, c'est-à-dire, le total des montants visés sous les numéros 21, 22, 23, 24 et 25 ci-dessus" },
  { rang: 27, libelle: "le nombre d'enfants pour lesquels les allocations familiales sont dues" },
  { rang: 28, libelle: "le nombre de jours donnant droit à des allocations familiales, c'est-à-dire, le total des nombres visés ci-dessus sous les numéros 6, 14 et 17" },
  { rang: 29, libelle: 'le taux journalier des allocations familiales' },
  { rang: 30, libelle: 'le montant total des allocations familiales à payer' },
  { rang: 31, libelle: 'le montant net à payer' },
  { rang: 32, libelle: 'le montant pris en considération pour le calcul des cotisations de sécurité sociale à payer' },
  { rang: 33, libelle: 'les observations' },
] as const;

/**
 * LES TROIS FORMULES DE SOMME DU MODÈLE. L'arrêté n° 142/2018, art. 12, porte
 * les mêmes (20, 26, 28) · il était dit ici que 2008 était « le seul texte du
 * corpus » à fermer l'arithmétique d'une feuille de paie, lacune déclarée à
 * tort, vérifiée contre le module et non contre le corpus (passe D2).
 *
 * LA PREMIÈRE VAUT DÉMONSTRATION · le brut est la somme des mentions 7, 10,
 * 11, 12, 13, 16 et 19. LES ALLOCATIONS FAMILIALES (27 à 30) N'Y SONT PAS,
 * et les indemnités compensatrices (22) sont en déduction. Le modèle officiel
 * corrobore donc, par sa seule arithmétique, l'exclusion de l'article 7
 * litera h du Code du travail. RÉSERVE · l'arrêté de 2018 qualifie ces
 * allocations d'« extra-légales » (mentions 27 à 30), ce que 2008 ne dit pas ·
 * la démonstration vaut pour les allocations que chaque texte nomme.
 */
export const FORMULES_DU_MODELE = {
  /** Mention 20 · le total de la rémunération brute. */
  brut: { rang: 20, composantes: [7, 10, 11, 12, 13, 16, 19] },
  /** Mention 26 · le total des déductions. */
  totalDesDeductions: { rang: 26, composantes: [21, 22, 23, 24, 25] },
  /** Mention 28 · les jours ouvrant droit aux allocations familiales. */
  joursDAllocationsFamiliales: { rang: 28, composantes: [6, 14, 17] },
} as const;

/** Article 2 de l'arrêté · la destination des deux doubles de l'article 214. */
export const DESTINATION_DES_DOUBLES = {
  premier:
    "au TRAVAILLEUR, à chaque paie · c'est le bulletin de paie écrit de la rémunération payée, « constitué par un des doubles du livre de paie prévus à l'article 214 du Code du Travail »",
  // L'arrêté de 2008 écrit « l'Institut National de Sécurité Sociale ».
  // L'organisme est la CNSS depuis le décret n° 18/027 du 14 juillet 2018 ·
  // l'écran ne sert pas un organisme renommé (passe D2), le libellé de
  // l'arrêté va dans l'aide (`TEXTE_ARTICLE_2_SECOND_DOUBLE`).
  second: 'à la CNSS, selon la réglementation en vigueur',
} as const;

/** Le libellé de l'arrêté de 2008, art. 2, pour l'aide de l'écran. */
export const TEXTE_ARTICLE_2_SECOND_DOUBLE =
  "Arrêté n° 12/CAB.MIN/ETPS/042 du 8 août 2008, art. 2 : « Le second double est à remettre à l'Institut National de Sécurité Sociale, selon la réglementation en vigueur. » L'Institut est devenu la Caisse nationale de sécurité sociale par le décret n° 18/027 du 14 juillet 2018.";

/**
 * LE SECOND TEXTE · arrêté ministériel n° 142/2018 déterminant les modalités
 * d'application du mois d'assurance (J.O., numéro spécial du 5 décembre
 * 2018), art. 10 et 12. L'art. 10 redit le décompte écrit « à chaque paie
 * ainsi que lors de la résiliation du contrat de travail, pour quelque cause
 * que ce soit », sur « un bordereau de salaire ou un bulletin de paie » ;
 * l'art. 12 impose à ce bordereau ou bulletin les trente-trois mentions
 * ci-dessous, recopiées. Elles sont RESTITUÉES À CÔTÉ de celles de 2008, sans
 * trancher entre elles · l'art. 13 abroge les dispositions antérieures
 * « contraires », et dire lesquelles le sont est une qualification que ce
 * module ne fait pas.
 */
export const REFERENCE_ARRETE_142_2018 =
  "Arrêté ministériel n° 142/2018 déterminant les modalités d'application du mois d'assurance, art. 10 et 12";

export const MENTIONS_ARRETE_142_2018: readonly MentionFeuilleDePaie[] = [
  { rang: 1, libelle: "le matricule du travailleur, s'il lui en est attribué un dans l'établissement ou l'entreprise" },
  { rang: 2, libelle: 'le nom du travailleur' },
  { rang: 3, libelle: "l'emploi et la catégorie professionnelle" },
  { rang: 4, libelle: "le numéro d'immatriculation à la caisse de sécurité sociale" },
  { rang: 5, libelle: 'le salaire horaire, journalier ou mensuel' },
  { rang: 6, libelle: "le nombre d'heures ou de jours pour lesquels le salaire est payé à cent pour cent" },
  { rang: 7, libelle: 'la rémunération totale à payer de ce chef pour la période à laquelle se rapporte le décompte' },
  { rang: 8, libelle: "le nombre d'heures supplémentaires" },
  { rang: 9, libelle: 'les taux auxquels sont payées les heures supplémentaires' },
  { rang: 10, libelle: 'le montant total à payer pour les heures supplémentaires' },
  { rang: 11, libelle: 'les suppléments éventuellement payés pour le travail du dimanche et des jours fériés légaux' },
  { rang: 12, libelle: 'les primes éventuelles' },
  { rang: 13, libelle: "les arriérés de rémunération, portés sous la rubrique « divers » et accompagnés, le cas échéant, d'une note sous la rubrique « observation »" },
  { rang: 14, libelle: 'le nombre de jours de congé payés' },
  { rang: 15, libelle: "le taux journalier de l'allocation de congé" },
  { rang: 16, libelle: "le total de l'allocation due pour le congé en cas de maladie, d'accident et de congé de maternité" },
  { rang: 17, libelle: "le nombre de jours pour lesquels le salaire est payé aux deux tiers en cas de maladie, d'accident et de congé de maternité" },
  { rang: 18, libelle: "le taux journalier de salaire, en cas de maladie ou d'accident" },
  { rang: 19, libelle: "le total du salaire pour les journées d'incapacité" },
  { rang: 20, libelle: "le total de la rémunération brute, c'est-à-dire le total des mentions visées ci-dessus sous les numéros 7, 10, 11, 12, 13,16 et 19" },
  { rang: 21, libelle: 'la cotisation retenue à charge du travailleur pour la branche de pensions à la Caisse de sécurité sociale' },
  { rang: 22, libelle: 'le montant des indemnités compensatoires' },
  { rang: 23, libelle: 'le montant des avances hebdomadaires' },
  { rang: 24, libelle: 'les déductions pour motifs divers, accompagnées d’une note dans la rubrique fiscale' },
  { rang: 25, libelle: 'la retenue fiscale' },
  { rang: 26, libelle: "le total des déductions, c'est-à-dire le total des montants visés sous les numéros 21, 22, 23,24 et 25 ci-dessus" },
  { rang: 27, libelle: "le nombre d'enfants pour lesquels les allocations familiales extra-légales sont dues" },
  { rang: 28, libelle: "le nombre de jours donnant droit à des allocations familiales extra-légales, c'est-à-dire le total des nombres visés ci-dessus sous les numéros 6, 14 et 17" },
  { rang: 29, libelle: 'le taux journalier des allocations familiales extra-légales' },
  { rang: 30, libelle: 'le montant des allocations familiales extra-légales' },
  { rang: 31, libelle: 'le montant (net) à payer' },
  { rang: 32, libelle: 'le montant pris en considération pour le calcul des cotisations sociales' },
  { rang: 33, libelle: 'les observations' },
] as const;

/**
 * LES ÉCARTS ENTRE 2008 ET 2018, rang par rang, NOMMÉS SANS ÊTRE TRANCHÉS.
 * Les trois formules (20, 26, 28) sont identiques.
 */
export const ECARTS_2008_2018: readonly { rangs: string; ecart: string }[] = [
  { rangs: '4', ecart: "« caisse de sécurité sociale » en 2018, « Institut National de Sécurité Sociale » en 2008" },
  { rangs: '11', ecart: 'le samedi est nommé en 2008, pas en 2018' },
  { rangs: '16 et 17', ecart: 'le congé de maternité est ajouté en 2018' },
  { rangs: '24', ecart: 'la note va « dans la rubrique fiscale » en 2018, « observations » en 2008' },
  { rangs: '27 à 30', ecart: 'les allocations familiales sont dites « extra-légales » en 2018' },
] as const;

export const DECOMPTE_A_LA_RUPTURE =
  "ARTICLE 2, ALINÉA 3, DE L'ARRÊTÉ · « Lors de la résiliation du contrat de travail, POUR QUELQUE CAUSE QUE " +
  "CE SOIT, l'employeur doit remettre au travailleur un décompte écrit des payements effectués prévus à " +
  "l'article 103 du Code du Travail. » C'est une SECONDE échéance, qui s'ajoute au bulletin de chaque paie, et " +
  "que l'article 103 lu seul (« au moment du paiement ») ne laissait pas deviner. Elle joint le décompte final.";

export const EXIGENCE_INALTERABILITE =
  "ARTICLE 4 DE L'ARRÊTÉ · « QUELLE QUE SOIT LA FORME ADOPTÉE, le livre de paie et le décompte écrit de la " +
  "rémunération payée sont rédigés à l'encre ou à l'aide d'un procédé permettant d'obtenir une ÉCRITURE " +
  "INDÉLÉBILE. » Pour le fichier informatisé de l'article 1er, cela devient une exigence d'INALTÉRABILITÉ du " +
  "support, et elle est de 2008.";

export const SANCTION_ARTICLE_328 =
  "ARTICLE 328 a) DU CODE · pour les infractions à l'article 215, « l'amende est appliquée AUTANT DE FOIS " +
  "QU'IL Y A DE TRAVAILLEURS NON INSCRITS OU DE RENSEIGNEMENTS OMIS ». Une mention manquante se multiplie donc " +
  "par l'effectif, le total ne pouvant excéder cinquante fois le taux maximum. L'article 5 de l'arrêté vise " +
  "aussi « l'article 323 (9) », qui n'existe pas : l'article 323 énumère des cas a) à e). Anomalie du texte " +
  "officiel, signalée et non corrigée.";

export const RESERVE_MISE_EN_FORME =
  "L'article 1er exige DEUX choses : les trente-trois énonciations, ET la conformité AU MODÈLE ANNEXÉ, qui est " +
  "une mise en forme. OmegaX vérifie les énonciations sur déclaration ; il ne sait pas vérifier qu'un document " +
  "a la forme du tableau annexé. La conformité au modèle n'est donc jamais certifiée ici.";

export type MotifRefusLivre =
  | 'MISE_EN_FORME_NON_VERIFIABLE'
  | 'AUTORISATION_INSPECTEUR_ABSENTE'
  | 'SIEGE_DEXPLOITATION_NON_DESIGNE'
  | 'ENONCIATIONS_INCOMPLETES';

/**
 * La forme que prend le document. L'article 1er de l'arrêté met le FICHIER
 * INFORMATISÉ sur le même plan que le livre · seul un TROISIÈME type de
 * document tombe sous l'autorisation de l'article 215, alinéa 2.
 */
export type FormeDuDocument = 'LIVRE_PAPIER' | 'FICHIER_INFORMATISE' | 'AUTRE_DOCUMENT';

export type EntreeLivreDePaie = {
  /** Article 213 · un livre PAR siège d'exploitation. */
  readonly siegeDExploitation?: string | null;
  /**
   * La forme adoptée. Absente, OmegaX ne suppose pas le fichier informatisé :
   * il retient AUTRE_DOCUMENT, qui est le cas le plus exigeant. Supposer la
   * forme la plus favorable dispenserait d'une autorisation qui est due.
   */
  readonly formeDuDocument?: FormeDuDocument | null;
  /** Article 215 alinéa 2 · l'autorisation de l'Inspecteur du Travail. */
  readonly autorisationInspecteurDuTravail?: boolean | null;
  /** Article 215 alinéa 3 · l'effectif habituel de l'établissement. */
  readonly effectifHabituel?: number | null;
  /** Les rangs du modèle de 2008 que le document proposé porte réellement. */
  readonly mentionsPortees?: readonly number[];
  /** Article 213 · l'employeur occupe-t-il exclusivement du personnel domestique ? */
  readonly exclusivementPersonnelDomestique?: boolean;
};

export type VerdictLivreDePaie = {
  /** Article 213 · le livre est-il seulement dû ? */
  readonly livreDu: boolean;
  /**
   * Le document tient-il lieu de livre de paie ? Vrai pour le livre papier et
   * pour le FICHIER INFORMATISÉ, que l'article 1er de l'arrêté admet ; pour
   * tout autre document, seulement avec l'autorisation de l'article 215 al. 2.
   */
  readonly remplacementAutorise: boolean;
  /** Les trente-trois énonciations de l'article 1er sont-elles toutes portées ? */
  readonly enonciationsCompletes: boolean;
  /** Article 215 alinéa 3 · le régime allégé joue-t-il ? */
  readonly livreInspireAdmis: boolean;
  readonly mentionsPorteesCount: number;
  readonly mentionsManquantes: readonly MentionFeuilleDePaie[];
  /**
   * JAMAIS `true` · l'article 1er exige aussi la conformité au MODÈLE ANNEXÉ,
   * qui est une mise en forme, et une liste de mentions ne la prouve pas.
   */
  readonly conformiteAuModeleCertifiee: false;
  readonly refus: readonly { motif: MotifRefusLivre; explication: string }[];
  readonly reserves: readonly string[];
};

export function livreDePaie(entree: EntreeLivreDePaie): VerdictLivreDePaie {
  const refus: { motif: MotifRefusLivre; explication: string }[] = [];
  const reserves: string[] = [
    RESERVE_MISE_EN_FORME,
    RESERVE_CONTRADICTION_DE_SEUIL,
    EXIGENCE_INALTERABILITE,
    DECOMPTE_A_LA_RUPTURE,
    SANCTION_ARTICLE_328,
  ];

  // La mise en forme ne se vérifie pas depuis une liste · ce refus est
  // permanent et ne dépend d'aucune saisie, comme l'était celui du modèle non
  // lu avant que l'arrêté n'arrive. Le motif a changé, pas la retenue.
  refus.push({
    motif: 'MISE_EN_FORME_NON_VERIFIABLE',
    explication: RESERVE_MISE_EN_FORME,
  });

  const livreDu = !entree.exclusivementPersonnelDomestique;

  if (livreDu && !entree.siegeDExploitation) {
    refus.push({
      motif: 'SIEGE_DEXPLOITATION_NON_DESIGNE',
      explication:
        "ARTICLE 213 · le livre se tient « DANS CHACUN DES SIÈGES D'EXPLOITATION de l'entreprise ». Un seul " +
        "livre pour plusieurs sièges ne satisfait pas le texte, et OmegaX ne sait pas à quel siège rattacher " +
        "ce document tant que le siège n'est pas désigné.",
    });
  }

  // ARTICLE 1er DE L'ARRÊTÉ · le fichier informatisé EST une forme du livre.
  // L'autorisation de l'article 215 alinéa 2 ne vise que « TOUT AUTRE
  // DOCUMENT ». Absence de réponse sur la forme = le cas le plus exigeant.
  const forme: FormeDuDocument = entree.formeDuDocument ?? 'AUTRE_DOCUMENT';
  const formeAdmiseDOffice = forme === 'LIVRE_PAPIER' || forme === 'FICHIER_INFORMATISE';
  const autorisation = entree.autorisationInspecteurDuTravail === true;

  if (livreDu && !formeAdmiseDOffice && !autorisation) {
    refus.push({
      motif: 'AUTORISATION_INSPECTEUR_ABSENTE',
      explication:
        "ARTICLE 215 ALINÉA 2 · le remplacement du livre de paie par « TOUT AUTRE DOCUMENT » suppose que " +
        "« L'INSPECTEUR DU TRAVAIL PEUT AUTORISER » ce remplacement. L'autorisation est un ACTE à obtenir et à " +
        "conserver au dossier. ELLE N'EST PAS DUE POUR UN FICHIER INFORMATISÉ · l'article 1er de l'arrêté du " +
        "8 août 2008 vise « le livre de paie OU FICHIER INFORMATISÉ », qui est donc une forme du livre et non " +
        "un autre document. Déclarer la forme adoptée lève ce refus quand elle est l'une des deux.",
    });
  }

  const portees = new Set(entree.mentionsPortees ?? []);
  const mentionsManquantes = MENTIONS_MODELE_2008.filter((m) => !portees.has(m.rang));
  const enonciationsCompletes = mentionsManquantes.length === 0;

  if (livreDu && !enonciationsCompletes) {
    refus.push({
      motif: 'ENONCIATIONS_INCOMPLETES',
      explication:
        `ARTICLE 1er DE L'ARRÊTÉ · ${mentionsManquantes.length} des ${MENTIONS_MODELE_2008.length} ` +
        "énonciations ne sont pas portées, et la liste est FERMÉE (« il doit contenir les énonciations " +
        "ci-après »). " +
        SANCTION_ARTICLE_328,
    });
  }

  return {
    livreDu,
    remplacementAutorise: livreDu && (formeAdmiseDOffice || autorisation),
    enonciationsCompletes,
    livreInspireAdmis:
      typeof entree.effectifHabituel === 'number' && entree.effectifHabituel < EFFECTIF_LIVRE_INSPIRE,
    mentionsPorteesCount: MENTIONS_MODELE_2008.length - mentionsManquantes.length,
    mentionsManquantes,
    conformiteAuModeleCertifiee: false,
    refus,
    reserves,
  };
}

/**
 * LE DÉCOMPTE ÉCRIT DE L'ARTICLE 103, ET SA SANCTION PROBATOIRE.
 *
 * Cet alinéa 2 est le plus lourd du Titre V pour un cabinet : sans décompte
 * remis, « SES ALLÉGATIONS CONCERNANT LE DÉCOMPTE DES PAIEMENTS EFFECTUÉS
 * SONT REJETÉES ». L'employeur qui a payé mais n'a rien remis est réputé ne
 * pas avoir payé, sauf les trois échappatoires du texte. Ce n'est pas une
 * amende, c'est un renversement de la charge de la preuve.
 */
export const SANCTION_ARTICLE_103 =
  "ARTICLE 103 ALINÉA 2 · faute d'avoir remis au travailleur un décompte écrit AU MOMENT DU PAIEMENT, les " +
  "allégations de l'employeur sur les paiements effectués SONT REJETÉES. Trois échappatoires seulement : la " +
  "faute du travailleur rendant la remise impossible, une preuve écrite ou un commencement de preuve par " +
  "écrit, ou l'aveu du travailleur. Un paiement réel mais non décompté se plaide donc comme un non-paiement.";

export const RESERVE_ARTICLE_104 =
  "ARTICLE 104 · l'acceptation sans réserve du décompte, la signature du travailleur et la mention « pour " +
  "solde de tout compte » NE VALENT PAS renonciation à ses droits, ni compte arrêté et réglé au sens de " +
  "l'article 317. Un décompte signé ne clôt rien.";

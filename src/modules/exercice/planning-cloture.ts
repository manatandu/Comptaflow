/**
 * Planning de clôture · l'état prévisionnel des travaux de fin d'exercice.
 *
 * Source : CPCC, SHEKOMBO SHUNGU John, « Notes de cours d'organisation
 * comptable », novembre 2020, § 2.3 (calendrier annuel du chef comptable) et
 * § 7.1 (les dix étapes des travaux de fin d'exercice). Le cours écrit :
 *
 *   « La pratique largement observée veut que le Chef comptable propose
 *   d'abord au Directeur financier un planning de clôture. Celui-ci est un
 *   état prévisionnel des différents travaux à exécuter préalablement à la
 *   publication, sous la forme légale ou normalisée, des états financiers. »
 *
 * Ce cours est écrit pour l'AUDCIF et le SYSCOHADA, et date d'avant
 * l'applicabilité du SYCEBNL (1er janvier 2024). Les dix étapes, elles, sont
 * indépendantes du référentiel et sont reprises telles quelles ; ce qui touche
 * au CONTENU des états a été réécrit pour le SYCEBNL et pour une EBNL
 * congolaise (jeu d'états de l'article 4, livre d'inventaire de l'article 14,
 * registre des donateurs des articles 17-18, auditeur des articles 19-22).
 * Voir docs/organisation-comptable-cpcc.md, § 2.3 et § 6.
 *
 * CORRECTION DU 29/08/2026, ET C'EST LE POINT LE PLUS IMPORTANT DE CE FICHIER.
 * La première version portait un jalon « Déclaration annuelle à la DGI »
 * présenté comme le dépôt des états financiers, et un jalon « Dépôt au RCCM ».
 * Les deux étaient faux pour une EBNL congolaise :
 *
 *  - UNE ASBL NE DÉPOSE PAS SES ÉTATS FINANCIERS À LA DGI. Ce qu'elle doit à
 *    l'administration fiscale, ce sont ses DÉCLARATIONS (retenues reversées,
 *    déclarations à zéro comprises) et la tenue d'une comptabilité régulière
 *    que la DGI peut contrôler. Contrôler n'est pas recevoir un dépôt annuel.
 *    Le compte annuel se dépose au MINISTÈRE DE LA JUSTICE, ministère de
 *    tutelle, et aux autorités administratives locales du siège.
 *  - UNE ASBL N'EST PAS COMMERÇANTE (art. 1er de la loi 004/2001) et n'est
 *    donc pas immatriculée au RCCM. Le jalon RCCM ne vaut que pour un dossier
 *    tenu en SYSCOHADA.
 *
 * L'erreur venait de la source : le cours du CPCC décrit le circuit d'une
 * entreprise commerciale SYSCOHADA. Le transposer à une EBNL sans le
 * confronter au droit des ASBL était exactement ce qu'il ne fallait pas faire.
 * Voir docs/obligations-annuelles-ebnl-rdc.md pour le détail et les sources.
 *
 * CORRECTION DU 02/09/2026 · LE TRONC COMMUN N'EN ÉTAIT PAS UN.
 * La phrase ci-dessus (« les dix étapes sont indépendantes du référentiel et
 * sont reprises telles quelles ») était vraie de leur INTITULÉ et fausse de
 * leur contenu. Le détail de sept d'entre elles était rédigé en vocabulaire et
 * en articles SYCEBNL, puis servi tel quel à un dossier SYSCOHADA : dons en
 * nature à l'inventaire physique, fonds affectés et fonds reportés aux
 * écritures d'inventaire, excédent et compte d'exploitation à la détermination
 * du résultat, tableau emplois-ressources aux états financiers, exemption
 * d'impôt sur les sociétés aux déclarations fiscales, auditeur des articles 19
 * à 22 du SYCEBNL, rapport d'activité de l'article 16-3 à l'approbation. Deux
 * jalons manquaient à l'inverse au SYSCOHADA, alors que leur fondement est
 * dans l'AUDCIF ou dans le cours lui-même : le livre d'inventaire (art. 19) et
 * le dépôt au CPCC.
 *
 * Chacune de ces étapes porte donc désormais DEUX jalons, un par référentiel,
 * sous le MÊME numéro d'étape · les deux ne peuvent jamais coexister puisque
 * leurs `referentiels` sont disjoints, et la numérotation reste comparable
 * d'un référentiel à l'autre. Un spec vérifie cette disjonction.
 *
 * AUCUN MONTANT ICI. Le cours cite deux arrêtés fixant des astreintes par jour
 * de retard sans en donner les taux ; un taux de 2013 non revérifié n'a rien à
 * faire dans un logiciel de 2026. Les jalons nomment les textes, le comptable
 * garde le chiffre. Même règle que src/modules/retenues/correspondance-retenues.ts.
 */

import { FormeJuridiqueEbnl, FormeJuridiqueSyscohada, Referentiel } from '@prisma/client';

/** Toutes les formes relevant de la loi 004/2001 sur les ASBL. */
const FORMES_ASBL: FormeJuridiqueEbnl[] = [
  FormeJuridiqueEbnl.ASSOCIATION,
  FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE,
  FormeJuridiqueEbnl.ASSOCIATION_CONFESSIONNELLE,
];

/**
 * Les formes SYSCOHADA que l'AUSCGIE soumet au circuit « états financiers aux
 * commissaires aux comptes, puis assemblée générale, puis dépôt au RCCM ».
 *
 * L'art. 140 ne nomme que la SA, la SAS et, le cas échéant, la SARL · le
 * circuit des assemblées suppose des organes que ni l'entreprise
 * individuelle, ni l'entreprenant, ni la succursale n'ont.
 */
const FORMES_SOCIETES_ASSEMBLEE: FormeJuridiqueSyscohada[] = [
  FormeJuridiqueSyscohada.SOCIETE_ANONYME,
  FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE,
  FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE,
];

/**
 * Les formes tenues au dépôt de l'art. 269, qui vise « les sociétés
 * commerciales ». En sont donc dehors, et chacune pour une raison distincte :
 * l'ENTREPRENANT, expressément DISPENSÉ d'immatriculation au RCCM (AUDCG
 * art. 30 in fine) ; la SOCIETE_COOPERATIVE, immatriculée au Registre des
 * Sociétés Coopératives et non au RCCM (AUSCOOP art. 206) ; le GIE,
 * l'entreprise individuelle, la succursale et l'entité publique, qui sont
 * immatriculés ou déclarés mais ne sont pas des sociétés commerciales.
 */
const FORMES_DEPOT_RCCM: FormeJuridiqueSyscohada[] = [
  FormeJuridiqueSyscohada.SOCIETE_ANONYME,
  FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE,
  FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE,
  FormeJuridiqueSyscohada.SOCIETE_NOM_COLLECTIF,
  FormeJuridiqueSyscohada.SOCIETE_COMMANDITE_SIMPLE,
];

/** Date de dernière vérification des échéances ci-dessous contre leur source. */
export const DERNIERE_VERIFICATION = '2026-09-03';

/**
 * INTERNE : jalon d'organisation, l'entité fixe elle-même sa date.
 * LEGALE : jalon opposable à un tiers (administration, greffe, bailleur), dont
 * le dépassement expose à une sanction.
 */
export type NatureJalon = 'INTERNE' | 'LEGALE';

/**
 * Échéance exprimée en décalage sur la date de CLÔTURE de l'exercice, jamais
 * en date absolue : le cours raisonne sur un exercice civil clos le 31
 * décembre (« au plus tard fin avril de l'année prochaine »), or l'article 7
 * du présent logiciel autorise un exercice décalé. `jour: 'FIN'` vise le
 * dernier jour du mois d'arrivée.
 */
interface Decalage {
  /**
   * Nombre de mois APRÈS LE MOIS DE CLÔTURE. Pour un exercice clos en
   * décembre, `4` désigne avril de l'année suivante, `6` juin, `7` juillet.
   * Négatif pour les travaux préparatoires, qui commencent avant la clôture.
   */
  moisApres: number;
  jour: 'FIN' | number;
}

export interface DefinitionJalon {
  etape: number;
  libelle: string;
  detail: string;
  nature: NatureJalon;
  debut: Decalage;
  echeance: Decalage;
  source: string;
  /**
   * Formes juridiques concernées · absent = toutes. C'est ce champ qui évite
   * de servir à une ONG le circuit d'une entreprise commerciale, et
   * réciproquement.
   */
  formes?: FormeJuridiqueEbnl[];
  /**
   * Pendant SYSCOHADA de `formes` · absent = toutes. Un jalon qui porte ce
   * champ ne s'affiche PAS tant que la forme du dossier n'est pas renseignée :
   * mieux vaut une liste courte qu'un dépôt au RCCM annoncé à un entreprenant
   * qui en est dispensé.
   */
  formesSyscohada?: FormeJuridiqueSyscohada[];
  /** Référentiels concernés · absent = les deux. */
  referentiels?: Referentiel[];
  /** Jalon propre aux entités de droit étranger (art. 29-34 et 37). */
  droitEtrangerSeulement?: boolean;
  /**
   * Ce qu'OmegaX sait observer tout seul sur ce jalon. Renseigné par le
   * service, pas ici : cette table reste une table de références.
   */
  observation?: 'BROUILLARD' | 'INVENTAIRE' | 'RAPPORT_ACTIVITE' | 'DONATEURS' | 'CLOTURE_ANNUELLE';
}

/**
 * Les dix étapes du § 7.1, augmentées des trois jalons propres à une EBNL
 * (livre d'inventaire, registre des donateurs, rapport à l'assemblée) et des
 * quatre dépôts congolais du § 7.3. Les décalages viennent du calendrier du
 * § 2.3, transposé en mois après clôture.
 */
export const JALONS_CLOTURE: DefinitionJalon[] = [
  {
    etape: 1,
    libelle: 'Planning de clôture et instructions d’inventaire',
    detail:
      'Concevoir, diffuser et vulgariser le planning de clôture ainsi que les instructions générale et spécifique des inventaires extracomptables. Le cours précise que ce planning doit obtenir le visa de la direction avant sa mise en application.',
    nature: 'INTERNE',
    debut: { moisApres: -2, jour: 1 },
    echeance: { moisApres: -1, jour: 'FIN' },
    source: 'CPCC, notes de cours d’organisation comptable, § 7.1 point 1 et § 2.3',
  },
  {
    etape: 2,
    libelle: 'Balance de vérification',
    detail:
      'Établir la balance provisoire des comptes généraux, après validation de toutes les écritures du brouillard. Le cours rappelle qu’une procédure de validation « ne pouvant excéder le mois » doit rendre les traitements irréversibles.',
    nature: 'INTERNE',
    debut: { moisApres: 0, jour: 1 },
    echeance: { moisApres: 1, jour: 15 },
    source: 'CPCC, § 7.1 point 2 et § 2.6.2',
    observation: 'BROUILLARD',
  },
  {
    etape: 3,
    libelle: 'Inventaires extracomptables',
    detail:
      'Prise d’inventaire physique des stocks, des immobilisations, de la caisse et des dons en nature. C’est cet inventaire qui donne la situation réelle, parfois différente de celle de la comptabilité.',
    nature: 'INTERNE',
    debut: { moisApres: -1, jour: 1 },
    echeance: { moisApres: 1, jour: 'FIN' },
    source: 'CPCC, § 7.1 point 3 et § 2.3',
    referentiels: [Referentiel.SYCEBNL],
  },
  {
    /*
      Pendant SYSCOHADA du jalon 3. « Dons en nature » est une catégorie de
      relevé physique propre à une EBNL, que justifie son compte 654 ; le
      SYSCOHADA connaît les dons (6582, 835, 845) mais n'en fait pas une
      catégorie d'inventaire distincte. L'AUDCIF, lui, décrit ce que le relevé
      doit porter : la nature, la quantité et la valeur de chaque élément.
    */
    etape: 3,
    libelle: 'Inventaires extracomptables',
    detail:
      'Relevé physique de tous les éléments du patrimoine · stocks, immobilisations, caisse, créances et dettes · avec la nature, la quantité et la valeur de chacun à la date de l’inventaire. C’est ce relevé qui donne la situation réelle, parfois différente de celle de la comptabilité ; les données d’inventaire sont conservées de manière à justifier le contenu de chaque élément recensé.',
    nature: 'INTERNE',
    debut: { moisApres: -1, jour: 1 },
    echeance: { moisApres: 1, jour: 'FIN' },
    source: 'AUDCIF, art. 16 (relevé physique) et art. 17, 6° (contrôle par inventaire) ; CPCC, § 7.1 point 3 et § 2.3',
    referentiels: [Referentiel.SYSCOHADA],
  },
  {
    etape: 4,
    libelle: 'Compte annuel et liste des membres effectifs au Ministère de la Justice',
    detail:
      'Dépôt, au ministère de tutelle ET aux autorités administratives locales du siège, du compte annuel et de la liste alphabétique des membres effectifs, indiquant pour chaque administrateur la qualité en laquelle il a été nommé et l’acte l’ayant approuvé. C’est l’obligation annuelle centrale d’une ASBL congolaise, et son destinataire n’est pas l’administration fiscale. Le compte annuel attendu est un état des recettes et des dépenses (cadre de l’annexe VII), plus simple que la liasse SYCEBNL, qui ne le remplace pas.',
    nature: 'LEGALE',
    debut: { moisApres: 1, jour: 1 },
    echeance: { moisApres: 1, jour: 'FIN' },
    source:
      'CENCO, Documentation à l’usage des ASBL, Vade Mecum du gestionnaire, obligations de l’ASBL reconnue, et annexes VI et VII (« à présenter chaque année au courant du mois de janvier »)',
    formes: FORMES_ASBL,
    referentiels: [Referentiel.SYCEBNL],
  },  {
    etape: 5,
    libelle: 'Déclaration semestrielle relative aux ressources',
    detail:
      'Déclaration des ressources de l’association, à RENOUVELER à la fin ou au début de chaque semestre · elle ne se fait donc pas une fois l’an. Le manquement est sanctionné par l’article 19, c’est-à-dire par la dissolution : c’est l’obligation la plus lourdement sanctionnée de toute la loi 004/2001, et la plus facile à oublier puisqu’elle ne suit pas le calendrier comptable. L’échéance portée ici est celle du semestre qui suit la clôture ; l’autre tombe six mois plus tôt.',
    nature: 'LEGALE',
    debut: { moisApres: 0, jour: 1 },
    echeance: { moisApres: 1, jour: 'FIN' },
    source: 'Loi n° 004/2001 du 20 juillet 2001, art. 4, e (sanction : art. 19)',
    formes: FORMES_ASBL,
    referentiels: [Referentiel.SYCEBNL],
  },  {
    etape: 6,
    libelle: 'Écritures d’inventaire',
    detail:
      'Amortissements, dépréciations, provisions, régularisations, actualisation des opérations en monnaies étrangères, écarts d’inventaire. Pour une EBNL, s’y ajoute le sort des fonds affectés à un projet spécifique non consommés en fin d’exercice (compte 165, repris par le compte 7925) et des fonds reportés (compte 17).',
    nature: 'INTERNE',
    debut: { moisApres: 1, jour: 1 },
    echeance: { moisApres: 2, jour: 'FIN' },
    source: 'CPCC, § 7.1 point 4 et § 2.3 (« de janvier à mars »), adapté SYCEBNL (Partie 2, ch. 3, comptes 16 et 17 ; Partie 3, ch. 2)',
    referentiels: [Referentiel.SYCEBNL],
  },
  {
    /*
      Pendant SYSCOHADA du jalon 6. Le texte servi jusqu'ici parlait de fonds
      affectés et de fonds reportés à une entreprise commerciale, dont le
      compte 17 est « Dettes de location acquisition » et qui ne connaît ni
      les uns ni les autres.
    */
    etape: 6,
    libelle: 'Écritures d’inventaire',
    detail:
      'Amortissements, dépréciations, provisions, régularisations, écarts de conversion, écarts d’inventaire, et reprise des subventions d’investissement (compte 14, repris par le compte 799 Reprises de subventions d’investissement).',
    nature: 'INTERNE',
    debut: { moisApres: 1, jour: 1 },
    echeance: { moisApres: 2, jour: 'FIN' },
    source: 'CPCC, § 7.1 point 4 et § 2.3 (« de janvier à mars ») ; AUDCIF, art. 17, 6° (contrôle par inventaire) et Titre VII, comptes 14 et 799',
    referentiels: [Referentiel.SYSCOHADA],
  },
  {
    etape: 7,
    libelle: 'Détermination du résultat',
    detail:
      'Excédent ou déficit de l’exercice, dégagé par le compte de résultat pour une association ou un ordre professionnel, par le compte d’exploitation pour un projet de développement.',
    nature: 'INTERNE',
    debut: { moisApres: 2, jour: 1 },
    echeance: { moisApres: 3, jour: 15 },
    source: 'CPCC, § 7.1 point 5, adapté SYCEBNL (art. 4 et Partie 4)',
    referentiels: [Referentiel.SYCEBNL],
  },
  {
    etape: 7,
    libelle: 'Détermination du résultat',
    detail:
      'Bénéfice net ou perte nette de l’exercice, dégagé par le compte de résultat en liste, dont le classement fait apparaître les soldes intermédiaires de gestion en cascade. Le résultat est viré au compte 131 Résultat net : bénéfice ou au compte 139 Résultat net : perte.',
    nature: 'INTERNE',
    debut: { moisApres: 2, jour: 1 },
    echeance: { moisApres: 3, jour: 15 },
    source: 'CPCC, § 7.1 point 5 ; AUDCIF, art. 29 et 31, et Titre VII, compte 13',
    referentiels: [Referentiel.SYSCOHADA],
  },
  {
    etape: 8,
    libelle: 'Balance définitive et révision des comptes',
    detail:
      'Balance définitive, puis révision compte par compte : justifier le solde de chaque poste repris au bilan. C’est le self-audit décrit au § 2.3.',
    nature: 'INTERNE',
    debut: { moisApres: 2, jour: 1 },
    echeance: { moisApres: 3, jour: 'FIN' },
    source: 'CPCC, § 7.1 point 6 et § 2.3',
  },
  {
    etape: 9,
    libelle: 'Livre d’inventaire',
    detail:
      'Transcription au livre d’inventaire du bilan et du compte de résultat, ainsi que du relevé des éléments d’actif et de passif. Obligation absente du cours du CPCC.',
    nature: 'LEGALE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 3, jour: 'FIN' },
    source: 'SYCEBNL, art. 14 de l’Acte uniforme',
    referentiels: [Referentiel.SYCEBNL],
    observation: 'INVENTAIRE',
  },
  {
    /*
      LE LIVRE D'INVENTAIRE N'EST PAS PROPRE AU SYCEBNL, et le présenter ainsi
      privait de ce jalon tout dossier SYSCOHADA : l'AUDCIF art. 19 en fait un
      livre obligatoire, sur lequel se transcrivent le Bilan, le Compte de
      résultat et le Tableau des flux de trésorerie, ainsi que le résumé de
      l'opération d'inventaire.

      SANS `observation: 'INVENTAIRE'`, et c'est délibéré : la transcription
      s'observe depuis le module documents-obligatoires, réservé au SYCEBNL
      par convention du dépôt (CLAUDE.md § 6, son pendant SYSCOHADA restant à
      écrire). Un jalon qui interrogerait une route fermée passerait « en
      retard » sans jamais pouvoir être satisfait.
    */
    etape: 9,
    libelle: 'Livre d’inventaire',
    detail:
      'Transcription au livre d’inventaire du Bilan, du Compte de résultat et du Tableau des flux de trésorerie de l’exercice, ainsi que du résumé de l’opération d’inventaire. Le livre d’inventaire est coté, paraphé et numéroté de façon continue par la juridiction compétente ; tenu par informatique, il doit être identifié, numéroté et daté dès son établissement par des moyens garantissant la chronologie, l’irréversibilité et l’intégrité des enregistrements.',
    nature: 'LEGALE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 3, jour: 'FIN' },
    source: 'AUDCIF, art. 19 (livres obligatoires), art. 66 (cote et paraphe) et art. 67 (support électronique)',
    referentiels: [Referentiel.SYSCOHADA],
  },

  {
    /*
      LE SEUL TEXTE QUI IMPOSE EXPLICITEMENT LA COMMUNICATION DES COMPTES,
      et la forme qu'il vise était précisément la seule à ne rien voir : la
      liste FORMES_ASBL ci-dessus omettait l'établissement d'utilité publique,
      si bien qu'un EUP n'affichait AUCUN jalon de dépôt. Le jalon 4 lui est
      inadapté (il vise le Ministère de la Justice et la liste des membres,
      qu'un EUP n'a pas), d'où un jalon propre plutôt qu'un filtre élargi.
    */
    etape: 10,
    libelle: 'Budget et comptes annuels au ministre du secteur (établissement d’utilité publique)',
    detail:
      'Communication au ministre ayant le secteur d’activité dans ses attributions du budget et de tous les comptes annuels de l’établissement. Le ministre les transmet ensuite au Ministre de la Justice, qui les fait publier au Journal officiel · les frais de publication sont à charge de l’établissement. L’obligation porte sur le BUDGET autant que sur les comptes : un EUP qui ne déposerait que ses états financiers ne l’aurait pas remplie.',
    nature: 'LEGALE',
    debut: { moisApres: 1, jour: 1 },
    echeance: { moisApres: 3, jour: 'FIN' },
    source: 'Loi n° 004/2001 du 20 juillet 2001, art. 66 (et art. 65 pour les statuts et les nominations)',
    formes: [FormeJuridiqueEbnl.ETABLISSEMENT_UTILITE_PUBLIQUE],
    referentiels: [Referentiel.SYCEBNL],
  },

  {
    /*
      Le champ `droitEtrangerSeulement` existait depuis l'origine mais AUCUN
      jalon ne l'utilisait · un drapeau posé sur le dossier et lu par personne.
    */
    etape: 11,
    libelle: 'Accord-cadre et main-d’œuvre nationale (ONG de droit étranger)',
    detail:
      'Une ONG étrangère exerce sur la base d’un accord-cadre conclu avec le Ministère du Plan, et sa main-d’œuvre doit comprendre au moins 60 % de nationaux. Vérifiez à chaque exercice que l’accord-cadre est en cours de validité et que le taux d’emploi national est tenu · les deux se contrôlent ensemble, à l’occasion du rapport d’activité.',
    nature: 'LEGALE',
    debut: { moisApres: 1, jour: 1 },
    echeance: { moisApres: 3, jour: 'FIN' },
    source: 'Loi n° 004/2001 du 20 juillet 2001, art. 37 (et art. 29 à 34 pour les associations étrangères)',
    referentiels: [Referentiel.SYCEBNL],
    droitEtrangerSeulement: true,
  },
  {
    etape: 12,
    libelle: 'États financiers et notes annexes',
    detail:
      'Bilan, compte de résultat ou d’exploitation, tableau de flux de trésorerie ou tableau emplois-ressources, et les notes annexes du jeu retenu (35 pour une association ou un ordre professionnel, 24 pour un projet de développement, 5 pour le Système minimal de trésorerie). Le cours note que le tableau de flux ne s’applique pas au SMT. Les états financiers annuels sont arrêtés au plus tard dans les QUATRE MOIS qui suivent la clôture, et la date d’arrêté doit être mentionnée dans toute transmission.',
    nature: 'INTERNE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 4, jour: 'FIN' },
    // L'art. 23 de l'AUDCIF n'est PAS dans la liste d'exclusion de l'art. 3 du
    // SYCEBNL (art. 5, 8, 10 à 13, 17 al. 7-8, 18, 19 4e tiret, 21, 25 à 34,
    // 49, 69, 70, 71, 73 à 113) : le délai de quatre mois vaut donc aussi pour
    // une EBNL. Le réserver au SYSCOHADA aurait créé la fuite inverse.
    source: 'CPCC, § 7.1 point 8, adapté SYCEBNL (art. 4 à 13) ; AUDCIF art. 23 (arrêté dans les quatre mois), non exclu par l’art. 3 du SYCEBNL',
    referentiels: [Referentiel.SYCEBNL],
  },
  {
    /*
      Pendant SYSCOHADA du jalon 12. Le texte servi était intégralement
      SYCEBNL : compte d'exploitation, tableau emplois-ressources, 35/24/5
      notes, articles 4 à 13 de l'Acte uniforme SYCEBNL.

      ANOMALIE DU TEXTE OFFICIEL, signalée et non tranchée ici. L'art. 28 de
      l'AUDCIF fait reposer le Système minimal de trésorerie sur « un Bilan,
      un Compte de résultat, un Tableau de flux de trésorerie et des Notes
      annexes », alors que le Titre X ch. 1 § 2 écrit l'inverse : trois
      documents, sans tableau des flux, celui-ci étant propre au Système
      normal. OmegaX suit le Titre X (CLAUDE.md § 6) parce que c'est lui qui
      décrit les tracés effectivement à remplir, et le dit ici plutôt que de
      laisser croire à un oubli.
    */
    etape: 12,
    libelle: 'États financiers et notes annexes',
    detail:
      'Au Système normal, jeu complet indissociable : Bilan, Compte de résultat, Tableau des flux de trésorerie et Notes annexes (36 notes). Au Système minimal de trésorerie, bilan, compte de résultat et notes 1 à 3, plus le journal de trésorerie de la NOTE 4. Les états financiers annuels sont arrêtés au plus tard dans les QUATRE MOIS qui suivent la clôture, et la date d’arrêté doit être mentionnée dans toute transmission.',
    nature: 'INTERNE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 4, jour: 'FIN' },
    source: 'AUDCIF, art. 8 (jeu complet), art. 23 (arrêté dans les quatre mois) et art. 26 ; Titre IX ch. 6 (notes annexes) ; Titre X (Système minimal de trésorerie)',
    referentiels: [Referentiel.SYSCOHADA],
  },
  {
    etape: 13,
    libelle: 'Registre des donateurs arrêté',
    detail:
      'Arrêté du registre des donateurs de l’exercice, dont la tenue est obligatoire pour une EBNL. Obligation propre au SYCEBNL, absente du cours.',
    nature: 'LEGALE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 4, jour: 'FIN' },
    source: 'SYCEBNL, art. 17 et 18 de l’Acte uniforme',
    referentiels: [Referentiel.SYCEBNL],
    observation: 'DONATEURS',
  },
  {
    etape: 14,
    libelle: 'Déclarations fiscales annuelles',
    detail:
      'Déclarations dues à l’administration fiscale, y compris à zéro : une entité exemptée d’impôt sur les sociétés ne paie pas, mais elle déclare. S’y ajoute la déclaration trimestrielle des sommes versées à des tiers hors salaires. Ce jalon N’EST PAS un dépôt d’états financiers : l’ASBL ne dépose pas sa liasse à la DGI, qui dispose en revanche d’un droit de contrôle sur sa comptabilité et ses déclarations. Voir docs/fiscalite-asbl-rdc.md et docs/obligations-annuelles-ebnl-rdc.md.',
    nature: 'LEGALE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 4, jour: 'FIN' },
    source: 'CENCO, Vade Mecum du gestionnaire (obligations fiscales de l’ASBL) ; loi n° 23/053 ; à confirmer sur texte primaire',
    referentiels: [Referentiel.SYCEBNL],
  },
  {
    /*
      Pendant SYSCOHADA du jalon 14, et l'un des plus fâcheux à servir au
      mauvais référentiel : une entreprise lisait qu'elle est exemptée
      d'impôt sur les sociétés et qu'aucun état financier ne se dépose à la
      DGI. C'est l'inverse · l'exemption de l'art. 5 de la loi n° 23/053 vise
      les ASBL, EUP et ONG, et la déclaration de l'IS est APPUYÉE des états
      financiers.

      Le numéro d'article de la loi de finances n'est pas cité : la source
      pose une réserve de numérotation expresse, le texte voté ayant été
      amendé au Parlement et la numérotation relevée étant celle du projet.
      La loi se cite donc par son numéro et son objet.
    */
    etape: 14,
    libelle: 'Déclarations fiscales annuelles',
    detail:
      'Déclaration de l’Impôt sur les Sociétés au plus tard le 30 avril de l’année qui suit celle de la réalisation des revenus, à souscrire MÊME en cas de perte ou d’absence de revenus imposables. Pour une entreprise relevant du Système normal, elle est appuyée du bilan, du compte de résultat, du tableau des flux de trésorerie, du tableau de variation des capitaux propres et des notes annexes, contresignés par le conseil ou le comptable du redevable, et, sous peine de rejet, certifiés par un expert-comptable inscrit au tableau de l’ONEC. S’y ajoute le relevé récapitulatif des ventes de l’année aux personnes réputées commerçants ou fabricants. Les trois acomptes provisionnels de l’exercice se versent en juillet, septembre et novembre, hors calendrier de clôture.',
    nature: 'LEGALE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 4, jour: 'FIN' },
    source:
      'Loi n° 004/2003 portant réforme des procédures fiscales, art. 12 (échéance), 13 (états joints), 14 (certification ONEC) et 15 (déclaration en cas de perte), modifiés par la loi n° 23/052 ; art. 57 bis LPF tel que modifié par la loi de finances n° 25/060 du 29 décembre 2025',
    referentiels: [Referentiel.SYSCOHADA],
  },
  {
    /*
      TROIS JALONS PROPRES AU SYSCOHADA, ajoutés le 03/09/2026 en même temps
      que la forme juridique OHADA. Le planning ne servait jusque-là aucune
      obligation de l'AUSCGIE : un dossier SYSCOHADA voyait le tronc commun du
      CPCC, puis directement le dépôt au RCCM, sans le circuit qui y mène.
    */
    etape: 15,
    libelle: 'Rapport de gestion',
    detail:
      'Le gérant, le conseil d’administration ou l’administrateur général expose la situation de la société durant l’exercice écoulé, son évolution prévisible, les événements importants survenus entre la clôture et la date d’établissement, et en particulier les perspectives de continuation de l’activité, l’évolution de la trésorerie et le plan de financement. Ces quatre derniers points sont ceux qu’on oublie : un rapport qui se borne au compte rendu de l’exercice écoulé est incomplet.',
    nature: 'LEGALE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 4, jour: 'FIN' },
    source: 'AUSCGIE, art. 138',
    referentiels: [Referentiel.SYSCOHADA],
  },
  {
    etape: 16,
    libelle: 'États financiers et rapport de gestion aux commissaires aux comptes',
    detail:
      'Envoi aux commissaires aux comptes des états financiers de synthèse annuels et du rapport de gestion, QUARANTE-CINQ JOURS AU MOINS avant la date de l’assemblée générale ordinaire. Le délai se compte à rebours de l’assemblée, pas de la clôture : une assemblée tenue au dernier jour du sixième mois impose l’envoi vers la mi-quatrième mois. La désignation d’un commissaire aux comptes est obligatoire dans toute société anonyme (art. 702) et, dans la SARL comme dans la SAS, dès que deux des trois critères de taille sont dépassés à la clôture (total du bilan, chiffre d’affaires annuel, effectif permanent au-delà de cinquante personnes) · les deux premiers montants sont donnés par les articles cités, l’écran Paramètres du dossier les reprend.',
    nature: 'LEGALE',
    debut: { moisApres: 3, jour: 15 },
    echeance: { moisApres: 4, jour: 'FIN' },
    source: 'AUSCGIE, art. 140 al. 1 ; art. 702 (SA) ; art. 376 (SARL) ; art. 853-13 (SAS)',
    referentiels: [Referentiel.SYSCOHADA],
    formesSyscohada: FORMES_SOCIETES_ASSEMBLEE,
  },
  {
    etape: 17,
    libelle: 'Mise à disposition de l’auditeur',
    detail:
      'Remise du projet d’états financiers à l’auditeur. Le cours parle du commissaire aux comptes ; pour une EBNL, la désignation d’un auditeur dépend des seuils de l’Acte uniforme (ressources annuelles, total du bilan, effectif salarié) et n’est pas systématique.',
    nature: 'INTERNE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 5, jour: 15 },
    source: 'CPCC, § 2.3 (« début mars au 15 mai »), adapté SYCEBNL (art. 19 à 22)',
    referentiels: [Referentiel.SYCEBNL],
  },
  {
    /*
      Pendant SYSCOHADA du jalon 17. Il ne suffisait pas de retirer le jalon
      aux dossiers SYSCOHADA : le jalon 16, qui porte l'envoi des quarante-cinq
      jours, est filtré par `formesSyscohada`, si bien qu'une SNC, une SCS ou
      une entreprise individuelle n'aurait plus eu AUCUN jalon de remise au
      contrôleur, alors que le calendrier du CPCC les vise.

      Pas de `formesSyscohada` ici, donc, et pas de montant : les seuils qui
      décident de la désignation sont servis par le contrôle des seuils
      (regles-auditeur.ts), pas par le planning.
    */
    etape: 17,
    libelle: 'Mise à disposition du commissaire aux comptes',
    detail:
      'Remise du projet d’états financiers, du rapport de gestion et, le cas échéant, du bilan social au commissaire aux comptes, QUARANTE-CINQ JOURS AU MOINS avant la date de l’assemblée générale ordinaire. Le commissaire aux comptes émet une opinion sur la régularité, la sincérité et l’image fidèle des comptes, et se prononce sur la concordance avec les états financiers des informations données dans le rapport de gestion. Sa désignation est obligatoire dans toute société anonyme, et dans la SARL comme dans la SAS au-delà de deux des trois critères de taille.',
    nature: 'INTERNE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 5, jour: 15 },
    source:
      'AUDCIF, art. 69 à 71 (contrôle externe, opinion, délai de quarante-cinq jours) ; AUSCGIE, art. 694 et 702 (SA), 376 (SARL), 853-13 (SAS) ; CPCC, § 2.3 (« début mars au 15 mai »)',
    referentiels: [Referentiel.SYSCOHADA],
  },
  {
    etape: 18,
    libelle: 'Rapport d’activité au Ministère du Plan et au ministère du secteur',
    detail:
      'Une ONG transmet périodiquement son rapport d’activité, pour évaluation physique, au Ministre ayant le Plan dans ses attributions et à celui en charge du secteur où elle opère. Elle l’informe également de ses projets et des ressources financières mobilisées. La loi dit « périodiquement » sans fixer de date : l’échéance retenue ici est un repère de fin de campagne annuelle, à caler sur l’accord-cadre pour une ONG étrangère.',
    nature: 'LEGALE',
    debut: { moisApres: 4, jour: 1 },
    echeance: { moisApres: 5, jour: 'FIN' },
    source: 'Loi n° 004/2001, art. 44 et 45',
    formes: [FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE],
    // `formes` ne suffit pas : tout dossier porte une forme EBNL, l'ASSOCIATION
    // par défaut, y compris tenu en SYSCOHADA. Sans ce filtre, une entreprise
    // dont la forme EBNL aurait été mise à ONG recevait une obligation de la
    // loi n° 004/2001. La porte est fermée des deux côtés : le service refuse
    // désormais aussi de modifier la forme EBNL d'un dossier SYSCOHADA
    // (TenantService.modifierFormeJuridique).
    referentiels: [Referentiel.SYCEBNL],
  },
  {
    etape: 19,
    libelle: 'Dépôt au Ministère de l’Économie nationale',
    detail:
      'Le cours donne « au plus tard mi-juin » au § 7.3 et « au plus tard 15 juin » au § 2.3, avec une astreinte par jour de retard fixée par l’arrêté interministériel n° 013/CAB/MINECO/2013 et n° CAB/MIN/FINANCES/2013/1055 du 26 novembre 2013, dont le taux n’est pas repris ici. Le cours vise les entités du Système comptable OHADA ; son extension à une EBNL n’a pas pu être confirmée sur texte primaire.',
    nature: 'LEGALE',
    debut: { moisApres: 4, jour: 1 },
    echeance: { moisApres: 6, jour: 15 },
    source: 'CPCC, § 2.3 et § 7.3, portée pour une EBNL à confirmer sur texte primaire',
    referentiels: [Referentiel.SYCEBNL],
  },
  {
    /*
      Pendant SYSCOHADA du jalon 19. La réserve « portée pour une EBNL à
      confirmer » n'a pas lieu d'être affichée à une entreprise : le cours
      vise précisément les entités du Système comptable OHADA.
    */
    etape: 19,
    libelle: 'Dépôt au Ministère de l’Économie nationale',
    detail:
      'Transmission des états financiers annuels au Ministère de l’Économie nationale, au plus tard mi-juin, sur les imprimés diffusés par le CPCC. Le défaut de transmission dans le délai prescrit est puni d’une astreinte par jour de retard fixée par l’arrêté interministériel n° 013/CAB/MINECO/2013 et n° CAB/MIN/FINANCES/2013/1055 du 26 novembre 2013, dont le taux n’est pas repris ici.',
    nature: 'LEGALE',
    debut: { moisApres: 4, jour: 1 },
    echeance: { moisApres: 6, jour: 15 },
    source: 'CPCC, § 2.3 et § 7.3 ; arrêté interministériel n° 013/CAB/MINECO/2013 et n° CAB/MIN/FINANCES/2013/1055 du 26 novembre 2013',
    referentiels: [Referentiel.SYSCOHADA],
  },
  {
    etape: 20,
    libelle: 'Rapport d’activité et approbation des comptes',
    detail:
      'Établissement du rapport d’activité et approbation des états financiers par l’organe délibérant. Le cours rappelle que les comptes doivent être mis à la disposition des administrateurs quelques jours avant la réunion.',
    nature: 'INTERNE',
    debut: { moisApres: 4, jour: 1 },
    echeance: { moisApres: 6, jour: 'FIN' },
    source: 'CPCC, § 2.3 (« au plus tard fin juin »), adapté SYCEBNL (art. 16-3)',
    referentiels: [Referentiel.SYCEBNL],
    observation: 'RAPPORT_ACTIVITE',
  },
  {
    /*
      Pendant SYSCOHADA du jalon 20, et pas seulement par le vocabulaire :
      l'observation RAPPORT_ACTIVITE compte les rapports d'activité, dont la
      route (documents-obligatoires) est @ReferentielsAutorises(SYCEBNL). Un
      dossier SYSCOHADA lisait donc « Aucun rapport d'activité établi » et
      passait « en retard » sans pouvoir jamais satisfaire le jalon. Le
      pendant SYSCOHADA se pose donc SANS observation.
    */
    etape: 20,
    libelle: 'Approbation des états financiers et du rapport de gestion',
    detail:
      'Les états financiers annuels et le rapport de gestion établis par les organes d’administration ou de direction sont soumis à l’approbation des actionnaires, des associés ou des membres dans le délai de SIX MOIS à compter de la date de clôture de l’exercice.',
    nature: 'LEGALE',
    debut: { moisApres: 4, jour: 1 },
    echeance: { moisApres: 6, jour: 'FIN' },
    source: 'AUDCIF, art. 71 (rapport de gestion) et art. 72 (approbation dans les six mois) ; CPCC, § 2.3',
    referentiels: [Referentiel.SYSCOHADA],
  },
  {
    etape: 21,
    libelle: 'Dépôt des états financiers SYCEBNL au CPCC',
    detail:
      'C’est ICI que la liasse se dépose, et nulle part ailleurs. Le CPCC vise toutes les entités à but non lucratif sans exception : ONG, associations, églises, mosquées, fondations, unités de gestion de projets, partis politiques, clubs sportifs, ordres professionnels, fonds de dotation. Pour l’exercice 2024, l’échéance annoncée était le 30 juin 2025. Le retard est sanctionné par une astreinte par jour fixée par l’arrêté ministériel n° 024/CAB/MIN/FINANCES/2010 du 15 avril 2010, dont le taux n’est pas repris ici.',
    nature: 'LEGALE',
    debut: { moisApres: 6, jour: 1 },
    echeance: { moisApres: 6, jour: 'FIN' },
    source:
      'CPCC, note circulaire sur le dépôt des états financiers SYCEBNL (fondée sur l’art. 2 de l’AUDCIF et les art. 1, 2 et 5 de l’Acte uniforme SYCEBNL) ; CPCC, § 2.3 et § 7.3',
    referentiels: [Referentiel.SYCEBNL],
  },
  {
    /*
      Le dépôt au CPCC n'était servi qu'aux dossiers SYCEBNL, alors que la
      source vise « toute entité astreinte à tenir une comptabilité
      financière » et que l'astreinte de l'arrêté ministériel de 2010 porte
      nommément sur les états financiers du Système comptable OHADA. Un
      dossier SYSCOHADA n'avait donc AUCUN jalon de dépôt au CPCC, qui est
      pourtant celui que le cours documente le mieux.
    */
    etape: 21,
    libelle: 'Dépôt des états financiers au CPCC',
    detail:
      'Transmission des états financiers annuels au CPCC, au plus tard fin juin, EXCLUSIVEMENT sur les imprimés qu’il diffuse. Au Système normal, deux volets : le volet 1 « États financiers & notes aux comptes » (bilan, compte de résultat, tableau des flux de trésorerie, 36 notes annexes) et le volet 2 « Données statistiques et fiscales » (19 notes). Au Système minimal de trésorerie, bilan, compte de résultat et 3 notes annexes, accompagnés des journaux de suivi des dettes à payer, des créances impayées et de trésorerie. Les imprimés doivent être complets, chaque tableau inutilisé portant la mention « NÉANT ». Le défaut ou le retard est puni d’une astreinte par jour fixée par l’arrêté ministériel n° 024/CAB/MIN/FINANCES/2010 du 15 avril 2010, dont le taux n’est pas repris ici.',
    nature: 'LEGALE',
    debut: { moisApres: 6, jour: 1 },
    echeance: { moisApres: 6, jour: 'FIN' },
    source: 'CPCC, § 7.3 (destinataires, imprimés et sanctions) et § 2.3 ; arrêté ministériel n° 024/CAB/MIN/FINANCES/2010 du 15 avril 2010',
    referentiels: [Referentiel.SYSCOHADA],
  },
  {
    etape: 22,
    libelle: 'Assemblée générale statuant sur les états financiers',
    detail:
      'L’assemblée générale qui statue sur les états financiers de synthèse doit OBLIGATOIREMENT se tenir dans les six mois de la clôture de l’exercice. C’est elle qui fait courir le délai d’un mois du dépôt au registre du commerce.',
    nature: 'LEGALE',
    debut: { moisApres: 4, jour: 1 },
    echeance: { moisApres: 6, jour: 'FIN' },
    source: 'AUSCGIE, art. 140 al. 2',
    referentiels: [Referentiel.SYSCOHADA],
    formesSyscohada: FORMES_SOCIETES_ASSEMBLEE,
  },
  {
    etape: 23,
    libelle: 'Dépôt des états financiers au RCCM',
    detail:
      'Dépôt au registre du commerce et du crédit mobilier de l’État partie du siège social, DANS LE MOIS QUI SUIT L’APPROBATION par l’organe compétent · l’échéance ci-dessous suppose donc une assemblée tenue au sixième mois. En cas de REFUS d’approbation, c’est une copie de la décision qui se dépose, dans le même délai. Le dépôt peut être électronique. Passé trente jours de demande amiable restée vaine, tout intéressé peut faire enjoindre le dépôt sous astreinte. Ne concerne pas une ASBL : l’article 1er de la loi n° 004/2001 en fait une entité non commerçante, donc non immatriculée au registre du commerce.',
    nature: 'LEGALE',
    debut: { moisApres: 7, jour: 1 },
    echeance: { moisApres: 7, jour: 'FIN' },
    source: 'AUSCGIE, art. 269 ; CPCC, § 2.3 et § 7.3 ; loi n° 004/2001, art. 1er (exclusion des ASBL)',
    referentiels: [Referentiel.SYSCOHADA],
    formesSyscohada: FORMES_DEPOT_RCCM,
  },
  {
    etape: 24,
    libelle: 'Clôture et réouverture des livres',
    detail:
      'Clôture annuelle de l’exercice, soldant les classes 6 et 7 sur le résultat et générant le report à-nouveau dans l’exercice suivant. Le cours rappelle que la clôture interdit l’ajout, la modification et la suppression d’écritures, mais autorise le lettrage et le pointage : c’est bien le comportement d’OmegaX. Une fois l’exercice clos, les livres comptables et les pièces justificatives se conservent DIX ANS.',
    nature: 'INTERNE',
    debut: { moisApres: 7, jour: 1 },
    echeance: { moisApres: 8, jour: 'FIN' },
    // Comme l'art. 23, l'art. 24 n'est pas exclu par l'art. 3 du SYCEBNL : la
    // conservation décennale vaut pour les deux référentiels.
    source: 'CPCC, § 7.1 point 10 et § 2.3 ; AUDCIF art. 24 (conservation dix ans), non exclu par l’art. 3 du SYCEBNL',
    observation: 'CLOTURE_ANNUELLE',
  },
  {
    /*
      APRÈS la clôture, et c'est volontaire.

      La DÉCISION d'affecter est prise à l'assemblée qui approuve les comptes
      (jalons 20 et 22, au plus tard au sixième mois). Sa COMPTABILISATION,
      elle, suppose que l'exercice soit clos dans le logiciel : c'est la
      clôture qui porte le résultat au compte 13, et l'écriture d'affectation
      se passe dans l'exercice SUIVANT. Ce jalon suit donc le jalon 24 plutôt
      que d'accompagner l'assemblée, sans quoi il inviterait à un geste que le
      logiciel refuserait encore.
    */
    etape: 25,
    libelle: 'Affectation du résultat',
    detail:
      'Comptabilisation de la décision d’affectation prise par l’organe compétent : le compte 13 est SOLDÉ par le crédit des réserves (11), du report à nouveau (12), du capital (101 ou 103) ou des dividendes à payer (465) selon la décision. La dotation à la réserve légale, d’un dixième au moins du bénéfice diminué des pertes antérieures, est obligatoire tant que la réserve n’atteint pas le cinquième du capital social · une délibération contraire est NULLE. Sans cette écriture, le résultat reste au compte 13 et s’y empile d’exercice en exercice.',
    nature: 'LEGALE',
    debut: { moisApres: 6, jour: 1 },
    echeance: { moisApres: 8, jour: 'FIN' },
    source:
      'AUDCIF, Titre VII, compte 13 (« le compte 13 est soldé lors de la comptabilisation de cette affectation ») ; AUSCGIE, art. 142 et 143, art. 346 (SARL) et art. 546, 2° (SA)',
    referentiels: [Referentiel.SYSCOHADA],
  },
  {
    etape: 25,
    libelle: 'Affectation du résultat',
    detail:
      'Comptabilisation de la décision d’affectation prise par l’organe compétent : le compte 13 est SOLDÉ par le crédit des réserves (11), du report à nouveau (12) ou de la dotation (10). Une entité à but non lucratif ne distribue rien · aucune part de l’excédent ne va à ses membres. Le texte précise que l’excédent non affecté à un compte de réserves est viré au compte 12. Sans cette écriture, l’excédent reste au compte 13 et s’y empile d’exercice en exercice.',
    nature: 'LEGALE',
    debut: { moisApres: 6, jour: 1 },
    echeance: { moisApres: 8, jour: 'FIN' },
    source:
      'SYCEBNL, Partie 2 ch. 3, compte 13 (« L’affectation du résultat net d’un exercice résulte des dispositions statutaires, réglementaires ou de la décision des organes compétents »)',
    referentiels: [Referentiel.SYCEBNL],
  },
];

/**
 * OBLIGATIONS DÉCLENCHÉES PAR UN ÉVÉNEMENT, et non par le calendrier.
 *
 * Elles n'ont pas leur place dans le planning de clôture · leur point de
 * départ n'est pas la date d'arrêté des comptes mais un fait : une nomination,
 * une vente d'immeuble, une embauche, un franchissement de seuil. Les ranger
 * parmi les jalons annuels reviendrait à leur donner une échéance fausse.
 *
 * Elles sont pourtant restées invisibles pour cette raison même, alors que
 * deux d'entre elles se déclenchent depuis des écrans que le logiciel possède
 * déjà (les immobilisations pour l'article 15, le franchissement du seuil de
 * TVA pour l'article 55). D'où cette liste : le logiciel ne peut pas dater ce
 * qu'il ignore, mais il peut dire ce qui se déclenche, et sous quel délai.
 */
export interface ObligationEvenementielle {
  cle: string;
  /** Le fait qui fait courir le délai. */
  evenement: string;
  libelle: string;
  delai: string;
  destinataire: string;
  source: string;
  formes?: FormeJuridiqueEbnl[];
  /**
   * Référentiels concernés · absent = les deux. Indispensable pour les
   * obligations de la loi n° 004/2001 : `formes` ne les protège pas, tout
   * dossier portant une forme EBNL (ASSOCIATION par défaut) y compris tenu en
   * SYSCOHADA. Sans ce champ, la liste servirait à une entreprise des
   * obligations d'association le jour où elle sera branchée sur un écran.
   */
  referentiels?: Referentiel[];
  droitEtrangerSeulement?: boolean;
  /** Écran d'OmegaX depuis lequel l'événement se constate. */
  ecranDeclencheur?: string;
}

export const OBLIGATIONS_EVENEMENTIELLES: ObligationEvenementielle[] = [
  {
    cle: 'changementAdministrateur',
    evenement: 'Nomination, démission, révocation ou décès d’un administrateur',
    libelle: 'Déclaration du changement d’administrateur',
    delai: 'Dans le mois de la décision',
    destinataire: 'Ministre de la Justice, copie au ministre ayant le secteur d’activité dans ses attributions',
    source: 'Loi n° 004/2001, art. 11',
    formes: FORMES_ASBL,
    referentiels: [Referentiel.SYCEBNL],
  },
  {
    cle: 'mouvementImmeuble',
    evenement: 'Acquisition ou aliénation d’un immeuble',
    libelle: 'Déclaration écrite du mouvement d’immeuble, prix indiqué',
    delai: 'Dans les trois mois de l’opération',
    destinataire: 'Ministre de la Justice, COPIE AU MINISTRE DES FINANCES',
    source: 'Loi n° 004/2001, art. 15',
    formes: FORMES_ASBL,
    referentiels: [Referentiel.SYCEBNL],
    ecranDeclencheur: 'Structure > Immobilisations · entrée ou sortie d’un bien immobilier',
  },
  {
    cle: 'assujettissementTva',
    evenement: 'Franchissement du seuil de 80 000 000 FC de chiffre d’affaires annuel hors taxes',
    libelle: 'Déclaration d’assujettissement à la TVA',
    delai: 'Avant le 15 du mois qui suit le dépassement',
    destinataire: 'Direction générale des impôts',
    source: 'Ordonnance-loi n° 10/001, art. 14 et 55 ; décret n° 011/42, art. 42-43',
    ecranDeclencheur: 'Structure > Paramètres du dossier · assujettissement à la TVA',
  },
  {
    cle: 'numeroImpot',
    evenement: 'Début d’activité',
    libelle: 'Demande de Numéro Impôt',
    delai: 'Dans les quinze jours du début d’activité',
    destinataire: 'Direction générale des impôts (dépôt papier ou en ligne)',
    source: 'Loi de procédures fiscales, art. 1er · attribution d’office possible depuis la loi de finances n° 25/060',
    ecranDeclencheur: 'Structure > Paramètres du dossier · identifiants légaux',
  },
  {
    cle: 'engagementTravailleur',
    evenement: 'Engagement d’un travailleur',
    libelle: 'Déclaration d’engagement du travailleur',
    delai: 'Dans les quinze jours de l’engagement',
    destinataire: 'Ministère du Travail et ONEM ; visa ONEM du contrat écrit',
    source: 'Code du travail, titre X (moyens de contrôle) et titre IV',
  },
  {
    cle: 'proceValAssembleeGenerale',
    evenement: 'Tenue de l’assemblée générale approuvant les états financiers certifiés',
    libelle: 'Transmission du procès-verbal de l’assemblée générale',
    delai: 'Dans les dix jours de la tenue de l’assemblée',
    destinataire: 'Direction générale des impôts',
    source: 'Loi de procédures fiscales, art. 13 bis, créé par la loi de finances n° 25/060',
  },
  {
    cle: 'renouvellementFacilites',
    evenement: 'Approche du terme d’un arrêté interministériel de facilités (deux ans)',
    libelle: 'Demande de renouvellement des facilités administratives, fiscales et douanières',
    delai: 'Avant l’échéance des deux ans · le dossier de renouvellement comporte quatre pièces',
    destinataire: 'Ministère du Plan, puis arrêté interministériel Plan et Finances',
    source:
      'Loi n° 004/2001, art. 39 (étendu aux EUP par l’art. 67 al. 3) ; note circulaire n° 003/CAB/MIN/PL.SMRM/COFAF/2013 du 24 janvier 2013',
    // Aucune `formes` ici (l'art. 67 al. 3 étend le régime aux EUP), donc rien
    // ne l'aurait retenue côté SYSCOHADA sans ce filtre.
    referentiels: [Referentiel.SYCEBNL],
  },
];

/**
 * Obligations événementielles applicables à un dossier donné.
 *
 * Le référentiel est OBLIGATOIRE, et il l'est devenu au vu d'un constat
 * d'audit : cette table n'est encore servie par aucun écran, et c'est
 * précisément pour cela qu'elle pouvait rester fausse sans que rien ne le
 * dise. Le paramètre est posé maintenant, pendant qu'il ne casse personne,
 * plutôt qu'au moment où la liste sera branchée.
 */
export function obligationsEvenementiellesApplicables(contexte: {
  referentiel: Referentiel;
  formeJuridique: FormeJuridiqueEbnl;
  droitEtranger: boolean;
}): ObligationEvenementielle[] {
  return OBLIGATIONS_EVENEMENTIELLES.filter((o) => {
    if (o.referentiels && !o.referentiels.includes(contexte.referentiel)) return false;
    if (o.formes && !o.formes.includes(contexte.formeJuridique)) return false;
    if (o.droitEtrangerSeulement && !contexte.droitEtranger) return false;
    return true;
  });
}

/**
 * Filtre les jalons applicables à un dossier donné. Un planning qui affiche à
 * une association le dépôt au RCCM, ou à une entreprise le dépôt du compte
 * annuel au Ministère de la Justice, ne sert à personne.
 */
export function jalonsApplicables(contexte: {
  referentiel: Referentiel;
  formeJuridique: FormeJuridiqueEbnl;
  formeJuridiqueSyscohada?: FormeJuridiqueSyscohada | null;
  droitEtranger: boolean;
}): DefinitionJalon[] {
  return JALONS_CLOTURE.filter((j) => {
    if (j.referentiels && !j.referentiels.includes(contexte.referentiel)) return false;
    if (j.formes && !j.formes.includes(contexte.formeJuridique)) return false;
    // Forme OHADA NON renseignée = le jalon ne s'affiche pas. Le silence vaut
    // mieux qu'une obligation servie à une forme qui n'y est pas tenue.
    if (j.formesSyscohada && !(contexte.formeJuridiqueSyscohada && j.formesSyscohada.includes(contexte.formeJuridiqueSyscohada)))
      return false;
    if (j.droitEtrangerSeulement && !contexte.droitEtranger) return false;
    return true;
  });
}

/**
 * Applique un décalage à la date de clôture de l'exercice. Calculs en UTC,
 * comme partout ailleurs dans le logiciel : une date d'échéance ne doit pas
 * changer de jour selon le fuseau du poste qui l'affiche.
 */
export function dateJalon(dateFinExercice: Date, decalage: Decalage): Date {
  const annee = dateFinExercice.getUTCFullYear();
  const mois = dateFinExercice.getUTCMonth() + decalage.moisApres;
  if (decalage.jour === 'FIN') {
    // Jour 0 du mois suivant = dernier jour du mois visé.
    return new Date(Date.UTC(annee, mois + 1, 0));
  }
  return new Date(Date.UTC(annee, mois, decalage.jour));
}

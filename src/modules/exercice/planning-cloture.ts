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
 * AUCUN MONTANT ICI. Le cours cite deux arrêtés fixant des astreintes par jour
 * de retard sans en donner les taux ; un taux de 2013 non revérifié n'a rien à
 * faire dans un logiciel de 2026. Les jalons nomment les textes, le comptable
 * garde le chiffre. Même règle que src/modules/retenues/correspondance-retenues.ts.
 */

import { FormeJuridiqueEbnl, Referentiel } from '@prisma/client';

/** Toutes les formes relevant de la loi 004/2001 sur les ASBL. */
const FORMES_ASBL: FormeJuridiqueEbnl[] = [
  FormeJuridiqueEbnl.ASSOCIATION,
  FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE,
  FormeJuridiqueEbnl.ASSOCIATION_CONFESSIONNELLE,
];

/** Date de dernière vérification des échéances ci-dessous contre leur source. */
export const DERNIERE_VERIFICATION = '2026-08-29';

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
      'Amortissements, dépréciations, provisions, régularisations, actualisation des opérations en monnaies étrangères, écarts d’inventaire. Pour une EBNL, s’y ajoute le sort des fonds affectés non consommés (compte 17) et des fonds reportés.',
    nature: 'INTERNE',
    debut: { moisApres: 1, jour: 1 },
    echeance: { moisApres: 2, jour: 'FIN' },
    source: 'CPCC, § 7.1 point 4 et § 2.3 (« de janvier à mars »), adapté SYCEBNL (Partie 3, ch. 2)',
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
      'Transcription au livre d’inventaire du bilan et du compte de résultat, ainsi que du relevé des éléments d’actif et de passif. Obligation propre au SYCEBNL, absente du cours.',
    nature: 'LEGALE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 3, jour: 'FIN' },
    source: 'SYCEBNL, art. 14 de l’Acte uniforme',
    referentiels: [Referentiel.SYCEBNL],
    observation: 'INVENTAIRE',
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
      'Bilan, compte de résultat ou d’exploitation, tableau de flux de trésorerie ou tableau emplois-ressources, et les notes annexes du jeu retenu (35 pour une association ou un ordre professionnel, 24 pour un projet de développement, 5 pour le Système minimal de trésorerie). Le cours note que le tableau de flux ne s’applique pas au SMT.',
    nature: 'INTERNE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 4, jour: 15 },
    source: 'CPCC, § 7.1 point 8, adapté SYCEBNL (art. 4 à 13)',
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
  },
  {
    etape: 15,
    libelle: 'Mise à disposition de l’auditeur',
    detail:
      'Remise du projet d’états financiers à l’auditeur. Le cours parle du commissaire aux comptes ; pour une EBNL, la désignation d’un auditeur dépend des seuils de l’Acte uniforme (ressources annuelles, total du bilan, effectif salarié) et n’est pas systématique.',
    nature: 'INTERNE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 5, jour: 15 },
    source: 'CPCC, § 2.3 (« début mars au 15 mai »), adapté SYCEBNL (art. 19 à 22)',
  },
  {
    etape: 16,
    libelle: 'Rapport d’activité au Ministère du Plan et au ministère du secteur',
    detail:
      'Une ONG transmet périodiquement son rapport d’activité, pour évaluation physique, au Ministre ayant le Plan dans ses attributions et à celui en charge du secteur où elle opère. Elle l’informe également de ses projets et des ressources financières mobilisées. La loi dit « périodiquement » sans fixer de date : l’échéance retenue ici est un repère de fin de campagne annuelle, à caler sur l’accord-cadre pour une ONG étrangère.',
    nature: 'LEGALE',
    debut: { moisApres: 4, jour: 1 },
    echeance: { moisApres: 5, jour: 'FIN' },
    source: 'Loi n° 004/2001, art. 44 et 45',
    formes: [FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE],
  },
  {
    etape: 17,
    libelle: 'Dépôt au Ministère de l’Économie nationale',
    detail:
      'Le cours donne « au plus tard mi-juin » au § 7.3 et « au plus tard 15 juin » au § 2.3, avec une astreinte par jour de retard fixée par l’arrêté interministériel n° 013/CAB/MINECO/2013 et n° CAB/MIN/FINANCES/2013/1055 du 26 novembre 2013, dont le taux n’est pas repris ici. Le cours vise les entités du Système comptable OHADA ; son extension à une EBNL n’a pas pu être confirmée sur texte primaire.',
    nature: 'LEGALE',
    debut: { moisApres: 4, jour: 1 },
    echeance: { moisApres: 6, jour: 15 },
    source: 'CPCC, § 2.3 et § 7.3, portée pour une EBNL à confirmer sur texte primaire',
  },
  {
    etape: 18,
    libelle: 'Rapport d’activité et approbation des comptes',
    detail:
      'Établissement du rapport d’activité et approbation des états financiers par l’organe délibérant. Le cours rappelle que les comptes doivent être mis à la disposition des administrateurs quelques jours avant la réunion.',
    nature: 'INTERNE',
    debut: { moisApres: 4, jour: 1 },
    echeance: { moisApres: 6, jour: 'FIN' },
    source: 'CPCC, § 2.3 (« au plus tard fin juin »), adapté SYCEBNL (art. 16-3)',
    observation: 'RAPPORT_ACTIVITE',
  },
  {
    etape: 19,
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
    etape: 20,
    libelle: 'Dépôt au RCCM',
    detail:
      'Ne concerne pas une ASBL : l’article 1er de la loi n° 004/2001 en fait une entité qui « ne se livre pas à des opérations industrielles ou commerciales, si ce n’est à titre accessoire », donc non commerçante et non immatriculée au registre du commerce. Le jalon ne s’affiche que pour un dossier tenu en SYSCOHADA.',
    nature: 'LEGALE',
    debut: { moisApres: 7, jour: 1 },
    echeance: { moisApres: 7, jour: 'FIN' },
    source: 'CPCC, § 2.3 et § 7.3 ; loi n° 004/2001, art. 1er (exclusion des ASBL)',
    referentiels: [Referentiel.SYSCOHADA],
  },
  {
    etape: 21,
    libelle: 'Clôture et réouverture des livres',
    detail:
      'Clôture annuelle de l’exercice, soldant les classes 6 et 7 sur le résultat et générant le report à-nouveau dans l’exercice suivant. Le cours rappelle que la clôture interdit l’ajout, la modification et la suppression d’écritures, mais autorise le lettrage et le pointage : c’est bien le comportement d’OmegaX.',
    nature: 'INTERNE',
    debut: { moisApres: 7, jour: 1 },
    echeance: { moisApres: 8, jour: 'FIN' },
    source: 'CPCC, § 7.1 point 10 et § 2.3',
    observation: 'CLOTURE_ANNUELLE',
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
  },
  {
    cle: 'mouvementImmeuble',
    evenement: 'Acquisition ou aliénation d’un immeuble',
    libelle: 'Déclaration écrite du mouvement d’immeuble, prix indiqué',
    delai: 'Dans les trois mois de l’opération',
    destinataire: 'Ministre de la Justice, COPIE AU MINISTRE DES FINANCES',
    source: 'Loi n° 004/2001, art. 15',
    formes: FORMES_ASBL,
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
  },
];

/** Obligations événementielles applicables à un dossier donné. */
export function obligationsEvenementiellesApplicables(contexte: {
  formeJuridique: FormeJuridiqueEbnl;
  droitEtranger: boolean;
}): ObligationEvenementielle[] {
  return OBLIGATIONS_EVENEMENTIELLES.filter((o) => {
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
  droitEtranger: boolean;
}): DefinitionJalon[] {
  return JALONS_CLOTURE.filter((j) => {
    if (j.referentiels && !j.referentiels.includes(contexte.referentiel)) return false;
    if (j.formes && !j.formes.includes(contexte.formeJuridique)) return false;
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

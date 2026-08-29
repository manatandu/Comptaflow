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
 * AUCUN MONTANT ICI. Le cours cite deux arrêtés fixant des astreintes par jour
 * de retard sans en donner les taux ; un taux de 2013 non revérifié n'a rien à
 * faire dans un logiciel de 2026. Les jalons nomment les textes, le comptable
 * garde le chiffre. Même règle que src/modules/retenues/correspondance-retenues.ts.
 */

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
    libelle: 'Écritures d’inventaire',
    detail:
      'Amortissements, dépréciations, provisions, régularisations, actualisation des opérations en monnaies étrangères, écarts d’inventaire. Pour une EBNL, s’y ajoute le sort des fonds affectés non consommés (compte 17) et des fonds reportés.',
    nature: 'INTERNE',
    debut: { moisApres: 1, jour: 1 },
    echeance: { moisApres: 2, jour: 'FIN' },
    source: 'CPCC, § 7.1 point 4 et § 2.3 (« de janvier à mars »), adapté SYCEBNL (Partie 3, ch. 2)',
  },
  {
    etape: 5,
    libelle: 'Détermination du résultat',
    detail:
      'Excédent ou déficit de l’exercice, dégagé par le compte de résultat pour une association ou un ordre professionnel, par le compte d’exploitation pour un projet de développement.',
    nature: 'INTERNE',
    debut: { moisApres: 2, jour: 1 },
    echeance: { moisApres: 3, jour: 15 },
    source: 'CPCC, § 7.1 point 5, adapté SYCEBNL (art. 4 et Partie 4)',
  },
  {
    etape: 6,
    libelle: 'Balance définitive et révision des comptes',
    detail:
      'Balance définitive, puis révision compte par compte : justifier le solde de chaque poste repris au bilan. C’est le self-audit décrit au § 2.3.',
    nature: 'INTERNE',
    debut: { moisApres: 2, jour: 1 },
    echeance: { moisApres: 3, jour: 'FIN' },
    source: 'CPCC, § 7.1 point 6 et § 2.3',
  },
  {
    etape: 7,
    libelle: 'Livre d’inventaire',
    detail:
      'Transcription au livre d’inventaire du bilan et du compte de résultat, ainsi que du relevé des éléments d’actif et de passif. Obligation propre au SYCEBNL, absente du cours.',
    nature: 'LEGALE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 3, jour: 'FIN' },
    source: 'SYCEBNL, art. 14 de l’Acte uniforme',
    observation: 'INVENTAIRE',
  },
  {
    etape: 8,
    libelle: 'États financiers et notes annexes',
    detail:
      'Bilan, compte de résultat ou d’exploitation, tableau de flux de trésorerie ou tableau emplois-ressources, et les notes annexes du jeu retenu (35 pour une association ou un ordre professionnel, 24 pour un projet de développement, 5 pour le Système minimal de trésorerie). Le cours note que le tableau de flux ne s’applique pas au SMT.',
    nature: 'INTERNE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 4, jour: 15 },
    source: 'CPCC, § 7.1 point 8, adapté SYCEBNL (art. 4 à 13)',
  },
  {
    etape: 9,
    libelle: 'Registre des donateurs arrêté',
    detail:
      'Arrêté du registre des donateurs de l’exercice, dont la tenue est obligatoire pour une EBNL. Obligation propre au SYCEBNL, absente du cours.',
    nature: 'LEGALE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 4, jour: 'FIN' },
    source: 'SYCEBNL, art. 17 et 18 de l’Acte uniforme',
    observation: 'DONATEURS',
  },
  {
    etape: 10,
    libelle: 'Déclaration annuelle à la DGI',
    detail:
      'Dépôt de la déclaration annuelle auprès de l’administration fiscale. Le cours vise l’impôt sur les bénéfices et profits, qui n’existe plus sous ce nom depuis la loi n° 23/053. Une ASBL exonérée reste tenue de déclarer, y compris à zéro : voir docs/fiscalite-asbl-rdc.md.',
    nature: 'LEGALE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 4, jour: 'FIN' },
    source: 'CPCC, § 2.3 et § 7.3 (« au plus tard fin avril »), à confirmer sur texte primaire',
  },
  {
    etape: 11,
    libelle: 'Mise à disposition de l’auditeur',
    detail:
      'Remise du projet d’états financiers à l’auditeur. Le cours parle du commissaire aux comptes ; pour une EBNL, la désignation d’un auditeur dépend des seuils de l’Acte uniforme (ressources annuelles, total du bilan, effectif salarié) et n’est pas systématique.',
    nature: 'INTERNE',
    debut: { moisApres: 3, jour: 1 },
    echeance: { moisApres: 5, jour: 15 },
    source: 'CPCC, § 2.3 (« début mars au 15 mai »), adapté SYCEBNL (art. 19 à 22)',
  },
  {
    etape: 12,
    libelle: 'Dépôt au Ministère de l’Économie nationale',
    detail:
      'Le cours donne « au plus tard mi-juin » au § 7.3 et « au plus tard 15 juin » au § 2.3. Le retard est sanctionné par une astreinte par jour fixée par l’arrêté interministériel n° 013/CAB/MINECO/2013 et n° CAB/MIN/FINANCES/2013/1055 du 26 novembre 2013, dont le taux n’est pas repris ici.',
    nature: 'LEGALE',
    debut: { moisApres: 4, jour: 1 },
    echeance: { moisApres: 6, jour: 15 },
    source: 'CPCC, § 2.3 et § 7.3, à confirmer sur texte primaire',
  },
  {
    etape: 13,
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
    etape: 14,
    libelle: 'Dépôt au CPCC',
    detail:
      'Le retard est sanctionné par une astreinte par jour fixée par l’arrêté ministériel n° 024/CAB/MIN/FINANCES/2010 du 15 avril 2010, dont le taux n’est pas repris ici. Le cours rappelle par ailleurs l’ordonnance n° 81-094 du 29 juin 1981.',
    nature: 'LEGALE',
    debut: { moisApres: 6, jour: 1 },
    echeance: { moisApres: 6, jour: 'FIN' },
    source: 'CPCC, § 2.3 et § 7.3, à confirmer sur texte primaire',
  },
  {
    etape: 15,
    libelle: 'Dépôt au RCCM',
    detail:
      'Le § 7.3 fixe l’échéance à « la fin du mois qui suit leur approbation », le § 2.3 à « fin juillet » : les deux coïncident pour des comptes approuvés fin juin.',
    nature: 'LEGALE',
    debut: { moisApres: 7, jour: 1 },
    echeance: { moisApres: 7, jour: 'FIN' },
    source: 'CPCC, § 2.3 et § 7.3, à confirmer sur texte primaire',
  },
  {
    etape: 16,
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

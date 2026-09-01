import type { FormeJuridiqueSyscohada } from './types';

/**
 * FORMES JURIDIQUES D'UN DOSSIER SYSCOHADA · droit OHADA des affaires.
 *
 * Cette liste n'a AUCUNE valeur commune avec celle du SYCEBNL, qui vient de
 * la loi congolaise n° 004/2001 sur les ASBL. L'écran servait pourtant la
 * seconde aux deux référentiels, ce qui proposait « association
 * confessionnelle » à une SARL.
 *
 * Ce que le SYSCOHADA couvre est fixé par l'AUDCIF art. 2 : les entités
 * soumises à l'AUDCG, à l'AUSCGIE et à l'AUSCOOP, les entités publiques,
 * parapubliques et d'économie mixte. Son art. 5 en écarte les banques, la
 * microfinance, les acteurs du marché financier, l'assurance, la sécurité
 * sociale et les entités à but non lucratif.
 *
 * L'ordre suit celui du droit : les cinq sociétés commerciales par la forme
 * de l'AUSCGIE art. 6 d'abord, puis ce qui n'est pas une société commerciale.
 *
 * CAPITAL MINIMUM DE LA SARL · l'AUSCGIE art. 311 pose un million de FCFA
 * « sauf dispositions nationales contraires ». La RDC a pris ces dispositions,
 * par l'arrêté interministériel n° 002/CAB/MIN/JGS&DH/014 et
 * n° 243/CAB/MIN/FINANCES/2014 du 30 décembre 2014 : le capital de la SARL,
 * unipersonnelle ou pluripersonnelle, est LIBREMENT FIXÉ par les associés
 * compte tenu de l'objet social, et les statuts peuvent être établis sous
 * seing privé. Servir le million de l'article 311 à un client congolais
 * l'aurait dissuadé de créer une société qu'il pouvait constituer sans
 * apport minimal. Référence non lue au Journal officiel · confirmée par
 * plusieurs sources concordantes, à vérifier sur le texte primaire avant de
 * l'opposer à un tiers.
 */
export const FORMES_SYSCOHADA: {
  valeur: FormeJuridiqueSyscohada;
  titre: string;
  detail: string;
}[] = [
  {
    valeur: 'SOCIETE_ANONYME',
    titre: 'Société anonyme · SA',
    detail:
      "Actionnaires responsables à concurrence de leurs apports, droits représentés par des actions (art. 385). Peut n'avoir qu'un seul actionnaire. Capital minimum 10 000 000 FCFA (art. 387). Commissaire aux comptes OBLIGATOIRE, sans condition de taille (art. 702).",
  },
  {
    valeur: 'SOCIETE_PAR_ACTIONS_SIMPLIFIEE',
    titre: 'Société par actions simplifiée · SAS ou SASU',
    detail:
      "Un ou plusieurs associés, dont les statuts organisent librement le fonctionnement (art. 853-1). Le régime de la SA s'y applique par renvoi, sauf le capital minimum et tout le titre des assemblées (art. 853-3) · le capital est donc libre. Appel public à l'épargne interdit.",
  },
  {
    valeur: 'SOCIETE_RESPONSABILITE_LIMITEE',
    titre: 'Société à responsabilité limitée · SARL',
    detail:
      "Associés responsables à concurrence de leurs apports, droits représentés par des parts sociales (art. 309). Un seul associé possible. AUCUN CAPITAL MINIMUM EN RDC : l'article 311 fixe un million de FCFA « sauf dispositions nationales contraires », et la RDC a usé de cette réserve · le capital est librement fixé par les associés compte tenu de l'objet social. Le même texte rend le recours au notaire facultatif, les statuts pouvant être établis sous seing privé.",
  },
  {
    valeur: 'SOCIETE_NOM_COLLECTIF',
    titre: 'Société en nom collectif · SNC',
    detail:
      'Tous les associés sont commerçants et répondent INDÉFINIMENT ET SOLIDAIREMENT des dettes sociales (art. 270). Un créancier ne peut toutefois les poursuivre que soixante jours après une mise en demeure restée vaine (art. 271).',
  },
  {
    valeur: 'SOCIETE_COMMANDITE_SIMPLE',
    titre: 'Société en commandite simple · SCS',
    detail:
      "Deux catégories d'associés coexistent : les COMMANDITÉS, indéfiniment et solidairement responsables, et les COMMANDITAIRES, tenus dans la limite de leurs apports (art. 293). Le nom d'un commanditaire dans la dénomination lui fait perdre cette limite (art. 294).",
  },
  {
    valeur: 'GROUPEMENT_INTERET_ECONOMIQUE',
    titre: 'Groupement d’intérêt économique · GIE',
    detail:
      "Facilite ou développe l'activité économique de ses membres, à titre AUXILIAIRE de la leur, et ne partage pas de bénéfices (art. 869 et 870). Peut être constitué sans capital. Mais ses membres répondent des dettes sur leur patrimoine propre, et solidairement (art. 873).",
  },
  {
    valeur: 'SOCIETE_COOPERATIVE',
    titre: 'Société coopérative · SCOOPS ou COOP-CA',
    detail:
      "Groupement autonome de personnes, propriété et gestion collectives, pouvoir exercé démocratiquement (AUSCOOP art. 4). Simplifiée à partir de cinq membres (art. 204), avec conseil d'administration à partir de quinze (art. 267). Immatriculée au Registre des Sociétés Coopératives, PAS au registre du commerce (art. 206).",
  },
  {
    valeur: 'ENTREPRISE_INDIVIDUELLE',
    titre: 'Entreprise individuelle · commerçant personne physique',
    detail:
      "Personne physique qui fait de l'accomplissement d'actes de commerce sa profession (AUDCG art. 2). Immatriculée au registre du commerce, elle tient les livres de commerce du droit comptable OHADA (art. 13).",
  },
  {
    valeur: 'ENTREPRENANT',
    titre: 'Entreprenant',
    detail:
      "Entrepreneur individuel, personne physique exerçant une activité civile, commerciale, artisanale ou agricole sur simple DÉCLARATION (AUDCG art. 30 et 62). DISPENSÉ d'immatriculation au registre du commerce. Il conserve ce statut tant que son chiffre d'affaires reste sous les seuils du Système minimal de trésorerie sur deux exercices successifs ; au-delà, il le perd dès le premier trimestre de l'année suivante.",
  },
  {
    valeur: 'SUCCURSALE',
    titre: 'Succursale',
    detail:
      "Établissement doté d'une certaine autonomie de gestion mais SANS personnalité juridique distincte de son propriétaire (art. 116 et 117). Celle d'une personne étrangère doit être apportée à une société de droit d'un État partie dans les deux ans, sauf dispense ministérielle de deux ans non renouvelable (art. 120).",
  },
  {
    valeur: 'ENTITE_PUBLIQUE',
    titre: 'Entité publique, parapublique ou d’économie mixte',
    detail:
      "Visée en propre par l'AUDCIF art. 2, à l'exception de celles soumises aux règles de la comptabilité publique · celles-là relèvent d'un autre référentiel, pas du SYSCOHADA.",
  },
  {
    valeur: 'AUTRE',
    titre: 'Autre',
    detail:
      "Toute autre entité produisant des biens ou des services marchands ou non marchands, dans un but lucratif ou non, à titre principal ou accessoire, sur la base d'actes répétitifs (AUDCIF art. 2).",
  },
];

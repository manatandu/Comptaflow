import { RoleUtilisateur } from '@prisma/client';

/**
 * TEST DES ÉCRITURES DE JOURNAL · ISA 240, § 33 a).
 *
 * C'est une EXIGENCE, pas une modalité, et elle ne dépend d'aucune évaluation
 * préalable : « INDÉPENDAMMENT de son évaluation des risques de contournement
 * des contrôles par la direction, l'auditeur doit concevoir et mettre en œuvre
 * des procédures d'audit destinées a) à vérifier le caractère approprié des
 * écritures de journal enregistrées dans le grand livre général et des autres
 * ajustements effectués lors de l'établissement des états financiers », en
 * particulier « ii) sélectionner des écritures de journal et d'autres
 * ajustements effectués à la fin de la période ».
 *
 * Les caractéristiques retenues ci-dessous sont celles que la norme énumère
 * elle-même, au § A44 (modalités d'application, valeur explicative) : les
 * écritures incorrectes « présentent souvent des caractéristiques
 * particulières. Il peut notamment s'agir d'écritures a) enregistrées dans des
 * comptes sans lien entre eux, inhabituels ou rarement utilisés, b) passées
 * par des personnes qui ne sont pas censées enregistrer d'écritures,
 * c) inscrites en fin de période ou après la date de clôture avec peu ou pas
 * de justification ou de description, d) passées sans numéro de compte soit
 * avant ou pendant la préparation des états financiers, ou e) comportant des
 * chiffres ronds ou qui se terminent invariablement par les mêmes chiffres ».
 *
 * DEUX CHOSES QUE CE MODULE NE FAIT PAS, ET C'EST VOULU.
 *
 * Il ne conclut pas. Une écriture retenue n'est ni douteuse ni frauduleuse ·
 * elle est SÉLECTIONNÉE, au sens du § 33 a) ii), et c'est l'auditeur qui la
 * teste. Un logiciel qui écrirait « anomalie » sur un montant rond ferait dire
 * à la norme le contraire de ce qu'elle dit.
 *
 * Il ne remplace pas le § 33 a) i), qui demande de « s'enquérir AUPRÈS DES
 * PERSONNES participant au processus d'information financière ». Aucune
 * requête ne fait un entretien.
 *
 * LA CARACTÉRISTIQUE d) EST SANS OBJET ICI · une écriture sans numéro de
 * compte ne peut pas exister dans OmegaX, la ligne portant une clé étrangère
 * obligatoire vers le compte. Elle est nommée quand même, pour que la lecture
 * de la liste ne laisse pas croire à un oubli.
 */

/** Une caractéristique du § A44, et ce qu'OmegaX sait en observer. */
export interface CritereIsa240 {
  cle: string;
  /** La lettre du § A44, ou le sous-alinéa du § 33 quand il y a exigence. */
  source: string;
  titre: string;
  /** Le texte cité, jamais reformulé · c'est lui qui rend la sélection opposable. */
  citation: string;
  /** Ce que le logiciel mesure exactement, dit sans euphémisme. */
  mesure: string;
}

/**
 * SEUILS · déclarés ici plutôt qu'enfouis dans une requête, parce qu'un
 * auditeur doit pouvoir dire à quoi tient sa sélection. Aucun ne vient de la
 * norme, qui n'en fixe aucun : ce sont des conventions de lecture, et elles
 * s'annoncent comme telles dans le classeur produit.
 */
export const SEUILS_ISA_240 = {
  /** « en fin de période » · les derniers jours de l'exercice. */
  joursFinDePeriode: 7,
  /** « peu ou pas de justification ou de description ». */
  longueurLibelleCourt: 12,
  /** « chiffres ronds » · un montant exactement multiple de ce pas. */
  pasMontantRond: 1_000_000,
  /** Sous ce montant, la rondeur ne dit rien · une cotisation vaut 5 000. */
  planckMontantRond: 1_000_000,
  /** « rarement utilisés » · comptes mouvementés au plus n fois sur l'exercice. */
  mouvementsCompteRare: 2,
} as const;

export const CRITERES_ISA_240: CritereIsa240[] = [
  {
    cle: 'FIN_DE_PERIODE',
    source: 'ISA 240, § 33 a) ii) · exigence',
    titre: 'Écritures de fin de période',
    citation:
      "sélectionner des écritures de journal et d'autres ajustements effectués à la fin de la période",
    mesure: `écritures datées des ${SEUILS_ISA_240.joursFinDePeriode} derniers jours de l'exercice`,
  },
  {
    cle: 'SAISIE_APRES_CLOTURE',
    source: 'ISA 240, § A44 c)',
    titre: 'Saisies après la date de clôture',
    citation: 'inscrites en fin de période ou après la date de clôture',
    mesure:
      "écritures dont la date de SAISIE est postérieure au dernier jour de l'exercice · " +
      "l'écart entre la date comptable et la date de saisie est ce que l'AUDCIF art. 22, 4° " +
      'appelle la date de valeur, « mentionnée distinctement »',
  },
  {
    cle: 'SANS_JUSTIFICATION',
    source: 'ISA 240, § A44 c)',
    titre: 'Peu ou pas de justification',
    citation: 'avec peu ou pas de justification ou de description',
    mesure:
      `libellé vide ou de moins de ${SEUILS_ISA_240.longueurLibelleCourt} caractères, ` +
      'ou écriture sans référence de pièce justificative',
  },
  {
    cle: 'AUTEUR_INATTENDU',
    source: 'ISA 240, § A44 b)',
    titre: "Passées par une personne qui n'est pas censée en passer",
    citation: "passées par des personnes qui ne sont pas censées enregistrer d'écritures",
    mesure:
      "écritures dont l'auteur n'a pas le rôle Comptable · un administrateur du cabinet peut " +
      "techniquement saisir, et c'est précisément le cas que la norme nomme",
  },
  {
    cle: 'MONTANT_ROND',
    source: 'ISA 240, § A44 e)',
    titre: 'Chiffres ronds',
    citation: 'comportant des chiffres ronds ou qui se terminent invariablement par les mêmes chiffres',
    mesure:
      `écritures d'au moins ${SEUILS_ISA_240.planckMontantRond.toLocaleString('fr-FR')} dont le total ` +
      `est exactement multiple de ${SEUILS_ISA_240.pasMontantRond.toLocaleString('fr-FR')}`,
  },
  {
    cle: 'COMPTE_RARE',
    source: 'ISA 240, § A44 a)',
    titre: 'Comptes rarement utilisés',
    citation: 'enregistrées dans des comptes sans lien entre eux, inhabituels ou rarement utilisés',
    mesure:
      `écritures touchant un compte mouvementé au plus ${SEUILS_ISA_240.mouvementsCompteRare} fois ` +
      "sur l'exercice · le « sans lien entre eux » relève du jugement, pas de la requête",
  },
];

/** Les rôles qui n'ont pas vocation à passer des écritures (§ A44 b)). */
export const ROLES_NON_SAISISSEURS: RoleUtilisateur[] = [
  RoleUtilisateur.ADMIN_CABINET,
  RoleUtilisateur.LECTURE_SEULE,
];

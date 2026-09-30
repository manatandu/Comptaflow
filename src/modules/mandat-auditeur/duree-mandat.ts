import { FormeJuridiqueSyscohada, Referentiel } from '@prisma/client';

/**
 * DURÉE DU MANDAT DU CONTRÔLEUR DES COMPTES · trois durées, et le contrôle en
 * réclamait une qu'il ne détenait pas.
 *
 * `regles-auditeur.ts` sait depuis longtemps QUI doit désigner un contrôleur
 * des comptes. Ce qu'aucune table ne portait, c'est le MANDAT lui-même · le
 * contrôle 6 dit pourtant, en toutes lettres, « Vérifiez que le mandat est en
 * cours et que le commissaire recevra les comptes en temps utile ». Il
 * réclamait donc au cabinet une vérification que le logiciel rendait
 * impossible, exactement comme `Tenant.longueurCompte` promettait une méthode
 * qui n'existait pas.
 *
 * TROIS DURÉES, LUES À LEUR SOURCE, ET ELLES NE SE SERVENT JAMAIS L'UNE POUR
 * L'AUTRE :
 *
 *  · SYCEBNL art. 21 · « L'auditeur est nommé pour TROIS (3) exercices
 *    RENOUVELABLES UNE FOIS. Toutefois, si l'entité a une existence inférieure
 *    à trois exercices, son mandat est ramené à cette durée. » ;
 *  · AUSCGIE art. 704, SA · DEUX exercices quand le commissaire est désigné
 *    dans les statuts ou par l'assemblée générale constitutive, SIX quand il
 *    l'est par l'assemblée générale ordinaire. La durée dépend donc de
 *    l'ORGANE, pas seulement de la forme ;
 *  · AUSCGIE art. 379, SARL · TROIS exercices.
 *
 * LE PIÈGE EST LE « TROIS », et c'est la neuvième fois que ce dossier
 * rencontre « un nombre, deux sens » après le 192, le 4181, le 1061/1062, le
 * 38/37, le 397, l'article 11 et le taux de TVA de la grille. Le trois du
 * SYCEBNL est RENOUVELABLE UNE FOIS et pas davantage ; le trois de la SARL
 * n'est assorti d'aucune limite de renouvellement dans l'art. 379. Appliquer
 * la limite du SYCEBNL à une SARL inventerait une interdiction ; ne pas
 * l'appliquer à une association laisserait passer un troisième mandat que le
 * texte refuse.
 *
 * CE QUE LE MODULE NE SAIT PAS, ET LE DIT. La SAS (art. 853-13), la SNC
 * (art. 289-1), la société en commandite simple, la coopérative et
 * l'entreprenant n'ont, dans les textes lus, AUCUNE durée de mandat chiffrée ·
 * le GIE en a une, six exercices, quand il émet des obligations (art. 880) ·
 * l'art. 853-13 renvoie aux conditions de nomination de l'art. 853-11 sans
 * fixer de durée. La durée y est donc SAISIE, avec la mention que le logiciel
 * ne la connaît pas. Une règle absente est déclarée absente · elle n'est pas
 * remplacée par la plus proche, même discipline que `regles-auditeur.ts`.
 */

/** Qui a désigné le contrôleur · la durée en dépend chez la société anonyme. */
export type OrganeDesignation =
  | 'STATUTS_OU_AG_CONSTITUTIVE'
  | 'ASSEMBLEE_GENERALE_ORDINAIRE'
  | 'ASSOCIES'
  | 'BAILLEUR_OU_ETAT'
  | 'JURIDICTION';

export interface DureeMandat {
  /** Nombre d'exercices, ou `null` quand aucun texte lu n'en fixe. */
  exercices: number | null;
  /** Nombre total de mandats permis, ou `null` quand aucun texte lu ne le borne. */
  mandatsMaximum: number | null;
  source: string;
}

export function dureeMandat(
  referentiel: Referentiel,
  formeJuridique: FormeJuridiqueSyscohada | null,
  organe: OrganeDesignation,
  // GIE seulement · émet-il des obligations (compte 161) ? `null` quand les
  // livres n'ont pas été interrogés.
  gieEmetDesObligations: boolean | null = null,
): DureeMandat {
  if (referentiel === Referentiel.SYCEBNL) {
    return {
      exercices: 3,
      // « renouvelables une fois » · le mandat initial PLUS un renouvellement,
      // soit deux mandats et pas un de plus.
      mandatsMaximum: 2,
      source: 'SYCEBNL art. 21',
    };
  }
  switch (formeJuridique) {
    case FormeJuridiqueSyscohada.SOCIETE_ANONYME:
      return organe === 'STATUTS_OU_AG_CONSTITUTIVE'
        ? { exercices: 2, mandatsMaximum: null, source: 'AUSCGIE art. 704, premier alinéa' }
        : { exercices: 6, mandatsMaximum: null, source: 'AUSCGIE art. 704, second alinéa' };
    case FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE:
      return { exercices: 3, mandatsMaximum: null, source: 'AUSCGIE art. 379' };
    case FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE:
      // AUSCGIE art. 880 · le contrôle des états financiers est celui du
      // CONTRAT (al. 1er), SAUF émission d'obligations (art. 875) : le
      // commissaire aux comptes est alors « nommé par l'assemblée pour une
      // durée de six (6) exercices » (al. 4). « Aucun texte lu ne fixe de
      // durée » était faux dans ce cas (passe O1b-G7).
      if (gieEmetDesObligations) {
        return { exercices: 6, mandatsMaximum: null, source: 'AUSCGIE art. 880, quatrième alinéa (GIE émetteur d’obligations)' };
      }
      return {
        exercices: null,
        mandatsMaximum: null,
        source:
          'AUSCGIE art. 880 · la durée est celle du contrat du groupement, sauf émission d’obligations (art. 875), ' +
          'où le commissaire aux comptes est nommé pour six exercices · à saisir.',
      };
    default:
      // SAS, SNC, commandite simple, coopérative, entreprenant · aucun
      // texte lu ne chiffre la durée. La saisir est la seule réponse honnête.
      return {
        exercices: null,
        mandatsMaximum: null,
        source:
          'Aucun texte lu ne fixe de durée de mandat pour cette forme · la durée est celle de l’acte de ' +
          'désignation, à saisir.',
      };
  }
}

/**
 * DERNIER EXERCICE COUVERT. L'art. 705 de l'AUSCGIE le dit pour la SA et la
 * règle vaut partout : les fonctions expirent « à l'issue de l'assemblée
 * générale qui statue […] sur les comptes du DEUXIÈME exercice […] ou du
 * SIXIÈME exercice ». Le mandat couvre donc N exercices À COMPTER du premier
 * inclus · un mandat de trois exercices ouvert sur 2026 couvre 2026, 2027 et
 * 2028, pas 2029.
 *
 * L'erreur d'un rang ne casse rien et ne se voit nulle part : le dossier
 * croirait simplement son contrôleur en fonction un an de trop, ou le
 * remplacerait un an trop tôt.
 */
export function dernierExerciceCouvert(premierExercice: number, exercices: number): number {
  return premierExercice + exercices - 1;
}

/**
 * LA PROROGATION D'UN MANDAT ÉCHU · deux textes la portent, chacun pour les
 * siens, et aucun autre texte lu (audit final F69). Le contrôle la servait à
 * tout dossier en citant le SYCEBNL art. 22 · une société lisait que son
 * commissaire était prorogé par un texte qui ne la régit pas.
 *
 *  · SYCEBNL art. 22 · la mission de l'auditeur « est PROROGÉE, sauf refus
 *    exprès de sa part », jusqu'à la plus prochaine assemblée statuant sur
 *    les comptes ;
 *  · AUSCGIE art. 709, pour la SA · « Si l'assemblée omet de renouveler le
 *    mandat d'un commissaire aux comptes ou de le remplacer à l'expiration de
 *    son mandat et, sauf refus exprès du commissaire, sa mission est prorogée
 *    jusqu'à la plus prochaine assemblée générale ordinaire annuelle. »
 *
 * La SARL n'y est pas · l'art. 377 ne renvoie aux art. 694 et suivants que
 * pour le CHOIX du commissaire, et l'art. 381 renvoie ses fonctions à un
 * texte particulier que le corpus ne porte pas. Aucune prorogation ne lui est
 * donc servie, ni aux autres formes · une règle absente n'est jamais
 * remplacée par la plus proche.
 */
export function regleDeProrogation(
  referentiel: Referentiel,
  formeJuridique: FormeJuridiqueSyscohada | null,
): { source: string; citation: string } | null {
  if (referentiel === Referentiel.SYCEBNL) {
    return {
      source: 'SYCEBNL art. 22',
      citation:
        '« si l’assemblée […] ne procède pas au renouvellement du mandat de l’auditeur ou à son remplacement à ' +
        'l’expiration de son mandat, la mission de l’auditeur est PROROGÉE, sauf refus exprès de sa part », ' +
        'jusqu’à « la plus prochaine assemblée générale […] statuant sur les comptes »',
    };
  }
  if (formeJuridique === FormeJuridiqueSyscohada.SOCIETE_ANONYME) {
    return {
      source: 'AUSCGIE art. 709',
      citation:
        '« Si l’assemblée omet de renouveler le mandat d’un commissaire aux comptes ou de le remplacer à ' +
        'l’expiration de son mandat et, sauf refus exprès du commissaire, sa mission est prorogée jusqu’à la ' +
        'plus prochaine assemblée générale ordinaire annuelle. »',
    };
  }
  return null;
}

/**
 * LA PROROGATION NE COUVRE QU'UN EXERCICE · elle court jusqu'à la PLUS
 * PROCHAINE assemblée qui statue sur les comptes. Le mandat couvrant jusqu'à
 * l'exercice L expire à l'assemblée qui statue sur L ; prorogé, il tient
 * jusqu'à celle qui statue sur L + 1, et c'est tout. Un mandat échu depuis
 * trois ans ne proroge plus rien.
 */
export function estDansLaProrogation(premierExercice: number, exercices: number, anneeExercice: number): boolean {
  return anneeExercice === dernierExerciceCouvert(premierExercice, exercices) + 1;
}

/**
 * DURÉE RAMENÉE À L'EXISTENCE DE L'ENTITÉ · SYCEBNL art. 21, seconde phrase, et
 * seulement là : « si l'entité a une existence inférieure à trois exercices,
 * son mandat est ramené à cette durée ». Aucun article de l'AUSCGIE lu ne
 * porte cette réduction · la transposer à une SARL naissante raccourcirait un
 * mandat que le texte ne raccourcit pas.
 *
 * OMEGAX NE MESURE PAS CETTE EXISTENCE (audit final F18). Il la lisait dans le
 * nombre d'exercices OUVERTS DANS LE LOGICIEL · une association de vingt ans
 * qui entre avec un exercice ne pouvait enregistrer qu'un mandat d'un an, et le
 * contrôle 28 déclarait échu, l'année suivante, un mandat de trois ans en
 * cours. Le texte ne dit d'ailleurs pas s'il vise l'existence écoulée ou
 * prévue (un projet a une durée). La réduction se SAISIT donc · une durée plus
 * courte est admise au SYCEBNL, jamais une plus longue.
 */
export function motifRefusDuree(referentiel: Referentiel, duree: number | null, saisie: number): string | null {
  if (duree === null) return null;
  if (referentiel === Referentiel.SYCEBNL) {
    return Number.isInteger(saisie) && saisie >= 1 && saisie <= duree ? null : `au plus ${duree} exercice(s)`;
  }
  return saisie === duree ? null : `${duree} exercice(s)`;
}

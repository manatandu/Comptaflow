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
 * (art. 289-1), la société en commandite simple, le GIE, la coopérative et
 * l'entreprenant n'ont, dans les textes lus, AUCUNE durée de mandat chiffrée ·
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
    default:
      // SAS, SNC, commandite simple, GIE, coopérative, entreprenant · aucun
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
 * DURÉE RAMENÉE À L'EXISTENCE DE L'ENTITÉ · SYCEBNL art. 21, seconde phrase, et
 * seulement là. Aucun article de l'AUSCGIE lu ne porte cette réduction : la
 * transposer à une SARL naissante raccourcirait un mandat que le texte ne
 * raccourcit pas.
 */
export function dureeRamenee(
  referentiel: Referentiel,
  duree: number | null,
  exercicesDeLEntite: number,
): number | null {
  if (duree === null) return null;
  if (referentiel !== Referentiel.SYCEBNL) return duree;
  return Math.min(duree, Math.max(exercicesDeLEntite, 1));
}

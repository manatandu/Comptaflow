import { FormeJuridiqueSyscohada, SystemeComptableSyscohada } from '@prisma/client';
import type { EtatATranscrire } from './correspondance-inventaire';

/**
 * DOCUMENTS OBLIGATOIRES DU CHEMIN SYSCOHADA.
 *
 * La fenêtre « Documents obligatoires » était fermée au seul SYCEBNL. Ce
 * n'était pas parce que l'AUDCIF n'en exige pas · son article 19 impose le
 * livre d'inventaire à toute entité, et l'AUSCGIE le rapport de gestion à
 * toute société commerciale. C'était parce que la fenêtre était montée sur
 * les articles du SYCEBNL, et qu'aucune table ne portait leurs équivalents.
 *
 * Rien n'est transposé d'un référentiel à l'autre : chaque table ci-dessous
 * est lue dans SON texte. Les rédactions ne se recouvrent pas, et c'est
 * précisément ce qu'une transposition aurait effacé.
 */

// ---------------------------------------------------------------------------
// Livre d'inventaire · AUDCIF, article 19
// ---------------------------------------------------------------------------

/**
 * « le LIVRE D'INVENTAIRE, sur lequel sont transcrits le Bilan, le Compte de
 * résultat et le Tableau des flux de trésorerie de chaque exercice, ainsi que
 * le résumé de l'opération d'inventaire. » (AUDCIF, art. 19)
 *
 * Trois états, dans l'ordre du texte. L'article ne subordonne cette liste à
 * aucune condition de taille ni de forme juridique.
 */
export const ETATS_INVENTAIRE_SYSTEME_NORMAL: EtatATranscrire[] = [
  { cle: 'bilan', libelle: 'Bilan', disponible: true },
  { cle: 'compteDeResultat', libelle: 'Compte de résultat', disponible: true },
  { cle: 'tableauFluxTresorerie', libelle: 'Tableau des flux de trésorerie', disponible: true },
];

/**
 * SYSTÈME MINIMAL DE TRÉSORERIE · et c'est ici qu'il faut une LECTURE, pas
 * une transcription. Elle est écrite pour pouvoir être discutée.
 *
 * L'article 19 nomme le Tableau des flux de trésorerie et ne prévoit AUCUNE
 * exception pour les petites entités. Mais le jeu d'états du SMT n'en comporte
 * pas : l'article 13 y assujettit les entités sous les seuils, et le Titre X
 * qui en fixe la présentation avertit que « les deux ne se transposent pas ·
 * le SMT repose sur une comptabilité de TRÉSORERIE, pas sur une comptabilité
 * d'engagement », son jeu se limitant au Bilan, au Compte de résultat et aux
 * notes 1 à 4. Un tableau des FLUX de trésorerie dressé sur une comptabilité
 * de trésorerie n'aurait d'ailleurs rien à expliquer.
 *
 * Sont donc transcrits les deux états que le système produit réellement. La
 * lacune est celle du texte, qui n'a pas articulé son article 19 avec son
 * article 13 · elle est signalée ici, jamais comblée en silence.
 *
 * Même raisonnement, et même conclusion, que pour le SMT du SYCEBNL (voir
 * ETATS_INVENTAIRE_SMT dans correspondance-inventaire.ts).
 */
export const ETATS_INVENTAIRE_SMT_SYSCOHADA: EtatATranscrire[] = [
  { cle: 'bilan', libelle: 'Bilan', disponible: true },
  { cle: 'compteDeResultat', libelle: 'Compte de résultat', disponible: true },
];

export function etatsExigesParSysteme(systeme: SystemeComptableSyscohada | null): EtatATranscrire[] {
  return systeme === SystemeComptableSyscohada.MINIMAL_TRESORERIE
    ? ETATS_INVENTAIRE_SMT_SYSCOHADA
    : ETATS_INVENTAIRE_SYSTEME_NORMAL;
}

// ---------------------------------------------------------------------------
// Rapport de gestion
// ---------------------------------------------------------------------------

export interface SectionRapportGestion {
  cle: string;
  titre: string;
  /** La citation qui fonde la section, dans le texte qui la fonde. */
  exigence: string;
}

/**
 * AUSCGIE, article 138, cité en entier :
 *
 *   « Le gérant, le conseil d'administration ou l'administrateur général,
 *   selon le cas, établit un rapport de gestion dans lequel il expose la
 *   situation de la société durant l'exercice écoulé, son évolution
 *   prévisible, les événements importants survenus entre la date de clôture
 *   de l'exercice et la date à laquelle il est établi et, EN PARTICULIER, les
 *   perspectives de continuation de l'activité, l'évolution de la situation
 *   de trésorerie et le plan de financement. »
 *
 * Six choses nommées : trois que le rapport « expose », puis trois que le
 * texte détache par « en particulier ». Elles sont ici SIX SECTIONS et non
 * trois, pour qu'une section restée vide se signale d'elle-même · le « en
 * particulier » n'atténue pas l'exigence, il l'appuie. C'est une lecture de
 * présentation, elle ne change aucun contenu.
 */
export const SECTIONS_RAPPORT_GESTION_AUSCGIE: SectionRapportGestion[] = [
  {
    cle: 'situationExerciceEcoule',
    titre: "Situation de la société durant l'exercice écoulé",
    exigence: "AUSCGIE art. 138 : « il expose la situation de la société durant l'exercice écoulé ».",
  },
  {
    cle: 'evolutionPrevisible',
    titre: 'Évolution prévisible',
    exigence: 'AUSCGIE art. 138 : « son évolution prévisible ».',
  },
  {
    cle: 'evenementsPosterieurs',
    titre: 'Événements importants survenus depuis la clôture',
    exigence:
      "AUSCGIE art. 138 : « les événements importants survenus entre la date de clôture de l'exercice et la date à laquelle il est établi ».",
  },
  {
    cle: 'continuationActivite',
    titre: "Perspectives de continuation de l'activité",
    exigence: "AUSCGIE art. 138 : « et, en particulier, les perspectives de continuation de l'activité ».",
  },
  {
    cle: 'evolutionTresorerie',
    titre: 'Évolution de la situation de trésorerie',
    exigence: "AUSCGIE art. 138 : « l'évolution de la situation de trésorerie ».",
  },
  {
    cle: 'planFinancement',
    titre: 'Plan de financement',
    exigence: 'AUSCGIE art. 138 : « et le plan de financement ».',
  },
];

/**
 * AUSCOOP, article 108 · LA RÉDACTION N'EST PAS CELLE DE L'AUSCGIE, et c'est
 * pourquoi la coopérative a sa propre table :
 *
 *   « Le comité de gestion ou le conseil d'administration, selon le cas,
 *   établit un rapport de gestion dans lequel il expose la situation de la
 *   société coopérative durant l'exercice écoulé, son évolution prévisible
 *   et, en particulier, les perspectives de continuation de l'activité,
 *   l'évolution de la situation de trésorerie et le plan de financement.
 *
 *   Le comité de gestion ou le conseil d'administration expose également dans
 *   ce rapport, l'ÉTAT DE PROMOTION DES COOPÉRATEURS. »
 *
 * Deux écarts avec l'article 138, dans les deux sens : l'AUSCOOP ne demande
 * PAS les événements postérieurs à la clôture, et il demande EN PLUS l'état
 * de promotion des coopérateurs, qui n'a aucun équivalent en société
 * commerciale. Servir l'article 138 à une coopérative lui inventerait une
 * exigence et lui en cacherait une autre.
 */
export const SECTIONS_RAPPORT_GESTION_AUSCOOP: SectionRapportGestion[] = [
  {
    cle: 'situationExerciceEcoule',
    titre: "Situation de la société coopérative durant l'exercice écoulé",
    exigence:
      "AUSCOOP art. 108 : « il expose la situation de la société coopérative durant l'exercice écoulé ».",
  },
  {
    cle: 'evolutionPrevisible',
    titre: 'Évolution prévisible',
    exigence: 'AUSCOOP art. 108 : « son évolution prévisible ».',
  },
  {
    cle: 'continuationActivite',
    titre: "Perspectives de continuation de l'activité",
    exigence: "AUSCOOP art. 108 : « et, en particulier, les perspectives de continuation de l'activité ».",
  },
  {
    cle: 'evolutionTresorerie',
    titre: 'Évolution de la situation de trésorerie',
    exigence: "AUSCOOP art. 108 : « l'évolution de la situation de trésorerie ».",
  },
  {
    cle: 'planFinancement',
    titre: 'Plan de financement',
    exigence: 'AUSCOOP art. 108 : « et le plan de financement ».',
  },
  {
    cle: 'promotionCooperateurs',
    titre: 'État de promotion des coopérateurs',
    exigence:
      "AUSCOOP art. 108, alinéa 2 : « Le comité de gestion ou le conseil d'administration expose également dans ce rapport, l'état de promotion des coopérateurs ».",
  },
];

export type RegleRapportGestion =
  | { genre: 'EXIGE'; source: string; organe: string; sections: SectionRapportGestion[] }
  | { genre: 'AUCUNE_REGLE_LUE'; motif: string };

/**
 * QUI DOIT ÉTABLIR UN RAPPORT DE GESTION.
 *
 * Même discipline que `regles-auditeur.ts` : une forme dont aucun texte lu
 * n'impose le rapport ne se voit PAS servir celui de la forme voisine. Une
 * règle absente est déclarée absente.
 *
 *  · les CINQ sociétés commerciales de l'AUSCGIE art. 6 · article 138, dont
 *    l'article 137 qui le précède vaut « à la clôture de chaque exercice »
 *    pour toute société commerciale ;
 *  · la société coopérative · AUSCOOP article 108, texte distinct ;
 *  · le GIE · AUCUNE règle lue. L'AUSCGIE y prévoit au contraire que « le
 *    contrôle de la gestion et le contrôle des états financiers de synthèse
 *    sont exercés dans les conditions prévues par LE CONTRAT » · c'est le
 *    contrat constitutif qui décide, pas l'Acte uniforme ;
 *  · l'entreprise individuelle et l'entreprenant · aucun organe de gestion,
 *    aucune assemblée devant qui rendre compte. L'article 138 nomme « le
 *    gérant, le conseil d'administration ou l'administrateur général » : un
 *    commerçant personne physique n'est aucun des trois.
 *
 * Le livre d'inventaire, LUI, reste dû par tous · il tient à l'AUDCIF, qui
 * s'applique à raison de l'activité et non de la forme juridique.
 */
export function regleRapportGestion(forme: FormeJuridiqueSyscohada | null): RegleRapportGestion {
  switch (forme) {
    case FormeJuridiqueSyscohada.SOCIETE_ANONYME:
    case FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE:
    case FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE:
    case FormeJuridiqueSyscohada.SOCIETE_NOM_COLLECTIF:
    case FormeJuridiqueSyscohada.SOCIETE_COMMANDITE_SIMPLE:
      return {
        genre: 'EXIGE',
        source: 'AUSCGIE, article 138 (transmission aux commissaires aux comptes : article 140)',
        organe: "le gérant, le conseil d'administration ou l'administrateur général, selon le cas",
        sections: SECTIONS_RAPPORT_GESTION_AUSCGIE,
      };
    case FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE:
      return {
        genre: 'EXIGE',
        source: 'AUSCOOP, article 108',
        organe: "le comité de gestion ou le conseil d'administration, selon le cas",
        sections: SECTIONS_RAPPORT_GESTION_AUSCOOP,
      };
    case FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE:
      return {
        genre: 'AUCUNE_REGLE_LUE',
        motif:
          "Aucun texte lu n'impose de rapport de gestion au groupement d'intérêt économique · l'AUSCGIE y renvoie au contrat constitutif (« le contrôle de la gestion et le contrôle des états financiers de synthèse sont exercés dans les conditions prévues par le contrat »). Se reporter au contrat du groupement.",
      };
    default:
      return {
        genre: 'AUCUNE_REGLE_LUE',
        motif:
          "L'article 138 nomme « le gérant, le conseil d'administration ou l'administrateur général » · un commerçant personne physique ou un entreprenant n'est aucun des trois, et ne rend compte devant aucune assemblée. Le livre d'inventaire, lui, reste dû (AUDCIF art. 19).",
      };
  }
}

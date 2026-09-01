import type { SystemeComptableSyscohada } from './types';

/**
 * Les DEUX systèmes du SYSCOHADA révisé · AUDCIF art. 11. Le Système allégé
 * de l'art. 12 n'est PAS proposé : la révision de 2017 l'a abrogé.
 *
 * Comme pour le SMT du SYCEBNL, le second n'est pas une préférence de
 * présentation. L'art. 13 le réserve aux entités dont le chiffre d'affaires
 * hors taxes annuel reste sous un seuil qui dépend de l'activité, et l'écran
 * donne les trois seuils plutôt que de laisser choisir à l'aveugle.
 *
 * Partagé entre la création du dossier et ses paramètres : les deux écrans
 * citent les mêmes seuils, et un texte recopié aurait fini par diverger.
 */
export const SYSTEMES_SYSCOHADA: {
  valeur: SystemeComptableSyscohada;
  titre: string;
  description: string;
}[] = [
  {
    valeur: 'NORMAL',
    titre: 'Système normal',
    description:
      "Le régime de droit commun : « toute entité est, sauf exception liée à sa taille, soumise au Système normal » (art. 11). Bilan, compte de résultat, tableau de flux et notes annexes.",
  },
  {
    valeur: 'MINIMAL_TRESORERIE',
    titre: 'Système minimal de trésorerie · petite entité',
    description:
      "Réservé par l'art. 13 aux entités dont le chiffre d'affaires hors taxes annuel reste sous 60 000 000 FCFA pour le négoce, 40 000 000 pour l'artisanat et assimilés, 30 000 000 pour les services.",
  },
];

/** Comment le système se nomme dans une phrase. */
export const LIBELLE_SYSTEME: Record<SystemeComptableSyscohada, string> = {
  NORMAL: 'Système normal',
  MINIMAL_TRESORERIE: 'Système minimal de trésorerie',
};

import { Referentiel } from '@prisma/client';

/**
 * MISE EN FORME DE LA RÉPONSE · trois colonnes du dossier portent une valeur
 * PAR DÉFAUT du schéma qui n'a de sens qu'en SYCEBNL :
 *
 *  · `jeuEtatsFinanciersSycebnl` → ASSOCIATIONS_ORDRES_PROFESSIONNELS ;
 *  · `formeJuridique`            → ASSOCIATION (loi n° 004/2001) ;
 *  · `droitEtranger`             → false (ASBL de droit étranger, art. 29-34
 *    de la même loi).
 *
 * Une SARL tenue en SYSCOHADA les porte donc en base sans les avoir jamais
 * déclarées. Servies telles quelles, elles fabriquent une affirmation fausse :
 * la bande d'accueil a réellement annoncé « Associations et ordres
 * professionnels » à une société commerciale, et un écran qui n'aurait pas
 * pensé à filtrer sur le référentiel l'aurait refait ailleurs.
 *
 * La correction tient dans la RÉPONSE, pas dans le schéma : trois lecteurs
 * (export de la liasse, livre d'inventaire, contrôles) lisent ces colonnes
 * en supposant qu'elles ne sont jamais nulles, et les rendre nullables
 * déplacerait le problème au lieu de le fermer. Ici, le contrat de l'API
 * devient : hors SYCEBNL, ces champs valent `null` · rien à interpréter.
 *
 * Symétrique de `systemeComptableSyscohada`, déjà nullable au schéma parce
 * qu'il a été ajouté après coup, donc sans défaut à purger.
 */
export function siSycebnl<T>(referentiel: Referentiel, valeur: T): T | null {
  return referentiel === Referentiel.SYCEBNL ? valeur : null;
}

import { Prisma, Referentiel, StatutExercice } from '@prisma/client';

/**
 * LE BROUILLARD QUE L'ON RÉCLAME, ET CELUI QUE PERSONNE NE PEUT VALIDER · une
 * seule règle pour le contrôle 4, l'état du brouillard et le planning de
 * clôture (audit final F77). Le contrôle l'appliquait seul depuis F12 · le
 * planning et l'état continuaient de réclamer, sur un exercice clos, une
 * validation que `valider` refuse, et un exercice clôturé gardait à vie « des
 * écritures au brouillard, à valider ».
 *
 * Délai de centralisation · il DIFFÈRE selon le référentiel, et servir le plus
 * strict des deux à tout le monde n'est pas prudent, c'est faux :
 *  · SYCEBNL, Partie 2 ch. 2 · centralisation au moins CHAQUE SEMAINE ;
 *  · AUDCIF, art. 19 · « au moins une fois par mois ».
 */
export const JOURS_CENTRALISATION: Record<Referentiel, number> = {
  [Referentiel.SYCEBNL]: 7,
  [Referentiel.SYSCOHADA]: 30,
};

/**
 * DEUX BROUILLARDS QUE PERSONNE NE PEUT VALIDER · le report à-nouveau
 * PROVISOIRE, qui reste au brouillard par construction pour pouvoir être
 * relancé, et l'écriture de CLÔTURE d'un exercice clôturé · `valider` refuse
 * tout exercice clos, et la valider solderait ses classes 6 et 7 dans les
 * états qui lisent le livre-journal.
 */
export function brouillardInvalidable(
  e: { estANouveauProvisoire: boolean; estGenereeParCloture: boolean },
  statutExercice: StatutExercice,
): boolean {
  return e.estANouveauProvisoire || (e.estGenereeParCloture && statutExercice === StatutExercice.CLOTURE);
}

/** La même règle, en filtre de requête · pour compter sans rapatrier. */
export function filtreBrouillardAValider(statutExercice: StatutExercice): Prisma.EcritureWhereInput {
  return {
    estANouveauProvisoire: false,
    ...(statutExercice === StatutExercice.CLOTURE ? { estGenereeParCloture: false } : {}),
  };
}

/** Ancienneté d'une écriture au brouillard, en jours pleins depuis sa saisie. */
export function ancienneteJours(createdAt: Date, maintenant: number): number {
  return Math.floor((maintenant - createdAt.getTime()) / 86_400_000);
}

/** En retard de centralisation · au-delà du délai de son référentiel, et validable. */
export function enRetardDeCentralisation(
  e: { estANouveauProvisoire: boolean; estGenereeParCloture: boolean; createdAt: Date },
  statutExercice: StatutExercice,
  referentiel: Referentiel,
  maintenant: number,
): boolean {
  return (
    !brouillardInvalidable(e, statutExercice) &&
    (maintenant - e.createdAt.getTime()) / 86_400_000 > JOURS_CENTRALISATION[referentiel]
  );
}

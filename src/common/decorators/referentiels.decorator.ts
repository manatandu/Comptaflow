import { SetMetadata } from '@nestjs/common';
import { Referentiel } from '@prisma/client';

export const REFERENTIELS_KEY = 'referentiels';

/**
 * Pose la liste des référentiels autorisés à accéder à cette route. Sans ce
 * décorateur, ReferentielGuard laisse passer tout dossier, quel que soit
 * son référentiel · @ReferentielsAutorises() sert à RESTREINDRE un module
 * propre à un seul référentiel (ex. le registre des donateurs n'a de sens
 * qu'en SYCEBNL, une association n'ayant pas de « clients » au sens
 * SYSCOHADA), jamais à ouvrir. Même convention que @Roles().
 */
export const ReferentielsAutorises = (...referentiels: Referentiel[]) => SetMetadata(REFERENTIELS_KEY, referentiels);

import { SetMetadata } from '@nestjs/common';

export const CLE_ACCES_ROLES_CANTONNES = 'acces-roles-cantonnes';

/**
 * CE QUE LES DEUX RÔLES CANTONNÉS PEUVENT FAIRE SUR UNE ROUTE (ou une classe,
 * la route l'emportant). Voir `common/guards/roles-cantonnes.ts` pour la
 * règle et ses défauts, qui ne sont pas les mêmes pour les deux :
 *  · l'AIDE-COMPTABLE hérite par défaut des droits du comptable, sauf là où
 *    une route le refuse (validation, correction, affectation, paie) ;
 *  · le GESTIONNAIRE DE PAIE n'a par défaut RIEN, sauf là où une route
 *    l'ouvre (le module du personnel et le strict nécessaire pour entrer).
 */
export interface AccesRolesCantonnes {
  aideComptable?: boolean;
  gestionnairePaie?: boolean;
}

export const AccesRolesCantonnes = (acces: AccesRolesCantonnes) =>
  SetMetadata(CLE_ACCES_ROLES_CANTONNES, acces);

/** Réservé au comptable et à l'administrateur · refusé aux deux rôles cantonnés. */
export const ReserveAuComptable = () => AccesRolesCantonnes({ aideComptable: false, gestionnairePaie: false });

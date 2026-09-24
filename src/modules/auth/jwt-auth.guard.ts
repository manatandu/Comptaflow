import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleUtilisateur } from '@prisma/client';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  AccesRolesCantonnes,
  CLE_ACCES_ROLES_CANTONNES,
} from '../../common/decorators/acces-roles-cantonnes.decorator';
import { MotDePasseAChangerGuard } from '../../common/guards/mot-de-passe-a-changer.guard';
import { ROLES_CANTONNES, routeOuverteAuRoleCantonne } from '../../common/guards/roles-cantonnes';

/**
 * Vérifie le JWT et peuple `request.user` (voir JwtStrategy.validate), PUIS
 * applique les deux contrôles qui ont besoin de savoir qui appelle.
 *
 * POURQUOI ICI ET NON DANS UNE GARDE GLOBALE · Nest exécute les gardes
 * globales AVANT celles du contrôleur. Une garde globale ne voit donc jamais
 * `request.user`, que cette garde-ci pose. `MotDePasseAChangerGuard` était
 * global depuis la phase 1a et ne refusait RIEN en production : il lisait un
 * utilisateur absent et laissait passer. Vu le 2026-09-24 en montant un
 * serveur Nest réel (statut 200 là où 403 était attendu) · aucun test ne le
 * voyait, ils appelaient la garde à la main avec un utilisateur déjà posé.
 * Toute route authentifiée passe par cette garde (un spec le vérifie), et le
 * contrôle y tient donc sans liste à entretenir.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(contexte: ExecutionContext): Promise<boolean> {
    const authentifie = (await super.canActivate(contexte)) as boolean;
    if (!authentifie) return false;

    // 1 · Le mot de passe provisoire ferme le logiciel jusqu'à son remplacement.
    new MotDePasseAChangerGuard(this.reflector).canActivate(contexte);

    // 2 · Un rôle cantonné n'entre que là où la route le lui permet. Pour le
    // gestionnaire de paie, c'est le seul contrôle qui couvre les lectures
    // sans `@Roles`, que RolesGuard laisse passer à tout utilisateur.
    const utilisateur: AuthenticatedUser | undefined = contexte.switchToHttp().getRequest()?.user;
    const role = utilisateur?.role as RoleUtilisateur | undefined;
    if (role && ROLES_CANTONNES.includes(role)) {
      const acces = this.reflector.getAllAndOverride<AccesRolesCantonnes>(CLE_ACCES_ROLES_CANTONNES, [
        contexte.getHandler(),
        contexte.getClass(),
      ]);
      if (!routeOuverteAuRoleCantonne(role, acces)) {
        throw new ForbiddenException(
          role === RoleUtilisateur.GESTIONNAIRE_PAIE
            ? 'Votre rôle est cantonné au personnel et à la paie · cette fonction ne vous est pas ouverte.'
            : "Cette fonction est réservée au comptable · l'aide-comptable saisit au brouillard, sans valider ni passer la paie.",
        );
      }
    }
    return true;
  }
}

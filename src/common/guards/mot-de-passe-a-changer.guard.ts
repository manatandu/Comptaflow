import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLE_SORTIE_MOT_DE_PASSE } from '../decorators/sortie-mot-de-passe.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * MOT DE PASSE PROVISOIRE · ferme le logiciel tant qu'il n'est pas remplacé.
 *
 * `doitChangerMotDePasse` est posé sur tout compte dont le mot de passe a
 * TRANSITÉ par un tiers : la console de la plateforme, le siège d'un groupe,
 * l'administrateur du dossier. Pendant cette période, ce tiers peut ouvrir le
 * dossier à la place du titulaire.
 *
 * Le client affichait bien l'écran de changement avant l'espace de travail,
 * mais le SERVEUR ne refusait rien · un appel direct à l'API travaillait
 * normalement, et le tiers n'avait qu'à ne pas ouvrir le navigateur. C'est
 * exactement le « masquer sans refuser » que CLAUDE.md §4 interdit, et il
 * vivait ici depuis la phase 1a.
 *
 * GLOBAL, à dessein · un contrôle posé contrôleur par contrôleur serait oublié
 * au prochain module ajouté, et l'oubli ne se verrait pas.
 */
@Injectable()
export class MotDePasseAChangerGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexte: ExecutionContext): boolean {
    const utilisateur: AuthenticatedUser | undefined = contexte.switchToHttp().getRequest()?.user;
    // Route non authentifiée (connexion, santé) · rien à contrôler ici.
    if (!utilisateur?.doitChangerMotDePasse) return true;

    const sortie = this.reflector.getAllAndOverride<boolean>(CLE_SORTIE_MOT_DE_PASSE, [
      contexte.getHandler(),
      contexte.getClass(),
    ]);
    if (sortie) return true;

    throw new ForbiddenException(
      'Votre mot de passe est provisoire · il a été choisi par un tiers. Remplacez-le avant de travailler.',
    );
  }
}

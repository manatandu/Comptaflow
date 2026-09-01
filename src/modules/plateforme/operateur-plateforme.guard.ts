import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Réservé à l'OPÉRATEUR DE PLATEFORME : l'exploitant du logiciel (le
 * cabinet), qui gère les cabinets clients et leurs licences depuis la
 * console /plateforme. S'applique après JwtAuthGuard.
 *
 * Le drapeau `estOperateurPlateforme` est relu en base à CHAQUE requête par
 * JwtStrategy.validate (comme le rôle) · une révocation prend donc effet
 * immédiatement, sans attendre l'expiration du jeton. Il ne figure dans
 * aucun DTO : impossible de se l'attribuer par l'API, seul le bootstrap
 * OPERATEURS_PLATEFORME (variable d'environnement) l'accorde.
 *
 * NB : les routes /plateforme ne portent volontairement PAS LicenceGuard ·
 * la licence du propre dossier de l'opérateur (expirée ou suspendue) ne doit
 * jamais le verrouiller hors de la console qui sert justement à gérer les
 * licences.
 */
@Injectable()
export class OperateurPlateformeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (request.user?.estOperateurPlateforme !== true) {
      throw new ForbiddenException('Réservé à l’opérateur de la plateforme');
    }
    return true;
  }
}

import { ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
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
import { fonctionDeRoute, motifRefusFonction } from '../../common/fonctions/fonctions-metier';
import { sessionDeLaRequete } from './session-longue';
import { poserCookieSession } from './session.constants';

/**
 * LA SESSION PERDUE SE DIT, EN FRANÇAIS, ET SE RECONNAÎT (audit final F164).
 * Sans jeton, ou avec un jeton expiré, passport levait « Unauthorized »,
 * que l'écran recopiait tel quel sur chaque fenêtre ouverte. Le corps porte
 * désormais `session: 'perdue'` · c'est à ce drapeau, et non au seul statut
 * 401, que l'interface ferme la session · un mot de passe actuel faux rend
 * aussi un 401, et ne doit déconnecter personne.
 */
export const MOTIF_SESSION_ABSENTE = 'Session absente ou expirée · reconnectez-vous.';
export const SIGNAL_SESSION_PERDUE = 'perdue';

export function refusDeSession(message: string = MOTIF_SESSION_ABSENTE): UnauthorizedException {
  return new UnauthorizedException({ statusCode: 401, error: 'Unauthorized', message, session: SIGNAL_SESSION_PERDUE });
}

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

  /**
   * Un refus de la stratégie (compte désactivé, session close) garde son
   * motif, déjà en français ; l'absence de jeton reçoit le sien. Une autre
   * panne (base injoignable pendant la relecture du compte) n'est PAS une
   * session perdue · la faire passer pour telle déconnecterait tout le monde
   * au premier incident.
   */
  handleRequest<T>(err: unknown, user: T): T {
    if (!err && user) return user;
    if (err && !(err instanceof UnauthorizedException)) throw err;
    throw refusDeSession(err instanceof UnauthorizedException ? err.message : MOTIF_SESSION_ABSENTE);
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

    // 3 · Le profil de fonctions RESTREINT ce que le rôle permet d'écrire
    // (common/fonctions/fonctions-metier.ts) · lu ici pour la même raison
    // que les deux contrôles précédents : il a besoin de l'utilisateur.
    if (utilisateur) {
      const requete = contexte.switchToHttp().getRequest();
      // Le rôle entre dans la lecture · la cotation de l'USD du jour relève de
      // la paie pour le gestionnaire de paie, de la structure pour le
      // comptable (audit final F247).
      const fonction = fonctionDeRoute(contexte.getClass().name, contexte.getHandler().name, utilisateur.role);
      const motif = motifRefusFonction(utilisateur, requete?.method ?? 'GET', fonction);
      if (motif) throw new ForbiddenException(motif);
    }

    // 4 · « Rester connecté » · chaque usage prolonge la session longue (audit
    // final F270). Le jeton est signé par JwtStrategy, qui tient la charge et
    // le signataire ; il n'est posé qu'ICI, une fois la requête ADMISE par
    // les trois contrôles ci-dessus, et par la seule fonction qui pose le
    // cookie de session · un refus de cette garde ne prolonge rien. Une garde
    // posée après elle (rôle, licence) peut encore refuser la route · la
    // session, authentifiée et non révoquée, reste prolongée, comme l'usage
    // qu'elle vient de faire.
    const prolongation = sessionDeLaRequete(contexte.switchToHttp().getRequest())?.prolongation;
    if (prolongation) {
      poserCookieSession(contexte.switchToHttp().getResponse(), prolongation.accessToken, prolongation.maxAgeMs);
    }
    return true;
  }
}

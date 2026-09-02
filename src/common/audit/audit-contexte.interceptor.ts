import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { dansContexteAudit } from './contexte-audit';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Pose l'acteur du journal d'audit pour toute la durée de la requête.
 *
 * INTERCEPTEUR et non middleware · dans Nest, un middleware court AVANT les
 * gardes, donc avant que la stratégie JWT n'ait posé `request.user`. Il ne
 * verrait jamais qui agit. L'intercepteur, lui, court après les gardes.
 *
 * L'abonnement à l'observable doit se faire DANS le `run` du stockage
 * asynchrone, faute de quoi le gestionnaire s'exécuterait hors contexte et le
 * journal noterait tous les actes au nom du système.
 */
@Injectable()
export class AuditContexteInterceptor implements NestInterceptor {
  intercept(contexte: ExecutionContext, suite: CallHandler): Observable<unknown> {
    const requete = contexte.switchToHttp().getRequest();
    const utilisateur: AuthenticatedUser | undefined = requete?.user;
    if (!utilisateur?.email) return suite.handle();

    const acteur = {
      acteurId: utilisateur.userId,
      acteurEmail: utilisateur.email,
      tenantId: utilisateur.tenantId,
      // `ip` d'Express, ou l'en-tête de tête de proxy · Cloud Run place le
      // client réel en première position de X-Forwarded-For.
      adresseIp:
        (typeof requete.headers?.['x-forwarded-for'] === 'string'
          ? requete.headers['x-forwarded-for'].split(',')[0].trim()
          : undefined) || requete.ip,
    };

    return new Observable((observateur) => {
      dansContexteAudit(acteur, () => {
        suite.handle().subscribe(observateur);
      });
    });
  }
}

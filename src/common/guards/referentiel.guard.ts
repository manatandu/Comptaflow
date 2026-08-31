import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Referentiel } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { REFERENTIELS_KEY } from '../decorators/referentiels.decorator';

/**
 * DIVISION SYCEBNL / SYSCOHADA · un dossier ASBL (SYCEBNL) n'a pas de sens
 * pour un module de gestion commerciale (devis, commande client), et un
 * dossier d'entreprise (SYSCOHADA) n'a pas de sens pour un registre des
 * donateurs ou des exonérations douanières propres aux ASBL (loi 004/2001,
 * art. 39). Voir `docs/plan-de-construction.md` §8.
 *
 * Cette garde ne filtre PAS l'interface — `client/src/lib/registre-fenetres.tsx`
 * et le menu (`AppShell.tsx`) le font déjà, en cachant la fenêtre à un
 * dossier du mauvais référentiel. Elle existe pour la même raison que
 * RolesGuard double le masquage des boutons côté client : un accès direct
 * par URL, ou un appel API construit à la main, ne doit pas contourner ce
 * que l'interface cache. Défense en profondeur, pas redondance inutile.
 *
 * S'applique après JwtAuthGuard (`request.user` doit déjà exister). Sans
 * `@ReferentielsAutorises(...)` sur la route, elle laisse passer · c'est le
 * comportement par défaut des modules communs aux deux référentiels
 * (comptabilité générale, immobilisations, paie, trésorerie).
 */
@Injectable()
export class ReferentielGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const referentielsRequis = this.reflector.getAllAndOverride<Referentiel[]>(REFERENTIELS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!referentielsRequis || referentielsRequis.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenantId: string | undefined = request.user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant non résolu');
    }

    // Référentiel préchargé par JwtStrategy (le cas normal) : zéro requête.
    // Absent (tests, appels internes) : lecture directe, comme avant.
    const prefetch: Referentiel | undefined = request.user?.referentiel;
    const tenant = prefetch
      ? { referentiel: prefetch }
      : await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { referentiel: true } });
    if (!tenant || !referentielsRequis.includes(tenant.referentiel)) {
      throw new ForbiddenException(
        `Module indisponible pour ce référentiel · requis : ${referentielsRequis.join(', ')}`,
      );
    }
    return true;
  }
}

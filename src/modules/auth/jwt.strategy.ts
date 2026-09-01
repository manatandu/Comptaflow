import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

interface JwtPayload {
  sub: string; // userId
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Pas de repli sur une valeur littérale : `validateEnv` (app.module.ts)
      // fait déjà échouer le démarrage si JWT_SECRET est absent · un repli
      // silencieux ici aurait permis de vérifier des jetons forgés avec une
      // chaîne connue si la validation était un jour contournée ou retirée par
      // erreur (défense en profondeur : la garantie doit tenir même sans
      // relire tout l'historique du projet).
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Le retour de validate() devient request.user (voir CurrentUser decorator).
   * On ne fait PAS confiance à `email`/`role` du payload : ils sont relus en
   * base à chaque requête, pour qu'une désactivation ou un changement de
   * rôle prenne effet immédiatement, sans attendre l'expiration du token
   * (jusqu'à 8h · voir JWT_EXPIRES_IN).
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // UNE requête, jointures comprises : le référentiel et la licence du
    // tenant voyagent avec l'utilisateur, si bien que LicenceGuard et
    // ReferentielGuard n'ont plus rien à demander à la base.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: { select: { referentiel: true, licence: true } } },
    });
    if (!user || !user.estActif) {
      throw new UnauthorizedException('Compte désactivé ou introuvable');
    }
    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      referentiel: user.tenant.referentiel,
      licence: user.tenant.licence,
      estOperateurPlateforme: user.estOperateurPlateforme,
    };
  }
}

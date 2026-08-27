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
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'change-me',
    });
  }

  /**
   * Le retour de validate() devient request.user (voir CurrentUser decorator).
   * On ne fait PAS confiance à `email`/`role` du payload : ils sont relus en
   * base à chaque requête, pour qu'une désactivation ou un changement de
   * rôle prenne effet immédiatement, sans attendre l'expiration du token
   * (jusqu'à 8h — voir JWT_EXPIRES_IN).
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.estActif) {
      throw new UnauthorizedException('Compte désactivé ou introuvable');
    }
    return { userId: user.id, tenantId: user.tenantId, email: user.email, role: user.role };
  }
}

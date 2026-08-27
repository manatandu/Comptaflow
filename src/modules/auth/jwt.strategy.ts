import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

interface JwtPayload {
  sub: string; // userId
  tenantId: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'change-me',
    });
  }

  // Le retour de validate() devient request.user — voir CurrentUser decorator.
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    return { userId: payload.sub, tenantId: payload.tenantId, email: payload.email, role: payload.role };
  }
}

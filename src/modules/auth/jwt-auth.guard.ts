import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Vérifie le JWT et peuple `request.user` (voir JwtStrategy.validate). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

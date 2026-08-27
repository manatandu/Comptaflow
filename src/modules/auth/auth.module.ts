import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * Squelette Phase 0 : à compléter en Phase 1 avec une AuthService (login,
 * hash de mot de passe), une JwtStrategy Passport, et un AuthGuard qui
 * peuple `request.user = { userId, tenantId, role }` consommé par LicenceGuard.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '8h') },
      }),
    }),
  ],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { TenantModule } from '../tenant/tenant.module';
import { ComptesModule } from '../comptes/comptes.module';
import { ExerciceModule } from '../exercice/exercice.module';
import { JournauxModule } from '../journaux/journaux.module';
import { TvaModule } from '../tva/tva.module';
import { ImmobilisationsModule } from '../immobilisations/immobilisations.module';
import { AnalytiqueModule } from '../analytique/analytique.module';
import { RelancesModule } from '../relances/relances.module';
import { JwtAuthModule } from './jwt-auth.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '8h') },
      }),
    }),
    TenantModule,
    ComptesModule,
    ExerciceModule,
    JournauxModule,
    TvaModule,
    ImmobilisationsModule,
    AnalytiqueModule,
    RelancesModule,
    JwtAuthModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // AuthService est réutilisé par PlateformeModule : la création d'un cabinet
  // client depuis la console passe par LE MÊME pipeline que l'inscription
  // publique (tenant + licence + admin + seeds + exercice), aucun second
  // chemin de création à maintenir.
  exports: [AuthService],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { LicenceModule } from './modules/licence/licence.module';
import { AuthModule } from './modules/auth/auth.module';
import { ComptesModule } from './modules/comptes/comptes.module';
import { ExerciceModule } from './modules/exercice/exercice.module';
import { ComptabiliteModule } from './modules/comptabilite/comptabilite.module';
import { EtatsFinanciersModule } from './modules/etats-financiers/etats-financiers.module';
import { UtilisateursModule } from './modules/utilisateurs/utilisateurs.module';
import { JournauxModule } from './modules/journaux/journaux.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TenantModule,
    LicenceModule,
    AuthModule,
    ComptesModule,
    ExerciceModule,
    JournauxModule,
    ComptabiliteModule,
    EtatsFinanciersModule,
    UtilisateursModule,
  ],
})
export class AppModule {}

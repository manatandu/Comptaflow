import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FacturationModule } from '../facturation/facturation.module';
import { AbonnementsService } from '../abonnements/abonnements.service';
import { PlateformeService } from './plateforme.service';
import { PlateformeController } from './plateforme.controller';
import { OperateurPlateformeGuard } from './operateur-plateforme.guard';
import { LicencesSurSiteService } from './licences-sur-site.service';
import { PrismaService } from '../../common/prisma.service';
import { CourrierModule } from '../courrier/courrier.module';
import { TiersModule } from '../tiers/tiers.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { GarnissageDemonstrationService } from './garnissage-demonstration.service';
import { CourrielsEditeurService } from '../abonnements/courriels-editeur.service';

@Module({
  // AuthModule pour AuthService : la création d'un cabinet client réutilise
  // le pipeline d'inscription (voir PlateformeService.creerCabinet).
  imports: [AuthModule, FacturationModule, CourrierModule, TiersModule, ComptabiliteModule],
  controllers: [PlateformeController],
  providers: [
    PlateformeService,
    AbonnementsService,
    CourrielsEditeurService,
    GarnissageDemonstrationService,
    OperateurPlateformeGuard,
    // Fabrique · l'environnement et la clé publique sont des paramètres par
    // défaut, remplaçables dans les tests, que l'injection ne sait pas lire.
    { provide: LicencesSurSiteService, useFactory: (p: PrismaService) => new LicencesSurSiteService(p), inject: [PrismaService] },
  ],
})
export class PlateformeModule {}

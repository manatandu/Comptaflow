import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlateformeService } from './plateforme.service';
import { PlateformeController } from './plateforme.controller';
import { OperateurPlateformeGuard } from './operateur-plateforme.guard';
import { LicencesSurSiteService } from './licences-sur-site.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  // AuthModule pour AuthService : la création d'un cabinet client réutilise
  // le pipeline d'inscription (voir PlateformeService.creerCabinet).
  imports: [AuthModule],
  controllers: [PlateformeController],
  providers: [
    PlateformeService,
    OperateurPlateformeGuard,
    // Fabrique · l'environnement et la clé publique sont des paramètres par
    // défaut, remplaçables dans les tests, que l'injection ne sait pas lire.
    { provide: LicencesSurSiteService, useFactory: (p: PrismaService) => new LicencesSurSiteService(p), inject: [PrismaService] },
  ],
})
export class PlateformeModule {}

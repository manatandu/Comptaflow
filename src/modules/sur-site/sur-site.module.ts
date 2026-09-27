import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LicenceModule } from '../licence/licence.module';
import { AdministrateurInstallationGuard } from './administrateur-installation.guard';
import { SauvegardeSurSiteService } from './sauvegarde-sur-site.service';
import { SurSiteController } from './sur-site.controller';

@Module({
  imports: [LicenceModule, AuthModule],
  controllers: [SurSiteController],
  providers: [{ provide: SauvegardeSurSiteService, useFactory: () => new SauvegardeSurSiteService() }, AdministrateurInstallationGuard],
})
export class SurSiteModule {}

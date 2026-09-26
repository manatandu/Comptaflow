import { Module } from '@nestjs/common';
import { LicenceModule } from '../licence/licence.module';
import { SauvegardeSurSiteService } from './sauvegarde-sur-site.service';
import { SurSiteController } from './sur-site.controller';

@Module({
  imports: [LicenceModule],
  controllers: [SurSiteController],
  providers: [{ provide: SauvegardeSurSiteService, useFactory: () => new SauvegardeSurSiteService() }],
})
export class SurSiteModule {}

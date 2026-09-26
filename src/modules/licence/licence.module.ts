import { Module } from '@nestjs/common';
import { LicenceService } from './licence.service';
import { LicenceGuard } from './licence.guard';
import { LicenceSurSiteService } from '../sur-site/licence-sur-site.service';

@Module({
  providers: [
    LicenceService,
    LicenceGuard,
    // Fabriqué et non injecté · ses dépendances (accès au poste, clé publique)
    // ne sont pas des services Nest, et ne doivent jamais le devenir : une clé
    // injectable serait une clé remplaçable.
    { provide: LicenceSurSiteService, useFactory: () => new LicenceSurSiteService() },
  ],
  exports: [LicenceService, LicenceGuard, LicenceSurSiteService],
})
export class LicenceModule {}

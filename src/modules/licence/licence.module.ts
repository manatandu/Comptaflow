import { Module } from '@nestjs/common';
import { LicenceService } from './licence.service';
import { LicenceGuard } from './licence.guard';

@Module({
  providers: [LicenceService, LicenceGuard],
  exports: [LicenceService, LicenceGuard],
})
export class LicenceModule {}

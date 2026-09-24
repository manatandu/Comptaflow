import { Module } from '@nestjs/common';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ConsolidationController } from './consolidation.controller';
import { PerimetreService } from './perimetre.service';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [ConsolidationController],
  providers: [PerimetreService],
  exports: [PerimetreService],
})
export class ConsolidationModule {}

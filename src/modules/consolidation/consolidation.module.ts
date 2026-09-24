import { Module } from '@nestjs/common';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ConsolidationController } from './consolidation.controller';
import { PerimetreService } from './perimetre.service';
import { CumulService } from './cumul.service';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [ConsolidationController],
  providers: [PerimetreService, CumulService],
  exports: [PerimetreService, CumulService],
})
export class ConsolidationModule {}

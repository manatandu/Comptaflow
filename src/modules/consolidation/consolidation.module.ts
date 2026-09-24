import { Module } from '@nestjs/common';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ConsolidationController } from './consolidation.controller';
import { PerimetreService } from './perimetre.service';
import { CumulService } from './cumul.service';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { EtatsFinanciersSyscohadaModule } from '../etats-financiers-syscohada/etats-financiers-syscohada.module';
import { EtatsConsolidesService } from './etats-consolides.service';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule, EtatsFinanciersSyscohadaModule],
  controllers: [ConsolidationController],
  providers: [PerimetreService, CumulService, EtatsConsolidesService],
  exports: [PerimetreService, CumulService],
})
export class ConsolidationModule {}

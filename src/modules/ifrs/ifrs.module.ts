import { Module } from '@nestjs/common';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { EtatsFinanciersSyscohadaModule } from '../etats-financiers-syscohada/etats-financiers-syscohada.module';
import { ConsolidationModule } from '../consolidation/consolidation.module';
import { IfrsController } from './ifrs.controller';
import { IfrsService } from './ifrs.service';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule, EtatsFinanciersSyscohadaModule, ConsolidationModule],
  controllers: [IfrsController],
  providers: [IfrsService],
})
export class IfrsModule {}

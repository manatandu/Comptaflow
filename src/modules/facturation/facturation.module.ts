import { Module } from '@nestjs/common';
import { FacturationController } from './facturation.controller';
import { FacturationService } from './facturation.service';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { ComptabilisationFactureService } from './comptabilisation-facture.service';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [FacturationController],
  providers: [FacturationService, ComptabilisationFactureService],
  exports: [FacturationService],
})
export class FacturationModule {}

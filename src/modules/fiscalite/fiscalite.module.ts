import { Module } from '@nestjs/common';
import { FiscaliteController } from './fiscalite.controller';
import { FiscaliteService } from './fiscalite.service';
import { ConstatImpotService } from './constat-impot.service';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [ComptabiliteModule, LicenceModule, JwtAuthModule],
  controllers: [FiscaliteController],
  providers: [FiscaliteService, ConstatImpotService],
})
export class FiscaliteModule {}

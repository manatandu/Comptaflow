import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { EtatsFinanciersModule } from '../etats-financiers/etats-financiers.module';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule, EtatsFinanciersModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportsModule {}

import { Module } from '@nestjs/common';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';

@Module({
  // ComptabiliteModule · les deux imports passent par les contrôles d'entrée
  // de la saisie (EcritureService.controlesDEntree), audit du 2026-09-27, F3.
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [ImportController],
  providers: [ImportService],
  exports: [ImportService],
})
export class ImportModule {}

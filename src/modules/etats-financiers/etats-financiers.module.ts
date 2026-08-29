import { Module } from '@nestjs/common';
import { EtatsFinanciersService } from './etats-financiers.service';
import { EtatsFinanciersProjetService } from './etats-financiers-projet.service';
import { EtatsFinanciersSmtService } from './etats-financiers-smt.service';
import { EtatsFinanciersController } from './etats-financiers.controller';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ExerciceModule } from '../exercice/exercice.module';

@Module({
  imports: [ComptabiliteModule, LicenceModule, JwtAuthModule, ExerciceModule],
  controllers: [EtatsFinanciersController],
  providers: [EtatsFinanciersService, EtatsFinanciersProjetService, EtatsFinanciersSmtService],
  exports: [EtatsFinanciersService, EtatsFinanciersProjetService, EtatsFinanciersSmtService],
})
export class EtatsFinanciersModule {}

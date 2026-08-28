import { Module } from '@nestjs/common';
import { EtatsFinanciersService } from './etats-financiers.service';
import { EtatsFinanciersProjetService } from './etats-financiers-projet.service';
import { EtatsFinanciersController } from './etats-financiers.controller';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ExerciceModule } from '../exercice/exercice.module';

@Module({
  imports: [ComptabiliteModule, LicenceModule, JwtAuthModule, ExerciceModule],
  controllers: [EtatsFinanciersController],
  providers: [EtatsFinanciersService, EtatsFinanciersProjetService],
  exports: [EtatsFinanciersService, EtatsFinanciersProjetService],
})
export class EtatsFinanciersModule {}

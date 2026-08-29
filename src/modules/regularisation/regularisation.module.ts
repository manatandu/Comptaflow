import { Module } from '@nestjs/common';
import { RegularisationService } from './regularisation.service';
import { RegularisationController } from './regularisation.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';

@Module({
  // ComptabiliteModule : régularisations et abonnements posent des écritures
  // NORMALES via EcritureService · mêmes contrôles que n'importe quelle saisie
  // (équilibre, exercice ouvert, clôtures de journaux), et même passage par le
  // brouillard.
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [RegularisationController],
  providers: [RegularisationService],
  exports: [RegularisationService],
})
export class RegularisationModule {}

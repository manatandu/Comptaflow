import { Module } from '@nestjs/common';
import { AnalytiqueService } from './analytique.service';
import { EtatsAnalytiquesService } from './etats-analytiques.service';
import { EngagementService } from './engagement.service';
import { OdAnalytiqueService } from './od-analytique.service';
import { AnalytiqueController } from './analytique.controller';
import { ComptabiliteGestionController } from './gestion/comptabilite-gestion.controller';
import { ComptabiliteGestionService } from './gestion/comptabilite-gestion.service';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  // Comptabilité de gestion (ligne A20) · dans le module analytique, dont
  // elle lit les sections et écrit les OD, sans module de plus ni import
  // circulaire avec la comptabilité générale.
  controllers: [AnalytiqueController, ComptabiliteGestionController],
  providers: [AnalytiqueService, EtatsAnalytiquesService, EngagementService, OdAnalytiqueService, ComptabiliteGestionService],
  exports: [AnalytiqueService, EngagementService],
})
export class AnalytiqueModule {}

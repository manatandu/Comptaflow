import { Module } from '@nestjs/common';
import { AnalytiqueService } from './analytique.service';
import { EtatsAnalytiquesService } from './etats-analytiques.service';
import { EngagementService } from './engagement.service';
import { OdAnalytiqueService } from './od-analytique.service';
import { AnalytiqueController } from './analytique.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [AnalytiqueController],
  providers: [AnalytiqueService, EtatsAnalytiquesService, EngagementService, OdAnalytiqueService],
  exports: [AnalytiqueService, EngagementService],
})
export class AnalytiqueModule {}

import { Module } from '@nestjs/common';
import { AnalytiqueService } from './analytique.service';
import { EtatsAnalytiquesService } from './etats-analytiques.service';
import { AnalytiqueController } from './analytique.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [AnalytiqueController],
  providers: [AnalytiqueService, EtatsAnalytiquesService],
  exports: [AnalytiqueService],
})
export class AnalytiqueModule {}

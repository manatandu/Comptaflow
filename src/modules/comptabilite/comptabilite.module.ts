import { Module } from '@nestjs/common';
import { EcritureService } from './ecriture.service';
import { EcritureController } from './ecriture.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { JournauxModule } from '../journaux/journaux.module';
import { ExerciceModule } from '../exercice/exercice.module';
import { AnalytiqueModule } from '../analytique/analytique.module';

@Module({
  imports: [LicenceModule, JwtAuthModule, JournauxModule, ExerciceModule, AnalytiqueModule],
  controllers: [EcritureController],
  providers: [EcritureService],
  exports: [EcritureService],
})
export class ComptabiliteModule {}

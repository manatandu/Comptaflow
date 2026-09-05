import { Module } from '@nestjs/common';
import { RelancesService } from './relances.service';
import { RelancesController } from './relances.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { CourrierModule } from '../courrier/courrier.module';

/**
 * `CourrierModule` est importé pour la FILE, pas pour un envoi · les lettres
 * de rappel composées ici ne partaient nulle part (voir RelancesService.emettre).
 */
@Module({
  imports: [LicenceModule, JwtAuthModule, CourrierModule],
  controllers: [RelancesController],
  providers: [RelancesService],
  exports: [RelancesService],
})
export class RelancesModule {}

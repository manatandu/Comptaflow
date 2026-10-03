import { Module } from '@nestjs/common';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { TvaModule } from '../tva/tva.module';
import { CreancesDouteusesController } from './creances-douteuses.controller';
import { CreancesDouteusesService } from './creances-douteuses.service';

@Module({
  // TvaModule · la base d'exigibilité de la TVA des ventes d'origine (K3).
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule, TvaModule],
  controllers: [CreancesDouteusesController],
  providers: [CreancesDouteusesService],
})
export class CreancesDouteusesModule {}

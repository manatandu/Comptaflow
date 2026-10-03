import { Module } from '@nestjs/common';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { LettrageModule } from '../lettrage/lettrage.module';
import { CreancesDouteusesController } from './creances-douteuses.controller';
import { CreancesDouteusesService } from './creances-douteuses.service';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule, LettrageModule],
  controllers: [CreancesDouteusesController],
  providers: [CreancesDouteusesService],
})
export class CreancesDouteusesModule {}

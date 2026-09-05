import { Module } from '@nestjs/common';
import { CircularisationService } from './circularisation.service';
import { CircularisationController } from './circularisation.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [CircularisationController],
  providers: [CircularisationService],
  exports: [CircularisationService],
})
export class CircularisationModule {}

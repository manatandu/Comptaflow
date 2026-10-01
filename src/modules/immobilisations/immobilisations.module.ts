import { Module } from '@nestjs/common';
import { ImmobilisationService } from './immobilisation.service';
import { ImmobilisationController } from './immobilisation.controller';
import { DegressifController } from './degressif.controller';
import { DegressifService } from './degressif.service';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { LocationAcquisitionController } from './location-acquisition/location-acquisition.controller';
import { LocationAcquisitionService } from './location-acquisition/location-acquisition.service';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [ImmobilisationController, DegressifController, LocationAcquisitionController],
  providers: [ImmobilisationService, DegressifService, LocationAcquisitionService],
  exports: [ImmobilisationService],
})
export class ImmobilisationsModule {}

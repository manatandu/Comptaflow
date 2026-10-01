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
import { RepriseSubventionController } from './reprise-subvention.controller';
import { RepriseSubventionService } from './reprise-subvention.service';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [ImmobilisationController, DegressifController, LocationAcquisitionController, RepriseSubventionController],
  providers: [ImmobilisationService, DegressifService, LocationAcquisitionService, RepriseSubventionService],
  exports: [ImmobilisationService],
})
export class ImmobilisationsModule {}

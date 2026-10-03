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
import { SubventionRattacheeController } from './subvention-rattachee.controller';
import { SubventionRattacheeService } from './subvention-rattachee.service';
import { ReevaluationBilanController } from './reevaluation-bilan.controller';
import { ReevaluationBilanService } from './reevaluation-bilan.service';
import { DemantelementController } from './demantelement.controller';
import { DemantelementService } from './demantelement.service';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [ImmobilisationController, DegressifController, LocationAcquisitionController, RepriseSubventionController, SubventionRattacheeController, ReevaluationBilanController, DemantelementController],
  providers: [ImmobilisationService, DegressifService, LocationAcquisitionService, RepriseSubventionService, SubventionRattacheeService, ReevaluationBilanService, DemantelementService],
  exports: [ImmobilisationService],
})
export class ImmobilisationsModule {}

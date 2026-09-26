import { Module } from '@nestjs/common';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { LettrageModule } from '../lettrage/lettrage.module';
import { ReglementsController } from './reglements.controller';
import { ReglementsService } from './reglements.service';
import { OrdresVirementController } from './ordres-virement.controller';
import { OrdresVirementService } from './ordres-virement.service';
import { LotsVirementController } from './lots-virement.controller';
import { LotsVirementService } from './lots-virement.service';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule, LettrageModule],
  controllers: [ReglementsController, OrdresVirementController, LotsVirementController],
  providers: [ReglementsService, OrdresVirementService, LotsVirementService],
})
export class ReglementsModule {}

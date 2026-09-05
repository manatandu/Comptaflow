import { Module } from '@nestjs/common';
import { BailleurService } from './bailleur.service';
import { BailleurController } from './bailleur.controller';
import { ConventionFinancementService } from './convention-financement.service';
import { ConventionFinancementController } from './convention-financement.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [BailleurController, ConventionFinancementController],
  providers: [BailleurService, ConventionFinancementService],
  exports: [BailleurService, ConventionFinancementService],
})
export class BailleursModule {}

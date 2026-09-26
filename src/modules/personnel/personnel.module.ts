import { Module } from '@nestjs/common';
import { PersonnelService } from './personnel.service';
import { PersonnelController } from './personnel.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { ComptabilisationPaieService } from './comptabilisation-paie.service';
import { AvancesRubriquesController } from './avances-rubriques.controller';
import { AvancesRubriquesService } from './avances-rubriques.service';
import { BaremesPaieController } from './baremes-paie.controller';
import { BaremesPaieService } from './baremes-paie.service';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [PersonnelController, AvancesRubriquesController, BaremesPaieController],
  providers: [PersonnelService, ComptabilisationPaieService, AvancesRubriquesService, BaremesPaieService],
  exports: [PersonnelService],
})
export class PersonnelModule {}

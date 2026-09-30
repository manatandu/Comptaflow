import { Module } from '@nestjs/common';
import { ControlesService } from './controles.service';
import { DossierRevisionService } from './dossier-revision.service';
import { TestEcrituresJournalService } from './test-ecritures-journal.service';
import { ControlesController } from './controles.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { EtatsFinanciersSyscohadaModule } from '../etats-financiers-syscohada/etats-financiers-syscohada.module';

@Module({
  // Le contrôle de la moitié du capital lit le bilan par la résolution du ch. 7.
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule, EtatsFinanciersSyscohadaModule],
  controllers: [ControlesController],
  providers: [ControlesService, DossierRevisionService, TestEcrituresJournalService],
  exports: [ControlesService, DossierRevisionService, TestEcrituresJournalService],
})
export class ControlesModule {}

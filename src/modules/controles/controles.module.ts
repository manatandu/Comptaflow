import { Module } from '@nestjs/common';
import { ControlesService } from './controles.service';
import { DossierRevisionService } from './dossier-revision.service';
import { TestEcrituresJournalService } from './test-ecritures-journal.service';
import { ControlesController } from './controles.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [ControlesController],
  providers: [ControlesService, DossierRevisionService, TestEcrituresJournalService],
  exports: [ControlesService, DossierRevisionService, TestEcrituresJournalService],
})
export class ControlesModule {}

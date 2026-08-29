import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { EtatsFinanciersModule } from '../etats-financiers/etats-financiers.module';
import { NotesAnnexesModule } from '../notes-annexes/notes-annexes.module';
import { RegistreDonateursModule } from '../registre-donateurs/registre-donateurs.module';
import { DocumentsObligatoiresModule } from '../documents-obligatoires/documents-obligatoires.module';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule, EtatsFinanciersModule, NotesAnnexesModule, RegistreDonateursModule, DocumentsObligatoiresModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportsModule {}

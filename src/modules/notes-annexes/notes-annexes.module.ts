import { Module } from '@nestjs/common';
import { NoteAnnexeService } from './note-annexe.service';
import { NoteAnnexeController } from './note-annexe.controller';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { ExerciceModule } from '../exercice/exercice.module';
// Le tableau d'exécution budgétaire des notes 35 et 24 vient de la fenêtre
// États financiers · il n'est pas recalculé ici.
import { EtatsFinanciersModule } from '../etats-financiers/etats-financiers.module';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [ComptabiliteModule, ExerciceModule, LicenceModule, JwtAuthModule, EtatsFinanciersModule],
  controllers: [NoteAnnexeController],
  providers: [NoteAnnexeService],
  exports: [NoteAnnexeService],
})
export class NotesAnnexesModule {}

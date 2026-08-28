import { Module } from '@nestjs/common';
import { NoteAnnexeService } from './note-annexe.service';
import { NoteAnnexeController } from './note-annexe.controller';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { ExerciceModule } from '../exercice/exercice.module';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [ComptabiliteModule, ExerciceModule, LicenceModule, JwtAuthModule],
  controllers: [NoteAnnexeController],
  providers: [NoteAnnexeService],
  exports: [NoteAnnexeService],
})
export class NotesAnnexesModule {}

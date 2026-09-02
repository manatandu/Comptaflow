import { Module } from '@nestjs/common';
import { EtatsFinanciersSyscohadaService } from './etats-financiers-syscohada.service';
import { EtatsFinanciersSmtSyscohadaService } from './etats-financiers-smt-syscohada.service';
import { EtatsFinanciersSyscohadaController } from './etats-financiers-syscohada.controller';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ExerciceModule } from '../exercice/exercice.module';
import { NotesAnnexesModule } from '../notes-annexes/notes-annexes.module';

/**
 * ÉTATS FINANCIERS DU SYSCOHADA RÉVISÉ · module distinct de
 * `EtatsFinanciersModule`, qui reste SYCEBNL.
 *
 * Pourquoi deux modules et non un seul à deux jeux de routes : les deux
 * référentiels ne partagent ni postes, ni comptes, ni notes, ni articles
 * (CLAUDE.md §6). Un contrôleur commun obligerait à porter le référentiel
 * en paramètre, donc à choisir un moteur à l'exécution · c'est exactement
 * le genre d'aiguillage qui finit par imprimer un état du mauvais
 * référentiel. Séparés, chaque contrôleur porte sa garde
 * `@ReferentielsAutorises` en dur et rien ne peut se croiser.
 *
 * `NotesAnnexesModule` est importé pour le seul `NoteAnnexeService`, dont ce
 * module consomme `notesSyscohada()` (les 36 notes de l'AUDCIF Titre IX
 * ch. 6). Le moteur déclaratif de notes est la deuxième et dernière chose
 * commune aux deux référentiels, avec les aides techniques de
 * `etats-financiers.communs.ts` · voir `note-annexe.types.ts`.
 */
@Module({
  imports: [ComptabiliteModule, LicenceModule, JwtAuthModule, ExerciceModule, NotesAnnexesModule],
  controllers: [EtatsFinanciersSyscohadaController],
  providers: [EtatsFinanciersSyscohadaService, EtatsFinanciersSmtSyscohadaService],
  exports: [EtatsFinanciersSyscohadaService, EtatsFinanciersSmtSyscohadaService],
})
export class EtatsFinanciersSyscohadaModule {}

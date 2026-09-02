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
import { EtatsFinanciersSyscohadaModule } from '../etats-financiers-syscohada/etats-financiers-syscohada.module';
import { ImmobilisationsModule } from '../immobilisations/immobilisations.module';

@Module({
  // `EtatsFinanciersSyscohadaModule` fournit les DEUX moteurs SYSCOHADA
  // (Système normal, Titre IX · Système minimal de trésorerie, Titre X) que
  // les exports et la liasse SYSCOHADA consomment. Il est importé en entier
  // et non recréé ici : un second moteur d'états serait un second endroit où
  // un poste peut diverger de sa table de correspondance.
  imports: [
    LicenceModule,
    JwtAuthModule,
    ComptabiliteModule,
    EtatsFinanciersModule,
    EtatsFinanciersSyscohadaModule,
    NotesAnnexesModule,
    RegistreDonateursModule,
    DocumentsObligatoiresModule,
    // Le tableau des immobilisations et celui des amortissements sont calculés
    // par le service du module, pas recalculés ici · un second calcul de
    // dotation serait un second endroit où l'annuité peut diverger.
    ImmobilisationsModule,
  ],
  controllers: [ExportController],
  providers: [ExportService],
  // Exporté pour GroupeModule : la liasse du groupe en un clic reverse la
  // balance agrégée dans le dossier de combinaison puis fait produire le
  // classeur par CE service · aucun second moteur de liasse.
  exports: [ExportService],
})
export class ExportsModule {}

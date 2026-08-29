import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/validate-env';
import { PrismaModule } from './common/prisma.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { LicenceModule } from './modules/licence/licence.module';
import { AuthModule } from './modules/auth/auth.module';
import { ComptesModule } from './modules/comptes/comptes.module';
import { ExerciceModule } from './modules/exercice/exercice.module';
import { ComptabiliteModule } from './modules/comptabilite/comptabilite.module';
import { EtatsFinanciersModule } from './modules/etats-financiers/etats-financiers.module';
import { UtilisateursModule } from './modules/utilisateurs/utilisateurs.module';
import { JournauxModule } from './modules/journaux/journaux.module';
import { LettrageModule } from './modules/lettrage/lettrage.module';
import { TiersModule } from './modules/tiers/tiers.module';
import { TvaModule } from './modules/tva/tva.module';
import { RapprochementModule } from './modules/rapprochement/rapprochement.module';
import { ImmobilisationsModule } from './modules/immobilisations/immobilisations.module';
import { ExportsModule } from './modules/exports/exports.module';
import { BailleursModule } from './modules/bailleurs/bailleurs.module';
import { NotesAnnexesModule } from './modules/notes-annexes/notes-annexes.module';
import { RegistreDonateursModule } from './modules/registre-donateurs/registre-donateurs.module';
import { DocumentsObligatoiresModule } from './modules/documents-obligatoires/documents-obligatoires.module';
import { OperationsSpecifiquesModule } from './modules/operations-specifiques/operations-specifiques.module';
import { AnalytiqueModule } from './modules/analytique/analytique.module';
import { ImportModule } from './modules/import/import.module';
import { ControlesModule } from './modules/controles/controles.module';
import { RegularisationModule } from './modules/regularisation/regularisation.module';
import { DevisesModule } from './modules/devises/devises.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    TenantModule,
    LicenceModule,
    AuthModule,
    ComptesModule,
    ExerciceModule,
    JournauxModule,
    ComptabiliteModule,
    LettrageModule,
    TiersModule,
    TvaModule,
    RapprochementModule,
    ImmobilisationsModule,
    EtatsFinanciersModule,
    ExportsModule,
    UtilisateursModule,
    BailleursModule,
    NotesAnnexesModule,
    RegistreDonateursModule,
    DocumentsObligatoiresModule,
    OperationsSpecifiquesModule,
    AnalytiqueModule,
    ImportModule,
    ControlesModule,
    RegularisationModule,
    DevisesModule,
  ],
})
export class AppModule {}

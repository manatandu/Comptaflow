import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditContexteInterceptor } from './common/audit/audit-contexte.interceptor';
import { MotDePasseAChangerGuard } from './common/guards/mot-de-passe-a-changer.guard';
import { JournalAuditModule } from './common/audit/journal-audit.module';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/validate-env';
import { PrismaModule } from './common/prisma.module';
import { SanteController } from './common/sante.controller';
import { TenantModule } from './modules/tenant/tenant.module';
import { LicenceModule } from './modules/licence/licence.module';
import { AuthModule } from './modules/auth/auth.module';
import { ComptesModule } from './modules/comptes/comptes.module';
import { ExerciceModule } from './modules/exercice/exercice.module';
import { ComptabiliteModule } from './modules/comptabilite/comptabilite.module';
import { EtatsFinanciersModule } from './modules/etats-financiers/etats-financiers.module';
import { EtatsFinanciersSyscohadaModule } from './modules/etats-financiers-syscohada/etats-financiers-syscohada.module';
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
import { AffectationModule } from './modules/affectation/affectation.module';
import { RelancesModule } from './modules/relances/relances.module';
import { RetenuesModule } from './modules/retenues/retenues.module';
import { ExonerationsModule } from './modules/exonerations/exonerations.module';
import { FiscaliteModule } from './modules/fiscalite/fiscalite.module';
import { PlateformeModule } from './modules/plateforme/plateforme.module';
import { GroupeModule } from './modules/groupe/groupe.module';

@Module({
  imports: [
    JournalAuditModule,
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // LIMITATION DE DÉBIT · par adresse (X-Forwarded-For, voir `trust proxy`
    // dans bootstrap.ts). 300 requêtes/min laissent passer n'importe quel
    // usage réel du logiciel (l'ouverture d'un dossier en déclenche une
    // vingtaine), et coupent un script qui martèle l'API. Les routes
    // d'identification portent en plus leur propre limite serrée
    // (@Throttle sur AuthController) : c'est là que se joue la force brute
    // sur les mots de passe.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 300 }],
      errorMessage: 'Trop de tentatives depuis cette adresse · patientez une minute puis réessayez.',
    }),
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
    EtatsFinanciersSyscohadaModule,
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
    AffectationModule,
    RelancesModule,
    RetenuesModule,
    ExonerationsModule,
    FiscaliteModule,
    PlateformeModule,
    GroupeModule,
  ],
  controllers: [SanteController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // GLOBAL · un mot de passe provisoire ferme le logiciel jusqu'à son
    // remplacement. Posé contrôleur par contrôleur, ce refus serait oublié au
    // prochain module, et l'oubli ne se verrait pas.
    { provide: APP_GUARD, useClass: MotDePasseAChangerGuard },
    // GLOBAL, à dessein · le journal d'audit ne saurait pas qui agit si un
    // seul contrôleur oubliait de poser le contexte.
    { provide: APP_INTERCEPTOR, useClass: AuditContexteInterceptor },
  ],
})
export class AppModule {}

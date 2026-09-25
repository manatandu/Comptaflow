import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditContexteInterceptor } from './common/audit/audit-contexte.interceptor';
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
import { StockModule } from './modules/stocks/stock.module';
import { PersonnelModule } from './modules/personnel/personnel.module';
import { EmballagesModule } from './modules/emballages/emballages.module';
import { AffectationModule } from './modules/affectation/affectation.module';
import { RelancesModule } from './modules/relances/relances.module';
import { ReglementsModule } from './modules/reglements/reglements.module';
import { RetenuesModule } from './modules/retenues/retenues.module';
import { ExonerationsModule } from './modules/exonerations/exonerations.module';
import { InventaireModule } from './modules/inventaire/inventaire.module';
import { CircularisationModule } from './modules/circularisation/circularisation.module';
import { FaiblessesModule } from './modules/faiblesses/faiblesses.module';
import { MandatAuditeurModule } from './modules/mandat-auditeur/mandat-auditeur.module';
import { AccordCadreModule } from './modules/accord-cadre/accord-cadre.module';
import { ConsolidationModule } from './modules/consolidation/consolidation.module';
import { IfrsModule } from './modules/ifrs/ifrs.module';
import { FacturationModule } from './modules/facturation/facturation.module';
import { CommercialModule } from './modules/commercial/commercial.module';
import { ConstitutionModule } from './modules/constitution/constitution.module';
import { QuestionnaireModule } from './modules/questionnaire/questionnaire.module';
import { MonnaieFonctionnelleModule } from './modules/monnaie-fonctionnelle/monnaie-fonctionnelle.module';
import { ProvisionsModule } from './modules/provisions/provisions.module';
import { FiscaliteModule } from './modules/fiscalite/fiscalite.module';
import { PlateformeModule } from './modules/plateforme/plateforme.module';
import { GroupeModule } from './modules/groupe/groupe.module';
import { ModelesSaisieModule } from './modules/modeles-saisie/modeles-saisie.module';
import { CourrierModule } from './modules/courrier/courrier.module';

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
    //
    // COMPTÉ PAR INSTANCE, ET ASSUMÉ (2026-09-24) · aucun `storage`, donc un
    // compteur par conteneur Cloud Run, jusqu'à quatre fois le plafond écrit.
    // La force brute est tenue par le verrouillage PAR COMPTE, qui vit en
    // base. Voir docs/connexions-et-plafonds.md § 7 avant d'y toucher.
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
    StockModule,
    PersonnelModule,
    EmballagesModule,
    RelancesModule,
    ReglementsModule,
    RetenuesModule,
    ExonerationsModule,
    InventaireModule,
    CircularisationModule,
    FaiblessesModule,
    MandatAuditeurModule,
    AccordCadreModule,
    ConsolidationModule,
    IfrsModule,
    FacturationModule,
    CommercialModule,
    ConstitutionModule,
    QuestionnaireModule,
    MonnaieFonctionnelleModule,
    ProvisionsModule,
    FiscaliteModule,
    PlateformeModule,
    GroupeModule,
    ModelesSaisieModule,
    CourrierModule,
  ],
  controllers: [SanteController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // LE MOT DE PASSE PROVISOIRE N'EST PLUS UNE GARDE GLOBALE · Nest exécute
    // les gardes globales avant celles du contrôleur, et celle-ci ne voyait
    // donc jamais l'utilisateur · elle ne refusait rien. Le contrôle vit dans
    // JwtAuthGuard, que toute route authentifiée traverse (2026-09-24).
    // GLOBAL, à dessein · le journal d'audit ne saurait pas qui agit si un
    // seul contrôleur oubliait de poser le contexte.
    { provide: APP_INTERCEPTOR, useClass: AuditContexteInterceptor },
  ],
})
export class AppModule {}

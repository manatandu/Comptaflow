import { BadRequestException, Controller, Get, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { Referentiel } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EtatsFinanciersService } from './etats-financiers.service';
import { EtatsFinanciersProjetService } from './etats-financiers-projet.service';
import { EtatsFinanciersSmtService } from './etats-financiers-smt.service';
import { EtatsFinanciersProjetBudgetService } from './etats-financiers-projet-budget.service';

/**
 * Même raison qu'au contrôleur d'export : un `@Query` scalaire échappe au
 * ValidationPipe global, et un `exerciceId` absent devient `undefined`, que
 * Prisma ignore · l'état porterait alors sur TOUS les exercices du dossier
 * sans le dire.
 */
const EXERCICE_REQUIS = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("Le paramètre exerciceId est requis et doit être un identifiant d'exercice valide"),
});

// RolesGuard présent pour que tout `@Roles` ajouté plus tard soit réellement
// appliqué (sans lui, il serait silencieusement ignoré).
//
// SYCEBNL SEULEMENT · tous les moteurs de ce contrôleur (bilan, compte de
// résultat, TFT, jeu projets, SMT) montent les états de l'Acte uniforme
// SYCEBNL depuis ses tableaux de correspondance. Les servir à un dossier
// SYSCOHADA imprimerait des états du mauvais référentiel · la fenêtre client
// aiguille un tel dossier vers son propre écran (voir la fin de
// EtatsFinanciersPage.tsx), et cette garde rend l'aiguillage vrai même par
// appel API direct. Le pendant SYSCOHADA est le contrôleur
// `etats-financiers-syscohada`, gardé symétriquement.
@ReferentielsAutorises(Referentiel.SYCEBNL)
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@Controller('etats-financiers')
export class EtatsFinanciersController {
  constructor(
    private readonly etatsFinanciersService: EtatsFinanciersService,
    private readonly etatsFinanciersProjetService: EtatsFinanciersProjetService,
    private readonly etatsFinanciersSmtService: EtatsFinanciersSmtService,
    private readonly etatsFinanciersProjetBudgetService: EtatsFinanciersProjetBudgetService,
  ) {}

  /** Jeu « associations et ordres professionnels » (Partie 4, ch. 2). */
  @Get('bilan')
  async bilan(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.etatsFinanciersService.bilan(user.tenantId, exerciceId);
  }

  /** Compte de résultat · postes officiels SYCEBNL (Partie 4, ch. 2). */
  @Get('compte-de-resultat')
  async compteDeResultat(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.etatsFinanciersService.compteDeResultat(user.tenantId, exerciceId);
  }

  /**
   * Tableau de flux de trésorerie · état propre au jeu « associations et
   * ordres professionnels » (Partie 4, ch. 1 § 4 : « Le tableau des flux de
   * trésorerie est un état financier spécifique aux associations et ordres
   * professionnels »). Méthode directe, formule officielle, double contrôle
   * de bouclage · voir `correspondance-tft.ts`.
   */
  @Get('tableau-flux-tresorerie')
  async tableauFluxTresorerie(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.etatsFinanciersService.tableauFluxTresorerie(user.tenantId, exerciceId);
  }

  /**
   * Jeu « projets de développement et assimilés » (Partie 4, ch. 3) · bilan
   * et compte d'exploitation seulement ; voir
   * `EtatsFinanciersProjetService` pour ce qui reste hors périmètre
   * (tableau d'exécution budgétaire, TER, TRC).
   */
  @Get('projet/bilan')
  async bilanProjet(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.etatsFinanciersProjetService.bilan(user.tenantId, exerciceId);
  }

  @Get('projet/compte-exploitation')
  async compteExploitationProjet(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.etatsFinanciersProjetService.compteExploitation(user.tenantId, exerciceId);
  }

  /**
   * TABLEAU EMPLOIS-RESSOURCES (Section 1, FA à GZ) · correspondance du
   * Guide d'application, chapitre 7, APPLICATION 21.
   */
  @Get('projet/emplois-ressources')
  async emploisRessources(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.etatsFinanciersProjetService.tableauEmploisRessources(user.tenantId, exerciceId);
  }

  /**
   * TABLEAU D'EXÉCUTION BUDGÉTAIRE (Section 2, et NOTE 24) · une ligne par
   * section du plan analytique qui tient la nomenclature budgétaire du
   * projet. `planId` facultatif : à défaut, le premier plan actif à budgets.
   */
  @Get('projet/execution-budgetaire')
  async executionBudgetaire(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
    @Query('planId') planId?: string,
  ) {
    return this.etatsFinanciersProjetBudgetService.executionBudgetaire(user.tenantId, exerciceId, planId);
  }

  /**
   * TABLEAU DE RÉCONCILIATION DE TRÉSORERIE (Section 3, repères A à I).
   * `paiementsEnInstance` est extra-comptable (repère H) : il est saisi par
   * l'entité et repris tel quel.
   */
  @Get('projet/reconciliation-tresorerie')
  async reconciliationTresorerie(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
    @Query('paiementsEnInstance') paiementsEnInstance?: string,
  ) {
    // `Number('')` vaut 0 et `Number(undefined)` vaut NaN : le garde-fou
    // évite qu'un paramètre absent ou mal formé fasse ressortir NaN sur un
    // état imprimé.
    const montant = Number(paiementsEnInstance);
    return this.etatsFinanciersProjetBudgetService.reconciliationTresorerie(
      user.tenantId,
      exerciceId,
      Number.isFinite(montant) ? montant : 0,
    );
  }

  /**
   * NOTE 9 : FONDS DU BAILLEUR (Partie 4, ch. 3, Section 6) · comptabilité
   * analytique par projet/bailleur, docs/plan-de-construction.md item 14.
   */
  @Get('projet/note-bailleur')
  async noteBailleur(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.etatsFinanciersProjetService.noteBailleur(user.tenantId, exerciceId);
  }

  /**
   * Jeu « Système Minimal de Trésorerie » (Partie 4, ch. 4) · bilan, compte
   * de résultat, journal unique de trésorerie (Note 4), notes 1, 2, 3 et 5,
   * et contrôle d'éligibilité de l'article 6. Voir
   * `EtatsFinanciersSmtService` pour la façon dont les recettes et les
   * dépenses sont reconstituées.
   */
  @Get('smt/bilan')
  async bilanSmt(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.etatsFinanciersSmtService.bilan(user.tenantId, exerciceId);
  }

  @Get('smt/compte-de-resultat')
  async compteDeResultatSmt(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.etatsFinanciersSmtService.compteDeResultat(user.tenantId, exerciceId);
  }

  /** NOTE 4 · un journal par banque et un journal pour la caisse (NB officiel). */
  @Get('smt/journal-tresorerie')
  async journalTresorerieSmt(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.etatsFinanciersSmtService.journalTresorerie(user.tenantId, exerciceId);
  }

  /** Notes 1, 2, 3 et 5, servies ensemble : elles tiennent toutes sur un écran. */
  @Get('smt/notes')
  async notesSmt(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    const [note1, note2, note3, note5] = await Promise.all([
      this.etatsFinanciersSmtService.note1Immobilisations(user.tenantId, exerciceId),
      this.etatsFinanciersSmtService.note2Stocks(user.tenantId, exerciceId),
      this.etatsFinanciersSmtService.note3CreancesDettes(user.tenantId, exerciceId),
      this.etatsFinanciersSmtService.note5Dotation(user.tenantId, exerciceId),
    ]);
    return { fiche: this.etatsFinanciersSmtService.ficheNotes(), note1, note2, note3, note5 };
  }

  /** Contrôle de l'article 6 · le S.M.T est une exception liée à la taille. */
  @Get('smt/eligibilite')
  async eligibiliteSmt(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.etatsFinanciersSmtService.eligibilite(user.tenantId, exerciceId);
  }
}

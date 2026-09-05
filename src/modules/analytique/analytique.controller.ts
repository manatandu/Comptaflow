import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AnalytiqueService } from './analytique.service';
import { EtatsAnalytiquesService } from './etats-analytiques.service';
import { EngagementService } from './engagement.service';
import {
  CreerPlanAnalytiqueDto,
  CreerSectionDto,
  DoterBudgetDto,
  ModifierBudgetMoisDto,
  ModifierPlanAnalytiqueDto,
  ModifierSectionDto,
  VentilerLigneDto,
} from './dto/analytique.dto';
import { CloreEngagementDto, CreerEngagementDto, RattacherExecutionDto } from './dto/engagement.dto';
import { Referentiel, RoleUtilisateur } from '@prisma/client';

/**
 * Même règle que le plan comptable et les journaux : consultation ouverte aux
 * trois rôles, création et modification des éléments de STRUCTURE (plans,
 * sections, budgets) réservées à l'admin. La VENTILATION, elle, est un acte de
 * saisie et non de structure : elle suit les droits d'écriture, comme la
 * saisie d'une écriture ou son lettrage.
 */
// La garde de référentiel est ajoutée ici pour les seules routes
// d'engagement, qui la portent chacune : sans décorateur sur la route, elle
// laisse passer, et les plans, sections, budgets et ventilations restent
// communs aux deux référentiels.
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@Controller('analytique')
export class AnalytiqueController {
  constructor(
    private readonly analytique: AnalytiqueService,
    private readonly etats: EtatsAnalytiquesService,
    private readonly engagements: EngagementService,
  ) {}

  // --- Plans ---------------------------------------------------------------

  @Get('plans')
  async listerPlans(@CurrentUser() user: AuthenticatedUser) {
    return this.analytique.listerPlans(user.tenantId);
  }

  @Post('plans')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async creerPlan(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerPlanAnalytiqueDto) {
    return this.analytique.creerPlan(user.tenantId, dto);
  }

  @Patch('plans/:planId')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async modifierPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('planId') planId: string,
    @Body() dto: ModifierPlanAnalytiqueDto,
  ) {
    return this.analytique.modifierPlan(user.tenantId, planId, dto);
  }

  @Delete('plans/:planId')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async supprimerPlan(@CurrentUser() user: AuthenticatedUser, @Param('planId') planId: string) {
    return this.analytique.supprimerPlan(user.tenantId, planId);
  }

  // --- Sections ------------------------------------------------------------

  @Get('plans/:planId/sections')
  async listerSections(@CurrentUser() user: AuthenticatedUser, @Param('planId') planId: string) {
    return this.analytique.listerSections(user.tenantId, planId);
  }

  @Post('plans/:planId/sections')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async creerSection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('planId') planId: string,
    @Body() dto: CreerSectionDto,
  ) {
    return this.analytique.creerSection(user.tenantId, planId, dto);
  }

  @Patch('sections/:sectionId')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async modifierSection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sectionId') sectionId: string,
    @Body() dto: ModifierSectionDto,
  ) {
    return this.analytique.modifierSection(user.tenantId, sectionId, dto);
  }

  @Delete('sections/:sectionId')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async supprimerSection(@CurrentUser() user: AuthenticatedUser, @Param('sectionId') sectionId: string) {
    return this.analytique.supprimerSection(user.tenantId, sectionId);
  }

  // --- Budget --------------------------------------------------------------

  @Get('sections/:sectionId/budget')
  async budget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sectionId') sectionId: string,
    @Query('exerciceId') exerciceId: string,
  ) {
    return this.analytique.budget(user.tenantId, sectionId, exerciceId);
  }

  @Post('sections/:sectionId/budget')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async doterBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sectionId') sectionId: string,
    @Body() dto: DoterBudgetDto,
  ) {
    return this.analytique.doterBudget(user.tenantId, sectionId, dto);
  }

  @Patch('sections/:sectionId/budget')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async modifierBudgetMois(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sectionId') sectionId: string,
    @Body() dto: ModifierBudgetMoisDto,
  ) {
    return this.analytique.modifierBudgetMois(user.tenantId, sectionId, dto);
  }

  // --- Ventilation ---------------------------------------------------------

  @Get('lignes/:ligneId/ventilations')
  async ventilations(@CurrentUser() user: AuthenticatedUser, @Param('ligneId') ligneId: string) {
    return this.analytique.ventilationsDeLigne(user.tenantId, ligneId);
  }

  @Post('lignes/:ligneId/ventilations')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async ventiler(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ligneId') ligneId: string,
    @Body() dto: VentilerLigneDto,
  ) {
    return this.analytique.ventilerLigne(user.tenantId, ligneId, dto.ventilations);
  }

  @Delete('lignes/:ligneId/ventilations')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async effacer(@CurrentUser() user: AuthenticatedUser, @Param('ligneId') ligneId: string) {
    return this.analytique.effacerVentilation(user.tenantId, ligneId);
  }

  // --- États ---------------------------------------------------------------

  @Get('etats/balance')
  async balance(
    @CurrentUser() user: AuthenticatedUser,
    @Query('planId') planId: string,
    @Query('exerciceId') exerciceId: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
  ) {
    return this.etats.balance(user.tenantId, { planId, exerciceId, dateDebut, dateFin });
  }

  @Get('etats/grand-livre')
  async grandLivre(
    @CurrentUser() user: AuthenticatedUser,
    @Query('sectionId') sectionId: string,
    @Query('exerciceId') exerciceId: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
  ) {
    return this.etats.grandLivre(user.tenantId, { sectionId, exerciceId, dateDebut, dateFin });
  }

  @Get('etats/controle-cumuls')
  async controleCumuls(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId: string,
    @Query('planId') planId?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
  ) {
    return this.etats.controleCumuls(user.tenantId, { exerciceId, planId, dateDebut, dateFin });
  }

  @Get('etats/budgetaire')
  async etatBudgetaire(
    @CurrentUser() user: AuthenticatedUser,
    @Query('planId') planId: string,
    @Query('exerciceId') exerciceId: string,
    @Query('mois') mois?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
  ) {
    return this.etats.etatBudgetaire(user.tenantId, {
      planId,
      exerciceId,
      mois: mois ? Number(mois) : undefined,
      dateDebut,
      dateFin,
    });
  }

  // --- Engagements de dépense ---------------------------------------------
  //
  // FERMÉES AU SYSCOHADA. La colonne Engagement et ses trois termes viennent
  // du tableau d'exécution budgétaire du jeu « projets de développement » du
  // SYCEBNL. Aucun état du SYSCOHADA ne la porte, et ouvrir ce registre à une
  // société commerciale lui ferait tenir un document qu'aucun texte ne lui
  // demande. Le reste du contrôleur (plans, sections, budgets, ventilations)
  // reste commun aux deux.
  //
  // Les deux termes NON COMPTABLES de la colonne Engagement du tableau
  // d'exécution budgétaire (SYCEBNL, Guide d'application, ch. 7, APPLICATION
  // 22, règle (d)) : les bons de commande remis et les contrats signés, non
  // exécutés. Tenir ce registre est un acte de SAISIE, pas de structure : il
  // suit donc les droits d'écriture, comme la ventilation plus haut, et non
  // ceux de l'admin.

  @Get('engagements')
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  async listerEngagements(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.engagements.lister(user.tenantId, exerciceId);
  }

  @Get('engagements/ecritures-rattachables')
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  async ecrituresRattachables(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.engagements.ecrituresRattachables(user.tenantId, exerciceId);
  }

  @Post('engagements')
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async creerEngagement(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerEngagementDto) {
    return this.engagements.creer(user.tenantId, user.userId, dto);
  }

  @Post('engagements/:engagementId/executions')
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async rattacherExecution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('engagementId') engagementId: string,
    @Body() dto: RattacherExecutionDto,
  ) {
    return this.engagements.rattacherExecution(user.tenantId, user.userId, engagementId, dto);
  }

  @Delete('engagements/:engagementId/executions/:executionId')
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async detacherExecution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('engagementId') engagementId: string,
    @Param('executionId') executionId: string,
  ) {
    return this.engagements.detacherExecution(user.tenantId, engagementId, executionId);
  }

  @Patch('engagements/:engagementId/cloture')
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async cloreEngagement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('engagementId') engagementId: string,
    @Body() dto: CloreEngagementDto,
  ) {
    return this.engagements.clore(user.tenantId, engagementId, dto);
  }

  @Patch('engagements/:engagementId/reouverture')
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async rouvrirEngagement(@CurrentUser() user: AuthenticatedUser, @Param('engagementId') engagementId: string) {
    return this.engagements.rouvrir(user.tenantId, engagementId);
  }

  @Delete('engagements/:engagementId')
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async supprimerEngagement(@CurrentUser() user: AuthenticatedUser, @Param('engagementId') engagementId: string) {
    return this.engagements.supprimer(user.tenantId, engagementId);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AnalytiqueService } from './analytique.service';
import { EtatsAnalytiquesService } from './etats-analytiques.service';
import {
  CreerPlanAnalytiqueDto,
  CreerSectionDto,
  DoterBudgetDto,
  ModifierBudgetMoisDto,
  ModifierPlanAnalytiqueDto,
  ModifierSectionDto,
  VentilerLigneDto,
} from './dto/analytique.dto';
import { RoleUtilisateur } from '@prisma/client';

/**
 * Même règle que le plan comptable et les journaux : consultation ouverte aux
 * trois rôles, création et modification des éléments de STRUCTURE (plans,
 * sections, budgets) réservées à l'admin. La VENTILATION, elle, est un acte de
 * saisie et non de structure : elle suit les droits d'écriture, comme la
 * saisie d'une écriture ou son lettrage.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('analytique')
export class AnalytiqueController {
  constructor(
    private readonly analytique: AnalytiqueService,
    private readonly etats: EtatsAnalytiquesService,
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
}

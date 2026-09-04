import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TiersService } from './tiers.service';
import { CreerTiersDto, ModifierTiersDto, RattacherCompteDto } from './dto/tiers.dto';
import {
  CreerModeleReglementDto,
  ModifierModeleReglementDto,
  CreerEcheanceReglementDto,
  CalculerEcheancesDto,
} from './dto/modele-reglement.dto';
import { RoleUtilisateur, TypeTiers } from '@prisma/client';

// Même règle que Plan de comptes / Journaux : consultation ouverte aux trois
// rôles, gestion (création, rattachement de comptes...) réservée à l'admin.
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('tiers')
export class TiersController {
  constructor(private readonly tiersService: TiersService) {}

  @Get()
  async lister(
    @CurrentUser() user: AuthenticatedUser,
    @Query('type') type?: TypeTiers,
    @Query('recherche') recherche?: string,
    @Query('actifsSeuls') actifsSeuls?: string,
  ) {
    return this.tiersService.lister(user.tenantId, { type, recherche, actifsSeuls: actifsSeuls === 'true' });
  }

  /**
   * Les dossiers que ce dossier peut désigner sur `celluleGroupeId` · la
   * fiche du tiers y puise sa liste, de sorte que l'écran ne propose JAMAIS
   * autre chose que ce que TiersService accepte.
   *
   * DÉCLARÉE AVANT `:id` · Nest apparie les routes dans l'ordre, et
   * `/tiers/dossiers-du-groupe` serait sinon lue comme un identifiant.
   */
  @Get('dossiers-du-groupe')
  async dossiersDuGroupe(@CurrentUser() user: AuthenticatedUser) {
    return this.tiersService.dossiersDuGroupe(user.tenantId);
  }

  @Get(':id')
  async obtenir(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tiersService.obtenir(user.tenantId, id);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerTiersDto) {
    return this.tiersService.creer(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Patch(':id')
  async modifier(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ModifierTiersDto) {
    return this.tiersService.modifier(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post(':id/comptes')
  async rattacherCompte(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RattacherCompteDto,
  ) {
    return this.tiersService.rattacherCompte(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Put(':id/comptes/:compteId/principal')
  async definirComptePrincipal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('compteId') compteId: string,
  ) {
    return this.tiersService.definirComptePrincipal(user.tenantId, id, compteId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Delete(':id/comptes/:compteId')
  async detacherCompte(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('compteId') compteId: string,
  ) {
    return this.tiersService.detacherCompte(user.tenantId, id, compteId);
  }
}

@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('modeles-reglement')
export class ModeleReglementController {
  constructor(private readonly tiersService: TiersService) {}

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser) {
    return this.tiersService.listerModelesReglement(user.tenantId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerModeleReglementDto) {
    return this.tiersService.creerModeleReglement(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Patch(':id')
  async modifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModifierModeleReglementDto,
  ) {
    return this.tiersService.modifierModeleReglement(user.tenantId, id, dto);
  }

  /** Fractionnement en plusieurs échéances · voir TiersService.ajouterEcheance(). */
  @Get(':id/echeances')
  async listerEcheances(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tiersService.listerEcheances(user.tenantId, id);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post(':id/echeances')
  async ajouterEcheance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreerEcheanceReglementDto,
  ) {
    return this.tiersService.ajouterEcheance(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Delete(':id/echeances/:echeanceId')
  async supprimerEcheance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('echeanceId') echeanceId: string,
  ) {
    return this.tiersService.supprimerEcheance(user.tenantId, id, echeanceId);
  }

  /** Essai/simulation · pure lecture, ouvert aux trois rôles comme le reste des consultations. */
  @Post(':id/calculer')
  async calculerEcheances(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CalculerEcheancesDto,
  ) {
    return this.tiersService.calculerEcheances(user.tenantId, id, dto);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RegularisationService } from './regularisation.service';
import {
  CreerAbonnementDto,
  CreerRegularisationDto,
  GenererAbonnementDto,
  ModifierAbonnementDto,
} from './dto/regularisation.dto';
import { RoleUtilisateur } from '@prisma/client';

/**
 * Régularisations et abonnements posent des écritures : mêmes droits que la
 * saisie (admin et comptable), consultation ouverte aux trois rôles.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('regularisations')
export class RegularisationController {
  constructor(private readonly service: RegularisationService) {}

  // --- Régularisations -----------------------------------------------------

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.service.lister(user.tenantId, exerciceId);
  }

  /** Calcule le prorata sans rien enregistrer. */
  @Post('simuler')
  async simuler(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerRegularisationDto) {
    return this.service.simuler(user.tenantId, dto);
  }

  @Post()
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerRegularisationDto) {
    return this.service.creer(user.tenantId, user.userId, dto);
  }

  @Post(':id/reprise')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async reprendre(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { exerciceCibleId: string },
  ) {
    return this.service.reprendre(user.tenantId, user.userId, id, body.exerciceCibleId);
  }

  // --- Abonnements ---------------------------------------------------------

  @Get('abonnements/liste')
  async listerAbonnements(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listerAbonnements(user.tenantId);
  }

  @Post('abonnements')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async creerAbonnement(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerAbonnementDto) {
    return this.service.creerAbonnement(user.tenantId, user.userId, dto);
  }

  @Patch('abonnements/:id')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async modifierAbonnement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModifierAbonnementDto,
  ) {
    return this.service.modifierAbonnement(user.tenantId, id, dto);
  }

  @Delete('abonnements/:id')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async supprimerAbonnement(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.supprimerAbonnement(user.tenantId, id);
  }

  /** Passe les écritures des échéances dues. Idempotent. */
  @Post('abonnements/:id/generer')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async generer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GenererAbonnementDto,
  ) {
    return this.service.genererEcritures(user.tenantId, user.userId, id, dto);
  }
}

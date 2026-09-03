import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModeleSaisieService } from './modele-saisie.service';
import { CreerModeleSaisieDto, ModifierModeleSaisieDto } from './dto/modele-saisie.dto';

/**
 * Même règle que la saisie d'écritures : LECTURE_SEULE consulte les modèles
 * (la barre du journal les propose, l'appliquer ne fait que remplir une
 * grille), seuls ADMIN_CABINET et COMPTABLE les créent et les modifient.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('modeles-saisie')
export class ModeleSaisieController {
  constructor(private readonly service: ModeleSaisieService) {}

  @Get()
  async lister(
    @CurrentUser() user: AuthenticatedUser,
    @Query('journalId') journalId?: string,
    @Query('inclureInactifs') inclureInactifs?: string,
  ) {
    return this.service.lister(user.tenantId, journalId, inclureInactifs === 'true');
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerModeleSaisieDto) {
    return this.service.creer(user.tenantId, user.userId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Patch(':id')
  async modifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModifierModeleSaisieDto,
  ) {
    return this.service.modifier(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete(':id')
  async supprimer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.supprimer(user.tenantId, id);
  }
}

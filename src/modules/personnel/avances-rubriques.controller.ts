import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccesRolesCantonnes } from '../../common/decorators/acces-roles-cantonnes.decorator';
import { AvancesRubriquesService } from './avances-rubriques.service';
import { AvanceSalaireDto, ModeleBulletinDto, ModifierRubriquePaieDto, RubriquePaieDto } from './dto/personnel.dto';

/**
 * Rubriques de paie du cabinet et registre des avances · mêmes droits que le
 * registre du personnel, dont ils font partie (données nominatives, fermées à
 * l'aide-comptable, ouvertes au gestionnaire de paie).
 */
@AccesRolesCantonnes({ aideComptable: false, gestionnairePaie: true })
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('personnel')
export class AvancesRubriquesController {
  constructor(private readonly service: AvancesRubriquesService) {}

  @Get('rubriques')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  listerRubriques(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listerRubriques(user.tenantId);
  }

  @Post('rubriques')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  creerRubrique(@CurrentUser() user: AuthenticatedUser, @Body() dto: RubriquePaieDto) {
    return this.service.creerRubrique(user.tenantId, dto);
  }

  @Patch('rubriques/:id')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  modifierRubrique(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ModifierRubriquePaieDto) {
    return this.service.modifierRubrique(user.tenantId, id, dto);
  }

  @Get('modeles-bulletin')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  listerModeles(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listerModeles(user.tenantId);
  }

  @Post('modeles-bulletin')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  creerModele(@CurrentUser() user: AuthenticatedUser, @Body() dto: ModeleBulletinDto) {
    return this.service.creerModele(user.tenantId, user.email, dto);
  }

  @Delete('modeles-bulletin/:id')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  supprimerModele(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.supprimerModele(user.tenantId, id);
  }

  @Get('avances')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  listerAvances(@CurrentUser() user: AuthenticatedUser, @Query('salarieId') salarieId?: string) {
    return this.service.listerAvances(user.tenantId, salarieId || undefined);
  }

  @Post('salaries/:salarieId/avances')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  creerAvance(@CurrentUser() user: AuthenticatedUser, @Param('salarieId') salarieId: string, @Body() dto: AvanceSalaireDto) {
    return this.service.creerAvance(user.tenantId, user.email, salarieId, dto);
  }

  @Delete('avances/:id')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  supprimerAvance(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.supprimerAvance(user.tenantId, id);
  }
}

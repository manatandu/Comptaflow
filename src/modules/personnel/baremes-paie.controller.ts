import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccesRolesCantonnes } from '../../common/decorators/acces-roles-cantonnes.decorator';
import { BaremesPaieService } from './baremes-paie.service';
import { VersionBaremePaieDto } from './dto/personnel.dto';

/**
 * Barèmes de paie datés · mêmes droits que le registre du personnel, dont le
 * calcul dépend (fermés à l'aide-comptable, ouverts au gestionnaire de paie).
 */
@AccesRolesCantonnes({ aideComptable: false, gestionnairePaie: true })
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('personnel/baremes')
export class BaremesPaieController {
  constructor(private readonly service: BaremesPaieService) {}

  @Get()
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  lister(@CurrentUser() user: AuthenticatedUser) {
    return this.service.lister(user.tenantId);
  }

  @Post()
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  ajouter(@CurrentUser() user: AuthenticatedUser, @Body() dto: VersionBaremePaieDto) {
    return this.service.ajouter(user.tenantId, user.email, dto);
  }

  @Delete(':id')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  supprimer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.supprimer(user.tenantId, id);
  }
}

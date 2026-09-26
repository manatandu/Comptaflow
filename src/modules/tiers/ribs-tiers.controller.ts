import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RibsTiersService } from './ribs-tiers.service';
import { RibTiersDto } from './dto/ribs-tiers.dto';

/**
 * Le volet « Coordonnées bancaires » de la fiche tiers. Lu par tous, comme la
 * fiche ; écrit par l'administrateur seul, comme la structure du tiers et les
 * RIB du dossier (Structure > Banques).
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller()
export class RibsTiersController {
  constructor(private readonly ribs: RibsTiersService) {}

  @Get('tiers/:tiersId/ribs')
  lister(@CurrentUser() user: AuthenticatedUser, @Param('tiersId') tiersId: string) {
    return this.ribs.lister(user.tenantId, tiersId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post('tiers/:tiersId/ribs')
  creer(@CurrentUser() user: AuthenticatedUser, @Param('tiersId') tiersId: string, @Body() dto: RibTiersDto) {
    return this.ribs.creer(user.tenantId, tiersId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Patch('ribs-tiers/:id')
  modifier(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RibTiersDto) {
    return this.ribs.modifier(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Delete('ribs-tiers/:id')
  supprimer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ribs.supprimer(user.tenantId, id);
  }
}

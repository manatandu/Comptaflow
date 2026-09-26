import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { DegressifService } from './degressif.service';
import { OptionDegressifDto, PasserDerogatoireDto } from './dto/immobilisation.dto';

/** Dégressif fiscal et dérogatoire · mêmes droits que la dotation. */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('immobilisations')
export class DegressifController {
  constructor(private readonly degressif: DegressifService) {}

  @Get(':id/plan-fiscal')
  plan(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.degressif.planFiscal(user.tenantId, id);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/option-degressif')
  opter(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: OptionDegressifDto) {
    return this.degressif.opter(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/derogatoire')
  passer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: PasserDerogatoireDto) {
    return this.degressif.passer(user.tenantId, user.userId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/derogatoire/solde')
  solder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: PasserDerogatoireDto) {
    return this.degressif.solder(user.tenantId, user.userId, id, dto);
  }
}

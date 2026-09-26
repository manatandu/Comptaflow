import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { LotsVirementService } from './lots-virement.service';
import { LotVirementDto } from './lots-virement.dto';

/** Consultés par tous · définis par l'administrateur et le comptable, comme le règlement. */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('lots-virement')
export class LotsVirementController {
  constructor(private readonly lots: LotsVirementService) {}

  @Get()
  lister(@CurrentUser() user: AuthenticatedUser) {
    return this.lots.lister(user.tenantId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post()
  creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: LotVirementDto) {
    return this.lots.creer(user.tenantId, user.email, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Patch(':id')
  modifier(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: LotVirementDto) {
    return this.lots.modifier(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete(':id')
  supprimer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.lots.supprimer(user.tenantId, id);
  }
}

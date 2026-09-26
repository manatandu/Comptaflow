import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { SimulationsService } from './simulations.service';
import { SimulationBudgetaireDto } from './dto/simulation.dto';

/** Consultées par tous · définies par l'administrateur et le comptable. Aucune écriture. */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('simulations-budgetaires')
export class SimulationsController {
  constructor(private readonly service: SimulationsService) {}

  @Get()
  lister(@CurrentUser() user: AuthenticatedUser) {
    return this.service.lister(user.tenantId);
  }

  @Get(':id/calcul')
  calculer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('arreteAu') arreteAu?: string,
    @Query('inclureBrouillard') inclureBrouillard?: string,
  ) {
    return this.service.calculer(user.tenantId, id, { arreteAu: arreteAu || undefined, inclureBrouillard: inclureBrouillard !== 'false' });
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post()
  creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: SimulationBudgetaireDto) {
    return this.service.creer(user.tenantId, user.email, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Patch(':id')
  modifier(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SimulationBudgetaireDto) {
    return this.service.modifier(user.tenantId, user.email, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete(':id')
  supprimer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.supprimer(user.tenantId, id);
  }
}

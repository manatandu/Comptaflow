import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TauxTvaService } from './taux-tva.service';
import { CreerTauxTvaDto, ModifierTauxTvaDto } from './dto/taux-tva.dto';
import { RoleUtilisateur } from '@prisma/client';

// Même règle que Plan de comptes / Journaux : consultation ouverte aux trois
// rôles, gestion réservée à l'admin.
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('taux-tva')
export class TauxTvaController {
  constructor(private readonly tauxTvaService: TauxTvaService) {}

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser, @Query('actifsSeuls') actifsSeuls?: string) {
    return this.tauxTvaService.lister(user.tenantId, actifsSeuls === 'true');
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerTauxTvaDto) {
    return this.tauxTvaService.creer(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Patch(':id')
  async modifier(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ModifierTauxTvaDto) {
    return this.tauxTvaService.modifier(user.tenantId, id, dto);
  }
}

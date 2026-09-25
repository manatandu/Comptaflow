import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { EtatsPersonnalisesService } from './etats-personnalises.service';
import { EtatPersonnaliseDto } from './dto/etat-personnalise.dto';

/** Consultés par tous · définis par l'administrateur et le comptable. */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('etats-personnalises')
export class EtatsPersonnalisesController {
  constructor(private readonly service: EtatsPersonnalisesService) {}

  @Get()
  lister(@CurrentUser() user: AuthenticatedUser) {
    return this.service.lister(user.tenantId);
  }

  @Get(':id/calcul')
  calculer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('exercices') exercices = '',
    @Query('inclureBrouillard') inclureBrouillard?: string,
  ) {
    return this.service.calculer(user.tenantId, id, exercices.split(','), inclureBrouillard === 'true');
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post()
  creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: EtatPersonnaliseDto) {
    return this.service.creer(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Patch(':id')
  modifier(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: EtatPersonnaliseDto) {
    return this.service.modifier(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete(':id')
  supprimer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.supprimer(user.tenantId, id);
  }
}

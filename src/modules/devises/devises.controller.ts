import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DevisesService } from './devises.service';
import { CreerDeviseDto, ModifierDeviseDto, PoserCoursDto, ReevaluerDto } from './dto/devises.dto';
import { RoleUtilisateur } from '@prisma/client';

@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('devises')
export class DevisesController {
  constructor(private readonly devises: DevisesService) {}

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser) {
    return this.devises.lister(user.tenantId);
  }

  @Post()
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerDeviseDto) {
    return this.devises.creer(user.tenantId, dto);
  }

  @Patch(':id')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async modifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModifierDeviseDto,
  ) {
    return this.devises.modifier(user.tenantId, id, dto);
  }

  /** Cote un cours à une date · en RDC, celui de la Banque Centrale du Congo. */
  @Post(':id/cours')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async poserCours(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PoserCoursDto,
  ) {
    return this.devises.poserCours(user.tenantId, id, dto);
  }

  /** Calcule les écarts sans rien enregistrer. */
  @Post('reevaluation/calcul')
  async calculer(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReevaluerDto) {
    return this.devises.calculer(user.tenantId, dto);
  }

  @Post('reevaluation')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async reevaluer(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReevaluerDto) {
    return this.devises.reevaluer(user.tenantId, user.userId, dto);
  }

  @Get('reevaluation/liste')
  async listerReevaluations(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.devises.listerReevaluations(user.tenantId, exerciceId);
  }

  @Post('reevaluation/:id/extourne')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async extourner(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { exerciceSuivantId: string },
  ) {
    return this.devises.extourner(user.tenantId, user.userId, id, body.exerciceSuivantId);
  }
}

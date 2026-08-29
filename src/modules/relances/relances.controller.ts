import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RelancesService } from './relances.service';
import { CreerNiveauDto, EmettreRelancesDto, ModifierNiveauDto } from './dto/relances.dto';
import { RoleUtilisateur, TypeRelance } from '@prisma/client';

@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('relances')
export class RelancesController {
  constructor(private readonly relances: RelancesService) {}

  @Get('niveaux')
  async listerNiveaux(@CurrentUser() user: AuthenticatedUser) {
    return this.relances.listerNiveaux(user.tenantId);
  }

  @Post('niveaux')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async creerNiveau(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerNiveauDto) {
    return this.relances.creerNiveau(user.tenantId, dto);
  }

  @Patch('niveaux/:id')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async modifierNiveau(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModifierNiveauDto,
  ) {
    return this.relances.modifierNiveau(user.tenantId, id, dto);
  }

  /** Positions à relancer · `type` choisit entre préventive, rappel et relevé. */
  @Get()
  async positions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId: string,
    @Query('type') type?: TypeRelance,
    @Query('dateReference') dateReference?: string,
    @Query('racine') racine?: string,
  ) {
    return this.relances.positions(user.tenantId, { exerciceId, type, dateReference, racine });
  }

  @Get('releve/:compteId')
  async releve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compteId') compteId: string,
    @Query('exerciceId') exerciceId: string,
  ) {
    return this.relances.releve(user.tenantId, compteId, exerciceId);
  }

  @Post('emettre')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async emettre(@CurrentUser() user: AuthenticatedUser, @Body() dto: EmettreRelancesDto) {
    return this.relances.emettre(user.tenantId, user.userId, dto);
  }

  @Get('historique')
  async historique(@CurrentUser() user: AuthenticatedUser, @Query('compteId') compteId?: string) {
    return this.relances.historique(user.tenantId, compteId);
  }
}

import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RapprochementService } from './rapprochement.service';
import {
  ConfirmerCorrespondancesDto,
  ImporterReleveDto,
  OuvrirRapprochementDto,
  PointerDto,
} from './dto/rapprochement.dto';
import { RoleUtilisateur } from '@prisma/client';

// Même règle que le lettrage : LECTURE_SEULE consulte, seuls ADMIN_CABINET
// et COMPTABLE pointent/clôturent.
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('rapprochements')
export class RapprochementController {
  constructor(private readonly rapprochementService: RapprochementService) {}

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser, @Query('compteId') compteId?: string) {
    return this.rapprochementService.lister(user.tenantId, compteId);
  }

  @Get(':id')
  async obtenir(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rapprochementService.obtenir(user.tenantId, id);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post()
  async ouvrir(@CurrentUser() user: AuthenticatedUser, @Body() dto: OuvrirRapprochementDto) {
    return this.rapprochementService.ouvrir(user.tenantId, user.userId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/pointer')
  async pointer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: PointerDto) {
    return this.rapprochementService.pointer(user.tenantId, id, dto.ligneIds);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/depointer')
  async depointer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: PointerDto) {
    return this.rapprochementService.depointer(user.tenantId, id, dto.ligneIds);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/cloturer')
  async cloturer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rapprochementService.cloturer(user.tenantId, id);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete(':id')
  async annuler(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rapprochementService.annuler(user.tenantId, id);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/releve')
  async importerReleve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ImporterReleveDto) {
    return this.rapprochementService.importerReleve(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete(':id/releve')
  async retirerReleve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rapprochementService.retirerReleve(user.tenantId, id);
  }

  // Lecture pure · rien n'est écrit, d'où l'absence de @Roles.
  @Get(':id/propositions')
  async proposer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('fenetreJours', new ParseIntPipe({ optional: true })) fenetreJours?: number,
  ) {
    return this.rapprochementService.proposer(user.tenantId, id, fenetreJours);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/correspondances')
  async confirmer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ConfirmerCorrespondancesDto,
  ) {
    return this.rapprochementService.confirmer(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/releve/:ligneReleveId/dissocier')
  async dissocier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('ligneReleveId') ligneReleveId: string,
  ) {
    return this.rapprochementService.dissocier(user.tenantId, id, ligneReleveId);
  }
}

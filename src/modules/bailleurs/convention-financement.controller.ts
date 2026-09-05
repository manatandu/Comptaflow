import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Referentiel, RoleUtilisateur } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ConventionFinancementService } from './convention-financement.service';
import {
  CloreConventionDto,
  CreerConventionDto,
  CreerRapportDto,
  CreerTrancheDto,
  EncaisserTrancheDto,
  ModifierConventionDto,
  TransmettreRapportDto,
} from './dto/convention.dto';

/**
 * SYCEBNL SEULEMENT, pour la même raison que le bailleur lui-même : la
 * convention de financement est le dossier d'un tiers financeur, notion de
 * l'Acte uniforme SYCEBNL (division 46). En SYSCOHADA le 46 porte les
 * apporteurs, associés et le groupe.
 *
 * La CONSULTATION est ouverte aux trois rôles · un profil lecture seule doit
 * pouvoir constater qu'une convention a expiré ou qu'un rapport est en retard,
 * c'est même souvent lui qui le voit le premier. La TENUE du dossier suit les
 * droits d'écriture ; la structure de la convention elle-même (montant
 * accordé, caractère de l'engagement) reste à l'admin, comme le bailleur, un
 * caractère mal qualifié commandant le traitement comptable tout entier.
 */
@ReferentielsAutorises(Referentiel.SYCEBNL)
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@Controller('conventions-financement')
export class ConventionFinancementController {
  constructor(private readonly conventions: ConventionFinancementService) {}

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser) {
    return this.conventions.lister(user.tenantId);
  }

  /** Les mentions que le § 5.4.2.4 impose de porter en Notes annexes. */
  @Get('mentions-notes-annexes')
  async mentions(@CurrentUser() user: AuthenticatedUser) {
    return this.conventions.mentionsEngagementsConditionnels(user.tenantId);
  }

  /** Ce qui peut être porté en créance à recevoir · rendu pour être VU. */
  @Get('creances-a-recevoir')
  async creances(@CurrentUser() user: AuthenticatedUser) {
    return this.conventions.creancesARecevoir(user.tenantId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerConventionDto) {
    return this.conventions.creer(user.tenantId, user.userId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Patch(':id')
  async modifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModifierConventionDto,
  ) {
    return this.conventions.modifier(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Patch(':id/cloture')
  async clore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloreConventionDto,
  ) {
    return this.conventions.clore(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/tranches')
  async ajouterTranche(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreerTrancheDto,
  ) {
    return this.conventions.ajouterTranche(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Patch(':id/tranches/:trancheId/encaissement')
  async encaisserTranche(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('trancheId', ParseUUIDPipe) trancheId: string,
    @Body() dto: EncaisserTrancheDto,
  ) {
    return this.conventions.encaisserTranche(user.tenantId, id, trancheId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete(':id/tranches/:trancheId')
  async supprimerTranche(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('trancheId', ParseUUIDPipe) trancheId: string,
  ) {
    return this.conventions.supprimerTranche(user.tenantId, id, trancheId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/rapports')
  async ajouterRapport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreerRapportDto,
  ) {
    return this.conventions.ajouterRapport(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Patch(':id/rapports/:rapportId/transmission')
  async transmettreRapport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rapportId', ParseUUIDPipe) rapportId: string,
    @Body() dto: TransmettreRapportDto,
  ) {
    return this.conventions.transmettreRapport(user.tenantId, id, rapportId, dto.dateTransmission);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete(':id/rapports/:rapportId')
  async supprimerRapport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rapportId', ParseUUIDPipe) rapportId: string,
  ) {
    return this.conventions.supprimerRapport(user.tenantId, id, rapportId);
  }
}

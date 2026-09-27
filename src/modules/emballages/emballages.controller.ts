import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { EmballagesService } from './emballages.service';
import {
  CreerConsignationDto,
  DenouerConsignationDto,
  RattacherEcritureConsignationDto,
} from './dto/consignation.dto';
import type { ModeDenouement } from './consignation';

/**
 * EMBALLAGES · commun aux deux référentiels (CLAUDE.md § 6). Les deux textes
 * décrivent la consignation dans les mêmes termes, aux fiches de leurs comptes
 * 40 et 41. Ce qui les sépare est le seul compte de PRODUIT, tranché dans
 * `nomenclature-emballages.ts`.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('emballages')
export class EmballagesController {
  constructor(private readonly emballages: EmballagesService) {}

  @Get('consignations')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  async lister(@CurrentUser() user: AuthenticatedUser) {
    return this.emballages.lister(user.tenantId);
  }

  @Post('consignations')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerConsignationDto) {
    return this.emballages.creer(user.tenantId, user.userId, dto);
  }

  // Aucun écran ne la lit (audit de l'interface, I12) · la fenêtre Emballages
  // lit le registre des consignations puis la proposition de dénouement.
  @Get('consignations/:id/ouverture')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  async ouverture(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.emballages.propositionOuverture(user.tenantId, id);
  }

  /**
   * La proposition SANS enregistrement · l'écran montre les lignes avant que
   * le comptable ne décide, et une simulation ne fait bouger aucun registre.
   */
  @Get('consignations/:id/denouement')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  async simuler(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('mode') mode: ModeDenouement,
    @Query('prixDeReprise') prixDeReprise?: string,
  ) {
    return this.emballages.propositionDenouement(
      user.tenantId,
      id,
      mode,
      prixDeReprise === undefined || prixDeReprise === '' ? null : Number(prixDeReprise),
    );
  }

  @Post('consignations/:id/denouement')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async denouer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DenouerConsignationDto,
  ) {
    return this.emballages.denouer(user.tenantId, id, dto);
  }

  /**
   * LE LIEN VERS L'ÉCRITURE PASSÉE · `:role` vaut « ouverture » ou
   * « denouement ». Le module propose et le comptable passe la pièce au
   * journal : ces trois routes sont le seul chemin qui écrive
   * `ecritureConsignationId` et `ecritureDenouementId` (audit du serveur de
   * 2026-09, I2).
   */
  @Get('consignations/:id/ecritures/:role/candidates')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  async candidates(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('role') role: string) {
    return this.emballages.ecrituresCandidates(user.tenantId, id, role);
  }

  @Post('consignations/:id/ecritures/:role')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async rattacher(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('role') role: string,
    @Body() dto: RattacherEcritureConsignationDto,
  ) {
    return this.emballages.rattacherEcriture(user.tenantId, id, role, dto.ecritureId);
  }

  @Delete('consignations/:id/ecritures/:role')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async detacher(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('role') role: string) {
    return this.emballages.detacherEcriture(user.tenantId, id, role);
  }
}

import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { EXERCICE_REQUIS } from '../../common/exercice-requis';
import { ReserveAuComptable } from '../../common/decorators/acces-roles-cantonnes.decorator';
import { CreancesDouteusesService } from './creances-douteuses.service';
import {
  AnnulerMouvementDto,
  AnnulerReclassementDto,
  AnnulerRevueDto,
  DeclarerCreanceOuvertureDto,
  PerteCreanceDto,
  ReclasserCreanceDto,
  RecouvrementCreanceDto,
  RevoirDepreciationDto,
} from './dto/creances-douteuses.dto';

/**
 * CRÉANCES DOUTEUSES OU LITIGIEUSES (ligne A7) · AUCUN `@ReferentielsAutorises`.
 * Les fiches des comptes 41, 49, 65 et 759 se lisent aux DEUX plans avec la
 * même mécanique ; ce qui diverge est la NOMENCLATURE (le 4161 et le 4162, le
 * 651), et c'est le service qui la résout selon le dossier, jamais la route.
 * Écritures aux mêmes droits que les régularisations ; lectures ouvertes.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('creances-douteuses')
export class CreancesDouteusesController {
  constructor(private readonly service: CreancesDouteusesService) {}

  @Get()
  lister(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.service.lister(user.tenantId, exerciceId);
  }

  /** Les créances à solde débiteur (lues sur la balance) et les 416 que le texte prescrit. */
  @Get('comptes')
  comptes(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
    @Query('numero') numero?: string,
  ) {
    return this.service.comptes(user.tenantId, exerciceId, numero);
  }

  @Get(':id/revue')
  propositionRevue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.service.propositionRevue(user.tenantId, id, exerciceId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post()
  reclasser(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReclasserCreanceDto) {
    return this.service.reclasser(user.tenantId, user.userId, dto);
  }

  /** Dossier repris · la créance déjà au 416 et au 491 avant OmegaX, sans écriture. */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('declarations')
  declarer(@CurrentUser() user: AuthenticatedUser, @Body() dto: DeclarerCreanceOuvertureDto) {
    return this.service.declarer(user.tenantId, user.userId, dto);
  }

  /** La DÉCISION de dépréciation · réservée au comptable (relecture adverse, M9). */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @ReserveAuComptable()
  @Post(':id/revue')
  revoir(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RevoirDepreciationDto) {
    return this.service.revoir(user.tenantId, user.userId, id, dto);
  }

  /**
   * La perte · réservée au comptable comme la revue (seconde relecture, M-d) ·
   * elle sort la créance du 416 en charge au 651, au TTC entier.
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @ReserveAuComptable()
  @Post(':id/perte')
  perte(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PerteCreanceDto) {
    return this.service.perte(user.tenantId, user.userId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/recouvrement')
  recouvrement(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecouvrementCreanceDto) {
    return this.service.recouvrement(user.tenantId, user.userId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete(':id')
  retirer(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.retirerCreance(user.tenantId, id);
  }

  /** L'annulation d'une revue (AUDCIF art. 20, al. 2) · réservée au comptable comme la revue. */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @ReserveAuComptable()
  @Post(':id/revues/:revueId/annuler')
  annulerRevue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revueId', ParseUUIDPipe) revueId: string,
    @Body() dto: AnnulerRevueDto,
  ) {
    return this.service.annulerRevue(user.tenantId, user.userId, id, revueId, dto);
  }

  /** L'annulation d'un reclassement (m2 · AUDCIF art. 20, al. 2) · réservée au comptable, comme la revue. */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @ReserveAuComptable()
  @Post(':id/annuler')
  annulerReclassement(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AnnulerReclassementDto) {
    return this.service.annulerReclassement(user.tenantId, user.userId, id, dto);
  }

  /** L'annulation d'une perte ou d'un recouvrement (K4 · AUDCIF art. 20, al. 2) · réservée au comptable. */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @ReserveAuComptable()
  @Post(':id/mouvements/:mouvementId/annuler')
  annulerMouvement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mouvementId', ParseUUIDPipe) mouvementId: string,
    @Body() dto: AnnulerMouvementDto,
  ) {
    return this.service.annulerMouvement(user.tenantId, user.userId, id, mouvementId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete(':id/mouvements/:mouvementId')
  retirerMouvement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mouvementId', ParseUUIDPipe) mouvementId: string,
  ) {
    return this.service.retirerMouvement(user.tenantId, user.userId, id, mouvementId);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Referentiel, RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PerimetreService } from './perimetre.service';
import { CumulService } from './cumul.service';
import { EtatsConsolidesService } from './etats-consolides.service';
import {
  AcquisitionDto,
  ImporterBalanceEntiteDto,
  OperationReciproqueDto,
  EntitePerimetreDto,
  FaitsConsolidationDto,
  LienParticipationDto,
  ModifierEntitePerimetreDto,
} from './dto/perimetre.dto';

/**
 * CLOISONNÉ AU SYSCOHADA · l'art. 3 du SYCEBNL écarte les art. 73 à 113 de
 * l'AUDCIF, donc tout le Titre II (consolidation et combinaison). Une
 * association et ses cellules relèvent du module groupe, qui n'est pas une
 * consolidation. Masquer la fenêtre ne suffit pas (§ 6) : la route se refuse.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@ReferentielsAutorises(Referentiel.SYSCOHADA)
@Controller('consolidation')
export class ConsolidationController {
  constructor(
    private readonly perimetre: PerimetreService,
    private readonly cumuls: CumulService,
    private readonly etatsConsolides: EtatsConsolidesService,
  ) {}

  @Get('perimetre')
  etat(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.perimetre.etat(user.tenantId, exerciceId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('entites')
  creerEntite(@CurrentUser() user: AuthenticatedUser, @Body() dto: EntitePerimetreDto) {
    return this.perimetre.creerEntite(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Patch('entites/:id')
  modifierEntite(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ModifierEntitePerimetreDto) {
    return this.perimetre.modifierEntite(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete('entites/:id')
  supprimerEntite(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.perimetre.supprimerEntite(user.tenantId, id);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('liens')
  ajouterLien(@CurrentUser() user: AuthenticatedUser, @Body() dto: LienParticipationDto) {
    return this.perimetre.ajouterLien(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete('liens/:id')
  supprimerLien(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.perimetre.supprimerLien(user.tenantId, id);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Put('faits')
  enregistrerFaits(@CurrentUser() user: AuthenticatedUser, @Body() dto: FaitsConsolidationDto) {
    return this.perimetre.enregistrerFaits(user.tenantId, dto);
  }

  // ─── Tranche 2 · cumul et éliminations ──────────────────────────────────

  @Get('cumul')
  cumul(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.cumuls.cumul(user.tenantId, exerciceId);
  }

  // ─── Tranche 3a · bilan, compte de résultat et note du périmètre ─────────
  @Get('etats')
  etats(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.etatsConsolides.etats(user.tenantId, exerciceId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('entites/:id/balance')
  importerBalance(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ImporterBalanceEntiteDto) {
    return this.cumuls.importerBalance(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Put('liens/:id/acquisition')
  declarerAcquisition(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AcquisitionDto) {
    return this.cumuls.declarerAcquisition(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('reciproques')
  ajouterReciproque(@CurrentUser() user: AuthenticatedUser, @Body() dto: OperationReciproqueDto) {
    return this.cumuls.ajouterReciproque(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete('reciproques/:id')
  supprimerReciproque(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.cumuls.supprimerReciproque(user.tenantId, id);
  }
}

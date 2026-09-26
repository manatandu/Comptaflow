import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Referentiel, RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { IfrsService } from './ifrs.service';
import { ActiviteIfrsDto, EffetChangeIfrsDto, MouvementCpIfrsDto, NotesIfrsDto, PremiereApplicationIfrsDto, RegleConsolidationIfrsDto, RegleIfrsDto, RetraitementIfrsDto, TresorerieIfrsDto } from './dto/ifrs.dto';

/**
 * CLOISONNÉ AU SYSCOHADA · l'art. 73-1 de l'AUDCIF vise les entités dont les
 * titres sont cotés ou qui font appel public à l'épargne, et l'art. 3 du
 * SYCEBNL écarte les art. 73 à 113 · une association n'a ni l'un ni l'autre.
 * La route se refuse, masquer la fenêtre ne suffit pas.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@ReferentielsAutorises(Referentiel.SYSCOHADA)
@Controller('ifrs')
export class IfrsController {
  constructor(private readonly ifrs: IfrsService) {}

  @Get()
  etat(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.ifrs.etat(user.tenantId, exerciceId);
  }

  @Get('consolide')
  etatConsolide(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.ifrs.etatConsolide(user.tenantId, exerciceId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('regles-consolidation')
  ajouterRegleConsolidation(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegleConsolidationIfrsDto) {
    return this.ifrs.ajouterRegleConsolidation(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete('regles-consolidation/:id')
  supprimerRegleConsolidation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ifrs.supprimerRegleConsolidation(user.tenantId, id);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Put('activite')
  declarerActivite(@CurrentUser() user: AuthenticatedUser, @Body() dto: ActiviteIfrsDto) {
    return this.ifrs.declarerActivite(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Put('premiere-application')
  declarerPremiereApplication(@CurrentUser() user: AuthenticatedUser, @Body() dto: PremiereApplicationIfrsDto) {
    return this.ifrs.declarerPremiereApplication(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Put('notes')
  declarerNotes(@CurrentUser() user: AuthenticatedUser, @Body() dto: NotesIfrsDto) {
    return this.ifrs.declarerNotes(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Put('tresorerie')
  declarerTresorerie(@CurrentUser() user: AuthenticatedUser, @Body() dto: TresorerieIfrsDto) {
    return this.ifrs.declarerTresorerie(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Put('effet-change')
  declarerEffetChange(@CurrentUser() user: AuthenticatedUser, @Body() dto: EffetChangeIfrsDto) {
    return this.ifrs.declarerEffetChange(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete('effet-change/:exerciceId')
  supprimerEffetChange(@CurrentUser() user: AuthenticatedUser, @Param('exerciceId') exerciceId: string, @Query('consolide') consolide?: string) {
    return this.ifrs.supprimerEffetChange(user.tenantId, exerciceId, consolide === 'true');
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('regles')
  ajouterRegle(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegleIfrsDto) {
    return this.ifrs.ajouterRegle(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete('regles/:id')
  supprimerRegle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ifrs.supprimerRegle(user.tenantId, id);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('retraitements')
  ajouterRetraitement(@CurrentUser() user: AuthenticatedUser, @Body() dto: RetraitementIfrsDto) {
    return this.ifrs.ajouterRetraitement(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete('retraitements/:id')
  supprimerRetraitement(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ifrs.supprimerRetraitement(user.tenantId, id);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('mouvements-capitaux-propres')
  ajouterMouvementCp(@CurrentUser() user: AuthenticatedUser, @Body() dto: MouvementCpIfrsDto) {
    return this.ifrs.ajouterMouvementCp(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete('mouvements-capitaux-propres/:id')
  supprimerMouvementCp(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ifrs.supprimerMouvementCp(user.tenantId, id);
  }
}

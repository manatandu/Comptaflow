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
import { ActiviteIfrsDto, MouvementCpIfrsDto, RegleIfrsDto, RetraitementIfrsDto } from './dto/ifrs.dto';

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

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Put('activite')
  declarerActivite(@CurrentUser() user: AuthenticatedUser, @Body() dto: ActiviteIfrsDto) {
    return this.ifrs.declarerActivite(user.tenantId, dto);
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

import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { LicenceGuard } from '../../licence/licence.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { EXERCICE_REQUIS } from '../../../common/exercice-requis';
import { ComptabiliteGestionService } from './comptabilite-gestion.service';
import {
  CreerCleRepartitionDto,
  DeclarerComportementsDto,
  DeclarerCoutProductionDto,
  RepartirDto,
  ReprendreClesDto,
} from './dto/comptabilite-gestion.dto';

/**
 * COMPTABILITÉ DE GESTION (ligne A20) · ouverte aux DEUX référentiels, sans
 * `@ReferentielsAutorises` · la comptabilité analytique de gestion n'est
 * réservée par aucun texte (AUDCIF Titre VI, « ni normalisée, ni
 * obligatoire » ; comptes 92 à 99 « à l'initiative des entités » aux deux
 * plans), et une association peut vouloir son seuil ou le coût d'un atelier.
 *
 * Lectures ouvertes à tous les rôles du dossier ; déclarations et
 * répartition suivent les droits d'écriture, comme la saisie des OD
 * analytiques qu'elles produisent.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('comptabilite-gestion')
export class ComptabiliteGestionController {
  constructor(private readonly gestion: ComptabiliteGestionService) {}

  @Get('comportements')
  comportements(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.gestion.comportements(user.tenantId, exerciceId);
  }

  @Put('comportements')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  declarerComportements(@CurrentUser() user: AuthenticatedUser, @Body() dto: DeclarerComportementsDto) {
    return this.gestion.declarerComportements(user.tenantId, dto);
  }

  @Get('seuil-rentabilite')
  seuil(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.gestion.seuilRentabilite(user.tenantId, exerciceId);
  }

  @Get('cles')
  cles(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.gestion.cles(user.tenantId, exerciceId);
  }

  @Post('cles')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  creerCle(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerCleRepartitionDto) {
    return this.gestion.creerCle(user.tenantId, user.userId, dto);
  }

  @Post('cles/reprendre')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  reprendre(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReprendreClesDto) {
    return this.gestion.reprendreCles(user.tenantId, user.userId, dto.exerciceId);
  }

  @Delete('cles/:cleId')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  supprimerCle(@CurrentUser() user: AuthenticatedUser, @Param('cleId') cleId: string) {
    return this.gestion.supprimerCle(user.tenantId, cleId);
  }

  @Get('cles/:cleId/proposition')
  proposition(@CurrentUser() user: AuthenticatedUser, @Param('cleId') cleId: string, @Query('date') date?: string) {
    return this.gestion.proposition(user.tenantId, cleId, date);
  }

  @Post('cles/:cleId/repartir')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  repartir(@CurrentUser() user: AuthenticatedUser, @Param('cleId') cleId: string, @Body() dto: RepartirDto) {
    return this.gestion.repartir(user.tenantId, user.userId, cleId, dto);
  }

  @Get('couts-production')
  couts(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.gestion.coutsProduction(user.tenantId, exerciceId);
  }

  @Post('couts-production')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  declarerCout(@CurrentUser() user: AuthenticatedUser, @Body() dto: DeclarerCoutProductionDto) {
    return this.gestion.declarerCoutProduction(user.tenantId, user.userId, dto);
  }

  @Delete('couts-production/:id')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  supprimerCout(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.gestion.supprimerCoutProduction(user.tenantId, id);
  }
}

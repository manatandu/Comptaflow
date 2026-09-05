import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ProvisionsService } from './provisions.service';
import {
  CreerProvisionDto,
  ModifierProvisionDto,
  ReporterProvisionsDto,
  StatuerProvisionDto,
} from './dto/provision.dto';

/**
 * AUCUN `@ReferentielsAutorises`, et pour une raison écrite dans le SYCEBNL
 * lui-même : sa fiche du COMPTE 19 renvoie la doctrine des provisions, des
 * passifs et des actifs éventuels au « titre VIII […] chapitre 18 […] du
 * SYSCOHADA ». Les deux référentiels partagent le texte. Ce qu'ils ne
 * partagent pas est la nomenclature, et c'est le SERVICE qui la résout, par
 * `naturesDuReferentiel()`, jamais la route.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('provisions')
export class ProvisionsController {
  constructor(private readonly provisions: ProvisionsService) {}

  @Get()
  lister(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.provisions.lister(user.tenantId, exerciceId);
  }

  @Get('variation/:exerciceId')
  variation(@CurrentUser() user: AuthenticatedUser, @Param('exerciceId') exerciceId: string) {
    return this.provisions.tableauDeVariation(user.tenantId, exerciceId);
  }

  @Post(':exerciceId')
  creer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('exerciceId') exerciceId: string,
    @Body() dto: CreerProvisionDto,
  ) {
    return this.provisions.creer(user.tenantId, exerciceId, dto, user.email);
  }

  @Patch(':id')
  modifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModifierProvisionDto,
  ) {
    return this.provisions.modifier(user.tenantId, id, dto);
  }

  @Patch(':id/statut')
  statuer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StatuerProvisionDto,
  ) {
    return this.provisions.statuer(user.tenantId, id, dto);
  }

  @Post('reporter/ouverture')
  reporter(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReporterProvisionsDto) {
    return this.provisions.reporterALOuverture(
      user.tenantId,
      dto.exerciceSourceId,
      dto.exerciceCibleId,
      user.email,
    );
  }

  @Delete(':id')
  supprimer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.provisions.supprimer(user.tenantId, id);
  }
}

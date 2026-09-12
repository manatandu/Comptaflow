import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { OrganeDesignationAuditeur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { MandatAuditeurService } from './mandat-auditeur.service';
import { CloreMandatDto, EnregistrerMandatDto, RefusProrogationDto } from './dto/mandat-auditeur.dto';

/**
 * Aucun `@ReferentielsAutorises` · les DEUX référentiels imposent un contrôleur
 * des comptes au-delà de leurs seuils, chacun par son texte (SYCEBNL art. 19 ·
 * AUSCGIE art. 376, 702, 853-13 et 289-1). Fermer la fenêtre à l'un des deux
 * priverait l'autre d'un registre qui lui est dû.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('mandat-auditeur')
export class MandatAuditeurController {
  constructor(private readonly mandats: MandatAuditeurService) {}

  @Get()
  lister(@CurrentUser() user: AuthenticatedUser) {
    return this.mandats.lister(user.tenantId);
  }

  /** L'obligation elle-même · seuils et article du dossier. */
  @Get('obligation')
  obligation(@CurrentUser() user: AuthenticatedUser) {
    return this.mandats.obligation(user.tenantId);
  }

  /** La durée que le texte propose, AVANT la saisie. */
  @Get('duree')
  duree(@CurrentUser() user: AuthenticatedUser, @Query('organe') organe: OrganeDesignationAuditeur) {
    return this.mandats.dureeProposee(user.tenantId, organe);
  }

  @Post()
  enregistrer(@CurrentUser() user: AuthenticatedUser, @Body() dto: EnregistrerMandatDto) {
    return this.mandats.enregistrer(user.tenantId, dto);
  }

  @Patch(':id/prorogation')
  refuserProrogation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RefusProrogationDto,
  ) {
    return this.mandats.refuserProrogation(user.tenantId, id, dto.refus);
  }

  @Patch(':id/fin')
  clore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CloreMandatDto) {
    return this.mandats.clore(user.tenantId, id, dto);
  }
}

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { Referentiel } from '@prisma/client';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AccordCadreService } from './accord-cadre.service';
import {
  DeclarerMainOeuvreDto,
  DenoncerAccordCadreDto,
  EnregistrerAccordCadreDto,
} from './dto/accord-cadre.dto';

/**
 * CLOISONNÉ AU SYCEBNL, et pour une fois c'est net · la loi n° 004/2001 régit
 * les ASBL et les ONG, et son art. 37 ne vise que l'ONG de droit étranger.
 * Aucune société commerciale ne conclut d'accord-cadre avec le Ministère du
 * Plan à ce titre. Masquer la fenêtre côté client ne suffirait pas (§ 6) :
 * la route se refuse aussi.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@ReferentielsAutorises(Referentiel.SYCEBNL)
@Controller('accord-cadre')
export class AccordCadreController {
  constructor(private readonly accords: AccordCadreService) {}

  @Get()
  etat(@CurrentUser() user: AuthenticatedUser, @Query('dateReference') dateReference?: string) {
    return this.accords.etat(user.tenantId, { dateReference });
  }

  @Post()
  enregistrer(@CurrentUser() user: AuthenticatedUser, @Body() dto: EnregistrerAccordCadreDto) {
    return this.accords.enregistrer(user.tenantId, dto);
  }

  @Patch(':id/main-oeuvre')
  declarerMainOeuvre(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DeclarerMainOeuvreDto,
  ) {
    return this.accords.declarerMainOeuvre(user.tenantId, id, dto);
  }

  @Patch(':id/denonciation')
  denoncer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DenoncerAccordCadreDto,
  ) {
    return this.accords.denoncer(user.tenantId, id, dto);
  }
}

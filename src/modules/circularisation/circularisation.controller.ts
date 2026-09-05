import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CircularisationService } from './circularisation.service';
import {
  ClorerCampagneDto,
  CreerCampagneCircularisationDto,
  CreerDemandeDto,
  DepouillerDto,
  EnvoyerDto,
  ProceduresAlternativesDto,
} from './dto/circularisation.dto';

/**
 * Aucun `@ReferentielsAutorises` · la confirmation de soldes n'est propre à
 * aucun des deux plans. Le CPCC la demande de la même façon à une ASBL et à
 * une société, et les racines de comptes visées (40, 41, 42, 43, 44, 47, 52,
 * 53) sont les mêmes des deux côtés.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('circularisation')
export class CircularisationController {
  constructor(private readonly circularisation: CircularisationService) {}

  @Get()
  lister(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId?: string) {
    return this.circularisation.lister(user.tenantId, exerciceId);
  }

  @Get(':id')
  consulter(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.circularisation.consulter(user.tenantId, id);
  }

  /** Les soldes du cycle, du plus gros au plus petit · une proposition, pas une sélection. */
  @Get(':id/echantillon')
  echantillon(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.circularisation.echantillonPropose(user.tenantId, id);
  }

  @Post()
  creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerCampagneCircularisationDto) {
    return this.circularisation.creer(user.tenantId, user.userId, dto);
  }

  @Post(':id/demandes')
  creerDemande(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreerDemandeDto) {
    return this.circularisation.creerDemande(user.tenantId, id, dto);
  }

  /** Premier appel : envoi. Second : relance · le CPCC la réclame nommément. */
  @Post(':id/envoyer')
  envoyer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: EnvoyerDto) {
    return this.circularisation.envoyer(user.tenantId, id, dto);
  }

  @Patch('demandes/:demandeId')
  depouiller(
    @CurrentUser() user: AuthenticatedUser,
    @Param('demandeId') demandeId: string,
    @Body() dto: DepouillerDto,
  ) {
    return this.circularisation.depouiller(user.tenantId, demandeId, dto);
  }

  @Patch('demandes/:demandeId/procedures-alternatives')
  proceduresAlternatives(
    @CurrentUser() user: AuthenticatedUser,
    @Param('demandeId') demandeId: string,
    @Body() dto: ProceduresAlternativesDto,
  ) {
    return this.circularisation.consignerProceduresAlternatives(user.tenantId, demandeId, dto);
  }

  @Post(':id/clore')
  clore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ClorerCampagneDto) {
    return this.circularisation.clore(user.tenantId, id, user.userId, dto);
  }
}

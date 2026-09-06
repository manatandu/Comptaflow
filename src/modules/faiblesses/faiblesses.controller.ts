import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { FaiblessesService } from './faiblesses.service';
import {
  AjouterFaiblesseDto,
  ClorerRegistreDto,
  CommuniquerDto,
  CreerRegistreFaiblessesDto,
  EscaladerDto,
  QualifierDto,
  ReponseDirectionDto,
  ReporterDto,
  SuivreDto,
} from './dto/faiblesses.dto';

/**
 * Aucun `@ReferentielsAutorises` · une faiblesse du contrôle interne n'est
 * propre à aucun plan comptable. Le CPCC réclame le suivi de la même façon à
 * une ASBL et à une société, et l'ISA 265 ne connaît pas les référentiels de
 * présentation.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('faiblesses')
export class FaiblessesController {
  constructor(private readonly faiblesses: FaiblessesService) {}

  @Get()
  lister(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId?: string) {
    return this.faiblesses.lister(user.tenantId, exerciceId);
  }

  /** Les indicateurs du § A7, tels que la norme les donne · « for example ». */
  @Get('indicateurs')
  indicateurs() {
    return {
      indicateursA7: FaiblessesService.INDICATEURS_A7,
      mentionsContexte: FaiblessesService.MENTIONS_CONTEXTE,
    };
  }

  @Get(':id')
  consulter(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.faiblesses.consulter(user.tenantId, id);
  }

  @Post()
  creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerRegistreFaiblessesDto) {
    return this.faiblesses.creer(user.tenantId, user.userId, dto);
  }

  @Post(':id/faiblesses')
  ajouter(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AjouterFaiblesseDto) {
    return this.faiblesses.ajouter(user.tenantId, id, user.userId, dto);
  }

  @Patch('faiblesses/:faiblesseId/qualification')
  qualifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('faiblesseId') faiblesseId: string,
    @Body() dto: QualifierDto,
  ) {
    return this.faiblesses.qualifier(user.tenantId, faiblesseId, user.userId, dto);
  }

  @Patch('faiblesses/:faiblesseId/communication')
  communiquer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('faiblesseId') faiblesseId: string,
    @Body() dto: CommuniquerDto,
  ) {
    return this.faiblesses.communiquer(user.tenantId, faiblesseId, dto);
  }

  @Patch('faiblesses/:faiblesseId/reponse-direction')
  reponseDirection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('faiblesseId') faiblesseId: string,
    @Body() dto: ReponseDirectionDto,
  ) {
    return this.faiblesses.reponseDirection(user.tenantId, faiblesseId, user.userId, dto);
  }

  @Patch('faiblesses/:faiblesseId/suivi')
  suivre(@CurrentUser() user: AuthenticatedUser, @Param('faiblesseId') faiblesseId: string, @Body() dto: SuivreDto) {
    return this.faiblesses.suivre(user.tenantId, faiblesseId, dto);
  }

  /** Le report vers le registre de l'exercice suivant · le double régime du § A17 et du § A24. */
  @Post('faiblesses/:faiblesseId/report')
  reporter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('faiblesseId') faiblesseId: string,
    @Body() dto: ReporterDto,
  ) {
    return this.faiblesses.reporter(user.tenantId, faiblesseId, dto);
  }

  @Post('faiblesses/:faiblesseId/escalade')
  escalader(
    @CurrentUser() user: AuthenticatedUser,
    @Param('faiblesseId') faiblesseId: string,
    @Body() dto: EscaladerDto,
  ) {
    return this.faiblesses.escalader(user.tenantId, faiblesseId, user.userId, dto);
  }

  @Post(':id/clore')
  clore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ClorerRegistreDto) {
    return this.faiblesses.clore(user.tenantId, id, user.userId, dto);
  }
}

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { QuestionnaireService } from './questionnaire.service';
import { ClorerQuestionnaireDto, CreerQuestionnaireDto, RepondreDto } from './dto/questionnaire.dto';

/**
 * Aucun `@ReferentielsAutorises` sur le contrôleur · le questionnaire vaut
 * pour les deux plans. Le filtre par référentiel est au niveau de l'ITEM, et
 * un seul en porte un aujourd'hui : les contributions volontaires en nature,
 * dont les comptes 900 à 914 n'existent qu'au SYCEBNL.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('questionnaire-revision')
export class QuestionnaireController {
  constructor(private readonly questionnaire: QuestionnaireService) {}

  @Get()
  lister(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId?: string) {
    return this.questionnaire.lister(user.tenantId, exerciceId);
  }

  /** Le catalogue entier · chaque item avec son origine, sa forme et sa source. */
  @Get('catalogue')
  catalogue() {
    return {
      items: QuestionnaireService.ITEMS,
      interrogatifsCpcc: QuestionnaireService.itemsInterrogatifsCpcc().length,
    };
  }

  @Get(':id')
  consulter(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.questionnaire.consulter(user.tenantId, id);
  }

  @Post()
  creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerQuestionnaireDto) {
    return this.questionnaire.creer(user.tenantId, user.userId, dto);
  }

  @Post(':id/reponses')
  repondre(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RepondreDto) {
    return this.questionnaire.repondre(user.tenantId, id, user.userId, dto);
  }

  @Post(':id/clore')
  clore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ClorerQuestionnaireDto) {
    return this.questionnaire.clore(user.tenantId, id, user.userId, dto);
  }
}

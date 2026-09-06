import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { JournalService } from './journal.service';
import { AnalyseJournauxService } from './analyse-journaux.service';
import { CreerJournalDto, ModifierJournalDto } from './dto/journal.dto';
import { RoleUtilisateur } from '@prisma/client';

@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('journaux')
export class JournalController {
  constructor(
    private readonly journalService: JournalService,
    private readonly analyseJournauxService: AnalyseJournauxService,
  ) {}

  // Consultation ouverte à tous les rôles authentifiés (nécessaire à la saisie).
  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser, @Query('actifsSeuls') actifsSeuls?: string) {
    return this.journalService.lister(user.tenantId, actifsSeuls === 'true');
  }

  /**
   * PALMARÈS DES COMPTES · état de relecture, ouvert à tout rôle authentifié
   * comme les autres états de consultation. Il ne rend AUCUNE collection sans
   * borne (§ 8 bis) : la limite est plafonnée par le service, et le nombre de
   * comptes du périmètre entier est rendu à côté pour que la troncature se
   * lise plutôt que de se deviner.
   *
   * Déclarée AVANT `@Post()` sans que l'ordre importe ici (les verbes
   * diffèrent), mais avant `:id` par discipline : une route paramétrée capterait
   * « palmares » comme un identifiant.
   */
  @Get('palmares-comptes')
  async palmaresComptes(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId: string,
    @Query('classe') classe?: string,
    @Query('limite') limite?: string,
    @Query('inclureBrouillard') inclureBrouillard?: string,
  ) {
    return this.analyseJournauxService.palmaresComptes(user.tenantId, {
      exerciceId,
      classe: classe || undefined,
      limite: limite ? Number(limite) : undefined,
      inclureBrouillard: inclureBrouillard === 'true',
    });
  }

  /** ANALYSE DES JOURNAUX · volumes, brouillard restant, trous de séquence. */
  @Get('analyse')
  async analyse(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.analyseJournauxService.analyseJournaux(user.tenantId, { exerciceId });
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerJournalDto) {
    return this.journalService.creer(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Patch(':id')
  async modifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModifierJournalDto,
  ) {
    return this.journalService.modifier(user.tenantId, id, dto);
  }
}

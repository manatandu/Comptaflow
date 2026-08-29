import { BadRequestException, Body, Controller, Delete, Get, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { NoteAnnexeService } from './note-annexe.service';
import { RattacherDto } from './dto/rattachement.dto';

const EXERCICE_REQUIS = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("Le paramètre exerciceId est requis et doit être un identifiant d'exercice valide"),
});

@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('notes-annexes')
export class NoteAnnexeController {
  constructor(private readonly noteAnnexeService: NoteAnnexeService) {}

  /** Notes annexes du jeu « associations et ordres professionnels » + fiche récapitulative. */
  @Get('associations')
  async associations(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.noteAnnexeService.notesAssociations(user.tenantId, exerciceId);
  }

  /**
   * Notes annexes du jeu « projets de développement et assimilés » + fiche
   * récapitulative. La note 9 « Fonds du bailleur » y renvoie vers
   * `GET /etats-financiers/projet/note-bailleur` · voir
   * `NoteAnnexeService.notesProjet`.
   */
  @Get('projet')
  async projet(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.noteAnnexeService.notesProjet(user.tenantId, exerciceId);
  }

  /**
   * Rattache un compte du dossier à une rubrique de note. Refusé sur une
   * rubrique que le plan de comptes officiel détermine déjà · voir
   * `NoteAnnexeService.rubriqueRattachable`.
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post('rattachements')
  async rattacher(@CurrentUser() user: AuthenticatedUser, @Body() dto: RattacherDto) {
    return this.noteAnnexeService.rattacher(
      user.tenantId,
      user.userId,
      dto.jeu,
      dto.codeNote,
      dto.cleRubrique,
      dto.compteId,
    );
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Delete('rattachements')
  async detacher(@CurrentUser() user: AuthenticatedUser, @Body() dto: RattacherDto) {
    return this.noteAnnexeService.detacher(user.tenantId, dto.jeu, dto.codeNote, dto.cleRubrique, dto.compteId);
  }
}

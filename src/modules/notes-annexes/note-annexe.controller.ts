import { BadRequestException, Controller, Get, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { NoteAnnexeService } from './note-annexe.service';

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
}

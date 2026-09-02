import { BadRequestException, Body, Controller, Delete, Get, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Referentiel, RoleUtilisateur } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { NoteAnnexeService } from './note-annexe.service';
import { RattacherDto } from './dto/rattachement.dto';

const EXERCICE_REQUIS = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("Le paramètre exerciceId est requis et doit être un identifiant d'exercice valide"),
});

// PAS de @ReferentielsAutorises au niveau de la CLASSE · il était ici tant
// que toutes les routes étaient SYCEBNL. Depuis que les 36 notes SYSCOHADA
// existent (AUDCIF Titre IX ch. 6), les deux routes de rattachement servent
// LES DEUX référentiels : les enfermer dans SYCEBNL fermerait le
// rattachement à tous les dossiers d'entreprise. Le décorateur est donc posé
// route par route sur les seuls catalogues SYCEBNL, et le cloisonnement du
// rattachement se fait dans le service, sur le couple (référentiel du
// dossier, jeu demandé) · `NoteAnnexeService.verifierJeuDuDossier`.
//
// Les notes SYSCOHADA ne sont PAS exposées ici : elles ont leur propre
// contrôleur, comme les états financiers SYSCOHADA ont le leur.
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@Controller('notes-annexes')
export class NoteAnnexeController {
  constructor(private readonly noteAnnexeService: NoteAnnexeService) {}

  /**
   * Notes annexes du jeu « associations et ordres professionnels » + fiche
   * récapitulative. SYCEBNL seulement · ce jeu est celui de l'Acte uniforme
   * SYCEBNL, un dossier SYSCOHADA n'en relève pas.
   */
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('associations')
  async associations(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.noteAnnexeService.notesAssociations(user.tenantId, exerciceId);
  }

  /**
   * Notes annexes du jeu « projets de développement et assimilés » + fiche
   * récapitulative. La note 9 « Fonds du bailleur » y renvoie vers
   * `GET /etats-financiers/projet/note-bailleur` · voir
   * `NoteAnnexeService.notesProjet`.
   *
   * SYCEBNL seulement, même raison que la route « associations ».
   */
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('projet')
  async projet(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.noteAnnexeService.notesProjet(user.tenantId, exerciceId);
  }

  /**
   * Rattache un compte du dossier à une rubrique de note. Refusé sur une
   * rubrique que le plan de comptes officiel détermine déjà · voir
   * `NoteAnnexeService.rubriqueRattachable`.
   *
   * OUVERTE AUX DEUX RÉFÉRENTIELS · le besoin de rattacher ses propres
   * sous-comptes se pose à l'identique en SYSCOHADA, dont l'AUDCIF ne donne
   * de correspondance poste/comptes que pour le bilan et le compte de
   * résultat (Titre IX ch. 7). Le cloisonnement se fait sur le JEU demandé,
   * dans le service · un dossier SYSCOHADA ne rattache qu'au jeu SYSCOHADA,
   * et inversement.
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

  /** Retire un rattachement. Ouverte aux deux référentiels, comme la route de rattachement. */
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Delete('rattachements')
  async detacher(@CurrentUser() user: AuthenticatedUser, @Body() dto: RattacherDto) {
    return this.noteAnnexeService.detacher(user.tenantId, dto.jeu, dto.codeNote, dto.cleRubrique, dto.compteId);
  }
}

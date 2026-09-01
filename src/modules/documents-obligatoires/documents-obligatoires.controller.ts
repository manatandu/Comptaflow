import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Referentiel, RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { LivreInventaireService } from './livre-inventaire.service';
import { RapportActiviteService } from './rapport-activite.service';
import {
  EtablirRapportActiviteDto,
  ResumeInventaireDto,
  TranscrireInventaireDto,
} from './dto/documents-obligatoires.dto';

/** Même garde qu'ailleurs : un `@Query` scalaire échappe au ValidationPipe global. */
const EXERCICE_REQUIS = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("Le paramètre exerciceId est requis et doit être un identifiant d'exercice valide"),
});

/**
 * Documents obligatoires de clôture · livre d'inventaire (art. 14) et rapport
 * d'activité (art. 16-3), tous deux pénalement sanctionnés (art. 24).
 *
 * Consultation ouverte aux trois rôles : l'auditeur qui constate leur
 * existence est typiquement en LECTURE_SEULE. Établissement réservé à
 * ADMIN_CABINET/COMPTABLE.
 *
 * SYCEBNL SEULEMENT · le livre d'inventaire transcrit ici les états SYCEBNL
 * (art. 14) et le rapport d'activité vient de son art. 16-3 · l'AUDCIF
 * connaît aussi un livre d'inventaire, mais son contenu SYSCOHADA sera monté
 * avec les états du niveau 2, pas rempli avec ceux d'une association.
 */
@ReferentielsAutorises(Referentiel.SYCEBNL)
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@Controller('documents-obligatoires')
export class DocumentsObligatoiresController {
  constructor(
    private readonly livreInventaire: LivreInventaireService,
    private readonly rapportActivite: RapportActiviteService,
  ) {}

  // --- Livre d'inventaire (art. 14) ---

  @Get('livre-inventaire')
  async transcriptions(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.livreInventaire.lister(user.tenantId, exerciceId);
  }

  @Get('livre-inventaire/conformite')
  async conformiteInventaire(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.livreInventaire.conformite(user.tenantId, exerciceId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('livre-inventaire')
  async transcrire(@CurrentUser() user: AuthenticatedUser, @Body() dto: TranscrireInventaireDto) {
    return this.livreInventaire.transcrire(user.tenantId, user.userId, dto);
  }

  /**
   * Seul champ modifiable d'une transcription : les états sont figés · les
   * retoucher viderait la transcription de son sens (voir le service). Il n'y
   * a pour la même raison aucune route de suppression.
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Patch('livre-inventaire/:id/resume')
  async renseignerResume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResumeInventaireDto,
  ) {
    return this.livreInventaire.renseignerResume(user.tenantId, id, dto);
  }

  // --- Rapport d'activité (art. 16-3) ---

  @Get('rapport-activite')
  async rapports(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.rapportActivite.lister(user.tenantId, exerciceId);
  }

  @Get('rapport-activite/conformite')
  async conformiteRapport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.rapportActivite.conformite(user.tenantId, exerciceId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('rapport-activite')
  async etablir(@CurrentUser() user: AuthenticatedUser, @Body() dto: EtablirRapportActiviteDto) {
    return this.rapportActivite.etablir(user.tenantId, user.userId, dto);
  }
}

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
import { ManuelProceduresService, SQUELETTE_MANUEL } from './manuel-procedures.service';
import { EnregistrerManuelDto } from './dto/manuel-procedures.dto';
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
 * LES DEUX RÉFÉRENTIELS, depuis le 2026-09-02 · et par des textes distincts,
 * jamais transposés l'un sur l'autre :
 *
 *  · livre d'inventaire · SYCEBNL art. 14 (contenu selon le jeu d'états),
 *    AUDCIF art. 19 (Bilan, Compte de résultat, Tableau des flux de
 *    trésorerie, plus le résumé de l'opération d'inventaire) ;
 *  · rapport · SYCEBNL art. 16-3 « rapport d'activité » à quatre sections,
 *    AUSCGIE art. 138 « rapport de gestion » à six, AUSCOOP art. 108 à six
 *    autres dont l'état de promotion des coopérateurs.
 *
 * La fenêtre était fermée au SYSCOHADA non parce que l'AUDCIF n'exige rien,
 * mais parce qu'elle était montée sur les seuls articles du SYCEBNL. Chaque
 * table est désormais lue dans SON texte · voir
 * correspondance-inventaire-syscohada.ts.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@Controller('documents-obligatoires')
export class DocumentsObligatoiresController {
  constructor(
    private readonly livreInventaire: LivreInventaireService,
    private readonly rapportActivite: RapportActiviteService,
    private readonly manuelProcedures: ManuelProceduresService,
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
    // Deux documents distincts sous deux actes distincts · l'aiguillage se
    // fait ici, sur le référentiel du dossier, et non par des champs
    // facultatifs dans une réponse commune.
    return user.referentiel === Referentiel.SYSCOHADA
      ? this.rapportActivite.conformiteRapportGestion(user.tenantId, exerciceId)
      : this.rapportActivite.conformite(user.tenantId, exerciceId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('rapport-activite')
  async etablir(@CurrentUser() user: AuthenticatedUser, @Body() dto: EtablirRapportActiviteDto) {
    return this.rapportActivite.etablir(user.tenantId, user.userId, dto);
  }

  // --- Manuel des procédures et de l'organisation comptables (AUDCIF art. 16
  //     al. 1 et art. 17, 3°) ---
  //
  // AUCUN exerciceId sur ces trois routes, et c'est la différence de fond avec
  // les deux documents ci-dessus : le manuel vit avec l'ENTITÉ, pas avec un
  // exercice. Il se met à jour quand l'organisation change, et la version en
  // vigueur au moment d'un exercice reste lisible aussi longtemps que cet
  // exercice est opposable.
  //
  // OUVERT AUX DEUX RÉFÉRENTIELS · l'art. 16 de l'AUDCIF n'est pas dans la
  // liste d'exclusion de l'art. 3 du SYCEBNL. C'est le SERVICE qui cite à
  // chaque dossier le chemin par lequel l'obligation lui parvient.

  @Get('manuel-procedures')
  async manuels(@CurrentUser() user: AuthenticatedUser) {
    return this.manuelProcedures.lister(user.tenantId);
  }

  @Get('manuel-procedures/conformite')
  async conformiteManuel(@CurrentUser() user: AuthenticatedUser) {
    return this.manuelProcedures.conformite(user.tenantId);
  }

  /**
   * Le squelette proposé à un dossier qui n'a pas encore de manuel · les sept
   * rubriques que le CPCC énumère comme « informations POUVANT y figurer »
   * (§ 0.1.4). Une page blanche est la raison ordinaire pour laquelle ce
   * document n'existe pas dans les dossiers.
   */
  @Get('manuel-procedures/squelette')
  async squeletteManuel() {
    return SQUELETTE_MANUEL;
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('manuel-procedures')
  async enregistrerManuel(@CurrentUser() user: AuthenticatedUser, @Body() dto: EnregistrerManuelDto) {
    return this.manuelProcedures.enregistrer(user.tenantId, user.userId, dto);
  }
}

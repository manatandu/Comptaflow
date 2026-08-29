import { BadRequestException, Controller, Get, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EtatsFinanciersService } from './etats-financiers.service';
import { EtatsFinanciersProjetService } from './etats-financiers-projet.service';

/**
 * Même raison qu'au contrôleur d'export : un `@Query` scalaire échappe au
 * ValidationPipe global, et un `exerciceId` absent devient `undefined`, que
 * Prisma ignore · l'état porterait alors sur TOUS les exercices du dossier
 * sans le dire.
 */
const EXERCICE_REQUIS = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("Le paramètre exerciceId est requis et doit être un identifiant d'exercice valide"),
});

// RolesGuard présent pour que tout `@Roles` ajouté plus tard soit réellement
// appliqué (sans lui, il serait silencieusement ignoré).
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('etats-financiers')
export class EtatsFinanciersController {
  constructor(
    private readonly etatsFinanciersService: EtatsFinanciersService,
    private readonly etatsFinanciersProjetService: EtatsFinanciersProjetService,
  ) {}

  /** Jeu « associations et ordres professionnels » (Partie 4, ch. 2). */
  @Get('bilan')
  async bilan(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.etatsFinanciersService.bilan(user.tenantId, exerciceId);
  }

  /** Compte de résultat · postes officiels SYCEBNL (Partie 4, ch. 2). */
  @Get('compte-de-resultat')
  async compteDeResultat(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.etatsFinanciersService.compteDeResultat(user.tenantId, exerciceId);
  }

  /**
   * Tableau de flux de trésorerie · état propre au jeu « associations et
   * ordres professionnels » (Partie 4, ch. 1 § 4 : « Le tableau des flux de
   * trésorerie est un état financier spécifique aux associations et ordres
   * professionnels »). Méthode directe, formule officielle, double contrôle
   * de bouclage · voir `correspondance-tft.ts`.
   */
  @Get('tableau-flux-tresorerie')
  async tableauFluxTresorerie(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.etatsFinanciersService.tableauFluxTresorerie(user.tenantId, exerciceId);
  }

  /**
   * Jeu « projets de développement et assimilés » (Partie 4, ch. 3) · bilan
   * et compte d'exploitation seulement ; voir
   * `EtatsFinanciersProjetService` pour ce qui reste hors périmètre
   * (tableau d'exécution budgétaire, TER, TRC).
   */
  @Get('projet/bilan')
  async bilanProjet(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.etatsFinanciersProjetService.bilan(user.tenantId, exerciceId);
  }

  @Get('projet/compte-exploitation')
  async compteExploitationProjet(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.etatsFinanciersProjetService.compteExploitation(user.tenantId, exerciceId);
  }

  /**
   * NOTE 9 : FONDS DU BAILLEUR (Partie 4, ch. 3, Section 6) · comptabilité
   * analytique par projet/bailleur, docs/plan-de-construction.md item 14.
   */
  @Get('projet/note-bailleur')
  async noteBailleur(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.etatsFinanciersProjetService.noteBailleur(user.tenantId, exerciceId);
  }
}

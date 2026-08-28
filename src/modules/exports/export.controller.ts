import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ClasseurExporte, ExportService } from './export.service';

/**
 * `exerciceId` doit être validé, pas seulement typé : un `@Query` scalaire
 * n'est pas couvert par le ValidationPipe global, et `undefined` traverse
 * jusqu'à Prisma qui IGNORE purement et simplement un champ `undefined`.
 * Le filtre d'exercice disparaîtrait alors sans bruit et l'export
 * agrégerait TOUS les exercices du dossier en se présentant comme l'état
 * d'un seul — un état faux et non signalé, ce qui est plus grave qu'une
 * erreur pour un module destiné à produire des pièces d'audit.
 */
const EXERCICE_REQUIS = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("Le paramètre exerciceId est requis et doit être un identifiant d'exercice valide"),
});

const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Le nom de fichier est décidé par le service (il connaît l'exercice et le
 * compte concernés, et y ajoute l'année pour que deux exports d'exercices
 * différents ne s'écrasent pas côté navigateur). Le contrôleur se contente
 * de le servir.
 */
function envoyerXlsx(res: Response, classeur: ClasseurExporte) {
  res.set({
    'Content-Type': TYPE_XLSX,
    'Content-Disposition': `attachment; filename="${classeur.nomFichier}"`,
    // Sans ça, `fetch` côté client ne voit pas l'en-tête (CORS masque tout
    // sauf une liste blanche) et ne peut pas reprendre le nom proposé.
    'Access-Control-Expose-Headers': 'Content-Disposition',
  });
  res.send(classeur.buffer);
}

// RolesGuard est inclus bien qu'aucune route ne porte encore `@Roles` (les
// exports sont en lecture seule, ouverts aux trois rôles comme les écrans
// qu'ils reprennent). Sans lui, un futur `@Roles` posé ici serait
// SILENCIEUSEMENT ignoré — pas d'erreur, pas de 403, la route resterait
// ouverte à tous. Aligné sur les autres contrôleurs du projet.
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('exports')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('journal')
  async journal(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId') exerciceId?: string,
    @Query('journalId') journalId?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('recherche') recherche?: string,
  ) {
    envoyerXlsx(
      res,
      await this.exportService.journalExcel(user.tenantId, { exerciceId, journalId, dateDebut, dateFin, recherche }),
    );
  }

  /** Grand livre complet — tous les comptes mouvementés, un seul classeur. */
  @Get('grand-livre')
  async grandLivreComplet(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId') exerciceId?: string,
  ) {
    envoyerXlsx(res, await this.exportService.grandLivreCompletExcel(user.tenantId, exerciceId));
  }

  @Get('grand-livre/:compteId')
  async grandLivre(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compteId') compteId: string,
    @Res() res: Response,
    @Query('exerciceId') exerciceId?: string,
  ) {
    envoyerXlsx(res, await this.exportService.grandLivreExcel(user.tenantId, compteId, exerciceId));
  }

  @Get('balance')
  async balance(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.balanceExcel(user.tenantId, exerciceId));
  }

  @Get('etats-financiers/bilan')
  async bilan(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.bilanExcel(user.tenantId, exerciceId));
  }

  @Get('etats-financiers/compte-de-resultat')
  async compteDeResultat(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.compteDeResultatExcel(user.tenantId, exerciceId));
  }

  /** Jeu « projets de développement et assimilés » (Partie 4, ch. 3). */
  @Get('etats-financiers/projet/bilan')
  async bilanProjet(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.bilanProjetExcel(user.tenantId, exerciceId));
  }

  @Get('etats-financiers/projet/compte-exploitation')
  async compteExploitationProjet(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.compteExploitationProjetExcel(user.tenantId, exerciceId));
  }

  /** Comptabilité analytique par projet/bailleur (docs/plan-de-construction.md item 14). */
  @Get('etats-financiers/projet/note-bailleur')
  async noteBailleur(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.noteBailleurExcel(user.tenantId, exerciceId));
  }
}

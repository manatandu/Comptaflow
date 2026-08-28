import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ClasseurExporte, ExportService } from './export.service';

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

@UseGuards(JwtAuthGuard, LicenceGuard)
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
  async balance(@CurrentUser() user: AuthenticatedUser, @Res() res: Response, @Query('exerciceId') exerciceId: string) {
    envoyerXlsx(res, await this.exportService.balanceExcel(user.tenantId, exerciceId));
  }

  @Get('etats-financiers/bilan')
  async bilan(@CurrentUser() user: AuthenticatedUser, @Res() res: Response, @Query('exerciceId') exerciceId: string) {
    envoyerXlsx(res, await this.exportService.bilanExcel(user.tenantId, exerciceId));
  }

  @Get('etats-financiers/compte-de-resultat')
  async compteDeResultat(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId') exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.compteDeResultatExcel(user.tenantId, exerciceId));
  }
}

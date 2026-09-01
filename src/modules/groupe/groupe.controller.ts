import { BadRequestException, Controller, Get, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { GroupeService } from './groupe.service';

const EXERCICE_REQUIS = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("Le paramètre exerciceId est requis et doit être un identifiant d'exercice valide"),
});

const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Fenêtre « Groupe · balance agrégée » du dossier mère. Lecture seule,
 * ouverte aux trois rôles comme les autres éditions · la portée transversale
 * est bornée par le lien dossierMereId (voir GroupeService) : chaque route
 * part du tenant de l'appelant, une cellule qui appelle obtient simplement
 * une liste vide ou un refus.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('groupe')
export class GroupeController {
  constructor(private readonly groupeService: GroupeService) {}

  @Get('cellules')
  cellules(@CurrentUser() user: AuthenticatedUser) {
    return this.groupeService.cellules(user.tenantId);
  }

  @Get('balance-agregee')
  balanceAgregee(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.groupeService.balanceAgregee(user.tenantId, exerciceId);
  }

  @Get('balance-agregee/excel')
  async balanceAgregeeExcel(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    const classeur = await this.groupeService.balanceAgregeeExcel(user.tenantId, exerciceId);
    res.set({
      'Content-Type': TYPE_XLSX,
      'Content-Disposition': `attachment; filename="${classeur.nomFichier}"`,
      'Access-Control-Expose-Headers': 'Content-Disposition',
    });
    res.send(classeur.buffer);
  }
}

import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { Referentiel, RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { GroupeService } from './groupe.service';
import { CreerCelluleDto, ImporterCanevasDto } from './dto/groupe.dto';

const EXERCICE_REQUIS = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("Le paramètre exerciceId est requis et doit être un identifiant d'exercice valide"),
});

const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function envoyerXlsx(res: Response, classeur: { buffer: Buffer; nomFichier: string }) {
  res.set({
    'Content-Type': TYPE_XLSX,
    'Content-Disposition': `attachment; filename="${classeur.nomFichier}"`,
    'Access-Control-Expose-Headers': 'Content-Disposition',
  });
  res.send(classeur.buffer);
}

/**
 * Fenêtre « Groupe » du dossier mère. Les consultations (supervision,
 * agrégat, balance d'une cellule, canevas) sont ouvertes aux trois rôles
 * comme les autres éditions · les gestes qui ÉCRIVENT sont réservés :
 * créer une cellule à l'ADMIN_CABINET du siège, déposer un canevas à
 * l'ADMIN_CABINET et au COMPTABLE. La portée transversale est bornée par le
 * lien dossierMereId (voir GroupeService) : chaque route part du tenant de
 * l'appelant.
 */
/*
  MODULE PROPRE AU SYCEBNL, et il ne le disait nulle part côté serveur.

  Le groupe d'établissements est monté de bout en bout sur le plan et les
  états SYCEBNL : le canevas de trésorerie, la balance agrégée, et surtout
  `liasseGroupe`, qui crée un tenant de combinaison SYCEBNL en jeu
  ASSOCIATIONS. CLAUDE.md § 6 le range parmi les modules propres au SYCEBNL.

  Les deux portes de rattachement (GroupeService.creerCellule et
  PlateformeService.modifierGroupe) refusent déjà une mère ou une cellule non
  SYCEBNL : aucun état du mauvais référentiel n'est donc réellement produit
  aujourd'hui. Ce qui manquait est la DÉFENSE EN PROFONDEUR du § 6 · sans
  décorateur, /groupe s'ouvre par URL directe et ses routes répondent une
  erreur métier au lieu d'un refus de référentiel franc.
*/
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@ReferentielsAutorises(Referentiel.SYCEBNL)
@Controller('groupe')
export class GroupeController {
  constructor(private readonly groupeService: GroupeService) {}

  @Get('cellules')
  cellules(@CurrentUser() user: AuthenticatedUser) {
    return this.groupeService.cellules(user.tenantId);
  }

  @Post('cellules')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  creerCellule(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerCelluleDto) {
    return this.groupeService.creerCellule(user.tenantId, dto);
  }

  @Get('supervision')
  supervision(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.groupeService.supervision(user.tenantId, exerciceId);
  }

  @Get('cellules/:celluleId/balance')
  balanceCellule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('celluleId', ParseUUIDPipe) celluleId: string,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.groupeService.balanceCellule(user.tenantId, celluleId, exerciceId);
  }

  @Get('cellules/:celluleId/canevas')
  async canevas(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Param('celluleId', ParseUUIDPipe) celluleId: string,
  ) {
    envoyerXlsx(res, await this.groupeService.canevas(user.tenantId, celluleId));
  }

  @Post('cellules/:celluleId/import-canevas')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  importerCanevas(
    @CurrentUser() user: AuthenticatedUser,
    @Param('celluleId', ParseUUIDPipe) celluleId: string,
    @Body() dto: ImporterCanevasDto,
  ) {
    return this.groupeService.importerCanevas(user.tenantId, celluleId, user.userId, dto);
  }

  @Get('balance-agregee')
  balanceAgregee(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.groupeService.balanceAgregee(user.tenantId, exerciceId);
  }

  /**
   * La liasse du groupe en un clic. Un GET qui écrit (dans le dossier de
   * combinaison technique, régénéré à chaque appel) · réservé aux rôles qui
   * écrivent, comme le dépôt de canevas.
   */
  @Get('liasse/excel')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async liasseGroupe(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.groupeService.liasseGroupe(user.tenantId, exerciceId, user.userId));
  }

  @Get('balance-agregee/excel')
  async balanceAgregeeExcel(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.groupeService.balanceAgregeeExcel(user.tenantId, exerciceId));
  }
}

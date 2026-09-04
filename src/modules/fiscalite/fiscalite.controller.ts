import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Referentiel, RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { FiscaliteService } from './fiscalite.service';
import { CreerRetraitementDto, ModifierDossierFiscalDto, ModifierRetraitementDto } from './dto/fiscalite.dto';

// LA DÉTERMINATION DU RÉSULTAT FISCAL lit une balance SYSCOHADA · la fenêtre
// n'existe que pour un dossier SYSCOHADA, et la route le refuse aussi,
// masquer sans refuser laissant passer un appel direct.
//
// Le motif du refus n'est PAS que l'exemption de l'art. 5 de la loi
// n° 23/053 serait acquise à tout dossier SYCEBNL : elle ne l'est qu'au titre
// du point 3, et le point 5 (établissements d'utilité publique et ONG) la
// subordonne à l'arrêté n° 007/2025. Voir exemption-is-ebnl.ts, et la route
// `exemption-is` ci-dessous, seule ouverte au SYCEBNL.
@ReferentielsAutorises(Referentiel.SYSCOHADA)
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@Controller('fiscalite')
export class FiscaliteController {
  constructor(private readonly fiscalite: FiscaliteService) {}

  /**
   * LE STATUT D'EXEMPTION D'IS D'UNE ENTITÉ NON LUCRATIVE · à rebours du reste
   * du contrôleur, cette route est ouverte au SEUL SYCEBNL.
   *
   * Le décorateur de méthode l'emporte sur celui de la classe
   * (`Reflector.getAllAndOverride`, handler d'abord, voir
   * common/guards/referentiel.guard.ts). C'est voulu : refuser une fenêtre à
   * un dossier sans jamais lui dire à quelles conditions son exemption tient,
   * c'est la lui laisser croire acquise.
   */
  @Get('exemption-is')
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  async exemptionIs(@CurrentUser() user: AuthenticatedUser) {
    return this.fiscalite.exemptionIs(user.tenantId);
  }

  /** Le catalogue des retraitements, article par article. */
  @Get('catalogue')
  catalogue() {
    return this.fiscalite.catalogue();
  }

  /**
   * Ce que les comptes qualifiés par le cabinet appellent comme retraitement
   * sur cet exercice · des PROPOSITIONS, que le comptable reprend ou ignore.
   * Rien n'est créé ici : les routes d'écriture restent celles ci-dessous.
   */
  @Get('exercices/:exerciceId/propositions-retraitements')
  async propositions(@CurrentUser() user: AuthenticatedUser, @Param('exerciceId') exerciceId: string) {
    return this.fiscalite.propositionsRetraitements(user.tenantId, exerciceId);
  }

  @Get('resultat-fiscal')
  async resultatFiscal(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.fiscalite.resultatFiscal(user.tenantId, exerciceId);
  }

  @Post('exercices/:exerciceId/retraitements')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async ajouterRetraitement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('exerciceId') exerciceId: string,
    @Body() dto: CreerRetraitementDto,
  ) {
    return this.fiscalite.ajouterRetraitement(user.tenantId, exerciceId, dto);
  }

  @Patch('retraitements/:id')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async modifierRetraitement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModifierRetraitementDto,
  ) {
    return this.fiscalite.modifierRetraitement(user.tenantId, id, dto);
  }

  @Delete('retraitements/:id')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async supprimerRetraitement(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.fiscalite.supprimerRetraitement(user.tenantId, id);
  }

  @Patch('exercices/:exerciceId/dossier')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async modifierDossier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('exerciceId') exerciceId: string,
    @Body() dto: ModifierDossierFiscalDto,
  ) {
    return this.fiscalite.modifierDossier(user.tenantId, exerciceId, dto);
  }
}

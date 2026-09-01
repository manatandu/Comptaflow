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

// Une entité à but non lucratif est exemptée d'impôt sur les sociétés (loi
// n° 23/053, art. 5) · la fenêtre n'existe que pour un dossier SYSCOHADA, et
// la route le refuse aussi, masquer sans refuser laissant passer un appel
// direct.
@ReferentielsAutorises(Referentiel.SYSCOHADA)
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@Controller('fiscalite')
export class FiscaliteController {
  constructor(private readonly fiscalite: FiscaliteService) {}

  /** Le catalogue des retraitements, article par article. */
  @Get('catalogue')
  catalogue() {
    return this.fiscalite.catalogue();
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

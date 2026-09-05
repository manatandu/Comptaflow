import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { InventaireService } from './inventaire.service';
import {
  AjouterMembreDto,
  AjouterSousCommissionDto,
  ArbitrerEcartDto,
  CreerCampagneDto,
  CreerFicheDto,
  EtablirProcesVerbalDto,
  ModifierCampagneDto,
  SaisirComptageDto,
} from './dto/inventaire.dto';

/**
 * AUCUN `@ReferentielsAutorises` ICI, et c'est délibéré.
 *
 * L'obligation de recensement et d'évaluation est l'AUDCIF art. 42, que
 * l'art. 3 du SYCEBNL n'écarte pas · sa liste d'exclusion saute de 34 à 49.
 * Une association, une ONG et une SARL la portent identiquement. Fermer la
 * route à l'un des deux référentiels priverait une EBNL d'un document dont
 * l'absence l'expose pénalement (SYCEBNL art. 24, premier tiret).
 *
 * Seul le TEXTE CITÉ change selon le dossier, et c'est le service qui le
 * résout · voir `sanctionApplicable`.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('inventaire')
export class InventaireController {
  constructor(private readonly inventaire: InventaireService) {}

  @Get()
  lister(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId?: string) {
    return this.inventaire.lister(user.tenantId, exerciceId);
  }

  @Get('resume/:exerciceId')
  resume(@CurrentUser() user: AuthenticatedUser, @Param('exerciceId') exerciceId: string) {
    return this.inventaire.resumePourLivreInventaire(user.tenantId, exerciceId);
  }

  @Get(':id')
  consulter(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventaire.consulter(user.tenantId, id);
  }

  @Post()
  creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerCampagneDto) {
    return this.inventaire.creer(user.tenantId, user.userId, dto);
  }

  @Patch(':id')
  modifier(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ModifierCampagneDto) {
    return this.inventaire.modifier(user.tenantId, id, dto);
  }

  @Post(':id/sous-commissions')
  ajouterSousCommission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AjouterSousCommissionDto,
  ) {
    return this.inventaire.ajouterSousCommission(user.tenantId, id, dto);
  }

  @Post('sous-commissions/:sousCommissionId/membres')
  ajouterMembre(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sousCommissionId') sousCommissionId: string,
    @Body() dto: AjouterMembreDto,
  ) {
    return this.inventaire.ajouterMembre(user.tenantId, sousCommissionId, dto);
  }

  @Post(':id/fiches')
  creerFiche(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreerFicheDto) {
    return this.inventaire.creerFiche(user.tenantId, id, dto);
  }

  /** Le parc immobilisé est déjà tenu par le logiciel · on ne le ressaisit pas. */
  @Post(':id/fiches/immobilisations')
  engendrerFiches(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventaire.engendrerFichesImmobilisations(user.tenantId, id);
  }

  @Patch('fiches/:ficheId')
  saisirComptage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ficheId') ficheId: string,
    @Body() dto: SaisirComptageDto,
  ) {
    return this.inventaire.saisirComptage(user.tenantId, ficheId, dto);
  }

  @Post(':id/rapprocher')
  rapprocher(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventaire.rapprocher(user.tenantId, id);
  }

  @Patch('ecarts/:ecartId')
  arbitrer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ecartId') ecartId: string,
    @Body() dto: ArbitrerEcartDto,
  ) {
    return this.inventaire.arbitrer(user.tenantId, ecartId, user.userId, dto);
  }

  @Get('ecarts/:ecartId/proposition')
  proposition(@CurrentUser() user: AuthenticatedUser, @Param('ecartId') ecartId: string) {
    return this.inventaire.propositionRedressement(user.tenantId, ecartId);
  }

  @Post(':id/proces-verbal')
  etablirPv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: EtablirProcesVerbalDto,
  ) {
    return this.inventaire.etablirProcesVerbal(user.tenantId, id, user.userId, dto);
  }

  @Post(':id/clore')
  clore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventaire.clore(user.tenantId, id, user.userId);
  }
}

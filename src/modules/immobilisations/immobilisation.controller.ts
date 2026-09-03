import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ImmobilisationService } from './immobilisation.service';
import {
  CreerFamilleDto,
  CreerImmobilisationDto,
  ModifierFamilleDto,
  PasserDotationDto,
  SortirImmobilisationDto,
  DepreciationDto,
} from './dto/immobilisation.dto';
import { RoleUtilisateur, StatutImmobilisation } from '@prisma/client';

// Consultation ouverte aux trois rôles ; gestion (familles, création,
// dotation, sortie) réservée à ADMIN_CABINET/COMPTABLE · même règle que la
// saisie d'écritures, dont ce module n'est jamais qu'une façade guidée.
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('immobilisations')
export class ImmobilisationController {
  constructor(private readonly immobilisationService: ImmobilisationService) {}

  /**
   * TABLEAU DES IMMOBILISATIONS · une ligne par bien, groupée par compte
   * d'imputation avec sous-totaux. C'est le groupement qui permet de recouper
   * l'état avec la balance, compte par compte.
   */
  @Get('tableau')
  async tableau(@CurrentUser() user: AuthenticatedUser, @Query('dateArret') dateArret?: string) {
    return this.immobilisationService.tableauImmobilisations(user.tenantId, { dateArret });
  }

  /**
   * TABLEAU DES AMORTISSEMENTS · douze colonnes mensuelles. Un total annuel
   * cache le mois d'entrée du bien, celui de sa sortie, et celui où il achève
   * de s'amortir.
   */
  @Get('tableau-amortissements')
  async tableauAmortissements(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId: string,
  ) {
    return this.immobilisationService.tableauAmortissements(user.tenantId, exerciceId);
  }

  @Get('familles')
  async listerFamilles(@CurrentUser() user: AuthenticatedUser) {
    return this.immobilisationService.listerFamilles(user.tenantId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post('familles')
  async creerFamille(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerFamilleDto) {
    return this.immobilisationService.creerFamille(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Patch('familles/:id')
  async modifierFamille(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ModifierFamilleDto) {
    return this.immobilisationService.modifierFamille(user.tenantId, id, dto);
  }

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser, @Query('statut') statut?: StatutImmobilisation) {
    return this.immobilisationService.lister(user.tenantId, statut);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerImmobilisationDto) {
    return this.immobilisationService.creer(user.tenantId, user.userId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/dotation')
  async passerDotation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PasserDotationDto,
  ) {
    return this.immobilisationService.passerDotation(user.tenantId, user.userId, id, dto);
  }

  /**
   * DÉPRÉCIATION · dotation ou reprise, AUDCIF art. 46 et Titre VIII ch. 12 ;
   * SYCEBNL, Partie 2 ch. 3, fiche du COMPTE 29. Commune aux deux
   * référentiels : chacun l'impose dans son texte, aucun n'est transposé.
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/depreciation')
  async deprecier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DepreciationDto,
  ) {
    return this.immobilisationService.enregistrerDepreciation(user.tenantId, user.userId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/sortie')
  async sortir(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SortirImmobilisationDto,
  ) {
    return this.immobilisationService.sortir(user.tenantId, user.userId, id, dto);
  }
}

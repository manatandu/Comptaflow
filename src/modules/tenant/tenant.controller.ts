import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TenantService } from './tenant.service';
import {
  ModifierCoordonneesDto,
  ModifierFormeJuridiqueDto,
  ModifierFormeSyscohadaDto,
  ModifierIdentiteDto,
  ModifierJeuEtatsDto,
  ModifierMethodeCotisationsDto,
  ModifierRegimeDto,
  ModifierSystemeSyscohadaDto,
} from './dto/parametres-dossier.dto';
import { RoleUtilisateur } from '@prisma/client';

/**
 * Structure > Paramètres du dossier. Consultation ouverte aux trois rôles
 * (le jeu d'états conditionne ce que voit le comptable), modification
 * réservée à l'admin comme pour les autres éléments de structure.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('dossier')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('parametres')
  async parametres(@CurrentUser() user: AuthenticatedUser) {
    return this.tenantService.parametres(user.tenantId);
  }

  @Patch('jeu-etats-financiers')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async modifierJeuEtats(@CurrentUser() user: AuthenticatedUser, @Body() dto: ModifierJeuEtatsDto) {
    return this.tenantService.modifierJeuEtatsFinanciers(user.tenantId, dto.jeuEtatsFinanciersSycebnl);
  }

  /** Pendant SYSCOHADA du jeu d'états · voir le service. */
  @Patch('systeme-syscohada')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async modifierSystemeSyscohada(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ModifierSystemeSyscohadaDto,
  ) {
    return this.tenantService.modifierSystemeSyscohada(user.tenantId, dto.systemeComptableSyscohada);
  }

  /**
   * Raison sociale et coordonnées · l'adresse composée ici s'imprime en tête
   * de chaque état financier, elle doit pouvoir être corrigée.
   */
  @Patch('coordonnees')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async modifierCoordonnees(@CurrentUser() user: AuthenticatedUser, @Body() dto: ModifierCoordonneesDto) {
    return this.tenantService.modifierCoordonnees(user.tenantId, dto);
  }

  @Patch('identite')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async modifierIdentite(@CurrentUser() user: AuthenticatedUser, @Body() dto: ModifierIdentiteDto) {
    return this.tenantService.modifierIdentite(user.tenantId, dto);
  }

  @Patch('forme-juridique')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async modifierFormeJuridique(@CurrentUser() user: AuthenticatedUser, @Body() dto: ModifierFormeJuridiqueDto) {
    return this.tenantService.modifierFormeJuridique(user.tenantId, dto.formeJuridique, dto.droitEtranger);
  }

  /**
   * Forme juridique OHADA · voir TenantService.modifierFormeSyscohada. Route
   * distincte de `forme-juridique` plutôt qu'un champ de plus sur celle-ci :
   * les deux listes n'ont aucune valeur commune, et un DTO qui accepterait les
   * deux enums laisserait passer le croisement que le service refuse.
   */
  @Patch('forme-syscohada')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async modifierFormeSyscohada(@CurrentUser() user: AuthenticatedUser, @Body() dto: ModifierFormeSyscohadaDto) {
    return this.tenantService.modifierFormeSyscohada(user.tenantId, dto.formeJuridiqueSyscohada);
  }

  /**
   * Régime de TVA et effectif permanent · voir TenantService.modifierRegime.
   * Réservé à l'administrateur du dossier comme les autres paramètres : ces
   * deux données commandent des règles fiscales et légales, pas un affichage.
   */
  @Patch('regime')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async modifierRegime(@CurrentUser() user: AuthenticatedUser, @Body() dto: ModifierRegimeDto) {
    return this.tenantService.modifierRegime(user.tenantId, dto);
  }

  /**
   * Fait générateur des cotisations et du droit d'entrée · voir
   * `TenantService.modifierMethodeCotisations`. Réservé à l'administrateur du
   * dossier : ce choix commande les écritures de cotisation de tous les
   * exercices et une mention obligatoire en notes annexes (§ 5.4.2.1), ce
   * n'est pas un réglage d'affichage.
   */
  @Patch('methode-cotisations')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async modifierMethodeCotisations(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ModifierMethodeCotisationsDto,
  ) {
    return this.tenantService.modifierMethodeCotisations(user.tenantId, dto.methodeCotisations);
  }
}

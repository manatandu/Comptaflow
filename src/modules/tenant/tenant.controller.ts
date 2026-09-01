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
  ModifierIdentiteDto,
  ModifierJeuEtatsDto,
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
   * Régime de TVA et effectif permanent · voir TenantService.modifierRegime.
   * Réservé à l'administrateur du dossier comme les autres paramètres : ces
   * deux données commandent des règles fiscales et légales, pas un affichage.
   */
  @Patch('regime')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async modifierRegime(@CurrentUser() user: AuthenticatedUser, @Body() dto: ModifierRegimeDto) {
    return this.tenantService.modifierRegime(user.tenantId, dto);
  }
}

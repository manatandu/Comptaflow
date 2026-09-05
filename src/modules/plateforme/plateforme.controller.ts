import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OperateurPlateformeGuard } from './operateur-plateforme.guard';
import { PlateformeService } from './plateforme.service';
import {
  CreerCabinetDto,
  ModifierGroupeDto,
  ModifierLicenceDto,
  PreparerDemonstrationDto,
  ReinitialiserAdminDto,
} from './dto/plateforme.dto';

/**
 * Console de l'opérateur de plateforme (fenêtre « Cabinets clients »).
 *
 * Volontairement SANS LicenceGuard : la licence du propre dossier de
 * l'opérateur ne doit jamais le verrouiller hors de la console qui sert à
 * gérer les licences. Sans RolesGuard non plus : le droit d'entrée est le
 * drapeau estOperateurPlateforme (relu en base à chaque requête), pas un
 * rôle de tenant.
 */
@Controller('plateforme')
@UseGuards(JwtAuthGuard, OperateurPlateformeGuard)
export class PlateformeController {
  constructor(private readonly plateformeService: PlateformeService) {}

  @Get('cabinets')
  listeCabinets() {
    return this.plateformeService.listeCabinets();
  }

  @Post('cabinets')
  creerCabinet(@Body() dto: CreerCabinetDto) {
    return this.plateformeService.creerCabinet(dto);
  }

  @Patch('cabinets/:tenantId/licence')
  modifierLicence(@Param('tenantId') tenantId: string, @Body() dto: ModifierLicenceDto) {
    return this.plateformeService.modifierLicence(tenantId, dto);
  }

  @Patch('cabinets/:tenantId/groupe')
  modifierGroupe(@Param('tenantId') tenantId: string, @Body() dto: ModifierGroupeDto) {
    return this.plateformeService.modifierGroupe(tenantId, dto);
  }

  /**
   * DERNIER RECOURS · quand c'est l'administrateur d'un cabinet qui a oublié
   * son mot de passe, plus personne dans le dossier ne peut le réinitialiser.
   * Sans cette route on retombait sur un UPDATE SQL en production.
   */
  /**
   * DOSSIER DE DÉMONSTRATION · la vitrine que tout magasin d'applications
   * réclame pour instruire une soumission. Ouverte à l'opérateur SEUL, comme
   * le reste de cette console : le dossier qu'elle crée porte un mot de passe
   * public, et n'importe qui d'autre pouvant l'ouvrir pourrait ouvrir une
   * vitrine parallèle qui divergerait de celle qu'on donne au magasin.
   */
  @Post('dossier-demonstration')
  preparerDemonstration(@Body() dto: PreparerDemonstrationDto) {
    return this.plateformeService.preparerDossierDemonstration(dto);
  }

  @Post('cabinets/:tenantId/reinitialiser-admin')
  reinitialiserAdmin(@Param('tenantId') tenantId: string, @Body() dto: ReinitialiserAdminDto) {
    return this.plateformeService.reinitialiserAdmin(tenantId, dto);
  }
}

import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TenantService } from './tenant.service';
import { ModifierJeuEtatsDto } from './dto/parametres-dossier.dto';
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
}

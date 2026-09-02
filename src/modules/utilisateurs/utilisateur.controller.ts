import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UtilisateurService } from './utilisateur.service';
import { CreerUtilisateurDto, ModifierUtilisateurDto, ReinitialiserMotDePasseDto } from './dto/utilisateur.dto';
import { RoleUtilisateur } from '@prisma/client';

// Réservé à l'admin du cabinet : gérer qui a accès au dossier et avec quel
// rôle n'est pas une action de consultation ouverte aux autres rôles.
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Roles(RoleUtilisateur.ADMIN_CABINET)
@Controller('utilisateurs')
export class UtilisateurController {
  constructor(private readonly utilisateurService: UtilisateurService) {}

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser) {
    return this.utilisateurService.lister(user.tenantId);
  }

  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerUtilisateurDto) {
    return this.utilisateurService.creer(user.tenantId, dto);
  }

  @Patch(':id')
  async modifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModifierUtilisateurDto,
  ) {
    return this.utilisateurService.modifier(user.tenantId, id, user.userId, dto);
  }

  /**
   * Sans cette route, un oubli de mot de passe se réglait par un UPDATE SQL
   * en production · une connexion directe à la base de tous les cabinets,
   * faite à la main.
   */
  @Post(':id/reinitialiser-mot-de-passe')
  async reinitialiserMotDePasse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReinitialiserMotDePasseDto,
  ) {
    return this.utilisateurService.reinitialiserMotDePasse(user.tenantId, id, dto.motDePasseProvisoire);
  }

  /** Le comptable qui a mal tapé cinq fois et se souvient très bien du sien. */
  @Post(':id/deverrouiller')
  async deverrouiller(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.utilisateurService.deverrouiller(user.tenantId, id);
  }
}

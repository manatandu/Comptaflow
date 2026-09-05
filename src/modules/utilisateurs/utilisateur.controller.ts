import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UtilisateurService } from './utilisateur.service';
import { AvisAccesService } from './avis-acces.service';
import { CreerUtilisateurDto, ModifierUtilisateurDto, ReinitialiserMotDePasseDto } from './dto/utilisateur.dto';
import { RoleUtilisateur } from '@prisma/client';

// Réservé à l'admin du cabinet : gérer qui a accès au dossier et avec quel
// rôle n'est pas une action de consultation ouverte aux autres rôles.
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Roles(RoleUtilisateur.ADMIN_CABINET)
@Controller('utilisateurs')
export class UtilisateurController {
  constructor(
    private readonly utilisateurService: UtilisateurService,
    /**
     * L'AVIS EST POSÉ ICI, PAS DANS `UtilisateurService`, et c'est délibéré ·
     * le compte existe avant que l'avis soit composé, et rien de l'avis ne
     * peut le défaire. Le service garde donc un contrat qui ne parle que de
     * l'accès (son résultat est d'ailleurs figé par
     * src/modules/auth/cycle-de-vie-acces.spec.ts), et la réponse HTTP porte
     * en plus ce que le titulaire a appris, ou n'a pas appris.
     */
    private readonly avis: AvisAccesService,
  ) {}

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser) {
    return this.utilisateurService.lister(user.tenantId);
  }

  /**
   * La création reste ce qu'elle était, et l'avis S'AJOUTE · le mot de passe
   * est choisi par l'administrateur, qui l'a sous les yeux et le remet
   * lui-même. Rien n'est retiré de l'écran : sans transport opérationnel,
   * retirer ce chemin-là rendrait la création de comptes impossible.
   */
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerUtilisateurDto) {
    const cree = await this.utilisateurService.creer(user.tenantId, dto);
    return {
      ...cree,
      avis: await this.avis.annoncerCompteCree(user.tenantId, {
        userId: cree.id,
        email: cree.email,
        role: cree.role,
        parQui: user.userId,
      }),
    };
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
    const resultat = await this.utilisateurService.reinitialiserMotDePasse(
      user.tenantId,
      id,
      dto.motDePasseProvisoire,
    );
    return {
      ...resultat,
      // Le titulaire vient de perdre toutes ses sessions · l'avis lui dit
      // pourquoi, et lui donne le moyen de réagir si ce n'est pas lui qui
      // l'a demandé.
      avis: await this.avis.annoncerReinitialisation(user.tenantId, {
        userId: id,
        email: resultat.email,
        parQui: user.userId,
      }),
    };
  }

  /** Le comptable qui a mal tapé cinq fois et se souvient très bien du sien. */
  @Post(':id/deverrouiller')
  async deverrouiller(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.utilisateurService.deverrouiller(user.tenantId, id);
  }
}

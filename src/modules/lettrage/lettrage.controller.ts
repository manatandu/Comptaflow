import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { LettrageService } from './lettrage.service';
import { CompleterLettrageDto, ConfirmerPreLettrageDto, LettrerDto, VerrouillerLettrageDto } from './dto/lettrage.dto';
import { RoleUtilisateur, StatutLettrage } from '@prisma/client';

// Même règle que la saisie d'écritures : LECTURE_SEULE consulte, seuls
// ADMIN_CABINET et COMPTABLE peuvent lettrer/délettrer.
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('comptes/:compteId/lettrage')
export class LettrageController {
  constructor(private readonly lettrageService: LettrageService) {}

  @Get()
  async lister(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compteId') compteId: string,
    @Query('nonLettreesSeulement') nonLettreesSeulement?: string,
  ) {
    return this.lettrageService.lister(user.tenantId, compteId, nonLettreesSeulement === 'true');
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post()
  async lettrer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compteId') compteId: string,
    @Body() dto: LettrerDto,
  ) {
    return this.lettrageService.lettrerManuel(user.tenantId, compteId, dto.ligneIds, user.userId, {
      autoriserPartiel: dto.autoriserPartiel,
    });
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('auto')
  async lettrageAutomatique(@CurrentUser() user: AuthenticatedUser, @Param('compteId') compteId: string) {
    return this.lettrageService.lettrageAutomatique(user.tenantId, compteId, user.userId);
  }

  /**
   * PRÉ-LETTRAGE · la même recherche que le lettrage automatique, mais elle
   * n'écrit RIEN. Ouverte à tout rôle authentifié, comme les autres lectures :
   * proposer n'est pas poser, et c'est justement ce que cet écran existe pour
   * séparer.
   */
  @Get('pre-lettrage')
  async preLettrage(@CurrentUser() user: AuthenticatedUser, @Param('compteId') compteId: string) {
    return this.lettrageService.preLettrage(user.tenantId, compteId);
  }

  /** Confirme des groupes proposés · le serveur revérifie tout (voir le service). */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('pre-lettrage/confirmer')
  async confirmerPreLettrage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compteId') compteId: string,
    @Body() dto: ConfirmerPreLettrageDto,
  ) {
    return this.lettrageService.confirmerPreLettrage(user.tenantId, compteId, user.userId, dto.groupes);
  }

  /**
   * Complète un lettrage PARTIEL · le règlement du solde restant. Le groupe
   * passe SOLDE de lui-même quand il tombe à zéro, et sa lettre est alors
   * posée sur toutes ses lignes (voir LettrageService.completer).
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':lettrageId/completer')
  async completer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lettrageId') lettrageId: string,
    @Body() dto: CompleterLettrageDto,
  ) {
    return this.lettrageService.completer(user.tenantId, lettrageId, dto.ligneIds);
  }

  /** « Verrouillage définitif ou non du lettrage » (CPCC, ch. 6). */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':lettrageId/verrou')
  async verrouiller(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lettrageId') lettrageId: string,
    @Body() dto: VerrouillerLettrageDto,
  ) {
    return this.lettrageService.verrouiller(user.tenantId, lettrageId, dto.verrouille);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete(':lettre')
  async delettrer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compteId') compteId: string,
    @Param('lettre') lettre: string,
  ) {
    return this.lettrageService.delettrer(user.tenantId, compteId, lettre);
  }
}

/**
 * VUE D'ENSEMBLE · route à part, hors du chemin `comptes/:compteId`, parce
 * qu'elle ne parle d'aucun compte en particulier. Elle sert l'ouverture de la
 * fenêtre Lettrage, qui montrait un écran vide tant qu'un compte n'avait pas
 * été choisi.
 *
 * LECTURE SEULE · aucune écriture ici, donc aucun rôle exigé au-delà de la
 * session : le lettrage se pose toujours par les routes du compte.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('lettrage')
export class LettrageDossierController {
  constructor(private readonly lettrageService: LettrageService) {}

  @Get()
  async listerTout(@CurrentUser() user: AuthenticatedUser, @Query('statut') statut?: string) {
    const filtre =
      statut === 'SOLDE' ? StatutLettrage.SOLDE : statut === 'PARTIEL' ? StatutLettrage.PARTIEL : undefined;
    return this.lettrageService.listerGroupesDuDossier(user.tenantId, filtre);
  }
}

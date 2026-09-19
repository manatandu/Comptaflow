import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { MagasinService } from './magasin.service';
import {
  ConfronterInventaireDto,
  CreerArticleStockDto,
  EnregistrerMouvementStockDto,
  EnregistrerRegularisationInventaireDto,
} from './dto/magasin.dto';

/**
 * LE MAGASIN · commun aux deux référentiels, pour la même raison que la
 * variation de stocks (CLAUDE.md § 6) : les deux textes ouvrent une classe 3
 * et posent le même choix entre inventaire permanent et intermittent. Ce qui
 * les sépare est la NOMENCLATURE, tranchée compte par compte dans
 * `nomenclature-stocks.ts`.
 *
 * Tenir une fiche et passer une régularisation sont deux gestes de saisie ; la
 * lecture est ouverte au réviseur, qui a besoin de la fiche pour contrôler le
 * compte.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('magasin')
export class MagasinController {
  constructor(private readonly magasin: MagasinService) {}

  @Get('articles')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  async listerArticles(@CurrentUser() user: AuthenticatedUser) {
    return this.magasin.listerArticles(user.tenantId);
  }

  @Post('articles')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async creerArticle(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreerArticleStockDto,
  ) {
    return this.magasin.creerArticle(user.tenantId, user.userId, dto);
  }

  @Get('articles/:articleId/fiche')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  async ficheDeStock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('articleId') articleId: string,
  ) {
    return this.magasin.ficheDeStock(user.tenantId, articleId);
  }

  @Post('articles/:articleId/mouvements')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async enregistrerMouvement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('articleId') articleId: string,
    @Body() dto: EnregistrerMouvementStockDto,
  ) {
    return this.magasin.enregistrerMouvement(user.tenantId, user.userId, articleId, dto);
  }

  @Post('inventaire/confrontation')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  async confronter(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfronterInventaireDto,
  ) {
    return this.magasin.confronter(user.tenantId, dto.comptages);
  }

  @Post('inventaire/regularisation')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async enregistrerRegularisation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EnregistrerRegularisationInventaireDto,
  ) {
    return this.magasin.enregistrerRegularisation(user.tenantId, user.userId, dto);
  }
}

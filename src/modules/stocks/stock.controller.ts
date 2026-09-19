import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { EnregistrerVariationStocksDto } from './dto/stock.dto';
import { StockService } from './stock.service';

/**
 * STOCKS · commun aux deux référentiels, et ce n'est pas un oubli du
 * cloisonnement (CLAUDE.md § 6).
 *
 * Les deux textes ouvrent une classe 3, posent le même choix entre inventaire
 * permanent et intermittent, et écrivent le même schéma de variation à la
 * clôture. Ce qui les sépare est la NOMENCLATURE, tranchée compte par compte
 * dans `nomenclature-stocks.ts`. Fermer la fenêtre à l'un des deux lui
 * retirerait une écriture que son propre référentiel lui impose.
 *
 * Passer la variation, c'est écrire au livre-journal : le geste est réservé
 * aux mêmes rôles que la saisie, la lecture est ouverte au réviseur.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('stocks')
export class StockController {
  constructor(private readonly stocks: StockService) {}

  @Get('variation/:exerciceId')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  async proposer(@CurrentUser() user: AuthenticatedUser, @Param('exerciceId') exerciceId: string) {
    return this.stocks.proposer(user.tenantId, exerciceId);
  }

  @Post('variation')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async enregistrer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EnregistrerVariationStocksDto,
  ) {
    return this.stocks.enregistrer(user.tenantId, user.userId, dto);
  }
}

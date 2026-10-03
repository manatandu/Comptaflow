import { Body, Controller, Get, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ReglementsService } from './reglements.service';
import { EnregistrerReglementsDto, PasserEcartChangeDto } from './reglements.dto';
import { EXERCICE_REQUIS } from '../../common/exercice-requis';

@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('reglements')
export class ReglementsController {
  constructor(private readonly reglements: ReglementsService) {}

  @Get('echeances')
  async echeances(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
    @Query('sens') sens: string,
    @Query('jusquau') jusquau?: string,
  ) {
    if (sens !== 'FOURNISSEUR' && sens !== 'CLIENT') throw new BadRequestException('Sens attendu : FOURNISSEUR ou CLIENT.');
    // L'exercice absent ou illisible est refusé par le porteur (EXERCICE_REQUIS),
    // avec le message de toutes les autres routes · le refus écrit ici à la
    // main (« Exercice requis. ») disait la même chose en d'autres mots, et
    // laissait un identifiant illisible descendre jusqu'à la base.
    return this.reglements.echeances(user.tenantId, exerciceId, sens, jusquau);
  }

  // LECTURE_SEULE consulte les échéances ; seuls ADMIN_CABINET et COMPTABLE
  // passent un règlement.
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post()
  async enregistrer(@CurrentUser() user: AuthenticatedUser, @Body() dto: EnregistrerReglementsDto) {
    return this.reglements.enregistrer(user.tenantId, user.userId, dto, user.email);
  }

  /**
   * Passe l'écart de change PROPOSÉ d'un lettrage soldé dans sa devise et non
   * en francs (ligne A6) · la proposition est rejouée au serveur, le groupe
   * passe SOLDE avec la ligne du tiers.
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('ecart-change')
  async passerEcartChange(@CurrentUser() user: AuthenticatedUser, @Body() dto: PasserEcartChangeDto) {
    return this.reglements.passerEcartChange(user.tenantId, user.userId, dto);
  }
}

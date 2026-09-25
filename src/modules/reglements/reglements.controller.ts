import { Body, Controller, Get, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ReglementsService } from './reglements.service';
import { EnregistrerReglementsDto } from './reglements.dto';

@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('reglements')
export class ReglementsController {
  constructor(private readonly reglements: ReglementsService) {}

  @Get('echeances')
  async echeances(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId: string,
    @Query('sens') sens: string,
    @Query('jusquau') jusquau?: string,
  ) {
    if (sens !== 'FOURNISSEUR' && sens !== 'CLIENT') throw new BadRequestException('Sens attendu : FOURNISSEUR ou CLIENT.');
    if (!exerciceId) throw new BadRequestException('Exercice requis.');
    return this.reglements.echeances(user.tenantId, exerciceId, sens, jusquau);
  }

  // LECTURE_SEULE consulte les échéances ; seuls ADMIN_CABINET et COMPTABLE
  // passent un règlement.
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post()
  async enregistrer(@CurrentUser() user: AuthenticatedUser, @Body() dto: EnregistrerReglementsDto) {
    return this.reglements.enregistrer(user.tenantId, user.userId, dto);
  }
}

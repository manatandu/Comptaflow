import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EcritureService } from './ecriture.service';
import { CreerEcritureDto } from './dto/creer-ecriture.dto';
import { RoleUtilisateur } from '@prisma/client';

@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('ecritures')
export class EcritureController {
  constructor(private readonly ecritureService: EcritureService) {}

  // LECTURE_SEULE consulte tout ci-dessous mais ne peut pas enregistrer d'écriture.
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerEcritureDto) {
    return this.ecritureService.creer(user.tenantId, user.userId, dto);
  }

  /** Journal — voir l'écran « Journal & grand livre » (onglet Journal) du canevas. */
  @Get()
  async lister(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId?: string,
    @Query('journalId') journalId?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('recherche') recherche?: string,
  ) {
    return this.ecritureService.lister(user.tenantId, { exerciceId, journalId, dateDebut, dateFin, recherche });
  }

  /** Balance — voir l'onglet Balance du même écran. */
  @Get('balance')
  async balance(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.ecritureService.balance(user.tenantId, exerciceId);
  }

  /** Grand livre d'un compte — voir l'onglet Grand livre du même écran. */
  @Get('grand-livre/:compteId')
  async grandLivre(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compteId') compteId: string,
    @Query('exerciceId') exerciceId?: string,
  ) {
    return this.ecritureService.grandLivre(user.tenantId, compteId, exerciceId);
  }
}

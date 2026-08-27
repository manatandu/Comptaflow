import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EcritureService } from './ecriture.service';
import { CreerEcritureDto } from './dto/creer-ecriture.dto';

@UseGuards(JwtAuthGuard, LicenceGuard)
@Controller('ecritures')
export class EcritureController {
  constructor(private readonly ecritureService: EcritureService) {}

  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerEcritureDto) {
    return this.ecritureService.creer(user.tenantId, user.userId, dto);
  }

  /** Journal — voir l'écran « Journal & grand livre » (onglet Journal) du canevas. */
  @Get()
  async lister(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId?: string,
    @Query('journalCode') journalCode?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('recherche') recherche?: string,
  ) {
    return this.ecritureService.lister(user.tenantId, { exerciceId, journalCode, dateDebut, dateFin, recherche });
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

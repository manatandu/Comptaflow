import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EtatsFinanciersService } from './etats-financiers.service';

@UseGuards(JwtAuthGuard, LicenceGuard)
@Controller('etats-financiers')
export class EtatsFinanciersController {
  constructor(private readonly etatsFinanciersService: EtatsFinanciersService) {}

  @Get('bilan')
  async bilan(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.etatsFinanciersService.bilan(user.tenantId, exerciceId);
  }

  /** Compte de résultat — postes officiels SYCEBNL (Partie 4, ch. 2). */
  @Get('compte-de-resultat')
  async compteDeResultat(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.etatsFinanciersService.compteDeResultat(user.tenantId, exerciceId);
  }
}

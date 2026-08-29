import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RetenuesService } from './retenues.service';

@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('retenues')
export class RetenuesController {
  constructor(private readonly retenues: RetenuesService) {}

  /** Registre des retenues à la source et des cotisations sociales. */
  @Get('registre')
  async registre(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId: string,
    @Query('dateReference') dateReference?: string,
  ) {
    return this.retenues.registre(user.tenantId, { exerciceId, dateReference });
  }

  /** Échéancier fiscal et social · les prochaines dates de reversement. */
  @Get('echeancier')
  async echeancier(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId: string,
    @Query('dateReference') dateReference?: string,
  ) {
    return this.retenues.echeancierFiscal(user.tenantId, { exerciceId, dateReference });
  }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ControlesService } from './controles.service';

/** Consultation ouverte aux trois rôles : un contrôle ne modifie rien. */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('controles')
export class ControlesController {
  constructor(private readonly controles: ControlesService) {}

  @Get()
  async analyser(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.controles.analyser(user.tenantId, exerciceId);
  }

  @Get('caisse')
  async caisse(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.controles.controleCaisse(user.tenantId, exerciceId);
  }
}

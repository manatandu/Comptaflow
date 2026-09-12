import { Controller, Get, UseGuards } from '@nestjs/common';
import { Referentiel } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ConstitutionService } from './constitution.service';

/**
 * Cloisonné au SYCEBNL · la loi n° 004/2001 régit les ASBL et les EUP. Une
 * société commerciale se constitue selon l'AUSCGIE, par une tout autre
 * procédure, et lui servir cette checklist lui ferait réunir des pièces qui ne
 * la concernent pas. Masquer ne suffirait pas (§ 6) : la route se refuse.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@ReferentielsAutorises(Referentiel.SYCEBNL)
@Controller('constitution')
export class ConstitutionController {
  constructor(private readonly constitution: ConstitutionService) {}

  @Get()
  parcours(@CurrentUser() user: AuthenticatedUser) {
    return this.constitution.parcours(user.tenantId);
  }
}

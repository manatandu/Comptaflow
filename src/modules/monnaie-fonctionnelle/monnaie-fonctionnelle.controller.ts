import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { BalanceFonctionnelleService } from './balance-fonctionnelle.service';

/**
 * LE SECOND JEU · lecture seule, et il le dit sur chaque page.
 *
 * Aucun `@ReferentielsAutorises` · la monnaie fonctionnelle n'est propre à
 * aucun plan. Une ASBL financée en dollars et une société qui facture en
 * dollars ont le même besoin.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('monnaie-fonctionnelle')
export class MonnaieFonctionnelleController {
  constructor(private readonly balanceFonctionnelle: BalanceFonctionnelleService) {}

  @Get('balance/:exerciceId')
  balance(@CurrentUser() user: AuthenticatedUser, @Param('exerciceId') exerciceId: string) {
    return this.balanceFonctionnelle.balance(user.tenantId, exerciceId);
  }
}

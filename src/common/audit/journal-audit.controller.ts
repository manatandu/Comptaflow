import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';
import { LicenceGuard } from '../../modules/licence/licence.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../decorators/current-user.decorator';
import { RoleUtilisateur } from '@prisma/client';
import { JournalAuditService } from './journal-audit.service';
import { objetsAudites } from './libelles-objets-audites';
import { FiltreJournalAuditDto } from './filtre-journal-audit.dto';

/**
 * Le journal se lit, il ne s'écrit pas · aucune route POST, PATCH ou DELETE
 * ici, et ce n'est pas un oubli. Le seul écrivain est l'extension Prisma.
 *
 * Réservé à l'ADMIN_CABINET : le journal dit qui a fait quoi, il expose donc
 * l'activité de chaque collaborateur du dossier.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Roles(RoleUtilisateur.ADMIN_CABINET)
@Controller('journal-audit')
export class JournalAuditController {
  constructor(private readonly service: JournalAuditService) {}

  /**
   * UN SEUL `@Query()`, TYPÉ PAR SON DTO (audit final F239) · des `@Query('x')`
   * scalaires échappent au ValidationPipe global, et leur conversion à la main
   * (`Number`, `new Date`) laissait passer NaN et les dates invalides jusqu'à
   * Prisma, soit une erreur 500 sur une simple faute de frappe. Le DTO les
   * refuse en 400 et en nomme la raison.
   */
  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser, @Query() filtre: FiltreJournalAuditDto) {
    return this.service.lister(user.tenantId, filtre);
  }

  /** Les objets que le filtre propose · tous ceux que le journal couvre (audit final F182). */
  @Get('objets')
  objets() {
    return objetsAudites();
  }

  /** Le contrôle d'intégrité · AUDCIF art. 22, 5° et 6°. */
  @Get('verification')
  async verifier(@CurrentUser() user: AuthenticatedUser) {
    return this.service.verifier(user.tenantId);
  }
}

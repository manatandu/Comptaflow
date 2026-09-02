import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';
import { LicenceGuard } from '../../modules/licence/licence.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../decorators/current-user.decorator';
import { RoleUtilisateur } from '@prisma/client';
import { JournalAuditService } from './journal-audit.service';

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

  @Get()
  async lister(
    @CurrentUser() user: AuthenticatedUser,
    @Query('entite') entite?: string,
    @Query('entiteId') entiteId?: string,
    @Query('acteurEmail') acteurEmail?: string,
    @Query('depuis') depuis?: string,
    @Query('jusqua') jusqua?: string,
    @Query('page') page?: string,
    @Query('taille') taille?: string,
  ) {
    return this.service.lister(user.tenantId, {
      entite,
      entiteId,
      acteurEmail,
      depuis: depuis ? new Date(depuis) : undefined,
      jusqua: jusqua ? new Date(jusqua) : undefined,
      page: page ? Number(page) : undefined,
      taille: taille ? Number(taille) : undefined,
    });
  }

  /** Le contrôle d'intégrité · AUDCIF art. 22, 5° et 6°. */
  @Get('verification')
  async verifier(@CurrentUser() user: AuthenticatedUser) {
    return this.service.verifier(user.tenantId);
  }
}

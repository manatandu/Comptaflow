import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { EXERCICE_REQUIS } from '../../common/exercice-requis';
import { RepriseSubventionDto } from './dto/immobilisation.dto';
import { RepriseSubventionService } from './reprise-subvention.service';

/** Reprise au 799 des subventions en nature · mêmes droits que la dotation. */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('immobilisations')
export class RepriseSubventionController {
  constructor(private readonly service: RepriseSubventionService) {}

  @Get('reprises-subvention')
  lister(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.service.lister(user.tenantId, exerciceId);
  }

  @Get(':id/reprise-subvention')
  proposer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
    @Query('dureeInalienabiliteAns') duree?: string,
  ) {
    const annees = duree ? Number(duree) : null;
    return this.service.proposer(user.tenantId, id, exerciceId, Number.isInteger(annees) && annees! > 0 ? annees : null);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/reprise-subvention')
  passer(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RepriseSubventionDto) {
    return this.service.passer(user.tenantId, user.userId, id, dto);
  }
}

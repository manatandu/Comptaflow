import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { LicenceGuard } from '../../licence/licence.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../../common/decorators/current-user.decorator';
import { EXERCICE_REQUIS } from '../../../common/exercice-requis';
import { ClotureLocationAcquisitionDto } from '../dto/immobilisation.dto';
import { LocationAcquisitionService } from './location-acquisition.service';

/** Clôture des contrats de location-acquisition · mêmes droits que la dotation. */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('immobilisations/location-acquisition/contrats')
export class LocationAcquisitionController {
  constructor(private readonly service: LocationAcquisitionService) {}

  @Get()
  lister(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.service.lister(user.tenantId, exerciceId);
  }

  @Get(':id/cloture')
  proposer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.service.proposer(user.tenantId, id, exerciceId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/cloture')
  passer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClotureLocationAcquisitionDto,
  ) {
    return this.service.passer(user.tenantId, user.userId, id, dto);
  }
}

import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { NatureCompteType, RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { NaturesCompteService } from './natures-compte.service';
import { AlignerNaturesDto, ModifierNatureCompteDto } from './dto/natures-compte.dto';

/** Natures de compte (point 14) · lecture ouverte, paramétrage à l'administrateur. */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('natures-compte')
export class NaturesCompteController {
  constructor(private readonly natures: NaturesCompteService) {}

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser) {
    return this.natures.lister(user.tenantId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Patch(':nature')
  async modifier(@CurrentUser() user: AuthenticatedUser, @Param('nature') nature: NatureCompteType, @Body() dto: ModifierNatureCompteDto) {
    return this.natures.modifier(user.tenantId, nature, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post('aligner')
  async aligner(@CurrentUser() user: AuthenticatedUser, @Body() dto: AlignerNaturesDto) {
    return this.natures.aligner(user.tenantId, dto.compteIds);
  }
}

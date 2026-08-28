import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { LettrageService } from './lettrage.service';
import { LettrerDto } from './dto/lettrage.dto';
import { RoleUtilisateur } from '@prisma/client';

// Même règle que la saisie d'écritures : LECTURE_SEULE consulte, seuls
// ADMIN_CABINET et COMPTABLE peuvent lettrer/délettrer.
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('comptes/:compteId/lettrage')
export class LettrageController {
  constructor(private readonly lettrageService: LettrageService) {}

  @Get()
  async lister(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compteId') compteId: string,
    @Query('nonLettreesSeulement') nonLettreesSeulement?: string,
  ) {
    return this.lettrageService.lister(user.tenantId, compteId, nonLettreesSeulement === 'true');
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post()
  async lettrer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compteId') compteId: string,
    @Body() dto: LettrerDto,
  ) {
    return this.lettrageService.lettrerManuel(user.tenantId, compteId, dto.ligneIds);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('auto')
  async lettrageAutomatique(@CurrentUser() user: AuthenticatedUser, @Param('compteId') compteId: string) {
    return this.lettrageService.lettrageAutomatique(user.tenantId, compteId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete(':lettre')
  async delettrer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compteId') compteId: string,
    @Param('lettre') lettre: string,
  ) {
    return this.lettrageService.delettrer(user.tenantId, compteId, lettre);
  }
}

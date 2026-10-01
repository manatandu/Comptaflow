import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { MethodeDepreciationSubventionDto, OctroiSubventionDto, RattacherSubventionDto, ReduireSubventionDto } from './dto/immobilisation.dto';
import { SubventionRattacheeService } from './subvention-rattachee.service';

/**
 * Subventions en numéraire rattachées aux biens (lot 5) · le rattachement et
 * les réductions aux mêmes droits que la reprise ; la méthode de dépréciation
 * du dossier (§ 4.6), qui engage les Notes annexes, à l'administrateur seul.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('immobilisations')
export class SubventionRattacheeController {
  constructor(private readonly service: SubventionRattacheeService) {}

  @Get('subventions-rattachees')
  lister(
    @CurrentUser() user: AuthenticatedUser,
    @Query('immobilisationId', new ParseUUIDPipe({ optional: true })) immobilisationId?: string,
  ) {
    return this.service.lister(user.tenantId, immobilisationId);
  }

  /** Les octrois inscrits au 14 choisi, le reste à rattacher et les contreparties proposées. */
  @Get('subventions-rattachees/octrois')
  octrois(@CurrentUser() user: AuthenticatedUser, @Query('compteSubventionId', ParseUUIDPipe) compteSubventionId: string) {
    return this.service.octrois(user.tenantId, compteSubventionId);
  }

  /** L'octroi · D 4731 (ou 4494, 4582) / C 14, au brouillard. */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('subventions-rattachees/octrois')
  enregistrerOctroi(@CurrentUser() user: AuthenticatedUser, @Body() dto: OctroiSubventionDto) {
    return this.service.enregistrerOctroi(user.tenantId, user.userId, dto);
  }

  @Get(':id/ventilation-subvention')
  ventilation(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Query('montant') montant: string) {
    const m = Number(montant);
    return this.service.ventilation(user.tenantId, id, Number.isFinite(m) && m > 0 ? m : 0);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('subventions-rattachees')
  rattacher(@CurrentUser() user: AuthenticatedUser, @Body() dto: RattacherSubventionDto) {
    return this.service.rattacher(user.tenantId, user.userId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('subventions-rattachees/:id/reductions')
  reduire(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReduireSubventionDto) {
    return this.service.reduire(user.tenantId, user.userId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Put('subventions-rattachees-methode')
  declarerMethode(@CurrentUser() user: AuthenticatedUser, @Body() dto: MethodeDepreciationSubventionDto) {
    return this.service.declarerMethode(user.tenantId, dto);
  }
}

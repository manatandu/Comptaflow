import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { PersonnelService } from './personnel.service';
import {
  ContratTravailDto,
  SalarieDto,
  SimulationPaieDto,
  TerminerContratDto,
} from './dto/personnel.dto';

/**
 * LE REGISTRE DU PERSONNEL · commun aux deux référentiels, parce que le Code
 * du travail ne connaît ni le SYCEBNL ni le SYSCOHADA.
 *
 * LES RÔLES. Tenir le registre est un geste de saisie. La LECTURE est ouverte
 * au réviseur, qui a besoin de l'effectif pour la note annexe et de la
 * confrontation pour son questionnaire de cycle · lui fermer le registre le
 * renverrait le demander par courriel.
 *
 * `tenantId` ne vient JAMAIS du client · il vient du jeton, et le service le
 * repose dans le `where` de chaque lecture et de chaque écriture.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('personnel')
export class PersonnelController {
  constructor(private readonly personnel: PersonnelService) {}

  @Get('salaries')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  async lister(@CurrentUser() user: AuthenticatedUser, @Query('tous') tous?: string) {
    return this.personnel.lister(user.tenantId, tous === 'true');
  }

  @Post('salaries')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async creerSalarie(@CurrentUser() user: AuthenticatedUser, @Body() dto: SalarieDto) {
    return this.personnel.creerSalarie(user.tenantId, user.userId, dto);
  }

  @Put('salaries/:salarieId')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async modifierSalarie(
    @CurrentUser() user: AuthenticatedUser,
    @Param('salarieId') salarieId: string,
    @Body() dto: SalarieDto,
  ) {
    return this.personnel.modifierSalarie(user.tenantId, salarieId, dto);
  }

  @Post('salaries/:salarieId/contrats')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async creerContrat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('salarieId') salarieId: string,
    @Body() dto: ContratTravailDto,
  ) {
    return this.personnel.creerContrat(user.tenantId, user.userId, salarieId, dto);
  }

  @Post('contrats/:contratId/fin')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async terminerContrat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contratId') contratId: string,
    @Body() dto: TerminerContratDto,
  ) {
    return this.personnel.terminerContrat(user.tenantId, contratId, dto);
  }

  @Get('confrontation')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  async confronter(@CurrentUser() user: AuthenticatedUser) {
    return this.personnel.confronter(user.tenantId);
  }


  /**
   * LA SIMULATION DE PAIE · elle ne STOCKE rien, et c'est pourquoi elle est en
   * POST sans être une écriture : les éléments de paie d'un mois ne tiennent
   * pas dans une chaîne de requête, et les porter en clair dans une URL les
   * ferait entrer dans les journaux d'accès, ce qui est une donnée de
   * rémunération nominative.
   *
   * LA LECTURE SEULE Y A DROIT. Le réviseur a besoin de refaire le calcul
   * d'une retenue sans pouvoir rien modifier · c'est exactement sa place.
   */
  @Post('simulation')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  async simulerPaie(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SimulationPaieDto,
    @Query('salarieId') salarieId?: string,
  ) {
    return this.personnel.simulerPaie(user.tenantId, salarieId ?? null, dto);
  }

  /**
   * L'effectif à une date. La date est un PARAMÈTRE, parce que la note annexe
   * se lit à la clôture et l'accord-cadre au jour du contrôle · un effectif
   * « du jour » ne servirait ni l'une ni l'autre.
   */
  @Get('effectif')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  async effectif(@CurrentUser() user: AuthenticatedUser, @Query('ala') ala?: string) {
    const date = ala ? new Date(ala) : new Date();
    return this.personnel.effectif(user.tenantId, Number.isNaN(date.getTime()) ? new Date() : date);
  }
}

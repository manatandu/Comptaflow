import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { PersonnelService } from './personnel.service';
import { ComptabilisationPaieService } from './comptabilisation-paie.service';
import {
  AnnulationBulletinDto,
  ComptabilisationPaieDto,
  ContratTravailDto,
  DecompteFinalDto,
  LivreDePaieDto,
  RemiseBulletinDto,
  SalarieDto,
  SimulationPaieDto,
  TerminerContratDto,
} from './dto/personnel.dto';
import { AccesRolesCantonnes, ReserveAuComptable } from '../../common/decorators/acces-roles-cantonnes.decorator';

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
// LE MODULE DU GESTIONNAIRE DE PAIE, ET FERMÉ À L'AIDE-COMPTABLE · données
// nominatives (rémunérations, enfants, CNSS) · voir roles-cantonnes.ts.
@AccesRolesCantonnes({ aideComptable: false, gestionnairePaie: true })
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('personnel')
export class PersonnelController {
  constructor(
    private readonly personnel: PersonnelService,
    private readonly paieDuMois: ComptabilisationPaieService,
  ) {}

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
   * LE DÉCOMPTE FINAL · en POST parce qu'il ne stocke rien mais que ses
   * données sont nominatives par destination, et qu'une chaîne de requête
   * entrerait dans les journaux d'accès. Même raison que la simulation.
   */
  @Post('decompte-final')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  async decompteFinal(@CurrentUser() user: AuthenticatedUser, @Body() dto: DecompteFinalDto) {
    return this.personnel.decompteFinal(user.tenantId, dto);
  }

  /**
   * LE LIVRE DE PAIE ET LE DÉCOMPTE ÉCRIT · articles 213 à 215 et 103. En
   * POST comme les deux routes précédentes, mais pour une autre raison : le
   * corps porte une liste de mentions, pas un nom. La lecture seule y a
   * droit · c'est un contrôle de conformité, exactement le travail du
   * réviseur.
   */
  @Post('livre-de-paie')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  async livreDePaie(@CurrentUser() user: AuthenticatedUser, @Body() dto: LivreDePaieDto) {
    return this.personnel.livreDePaie(user.tenantId, dto);
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

  // ──────────────────────────────────────────────────────────────────────
  // P8 · LE BULLETIN DE PAIE ÉMIS. La consultation est ouverte au réviseur,
  // comme le registre : c'est le premier document qu'un inspecteur du
  // travail demande. Émettre, annuler et déclarer la remise sont des gestes
  // de saisie.
  // ──────────────────────────────────────────────────────────────────────

  @Get('bulletins')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  async listerBulletins(@CurrentUser() user: AuthenticatedUser, @Query('mois') mois?: string) {
    return this.personnel.listerBulletins(user.tenantId, mois || undefined);
  }

  @Get('bulletins/:id')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  async lireBulletin(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.personnel.lireBulletin(user.tenantId, id);
  }

  /**
   * ÉMETTRE · le corps est celui de la simulation, rejouée côté serveur. Aucun
   * montant calculé n'est reçu du client.
   */
  @Post('salaries/:salarieId/bulletins')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async emettreBulletin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('salarieId') salarieId: string,
    @Body() dto: SimulationPaieDto,
  ) {
    return this.personnel.emettreBulletin(user.tenantId, user.userId, salarieId, dto);
  }

  @Post('bulletins/:id/annulation')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async annulerBulletin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AnnulationBulletinDto,
  ) {
    return this.personnel.annulerBulletin(user.tenantId, user.userId, id, dto.motif);
  }

  // P9 · la paie du mois au journal, en une écriture.
  @Get('paie-du-mois/:mois')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE, RoleUtilisateur.LECTURE_SEULE)
  async propositionPaieDuMois(@CurrentUser() user: AuthenticatedUser, @Param('mois') mois: string) {
    return this.paieDuMois.proposition(user.tenantId, mois);
  }

  // PASSER LA PAIE AU JOURNAL ÉCRIT AU LIVRE-JOURNAL · réservé au comptable,
  // le gestionnaire de paie émet les bulletins sans les comptabiliser.
  @Post('paie-du-mois/:mois/comptabilisation')
  @ReserveAuComptable()
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async comptabiliserPaieDuMois(
    @CurrentUser() user: AuthenticatedUser,
    @Param('mois') mois: string,
    @Body() dto: ComptabilisationPaieDto,
  ) {
    return this.paieDuMois.comptabiliser(user.tenantId, user.userId, mois, dto);
  }

  @Delete('paie-du-mois/comptabilisation/:ecritureId')
  @ReserveAuComptable()
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async annulerComptabilisationPaie(@CurrentUser() user: AuthenticatedUser, @Param('ecritureId') ecritureId: string) {
    return this.paieDuMois.annulerComptabilisation(user.tenantId, ecritureId);
  }

  @Post('bulletins/:id/remise')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async declarerRemise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RemiseBulletinDto,
  ) {
    return this.personnel.declarerRemise(user.tenantId, id, dto.remisLe);
  }
}

import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AccesRolesCantonnes, ReserveAuComptable } from '../../common/decorators/acces-roles-cantonnes.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DevisesService } from './devises.service';
import {
  AnnulerReevaluationDto,
  CreerDeviseDto,
  DeclarerContrePassationManuelleDto,
  DeclarerProvisionOuvertureDto,
  DeclarerVentilationDisponibilitesDto,
  ExtournerReevaluationDto,
  ModifierDeviseDto,
  PoserCoursDto,
  ReevaluerDto,
} from './dto/devises.dto';
import { RoleUtilisateur } from '@prisma/client';
import { jourDeKinshasa, messageCoursDejaCote, motifRefusCotationGestionnairePaie } from '../personnel/conversion-usd';
import { EXERCICE_REQUIS } from '../../common/exercice-requis';

@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('devises')
export class DevisesController {
  constructor(private readonly devises: DevisesService) {}

  /**
   * Ouverte au gestionnaire de paie (audit final F247) · il doit voir la
   * devise USD et ses derniers cours pour coter celui du jour. Aucune donnée
   * comptable n'y figure, seulement les devises et leurs cotations.
   */
  @Get()
  @AccesRolesCantonnes({ gestionnairePaie: true })
  async lister(@CurrentUser() user: AuthenticatedUser) {
    return this.devises.lister(user.tenantId);
  }

  @Post()
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerDeviseDto) {
    return this.devises.creer(user.tenantId, dto);
  }

  @Patch(':id')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async modifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModifierDeviseDto,
  ) {
    return this.devises.modifier(user.tenantId, id, dto);
  }

  /** Cote un cours à une date · en RDC, celui de la Banque Centrale du Congo. */
  @Post(':id/cours')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @AccesRolesCantonnes({ gestionnairePaie: true })
  async poserCours(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PoserCoursDto,
  ) {
    // LE GESTIONNAIRE DE PAIE NE COTE QUE LE COURS QUE SA PAIE LIT (audit
    // final F247) · l'USD, au jour de Kinshasa. La route lui est ouverte
    // parce que sa paie en dollars en dépend ; la borne est ici, au serveur,
    // et l'écran ne fait que la reprendre. Une devise que la liste du dossier
    // ne porte pas est refusée ICI, avec le motif du service · s'en remettre
    // au service laissait la borne ouverte à une devise créée entre les deux
    // lectures (relecture adverse de F247).
    // ET IL NE FAIT QUE CRÉER (2026-09-28) · un cours du jour déjà coté, par
    // le comptable ou par un autre clic, lui est refusé en 409 par la clé
    // unique de la base (`ajouterCours`), jamais réécrit par l'`upsert` du
    // comptable. Le refus se lit sur tous les cours et à l'instant de
    // l'écriture, là où la liste n'en rend que douze, lus avant.
    if (user.role === RoleUtilisateur.GESTIONNAIRE_PAIE) {
      const devise = (await this.devises.lister(user.tenantId)).find((d) => d.id === id);
      if (!devise) throw new NotFoundException('Devise introuvable pour ce dossier');
      const maintenant = new Date();
      const motif = motifRefusCotationGestionnairePaie(devise.code, dto.date, maintenant);
      if (motif) throw new ForbiddenException(motif);
      return this.devises.ajouterCours(user.tenantId, id, dto, messageCoursDejaCote(jourDeKinshasa(maintenant)));
    }
    return this.devises.poserCours(user.tenantId, id, dto);
  }

  /** Calcule les écarts sans rien enregistrer. */
  @Post('reevaluation/calcul')
  async calculer(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReevaluerDto) {
    return this.devises.calculer(user.tenantId, dto);
  }

  @Post('reevaluation')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async reevaluer(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReevaluerDto) {
    return this.devises.reevaluer(user.tenantId, user.userId, dto);
  }

  @Get('reevaluation/liste')
  async listerReevaluations(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.devises.listerReevaluations(user.tenantId, exerciceId);
  }

  /**
   * Provision pour pertes de change existant à l'ouverture (ligne A5) · un
   * dossier repris la porte déjà au 194, 4991 ou 4997, et le cabinet la
   * DÉCLARE pour que l'ajustement ne la dote pas une seconde fois. La lecture
   * propose le solde d'ouverture, jamais ne l'impose.
   */
  @Get('provision-ouverture')
  async provisionsOuverture(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.devises.provisionsOuverture(user.tenantId, exerciceId);
  }

  @Post('provision-ouverture')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async declarerProvisionOuverture(@CurrentUser() user: AuthenticatedUser, @Body() dto: DeclarerProvisionOuvertureDto) {
    return this.devises.declarerProvisionOuverture(user.tenantId, user.userId, dto);
  }

  @Delete('provision-ouverture/:id')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async retirerProvisionOuverture(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.devises.retirerProvisionOuverture(user.tenantId, id);
  }

  @Post('reevaluation/:id/extourne')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async extourner(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ExtournerReevaluationDto,
  ) {
    return this.devises.extourner(user.tenantId, user.userId, id, body.exerciceSuivantId, { integrale: body.integrale === true });
  }

  /**
   * ANNULER UNE CONTRE-PASSATION (relecture adverse d'A5 bis, M1) · pour la
   * repasser à l'ouverture de l'exercice qui suit immédiatement · inscription
   * en négatif si validée, suppression au brouillard, motif au journal
   * d'audit ; une décision de validation, réservée au comptable comme
   * l'annulation de la réévaluation.
   */
  @Post('reevaluations/:id/contre-passation/annuler')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @ReserveAuComptable()
  async annulerContrePassation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: AnnulerReevaluationDto) {
    return this.devises.annulerContrePassation(user.tenantId, user.userId, id, body.motif);
  }

  /**
   * LA CONTRE-PASSATION FAITE À LA MAIN SE DÉCLARE (A5 bis, troisième tour) ·
   * les écritures candidates (une proposition, rien n'est retenu), la
   * déclaration et son retrait. Une décision de validation · elle lève le
   * portillon de la réévaluation suivante et retient l'écriture désignée ·
   * réservée au comptable, comme l'annulation de la contre-passation.
   */
  @Get('reevaluations/:id/contre-passation-manuelle/candidates')
  async candidatesContrePassationManuelle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.devises.candidatesContrePassationManuelle(user.tenantId, id);
  }

  @Post('reevaluations/:id/contre-passation-manuelle')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @ReserveAuComptable()
  async declarerContrePassationManuelle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: DeclarerContrePassationManuelleDto,
  ) {
    return this.devises.declarerContrePassationManuelle(user.tenantId, user.userId, id, body.ecritureId, body.motif);
  }

  @Delete('reevaluations/:id/contre-passation-manuelle')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @ReserveAuComptable()
  async retirerContrePassationManuelle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.devises.retirerContrePassationManuelle(user.tenantId, id);
  }

  /**
   * ANNULER UNE RÉÉVALUATION (ligne A6, décision D6) · inscription en négatif
   * des écritures validées, suppression de celles au brouillard, motif au
   * journal d'audit ; une décision de validation, réservée au comptable.
   */
  @Post('reevaluations/:id/annuler')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @ReserveAuComptable()
  async annulerReevaluation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: AnnulerReevaluationDto) {
    return this.devises.annulerReevaluation(user.tenantId, user.userId, id, body.motif);
  }

  /**
   * VENTILER L'ÉCART DES DISPONIBILITÉS d'une réévaluation antérieure
   * (relecture adverse d'A5 bis, B1) · une déclaration avec sa source, comme
   * la provision d'ouverture, mêmes rôles qu'elle ; rien n'est écrit au
   * journal.
   */
  @Post('reevaluations/:id/ventilation-disponibilites')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async declarerVentilationDisponibilites(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: DeclarerVentilationDisponibilitesDto,
  ) {
    return this.devises.declarerVentilationDisponibilites(user.tenantId, user.userId, id, body);
  }
}

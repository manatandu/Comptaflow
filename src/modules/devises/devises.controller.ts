import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AccesRolesCantonnes } from '../../common/decorators/acces-roles-cantonnes.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DevisesService } from './devises.service';
import { CreerDeviseDto, ExtournerReevaluationDto, ModifierDeviseDto, PoserCoursDto, ReevaluerDto } from './dto/devises.dto';
import { RoleUtilisateur } from '@prisma/client';
import { jourDeKinshasa, messageCoursDejaCote, motifRefusCotationGestionnairePaie } from '../personnel/conversion-usd';

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
  async listerReevaluations(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.devises.listerReevaluations(user.tenantId, exerciceId);
  }

  @Post('reevaluation/:id/extourne')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async extourner(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ExtournerReevaluationDto,
  ) {
    return this.devises.extourner(user.tenantId, user.userId, id, body.exerciceSuivantId);
  }
}

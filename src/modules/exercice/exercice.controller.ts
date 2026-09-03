import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ExerciceService } from './exercice.service';
import { CreerExerciceDto } from './dto/creer-exercice.dto';
import { ClorePartielleDto, CloreTotaleDto, ClorePeriodeDto } from './dto/cloture.dto';
import { ArreterComptesDto } from './dto/arrete-comptes.dto';
import { RoleUtilisateur } from '@prisma/client';

@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('exercices')
export class ExerciceController {
  constructor(private readonly exerciceService: ExerciceService) {}

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser) {
    return this.exerciceService.lister(user.tenantId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerExerciceDto) {
    return this.exerciceService.creer(user.tenantId, dto);
  }

  /** Clôture ANNUELLE : solde les charges/produits sur le résultat et génère le report à-nouveau réel. */
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post(':id/cloturer')
  async cloturer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.exerciceService.cloturer(user.tenantId, id, user.userId);
  }

  /**
   * DATE D'ARRÊTÉ DES COMPTES · la quatrième mention obligatoire de chaque
   * page publiée (AUDCIF Titre IX ch. 1 § 2.4), exigée « dans toute
   * publication des états financiers » par l'art. 23.
   *
   * ADMIN_CABINET seulement · l'arrêté est un acte des organes dirigeants, pas
   * une saisie comptable. C'est cette date qui ferme la fenêtre des événements
   * postérieurs et qui date le document opposable.
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post(':id/arrete-comptes')
  async arreterComptes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ArreterComptesDto,
  ) {
    return this.exerciceService.arreterComptes(user.tenantId, id, dto);
  }

  @Get(':id/planning-cloture')
  async planningCloture(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.exerciceService.planningCloture(user.tenantId, id);
  }

  @Get(':id/clotures')
  async listerClotures(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.exerciceService.listerClotures(user.tenantId, id);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post(':id/clotures/partielle')
  async clorePartielle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ClorePartielleDto,
  ) {
    return this.exerciceService.clorePartielle(user.tenantId, id, user.userId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post(':id/clotures/totale')
  async cloreTotale(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CloreTotaleDto) {
    return this.exerciceService.cloreTotale(user.tenantId, id, user.userId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post(':id/clotures/periode')
  async clorePeriode(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ClorePeriodeDto) {
    return this.exerciceService.clorePeriode(user.tenantId, id, user.userId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post('clotures/:clotureId/annuler')
  async annulerCloture(@CurrentUser() user: AuthenticatedUser, @Param('clotureId') clotureId: string) {
    return this.exerciceService.annulerCloture(user.tenantId, clotureId, user.userId);
  }
}

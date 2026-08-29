import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EcritureService } from './ecriture.service';
import { CreerEcritureDto } from './dto/creer-ecriture.dto';
import { CorrigerEcritureDto } from './dto/corriger-ecriture.dto';
import { RoleUtilisateur } from '@prisma/client';

@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('ecritures')
export class EcritureController {
  constructor(private readonly ecritureService: EcritureService) {}

  // LECTURE_SEULE consulte tout ci-dessous mais ne peut pas enregistrer d'écriture.
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerEcritureDto) {
    return this.ecritureService.creer(user.tenantId, user.userId, dto);
  }

  /**
   * Correction d'une écriture par INSCRIPTION EN NÉGATIF (art. 20 de l'AUDCIF,
   * repris par la Partie 2 ch. 2). Il n'y a délibérément AUCUNE route de
   * modification ni de suppression d'écriture sur ce contrôleur : « les
   * documents comptables doivent être tenus sans blanc ni altération d'aucune
   * sorte », et la correction s'effectue « exclusivement » par cette voie.
   *
   * Le corps ne porte ni comptes ni montants : ils sont repris de l'écriture
   * corrigée, à l'identique et changés de signe. Le texte impose l'inscription
   * en négatif « des éléments erronés » · ceux-là, pas d'autres.
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/correction')
  async corriger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CorrigerEcritureDto,
  ) {
    return this.ecritureService.corrigerParInscriptionEnNegatif(user.tenantId, user.userId, id, dto);
  }

  /** Journal · voir l'écran « Journal & grand livre » (onglet Journal) du canevas. */
  @Get()
  async lister(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId?: string,
    @Query('journalId') journalId?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('recherche') recherche?: string,
  ) {
    return this.ecritureService.lister(user.tenantId, { exerciceId, journalId, dateDebut, dateFin, recherche });
  }

  /** Balance · voir l'onglet Balance du même écran. */
  @Get('balance')
  async balance(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.ecritureService.balance(user.tenantId, exerciceId);
  }

  /** Grand livre d'un compte · voir l'onglet Grand livre du même écran. */
  /** Balance âgée · échéances non lettrées des comptes 40/41 par tranches de retard. */
  @Get('balance-agee')
  async balanceAgee(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId: string,
    @Query('dateReference') dateReference?: string,
    @Query('type') type?: 'CLIENTS' | 'FOURNISSEURS' | 'TOUS',
  ) {
    return this.ecritureService.balanceAgee(user.tenantId, { exerciceId, dateReference, type });
  }

  @Get('grand-livre/:compteId')
  async grandLivre(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compteId') compteId: string,
    @Query('exerciceId') exerciceId?: string,
  ) {
    return this.ecritureService.grandLivre(user.tenantId, compteId, exerciceId);
  }
}

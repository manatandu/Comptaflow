import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ClasseCompte } from '@prisma/client';
import { ControlesService } from './controles.service';
import { DossierRevisionService } from './dossier-revision.service';

/** Consultation ouverte aux trois rôles : un contrôle ne modifie rien. */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('controles')
export class ControlesController {
  constructor(
    private readonly controles: ControlesService,
    private readonly revision: DossierRevisionService,
  ) {}

  /**
   * LES FICHES DU RÉFÉRENTIEL · servies telles quelles au client, qui s'en
   * sert pour avertir à la saisie. Soixante-dix-huit entrées, quelques
   * dizaines de kilo-octets : une par dossier ouvert, pas une par ligne
   * saisie.
   */
  @Get('regles-comptes')
  async reglesComptes(@CurrentUser() user: AuthenticatedUser) {
    return this.revision.regles(user.referentiel);
  }

  /** Dossier de révision · un bloc par compte mouvementé de l'exercice. */
  @Get('dossier-revision')
  async dossierRevision(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.revision.dossier(user.tenantId, exerciceId, user.referentiel);
  }

  @Get()
  async analyser(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.controles.analyser(user.tenantId, exerciceId);
  }

  @Get('caisse')
  async caisse(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.controles.controleCaisse(user.tenantId, exerciceId);
  }

  /** Douze colonnes, un compte par ligne · voir ControlesService. */
  @Get('evolution-mensuelle')
  async evolutionMensuelle(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId: string,
    @Query('classe') classe?: ClasseCompte,
  ) {
    return this.controles.evolutionMensuelle(user.tenantId, exerciceId, { classe });
  }

  @Get('comptes-dormants')
  async comptesDormants(@CurrentUser() user: AuthenticatedUser, @Query('mois') mois?: string) {
    const n = Number(mois);
    return this.controles.comptesDormants(user.tenantId, Number.isFinite(n) && n > 0 ? n : 12);
  }
}

import { BadRequestException, Controller, Get, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EtatsFinanciersService } from './etats-financiers.service';

/**
 * Même raison qu'au contrôleur d'export : un `@Query` scalaire échappe au
 * ValidationPipe global, et un `exerciceId` absent devient `undefined`, que
 * Prisma ignore — l'état porterait alors sur TOUS les exercices du dossier
 * sans le dire.
 */
const EXERCICE_REQUIS = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("Le paramètre exerciceId est requis et doit être un identifiant d'exercice valide"),
});

// RolesGuard présent pour que tout `@Roles` ajouté plus tard soit réellement
// appliqué (sans lui, il serait silencieusement ignoré).
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('etats-financiers')
export class EtatsFinanciersController {
  constructor(private readonly etatsFinanciersService: EtatsFinanciersService) {}

  @Get('bilan')
  async bilan(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.etatsFinanciersService.bilan(user.tenantId, exerciceId);
  }

  /** Compte de résultat — postes officiels SYCEBNL (Partie 4, ch. 2). */
  @Get('compte-de-resultat')
  async compteDeResultat(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.etatsFinanciersService.compteDeResultat(user.tenantId, exerciceId);
  }
}

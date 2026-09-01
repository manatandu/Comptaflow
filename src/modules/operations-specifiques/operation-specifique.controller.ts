import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Referentiel, RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { OperationSpecifiqueService } from './operation-specifique.service';
import { AppliquerModeleDto, ProposerModeleDto } from './dto/operation-specifique.dto';

/**
 * Écritures-types des opérations spécifiques aux EBNL (Partie 3 · Guide).
 *
 * La consultation du catalogue est ouverte aux trois rôles : c'est une
 * documentation du référentiel autant qu'un outil de saisie, et un auditeur
 * en LECTURE_SEULE a de bonnes raisons de vouloir lire l'écriture-type d'une
 * opération qu'il contrôle. La PROPOSITION l'est aussi · elle n'écrit rien.
 * Seule l'application effective, qui enregistre, est réservée à
 * ADMIN_CABINET/COMPTABLE, comme toute saisie d'écriture.
 */
// SYCEBNL SEULEMENT · les écritures-types viennent de la Partie 3 de l'Acte
// uniforme SYCEBNL et visent ses comptes (165, 704, 475...) · appliquées à
// un dossier SYSCOHADA elles imputeraient des comptes absents ou d'un autre
// sens (le 165 SYSCOHADA est un dépôt reçu, pas un fonds affecté).
@ReferentielsAutorises(Referentiel.SYCEBNL)
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@Controller('operations-specifiques')
export class OperationSpecifiqueController {
  constructor(private readonly operations: OperationSpecifiqueService) {}

  @Get()
  async catalogue(@CurrentUser() user: AuthenticatedUser) {
    return this.operations.catalogue(user.tenantId);
  }

  /** Calcule l'écriture sans rien enregistrer · ce que l'écran affiche avant validation. */
  @Post('proposition')
  async proposer(@CurrentUser() user: AuthenticatedUser, @Body() dto: ProposerModeleDto) {
    return this.operations.proposer(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('application')
  async appliquer(@CurrentUser() user: AuthenticatedUser, @Body() dto: AppliquerModeleDto) {
    return this.operations.appliquer(user.tenantId, user.userId, dto);
  }
}

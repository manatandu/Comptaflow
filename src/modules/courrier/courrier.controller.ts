import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CourrierService } from './courrier.service';
import { ListerFileDto, ReprendreDto } from './dto/courrier.dto';

@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('courrier')
export class CourrierController {
  constructor(private readonly courrier: CourrierService) {}

  /**
   * « Le courriel est-il posé ? », et sinon quelle variable manque.
   *
   * OUVERTE À TOUT UTILISATEUR DU DOSSIER, sans rôle · c'est le comptable qui
   * voit sa relance marquée SANS_TRANSPORT, et lui refuser l'explication le
   * laisserait devant un logiciel qui a l'air cassé. Aucune VALEUR de variable
   * n'est rendue, seulement des noms (voir transport-courriel.ts).
   */
  @Get('transport')
  etatDuTransport() {
    return this.courrier.etatDuTransport();
  }

  /** Le compte par état, pour la cloche · déclaré AVANT `:id`, qui l'avalerait. */
  @Get('compteurs')
  compteurs(@CurrentUser() user: AuthenticatedUser) {
    return this.courrier.compterParStatut(user.tenantId);
  }

  /** La file du dossier, filtrable par état. */
  @Get()
  lister(@CurrentUser() user: AuthenticatedUser, @Query() dto: ListerFileDto) {
    return this.courrier.lister(user.tenantId, { statut: dto.statut, limite: dto.limite });
  }

  /**
   * RELANCER LES ÉCHECS · l'ordonnanceur du produit, et c'est un bouton.
   *
   * Même rôle que l'émission des relances (`RelancesController.emettre`) : ce
   * qui part sous la signature du dossier n'est pas une consultation. La
   * lecture seule peut voir la file, pas la faire partir.
   */
  @Post('reprendre')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  reprendre(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReprendreDto) {
    return this.courrier.reprendre(user.tenantId, dto.limite);
  }

  /** Un message entier, CORPS COMPRIS · déclaré en dernier, il attrape tout. */
  @Get(':id')
  lire(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.courrier.lire(user.tenantId, id);
  }
}

import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AffectationService } from './affectation.service';
import { EnregistrerAffectationDto } from './dto/affectation.dto';

/**
 * AFFECTATION DU RÉSULTAT · commune aux deux référentiels, et c'est voulu.
 *
 * Aucun `@ReferentielsAutorises` : les deux textes imposent de solder le
 * compte 13, et une association affecte son excédent exactement comme une
 * société affecte son bénéfice · vers d'autres comptes, mais par le même
 * geste. Ce qui diffère est dans la table des règles, pas dans l'accès.
 *
 * Écrire une affectation, c'est passer une écriture au livre-journal : le
 * geste est réservé aux mêmes rôles que la saisie.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('affectation-resultat')
export class AffectationController {
  constructor(private readonly affectation: AffectationService) {}

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser) {
    return this.affectation.lister(user.tenantId);
  }

  /** Ce qu'il faut savoir avant de décider · montant, destinations, réserve légale. */
  @Get('exercice/:exerciceId')
  async preparer(@CurrentUser() user: AuthenticatedUser, @Param('exerciceId') exerciceId: string) {
    return this.affectation.preparer(user.tenantId, exerciceId);
  }

  @Post()
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async enregistrer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EnregistrerAffectationDto,
  ) {
    return this.affectation.enregistrer(user.tenantId, user.userId, dto);
  }

  @Delete(':id')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async supprimer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.affectation.supprimer(user.tenantId, id);
  }
}

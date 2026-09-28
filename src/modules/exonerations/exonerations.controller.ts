import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Referentiel, RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ExonerationsService } from './exonerations.service';
import { CreerExonerationDto, ListerExonerationsDto, ModifierExonerationDto } from './dto/exoneration.dto';

// Les facilités douanières de l'article 39 de la loi n° 004/2001 sont
// propres aux ONG et associations · sans objet pour un dossier SYSCOHADA.
@ReferentielsAutorises(Referentiel.SYCEBNL)
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@Controller('exonerations')
export class ExonerationsController {
  constructor(private readonly exonerations: ExonerationsService) {}

  /**
   * Le registre · dossiers enrichis, pièces manquantes, échéances. Une période
   * (du, au) et une tranche qui se dit ; les compteurs d'alerte restent ceux
   * du registre entier (audit final F188).
   */
  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser, @Query() filtre: ListerExonerationsDto) {
    return this.exonerations.lister(user.tenantId, filtre.dateReference, { du: filtre.du, au: filtre.au });
  }

  /**
   * Le référentiel seul · listes de pièces de la note circulaire 003/2013 et
   * cas de franchise de l'article 339. Utile avant même de créer un dossier :
   * on consulte ce qu'il faudra réunir.
   */
  @Get('referentiel')
  referentiel() {
    return this.exonerations.referentiel();
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerExonerationDto) {
    return this.exonerations.creer(user.tenantId, user.userId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Patch(':id')
  async modifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModifierExonerationDto,
  ) {
    return this.exonerations.modifier(user.tenantId, id, dto as Record<string, unknown>);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete(':id')
  async supprimer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.exonerations.supprimer(user.tenantId, id);
  }
}

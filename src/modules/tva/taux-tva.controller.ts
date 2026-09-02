import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TauxTvaService } from './taux-tva.service';
import { CreerTauxTvaDto, ModifierTauxTvaDto, ComptabiliserLiquidationDto } from './dto/taux-tva.dto';
import { RoleUtilisateur } from '@prisma/client';

// Même règle que Plan de comptes / Journaux : consultation ouverte aux trois
// rôles, gestion réservée à l'admin.
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('taux-tva')
export class TauxTvaController {
  constructor(private readonly tauxTvaService: TauxTvaService) {}

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser, @Query('actifsSeuls') actifsSeuls?: string) {
    return this.tauxTvaService.lister(user.tenantId, actifsSeuls === 'true');
  }

  /** Registre/déclaration TVA sur une période · voir TauxTvaService.declaration(). */
  @Get('declaration')
  async declaration(
    @CurrentUser() user: AuthenticatedUser,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
  ) {
    if (!dateDebut || !dateFin) {
      throw new BadRequestException('dateDebut et dateFin sont requis');
    }
    return this.tauxTvaService.declaration(user.tenantId, new Date(dateDebut), new Date(dateFin));
  }

  /**
   * Comptabilise la liquidation de la période : solde 443/445 (déductible
   * après prorata) sur le compte 444 · voir TauxTvaService.
   * comptabiliserLiquidation(). Même rôle que la saisie d'écritures
   * (ADMIN_CABINET/COMPTABLE), pas seulement l'admin : c'est un acte de
   * gestion courante, pas une opération de paramétrage.
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('declaration/comptabiliser')
  async comptabiliserLiquidation(@CurrentUser() user: AuthenticatedUser, @Body() dto: ComptabiliserLiquidationDto) {
    return this.tauxTvaService.comptabiliserLiquidation(user.tenantId, user.userId, dto);
  }

  /** Les liquidations déjà comptabilisées · c'est le registre du verrou. */
  @Get('liquidations')
  async listerLiquidations(@CurrentUser() user: AuthenticatedUser) {
    return this.tauxTvaService.listerLiquidations(user.tenantId);
  }

  /**
   * ANNULE une liquidation et son écriture. Un verrou sans marche arrière
   * transforme une erreur de date en impasse : qui a liquidé « janvier » au
   * lieu de « janvier à mars » ne pourrait plus jamais liquider février.
   * Mêmes rôles que la comptabilisation, et la suppression de l'écriture
   * passe par les contrôles habituels (exercice clos, période verrouillée).
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete('liquidations/:id')
  async annulerLiquidation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tauxTvaService.annulerLiquidation(user.tenantId, id);
  }

  /**
   * PRORATA DÉFINITIF d'une année civile et régularisation qui en découle
   * (art. 45, à arrêter au plus tard le 31 mars suivant).
   *
   * Le calcul existait, complet et testé, et AUCUNE route ne l'appelait · il
   * était donc rigoureusement inaccessible depuis le logiciel. Une obligation
   * annuelle que le produit sait calculer mais ne montre pas est une
   * obligation que le cabinet oublie.
   */
  @Get('prorata-definitif')
  async prorataDefinitif(@CurrentUser() user: AuthenticatedUser, @Query('annee') annee?: string) {
    const n = Number(annee);
    if (!annee || !Number.isInteger(n) || n < 1900 || n > 2200) {
      throw new BadRequestException('Une année civile est requise (paramètre `annee`).');
    }
    return this.tauxTvaService.prorataDefinitif(user.tenantId, n);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerTauxTvaDto) {
    return this.tauxTvaService.creer(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Patch(':id')
  async modifier(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ModifierTauxTvaDto) {
    return this.tauxTvaService.modifier(user.tenantId, id, dto);
  }
}

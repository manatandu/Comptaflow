import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Referentiel, RoleUtilisateur } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { BailleurService } from './bailleur.service';
import { CreerBailleurDto, ModifierBailleurDto } from './dto/bailleur.dto';

// SYCEBNL SEULEMENT · le bailleur de fonds est une notion de l'Acte uniforme
// SYCEBNL (division 46, fonds d'administration et d'investissement) · en
// SYSCOHADA le 46 porte les apporteurs, associés et le groupe.
@ReferentielsAutorises(Referentiel.SYCEBNL)
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@Controller('bailleurs')
export class BailleurController {
  constructor(private readonly bailleurService: BailleurService) {}

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser, @Query('actifsSeuls') actifsSeuls?: string) {
    return this.bailleurService.lister(user.tenantId, actifsSeuls === 'true');
  }

  // Création/modification réservées à l'admin, comme le plan de comptes et
  // le plan des tiers (un bailleur structure la Note 9 : le laisser modifiable
  // par un profil lecture seule était une omission, corrigée à l'audit).
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerBailleurDto) {
    return this.bailleurService.creer(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Patch(':id')
  async modifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModifierBailleurDto,
  ) {
    return this.bailleurService.modifier(user.tenantId, id, dto);
  }
}

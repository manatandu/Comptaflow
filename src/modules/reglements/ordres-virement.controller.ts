import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrdresVirementService } from './ordres-virement.service';

export class AnnulerOrdreDto {
  @IsString() @MinLength(1) @MaxLength(200) motif!: string;
}

/**
 * Les ordres de virement, onglet de la fenêtre Règlement des tiers. Lus par
 * tous ; imprimer et annuler reviennent au cabinet qui tient le dossier, comme
 * le règlement lui-même. Aucune route de création ici · l'ordre naît avec ses
 * pièces (POST /reglements).
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('ordres-virement')
export class OrdresVirementController {
  constructor(private readonly ordres: OrdresVirementService) {}

  @Get()
  lister(@CurrentUser() user: AuthenticatedUser) {
    return this.ordres.lister(user.tenantId);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordres.detail(user.tenantId, id);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/impression')
  imprimer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordres.imprimer(user.tenantId, id, user.email);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/annulation')
  annuler(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AnnulerOrdreDto) {
    return this.ordres.annuler(user.tenantId, id, user.email, dto.motif);
  }
}

import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { EXERCICE_REQUIS } from '../../common/exercice-requis';
import { DesactualisationDemantelementDto, RepriseDemantelementDto } from './dto/immobilisation.dto';
import { DemantelementService } from './demantelement.service';

/**
 * La provision pour démantèlement d'un composant (lot 15) · AUDCIF Titre VIII
 * ch. 6, aux deux référentiels. Écritures aux mêmes droits que les autres
 * gestes de la fiche ; lectures ouvertes.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('immobilisations')
export class DemantelementController {
  constructor(private readonly service: DemantelementService) {}

  /** § 2.3 · la valeur actualisée proposée à l'entrée, coût × (1 + t)^-n. */
  @Get('demantelement/valeur-actualisee')
  valeurActualisee(@Query('coutFutur') cout: string, @Query('tauxPourcent') taux: string, @Query('annees') annees: string) {
    return this.service.valeurActualisee(Number(cout), Number(taux), Number(annees));
  }

  @Get(':id/demantelement')
  etat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.service.etat(user.tenantId, id, exerciceId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/demantelement/desactualisation')
  desactualiser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DesactualisationDemantelementDto,
  ) {
    return this.service.desactualiser(user.tenantId, user.userId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/demantelement/reprise')
  reprendre(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RepriseDemantelementDto) {
    return this.service.reprendre(user.tenantId, user.userId, id, dto);
  }
}

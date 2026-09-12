import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SensFacture } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { FacturationService } from './facturation.service';
import { EnregistrerFactureDto } from './dto/facture.dto';

/**
 * PAS DE CLOISONNEMENT PAR RÉFÉRENTIEL, ET CE N'EST PAS UN OUBLI.
 *
 * La §6 de CLAUDE.md impose de cloisonner aux DEUX bouts tout module propre à
 * un référentiel · encore faut-il qu'il le soit. Celui-ci ne l'est pas :
 * l'obligation de facturer vient de la loi de procédures fiscales (art. 23),
 * qui vise « les redevables de l'Impôt sur les Sociétés et de la Taxe sur la
 * Valeur Ajoutée ainsi que, le cas échéant, ceux de l'Impôt sur le Revenu des
 * Personnes Physiques » · pas les tenants d'un référentiel comptable. Une ASBL
 * qui facture une activité accessoire assujettie à la TVA y est tenue comme une
 * SARL, et lui fermer la fenêtre lui retirerait l'état détaillé dont sa
 * déduction dépend.
 *
 * C'est donc le premier module de la gestion commerciale à être COMMUN, alors
 * que le §8.4 du plan de construction annonçait la gestion commerciale comme
 * propre au SYSCOHADA. Le §8.4 parlait du DEVIS et de la COMMANDE CLIENT, qui
 * le sont ; la facture, elle, est une obligation fiscale des deux.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('facturation')
export class FacturationController {
  constructor(private readonly facturation: FacturationService) {}

  @Get()
  lister(@CurrentUser() user: AuthenticatedUser, @Query('sens') sens?: SensFacture) {
    return this.facturation.lister(user.tenantId, { sens });
  }

  @Get('etat-detaille')
  etatDetaille(@CurrentUser() user: AuthenticatedUser, @Query('periode') periode: string) {
    return this.facturation.etatDetaille(user.tenantId, periode);
  }

  @Post()
  enregistrer(@CurrentUser() user: AuthenticatedUser, @Body() dto: EnregistrerFactureDto) {
    return this.facturation.enregistrer(user.tenantId, dto);
  }

  @Delete(':id')
  supprimer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.facturation.supprimer(user.tenantId, id);
  }
}

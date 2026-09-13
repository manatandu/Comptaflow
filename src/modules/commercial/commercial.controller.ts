import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Referentiel } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CommercialService } from './commercial.service';
import { EmettreDevisDto, EnregistrerReponseDto, RevoquerDevisDto } from './dto/devis.dto';

/**
 * CLOISONNÉ AU SYSCOHADA, et cette fois le §8.4 du plan de construction avait
 * raison · contrairement à la facture, qui est une obligation fiscale des deux
 * référentiels.
 *
 * LA RAISON N'EST PAS QU'UNE ASBL NE VENDRAIT RIEN. Elle peut proposer un prix.
 * C'est que le Livre 8 de l'AUDCG ne régit que la vente de marchandises ENTRE
 * COMMERÇANTS (art. 234), et qu'une association n'est pas commerçante : la loi
 * n° 004/2001, art. 1er, dit qu'elle « ne se livre pas à des opérations
 * industrielles ou commerciales, si ce n'est à titre accessoire ». Lui servir
 * cette fenêtre lui appliquerait des règles de formation du contrat, des
 * délais et des qualifications qui ne la régissent pas · c'est le § 10 bis.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@ReferentielsAutorises(Referentiel.SYSCOHADA)
@Controller('commercial/devis')
export class CommercialController {
  constructor(private readonly commercial: CommercialService) {}

  @Get()
  lister(@CurrentUser() user: AuthenticatedUser, @Query('dateReference') dateReference?: string) {
    return this.commercial.lister(user.tenantId, { dateReference });
  }

  @Post()
  emettre(@CurrentUser() user: AuthenticatedUser, @Body() dto: EmettreDevisDto) {
    return this.commercial.emettre(user.tenantId, dto);
  }

  @Patch(':id/reponse')
  enregistrerReponse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: EnregistrerReponseDto,
  ) {
    return this.commercial.enregistrerReponse(user.tenantId, id, dto);
  }

  @Patch(':id/revocation')
  revoquer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RevoquerDevisDto) {
    return this.commercial.revoquer(user.tenantId, id, dto);
  }
}

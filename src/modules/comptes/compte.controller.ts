import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CompteService } from './compte.service';
import { CreerCompteDto, ModifierCompteDto } from './dto/creer-compte.dto';
import { ClasseCompte, RoleUtilisateur, TypeCompteDetailTotal } from '@prisma/client';

// Consultation ouverte aux trois rôles ; gestion du plan de comptes réservée
// à l'admin (@Roles ci-dessous, méthode par méthode).
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('comptes')
export class CompteController {
  constructor(private readonly compteService: CompteService) {}

  @Get()
  async lister(
    @CurrentUser() user: AuthenticatedUser,
    @Query('classe') classe?: ClasseCompte,
    @Query('recherche') recherche?: string,
    @Query('actifsSeuls') actifsSeuls?: string,
    // Filtre les comptes Total (regroupement, §3.1) — utile aux sélecteurs
    // de saisie, qui ne doivent proposer que des comptes mouvementables
    // (EcritureService.creer rejette de toute façon une écriture sur un
    // compte Total, mais autant ne pas le proposer dans la liste).
    @Query('typeCompte') typeCompte?: TypeCompteDetailTotal,
  ) {
    return this.compteService.lister(user.tenantId, {
      classe,
      recherche,
      actifsSeuls: actifsSeuls === 'true',
      typeCompte,
    });
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerCompteDto) {
    return this.compteService.creer(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Patch(':id')
  async modifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModifierCompteDto,
  ) {
    return this.compteService.modifier(user.tenantId, id, dto);
  }
}

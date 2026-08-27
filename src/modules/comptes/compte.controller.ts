import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CompteService } from './compte.service';
import { CreerCompteDto, ModifierCompteDto } from './dto/creer-compte.dto';
import { ClasseCompte } from '@prisma/client';

@UseGuards(JwtAuthGuard, LicenceGuard)
@Controller('comptes')
export class CompteController {
  constructor(private readonly compteService: CompteService) {}

  @Get()
  async lister(
    @CurrentUser() user: AuthenticatedUser,
    @Query('classe') classe?: ClasseCompte,
    @Query('recherche') recherche?: string,
    @Query('actifsSeuls') actifsSeuls?: string,
  ) {
    return this.compteService.lister(user.tenantId, {
      classe,
      recherche,
      actifsSeuls: actifsSeuls === 'true',
    });
  }

  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerCompteDto) {
    return this.compteService.creer(user.tenantId, dto);
  }

  @Patch(':id')
  async modifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModifierCompteDto,
  ) {
    return this.compteService.modifier(user.tenantId, id, dto);
  }
}

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { JournalService } from './journal.service';
import { CreerJournalDto, ModifierJournalDto } from './dto/journal.dto';
import { RoleUtilisateur } from '@prisma/client';

@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('journaux')
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  // Consultation ouverte à tous les rôles authentifiés (nécessaire à la saisie).
  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser, @Query('actifsSeuls') actifsSeuls?: string) {
    return this.journalService.lister(user.tenantId, actifsSeuls === 'true');
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerJournalDto) {
    return this.journalService.creer(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Patch(':id')
  async modifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModifierJournalDto,
  ) {
    return this.journalService.modifier(user.tenantId, id, dto);
  }
}

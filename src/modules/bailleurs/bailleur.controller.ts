import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { BailleurService } from './bailleur.service';
import { CreerBailleurDto, ModifierBailleurDto } from './dto/bailleur.dto';

@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('bailleurs')
export class BailleurController {
  constructor(private readonly bailleurService: BailleurService) {}

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser, @Query('actifsSeuls') actifsSeuls?: string) {
    return this.bailleurService.lister(user.tenantId, actifsSeuls === 'true');
  }

  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerBailleurDto) {
    return this.bailleurService.creer(user.tenantId, dto);
  }

  @Patch(':id')
  async modifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModifierBailleurDto,
  ) {
    return this.bailleurService.modifier(user.tenantId, id, dto);
  }
}

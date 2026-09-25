import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { BanquesService } from './banques.service';
import { BanqueDto, LibelleDto, ModifierBanqueDto, ModifierLibelleDto, RibDto } from './dto/banques.dto';

/**
 * Structures du dossier, comme les codes journaux · lues par tous, écrites
 * par l'administrateur. Les libellés sont lus par la saisie.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller()
export class BanquesController {
  constructor(private readonly service: BanquesService) {}

  @Get('banques')
  lister(@CurrentUser() user: AuthenticatedUser) {
    return this.service.lister(user.tenantId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post('banques')
  creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: BanqueDto) {
    return this.service.creer(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Patch('banques/:id')
  modifier(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ModifierBanqueDto) {
    return this.service.modifier(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Delete('banques/:id')
  supprimer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.supprimer(user.tenantId, id);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post('banques/:id/ribs')
  creerRib(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RibDto) {
    return this.service.creerRib(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Patch('ribs-banque/:id')
  modifierRib(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RibDto) {
    return this.service.modifierRib(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Delete('ribs-banque/:id')
  supprimerRib(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.supprimerRib(user.tenantId, id);
  }

  @Get('libelles-ecriture')
  listerLibelles(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listerLibelles(user.tenantId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post('libelles-ecriture')
  creerLibelle(@CurrentUser() user: AuthenticatedUser, @Body() dto: LibelleDto) {
    return this.service.creerLibelle(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Patch('libelles-ecriture/:id')
  modifierLibelle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ModifierLibelleDto) {
    return this.service.modifierLibelle(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Delete('libelles-ecriture/:id')
  supprimerLibelle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.supprimerLibelle(user.tenantId, id);
  }
}

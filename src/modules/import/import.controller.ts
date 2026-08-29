import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ImportService } from './import.service';
import { AnalyserImportDto, ExecuterImportDto } from './dto/import.dto';
import { RoleUtilisateur } from '@prisma/client';

/**
 * Un import écrit dans le plan de comptes et pose des écritures : c'est un
 * acte de structure autant que de saisie, réservé à l'admin du dossier.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  /** Lit le fichier et propose une correspondance de colonnes. N'écrit rien. */
  @Post('analyser')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async analyser(@Body() dto: AnalyserImportDto) {
    return this.importService.analyser(dto);
  }

  /** Exécute l'import, ou le simule si `simulation` est vrai. */
  @Post('executer')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async executer(@CurrentUser() user: AuthenticatedUser, @Body() dto: ExecuterImportDto) {
    return this.importService.executer(user.tenantId, user.userId, dto);
  }
}

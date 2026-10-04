import { Body, Controller, Get, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { EXERCICE_REQUIS } from '../../common/exercice-requis';
import { ReevaluerImmobilisationsDto, RepriseProvisionReevaluationDto } from './dto/immobilisation.dto';
import { ReevaluationBilanService } from './reevaluation-bilan.service';

/**
 * Réévaluation des immobilisations (lot 14) · AUDCIF art. 35, 62 à 65,
 * Titre VIII ch. 28 ; SYCEBNL Partie 3 ch. 1 § 2.1.1.3. Ouverte aux deux
 * référentiels (l'art. 3 du SYCEBNL n'exclut ni l'art. 35 ni les art. 62 à
 * 65), chacun avec ses comptes (`reevaluation-bilan.ts`). L'opération et la
 * reprise de la provision passent une écriture · mêmes droits que les autres
 * opérations sur les biens.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('immobilisations')
export class ReevaluationBilanController {
  constructor(private readonly service: ReevaluationBilanService) {}

  /** Le périmètre de l'exercice et la réévaluation déjà enregistrée, s'il y en a une. */
  @Get('reevaluation-bilan')
  perimetre(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.service.perimetre(user.tenantId, exerciceId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('reevaluation-bilan')
  reevaluer(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReevaluerImmobilisationsDto) {
    return this.service.reevaluer(user.tenantId, user.userId, dto);
  }

  /** La reprise proposée de la provision spéciale (ch. 28 § 4.2.4.2) · rien n'est passé. */
  @Get('reevaluation-bilan/reprise-provision')
  propositionReprise(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.service.propositionRepriseProvision(user.tenantId, exerciceId);
  }

  /**
   * Ligne A15 · ce que les notes annexes doivent montrer (ch. 28 § 8 ; loi
   * n° 23/053, art. 135), servi en lecture seule à côté de la NOTE 3E ou 5H.
   */
  @Get('reevaluation-bilan/note')
  note(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.service.noteReevaluations(user.tenantId, exerciceId);
  }

  /** Ligne A15 · les éléments de la déclaration spéciale (loi n° 23/053, art. 136 et 137), une édition. */
  @Get('reevaluation-bilan/declaration-speciale')
  declarationSpeciale(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.service.declarationSpeciale(user.tenantId, exerciceId);
  }

  /** Ligne A15 · ce que la sortie du bien fera de son écart de réévaluation (ch. 28 § 6 ; loi n° 23/053, art. 133 al. 3). */
  @Get('reevaluation-bilan/ecart-a-la-sortie')
  ecartALaSortie(@CurrentUser() user: AuthenticatedUser, @Query('immobilisationId', new ParseUUIDPipe({ version: '4' })) immobilisationId: string) {
    return this.service.ecartALaSortie(user.tenantId, immobilisationId);
  }

  /** Ligne A15 · les réserves non distribuables qui reçoivent l'écart d'un bien sorti (ch. 28 § 6). */
  @Get('reevaluation-bilan/comptes-reserve')
  comptesReserve(
    @CurrentUser() user: AuthenticatedUser,
    // Liste de choix · seules les réserves retenues ou utilisées (comptes-proposes.ts).
    @Query('retenus') retenus?: string,
  ) {
    return this.service.comptesReserve(user.tenantId, retenus === 'true');
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('reevaluation-bilan/reprise-provision')
  passerReprise(@CurrentUser() user: AuthenticatedUser, @Body() dto: RepriseProvisionReevaluationDto) {
    return this.service.passerRepriseProvision(user.tenantId, user.userId, dto);
  }
}

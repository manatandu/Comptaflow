import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { DonationService } from './donation.service';
import {
  AnnulerDonationDto,
  FiltreRegistreDto,
  InscrireDonationDto,
  ModifierDonationDto,
  SignerDonationDto,
} from './dto/donation.dto';

/**
 * Un `@Query` scalaire échappe au ValidationPipe global, et `undefined`
 * traverserait jusqu'à Prisma qui IGNORE purement et simplement un champ
 * `undefined` : le filtre d'exercice disparaîtrait sans bruit et le rapport
 * porterait sur tous les exercices du dossier en se présentant comme celui
 * d'un seul. Même garde que dans ExportController.
 */
const EXERCICE_REQUIS = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("Le paramètre exerciceId est requis et doit être un identifiant d'exercice valide"),
});

/**
 * Registre des donateurs (art. 17-18). Consultation ouverte aux trois rôles
 * · l'auditeur qui doit « constater l'existence du registre » (art. 18) est
 * typiquement en LECTURE_SEULE. Tenue réservée à ADMIN_CABINET/COMPTABLE,
 * comme la saisie d'écritures.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('registre-donateurs')
export class DonationController {
  constructor(private readonly donationService: DonationService) {}

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser, @Query() filtre: FiltreRegistreDto) {
    return this.donationService.lister(user.tenantId, filtre);
  }

  /** Art. 18 · constatations qui fondent l'avis de l'auditeur ou la déclaration des dirigeants. */
  @Get('rapport-conformite')
  async rapportConformite(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.donationService.rapportConformite(user.tenantId, exerciceId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post()
  async inscrire(@CurrentUser() user: AuthenticatedUser, @Body() dto: InscrireDonationDto) {
    return this.donationService.inscrire(user.tenantId, user.userId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Patch(':id')
  async modifier(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ModifierDonationDto) {
    return this.donationService.modifier(user.tenantId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Patch(':id/signature')
  async signer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SignerDonationDto) {
    return this.donationService.signer(user.tenantId, id, dto);
  }

  /**
   * Il n'y a délibérément AUCUN `@Delete` sur ce contrôleur : supprimer une
   * ligne ouvrirait un trou dans une numérotation que l'article 17 veut
   * continue. L'annulation est la seule sortie possible.
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Patch(':id/annulation')
  async annuler(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AnnulerDonationDto) {
    return this.donationService.annuler(user.tenantId, id, dto);
  }
}

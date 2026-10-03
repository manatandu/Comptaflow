import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Referentiel, RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { FiscaliteService } from './fiscalite.service';
import {
  AnnulerConstatImpotDto,
  CreerRetraitementDto,
  ModifierDossierFiscalDto,
  ModifierRetraitementDto,
  PasserConstatImpotDto,
} from './dto/fiscalite.dto';
import { ConstatImpotService } from './constat-impot.service';
import { ReserveAuComptable } from '../../common/decorators/acces-roles-cantonnes.decorator';
import { EXERCICE_REQUIS } from '../../common/exercice-requis';

// LA DÉTERMINATION DU RÉSULTAT FISCAL lit une balance SYSCOHADA · la fenêtre
// n'existe que pour un dossier SYSCOHADA, et la route le refuse aussi,
// masquer sans refuser laissant passer un appel direct.
//
// Le motif du refus n'est PAS que l'exemption de l'art. 5 de la loi
// n° 23/053 serait acquise à tout dossier SYCEBNL : elle ne l'est qu'au titre
// du point 3, et le point 5 (établissements d'utilité publique et ONG) la
// subordonne à l'arrêté n° 007/2025. Voir exemption-is-ebnl.ts, et la route
// `exemption-is` ci-dessous, seule ouverte au SYCEBNL.
@ReferentielsAutorises(Referentiel.SYSCOHADA)
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@Controller('fiscalite')
export class FiscaliteController {
  constructor(
    private readonly fiscalite: FiscaliteService,
    private readonly constats: ConstatImpotService,
  ) {}

  /**
   * LE STATUT D'EXEMPTION D'IS D'UNE ENTITÉ NON LUCRATIVE · à rebours du reste
   * du contrôleur, cette route est ouverte au SEUL SYCEBNL.
   *
   * Le décorateur de méthode l'emporte sur celui de la classe
   * (`Reflector.getAllAndOverride`, handler d'abord, voir
   * common/guards/referentiel.guard.ts). C'est voulu : refuser une fenêtre à
   * un dossier sans jamais lui dire à quelles conditions son exemption tient,
   * c'est la lui laisser croire acquise.
   */
  @Get('exemption-is')
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  async exemptionIs(@CurrentUser() user: AuthenticatedUser) {
    return this.fiscalite.exemptionIs(user.tenantId);
  }

  /** Le catalogue des retraitements, article par article. */
  @Get('catalogue')
  catalogue() {
    return this.fiscalite.catalogue();
  }

  /**
   * Ce que les comptes qualifiés par le cabinet appellent comme retraitement
   * sur cet exercice · des PROPOSITIONS, que le comptable reprend ou ignore.
   * Rien n'est créé ici : les routes d'écriture restent celles ci-dessous.
   */
  @Get('exercices/:exerciceId/propositions-retraitements')
  async propositions(@CurrentUser() user: AuthenticatedUser, @Param('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.fiscalite.propositionsRetraitements(user.tenantId, exerciceId);
  }

  @Get('resultat-fiscal')
  async resultatFiscal(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.fiscalite.resultatFiscal(user.tenantId, exerciceId);
  }

  @Post('exercices/:exerciceId/retraitements')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async ajouterRetraitement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('exerciceId', EXERCICE_REQUIS) exerciceId: string,
    @Body() dto: CreerRetraitementDto,
  ) {
    return this.fiscalite.ajouterRetraitement(user.tenantId, exerciceId, dto);
  }

  @Patch('retraitements/:id')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async modifierRetraitement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModifierRetraitementDto,
  ) {
    return this.fiscalite.modifierRetraitement(user.tenantId, id, dto);
  }

  @Delete('retraitements/:id')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async supprimerRetraitement(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.fiscalite.supprimerRetraitement(user.tenantId, id);
  }

  /**
   * L'ÉCRITURE DE L'IMPÔT SUR LE RÉSULTAT (ligne A11) · proposée, jamais
   * passée d'office. SYSCOHADA seul par la classe (`ReferentielGuard`) ; une
   * EBNL est exemptée (loi n° 23/053, art. 5) et son 89 n'existe pas.
   */
  @Get('exercices/:exerciceId/ecriture-impot')
  async ecritureImpot(@CurrentUser() user: AuthenticatedUser, @Param('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.constats.etat(user.tenantId, exerciceId);
  }

  /**
   * Le clic · le montant est REJOUÉ par le serveur, le corps n'en porte aucun. Au brouillard.
   * Réservé au comptable, comme la revue des créances douteuses (A7) · le geste
   * ne se réduit pas à une saisie, le cabinet y ATTESTE l'assujettissement et
   * y DÉCIDE l'imputation des acomptes.
   */
  @Post('exercices/:exerciceId/ecriture-impot')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @ReserveAuComptable()
  async passerEcritureImpot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('exerciceId', EXERCICE_REQUIS) exerciceId: string,
    @Body() dto: PasserConstatImpotDto,
  ) {
    return this.constats.passer(user.tenantId, user.userId, exerciceId, dto);
  }

  /**
   * L'annulation (AUDCIF art. 20, al. 2) · une écriture validée s'inscrit en
   * négatif, geste du comptable seul, comme la correction.
   */
  @Post('exercices/:exerciceId/ecriture-impot/annuler')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @ReserveAuComptable()
  async annulerEcritureImpot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('exerciceId', EXERCICE_REQUIS) exerciceId: string,
    @Body() dto: AnnulerConstatImpotDto,
  ) {
    return this.constats.annuler(user.tenantId, user.userId, exerciceId, dto);
  }

  @Patch('exercices/:exerciceId/dossier')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async modifierDossier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('exerciceId', EXERCICE_REQUIS) exerciceId: string,
    @Body() dto: ModifierDossierFiscalDto,
  ) {
    return this.fiscalite.modifierDossier(user.tenantId, exerciceId, dto);
  }
}

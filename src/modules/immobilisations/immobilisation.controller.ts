import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ImmobilisationService } from './immobilisation.service';
import {
  CreerImmobilisationDto,
  CreerLocationAcquisitionDto,
  EchangerImmobilisationDto,
  SimulerLocationAcquisitionDto,
  AffecterLieuDto,
  LieuBienDto,
  PasserDotationDto,
  SaisirConsommationDto,
  SortirImmobilisationDto,
  DepreciationDto,
  ReclasserImmobilisationDto,
  RenouvelerComposantDto,
  MiseEnServiceDto,
  RecevoirLegsDto,
  AcquerirAPrixGlobalDto,
  RemplacerPartieDto,
  DureeLimiteeDto,
  ReviserPlanDto,
  IncorporerCoutsEmpruntDto,
} from './dto/immobilisation.dto';
import { RoleUtilisateur, StatutImmobilisation, TypeComposant } from '@prisma/client';
import { EXERCICE_REQUIS } from '../../common/exercice-requis';

// Consultation ouverte aux trois rôles ; gestion (familles, création,
// dotation, sortie) réservée à ADMIN_CABINET/COMPTABLE · même règle que la
// saisie d'écritures, dont ce module n'est jamais qu'une façade guidée.
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('immobilisations')
export class ImmobilisationController {
  constructor(private readonly immobilisationService: ImmobilisationService) {}

  /**
   * TABLEAU DES IMMOBILISATIONS · une ligne par bien, groupée par compte
   * d'imputation avec sous-totaux. C'est le groupement qui permet de recouper
   * l'état avec la balance, compte par compte.
   */
  @Get('tableau')
  async tableau(@CurrentUser() user: AuthenticatedUser, @Query('dateArret') dateArret?: string) {
    return this.immobilisationService.tableauImmobilisations(user.tenantId, { dateArret });
  }

  /**
   * TABLEAU DES AMORTISSEMENTS · douze colonnes mensuelles. Un total annuel
   * cache le mois d'entrée du bien, celui de sa sortie, et celui où il achève
   * de s'amortir.
   */
  @Get('tableau-amortissements')
  async tableauAmortissements(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.immobilisationService.tableauAmortissements(user.tenantId, exerciceId);
  }

  /**
   * LOT 13 · les coûts d'emprunt incorporés de l'exercice, pour les Notes
   * annexes (AUDCIF Titre VIII ch. 7, section 3) · montant et taux.
   */
  @Get('couts-emprunt-incorpores')
  async coutsEmpruntIncorpores(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.immobilisationService.coutsEmpruntIncorpores(user.tenantId, exerciceId);
  }

  @Get('familles')
  async listerFamilles(@CurrentUser() user: AuthenticatedUser) {
    return this.immobilisationService.listerFamilles(user.tenantId);
  }

  // LA FAMILLE NE SE SAISIT PLUS (2026-10-01, décision de Manasse) · elle
  // suit le compte du bien (compte-du-bien.ts), trouvée ou créée par `creer`.
  // Les routes de création et de modification sont retirées avec leur écran ·
  // une route d'écriture sans geste resterait ouverte à un appel direct.

  // Lieux des biens · la STRUCTURE (créer, supprimer) est à
  // l'administrateur, comme les familles ; déplacer un bien est un geste de
  // tenue, ouvert au comptable.
  @Get('lieux')
  async listerLieux(@CurrentUser() user: AuthenticatedUser) {
    return this.immobilisationService.listerLieux(user.tenantId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post('lieux')
  async creerLieu(@CurrentUser() user: AuthenticatedUser, @Body() dto: LieuBienDto) {
    return this.immobilisationService.creerLieu(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Delete('lieux/:id')
  async supprimerLieu(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.immobilisationService.supprimerLieu(user.tenantId, id);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Patch(':id/lieu')
  async affecterLieu(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AffecterLieuDto) {
    return this.immobilisationService.affecterLieu(user.tenantId, id, dto.lieuId ?? null);
  }

  /**
   * Mise en service d'un bien acquis et pas encore en état de fonctionner
   * (AUDCIF art. 45) · une fois, jamais avant l'acquisition. Geste de tenue,
   * ouvert au comptable comme la dotation qu'il déclenche.
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Patch(':id/mise-en-service')
  async mettreEnService(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: MiseEnServiceDto) {
    return this.immobilisationService.mettreEnService(user.tenantId, user.userId, id, dto);
  }

  /**
   * Le barème de l'arrêté n° 013/CAB/MIN/FINANCES/2025 (art. 2), servi tel
   * quel · l'écran en tire la durée proposée et l'écart qu'il signale. Aucune
   * donnée du dossier n'y entre, la lecture est ouverte à tous les rôles.
   */
  @Get('bareme-fiscal')
  async baremeFiscal(@CurrentUser() user: AuthenticatedUser) {
    return this.immobilisationService.baremeFiscal(user.tenantId);
  }

  /**
   * Les comptes qui peuvent porter un bien, avec les comptes 28 et 68 que le
   * plan leur donne et les sections du barème proposées (compte-du-bien.ts).
   */
  @Get('comptes-du-bien')
  async comptesDuBien(@CurrentUser() user: AuthenticatedUser) {
    return this.immobilisationService.comptesDuBien(user.tenantId);
  }

  /**
   * Les comptes de fonds affectés (162 à 164) qui reprennent un bien à la fin
   * d'un projet de développement (SYCEBNL
   * Partie 3 ch. 3 § 2.5). Hors projet, la liste est vide et dit pourquoi.
   */
  @Get('comptes-fonds-projet')
  async comptesFondsProjet(@CurrentUser() user: AuthenticatedUser) {
    return this.immobilisationService.comptesFondsProjet(user.tenantId);
  }

  /** Seuil du petit matériel (arrêté n° 014/2025, art. 2), en francs, à une date. */
  @Get('seuil-petit-materiel')
  async seuilPetitMateriel(@CurrentUser() user: AuthenticatedUser, @Query('date') date?: string) {
    if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) throw new BadRequestException('Date attendue (AAAA-MM-JJ)');
    return this.immobilisationService.seuilPetitMateriel(user.tenantId, date);
  }

  /** Contreparties admises pour une acquisition, par compte du bien ou par famille. */
  @Get('contreparties-acquisition')
  async contrepartiesAcquisition(
    @CurrentUser() user: AuthenticatedUser,
    @Query('familleId', new ParseUUIDPipe({ optional: true })) familleId: string | undefined,
    @Query('compteImmobilisationId', new ParseUUIDPipe({ optional: true })) compteImmobilisationId: string | undefined,
    // Le type d'un composant ouvre sa propre contrepartie (1984 pour un
    // démantèlement, AUDCIF Titre VII, classe 2) · un type inconnu est refusé.
    @Query('typeComposant') typeComposant?: string,
  ) {
    if (typeComposant !== undefined && !(Object.values(TypeComposant) as string[]).includes(typeComposant)) {
      throw new BadRequestException(`Type de composant inconnu : ${typeComposant}`);
    }
    if (!!familleId === !!compteImmobilisationId) {
      throw new BadRequestException('Indiquez le compte du bien (ou la famille), un seul des deux.');
    }
    return this.immobilisationService.contrepartiesAcquisition(
      user.tenantId,
      { familleId, compteImmobilisationId },
      (typeComposant as TypeComposant | undefined) ?? null,
    );
  }

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser, @Query('statut') statut?: StatutImmobilisation) {
    return this.immobilisationService.lister(user.tenantId, statut);
  }

  /**
   * L'échéancier d'un contrat de location-acquisition, sans rien poster · un
   * POST pour porter le contrat entier, réservé à qui peut ensuite le saisir.
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('location-acquisition/simulation')
  async simulerLocationAcquisition(@CurrentUser() user: AuthenticatedUser, @Body() dto: SimulerLocationAcquisitionDto) {
    return this.immobilisationService.simulerLocationAcquisition(user.tenantId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('location-acquisition')
  async creerEnLocationAcquisition(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerLocationAcquisitionDto) {
    return this.immobilisationService.creerEnLocationAcquisition(user.tenantId, user.userId, dto);
  }

  /** Lot 7 · un legs d'immobilisations grevé de dettes (SYCEBNL Partie 3 ch. 2 § 1.2.2). */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('legs')
  async recevoirLegs(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecevoirLegsDto) {
    return this.immobilisationService.recevoirLegs(user.tenantId, user.userId, dto);
  }

  /** Lot 8 · des biens acquis pour un prix global, ventilé (AUDCIF art. 38). */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('prix-global')
  async acquerirAPrixGlobal(@CurrentUser() user: AuthenticatedUser, @Body() dto: AcquerirAPrixGlobalDto) {
    return this.immobilisationService.acquerirAPrixGlobal(user.tenantId, user.userId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerImmobilisationDto) {
    return this.immobilisationService.creer(user.tenantId, user.userId, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/dotation')
  async passerDotation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PasserDotationDto,
  ) {
    return this.immobilisationService.passerDotation(user.tenantId, user.userId, id, dto);
  }

  /**
   * RECONSTITUER UN COMPOSANT « RÉVISIONS MAJEURES » JAMAIS IDENTIFIÉ · AUDCIF
   * Titre VIII ch. 5 § 1. LECTURE SEULE : le calcul est rendu avec ses termes,
   * rien n'est écrit ni posté.
   */
  @Get(':id/reconstitution-revision-majeure')
  async estimerRevisionMajeure(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('coutRevisionActuel') coutRevisionActuel: string,
    @Query('intervalleRevisionsAns') intervalleRevisionsAns: string,
    @Query('dateReconstitution') dateReconstitution: string,
    @Query('derniereRevisionRealiseeLe') derniereRevisionRealiseeLe?: string,
  ) {
    return this.immobilisationService.estimerRevisionMajeure(user.tenantId, id, {
      coutRevisionActuel: Number(coutRevisionActuel),
      intervalleRevisionsAns: Number(intervalleRevisionsAns),
      dateReconstitution,
      derniereRevisionRealiseeLe,
    });
  }

  /**
   * LE RELEVÉ D'UNITÉS D'ŒUVRE D'UN EXERCICE · AUDCIF art. 45, mode des
   * unités de production. C'est le seul chiffre du plan d'amortissement
   * qu'aucune comptabilité ne porte : il se saisit, avec sa source.
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/consommation')
  async saisirConsommation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaisirConsommationDto,
  ) {
    return this.immobilisationService.saisirConsommation(user.tenantId, user.userId, id, dto);
  }

  /**
   * DÉPRÉCIATION · dotation ou reprise, AUDCIF art. 46 et Titre VIII ch. 12 ;
   * SYCEBNL, Partie 2 ch. 3, fiche du COMPTE 29. Commune aux deux
   * référentiels : chacun l'impose dans son texte, aucun n'est transposé.
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/depreciation')
  async deprecier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DepreciationDto,
  ) {
    return this.immobilisationService.enregistrerDepreciation(user.tenantId, user.userId, id, dto);
  }

  /**
   * LOT 12 · le plafond d'une reprise de dépréciation (AUDCIF Titre VIII
   * ch. 12 § 2.4.2) · valeur nette, valeur sans dépréciation, plan d'origine
   * rejoué, et reprise au plus. Lecture seule, montrée avant la saisie.
   */
  @Get(':id/plafond-reprise-depreciation')
  async plafondReprise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.immobilisationService.plafondReprise(user.tenantId, id, exerciceId);
  }

  /**
   * RENOUVELLEMENT D'UN COMPOSANT · AUDCIF Titre VIII ch. 4 § 4.1. Une seule
   * route pour les deux mouvements : sortir l'ancien de l'actif ET porter le
   * nouveau. Les séparer laisserait deux ascenseurs au bilan pour une cage.
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/renouvellement')
  async renouveler(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RenouvelerComposantDto,
  ) {
    return this.immobilisationService.renouveler(user.tenantId, user.userId, id, dto);
  }

  /**
   * Lot 8 · le remplacement imprévu d'une partie non identifiée à l'origine
   * (AUDCIF Titre VIII ch. 4 § 4.2) · la partie se détache de la structure à
   * sa valeur estimée, puis se renouvelle comme un composant.
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/remplacement-imprevu')
  async remplacerPartieNonIdentifiee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RemplacerPartieDto,
  ) {
    return this.immobilisationService.remplacerPartieNonIdentifiee(user.tenantId, user.userId, id, dto);
  }

  /** Lot 10 · la durée d'un incorporel non limitée devient limitée (AUDCIF Titre VIII ch. 2 § 4.2.2). */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/duree-limitee')
  async declarerDureeLimitee(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: DureeLimiteeDto) {
    return this.immobilisationService.declarerDureeLimitee(user.tenantId, id, dto);
  }

  /**
   * LOT 13 · incorporer les coûts d'emprunt au coût d'un actif qualifié
   * (AUDCIF Titre VIII ch. 7) · D compte du bien / C 72 (SYSCOHADA) ou 787
   * (SYCEBNL).
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/couts-emprunt')
  async incorporerCoutsEmprunt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: IncorporerCoutsEmpruntDto) {
    return this.immobilisationService.incorporerCoutsEmprunt(user.tenantId, user.userId, id, dto);
  }

  /**
   * Lot 11 · révision du plan d'amortissement · prospective, ou rétroactive
   * avec la reprise au 798 (fiches des comptes 28 et 79, décision D-24).
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/revision-plan')
  async reviserPlan(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ReviserPlanDto) {
    return this.immobilisationService.reviserPlan(user.tenantId, user.userId, id, dto);
  }

  /** Lot 11 · les révisions du plan, « révélées et quantifiées » (fiche du compte 28). */
  @Get(':id/revisions-plan')
  async revisionsPlan(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.immobilisationService.revisionsPlan(user.tenantId, id);
  }

  /**
   * RECLASSEMENT · le changement d'utilisation du ch. 10 § 2.4.
   *
   * Le bien prend les comptes de sa nouvelle famille et l'écriture vire ce
   * qu'il porte déjà · valeur d'origine, cumul d'amortissement, dépréciation.
   * Aucun montant n'est recalculé : « les transferts […] n'ont pas d'incidence
   * sur la valeur comptable du bien immobilier transféré ».
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/reclassement')
  async reclasser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReclasserImmobilisationDto,
  ) {
    return this.immobilisationService.reclasser(user.tenantId, user.userId, id, dto);
  }

  /** L'échange · sortie de l'ancien bien et entrée du nouveau, en un geste. */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/echange')
  async echanger(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EchangerImmobilisationDto) {
    return this.immobilisationService.echanger(user.tenantId, user.userId, id, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/sortie')
  async sortir(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SortirImmobilisationDto,
  ) {
    return this.immobilisationService.sortir(user.tenantId, user.userId, id, dto);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EcritureService } from './ecriture.service';
import { CreerEcritureDto, ImputationOuvertureDto } from './dto/creer-ecriture.dto';
import { CorrigerEcritureDto } from './dto/corriger-ecriture.dto';
import { ModifierEcritureDto, ValiderEcrituresDto, ValiderJusquaDto } from './dto/brouillard.dto';
import { RoleUtilisateur } from '@prisma/client';

@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('ecritures')
export class EcritureController {
  constructor(private readonly ecritureService: EcritureService) {}

  // LECTURE_SEULE consulte tout ci-dessous mais ne peut pas enregistrer d'écriture.
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerEcritureDto) {
    return this.ecritureService.creer(user.tenantId, user.userId, dto);
  }

  /**
   * IMPUTATION DIRECTE AUX CAPITAUX PROPRES D'OUVERTURE · l'une des deux
   * seules exceptions à la correspondance bilan de clôture / bilan
   * d'ouverture (AUDCIF art. 34 et Titre V ; SYCEBNL art. 16, 4) et cadre
   * conceptuel § 3.3.1.2.4).
   *
   * ADMIN_CABINET seulement, à la différence de la saisie ordinaire. Rompre
   * la correspondance entre deux bilans n'est pas un geste de saisie : c'est
   * une décision sur les méthodes de l'entité ou l'aveu d'une erreur
   * significative, et les deux se justifient en Notes annexes.
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post('imputation-ouverture')
  async imputerOuverture(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImputationOuvertureDto) {
    return this.ecritureService.imputerAuxCapitauxPropresDOuverture(user.tenantId, user.userId, dto);
  }

  /**
   * Correction d'une écriture par INSCRIPTION EN NÉGATIF (art. 20 de l'AUDCIF,
   * repris par la Partie 2 ch. 2). Il n'y a délibérément AUCUNE route de
   * modification ni de suppression d'écriture sur ce contrôleur : « les
   * documents comptables doivent être tenus sans blanc ni altération d'aucune
   * sorte », et la correction s'effectue « exclusivement » par cette voie.
   *
   * Le corps ne porte ni comptes ni montants : ils sont repris de l'écriture
   * corrigée, à l'identique et changés de signe. Le texte impose l'inscription
   * en négatif « des éléments erronés » · ceux-là, pas d'autres.
   */
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post(':id/correction')
  async corriger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CorrigerEcritureDto,
  ) {
    return this.ecritureService.corrigerParInscriptionEnNegatif(user.tenantId, user.userId, id, dto);
  }

  // --- Brouillard et validation -------------------------------------------

  /**
   * État du brouillard · État → Brouillard chez Sage. Signale en plus le
   * retard de centralisation : le SYCEBNL veut les journaux auxiliaires
   * centralisés au moins chaque semaine (Partie 2 ch. 2).
   */
  @Get('brouillard')
  async brouillard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId: string,
    @Query('journalId') journalId?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
  ) {
    return this.ecritureService.brouillard(user.tenantId, { exerciceId, journalId, dateDebut, dateFin });
  }

  /** Modifie une écriture EN BROUILLARD · une écriture validée ne se modifie plus. */
  @Patch(':id')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async modifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModifierEcritureDto,
  ) {
    return this.ecritureService.modifier(user.tenantId, id, dto);
  }

  /** Supprime une écriture EN BROUILLARD. */
  @Delete(':id')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async supprimer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ecritureService.supprimer(user.tenantId, id);
  }

  /** Fait entrer une sélection d'écritures au livre-journal. */
  @Post('valider')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async valider(@CurrentUser() user: AuthenticatedUser, @Body() dto: ValiderEcrituresDto) {
    return this.ecritureService.valider(user.tenantId, user.userId, dto.ecritureIds);
  }

  /** Valide tout le brouillard jusqu'à une date, éventuellement sur un journal. */
  @Post('valider-jusqua')
  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  async validerJusqua(@CurrentUser() user: AuthenticatedUser, @Body() dto: ValiderJusquaDto) {
    return this.ecritureService.validerJusqua(user.tenantId, user.userId, dto);
  }

  /** Journal · voir l'écran « Journal & grand livre » (onglet Journal) du canevas. */
  @Get()
  async lister(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId?: string,
    @Query('journalId') journalId?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('recherche') recherche?: string,
    @Query('inclureBrouillard') inclureBrouillard?: string,
    @Query('limite') limite?: string,
  ) {
    const limiteN = limite ? Math.min(Math.max(parseInt(limite, 10) || 0, 0), 500) : undefined;
    return this.ecritureService.lister(user.tenantId, {
      exerciceId,
      journalId,
      dateDebut,
      dateFin,
      recherche,
      inclureBrouillard: inclureBrouillard !== 'false',
      ...(limiteN ? { limite: limiteN } : {}),
    });
  }

  /** Balance · voir l'onglet Balance du même écran. */
  @Get('balance')
  async balance(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId') exerciceId: string) {
    return this.ecritureService.balance(user.tenantId, exerciceId);
  }

  /** Grand livre d'un compte · voir l'onglet Grand livre du même écran. */
  /** Balance âgée · échéances non lettrées des comptes 40/41 par tranches de retard. */
  /**
   * ÉCHÉANCIER DE TRÉSORERIE · ce qui va tomber et ce qu'il restera. Distinct
   * de la balance âgée, qui regarde en arrière (voir EcritureService).
   */
  @Get('echeancier')
  async echeancier(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId: string,
    @Query('dateReference') dateReference?: string,
  ) {
    return this.ecritureService.echeancier(user.tenantId, { exerciceId, dateReference });
  }

  @Get('balance-agee')
  async balanceAgee(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId: string,
    @Query('dateReference') dateReference?: string,
    @Query('type') type?: 'CLIENTS_41' | 'FOURNISSEURS' | 'TOUS',
  ) {
    return this.ecritureService.balanceAgee(user.tenantId, { exerciceId, dateReference, type });
  }

  /**
   * BALANCE AUXILIAIRE · à ne pas confondre avec la balance âgée ci-dessus.
   * L'âgée ventile un solde par tranche de retard ; l'auxiliaire porte les
   * mouvements de la période tiers par tiers, et c'est elle qu'un réviseur
   * rapproche des circularisations.
   */
  @Get('balance-auxiliaire')
  async balanceAuxiliaire(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId: string,
    @Query('type') type?: 'CLIENTS' | 'FOURNISSEURS' | 'TOUS',
  ) {
    return this.ecritureService.balanceAuxiliaire(user.tenantId, { exerciceId, type });
  }

  /**
   * JUSTIFICATIF DE SOLDE · le détail qui compose le solde d'un compte à une
   * date. À ne pas confondre avec le grand livre du compte, borné à
   * l'exercice : celui-ci remonte aussi loin que le solde le demande.
   */
  @Get('justificatif-solde/:compteId')
  async justificatifSolde(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compteId') compteId: string,
    @Query('exerciceId') exerciceId: string,
    @Query('dateArret') dateArret?: string,
    @Query('masquerLettrees') masquerLettrees?: string,
  ) {
    return this.ecritureService.justificatifSolde(user.tenantId, {
      compteId,
      exerciceId,
      dateArret,
      masquerLettrees: masquerLettrees === 'true',
    });
  }

  /**
   * ÉVOLUTION PLURIANNUELLE · le même compte sur plusieurs exercices. Ce que
   * deux colonnes N / N-1 ne montrent pas : une provision figée depuis quatre
   * ans, un compte d'attente qui gonfle.
   */
  @Get('evolution-soldes')
  async evolutionSoldes(
    @CurrentUser() user: AuthenticatedUser,
    @Query('nbExercices') nbExercices?: string,
  ) {
    return this.ecritureService.evolutionSoldes(user.tenantId, {
      nbExercices: nbExercices ? Number(nbExercices) : undefined,
    });
  }

  /**
   * GRAND LIVRE COMPLET · tous les comptes MOUVEMENTÉS de l'exercice, dans
   * l'ordre des numéros. C'est l'état par défaut : un grand livre est, par
   * définition, le recueil de tous les comptes · en exiger un avant d'afficher
   * quoi que ce soit revenait à demander à l'utilisateur de deviner par où
   * commencer. Le choix d'un compte n'est plus qu'un FILTRE.
   *
   * Cette route doit rester déclarée AVANT `grand-livre/:compteId` : sinon un
   * appel sans identifiant serait capté par la route paramétrée.
   */
  @Get('grand-livre')
  async grandLivreComplet(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId') exerciceId?: string,
  ) {
    return this.ecritureService.grandLivreComplet(user.tenantId, exerciceId);
  }

  @Get('grand-livre/:compteId')
  async grandLivre(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compteId') compteId: string,
    @Query('exerciceId') exerciceId?: string,
  ) {
    return this.ecritureService.grandLivre(user.tenantId, compteId, exerciceId);
  }
}

import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import { Referentiel } from '@prisma/client';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ClasseurExporte, ExportService } from './export.service';

/**
 * Cloisonnement par ROUTE, pas par contrôleur : journal, grand livre et
 * balance valent pour les deux référentiels, mais tout ce qui reprend un
 * ÉTAT porte le décorateur du référentiel dont il vient, route par route.
 *
 * Les routes `etats-financiers/...` servent les états SYCEBNL (liasse,
 * bilan, résultat, TFT, jeu projets, SMT, notes) ainsi que les pièces qui
 * n'existent que là (registre des donateurs, livre d'inventaire, rapport
 * d'activité) ; les routes `etats-financiers-syscohada/...` servent les
 * états SYSCOHADA (Titre IX et Titre X de l'AUDCIF). Aucune route n'accepte
 * les deux : c'est le verrou serveur qu'exige CLAUDE.md §6, celui qui rend
 * vrai le cloisonnement affiché côté client.
 */

/**
 * `exerciceId` doit être validé, pas seulement typé : un `@Query` scalaire
 * n'est pas couvert par le ValidationPipe global, et `undefined` traverse
 * jusqu'à Prisma qui IGNORE purement et simplement un champ `undefined`.
 * Le filtre d'exercice disparaîtrait alors sans bruit et l'export
 * agrégerait TOUS les exercices du dossier en se présentant comme l'état
 * d'un seul · un état faux et non signalé, ce qui est plus grave qu'une
 * erreur pour un module destiné à produire des pièces d'audit.
 */
const EXERCICE_REQUIS = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("Le paramètre exerciceId est requis et doit être un identifiant d'exercice valide"),
});

const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Le nom de fichier est décidé par le service (il connaît l'exercice et le
 * compte concernés, et y ajoute l'année pour que deux exports d'exercices
 * différents ne s'écrasent pas côté navigateur). Le contrôleur se contente
 * de le servir.
 */
function envoyerXlsx(res: Response, classeur: ClasseurExporte) {
  res.set({
    'Content-Type': TYPE_XLSX,
    'Content-Disposition': `attachment; filename="${classeur.nomFichier}"`,
    // Sans ça, `fetch` côté client ne voit pas l'en-tête (CORS masque tout
    // sauf une liste blanche) et ne peut pas reprendre le nom proposé.
    'Access-Control-Expose-Headers': 'Content-Disposition',
  });
  res.send(classeur.buffer);
}

// RolesGuard est inclus bien qu'aucune route ne porte encore `@Roles` (les
// exports sont en lecture seule, ouverts aux trois rôles comme les écrans
// qu'ils reprennent). Sans lui, un futur `@Roles` posé ici serait
// SILENCIEUSEMENT ignoré · pas d'erreur, pas de 403, la route resterait
// ouverte à tous. Aligné sur les autres contrôleurs du projet.
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@Controller('exports')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('journal')
  async journal(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId') exerciceId?: string,
    @Query('journalId') journalId?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('recherche') recherche?: string,
  ) {
    envoyerXlsx(
      res,
      await this.exportService.journalExcel(user.tenantId, { exerciceId, journalId, dateDebut, dateFin, recherche }),
    );
  }

  /** Grand livre complet · tous les comptes mouvementés, un seul classeur. */
  @Get('grand-livre')
  async grandLivreComplet(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId') exerciceId?: string,
  ) {
    envoyerXlsx(res, await this.exportService.grandLivreCompletExcel(user.tenantId, exerciceId));
  }

  @Get('grand-livre/:compteId')
  async grandLivre(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compteId') compteId: string,
    @Res() res: Response,
    @Query('exerciceId') exerciceId?: string,
  ) {
    envoyerXlsx(res, await this.exportService.grandLivreExcel(user.tenantId, compteId, exerciceId));
  }

  @Get('balance')
  async balance(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.balanceExcel(user.tenantId, exerciceId));
  }

  /**
   * LA LIASSE COMPLÈTE · tous les états du jeu retenu par le dossier dans un
   * seul classeur, précédés d'un sommaire. C'est ce fichier-là qui se dépose
   * au CPCC ou s'envoie à un bailleur ; les exports unitaires ci-dessous
   * restent utiles pour retravailler un état isolé.
   */
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('etats-financiers/liasse-complete')
  async liasseComplete(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
    @Query('paiementsEnInstance') paiementsEnInstance?: string,
  ) {
    const montant = Number(paiementsEnInstance);
    envoyerXlsx(
      res,
      await this.exportService.liasseCompleteExcel(
        user.tenantId,
        exerciceId,
        Number.isFinite(montant) ? montant : 0,
      ),
    );
  }

  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('etats-financiers/bilan')
  async bilan(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.bilanExcel(user.tenantId, exerciceId));
  }

  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('etats-financiers/compte-de-resultat')
  async compteDeResultat(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.compteDeResultatExcel(user.tenantId, exerciceId));
  }

  /** Spécifique au jeu associations (Partie 4, ch. 1 § 4) · voir correspondance-tft.ts. */
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('etats-financiers/tableau-flux-tresorerie')
  async tableauFluxTresorerie(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.tableauFluxTresorerieExcel(user.tenantId, exerciceId));
  }

  /** Jeu « projets de développement et assimilés » (Partie 4, ch. 3). */
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('etats-financiers/projet/bilan')
  async bilanProjet(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.bilanProjetExcel(user.tenantId, exerciceId));
  }

  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('etats-financiers/projet/compte-exploitation')
  async compteExploitationProjet(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.compteExploitationProjetExcel(user.tenantId, exerciceId));
  }

  /** Comptabilité analytique par projet/bailleur (docs/plan-de-construction.md item 14). */
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('etats-financiers/projet/note-bailleur')
  async noteBailleur(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.noteBailleurExcel(user.tenantId, exerciceId));
  }

  /** Les trois tableaux du point 2 de l'article 14 (guide d'application, ch. 7). */
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('etats-financiers/projet/emplois-ressources')
  async emploisRessources(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.emploisRessourcesExcel(user.tenantId, exerciceId));
  }

  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('etats-financiers/projet/execution-budgetaire')
  async executionBudgetaire(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.executionBudgetaireExcel(user.tenantId, exerciceId));
  }

  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('etats-financiers/projet/reconciliation-tresorerie')
  async reconciliationTresorerie(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
    @Query('paiementsEnInstance') paiementsEnInstance?: string,
  ) {
    const montant = Number(paiementsEnInstance);
    envoyerXlsx(
      res,
      await this.exportService.reconciliationTresorerieExcel(
        user.tenantId,
        exerciceId,
        Number.isFinite(montant) ? montant : 0,
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Jeu « Système Minimal de Trésorerie » (Partie 4, ch. 4) · un export par
  // onglet de l'écran, comme les deux autres jeux ont un export par état.
  // -------------------------------------------------------------------------

  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('etats-financiers/smt/bilan')
  async bilanSmt(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.bilanSmtExcel(user.tenantId, exerciceId));
  }

  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('etats-financiers/smt/compte-de-resultat')
  async compteDeResultatSmt(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.compteDeResultatSmtExcel(user.tenantId, exerciceId));
  }

  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('etats-financiers/smt/journal-tresorerie')
  async journalTresorerieSmt(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.journalTresorerieSmtExcel(user.tenantId, exerciceId));
  }

  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('etats-financiers/smt/notes')
  async notesSmt(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.notesSmtExcel(user.tenantId, exerciceId));
  }

  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('etats-financiers/smt/eligibilite')
  async eligibiliteSmt(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.eligibiliteSmtExcel(user.tenantId, exerciceId));
  }

  /** Notes annexes du jeu « associations et ordres professionnels » · 45 notes, une feuille par tableau applicable. */
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('notes-annexes/associations')
  async notesAssociations(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.notesAssociationsExcel(user.tenantId, exerciceId));
  }

  /**
   * Registre des donateurs (art. 17) et constatations de conformité (art. 18).
   * Le classeur est destiné à être imprimé et présenté : l'art. 17 admet la
   * « version électronique » mais la version physique reste « cotée, paraphée
   * et numérotée de façon continue par la juridiction compétente ».
   */
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('registre-donateurs')
  async registreDonateurs(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.registreDonateursExcel(user.tenantId, exerciceId));
  }

  /**
   * Livre d'inventaire (art. 14). Les états y sont RELUS depuis la
   * transcription, jamais recalculés : un classeur qui les régénérerait
   * produirait, à partir du même livre, deux documents différents à deux
   * dates différentes.
   */
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('livre-inventaire')
  async livreInventaire(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.livreInventaireExcel(user.tenantId, exerciceId));
  }

  /** Rapport d'activité (art. 16-3) · quatre sections, section vide signalée. */
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('rapport-activite')
  async rapportActivite(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.rapportActiviteExcel(user.tenantId, exerciceId));
  }

  /** Notes annexes du jeu « projets de développement et assimilés » · 26 notes. */
  @ReferentielsAutorises(Referentiel.SYCEBNL)
  @Get('notes-annexes/projet')
  async notesProjet(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.notesProjetExcel(user.tenantId, exerciceId));
  }

  // ==========================================================================
  // EXPORTS SYSCOHADA RÉVISÉ · préfixe `etats-financiers-syscohada/`, comme le
  // contrôleur d'états du même nom.
  //
  // POURQUOI UN JEU DE ROUTES SÉPARÉ, ET NON UNE ROUTE COMMUNE QUI BRANCHE ·
  // décision prise ici, et documentée pour ne pas être défaite par
  // simplification : `etats-financiers/liasse-complete` RESTE réservée au
  // SYCEBNL, `etats-financiers-syscohada/liasse-complete` est sa jumelle
  // SYSCOHADA. Une route unique ouverte aux deux référentiels obligerait sa
  // garde à les accepter tous les deux, et le seul verrou serveur du
  // cloisonnement (CLAUDE.md §6) tomberait au profit d'un `if` dans le
  // service ; un dossier SYCEBNL pourrait alors appeler la route et se voir
  // servir une liasse dont il ne pourrait constater l'erreur qu'au dépôt.
  // Deux routes, deux gardes, aucun croisement possible.
  //
  // Le SERVICE, lui, branche bel et bien sur `tenant.referentiel` : les deux
  // routes appellent le même `liasseCompleteExcel`, parce que
  // `GroupeService.liasseGroupe` l'appelle sans passer par aucune route.
  // ==========================================================================

  /**
   * LA LIASSE SYSCOHADA COMPLÈTE · Système normal (AUDCIF Titre IX) ou
   * Système minimal de trésorerie (Titre X) selon
   * `tenant.systemeComptableSyscohada`, art. 11 et 13. Le service tranche ·
   * ni le client ni un paramètre de requête, pour qu'un dossier ne puisse pas
   * déposer un jeu d'états qui n'est pas le sien.
   */
  @ReferentielsAutorises(Referentiel.SYSCOHADA)
  @Get('etats-financiers-syscohada/liasse-complete')
  async liasseCompleteSyscohada(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.liasseCompleteExcel(user.tenantId, exerciceId));
  }

  /** Bilan · modèle et codes AD à DZ du Titre IX ch. 3, correspondance du ch. 7. */
  @ReferentielsAutorises(Referentiel.SYSCOHADA)
  @Get('etats-financiers-syscohada/bilan')
  async bilanSyscohada(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.bilanSyscohadaExcel(user.tenantId, exerciceId));
  }

  /** Compte de résultat · postes TA à XI et conventions de signe du Titre IX ch. 4. */
  @ReferentielsAutorises(Referentiel.SYSCOHADA)
  @Get('etats-financiers-syscohada/compte-de-resultat')
  async compteDeResultatSyscohada(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.compteDeResultatSyscohadaExcel(user.tenantId, exerciceId));
  }

  /** Tableau des flux de trésorerie · repères ZA à ZH et FA à FQ du Titre IX ch. 5. */
  @ReferentielsAutorises(Referentiel.SYSCOHADA)
  @Get('etats-financiers-syscohada/tableau-flux-tresorerie')
  async tableauFluxTresorerieSyscohada(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.tableauFluxTresorerieSyscohadaExcel(user.tenantId, exerciceId));
  }

  /** Les 36 notes annexes de la liste officielle du Titre IX ch. 6. */
  @ReferentielsAutorises(Referentiel.SYSCOHADA)
  @Get('etats-financiers-syscohada/notes-annexes')
  async notesSyscohada(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.notesSyscohadaExcel(user.tenantId, exerciceId));
  }

  // --- Système minimal de trésorerie (Titre X) -------------------------------
  // Pas de route `smt/tableau-flux-tresorerie` · le Titre X ch. 1 § 2 n'énumère
  // que trois documents et ne donne aucune maquette de TFT (voir l'anomalie
  // signalée sur `liasseSmtSyscohadaEtafi`).

  @ReferentielsAutorises(Referentiel.SYSCOHADA)
  @Get('etats-financiers-syscohada/smt/bilan')
  async bilanSmtSyscohada(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.bilanSmtSyscohadaExcel(user.tenantId, exerciceId));
  }

  @ReferentielsAutorises(Referentiel.SYSCOHADA)
  @Get('etats-financiers-syscohada/smt/compte-de-resultat')
  async compteDeResultatSmtSyscohada(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.compteDeResultatSmtSyscohadaExcel(user.tenantId, exerciceId));
  }

  /** NOTE 4 · journal de trésorerie SMT, une route à part : c'est une pièce de
   *  TENUE, aussi longue que l'exercice compte de mouvements de trésorerie. */
  @ReferentielsAutorises(Referentiel.SYSCOHADA)
  @Get('etats-financiers-syscohada/smt/journal-tresorerie')
  async journalTresorerieSmtSyscohada(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.journalTresorerieSmtSyscohadaExcel(user.tenantId, exerciceId));
  }

  /** Notes annexes SMT · fiche récapitulative et notes 1 à 4 du Titre X ch. 3. */
  @ReferentielsAutorises(Referentiel.SYSCOHADA)
  @Get('etats-financiers-syscohada/smt/notes')
  async notesSmtSyscohada(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    envoyerXlsx(res, await this.exportService.notesSmtSyscohadaExcel(user.tenantId, exerciceId));
  }
}

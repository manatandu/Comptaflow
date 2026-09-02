import { BadRequestException, Controller, Get, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { Referentiel } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { ReferentielsAutorises } from '../../common/decorators/referentiels.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EtatsFinanciersSyscohadaService } from './etats-financiers-syscohada.service';
import { EtatsFinanciersSmtSyscohadaService } from './etats-financiers-smt-syscohada.service';
import { NoteAnnexeService } from '../notes-annexes/note-annexe.service';

/**
 * Même raison qu'au contrôleur SYCEBNL : un `@Query` scalaire échappe au
 * ValidationPipe global, et un `exerciceId` absent devient `undefined`, que
 * Prisma ignore · l'état porterait alors sur TOUS les exercices du dossier
 * sans le dire.
 */
const EXERCICE_REQUIS = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("Le paramètre exerciceId est requis et doit être un identifiant d'exercice valide"),
});

// RolesGuard présent pour que tout `@Roles` ajouté plus tard soit réellement
// appliqué (sans lui, il serait silencieusement ignoré).
//
// SYSCOHADA SEULEMENT · tous les moteurs de ce contrôleur montent les états
// de l'AUDCIF (Titre IX pour le Système normal, Titre X pour le Système
// minimal de trésorerie) depuis les tables de correspondance SYSCOHADA. Les
// servir à un dossier SYCEBNL imprimerait des postes, des comptes et des
// notes d'un autre référentiel, sans qu'aucun total cesse de boucler ·
// CLAUDE.md §6 exige les DEUX verrous, et celui-ci est le verrou serveur qui
// rend vrai le cloisonnement affiché côté client.
//
// Le décorateur n'est jamais redéfini sur une route : `getAllAndOverride`
// interroge la méthode AVANT la classe, une redéfinition rouvrirait donc la
// route au mauvais référentiel (le spec de cloisonnement le vérifie).
@ReferentielsAutorises(Referentiel.SYSCOHADA)
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard)
@Controller('etats-financiers-syscohada')
export class EtatsFinanciersSyscohadaController {
  constructor(
    private readonly etatsFinanciersSyscohadaService: EtatsFinanciersSyscohadaService,
    private readonly etatsFinanciersSmtSyscohadaService: EtatsFinanciersSmtSyscohadaService,
    private readonly noteAnnexeService: NoteAnnexeService,
  ) {}

  // =========================================================================
  // SYSTÈME NORMAL · AUDCIF art. 26 : « Le Système normal comporte
  // l'établissement du Bilan, du Compte de résultat de l'exercice, du
  // Tableau des flux de trésorerie ainsi que des Notes annexes ». Les quatre
  // routes qui suivent servent ces quatre états, et rien d'autre : le jeu
  // est « un tout indissociable » (art. 8).
  // =========================================================================

  /**
   * BILAN · modèle et codes AD à DZ du Titre IX ch. 3, correspondance
   * postes/comptes du ch. 7. Le retour porte aussi ce qui ne s'imprime pas
   * mais fait foi : `comptesNonRattaches` (comptes de bilan qu'aucun poste
   * ne capte, signalés et jamais rattachés d'office) et les contrôles
   * d'équilibre · voir `EtatsFinanciersSyscohadaService.bilan`.
   */
  @Get('bilan')
  async bilan(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.etatsFinanciersSyscohadaService.bilan(user.tenantId, exerciceId);
  }

  /**
   * COMPTE DE RÉSULTAT · postes TA à XI et conventions de signe du Titre IX
   * ch. 4, correspondance du ch. 7. Le résultat est rendu par ses deux
   * sources exclusives (classes 6/7/8 avant clôture, compte 13 après) pour
   * que le double comptage se voie au lieu de se fondre dans un total.
   */
  @Get('compte-de-resultat')
  async compteDeResultat(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.etatsFinanciersSyscohadaService.compteDeResultat(user.tenantId, exerciceId);
  }

  /**
   * TABLEAU DES FLUX DE TRÉSORERIE · repères ZA à ZH et FA à FQ du Titre IX
   * ch. 5. Il lit TROIS exercices (N, N-1 et N-2) parce que sa colonne
   * comparative est elle-même faite de variations : sans N-2, la colonne
   * N-1 serait un tableau de soldes présenté comme un tableau de flux.
   * Les postes que la balance ne permet pas de calculer sont déclarés
   * (`postesNonCalculables`), jamais servis à zéro.
   */
  @Get('tableau-flux-tresorerie')
  async tableauFluxTresorerie(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.etatsFinanciersSyscohadaService.tableauFluxTresorerie(user.tenantId, exerciceId);
  }

  /**
   * NOTES ANNEXES · les 36 notes de la liste officielle du Titre IX ch. 6.
   * Servies par `NoteAnnexeService`, moteur déclaratif commun aux deux
   * référentiels · commun par le MOTEUR seulement, la table lue ici étant
   * `NOTES_SYSCOHADA` et aucune ligne n'étant reprise du SYCEBNL
   * (CLAUDE.md §6).
   */
  @Get('notes')
  async notes(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.noteAnnexeService.notesSyscohada(user.tenantId, exerciceId);
  }

  // =========================================================================
  // SYSTÈME MINIMAL DE TRÉSORERIE · AUDCIF art. 11 et 13, maquettes du
  // Titre X. Routes préfixées `smt/` parce que c'est un JEU d'états entier,
  // pas une variante de présentation du précédent : autres postes (GA à HZ,
  // KA à KZ), autre base (comptabilité de trésorerie), autres notes.
  //
  // Pas de route `smt/tableau-flux-tresorerie` · ANOMALIE DU TEXTE OFFICIEL,
  // signalée et non corrigée : l'art. 28 range un « Tableau de flux de
  // trésorerie » dans le jeu SMT, alors que le Titre X ch. 1 § 2 n'énumère
  // que trois documents (Bilan, Compte de résultat, Notes annexes) et ne
  // donne aucune maquette de TFT. On sert le jeu du Titre X, qui seul
  // fournit les modèles ; aucun état n'est inventé. Voir l'anomalie n° 3 de
  // `correspondance-smt-syscohada.ts`.
  // =========================================================================

  /** BILAN SMT au 31 décembre N · maquette du Titre X ch. 2 section 1. */
  @Get('smt/bilan')
  async bilanSmt(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    return this.etatsFinanciersSmtSyscohadaService.bilan(user.tenantId, exerciceId);
  }

  /**
   * COMPTE DE RÉSULTAT SMT · maquette du Titre X ch. 2 section 2, dressée
   * depuis la comptabilité de trésorerie et corrigée des trois variations
   * que l'art. 28 autorise « lorsqu'elles sont significatives » (stocks,
   * créances, dettes).
   */
  @Get('smt/compte-de-resultat')
  async compteDeResultatSmt(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.etatsFinanciersSmtSyscohadaService.compteDeResultat(user.tenantId, exerciceId);
  }

  /**
   * NOTE 4 · « journal unique de trésorerie » du Titre X ch. 1 § 1, dont le
   * ch. 3 dit qu'il « ouvre sur un report à nouveau et se clôt sur un solde
   * à reporter ». Route séparée des autres notes parce que c'est une pièce
   * de TENUE, longue d'autant de lignes que l'exercice compte de mouvements
   * de trésorerie : la charger avec les notes de synthèse rendrait celles-ci
   * inutilisables. Le NB officiel demande un journal par banque et un
   * journal pour la caisse.
   */
  @Get('smt/journal-tresorerie')
  async journalTresorerieSmt(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.etatsFinanciersSmtSyscohadaService.journalTresorerie(user.tenantId, exerciceId);
  }

  /**
   * NOTES 1, 2 et 3 du Titre X ch. 3, servies ensemble : ce sont les trois
   * notes de synthèse énumérées au ch. 1 § 2 comme composantes des Notes
   * annexes, et elles tiennent sur un écran. La NOTE 4 a sa propre route
   * ci-dessus. `fiche` porte la structure officielle du jeu (documents,
   * notes, journaux de suivi, inventaire extra-comptable, règle
   * d'amortissement linéaire sans prorata temporis).
   */
  @Get('smt/notes')
  async notesSmt(@CurrentUser() user: AuthenticatedUser, @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string) {
    const [note1, note2, note3] = await Promise.all([
      this.etatsFinanciersSmtSyscohadaService.note1MaterielMobilierCautions(user.tenantId, exerciceId),
      this.etatsFinanciersSmtSyscohadaService.note2Stocks(user.tenantId, exerciceId),
      this.etatsFinanciersSmtSyscohadaService.note3CreancesDettes(user.tenantId, exerciceId),
    ]);
    return { fiche: this.etatsFinanciersSmtSyscohadaService.ficheNotes(), note1, note2, note3 };
  }

  /**
   * ÉLIGIBILITÉ AU SMT · art. 11 (« Toute entité est, sauf exception liée à
   * sa taille, soumise au Système normal ») et art. 13 (trois seuils de
   * chiffre d'affaires, selon que l'entité est de négoce, artisanale ou de
   * services). Le contrôle ne TRANCHE pas : la qualification de l'activité
   * n'est pas portée par `Tenant`, et les seuils sont en F CFA quand le
   * dossier tient ses comptes en CDF ou en USD. Il expose le chiffre
   * d'affaires face aux trois seuils et laisse l'arbitrage à l'entité.
   */
  @Get('smt/eligibilite')
  async eligibiliteSmt(
    @CurrentUser() user: AuthenticatedUser,
    @Query('exerciceId', EXERCICE_REQUIS) exerciceId: string,
  ) {
    return this.etatsFinanciersSmtSyscohadaService.eligibilite(user.tenantId, exerciceId);
  }
}

import { Body, Controller, ForbiddenException, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangerMotDePasseDto } from './dto/changer-mot-de-passe.dto';
import { ChangerAdresseDto } from './dto/changer-adresse.dto';
import { ActiverDoubleAuthDto, DesactiverDoubleAuthDto, RegenererCodesSecoursDto } from './dto/double-authentification.dto';
import { DeconnecterAutresAppareilsDto } from './dto/deconnecter-autres-appareils.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { SortieMotDePasseProvisoire } from '../../common/decorators/sortie-mot-de-passe.decorator';
import { effacerCookiesSession, poserCookieSession } from './session.constants';
import { sessionDeLaRequete } from './session-longue';
import { estSurSite } from '../../common/mode-installation';
import { AccesRolesCantonnes } from '../../common/decorators/acces-roles-cantonnes.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Pose la session en cookie httpOnly et ne renvoie au corps QUE le jeton
   * CSRF apparié · le jeton de session lui-même n'est plus jamais exposé à
   * du JavaScript (voir session.constants.ts). Le client garde le jeton
   * CSRF et le rejoue en en-tête X-CSRF-Token sur chaque mutation. La durée
   * du cookie (`maxAgeMs`) vient de la session émise, nulle pour une session
   * courte · cookie de session, fermé avec le navigateur (audit final F270) ·
   * et ne sort pas non plus au corps.
   */
  private poserSession<T extends { accessToken: string; csrfToken: string; maxAgeMs?: number | null }>(res: Response, resultat: T) {
    const { accessToken, maxAgeMs, ...reste } = resultat;
    poserCookieSession(res, accessToken, maxAgeMs ?? null);
    return reste;
  }

  // FORCE BRUTE · 30 créations de dossier par heure et par adresse. La
  // limite compte PAR ADRESSE PUBLIQUE : un cabinet derrière un NAT (ou un
  // CGNAT d'opérateur mobile) partage la sienne entre plusieurs personnes ·
  // 10 coupait un cabinet qui monte son portefeuille en une séance, 30
  // laisse ce flux réel passer et coupe toujours un script qui sème des
  // dossiers fantômes.
  @Throttle({ default: { ttl: 3_600_000, limit: 30 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    // AUTO-INSCRIPTION FERMÉE (option A) · un dossier OmegaX naît depuis la
    // console VMG Consulting (ou par le siège d'un groupe), avec un contrat
    // derrière : un dossier auto-créé recevait une licence sans échéance,
    // c'est-à-dire le produit gratuit à vie à côté du produit vendu. Le
    // POINT D'ENTRÉE HTTP seul est fermé : AuthService.register reste le
    // pipeline de toutes les créations internes. INSCRIPTION_PUBLIQUE=true
    // rouvre la porte le jour où un canal libre-service (essai daté) sera
    // voulu · fermée à clé, pas démolie.
    //
    // SUR SITE, LA PORTE NE SERT QU'AU PREMIER DOSSIER (audit final F44) ·
    // ouverte à demeure, elle rendait à tout poste du réseau un administrateur
    // de dossier. Les suivants se créent depuis le dossier d'installation
    // (`POST /sur-site/dossiers`). `INSCRIPTION_PUBLIQUE` n'y est pas lue.
    if (estSurSite()) {
      if (!(await this.authService.premierDossierAttendu())) {
        throw new ForbiddenException(
          "Cette installation a déjà son premier dossier · les suivants se créent depuis le dossier d'installation, fenêtre Restitution.",
        );
      }
    } else if (this.config.get<string>('INSCRIPTION_PUBLIQUE') !== 'true') {
      throw new ForbiddenException(
        "L'ouverture d'un dossier OmegaX se fait avec VMG Consulting · écrivez à admin@vmgconsulting.net pour démarrer.",
      );
    }
    return this.poserSession(res, await this.authService.register(dto));
  }

  // 20 essais de mot de passe par minute et par adresse (partagée derrière
  // un NAT : la rentrée d'une équipe entière ne doit pas se bloquer
  // elle-même). Un dictionnaire reste inutilisable à ce débit face à des
  // hachages bcrypt à 12 tours.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response, @Req() req?: Request) {
    // `req.ip` SEUL, réglé par le nombre de relais de confiance
    // (sauts-de-confiance.ts, audit final F160) · la tête de X-Forwarded-For
    // s'écrit par le client. Porté au maillon CONNEXION (passe D4, D4-C4).
    const r = await this.authService.login(dto, req?.ip ?? null);
    // Mot de passe juste, code attendu · AUCUNE session n'est posée.
    if ('deuxiemeFacteurRequis' in r) return r;
    return this.poserSession(res, r);
  }

  // Sans garde : effacer un cookie est inoffensif et doit marcher même avec
  // une session déjà expirée (sinon impossible de « fermer » proprement).
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    effacerCookiesSession(res);
    return { deconnecte: true };
  }

  /**
   * LE JETON CSRF DE LA SESSION EN COURS VOYAGE AVEC /auth/me (audit final
   * F270) · l'écran le tient en stockage local, qui peut disparaître quand le
   * cookie, lui, reste · Safari peut effacer le stockage d'un site resté sept
   * jours sans interaction, et une session « Rester connecté » en vit trente.
   * La session survivait alors et chaque écriture était refusée en 403. Relu
   * ici à chaque ouverture de l'interface, le jeton suit la session au lieu de
   * lui survivre ou de mourir avant elle. Aucun affaiblissement en ligne · la
   * réponse n'est lisible que par une origine que la configuration CORS nomme
   * (`bootstrap.ts`, liste fermée en production), et un site tiers ne la lit
   * pas plus qu'il ne lit le cookie ; sur site, le cookie `lax` ne part même
   * pas avec une requête d'un autre site.
   */
  @SortieMotDePasseProvisoire()
  // Le strict nécessaire pour ENTRER · ouvert au gestionnaire de paie.
  @AccesRolesCantonnes({ gestionnairePaie: true })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser, @Req() req?: Request) {
    const session = sessionDeLaRequete(req);
    return {
      ...(await this.authService.me(user.userId)),
      ...(session?.csrf ? { csrfToken: session.csrf } : {}),
      sessionLongue: session?.longue ?? false,
    };
  }

  // Même limite serrée que login : la vérification du mot de passe actuel
  // est une surface de force brute au même titre que la connexion.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @SortieMotDePasseProvisoire()
  // Le strict nécessaire pour ENTRER · ouvert au gestionnaire de paie.
  @AccesRolesCantonnes({ gestionnairePaie: true })
  @UseGuards(JwtAuthGuard)
  @Post('changer-mot-de-passe')
  async changerMotDePasse(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangerMotDePasseDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Le changement RÉVOQUE toutes les sessions du compte, celle-ci comprise ·
    // rien ne distingue côté serveur la session du titulaire de celle de qui
    // détenait le mot de passe. Une session neuve est donc reposée dans la
    // foulée, faute de quoi le titulaire serait éjecté par son propre geste,
    // et elle garde le régime de la session en cours (audit final F270).
    return this.poserSession(res, await this.authService.changerMotDePasse(
      user.userId,
      dto.motDePasseActuel,
      dto.nouveauMotDePasse,
      sessionDeLaRequete(res.req),
    ));
  }

  /**
   * Changer sa propre adresse de connexion (AuthService.changerAdresse) ·
   * même garde que le mot de passe, sauf la sortie de mot de passe provisoire :
   * un compte au mot de passe provisoire le remplace d'abord.
   */
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @AccesRolesCantonnes({ gestionnairePaie: true })
  @UseGuards(JwtAuthGuard)
  @Post('changer-adresse')
  async changerAdresse(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangerAdresseDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.poserSession(
      res,
      await this.authService.changerAdresse(user.userId, dto.motDePasseActuel, dto.nouvelleAdresse, sessionDeLaRequete(res.req)),
    );
  }

  /**
   * DOUBLE AUTHENTIFICATION de son propre compte (AuthService). Pas de sortie
   * de mot de passe provisoire · un compte au mot de passe provisoire le
   * remplace d'abord. Ouverte à tous les rôles, gestionnaire de paie compris.
   */
  @AccesRolesCantonnes({ gestionnairePaie: true })
  @UseGuards(JwtAuthGuard)
  @Get('double-authentification')
  etatDoubleAuth(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.etatDoubleAuth(user.userId);
  }

  @AccesRolesCantonnes({ gestionnairePaie: true })
  @UseGuards(JwtAuthGuard)
  @Post('double-authentification/initier')
  initierDoubleAuth(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.initierDoubleAuth(user.userId);
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @AccesRolesCantonnes({ gestionnairePaie: true })
  @UseGuards(JwtAuthGuard)
  @Post('double-authentification/activer')
  async activerDoubleAuth(@CurrentUser() user: AuthenticatedUser, @Body() dto: ActiverDoubleAuthDto, @Res({ passthrough: true }) res: Response) {
    // Les autres sessions sont fermées · celle-ci est reposée, comme au
    // changement de mot de passe. Le mot de passe actuel est exigé
    // (ActiverDoubleAuthDto, OWASP ASVS 5.0 exigence 7.5.1).
    return this.poserSession(
      res,
      await this.authService.activerDoubleAuth(user.userId, dto.motDePasseActuel, dto.code, undefined, sessionDeLaRequete(res.req)),
    );
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @AccesRolesCantonnes({ gestionnairePaie: true })
  @UseGuards(JwtAuthGuard)
  @Post('double-authentification/desactiver')
  async desactiverDoubleAuth(@CurrentUser() user: AuthenticatedUser, @Body() dto: DesactiverDoubleAuthDto, @Res({ passthrough: true }) res: Response) {
    return this.poserSession(
      res,
      await this.authService.desactiverDoubleAuth(user.userId, dto.motDePasseActuel, dto.code, undefined, sessionDeLaRequete(res.req)),
    );
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @AccesRolesCantonnes({ gestionnairePaie: true })
  @UseGuards(JwtAuthGuard)
  @Post('double-authentification/codes-secours')
  regenererCodesSecours(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegenererCodesSecoursDto) {
    return this.authService.regenererCodesSecours(user.userId, dto.motDePasseActuel, dto.code);
  }

  /**
   * Ferme toutes les sessions du compte, y compris celle qui appelle · le
   * geste « j'ai laissé ma session ouverte sur un poste ». Sans état serveur :
   * l'instant de révocation suffit (voir schema.prisma, User).
   */
  @SortieMotDePasseProvisoire()
  // Le strict nécessaire pour ENTRER · ouvert au gestionnaire de paie.
  @AccesRolesCantonnes({ gestionnairePaie: true })
  @UseGuards(JwtAuthGuard)
  @Post('deconnecter-partout')
  async deconnecterPartout(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    const resultat = await this.authService.deconnecterPartout(user.userId);
    effacerCookiesSession(res);
    return resultat;
  }

  /**
   * « DÉCONNECTER MES AUTRES APPAREILS » (audit final F270) · ferme toutes les
   * sessions du compte SAUF celle qui appelle, aussitôt reposée avec son choix
   * « Rester connecté » et son origine (AuthService.deconnecterAutresAppareils).
   * Mot de passe actuel exigé, même débit que les autres vérifications de mot
   * de passe. Ouverte à tous les rôles comme les autres réglages de son propre
   * compte · PAS une sortie de mot de passe provisoire, dont le changement
   * ferme déjà toutes les sessions.
   */
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @AccesRolesCantonnes({ gestionnairePaie: true })
  @UseGuards(JwtAuthGuard)
  @Post('deconnecter-autres-appareils')
  async deconnecterAutresAppareils(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeconnecterAutresAppareilsDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.poserSession(
      res,
      await this.authService.deconnecterAutresAppareils(user.userId, dto.motDePasseActuel, sessionDeLaRequete(res.req)),
    );
  }
}

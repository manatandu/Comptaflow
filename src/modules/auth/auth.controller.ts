import { Body, Controller, ForbiddenException, Get, Post, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangerMotDePasseDto } from './dto/changer-mot-de-passe.dto';
import { ChangerAdresseDto } from './dto/changer-adresse.dto';
import { CodeDoubleAuthDto, DesactiverDoubleAuthDto } from './dto/double-authentification.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { SortieMotDePasseProvisoire } from '../../common/decorators/sortie-mot-de-passe.decorator';
import { COOKIE_SESSION, optionsCookieSession } from './session.constants';
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
   * CSRF et le rejoue en en-tête X-CSRF-Token sur chaque mutation.
   */
  private poserSession<T extends { accessToken: string; csrfToken: string }>(res: Response, resultat: T) {
    const { accessToken, ...reste } = resultat;
    res.cookie(COOKIE_SESSION, accessToken, optionsCookieSession());
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
    if (this.config.get<string>('INSCRIPTION_PUBLIQUE') !== 'true') {
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
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const r = await this.authService.login(dto);
    // Mot de passe juste, code attendu · AUCUNE session n'est posée.
    if ('deuxiemeFacteurRequis' in r) return r;
    return this.poserSession(res, r);
  }

  // Sans garde : effacer un cookie est inoffensif et doit marcher même avec
  // une session déjà expirée (sinon impossible de « fermer » proprement).
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_SESSION, { ...optionsCookieSession(), maxAge: undefined });
    return { deconnecte: true };
  }

  @SortieMotDePasseProvisoire()
  // Le strict nécessaire pour ENTRER · ouvert au gestionnaire de paie.
  @AccesRolesCantonnes({ gestionnairePaie: true })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.userId);
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
    // foulée, faute de quoi le titulaire serait éjecté par son propre geste.
    return this.poserSession(res, await this.authService.changerMotDePasse(
      user.userId,
      dto.motDePasseActuel,
      dto.nouveauMotDePasse,
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
    return this.poserSession(res, await this.authService.changerAdresse(user.userId, dto.motDePasseActuel, dto.nouvelleAdresse));
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
  async activerDoubleAuth(@CurrentUser() user: AuthenticatedUser, @Body() dto: CodeDoubleAuthDto, @Res({ passthrough: true }) res: Response) {
    // Les autres sessions sont fermées · celle-ci est reposée, comme au
    // changement de mot de passe.
    return this.poserSession(res, await this.authService.activerDoubleAuth(user.userId, dto.code));
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @AccesRolesCantonnes({ gestionnairePaie: true })
  @UseGuards(JwtAuthGuard)
  @Post('double-authentification/desactiver')
  async desactiverDoubleAuth(@CurrentUser() user: AuthenticatedUser, @Body() dto: DesactiverDoubleAuthDto, @Res({ passthrough: true }) res: Response) {
    return this.poserSession(res, await this.authService.desactiverDoubleAuth(user.userId, dto.motDePasseActuel, dto.code));
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @AccesRolesCantonnes({ gestionnairePaie: true })
  @UseGuards(JwtAuthGuard)
  @Post('double-authentification/codes-secours')
  regenererCodesSecours(@CurrentUser() user: AuthenticatedUser, @Body() dto: CodeDoubleAuthDto) {
    return this.authService.regenererCodesSecours(user.userId, dto.code);
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
    res.clearCookie(COOKIE_SESSION, { ...optionsCookieSession(), maxAge: undefined });
    return resultat;
  }
}

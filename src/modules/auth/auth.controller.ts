import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangerMotDePasseDto } from './dto/changer-mot-de-passe.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { COOKIE_SESSION, OPTIONS_COOKIE_SESSION } from './session.constants';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Pose la session en cookie httpOnly et ne renvoie au corps QUE le jeton
   * CSRF apparié · le jeton de session lui-même n'est plus jamais exposé à
   * du JavaScript (voir session.constants.ts). Le client garde le jeton
   * CSRF et le rejoue en en-tête X-CSRF-Token sur chaque mutation.
   */
  private poserSession<T extends { accessToken: string; csrfToken: string }>(res: Response, resultat: T) {
    const { accessToken, ...reste } = resultat;
    res.cookie(COOKIE_SESSION, accessToken, OPTIONS_COOKIE_SESSION);
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
    return this.poserSession(res, await this.authService.register(dto));
  }

  // 20 essais de mot de passe par minute et par adresse (partagée derrière
  // un NAT : la rentrée d'une équipe entière ne doit pas se bloquer
  // elle-même). Un dictionnaire reste inutilisable à ce débit face à des
  // hachages bcrypt à 12 tours.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.poserSession(res, await this.authService.login(dto));
  }

  // Sans garde : effacer un cookie est inoffensif et doit marcher même avec
  // une session déjà expirée (sinon impossible de « fermer » proprement).
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_SESSION, { ...OPTIONS_COOKIE_SESSION, maxAge: undefined });
    return { deconnecte: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.userId);
  }

  // Même limite serrée que login : la vérification du mot de passe actuel
  // est une surface de force brute au même titre que la connexion.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseGuards(JwtAuthGuard)
  @Post('changer-mot-de-passe')
  async changerMotDePasse(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangerMotDePasseDto) {
    return this.authService.changerMotDePasse(user.userId, dto.motDePasseActuel, dto.nouveauMotDePasse);
  }
}

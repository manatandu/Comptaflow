import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // FORCE BRUTE · 30 créations de dossier par heure et par adresse. La
  // limite compte PAR ADRESSE PUBLIQUE : un cabinet derrière un NAT (ou un
  // CGNAT d'opérateur mobile) partage la sienne entre plusieurs personnes ·
  // 10 coupait un cabinet qui monte son portefeuille en une séance, 30
  // laisse ce flux réel passer et coupe toujours un script qui sème des
  // dossiers fantômes.
  @Throttle({ default: { ttl: 3_600_000, limit: 30 } })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // 20 essais de mot de passe par minute et par adresse (partagée derrière
  // un NAT : la rentrée d'une équipe entière ne doit pas se bloquer
  // elle-même). Un dictionnaire reste inutilisable à ce débit face à des
  // hachages bcrypt à 12 tours.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.userId);
  }
}

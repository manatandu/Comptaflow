import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RoleUtilisateur } from '@prisma/client';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LicenceSurSiteService } from './licence-sur-site.service';
import { SauvegardeSurSiteService } from './sauvegarde-sur-site.service';

export class CopieExterneDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  dossier?: string | null;
}

export class DeposerLicenceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(20_000)
  contenu!: string;
}

/**
 * L'INSTALLATION SUR SITE · deux routes publiques et deux réservées.
 *
 * L'état et le dépôt de la licence sont PUBLICS, et c'est voulu : à la
 * première installation aucun compte n'existe, et c'est l'écran d'ouverture
 * qui montre l'empreinte du poste puis reçoit le fichier. Rien de ce qu'ils
 * rendent n'est une donnée d'un dossier.
 *
 * Les sauvegardes, elles, sont réservées à l'administrateur, et PAS derrière
 * `LicenceGuard` · une licence expirée ne doit jamais empêcher un client de
 * sauvegarder ses propres données. Même parti que la restitution du dossier.
 */
@Controller('sur-site')
export class SurSiteController {
  constructor(
    private readonly licence: LicenceSurSiteService,
    private readonly sauvegardes: SauvegardeSurSiteService,
  ) {}

  @Get('etat')
  etat() {
    const e = this.licence.etat();
    if (!e.surSite) return { surSite: false };
    const c = e.contenu;
    return {
      surSite: true,
      statut: e.statut,
      motif: e.motif,
      empreinte: e.empreinte,
      dateVersion: e.dateVersion,
      licence: c
        ? { numero: c.numero, titulaire: c.titulaire, emiseLe: c.emiseLe, finMaintenance: c.finMaintenance, expiration: c.expiration, dossiersMax: c.dossiersMax }
        : null,
    };
  }

  @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
  @Post('licence')
  deposer(@Body() dto: DeposerLicenceDto) {
    this.licence.deposer(dto.contenu);
    return this.etat();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Get('sauvegardes')
  lister() {
    return { dossier: this.sauvegardes.dossier, copies: this.sauvegardes.lister(), copieExterne: this.sauvegardes.copieExterne() };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post('sauvegardes/copie-externe')
  copieExterne(@Body() dto: CopieExterneDto) {
    return this.sauvegardes.definirCopieExterne(dto.dossier ?? null);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post('sauvegardes')
  sauvegarder() {
    return this.sauvegardes.lancer();
  }
}

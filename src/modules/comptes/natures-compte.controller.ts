import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { ModeReportANouveau, NatureCompteType, RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { NaturesCompteService } from './natures-compte.service';

export class ModifierNatureCompteDto {
  // Les fourchettes sont revérifiées par motifRefusFourchettes (chiffres,
  // du ≤ au, aucun chevauchement) · le DTO ne vérifie que la forme.
  @IsOptional()
  @IsArray()
  fourchettes?: { du: string; au: string }[];

  @IsOptional()
  @IsEnum(ModeReportANouveau)
  modeReportANouveau?: ModeReportANouveau;

  @IsOptional()
  @IsBoolean()
  lettrable?: boolean;
}

export class AlignerNaturesDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  compteIds?: string[];
}

/** Natures de compte (point 14) · lecture ouverte, paramétrage à l'administrateur. */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller('natures-compte')
export class NaturesCompteController {
  constructor(private readonly natures: NaturesCompteService) {}

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser) {
    return this.natures.lister(user.tenantId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Patch(':nature')
  async modifier(@CurrentUser() user: AuthenticatedUser, @Param('nature') nature: NatureCompteType, @Body() dto: ModifierNatureCompteDto) {
    return this.natures.modifier(user.tenantId, nature, dto);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET)
  @Post('aligner')
  async aligner(@CurrentUser() user: AuthenticatedUser, @Body() dto: AlignerNaturesDto) {
    return this.natures.aligner(user.tenantId, dto.compteIds);
  }
}

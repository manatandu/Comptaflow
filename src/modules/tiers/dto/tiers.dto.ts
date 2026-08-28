import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { TypeTiers } from '@prisma/client';

export class CreerTiersDto {
  @IsEnum(TypeTiers)
  type!: TypeTiers;

  @Matches(/^\S+$/, { message: 'Le code ne doit pas contenir d’espaces' })
  code!: string;

  @IsString()
  nom!: string;

  @IsOptional()
  @IsUUID()
  modeleReglementId?: string;
}

export class ModifierTiersDto {
  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsBoolean()
  estActif?: boolean;

  // null explicite = détache le modèle de règlement courant
  @IsOptional()
  @IsUUID()
  modeleReglementId?: string | null;
}

export class RattacherCompteDto {
  @IsUUID()
  compteId!: string;

  @IsOptional()
  @IsBoolean()
  estPrincipal?: boolean;
}

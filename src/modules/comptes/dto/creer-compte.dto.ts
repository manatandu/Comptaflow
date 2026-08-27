import { IsBoolean, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { ClasseCompte } from '@prisma/client';

export class CreerCompteDto {
  @Matches(/^\d{3,8}$/, { message: 'Le numéro de compte doit être numérique (3 à 8 chiffres)' })
  numero!: string;

  @IsString()
  intitule!: string;

  @IsEnum(ClasseCompte)
  classe!: ClasseCompte;
}

export class ModifierCompteDto {
  @IsOptional()
  @IsString()
  intitule?: string;

  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

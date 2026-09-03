import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SensModeleSaisie } from '@prisma/client';

export class LigneModeleSaisieDto {
  @IsString()
  compteId!: string;

  @IsEnum(SensModeleSaisie)
  sens!: SensModeleSaisie;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;

  /**
   * Facultatif, et c'est tout l'intérêt · un modèle pose les comptes, il ne
   * fige une somme que pour les écritures dont le montant ne varie pas.
   */
  @IsOptional()
  @IsNumber()
  montant?: number;
}

export class CreerModeleSaisieDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  intitule!: string;

  /** Absent = modèle proposé dans TOUS les journaux du dossier. */
  @IsOptional()
  @IsString()
  journalId?: string;

  @IsArray()
  // DEUX LIGNES AU MOINS · un modèle d'une seule ligne ne pose aucune
  // contrepartie, il ne fait donc gagner qu'un compte sur deux et laisse la
  // grille déséquilibrée à coup sûr.
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => LigneModeleSaisieDto)
  lignes!: LigneModeleSaisieDto[];
}

export class ModifierModeleSaisieDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  intitule?: string;

  @IsOptional()
  @IsString()
  journalId?: string | null;

  @IsOptional()
  @IsBoolean()
  estActif?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => LigneModeleSaisieDto)
  lignes?: LigneModeleSaisieDto[];
}

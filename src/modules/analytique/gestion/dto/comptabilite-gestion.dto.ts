import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FacultatifNonNul } from '../../../../common/facultatif-non-nul';

export const COMPORTEMENTS = ['CHARGE_FIXE', 'CHARGE_VARIABLE', 'CHARGE_SEMI_VARIABLE', 'PRODUIT_ACTIVITE', 'HORS_CALCUL'] as const;

export class DeclarationComportementDto {
  @IsUUID()
  compteId!: string;

  /** null efface la déclaration (retour à « non déclaré »). */
  @IsOptional()
  @IsIn(COMPORTEMENTS)
  comportement?: (typeof COMPORTEMENTS)[number] | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  partVariablePct?: number | null;
}

export class DeclarerComportementsDto {
  // Une page de plan comptable, pas davantage · la déclaration se fait par
  // écran, et chaque compte est une mise à jour journalisée.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DeclarationComportementDto)
  declarations!: DeclarationComportementDto[];
}

export class LigneCleDto {
  @IsUUID()
  sectionCibleId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  valeur!: number;
}

export class CreerCleRepartitionDto {
  @IsUUID()
  exerciceId!: string;

  @IsUUID()
  planId!: string;

  @IsUUID()
  sectionSourceId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  libelle!: string;

  @IsIn(['POURCENTAGE', 'UNITES'])
  mode!: 'POURCENTAGE' | 'UNITES';

  @FacultatifNonNul("L'unité se nomme par une chaîne · omettez le champ en pourcentages.")
  @IsString()
  @MaxLength(40)
  unite?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  source!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LigneCleDto)
  lignes!: LigneCleDto[];
}

export class ReprendreClesDto {
  @IsUUID()
  exerciceId!: string;
}

export class RepartirDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La date est une date AAAA-MM-JJ.' })
  date!: string;

  /** Les soldes par compte que l'écran a montrés · confrontés au calcul rejoué. */
  @IsObject()
  soldes!: Record<string, number>;
}

export class DeclarerCoutProductionDto {
  @IsUUID()
  exerciceId!: string;

  @IsUUID()
  sectionId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  unite!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  capaciteNormale!: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  activiteReelle!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  quantiteProduite?: number | null;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  source!: string;
}

import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

export class LigneOdAnalytiqueDto {
  @IsString()
  sectionId!: string;

  @IsOptional()
  @IsNumber()
  debit?: number;

  @IsOptional()
  @IsNumber()
  credit?: number;
}

export class CreerOdAnalytiqueDto {
  @IsString()
  exerciceId!: string;

  @IsString()
  planId!: string;

  /** Le compte général dont la ventilation est corrigée. */
  @IsString()
  compteId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsString()
  @MinLength(1)
  libelle!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => LigneOdAnalytiqueDto)
  lignes!: LigneOdAnalytiqueDto[];
}

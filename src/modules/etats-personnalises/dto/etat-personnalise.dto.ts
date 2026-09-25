import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class LigneEtatDto {
  @IsString() @MaxLength(20) cle!: string;
  @IsString() @MaxLength(120) libelle!: string;
  @IsOptional() @IsString() @MaxLength(400) racines?: string;
  @IsOptional() @IsIn(['SOLDE', 'MOUVEMENT']) mesure?: 'SOLDE' | 'MOUVEMENT';
  @IsOptional() @IsIn(['DEBIT', 'CREDIT']) sens?: 'DEBIT' | 'CREDIT';
  @IsOptional() @IsString() @MaxLength(400) total?: string;
}

export class EtatPersonnaliseDto {
  @IsString() @MinLength(1) @MaxLength(100) nom!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LigneEtatDto)
  lignes!: LigneEtatDto[];
}

import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

export class LigneEcritureDto {
  @IsUUID()
  compteId!: string;

  @IsOptional()
  @IsString()
  libelle?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  debit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  credit?: number;

  // Taux de TVA appliqué à cette ligne (la ligne de TVA elle-même) — posé
  // par la saisie guidée "Achat/Vente avec TVA" de SaisiePage. Voir
  // TauxTvaService.declaration().
  @IsOptional()
  @IsUUID()
  tauxTvaId?: string;
}

export class CreerEcritureDto {
  @IsUUID()
  exerciceId!: string;

  @IsUUID()
  journalId!: string;

  @IsDateString()
  date!: string;

  @IsString()
  libelle!: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LigneEcritureDto)
  lignes!: LigneEcritureDto[];
}

import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreerTauxTvaDto {
  @IsString()
  code!: string;

  @IsString()
  intitule!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  taux!: number;

  @IsOptional()
  @IsUUID()
  compteCollecteId?: string;

  @IsOptional()
  @IsUUID()
  compteDeductibleId?: string;
}

export class ModifierTauxTvaDto {
  @IsOptional()
  @IsString()
  intitule?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taux?: number;

  @IsOptional()
  @IsUUID()
  compteCollecteId?: string | null;

  @IsOptional()
  @IsUUID()
  compteDeductibleId?: string | null;

  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

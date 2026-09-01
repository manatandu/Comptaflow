import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';
import { NatureActiviteFiscale, SensRetraitementFiscal } from '@prisma/client';

export class CreerRetraitementDto {
  @IsString()
  @MaxLength(60)
  code!: string;

  /** Requis seulement pour une ligne libre · pour un code du catalogue, le sens est celui du catalogue. */
  @IsOptional()
  @IsEnum(SensRetraitementFiscal)
  sens?: SensRetraitementFiscal;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;

  /** Toujours positif · le sens donne la direction. */
  @IsNumber()
  @Min(0.01)
  montant!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  commentaire?: string;
}

export class ModifierRetraitementDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  montant?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  commentaire?: string;
}

export class ModifierDossierFiscalDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  acomptesVerses?: number;

  /** null = OmegaX recalcule depuis les exercices précédents. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  deficitAnterieurSaisi?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(NatureActiviteFiscale)
  natureActivite?: NatureActiviteFiscale | null;
}

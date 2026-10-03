import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
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

  /**
   * Suppléments d'impôt établis par l'Administration · art. 57 bis LPF. Ils
   * entrent dans la base des acomptes du prochain exercice, contestés ou non.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  supplementsAdministration?: number;

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

/**
 * Le clic qui passe l'écriture de l'impôt (ligne A11) · AUCUN MONTANT · le
 * serveur rejoue l'impôt. Le cabinet ne dit que s'il impute ses acomptes et,
 * pour une forme dont l'assujettissement dépend d'un fait non porté au
 * dossier, ce qui le fonde. Un `null` vaut l'absence (rien n'est stocké
 * qu'une chaîne non vide).
 */
export class PasserConstatImpotDto {
  @IsOptional()
  @IsBoolean()
  imputerAcomptes?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  attestationRegime?: string;
}

/** L'annulation (AUDCIF art. 20, al. 2) · motif de 3 à 500 caractères. */
export class AnnulerConstatImpotDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motif!: string;
}

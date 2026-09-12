import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class EnregistrerAccordCadreDto {
  @IsString()
  @MaxLength(200)
  reference!: string;

  @IsDateString()
  dateSignature!: string;

  /**
   * Bornes larges à dessein · la vraie exigence est que la durée soit SAISIE,
   * et c'est le service qui l'oppose en citant l'origine des dix ans souvent
   * cités. Un DTO qui refuserait à sa place rendrait un message sans source.
   */
  @IsInt()
  @Min(1)
  @Max(99)
  dureeAnnees!: number;

  @IsOptional()
  @IsBoolean()
  taciteReconduction?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  preavisMois?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  representationRdc?: string;

  @IsOptional()
  @IsDateString()
  attestationsBonneConduiteLe?: string;
}

export class DeclarerMainOeuvreDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  part!: number;

  /** Exigée · voir le service. OmegaX ne calcule pas cette part. */
  @IsString()
  @MaxLength(300)
  source!: string;

  @IsDateString()
  date!: string;
}

export class DenoncerAccordCadreDto {
  @IsDateString()
  denonceLe!: string;

  @IsString()
  @MaxLength(500)
  motif!: string;
}

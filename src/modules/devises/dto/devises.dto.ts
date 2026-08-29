import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';

export class CreerDeviseDto {
  @IsString()
  @Length(3, 3, { message: 'Le code devise est un code ISO à trois lettres (USD, EUR…)' })
  code!: string;

  @IsString()
  intitule!: string;
}

export class ModifierDeviseDto {
  @IsOptional()
  @IsString()
  intitule?: string;

  @IsOptional()
  @IsBoolean()
  estActive?: boolean;
}

export class PoserCoursDto {
  @IsDateString()
  date!: string;

  /** Combien vaut UNE unité de la devise dans la monnaie de tenue du dossier. */
  @IsNumber()
  @Min(0.000001)
  cours!: number;

  @IsOptional()
  @IsString()
  source?: string;
}

export class ReevaluerDto {
  @IsUUID()
  exerciceId!: string;

  /** Date d'arrêté · à défaut, la clôture de l'exercice. */
  @IsOptional()
  @IsDateString()
  dateReevaluation?: string;

  /** Simulation : calcule et n'écrit rien. */
  @IsOptional()
  @IsBoolean()
  simulation?: boolean;
}

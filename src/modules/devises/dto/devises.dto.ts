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

  /**
   * POSITION GLOBALE DE CHANGE · art. 58 de l'AUDCIF, repris par le cadre
   * conceptuel du SYCEBNL. Retenue, la dotation à la provision est limitée,
   * DEVISE PAR DEVISE, à l'excédent des pertes probables sur les gains
   * latents.
   *
   * Faux par défaut, et ce n'est pas un oubli : le texte subordonne cette
   * limitation à une justification par l'entité, elle ne vaut qu'entre
   * éléments dont l'échéance tombe dans le même exercice (Titre VIII ch. 22
   * § 2.2.3), et elle DIMINUE une provision · un réglage qui allège la
   * prudence ne s'installe pas tout seul.
   */
  @IsOptional()
  @IsBoolean()
  positionGlobale?: boolean;

  /** Simulation : calcule et n'écrit rien. */
  @IsOptional()
  @IsBoolean()
  simulation?: boolean;
}

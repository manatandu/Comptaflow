import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreerBailleurDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  nom!: string;
}

export class ModifierBailleurDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

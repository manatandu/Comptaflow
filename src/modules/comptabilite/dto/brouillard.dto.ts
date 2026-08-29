import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { LigneEcritureDto } from './creer-ecriture.dto';

/**
 * Modification d'une écriture EN BROUILLARD. Les lignes sont remplacées en
 * bloc plutôt que retouchées une à une : une écriture comptable est un tout
 * qui doit rester équilibré, et permettre de modifier une ligne isolément
 * ouvrirait une fenêtre où l'écriture ne l'est plus.
 */
export class ModifierEcritureDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  libelle?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => LigneEcritureDto)
  lignes?: LigneEcritureDto[];
}

/** Validation d'une sélection d'écritures. */
export class ValiderEcrituresDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  ecritureIds!: string[];
}

/**
 * Validation en masse jusqu'à une date · l'équivalent de la validation
 * périodique de Sage. Restreignable à un journal.
 */
export class ValiderJusquaDto {
  @IsUUID()
  exerciceId!: string;

  @IsDateString()
  dateLimite!: string;

  @IsOptional()
  @IsUUID()
  journalId?: string;
}

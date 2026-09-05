import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
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

  /**
   * DÉROGATION NOMINATIVE AU DOUBLE REGARD · le nom du second regard exercé
   * HORS logiciel, et ce qu'il a relu.
   *
   * Une CHAÎNE LIBRE et non un identifiant d'utilisateur : le dossier à un
   * seul comptable fait relire sa pièce par l'expert-comptable du cabinet, le
   * trésorier de l'association ou le représentant légal, qui n'ont pas de
   * compte dans le logiciel. Même gabarit que `Donation.signeePar`, où le
   * signataire du registre des donateurs est nommé et non référencé (SYCEBNL,
   * art. 17).
   *
   * L'APPARIEMENT DES DEUX est refusé par le SERVICE, pas ici : un décorateur
   * de classe rendrait un message qui n'explique pas POURQUOI le motif est
   * exigé, et c'est l'explication qui empêche de le remplir au hasard.
   */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  secondRegardNom?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  secondRegardMotif?: string;
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

  /**
   * DÉROGATION NOMINATIVE AU DOUBLE REGARD · le nom du second regard exercé
   * HORS logiciel, et ce qu'il a relu.
   *
   * Une CHAÎNE LIBRE et non un identifiant d'utilisateur : le dossier à un
   * seul comptable fait relire sa pièce par l'expert-comptable du cabinet, le
   * trésorier de l'association ou le représentant légal, qui n'ont pas de
   * compte dans le logiciel. Même gabarit que `Donation.signeePar`, où le
   * signataire du registre des donateurs est nommé et non référencé (SYCEBNL,
   * art. 17).
   *
   * L'APPARIEMENT DES DEUX est refusé par le SERVICE, pas ici : un décorateur
   * de classe rendrait un message qui n'explique pas POURQUOI le motif est
   * exigé, et c'est l'explication qui empêche de le remplir au hasard.
   */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  secondRegardNom?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  secondRegardMotif?: string;
}

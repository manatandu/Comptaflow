import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class LigneAffectationDto {
  @IsUUID()
  compteId!: string;

  /**
   * Toujours POSITIF · le sens de la ligne se déduit du sens du résultat, et
   * non de la saisie. Une affectation ne comporte pas de montant négatif : on
   * n'affecte pas « moins 300 000 » à une réserve, on affecte un bénéfice ou
   * on impute une perte.
   */
  @IsNumber()
  @Min(0.01)
  montant!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;
}

export class EnregistrerAffectationDto {
  /** L'exercice CLOS dont le résultat est affecté. */
  @IsUUID()
  exerciceId!: string;

  /** Date de la décision de l'organe compétent · celle de l'écriture. */
  @IsDateString()
  dateDecision!: string;

  /**
   * L'organe qui a décidé, tel qu'il se nomme dans les statuts · assemblée
   * générale ordinaire, conseil d'administration, assemblée générale des
   * membres. Le texte comptable ne l'impose pas ; les statuts, si.
   */
  @IsString()
  @MaxLength(200)
  organe!: string;

  /** Référence du procès-verbal · la pièce justificative de l'écriture. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LigneAffectationDto)
  lignes!: LigneAffectationDto[];
}

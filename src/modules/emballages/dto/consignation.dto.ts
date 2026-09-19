import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NatureObjetConsigne, SensConsignation } from '@prisma/client';
import type { ModeDenouement } from '../consignation';

export class CreerConsignationDto {
  @IsUUID()
  tiersId!: string;

  @IsEnum(SensConsignation)
  sens!: SensConsignation;

  /**
   * SAISIE, JAMAIS DÉDUITE · aucun numéro de compte ne dit si l'objet consigné
   * est un casier de bière ou une citerne, et les deux fiches routent la
   * conservation différemment selon la réponse.
   */
  @IsEnum(NatureObjetConsigne)
  nature!: NatureObjetConsigne;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  designation!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantite?: number;

  @IsDateString()
  dateConsignation!: string;

  /** « les sommes FACTURÉES à titre de consignation ». */
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  montant!: number;
}

export class DenouerConsignationDto {
  /** Les trois dénouements que les deux fiches énumèrent, et eux seuls. */
  @IsIn(['RESTITUTION', 'CONSERVATION', 'REPRISE_PRIX_INFERIEUR'])
  mode!: ModeDenouement;

  @IsDateString()
  dateDenouement!: string;

  /**
   * Exigé pour la SEULE reprise sous le prix de consignation · c'est le seul
   * cas où les deux fiches décrivent un écart, et il ne se déduit de rien.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  prixDeReprise?: number;
}

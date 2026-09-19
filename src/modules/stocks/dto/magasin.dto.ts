import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MethodeValorisationStock, SensMouvementStock } from '@prisma/client';

export class CreerArticleStockDto {
  @IsUUID()
  compteId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  designation!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  uniteMesure!: string;

  /**
   * SANS VALEUR PAR DÉFAUT. Le glossaire exige que « celle qui est retenue »
   * soit mentionnée en Notes annexes : une méthode posée d'office par le
   * logiciel ferait publier une mention que personne n'a décidée.
   */
  @IsEnum(MethodeValorisationStock)
  methodeValorisation!: MethodeValorisationStock;
}

export class EnregistrerMouvementStockDto {
  @IsDateString()
  date!: string;

  @IsEnum(SensMouvementStock)
  sens!: SensMouvementStock;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantite!: number;

  /**
   * Coût TOTAL de l'entrée. ABSENT SUR UNE SORTIE, et le service le refuse
   * plutôt que de l'ignorer · stocké puis ignoré, il ferait cohabiter sur la
   * fiche un montant saisi et un montant calculé sans dire lequel fait foi.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cout?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  piece!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;

  /** L'écriture qui porte ce mouvement, en inventaire permanent. */
  @IsOptional()
  @IsUUID()
  ecritureId?: string;
}

export class ComptagePhysiqueDto {
  @IsUUID()
  articleId!: string;

  /**
   * La quantité comptée. Un article non compté ne figure tout simplement pas
   * dans la liste · c'est la seule façon de distinguer « pas encore compté »
   * de « compté à zéro », et le second est une information, pas une absence.
   */
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantitePhysique!: number;

  /**
   * Coût unitaire d'un BONI en P.E.P.S., et SA SOURCE. Réclamés ensemble :
   * aucune source lue ne dit à quelle couche rattacher des unités que les
   * livres n'avaient pas, et c'est la source que le réviseur demandera.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  coutUnitaireBoni?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceCoutBoni?: string;
}

export class ConfronterInventaireDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComptagePhysiqueDto)
  comptages!: ComptagePhysiqueDto[];
}

export class EnregistrerRegularisationInventaireDto extends ConfronterInventaireDto {
  @IsUUID()
  exerciceId!: string;

  /**
   * NON DEVINÉ · aucun des deux textes ne nomme le journal où la
   * régularisation se pose. C'est un choix d'organisation du cabinet.
   */
  @IsUUID()
  journalId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

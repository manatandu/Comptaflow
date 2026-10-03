import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { NatureCreanceDouteuse } from '@prisma/client';

/**
 * Une pièce justificative · fiche du compte 49, « courriers et autres
 * protêts, justificatifs du caractère douteux ou litigieux de la créance » ;
 * fiche du compte 65, « notifications de cessation de paiement relevées ou
 * courrier des avocats ». Nature et référence ; la date est facultative.
 */
export class PieceJustificativeDto {
  @IsString()
  @MaxLength(120)
  nature!: string;

  @IsString()
  @MaxLength(200)
  reference!: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}

class MotifEtPiecesDto {
  @IsString()
  @MaxLength(2000)
  motif!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PieceJustificativeDto)
  pieces!: PieceJustificativeDto[];
}

/** Le reclassement d'une créance client au 416 (fiche du compte 41). */
export class ReclasserCreanceDto extends MotifEtPiecesDto {
  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;

  @IsDateString()
  date!: string;

  @IsUUID('4')
  compteCreanceId!: string;

  /** Le 416 choisi · absent, le serveur prend celui qu'il propose. */
  @IsOptional()
  @IsUUID('4')
  compte416Id?: string;

  @IsEnum(NatureCreanceDouteuse)
  nature!: NatureCreanceDouteuse;

  @IsNumber({ maxDecimalPlaces: 2 })
  montant!: number;

  /**
   * K3 · les écritures de VENTE dont la créance est issue, choisies parmi
   * les ventes ouvertes du client (ou proposées sans ambiguïté). Absentes,
   * la créance n'a pas de facture d'origine, et sa TVA ne se récupère pas.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ventesOrigineIds?: string[];
}

/** La revue de la dépréciation à la clôture d'un exercice (fiche du compte 49). */
export class RevoirDepreciationDto extends MotifEtPiecesDto {
  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;

  /** La dépréciation NÉCESSAIRE à la clôture, déclarée · jamais un taux. */
  @IsNumber({ maxDecimalPlaces: 2 })
  depreciationNecessaire!: number;
}

/** La TVA d'une créance irrécouvrable, récupérée sur duplicata (décret n° 011/42, art. 127). */
export class RecuperationTvaDto {
  @IsUUID('4')
  compteTvaId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  tvaRecuperee!: number;

  /**
   * La TVA facturée que l'écran a montrée · FACULTATIVE, le serveur la
   * calcule sur les factures d'origine et refuse un écart de plus d'un
   * centime (K2). Jamais figée depuis l'écran.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  tvaFactureeCreance?: number;

  @IsString()
  @MaxLength(200)
  duplicataReference!: string;

  @IsDateString()
  duplicataDateEnvoi!: string;
}

/** La perte sur créance irrécouvrable (fiche du compte 65). */
export class PerteCreanceDto extends MotifEtPiecesDto {
  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;

  @IsDateString()
  date!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  montant!: number;

  /** Le 651 choisi · absent, le serveur prend celui qu'il propose. */
  @IsOptional()
  @IsUUID('4')
  comptePerteId?: string;

  /** E2 · la récupération de la TVA (O.-L. n° 10/001, art. 52) · absente, la perte passe au TTC entier. */
  @IsOptional()
  @ValidateNested()
  @Type(() => RecuperationTvaDto)
  recuperationTva?: RecuperationTvaDto;
}


/** L'encaissement d'une créance reclassée · D trésorerie / C 416. */
export class RecouvrementCreanceDto extends MotifEtPiecesDto {
  @IsUUID('4')
  exerciceId!: string;

  /** Un journal de trésorerie · son compte reçoit le débit. */
  @IsUUID('4')
  journalId!: string;

  @IsDateString()
  date!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  montant!: number;
}

/** L'annulation d'une revue (AUDCIF art. 20, al. 2) · motif de 3 à 500 caractères. */
export class AnnulerRevueDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motif!: string;
}

/** L'annulation d'une perte ou d'un recouvrement (K4 · AUDCIF art. 20, al. 2) · même motif. */
export class AnnulerMouvementDto extends AnnulerRevueDto {}

/**
 * DOSSIER REPRIS · la créance déjà au 416 et sa dépréciation déjà au 491
 * avant OmegaX, déclarées au premier jour de l'exercice choisi, sans écriture.
 */
export class DeclarerCreanceOuvertureDto {
  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  compteCreanceId!: string;

  @IsUUID('4')
  compte416Id!: string;

  @IsEnum(NatureCreanceDouteuse)
  nature!: NatureCreanceDouteuse;

  @IsNumber({ maxDecimalPlaces: 2 })
  montant!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  depreciationOuverture!: number;

  @IsString()
  @MaxLength(500)
  source!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  motif?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PieceJustificativeDto)
  pieces?: PieceJustificativeDto[];

  /**
   * M-e · les ventes d'origine, quand elles sont tenues dans OmegaX
   * (exercice antérieur gardé) · seules elles ouvrent la récupération de la
   * TVA à la perte. Absentes, aucune TVA ne se récupère dans le module.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ventesOrigineIds?: string[];
}

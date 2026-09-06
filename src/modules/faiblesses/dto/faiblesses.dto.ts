import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { OrigineFaiblesse, QualificationFaiblesse, StatutFaiblesse } from '@prisma/client';

export class CreerRegistreFaiblessesDto {
  @IsUUID()
  exerciceId!: string;

  @IsEnum(OrigineFaiblesse)
  origine!: OrigineFaiblesse;

  @IsString()
  @MaxLength(200)
  libelle!: string;

  /** RECOMMANDATION_EXTERNE seulement · exigés dans ce mode, interdits dans l'autre. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  emetteur?: string;

  @IsOptional()
  @IsDateString()
  dateLettre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceLettre?: string;
}

export class AjouterFaiblesseDto {
  @IsString()
  @MaxLength(40)
  reference!: string;

  @IsString()
  @MaxLength(300)
  intitule!: string;

  /** ISA 265 § 11 a) · « a description of the deficiencies ». */
  @IsString()
  @MaxLength(10000)
  description!: string;

  /**
   * § 11 a) · « an explanation of their potential effects ». Texte, et rien
   * que texte · § A28, « the auditor need not QUANTIFY those effects ».
   */
  @IsString()
  @MaxLength(10000)
  effetPotentiel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  recommandation?: string;

  /** § A7 · indicateurs cochés à titre d'éclairage du jugement. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  indicateursA7?: string[];

  /** RECOMMANDATION_EXTERNE seulement · la qualification portée par la lettre, recopiée. */
  @IsOptional()
  @IsEnum(QualificationFaiblesse)
  qualification?: QualificationFaiblesse;

  /** REVISION_INTERNE seulement · à défaut, l'utilisateur qui saisit. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  constatePar?: string;

  @IsOptional()
  @IsDateString()
  echeanceRemediation?: string;
}

export class QualifierDto {
  @IsEnum(QualificationFaiblesse)
  qualification!: QualificationFaiblesse;

  @IsString()
  @MaxLength(10000)
  justification!: string;
}

export class CommuniquerDto {
  @IsDateString()
  communiqueeLe!: string;

  /** § 9 : les organes de gouvernance. § 10 b) : la direction. */
  @IsString()
  @MaxLength(300)
  communiqueeA!: string;
}

export class ReponseDirectionDto {
  @IsString()
  @MaxLength(10000)
  reponseDirection!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reponseDirectionPar?: string;
}

export class SuivreDto {
  @IsEnum(StatutFaiblesse)
  statut!: StatutFaiblesse;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  verificationCabinet?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  motifNonRemediation?: string;
}

export class ReporterDto {
  @IsUUID()
  registreCibleId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  reference?: string;

  /** § A17 · la description répétée, ou la référence de la communication antérieure. */
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  communicationReconduite?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  motifNonRemediation?: string;

  @IsOptional()
  @IsDateString()
  echeanceRemediation?: string;
}

export class EscaladerDto {
  @IsString()
  @MaxLength(10000)
  motif!: string;
}

export class ClorerRegistreDto {
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  motifCloture?: string;
}

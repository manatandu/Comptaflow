import { IsBoolean, IsDateString, IsEnum, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export enum TypeImport {
  PLAN_COMPTES = 'PLAN_COMPTES',
  BALANCE = 'BALANCE',
  ECRITURES = 'ECRITURES',
}

/**
 * Le fichier arrive en base64 dans le corps JSON plutôt qu'en multipart : une
 * balance d'association tient en quelques dizaines de kilo-octets, et le
 * surcoût de l'encodage ne justifie pas d'ouvrir une seconde voie d'entrée
 * dans l'API. La borne ci-dessous vaut 8 Mo de fichier environ.
 */
const TAILLE_MAX_BASE64 = 11_000_000;

export class AnalyserImportDto {
  @IsEnum(TypeImport)
  type!: TypeImport;

  @IsString()
  nomFichier!: string;

  @IsString()
  @MaxLength(TAILLE_MAX_BASE64, { message: 'Fichier trop volumineux (8 Mo maximum)' })
  contenuBase64!: string;
}

export class ExecuterImportDto extends AnalyserImportDto {
  /** Champ attendu → en-tête de colonne du fichier. */
  @IsObject()
  mapping!: Record<string, string>;

  @IsOptional()
  @IsUUID()
  exerciceId?: string;

  /** Journal d'accueil des écritures ou de l'à-nouveau. */
  @IsOptional()
  @IsUUID()
  journalId?: string;

  /** Date de l'écriture d'à-nouveau ; à défaut, l'ouverture de l'exercice. */
  @IsOptional()
  @IsDateString()
  dateOperation?: string;

  /**
   * Crée à la volée les comptes absents du plan. Faux par défaut : importer
   * une balance dont la moitié des comptes n'existe pas révèle un problème de
   * correspondance qu'il vaut mieux voir que masquer.
   */
  @IsOptional()
  @IsBoolean()
  creerComptesManquants?: boolean;

  /** Simulation : contrôle tout, n'écrit rien. */
  @IsOptional()
  @IsBoolean()
  simulation?: boolean;

  /** Séparateur imposé, sinon détecté. */
  @IsOptional()
  @IsIn([';', ',', '\t'])
  separateur?: string;
}

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

  /**
   * BILAN D'OUVERTURE · la balance importée est-elle celle du bilan
   * d'ouverture, ou une reprise en cours d'exercice ?
   *
   * Vrai (le défaut pour une balance) : l'écriture produite est un À-NOUVEAU.
   * Elle se range dans la colonne « solde d'ouverture » de la balance
   * générale, reste hors des mouvements de l'exercice, et ne porte que des
   * comptes de bilan · « le bilan d'ouverture d'un exercice doit correspondre
   * au bilan de clôture de l'exercice précédent » (AUDCIF art. 34 · SYCEBNL
   * art. 16, 4°), et un bilan ne contient aucun compte de gestion : les
   * classes 6, 7 et 8 ont été soldées sur le compte 13 à la clôture.
   *
   * Faux : reprise en cours d'exercice (on récupère un dossier au 30 juin).
   * Les charges et les produits déjà courus sont alors légitimes, et
   * l'écriture est un mouvement ordinaire.
   */
  @IsOptional()
  @IsBoolean()
  bilanDOuverture?: boolean;

  /** Simulation : contrôle tout, n'écrit rien. */
  @IsOptional()
  @IsBoolean()
  simulation?: boolean;

  /** Séparateur imposé, sinon détecté. */
  @IsOptional()
  @IsIn([';', ',', '\t'])
  separateur?: string;
}

import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

/**
 * Ventilation analytique posée directement en saisie · c'est ainsi que le
 * guide Sage écrit pour une ONG la décrit : « Dans la septième colonne,
 * saisir ou sélectionner la ligne budgétaire concernée par l'opération en
 * cours », puis une huitième colonne pour les codes projets. La ventilation
 * n'est donc pas un écran séparé mais une colonne de la grille.
 */
export class VentilationLigneDto {
  @IsUUID()
  sectionId!: string;

  @IsOptional()
  @IsNumber()
  debit?: number;

  @IsOptional()
  @IsNumber()
  credit?: number;
}

export class LigneEcritureDto {
  @IsUUID()
  compteId!: string;

  @IsOptional()
  @IsString()
  libelle?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  debit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  credit?: number;

  // Taux de TVA appliqué à cette ligne (la ligne de TVA elle-même) · posé
  // par la saisie guidée "Achat/Vente avec TVA" de SaisiePage. Voir
  // TauxTvaService.declaration().
  @IsOptional()
  @IsUUID()
  tauxTvaId?: string;

  // Échéance de la créance ou de la dette portée par cette ligne · alimente la
  // ventilation par échéance des notes annexes (voir LigneEcriture.dateEcheance).
  @IsOptional()
  @IsDateString()
  dateEcheance?: string;

  // Ventilation analytique de la ligne (projet, bailleur). Facultative : sauf
  // plan marqué à ventilation obligatoire, une ligne non ventilée passe et
  // c'est l'état de contrôle des cumuls qui la signale · même parti que Sage,
  // sans quoi la saisie courante d'une petite association deviendrait
  // impraticable.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VentilationLigneDto)
  ventilations?: VentilationLigneDto[];

  // Multidevise · `debit`/`credit` restent exprimés dans la monnaie de tenue
  // du dossier. Ces trois champs conservent l'opération d'origine, ce qui
  // permet de réévaluer la position à la clôture (voir DevisesService).
  @IsOptional()
  @IsUUID()
  deviseId?: string;

  @IsOptional()
  @IsNumber()
  montantDevise?: number;

  @IsOptional()
  @IsNumber()
  coursApplique?: number;
}

export class CreerEcritureDto {
  @IsUUID()
  exerciceId!: string;

  @IsUUID()
  journalId!: string;

  @IsDateString()
  date!: string;

  @IsString()
  libelle!: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LigneEcritureDto)
  lignes!: LigneEcritureDto[];
}

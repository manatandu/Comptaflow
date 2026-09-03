import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MotifImputationOuverture } from '@prisma/client';

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

/**
 * IMPUTATION DIRECTE AUX CAPITAUX PROPRES D'OUVERTURE · l'une des DEUX seules
 * exceptions à la correspondance bilan de clôture / bilan d'ouverture.
 *
 * AUDCIF art. 34 et Titre V ; SYCEBNL art. 16, 4) et cadre conceptuel
 * § 3.3.1.2.4. La règle est qu'on ne peut PAS imputer directement sur les
 * capitaux propres : ni les incidences d'un changement de méthode, ni les
 * charges et produits d'exercices antérieurs omis, qui transitent par le
 * compte de résultat du nouvel exercice. Deux exceptions, et deux seulement,
 * portées par `motif`.
 *
 * LE MONTANT N'EST PAS CALCULÉ ICI. L'impact d'un changement de méthode se
 * détermine « de façon rétrospective, comme si la méthode avait toujours été
 * appliquée » · c'est un travail de reconstitution que le logiciel ne peut pas
 * faire à la place du comptable, et un montant deviné vaudrait pire que rien.
 */
export class ImputationOuvertureDto {
  @IsUUID()
  exerciceId!: string;

  @IsUUID()
  journalId!: string;

  @IsEnum(MotifImputationOuverture)
  motif!: MotifImputationOuverture;

  /**
   * OBLIGATOIRE · les deux textes exigent l'information en Notes annexes, et
   * c'est elle qui rend l'exception vérifiable. Sans elle, une imputation
   * directe aux capitaux propres est indiscernable d'une erreur d'imputation.
   */
  @IsString()
  @MaxLength(2000)
  justification!: string;

  /** Le compte 12 mouvementé · report à nouveau, dans les deux plans. */
  @IsUUID()
  compteReportANouveauId!: string;

  /** La contrepartie · le poste de bilan que le changement ou l'erreur affecte. */
  @IsUUID()
  compteContrepartieId!: string;

  /**
   * Positif = le report à nouveau est DÉBITÉ (diminution des capitaux propres),
   * négatif = crédité. Le signe est porté ici plutôt que par deux champs :
   * une imputation d'ouverture n'a qu'un montant et un sens.
   */
  @IsNumber()
  montant!: number;
}

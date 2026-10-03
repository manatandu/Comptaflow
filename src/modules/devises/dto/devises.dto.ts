import { Type } from 'class-transformer';
import { FacultatifNonNul } from '../../../common/facultatif-non-nul';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreerDeviseDto {
  @IsString()
  @Length(3, 3, { message: 'Le code devise est un code ISO à trois lettres (USD, EUR…)' })
  code!: string;

  @IsString()
  intitule!: string;
}

export class ModifierDeviseDto {
  @IsOptional()
  @IsString()
  intitule?: string;

  @IsOptional()
  @IsBoolean()
  estActive?: boolean;
}

export class PoserCoursDto {
  @IsDateString()
  date!: string;

  /** Combien vaut UNE unité de la devise dans la monnaie de tenue du dossier. */
  @IsNumber()
  @Min(0.000001)
  cours!: number;

  @IsOptional()
  @IsString()
  source?: string;
}

export class ReevaluerDto {
  @IsUUID()
  exerciceId!: string;

  /** Date d'arrêté · à défaut, la clôture de l'exercice. */
  @IsOptional()
  @IsDateString()
  dateReevaluation?: string;

  /**
   * POSITION GLOBALE DE CHANGE · art. 58 de l'AUDCIF, repris par le cadre
   * conceptuel du SYCEBNL. Retenue, la dotation à la provision est limitée,
   * DEVISE PAR DEVISE, à l'excédent des pertes probables sur les gains
   * latents.
   *
   * Faux par défaut, et ce n'est pas un oubli : le texte subordonne cette
   * limitation à une justification par l'entité, elle ne vaut qu'entre
   * éléments dont l'échéance tombe dans le même exercice (Titre VIII ch. 22
   * § 2.2.3), et elle DIMINUE une provision · un réglage qui allège la
   * prudence ne s'installe pas tout seul.
   */
  @IsOptional()
  @IsBoolean()
  positionGlobale?: boolean;

  /** Simulation : calcule et n'écrit rien. */
  @IsOptional()
  @IsBoolean()
  simulation?: boolean;
}

/**
 * Audit de l'interface du 2026-09-27, C10 · ce corps était typé par un type
 * littéral, que le ValidationPipe ne sait ni filtrer ni vérifier. Une
 * classe décorée le soumet à la liste blanche comme tous les autres.
 */
export class ExtournerReevaluationDto {
  @IsUUID()
  exerciceSuivantId!: string;

  /**
   * La contre-passation INTÉGRALE, banque et caisse comprises (relecture
   * adverse d'A5 bis, M2) · ouverte à la seule écriture des écarts qui ne se
   * partage pas, refusée ailleurs par le service.
   */
  @FacultatifNonNul('La contre-passation intégrale est demandée ou non · omettez le champ pour ne rien demander.')
  @IsBoolean()
  integrale?: boolean;
}

/**
 * ANNULER UNE RÉÉVALUATION (ligne A6, décision D6) · le motif est
 * obligatoire, comme celui de toute correction (AUDCIF art. 20), et va au
 * journal d'audit avec l'enregistrement marqué annulé.
 */
export class AnnulerReevaluationDto {
  @IsString()
  @Length(3, 500)
  motif!: string;
}

/**
 * La contre-passation faite à la main, DÉCLARÉE (A5 bis, troisième tour) ·
 * l'écriture désignée et le motif, au journal d'audit avec la réévaluation.
 * Les vérifications (inversion exacte, place, liens) sont au service.
 */
export class DeclarerContrePassationManuelleDto {
  @IsUUID()
  ecritureId!: string;

  @IsString()
  @Length(3, 500)
  motif!: string;
}

/** Le retrait d'une déclaration · son motif, gardé dans la trace (quatrième tour, m3). */
export class RetirerContrePassationManuelleDto {
  @IsString()
  @Length(3, 500)
  motif!: string;
}

/**
 * Provision pour pertes de change existant à l'ouverture, déclarée par le
 * cabinet (ligne A5, décision de Manasse du 2026-10-02). Le compte, le
 * montant, la date et la SOURCE · la règle complète vit dans
 * `motifRefusDeclarationOuverture`, jouée par le service.
 */
export class DeclarerProvisionOuvertureDto {
  @IsString()
  @Length(3, 4, { message: 'Le compte de provision est une racine (194, 4991 ou 4997)' })
  compteProvision!: string;

  @IsNumber()
  @Min(0)
  montant!: number;

  @IsDateString()
  dateReference!: string;

  @IsString()
  @Length(1, 2000, { message: 'La source du montant déclaré est exigée' })
  source!: string;

  /** Motif d'une nouvelle version · exigé par le service dès qu'une version antérieure existe. */
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  motif?: string;

  /**
   * La provision passée par OmegaX jusqu'à la clôture précédente est déclarée
   * ERRONÉE · seule déclaration qui admet une version sous elle. Le motif de
   * correction ne l'ouvre jamais.
   */
  @FacultatifNonNul('La contestation de la provision du module est vraie ou fausse · omettez le champ pour ne rien contester.')
  @IsBoolean()
  provisionModuleContestee?: boolean;

  /** Motif de la contestation · exigé, non vide, quand elle est déclarée. */
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  motifContestation?: string;
}

/** Une ligne de la ventilation déclarée · l'écart d'une devise sur une banque ou une caisse, en francs, signé. */
export class LigneVentilationDisponibiliteDto {
  @IsUUID()
  compteId!: string;

  @IsUUID()
  deviseId!: string;

  /** Débit moins crédit de l'écart sur le compte, en francs (perte en négatif). */
  @IsNumber()
  ecart!: number;
}

/**
 * VENTILER L'ÉCART DES DISPONIBILITÉS d'une réévaluation antérieure (relecture
 * adverse d'A5 bis, B1) · quand la ligne passée sans devise ne se relit pas
 * au centime, le cabinet déclare l'écart de chaque devise, avec sa SOURCE.
 * La règle complète vit dans `motifRefusVentilationDeclaree`.
 */
export class DeclarerVentilationDisponibilitesDto {
  @IsArray()
  @ArrayMinSize(1, { message: "Déclarez l'écart d'au moins une devise." })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LigneVentilationDisponibiliteDto)
  ventilation!: LigneVentilationDisponibiliteDto[];

  @IsString()
  @Length(3, 2000, { message: 'La source de la ventilation est exigée (pièce, relevé, calcul du cabinet).' })
  source!: string;
}

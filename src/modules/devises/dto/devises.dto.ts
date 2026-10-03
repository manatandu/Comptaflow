import { FacultatifNonNul } from '../../../common/facultatif-non-nul';
import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';

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

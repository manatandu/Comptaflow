import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  Matches,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DecisionEcartInventaire, ModeComparaisonCaisse, RoleMembreInventaire } from '@prisma/client';

export class CreerCampagneDto {
  @IsUUID()
  exerciceId!: string;

  @IsDateString()
  dateInventaire!: string;

  @IsString()
  @MaxLength(200)
  libelle!: string;

  /** Étape 1 · « établir les procédures d'inventaire et de corrections ». */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  instructions?: string;
}

export class ModifierCampagneDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  instructions?: string;
}

export class AjouterSousCommissionDto {
  @IsString()
  @MaxLength(200)
  nom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  perimetre?: string;
}

export class AjouterMembreDto {
  @IsString()
  @MaxLength(200)
  nom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fonction?: string;

  @IsEnum(RoleMembreInventaire)
  role!: RoleMembreInventaire;
}

export class CreerFicheDto {
  @IsUUID()
  compteId!: string;

  @IsOptional()
  @IsUUID()
  sousCommissionId?: string;

  @IsString()
  @MaxLength(300)
  designation!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  emplacement?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  uniteMesure?: string;
}

export class SaisirComptageDto {
  /**
   * Une quantité comptée n'est jamais négative · on compte ce qu'on trouve.
   * Le manquant se lit dans l'écart, pas dans le comptage.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantiteComptee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valeurInventaire?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  referencePiece?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  emplacement?: string;

  @IsOptional()
  @IsUUID()
  sousCommissionId?: string;
}

export class ArbitrerEcartDto {
  @IsEnum(DecisionEcartInventaire)
  decision!: DecisionEcartInventaire;

  /** Exigé pour un écart à redresser · CPCC étape 5, « déterminer le responsable ». */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  responsable?: string;

  /** Exigé pour tout écart NON redressé · sans motif, il est indiscernable d'un écart effacé. */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  explication?: string;
}

/** L'écriture de redressement déjà passée au journal, que l'écart désigne. */
export class RattacherEcritureEcartDto {
  @IsUUID()
  ecritureId!: string;
}

export class EtablirProcesVerbalDto {
  @IsOptional()
  @IsDateString()
  dateEtablissement?: string;
}

/**
 * UNE COUPURE COMPTÉE · valeur faciale et nombre.
 *
 * AJOUT DE L'ÉDITEUR, nommé comme tel : aucun texte lu n'exige la ventilation.
 * Elle est là parce que la fiche du compte 57 dit, dans les deux plans, que
 * « le solde du compte caisse doit toujours correspondre exactement à la somme
 * disponible réellement » · et qu'un nombre écrit à la main ne montre pas
 * comment on est arrivé à la somme.
 */
export class CoupureDto {
  @IsNumber()
  @IsPositive()
  valeurUnitaire!: number;

  @IsInt()
  @IsPositive()
  nombre!: number;
}

/** LE PROCÈS-VERBAL DE COMPTAGE D'UNE CAISSE · un par caisse (CPCC, § VI). */
export class EtablirPvCaisseDto {
  @IsUUID()
  compteId!: string;

  /** Celle qui a compté · ce sont SES membres qui signent. */
  @IsUUID()
  sousCommissionId!: string;

  // Une date CIVILE, sans heure ni fuseau (seconde passe A10, e) · une heure
  // avec décalage déplaçait le jour du comptage d'un côté de minuit.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La date du comptage s’écrit AAAA-MM-JJ, sans heure ni fuseau.' })
  dateComptage!: string;

  /** Ajout de l'éditeur · une caisse bouge dans la journée. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  heureComptage?: string;

  // AUCUN SOLDE COMPTABLE ICI (ligne A10) · le serveur le lit au
  // livre-journal à la date du comptage et le fige. Reçu de l'écran, il
  // laissait figer n'importe quel chiffre ; envoyé quand même, il est refusé
  // par la liste blanche du pipe de validation.

  // L'UNITÉ LUE À L'APERÇU (second tour A10) · les espèces sont saisies dans
  // l'unité que l'aperçu a annoncée. Une ligne validée entre l'aperçu et la
  // création peut faire basculer la caisse de la devise aux francs · les
  // espèces comptées en dollars seraient alors figées contre un solde en
  // francs, écart faux sans un mot. Le serveur compare et refuse en 409.
  @IsEnum(ModeComparaisonCaisse)
  modeComparaison!: ModeComparaisonCaisse;

  /** La devise annoncée par l'aperçu, `null` hors comparaison en devise. */
  @IsOptional()
  @IsUUID()
  deviseId?: string | null;

  @IsNumber()
  @Min(0)
  especesComptees!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoupureDto)
  coupures?: CoupureDto[];

  /** CPCC · « Si oui, une attestation a-t-elle été établie ? ». */
  @IsOptional()
  @IsDateString()
  attestationEtablieLe?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  attestationPar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  observations?: string;
}

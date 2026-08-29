import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';
import { ModeAmortissement } from '@prisma/client';

export class CreerFamilleDto {
  @IsString()
  code!: string;

  @IsString()
  intitule!: string;

  @IsUUID('4')
  compteImmobilisationId!: string;

  @IsUUID('4')
  compteAmortissementId!: string;

  @IsUUID('4')
  compteDotationId!: string;

  @IsPositive()
  dureeAmortissementAns!: number;

  @IsOptional()
  @IsEnum(ModeAmortissement)
  modeAmortissement?: ModeAmortissement;
}

export class ModifierFamilleDto {
  @IsOptional()
  @IsString()
  intitule?: string;

  @IsOptional()
  @IsPositive()
  dureeAmortissementAns?: number;

  @IsOptional()
  estActif?: boolean;
}

export class CreerImmobilisationDto {
  @IsUUID('4')
  familleId!: string;

  @IsString()
  designation!: string;

  @IsOptional()
  @IsString()
  numeroInventaire?: string;

  @IsDateString()
  dateAcquisition!: string;

  @IsDateString()
  dateMiseEnService!: string;

  @IsNumber()
  @IsPositive()
  valeurOrigine!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valeurResiduelle?: number;

  @IsOptional()
  @IsPositive()
  dureeAmortissementAns?: number; // sinon, valeur par défaut de la famille

  // Financement de l'acquisition · l'écriture générée débite le compte
  // d'immobilisation (valeurOrigine) et crédite ce compte de contrepartie
  // (trésorerie, fournisseur, dotation/fonds selon le mode de financement ·
  // voir le commentaire de ImmobilisationService.creer).
  @IsUUID('4')
  compteContrepartieId!: string;

  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;
}

export class PasserDotationDto {
  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;
}

export enum TypeSortie {
  CESSION = 'CESSION',
  MISE_HORS_SERVICE = 'MISE_HORS_SERVICE',
}

export class SortirImmobilisationDto {
  @IsDateString()
  dateSortie!: string;

  @IsEnum(TypeSortie)
  type!: TypeSortie;

  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;

  // Requis si type = CESSION (produit de la vente) · voir compte 82.
  @IsOptional()
  @IsNumber()
  @Min(0)
  prixCession?: number;

  // Compte encaissant le prix de cession (trésorerie ou tiers) · requis si prixCession renseigné.
  @IsOptional()
  @IsUUID('4')
  compteContrepartieId?: string;
}

import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';
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

  /**
   * AMORTISSEMENT DÉJÀ PRATIQUÉ AVANT L'ENTRÉE DANS LE LOGICIEL.
   *
   * Un bien mis en service en 2020 et repris dans un dossier ouvert en 2026
   * porte déjà six annuités au compte 28. Sans ce chiffre, le logiciel ne
   * connaît que les dotations qu'il a lui-même passées · aucune · et repart
   * de zéro : il amortirait le bien sur cinq ans DE PLUS, et la valeur nette
   * comptable des états ne correspondrait plus au solde du compte 28 repris
   * par le bilan d'ouverture.
   *
   * L'erreur est silencieuse : rien ne casse, les écritures s'équilibrent, et
   * le bien reste sous-amorti aussi longtemps que personne ne recoupe.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  amortissementAnterieur?: number;

  // Financement de l'acquisition · l'écriture générée débite le compte
  // d'immobilisation (valeurOrigine) et crédite ce compte de contrepartie
  // (trésorerie, fournisseur d'investissement, emprunt, capital par dotation,
  // ou fonds affectés en SYCEBNL · voir le commentaire de
  // ImmobilisationService.creer).
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

  /**
   * CESSION COURANTE · sortie imputée en EXPLOITATION (654 / 754) plutôt qu'en
   * hors activités ordinaires (81 / 82).
   *
   * L'AUDCIF exclut du niveau H.A.O. les cessions « fréquentes et
   * récurrentes », dont il donne pour exemples les transporteurs et les
   * loueurs de matériels (Titre VII, COMPTE 81, Exclusions). C'est une
   * qualification de FAIT, propre à l'activité de l'entité : le logiciel ne
   * peut pas la deviner, il la demande.
   *
   * Refusée sur un dossier SYCEBNL (son 654 porte les dons en nature courants
   * reçus à distribuer) et sur une immobilisation financière (654 et 754 n'ont
   * pas de subdivision financière) · voir ImmobilisationService.sortir.
   */
  @IsOptional()
  @IsBoolean()
  cessionCourante?: boolean;
}

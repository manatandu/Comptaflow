import { FacultatifNonNul } from '../../../common/facultatif-non-nul';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import type { NatureTiersRattachement } from '../regularisation.service';
import { PeriodiciteAbonnement, TypeRegularisation } from '@prisma/client';

export class CreerRegularisationDto {
  @IsUUID()
  exerciceId!: string;

  @IsEnum(TypeRegularisation)
  type!: TypeRegularisation;

  @IsString()
  libelle!: string;

  @IsUUID()
  compteChargeProduitId!: string;

  /**
   * Compte 476 ou 477 · à défaut, le service prend le premier compte 476/477
   * de type DETAIL actif du PLAN DU DOSSIER, quel que soit son référentiel.
   * Les deux plans portent ces comptes aux mêmes numéros (AUDCIF, Titre VII,
   * compte 47 ; SYCEBNL, Partie 2 ch. 3, COMPTE 47).
   */
  @IsOptional()
  @IsUUID()
  compteDifferId?: string;

  @IsNumber()
  @Min(0)
  montantTotal!: number;

  @IsDateString()
  periodeDebut!: string;

  @IsDateString()
  periodeFin!: string;

  /** Journal d'accueil des écritures · à défaut le journal général (OD). */
  @IsOptional()
  @IsUUID()
  journalId?: string;

  /**
   * Part différée imposée à la main. Sans elle, le service la calcule au
   * prorata des jours qui débordent l'exercice.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  montantDiffere?: number;

  /**
   * NATURE DU TIERS · obligatoire pour CHARGE_A_PAYER et PRODUIT_A_RECEVOIR,
   * ignorée pour les trois autres types. C'est elle, et non un compte choisi
   * à l'écran, qui décide du sous-compte de rattachement : les deux plans les
   * énumèrent nommément (408, 418, 4286/4287, 4386/4387, 4486/4487) et ne
   * prévoient aucun compte fourre-tout.
   */
  @IsOptional()
  @IsIn(['FOURNISSEURS', 'CLIENTS', 'PERSONNEL', 'ORGANISMES_SOCIAUX', 'ETAT'])
  natureTiers?: NatureTiersRattachement;

  /**
   * TVA d'une charge à payer (4455) ou d'un produit à recevoir (4435), au
   * SYSCOHADA · DÉCLARÉE par le comptable (AUDCIF, Titre VII, fiches des
   * comptes 40 et 41, « si la TVA est récupérable », « si le bien entre dans
   * le champ d'application de la TVA »), jamais posée d'office.
   */
  @FacultatifNonNul('La TVA du rattachement ne peut pas être nulle · omettez le champ, ou indiquez 0.')
  @IsNumber()
  @Min(0)
  montantTva?: number;
}

export class CreerAbonnementDto {
  @IsString()
  code!: string;

  @IsString()
  intitule!: string;

  @IsUUID()
  journalId!: string;

  @IsUUID()
  compteDebitId!: string;

  @IsUUID()
  compteCreditId!: string;

  @IsEnum(PeriodiciteAbonnement)
  periodicite!: PeriodiciteAbonnement;

  @IsDateString()
  dateDebut!: string;

  @IsDateString()
  dateFin!: string;

  @IsNumber()
  @Min(0)
  montant!: number;
}

export class ModifierAbonnementDto {
  @IsOptional()
  @IsString()
  intitule?: string;

  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

export class GenererAbonnementDto {
  @IsUUID()
  exerciceId!: string;

  /** Génère les échéances dues jusqu'à cette date incluse. */
  @IsDateString()
  jusquA!: string;
}

/**
 * Audit de l'interface du 2026-09-27, C10 · ce corps était typé par un type
 * littéral, que le ValidationPipe ne sait ni filtrer ni vérifier. Une
 * classe décorée le soumet à la liste blanche comme tous les autres.
 */
export class ReprendreRegularisationDto {
  @IsUUID()
  exerciceCibleId!: string;
}

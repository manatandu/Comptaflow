import { IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, ValidateIf } from 'class-validator';
import { JeuEtatsFinanciersSycebnl, Referentiel, StatutLicence, SystemeComptableSyscohada, TypeLicence } from '@prisma/client';

/**
 * Création d'un cabinet client depuis la console plateforme. Même pipeline
 * que l'inscription publique (AuthService.register), à une différence près :
 * le mot de passe de l'admin est GÉNÉRÉ (jamais choisi par l'opérateur),
 * renvoyé une seule fois pour être remis au client qui le changera à sa
 * première connexion.
 */
export class CreerCabinetDto {
  @IsString()
  nomEntite!: string;

  /** Adresse de l'ADMIN_CABINET du client · c'est lui qui ouvrira le dossier. */
  @IsEmail()
  emailAdmin!: string;

  /**
   * SYCEBNL (défaut : la clientèle historique est associative) ou SYSCOHADA
   * « niveau tenue » · voir AuthService.register pour ce que chacun sème.
   */
  @IsOptional()
  @IsEnum(Referentiel)
  referentiel?: Referentiel;

  @IsOptional()
  @IsEnum(JeuEtatsFinanciersSycebnl)
  jeuEtatsFinanciersSycebnl?: JeuEtatsFinanciersSycebnl;

  /** Pendant SYSCOHADA · Système normal ou SMT (AUDCIF art. 11 et 13). */
  @IsOptional()
  @IsEnum(SystemeComptableSyscohada)
  systemeComptableSyscohada?: SystemeComptableSyscohada;

  @IsOptional()
  @IsEnum(TypeLicence)
  typeLicence?: TypeLicence;

  /** Échéance de l'abonnement · sans objet pour une licence perpétuelle. */
  @IsOptional()
  @IsDateString()
  dateExpiration?: string;

  @IsOptional()
  @IsString()
  activite?: string;

  @IsOptional()
  @IsString()
  adresse?: string;

  @IsOptional()
  @IsString()
  ville?: string;

  @IsOptional()
  @IsString()
  pays?: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsString()
  devise?: string;

  @IsOptional()
  @IsDateString()
  dateDebutExercice?: string;

  @IsOptional()
  @IsDateString()
  dateFinExercice?: string;

  /**
   * Rattache le nouveau dossier comme CELLULE d'un dossier mère existant
   * (groupe d'établissements d'une même personne morale · une église et ses
   * cellules). Voir GroupeService pour ce que le lien autorise.
   */
  @IsOptional()
  @IsUUID()
  dossierMereId?: string;
}

/**
 * Gestion de la licence d'un cabinet client : suspension/réactivation,
 * changement de type, renouvellement (nouvelle échéance). EXPIREE n'est pas
 * acceptée : l'expiration est un fait de calendrier (dateExpiration passée,
 * voir LicenceService.evaluerLicence), pas un statut qu'on décrète.
 */
export class ModifierLicenceDto {
  @IsOptional()
  @IsEnum(TypeLicence)
  type?: TypeLicence;

  @IsOptional()
  @IsIn([StatutLicence.ACTIVE, StatutLicence.SUSPENDUE])
  statut?: StatutLicence;

  /** '' efface l'échéance (licence perpétuelle) · même convention que les
   *  dates des paramètres du dossier (voir parametres-dossier.dto.ts). */
  @IsOptional()
  @ValidateIf((o) => o.dateExpiration !== '')
  @IsDateString()
  dateExpiration?: string;
}

/**
 * Rattachement (ou détachement, avec null) d'un dossier à un dossier mère.
 * Un seul niveau de groupe : les validations vivent dans
 * PlateformeService.modifierGroupe.
 */
export class ModifierGroupeDto {
  @IsOptional()
  @IsUUID()
  dossierMereId?: string | null;

  /**
   * Plafond de cellules que le dossier (mère) peut créer LUI-MÊME · le
   * paramètre commercial de la licence de groupe. null désactive la
   * création par le siège (tout repasse par la console).
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  plafondCellules?: number | null;
}

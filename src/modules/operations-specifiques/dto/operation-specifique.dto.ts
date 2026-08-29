import { IsDateString, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Proposition d'une écriture-type. Aucun compte ni montant de ligne n'est
 * transmis : ils sont déduits du modèle et des paramètres. Les accepter du
 * client ferait de l'écriture-type une saisie libre déguisée · et lui ferait
 * perdre la seule chose qui la rend vérifiable contre le Guide.
 */
export class ProposerModeleDto {
  @IsString()
  codeModele!: string;

  /**
   * Valeurs des paramètres déclarés par le modèle, par nom.
   * Les valeurs sont normalisées en nombres par le service.
   */
  @IsOptional()
  @IsObject()
  parametres?: Record<string, number>;

  /**
   * Compte retenu, par préfixe du modèle, quand plusieurs comptes du dossier
   * conviennent (une banque parmi plusieurs, l'immobilisation reçue…).
   * Clé = le préfixe tel qu'il figure au catalogue ; valeur = id ou numéro.
   */
  @IsOptional()
  @IsObject()
  comptesChoisis?: Record<string, string>;
}

/** Application effective : la proposition, plus ce qu'exige une écriture réelle. */
export class AppliquerModeleDto extends ProposerModeleDto {
  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;

  @IsDateString()
  date!: string;

  /** Par défaut, le libellé du modèle · qui nomme l'opération du référentiel. */
  @IsOptional()
  @IsString()
  libelle?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}

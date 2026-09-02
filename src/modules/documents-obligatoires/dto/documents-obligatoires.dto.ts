import { IsBoolean, IsDateString, IsObject, IsOptional, IsString, IsNotEmpty, IsUUID } from 'class-validator';

/**
 * Transcription au livre d'inventaire (art. 14). Aucun état n'est transmis
 * par le client : ils sont produits et figés côté serveur. Accepter des états
 * du client ferait du livre d'inventaire document pénalement sanctionné
 * un document dont le contenu serait dicté de l'extérieur.
 */
export class TranscrireInventaireDto {
  @IsUUID('4')
  exerciceId!: string;

  /**
   * « … ainsi que le résumé de l'opération d'inventaire » (art. 14).
   * Facultatif à la transcription et complétable ensuite : l'opération
   * d'inventaire se rédige souvent après l'arrêté des comptes. Son absence
   * est signalée par le rapport de conformité, jamais suppléée.
   */
  @IsOptional()
  @IsString()
  resumeOperationInventaire?: string;
}

export class ResumeInventaireDto {
  @IsString()
  @IsNotEmpty()
  resumeOperationInventaire!: string;
}

/**
 * Établissement du rapport d'activité (art. 16-3). Les quatre sections sont
 * facultatives ICI et contrôlées par le rapport de conformité : le texte
 * exige leur présence, mais un rapport se rédige par passes, et refuser
 * l'enregistrement d'un brouillon pousserait à le rédiger hors application ·
 * donc à ne pas l'avoir du tout au sens de l'article 24.
 */
export class EtablirRapportActiviteDto {
  @IsUUID('4')
  exerciceId!: string;

  /**
   * « la date à laquelle il est établi » (art. 16-3) · elle DÉFINIT, avec la
   * date de clôture, la fenêtre des événements postérieurs à mentionner.
   */
  @IsDateString()
  etabliLe!: string;

  @IsOptional()
  @IsString()
  situationExerciceEcoule?: string;

  @IsOptional()
  @IsString()
  perspectivesDeveloppement?: string;

  @IsOptional()
  @IsString()
  evolutionTresorerie?: string;

  @IsOptional()
  @IsString()
  evenementsPosterieurs?: string;

  /**
   * SECTIONS DU RAPPORT DE GESTION · chemin SYSCOHADA seulement.
   *
   * Un objet libre indexé par la clé de section (voir
   * SECTIONS_RAPPORT_GESTION_AUSCGIE et SECTIONS_RAPPORT_GESTION_AUSCOOP).
   * Les quatre champs nommés ci-dessus, eux, portent chacun la citation d'un
   * point de l'article 16-3 du SYCEBNL : les réutiliser pour l'AUSCGIE aurait
   * fait porter à une SARL le nom d'un point d'un texte qui ne la régit pas.
   */
  @IsOptional()
  @IsObject()
  sections?: Record<string, string>;

  /** Art. 18 : commande la présence attendue de la déclaration des dirigeants. */
  @IsOptional()
  @IsBoolean()
  entiteAvecAuditeur?: boolean;

  @IsOptional()
  @IsString()
  declarationDirigeants?: string;
}

import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Sage : « un commentaire de 69 caractères » · le champ texte qui accompagne le fichier envoyé. */
export class DeposerDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(69)
  commentaire?: string;
}

export class CommentaireDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(69)
  commentaire?: string | null;
}

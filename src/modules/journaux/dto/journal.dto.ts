import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { NumerotationPiece, TypeJournal } from '@prisma/client';

export class CreerJournalDto {
  // 6 caractères max côté frontend (JournauxPage) · imposé ici aussi pour
  // qu'un appel direct à l'API ne puisse pas contourner cette limite.
  @IsString()
  @Length(1, 6)
  code!: string;

  @IsString()
  intitule!: string;

  @IsEnum(TypeJournal)
  type!: TypeJournal;

  @IsOptional()
  @IsUUID()
  compteTresorerieId?: string;

  @IsOptional()
  @IsEnum(NumerotationPiece)
  numerotation?: NumerotationPiece;
}

export class ModifierJournalDto {
  @IsOptional()
  @IsString()
  intitule?: string;

  @IsOptional()
  @IsUUID()
  compteTresorerieId?: string;

  @IsOptional()
  @IsEnum(NumerotationPiece)
  numerotation?: NumerotationPiece;

  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

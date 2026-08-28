import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { NumerotationPiece, TypeJournal } from '@prisma/client';

export class CreerJournalDto {
  @IsString()
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

import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { ActivitePrincipaleIfrs } from '@prisma/client';

export class ActiviteIfrsDto {
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsEnum(ActivitePrincipaleIfrs) activitePrincipale?: ActivitePrincipaleIfrs | null;
}

export class RegleIfrsDto {
  @IsString() @MaxLength(13) prefixe!: string;
  @IsString() @MaxLength(64) rubrique!: string;
}

export class LigneRetraitementIfrsDto {
  @IsString() @MaxLength(64) rubrique!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) montant!: number;
}

export class RetraitementIfrsDto {
  @IsUUID() exerciceId!: string;
  @IsString() @MaxLength(300) libelle!: string;
  @IsString() @MaxLength(1000) fondement!: string;
  @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => LigneRetraitementIfrsDto) lignes!: LigneRetraitementIfrsDto[];
}

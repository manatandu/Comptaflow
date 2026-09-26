import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

export class LigneLotDto {
  @IsUUID('4') compteId!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) montant!: number;
}

/** La règle se vérifie dans lots-virement.ts (motifRefusLot). */
export class LotVirementDto {
  @IsString() @MaxLength(120) nom!: string;
  @IsOptional() @IsUUID('4') journalId?: string | null;
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => LigneLotDto)
  lignes!: LigneLotDto[];
}

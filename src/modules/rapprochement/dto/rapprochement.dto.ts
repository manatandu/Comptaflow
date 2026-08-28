import { ArrayMinSize, IsArray, IsDateString, IsNumber, IsUUID } from 'class-validator';

export class OuvrirRapprochementDto {
  @IsUUID('4')
  compteId!: string;

  @IsDateString()
  dateReleve!: string;

  @IsNumber()
  soldeReleve!: number;
}

export class PointerDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ligneIds!: string[];
}

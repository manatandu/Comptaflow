import { IsNumber, IsObject, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** Les hypothèses se vérifient dans simulateur-budgetaire.ts (motifRefusSimulation). */
export class SimulationBudgetaireDto {
  @IsString() @MinLength(1) @MaxLength(120) nom!: string;
  @IsUUID() exerciceReferenceId!: string;
  @IsUUID() exerciceCibleId!: string;
  @IsNumber() croissanceProduitsPct!: number;
  @IsObject() variations!: Record<string, number>;
  @IsNumber() seuilOrangePct!: number;
  @IsNumber() seuilRougePct!: number;
}

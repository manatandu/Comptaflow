import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Audit de l'interface du 2026-09-27, C10 · ce corps était typé par un type
 * littéral, que le ValidationPipe ne sait ni filtrer ni vérifier. Une
 * classe décorée le soumet à la liste blanche comme tous les autres.
 */
export class ANouveauxProvisoiresDto {
  @IsOptional()
  @IsBoolean()
  reporterBudgets?: boolean;
}

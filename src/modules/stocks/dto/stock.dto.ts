import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class EnregistrerVariationStocksDto {
  @IsUUID()
  exerciceId!: string;

  /**
   * Le journal où l'écriture se pose. NON DEVINÉ · les deux textes n'en
   * nomment aucun, et le journal des opérations diverses n'est pas un usage
   * universel. C'est un choix d'organisation du cabinet.
   */
  @IsUUID()
  journalId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

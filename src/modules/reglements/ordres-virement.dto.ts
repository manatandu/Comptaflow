import { IsString, MaxLength, MinLength } from 'class-validator';

export class AnnulerOrdreDto {
  @IsString() @MinLength(1) @MaxLength(200) motif!: string;
}

import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class LettrerDto {
  @IsArray()
  @ArrayMinSize(2)
  @IsUUID('4', { each: true })
  ligneIds!: string[];

  /**
   * Autorise un groupe dont le solde n'est pas nul · le lettrage PARTIEL que
   * le CPCC prévoit expressément (« la somme des montants lettrés au débit
   * pouvant être égale, supérieure ou inférieure à celle des montants lettrés
   * au crédit »). Demandé explicitement plutôt que déduit du solde : créer un
   * partiel sans que l'utilisateur l'ait voulu masquerait une erreur de
   * sélection.
   */
  @IsOptional()
  @IsBoolean()
  autoriserPartiel?: boolean;
}

/** Complète un groupe PARTIEL · une seule ligne suffit (le règlement du solde). */
export class CompleterLettrageDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ligneIds!: string[];
}

export class VerrouillerLettrageDto {
  @IsBoolean()
  verrouille!: boolean;
}

export class DelettrerDto {
  @IsString()
  lettre!: string;
}

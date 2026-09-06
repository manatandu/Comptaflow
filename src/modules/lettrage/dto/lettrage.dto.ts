import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OrigineLettrage } from '@prisma/client';

export class LettrerDto {
  @IsArray()
  @ArrayMinSize(2)
  @IsUUID('4', { each: true })
  ligneIds!: string[];

  /**
   * Autorise un groupe dont le solde n'est pas nul · le lettrage PARTIEL que
   * le CPCC prévoit expressément (organisation comptable, chapitre du lettrage :
   * « la somme des montants lettrés au débit
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

/**
 * Un groupe rejoué depuis le pré-lettrage. L'ORIGINE est reprise de la
 * proposition, jamais choisie : elle dit COMMENT le rapprochement a été trouvé,
 * pas qui l'a béni. Le service refuse `MANUEL` ici · un groupe composé à la
 * main passe par le lettrage manuel.
 */
export class GroupePreLettrageDto {
  @IsArray()
  @ArrayMinSize(2)
  @IsUUID('4', { each: true })
  ligneIds!: string[];

  @IsEnum(OrigineLettrage)
  origine!: OrigineLettrage;
}

export class ConfirmerPreLettrageDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GroupePreLettrageDto)
  groupes!: GroupePreLettrageDto[];
}

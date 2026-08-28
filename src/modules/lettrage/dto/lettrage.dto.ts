import { ArrayMinSize, IsArray, IsString, IsUUID } from 'class-validator';

export class LettrerDto {
  @IsArray()
  @ArrayMinSize(2)
  @IsUUID('4', { each: true })
  ligneIds!: string[];
}

export class DelettrerDto {
  @IsString()
  lettre!: string;
}

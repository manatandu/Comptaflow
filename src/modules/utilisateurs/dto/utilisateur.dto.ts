import { IsBoolean, IsEmail, IsEnum, IsOptional, MinLength } from 'class-validator';
import { RoleUtilisateur } from '@prisma/client';

export class CreerUtilisateurDto {
  @IsEmail()
  email!: string;

  @MinLength(10, { message: 'Le mot de passe doit contenir au moins 10 caractères' })
  motDePasse!: string;

  @IsEnum(RoleUtilisateur)
  role!: RoleUtilisateur;
}

export class ModifierUtilisateurDto {
  @IsOptional()
  @IsEnum(RoleUtilisateur)
  role?: RoleUtilisateur;

  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

export class ReinitialiserMotDePasseDto {
  // Même longueur minimale qu'à la création · l'administrateur ne doit pas
  // pouvoir poser un mot de passe plus faible que celui qu'on exige du
  // titulaire.
  @MinLength(10, { message: 'Le mot de passe doit contenir au moins 10 caractères' })
  motDePasseProvisoire!: string;
}

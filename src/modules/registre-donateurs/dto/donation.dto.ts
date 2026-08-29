import { IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { ModeLiberation, NatureLiberalite, TypeDonateur } from '@prisma/client';

/**
 * Inscription d'une libéralité au registre des donateurs (art. 17).
 *
 * Ce qui est OBLIGATOIRE ici se limite à ce sans quoi la ligne ne serait pas
 * une ligne de registre : une date, une nature, un montant, un mode de
 * libération et un donateur nommé. Les autres mentions de l'article 17
 * (domicile, adresse électronique, immatriculation, NIF, siège) sont
 * facultatives à la SAISIE et vérifiées par le RAPPORT DE CONFORMITÉ.
 *
 * Ce choix est commandé par le texte, pas par le confort : l'article 18
 * organise un rapport de l'auditeur qui « donne son avis sur sa tenue
 * conforme » · le référentiel envisage donc expressément un registre dont la
 * conformité se constate a posteriori. Et l'article 24 sanctionne les
 * dirigeants « qui n'ont pas tenu et mis à jour le registre des donateurs » :
 * refuser un don réel parce que l'adresse électronique du donateur est
 * inconnue pousserait à ne l'inscrire NULLE PART, ce qui est l'infraction
 * elle-même. On inscrit, puis on signale.
 */
export class InscrireDonationDto {
  /** Art. 17, point 1 : « la date de l'opération ». */
  @IsDateString()
  dateOperation!: string;

  @IsEnum(NatureLiberalite)
  nature!: NatureLiberalite;

  @IsEnum(TypeDonateur)
  typeDonateur!: TypeDonateur;

  // --- Art. 17, point 2 : personnes physiques donatrices ---
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nom?: string;

  @IsOptional()
  @IsString()
  prenoms?: string;

  @IsOptional()
  @IsString()
  domicile?: string;

  // --- Art. 17, point 3 : personnes morales donatrices ---
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  denomination?: string;

  @IsOptional()
  @IsString()
  numeroImmatriculation?: string;

  @IsOptional()
  @IsString()
  numeroIdentificationFiscale?: string;

  @IsOptional()
  @IsString()
  adresseSiegeSocial?: string;

  /** Exigée par l'art. 17 pour les deux types de donateur. */
  @IsOptional()
  @IsString()
  adresseElectronique?: string;

  // --- Art. 17, point 4 : montant et mode de libération ---
  @IsNumber()
  @IsPositive()
  montant!: number;

  @IsEnum(ModeLiberation)
  modeLiberation!: ModeLiberation;

  @IsOptional()
  @IsString()
  designationNature?: string;

  /** Rattachement facultatif à l'écriture comptable correspondante. */
  @IsOptional()
  @IsUUID('4')
  ecritureId?: string;
}

/**
 * Correction d'une ligne. Le NUMÉRO et la DATE D'OPÉRATION n'y figurent pas :
 * le numéro fonde la continuité exigée par l'art. 17 et la date fonde le
 * rattachement à l'exercice · les deux se corrigent par annulation puis
 * réinscription, jamais par retouche.
 */
export class ModifierDonationDto {
  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsString()
  prenoms?: string;

  @IsOptional()
  @IsString()
  domicile?: string;

  @IsOptional()
  @IsString()
  denomination?: string;

  @IsOptional()
  @IsString()
  numeroImmatriculation?: string;

  @IsOptional()
  @IsString()
  numeroIdentificationFiscale?: string;

  @IsOptional()
  @IsString()
  adresseSiegeSocial?: string;

  @IsOptional()
  @IsString()
  adresseElectronique?: string;

  @IsOptional()
  @IsString()
  designationNature?: string;

  @IsOptional()
  @IsUUID('4')
  ecritureId?: string;
}

/**
 * Art. 17 : « Toutes les écritures contenues dans ce registre doivent être
 * signées par le représentant légal de l'entité à but non lucratif. » Le nom
 * du signataire est donc une donnée du registre, pas l'identité de
 * l'utilisateur connecté : c'est le REPRÉSENTANT LÉGAL qui signe, et rien ne
 * garantit qu'il soit lui-même l'opérateur de saisie.
 */
export class SignerDonationDto {
  @IsString()
  @IsNotEmpty()
  signeePar!: string;
}

/**
 * Le motif est obligatoire : une ligne annulée reste au registre avec son
 * numéro (la numérotation doit rester continue · art. 17), donc sa présence
 * doit s'expliquer d'elle-même à qui lira le registre après coup.
 */
export class AnnulerDonationDto {
  @IsString()
  @IsNotEmpty()
  motifAnnulation!: string;
}

export class FiltreRegistreDto {
  @IsOptional()
  @IsUUID('4')
  exerciceId?: string;

  @IsOptional()
  @IsString()
  recherche?: string;

  /**
   * Par défaut les lignes annulées RESTENT visibles : elles font partie du
   * registre (art. 17 · leur numéro est occupé, les masquer par défaut
   * donnerait à lire un registre à trous). La conversion est explicite : le
   * ValidationPipe global n'a pas `enableImplicitConversion`, un `?
   * masquerAnnulees=true` arriverait donc en CHAÎNE et serait rejeté par
   * `@IsBoolean()`.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  masquerAnnulees?: boolean;
}

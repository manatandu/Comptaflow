import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { TypeTiers } from '@prisma/client';

export class CreerTiersDto {
  @IsEnum(TypeTiers)
  type!: TypeTiers;

  @Matches(/^\S+$/, { message: 'Le code ne doit pas contenir d’espaces' })
  code!: string;

  @IsString()
  nom!: string;

  @IsOptional()
  @IsUUID()
  modeleReglementId?: string;

  /*
    COORDONNÉES · elles manquaient, et cela rendait inutilisable une brique
    déjà construite : le module de relances compose des lettres de rappel
    complètes qu'aucun destinataire ne portait. Le Numéro Impôt n'est pas
    décoratif non plus · la liste annuelle des fournisseurs (loi de procédures
    fiscales, art. 47 ter, au plus tard le 31 mars) exige nommément
    « identité, adresse, boîte postale, Numéro Impôt » de chacun.
  */
  @IsOptional()
  @IsString()
  adresse?: string;

  @IsOptional()
  @IsString()
  boitePostale?: string;

  @IsOptional()
  @IsString()
  ville?: string;

  @IsOptional()
  @IsString()
  pays?: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Adresse électronique invalide' })
  email?: string;

  @IsOptional()
  @IsString()
  numeroImpot?: string;

  @IsOptional()
  @IsString()
  contact?: string;

  /*
    CE TIERS EST UNE AUTRE CELLULE DU MÊME GROUPE D'ÉTABLISSEMENTS.

    Un groupe est UNE SEULE personne morale tenue en plusieurs dossiers : une
    vente du siège à une antenne n'est pas une vente, c'est un mouvement
    interne, et l'agrégat doit l'éliminer des deux côtés. AUDCIF art. 107 :
    « Les comptes combinés sont obtenus en procédant aux opérations suivantes :
    cumul des comptes des entités du périmètre [...] ; élimination des comptes
    réciproques : actifs et passifs, charges et produits ; neutralisation des
    résultats provenant d'opérations effectuées entre les entités du
    périmètre. »

    Rien dans un compte 411 ne dit si son titulaire est un client ou une
    antenne · ce champ le dit. Le tenant visé n'est contraint à rien par la
    base, « même dossier mère » ne s'exprimant pas en SQL : c'est
    TiersService qui refuse un rattachement hors groupe. L'accepter ferait
    éliminer de l'agrégat des opérations conclues avec un vrai tiers, donc
    hors du périmètre que l'art. 107 vise.
  */
  @IsOptional()
  @IsUUID()
  celluleGroupeId?: string;

  /*
    CE FOURNISSEUR ACQUITTE LA TVA D'APRÈS LES DÉBITS · la mention se lit sur
    sa facture, et nulle part ailleurs. Décret n° 011/42, art. 60 : « La
    mention "Autorisation d'acquitter la TVA d'après les débits" doit figurer
    sur toutes les factures du prestataire ou entrepreneur autorisé. » Aucun
    calcul ne peut l'établir, d'où une saisie.

    Ce qu'elle change pour le CLIENT : l'art. 37 de l'O.-L. n° 10/001 date son
    droit à déduction sur l'exigibilité CHEZ LE FOURNISSEUR (« Le droit à
    déduction naît lorsque la taxe devient exigible chez l'assujetti »), et
    l'art. 26 rend la taxe du fournisseur autorisé exigible à l'inscription au
    débit du compte du client, non à l'encaissement.

    FAUX PAR DÉFAUT, et c'est le droit commun · l'autorisation est
    l'exception, accordée sur demande par le Directeur Général des Impôts
    (art. 26). Un tiers qui n'en porte pas reste traité comme hier.
  */
  @IsOptional()
  @IsBoolean()
  autoriseTvaDebits?: boolean;

  /*
    Référence de la décision qui accorde l'autorisation · l'art. 26 la veut
    nominative et prise par le Directeur Général des Impôts ou son délégué en
    province, et l'art. 59 du décret n° 011/42 admet même une autorisation
    tacite passé dix jours. Facultative : la mention de l'art. 60 suffit à
    dater l'exigibilité, la référence sert à la justifier au contrôle.
  */
  @IsOptional()
  @IsString()
  referenceAutorisationDebits?: string;
}

export class ModifierTiersDto {
  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsBoolean()
  estActif?: boolean;

  // null explicite = détache le modèle de règlement courant
  @IsOptional()
  @IsUUID()
  modeleReglementId?: string | null;

  /*
    COORDONNÉES · elles manquaient, et cela rendait inutilisable une brique
    déjà construite : le module de relances compose des lettres de rappel
    complètes qu'aucun destinataire ne portait. Le Numéro Impôt n'est pas
    décoratif non plus · la liste annuelle des fournisseurs (loi de procédures
    fiscales, art. 47 ter, au plus tard le 31 mars) exige nommément
    « identité, adresse, boîte postale, Numéro Impôt » de chacun.
  */
  @IsOptional()
  @IsString()
  adresse?: string;

  @IsOptional()
  @IsString()
  boitePostale?: string;

  @IsOptional()
  @IsString()
  ville?: string;

  @IsOptional()
  @IsString()
  pays?: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Adresse électronique invalide' })
  email?: string;

  @IsOptional()
  @IsString()
  numeroImpot?: string;

  @IsOptional()
  @IsString()
  contact?: string;

  /*
    CE TIERS EST UNE AUTRE CELLULE DU MÊME GROUPE · voir CreerTiersDto pour le
    fondement (AUDCIF art. 107, élimination des comptes réciproques du
    périmètre). null explicite = ce compte redevient un tiers ordinaire, et
    ses opérations rentrent dans l'agrégat.
  */
  @IsOptional()
  @IsUUID()
  celluleGroupeId?: string | null;

  /*
    AUTORISATION D'ACQUITTER LA TVA D'APRÈS LES DÉBITS · voir CreerTiersDto.
    Elle se retire aussi bien qu'elle se pose : l'art. 63 du décret n° 011/42
    la dit « révocable sur simple demande écrite du contribuable souhaitant
    revenir au régime de droit commun ».
  */
  @IsOptional()
  @IsBoolean()
  autoriseTvaDebits?: boolean;

  @IsOptional()
  @IsString()
  referenceAutorisationDebits?: string | null;
}

export class RattacherCompteDto {
  @IsUUID()
  compteId!: string;

  @IsOptional()
  @IsBoolean()
  estPrincipal?: boolean;
}

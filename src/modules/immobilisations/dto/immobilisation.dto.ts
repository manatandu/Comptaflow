import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ModeAmortissement, SensDepreciation, TypeComposant } from '@prisma/client';

export class CreerFamilleDto {
  @IsString()
  code!: string;

  @IsString()
  intitule!: string;

  @IsUUID('4')
  compteImmobilisationId!: string;

  @IsUUID('4')
  compteAmortissementId!: string;

  @IsUUID('4')
  compteDotationId!: string;

  @IsPositive()
  dureeAmortissementAns!: number;

  @IsOptional()
  @IsEnum(ModeAmortissement)
  modeAmortissement?: ModeAmortissement;
}

export class ModifierFamilleDto {
  @IsOptional()
  @IsString()
  intitule?: string;

  @IsOptional()
  @IsPositive()
  dureeAmortissementAns?: number;

  @IsOptional()
  estActif?: boolean;
}

export class CreerImmobilisationDto {
  @IsUUID('4')
  familleId!: string;

  @IsString()
  designation!: string;

  @IsOptional()
  @IsString()
  numeroInventaire?: string;

  @IsDateString()
  dateAcquisition!: string;

  @IsDateString()
  dateMiseEnService!: string;

  @IsNumber()
  @IsPositive()
  valeurOrigine!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valeurResiduelle?: number;

  @IsOptional()
  @IsPositive()
  dureeAmortissementAns?: number; // sinon, valeur par défaut de la famille

  /**
   * AMORTISSEMENT DÉJÀ PRATIQUÉ AVANT L'ENTRÉE DANS LE LOGICIEL.
   *
   * Un bien mis en service en 2020 et repris dans un dossier ouvert en 2026
   * porte déjà six annuités au compte 28. Sans ce chiffre, le logiciel ne
   * connaît que les dotations qu'il a lui-même passées · aucune · et repart
   * de zéro : il amortirait le bien sur cinq ans DE PLUS, et la valeur nette
   * comptable des états ne correspondrait plus au solde du compte 28 repris
   * par le bilan d'ouverture.
   *
   * L'erreur est silencieuse : rien ne casse, les écritures s'équilibrent, et
   * le bien reste sous-amorti aussi longtemps que personne ne recoupe.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  amortissementAnterieur?: number;

  // Financement de l'acquisition · l'écriture générée débite le compte
  // d'immobilisation (valeurOrigine) et crédite ce compte de contrepartie
  // (trésorerie, fournisseur d'investissement, emprunt, capital par dotation,
  // ou fonds affectés en SYCEBNL · voir le commentaire de
  // ImmobilisationService.creer).
  @IsUUID('4')
  compteContrepartieId!: string;

  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;

  // --- Approche par composants · facultatif, voir RattachementComposantDto ---
  @IsOptional()
  @IsUUID('4')
  immobilisationPrincipaleId?: string;

  @IsOptional()
  @IsEnum(TypeComposant)
  typeComposant?: TypeComposant;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  justificationDecomposition?: string;

  @IsOptional()
  @IsBoolean()
  dernierRenouvellement?: boolean;
}

export class PasserDotationDto {
  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;
}

/**
 * DÉPRÉCIATION D'UNE IMMOBILISATION · AUDCIF art. 46 et Titre VIII ch. 12 ;
 * SYCEBNL, Partie 2 ch. 3, fiche du COMPTE 29.
 *
 * Les deux comptes sont CHOISIS et non déduits. Le module ne connaît pas la
 * subdivision du 29 que le dossier a ouverte, ni le sous-compte de 69 ou de 79
 * qu'il sert · un compte deviné serait un compte faux dans une balance juste.
 * Le seul contrôle posé côté serveur est le préfixe du compte de dépréciation,
 * que les deux textes écrivent : c'est le 29, jamais le 39 des stocks, le 49
 * des tiers ni le 59 de la trésorerie (fiche du COMPTE 29, « exclusions »).
 */
/**
 * RATTACHEMENT D'UN COMPOSANT · AUDCIF Titre VIII ch. 4 ; SYCEBNL, Partie 2
 * ch. 3, règles générales de la classe 2.
 *
 * Ces champs sont facultatifs et vont ENSEMBLE : une immobilisation créée sans
 * eux est une structure ordinaire, exactement comme avant.
 */
export class RattachementComposantDto {
  /** L'immobilisation principale · absente pour une structure. */
  @IsOptional()
  @IsUUID('4')
  immobilisationPrincipaleId?: string;

  @IsOptional()
  @IsEnum(TypeComposant)
  typeComposant?: TypeComposant;

  /**
   * POURQUOI ce bien est décomposable. Les deux textes posent des conditions
   * qu'aucun logiciel ne peut vérifier · éléments dissociables, utilisations
   * différentes, durées d'utilité différentes, coût évaluable de façon fiable
   * ET significatif, et pour les matériels industriels « des statistiques et
   * autres informations » permettant d'apprécier la durée de chaque élément.
   * Le logiciel ne les devine pas : il les fait écrire.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  justificationDecomposition?: string;

  /**
   * DERNIER RENOUVELLEMENT du composant avant la fin d'utilisation de la
   * structure · c'est le seul cas où le texte admet une valeur résiduelle sur
   * un composant (AUDCIF ch. 4 § 3.3 et § 4.3). Hors ce cas, « la base
   * amortissable NE PEUT ÊTRE DIMINUÉE d'une valeur résiduelle, puisque, par
   * définition, il est prévu qu'il soit remplacé avant la fin de l'utilisation
   * de la structure ».
   */
  @IsOptional()
  @IsBoolean()
  dernierRenouvellement?: boolean;
}

export class DepreciationDto {
  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;

  @IsEnum(SensDepreciation)
  sens!: SensDepreciation;

  /** Toujours positif · le sens porte la direction. */
  @IsNumber()
  @IsPositive()
  montant!: number;

  /** Compte 29 mouvementé · crédité par la dotation, débité par la reprise. */
  @IsUUID('4')
  compteDepreciationId!: string;

  /** Contrepartie de gestion · 69 pour une dotation, 79 pour une reprise. */
  @IsUUID('4')
  compteContrepartieId!: string;

  /**
   * L'indice de perte de valeur retenu. OBLIGATOIRE : sans indice, aucun test
   * n'est requis (ch. 12 § 2.1), donc aucune dotation n'est justifiable, et
   * c'est cette phrase qu'un réviseur demandera.
   */
  @IsString()
  @MaxLength(500)
  indice!: string;
}

/**
 * RENOUVELLEMENT D'UN COMPOSANT · AUDCIF Titre VIII ch. 4 § 4.1.
 *
 * « Lorsqu'un composant identifié à l'origine est renouvelé, le coût de ce
 * renouvellement, dès lors qu'il est significatif, est enregistré à l'actif
 * dans un sous-compte de l'immobilisation principale, et LA VALEUR NETTE
 * COMPTABLE DU COMPOSANT REMPLACÉ EST COMPTABILISÉE au compte 812 Valeurs
 * comptables des cessions d'immobilisations corporelles ou 654 Valeurs
 * comptables des cessions courantes d'immobilisations, selon le cas. »
 *
 * Les deux mouvements vont ensemble · c'est là tout l'intérêt de l'opération.
 * Enregistrer le nouveau sans sortir l'ancien laisse au bilan deux ascenseurs
 * pour une seule cage, et l'écriture reste pourtant équilibrée.
 */
export class RenouvelerComposantDto {
  @IsDateString()
  dateRenouvellement!: string;

  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;

  @IsString()
  designation!: string;

  /** Coût du renouvellement · c'est la valeur d'entrée du nouveau composant. */
  @IsNumber()
  @IsPositive()
  coutRenouvellement!: number;

  @IsUUID('4')
  compteContrepartieId!: string;

  /**
   * Durée d'amortissement du nouveau composant · ch. 4 § 4.4 · elle dépend de
   * ce qui vient après, et le logiciel ne le sait pas : durée jusqu'au
   * prochain remplacement, ou durée d'utilisation résiduelle de la structure
   * s'il n'est plus renouvelé.
   */
  @IsNumber()
  @IsPositive()
  dureeAmortissementAns!: number;

  /** Voir RattachementComposantDto · seul le dernier remplacement en porte une. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  valeurResiduelle?: number;

  @IsOptional()
  @IsBoolean()
  dernierRenouvellement?: boolean;

  /**
   * Sortie de l'ancien en EXPLOITATION (654) plutôt qu'en H.A.O. (812) · voir
   * SortirImmobilisationDto.cessionCourante, même arbitrage et même refus côté
   * serveur pour un dossier SYCEBNL.
   */
  @IsOptional()
  @IsBoolean()
  cessionCourante?: boolean;
}

export enum TypeSortie {
  CESSION = 'CESSION',
  MISE_HORS_SERVICE = 'MISE_HORS_SERVICE',
}

export class SortirImmobilisationDto {
  @IsDateString()
  dateSortie!: string;

  @IsEnum(TypeSortie)
  type!: TypeSortie;

  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;

  // Requis si type = CESSION (produit de la vente) · voir compte 82.
  @IsOptional()
  @IsNumber()
  @Min(0)
  prixCession?: number;

  // Compte encaissant le prix de cession (trésorerie ou tiers) · requis si prixCession renseigné.
  @IsOptional()
  @IsUUID('4')
  compteContrepartieId?: string;

  /**
   * CESSION COURANTE · sortie imputée en EXPLOITATION (654 / 754) plutôt qu'en
   * hors activités ordinaires (81 / 82).
   *
   * L'AUDCIF exclut du niveau H.A.O. les cessions « fréquentes et
   * récurrentes », dont il donne pour exemples les transporteurs et les
   * loueurs de matériels (Titre VII, COMPTE 81, Exclusions). C'est une
   * qualification de FAIT, propre à l'activité de l'entité : le logiciel ne
   * peut pas la deviner, il la demande.
   *
   * Refusée sur un dossier SYCEBNL (son 654 porte les dons en nature courants
   * reçus à distribuer) et sur une immobilisation financière (654 et 754 n'ont
   * pas de subdivision financière) · voir ImmobilisationService.sortir.
   */
  @IsOptional()
  @IsBoolean()
  cessionCourante?: boolean;
}

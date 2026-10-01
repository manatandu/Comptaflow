import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  Max,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { FondementVentilation } from '../ventilation-prix-global';
import {
  MethodeEstimationPartie,
  MethodeDepreciationBienSubventionne,
  NatureReductionSubvention,
  ModeAmortissement,
  NatureLocationAcquisition,
  PeriodiciteLoyer,
  SensDepreciation,
  TypeComposant,
} from '@prisma/client';

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
  /**
   * Le compte du bien (classe 2) OU la famille, l'un des deux · l'écran envoie
   * le compte, la famille reste admise pour les chemins internes
   * (renouvellement, vitrine). Le service refuse les deux ou aucun.
   */
  @IsOptional()
  @IsUUID('4')
  familleId?: string;

  @IsOptional()
  @IsUUID('4')
  compteImmobilisationId?: string;

  @IsString()
  designation!: string;

  @IsOptional()
  @IsString()
  numeroInventaire?: string;

  /** Lieu du bien, au référentiel des lieux du dossier. */
  @IsOptional()
  @IsUUID('4')
  lieuId?: string;

  @IsDateString()
  dateAcquisition!: string;

  /**
   * Absente ou nulle · le bien est acquis et PAS ENCORE mis en service
   * (AUDCIF art. 45), rien ne se dote avant `PATCH :id/mise-en-service`. La
   * colonne est nullable, `null` vaut donc « pas encore » et non un oubli.
   */
  @IsOptional()
  @IsDateString()
  dateMiseEnService?: string | null;

  /**
   * Nature du bien au barème de l'arrêté n° 013/CAB/MIN/FINANCES/2025,
   * art. 2 · clé « section.rang » (`bareme-amortissement-013-2025.ts`). Elle
   * propose une durée, elle n'en impose aucune.
   */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  natureFiscaleCle?: string | null;

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
   * AUDCIF art. 45 · LINEAIRE par défaut, UNITES_DOEUVRE sur demande. L'article
   * admet aussi le dégressif à taux décroissant, que ce module ne couvre pas
   * encore, et INTERDIT deux modes qui n'existent pas dans l'énumération : un
   * mode fondé sur les REVENUS générés par l'actif, et l'amortissement
   * FINANCIER.
   */
  @IsOptional()
  @IsEnum(ModeAmortissement)
  modeAmortissement?: ModeAmortissement;

  /** Le dénominateur de la formule · exigé avec UNITES_DOEUVRE, interdit sans. */
  @IsOptional()
  @IsPositive()
  unitesOeuvrePrevues?: number;

  /** Ce que l'unité compte · « kilomètres », « heures de fonctionnement ». */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  uniteOeuvreLibelle?: string;

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

  /**
   * BIEN REPRIS · déjà au bilan d'ouverture (audit final F32). Son compte 2x
   * et son compte 28 y sont portés par le report à-nouveau · lui poster une
   * écriture d'acquisition doublerait la valeur brute au bilan. La fiche naît
   * donc SANS écriture, et seulement pour un bien acquis avant l'ouverture de
   * l'exercice indiqué. Contrepartie et journal ne servent alors à rien.
   */
  @IsOptional()
  @IsBoolean()
  repris?: boolean;

  // Financement de l'acquisition · l'écriture générée débite le compte
  // d'immobilisation (valeurOrigine) et crédite ce compte de contrepartie
  // (trésorerie, fournisseur d'investissement, emprunt, capital par dotation,
  // ou fonds affectés en SYCEBNL · voir le commentaire de
  // ImmobilisationService.creer). Exigés hors reprise, par le service.
  @IsOptional()
  @IsUUID('4')
  compteContrepartieId?: string;

  @IsUUID('4')
  exerciceId!: string;

  @IsOptional()
  @IsUUID('4')
  journalId?: string;

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

/**
 * LE RELEVÉ D'UNITÉS D'ŒUVRE D'UN EXERCICE.
 *
 * Un nombre et sa provenance · la seconde est exigée, parce que c'est elle que
 * le réviseur demandera. Aucune comptabilité ne porte le compteur d'une
 * machine, et un chiffre sans origine ne vaut pas mieux qu'une estimation.
 */
export class SaisirConsommationDto {
  @IsUUID('4')
  exerciceId!: string;

  /** Les unités de CET exercice, jamais un cumul. */
  @IsPositive()
  unitesConsommees!: number;

  @IsString()
  @MaxLength(500)
  source!: string;
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

  /**
   * FIN DE PROJET DE DÉVELOPPEMENT (SYCEBNL Partie 3 ch. 3 § 2.5) · le compte
   * de fonds affectés aux investissements (162, 163 ou 164) qui reprend le
   * bien. Exigé d'un dossier « projets de développement », refusé ailleurs
   * (`ImmobilisationService.sortir`).
   */
  @IsOptional()
  @IsUUID('4')
  compteFondsProjetId?: string;
}

/**
 * RECLASSEMENT · le changement d'utilisation du ch. 10 § 2.4.
 *
 * Aucun montant ici, et c'est tout le sujet : « les transferts entre la
 * catégorie "Immeubles de placement" et les catégories "Biens immobiliers
 * occupés par leur propriétaire" ou "Stocks" n'ont pas d'incidence sur la
 * valeur comptable du bien immobilier transféré ». Le service vire ce que le
 * bien porte déjà, il ne recalcule rien et n'accepte rien à recalculer.
 */
export class ReclasserImmobilisationDto {
  /** La famille de DESTINATION · ce sont ses comptes que le bien prendra. */
  @IsUUID('4')
  nouvelleFamilleId!: string;

  @IsDateString()
  dateReclassement!: string;

  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;

  /**
   * OBLIGATOIRE, et pas une politesse · le § 1.2 qualifie un immeuble de
   * placement par l'USAGE, que nul solde ne porte, et le § 4.2 fait de ce
   * critère une information de notes annexes. Sans lui, le reclassement est un
   * virement de comptes que personne ne peut justifier deux ans plus tard.
   */
  @IsString()
  @MaxLength(1000)
  motif!: string;

  /**
   * Le compte 29 de DESTINATION · exigé seulement si le bien porte une
   * dépréciation. Il n'est jamais DÉDUIT du nouveau compte d'immobilisation,
   * pour la raison déjà écrite au modèle `DepreciationImmobilisation` : le
   * module ne connaît pas la subdivision que le dossier a ouverte, et un 29
   * deviné serait un compte faux dans une balance juste.
   */
  @IsOptional()
  @IsUUID('4')
  nouveauCompteDepreciationId?: string;
}

/** Option pour le dégressif fiscal · loi n° 23/053, art. 31 à 33. */
export class OptionDegressifDto {
  @IsString()
  categorie!: string;

  /** Art. 31 · « biens neufs », attesté par le cabinet. */
  @IsBoolean()
  bienNeuf!: boolean;

  /**
   * Durée normale d'utilisation de l'arrêté n° 013/2025, en années entières.
   * L'écran la propose depuis la nature du barème que le bien porte ; un
   * écart se SIGNALE en retour (`avertissements`), il ne se refuse pas
   * (arrêté, art. 4). Les bornes de quatre à vingt ans (loi n° 23/053,
   * art. 32, 1°) se jugent au service, avec leur motif, et non ici.
   */
  @IsInt()
  @Min(1)
  @Max(99)
  dureeFiscaleAns!: number;

  /**
   * AMORTISSEMENT EXCEPTIONNEL (loi n° 23/053, art. 36 à 38) · la déclaration
   * de l'art. 36 accompagne l'option ; ses conditions se jugent au service,
   * avec leur motif (`motifRefusDeclarationExceptionnel`).
   */
  @IsOptional()
  @IsBoolean()
  exceptionnel?: boolean;

  @IsOptional()
  @IsBoolean()
  activiteIndustrielle?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  chiffreAffairesExportHt?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  chiffreAffairesTotalHt?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  sourceChiffreAffaires?: string;
}

export class PasserDerogatoireDto {
  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;
}

/** Lieu d'un bien (Sage Immobilisations, « Lieux des biens »). */
export class LieuBienDto {
  @IsString()
  @Matches(/\S/, { message: 'Le code du lieu est obligatoire.' })
  @MaxLength(20)
  code!: string;

  @IsString()
  @Matches(/\S/, { message: 'L’intitulé du lieu est obligatoire.' })
  @MaxLength(120)
  intitule!: string;
}

/**
 * Mettre en service un bien acquis · la date se pose UNE fois. Obligatoire
 * ici, contrairement à la création · « mettre en service sans date » ne veut
 * rien dire.
 */
export class MiseEnServiceDto {
  @IsDateString()
  date!: string;
}

/** Porter un bien à un lieu, ou le retirer de tout lieu (`null`). */
export class AffecterLieuDto {
  @IsOptional()
  @IsUUID('4')
  lieuId?: string | null;
}

/**
 * LE CONTRAT DE LOCATION-ACQUISITION, TEL QUE LU (AUDCIF Titre VIII ch. 8) ·
 * la simulation n'en demande pas davantage, et ne poste rien.
 */
export class SimulerLocationAcquisitionDto {
  @IsUUID('4')
  compteImmobilisationId!: string;

  @IsEnum(NatureLocationAcquisition)
  nature!: NatureLocationAcquisition;

  /** Date de prise d'effet · le preneur peut utiliser le bien (§ 1.3). */
  @IsDateString()
  datePriseEffet!: string;

  @IsInt()
  @Min(1)
  @Max(600)
  dureeMois!: number;

  @IsEnum(PeriodiciteLoyer)
  periodicite!: PeriodiciteLoyer;

  @IsBoolean()
  termeAEchoir!: boolean;

  @IsNumber()
  @IsPositive()
  loyer!: number;

  @IsNumber()
  @Min(0)
  prixOption!: number;

  /** Taux implicite ANNUEL, en fraction (0,0786 pour 7,86 %) · ou la valeur du contrat, l'un des deux. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  tauxAnnuel?: number | null;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  valeurContrat?: number | null;

  @IsBoolean()
  optionRaisonnablementCertaine!: boolean;

  @IsBoolean()
  bienDeFaibleValeur!: boolean;
}

export class CreerLocationAcquisitionDto extends SimulerLocationAcquisitionDto {
  @IsString()
  @MaxLength(200)
  designation!: string;

  @IsOptional()
  @IsString()
  numeroInventaire?: string;

  @IsOptional()
  @IsUUID('4')
  lieuId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  natureFiscaleCle?: string | null;

  /** Durée d'utilité du bien, en années (§ 2.1.6). */
  @IsPositive()
  dureeAmortissementAns!: number;

  @IsString()
  @MaxLength(80)
  reference!: string;

  @IsOptional()
  @IsUUID('4')
  bailleurTiersId?: string;

  @IsDateString()
  dateConclusion!: string;

  /** Coûts directs initiaux du preneur (§ 2.1.5), ajoutés à la dette. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  coutsDirects?: number;

  /** Avantages reçus du bailleur (§ 2.1.5), retranchés. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  avantagesRecus?: number;

  /** Contrepartie des coûts directs nets · exigée dès qu'ils ne sont pas nuls. */
  @IsOptional()
  @IsUUID('4')
  compteContrepartieCoutsId?: string;

  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;
}

/** La clôture d'un contrat de location-acquisition pour un exercice. */
export class ClotureLocationAcquisitionDto {
  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;
}

/** La levée ou la non-levée de l'option d'un contrat de location-acquisition. */
export class DeclarerOptionLocationAcquisitionDto {
  @IsBoolean()
  levee!: boolean;

  /** Non-levée seulement · la sortie du bien se passe dans cet exercice et ce journal. */
  @IsOptional()
  @IsUUID('4')
  exerciceId?: string;

  @IsOptional()
  @IsUUID('4')
  journalId?: string;

  /** Cessions répétitives (loueurs, transporteurs) · résultat d'exploitation (§ 2.1.9 c). */
  @IsOptional()
  @IsBoolean()
  cessionCourante?: boolean;
}

/** La reprise au 799 d'une subvention en nature, pour un exercice. */
export class RepriseSubventionDto {
  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;

  /** Clause d'inaliénabilité d'un bien non amortissable · à défaut, le dixième (fiche du compte 14). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  dureeInalienabiliteAns?: number;
}

/**
 * L'ÉCHANGE D'UN BIEN CONTRE UN AUTRE · Guide d'application SYSCOHADA,
 * Partie 1 ch. 5 § 4.5 · vente de l'ancien au prix de reprise, acquisition du
 * nouveau à « prix de reprise + soulte ».
 */
export class EchangerImmobilisationDto {
  @IsDateString()
  dateEchange!: string;

  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;

  /** Valeur actuelle reconnue au bien donné (prix de reprise). */
  @IsNumber()
  @Min(0)
  prixDeReprise!: number;

  /** Complément en argent · positif s'il est versé, négatif s'il est reçu. */
  @IsNumber()
  soulte!: number;

  /** Créance née de la reprise · 485 (ou 414 pour une cession courante au SYSCOHADA). */
  @IsUUID('4')
  compteCreanceId!: string;

  /** Dette envers le fournisseur du nouveau bien · 481 (ou 404). */
  @IsUUID('4')
  compteFournisseurId!: string;

  @IsOptional()
  @IsBoolean()
  cessionCourante?: boolean;

  // --- Le bien reçu ---
  @IsUUID('4')
  compteImmobilisationId!: string;

  @IsString()
  @MaxLength(200)
  designation!: string;

  @IsOptional()
  @IsString()
  numeroInventaire?: string;

  @IsOptional()
  @IsUUID('4')
  lieuId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  natureFiscaleCle?: string | null;

  @IsOptional()
  @IsPositive()
  dureeAmortissementAns?: number;

  @IsOptional()
  @IsDateString()
  dateMiseEnService?: string | null;
}

/**
 * Lot 5 · rattacher une subvention en numéraire (14) à un ou plusieurs biens
 * (AUDCIF Titre VIII ch. 17 § 3.2, § 4.4).
 */
export class LigneSubventionDto {
  @IsUUID('4')
  immobilisationId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  montant!: number;
}

export class RattacherSubventionDto {
  @IsUUID('4')
  compteSubventionId!: string;

  @IsDateString()
  dateOctroi!: string;

  /** L'acte d'octroi · convention, notification. */
  @IsString()
  @MaxLength(190)
  @Matches(/\S/, { message: "La référence de l'acte d'octroi est obligatoire." })
  reference!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  dureeInalienabiliteAns?: number;

  /** § 4.4 · motif d'une subvention laissée sur la structure d'un bien à composants. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motifSansVentilation?: string;

  @ValidateNested({ each: true })
  @Type(() => LigneSubventionDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  lignes!: LigneSubventionDto[];
}

/** Remboursement (§ 4.3.1) ou subvention non versée (§ 4.7). */
export class ReduireSubventionDto {
  @IsEnum(NatureReductionSubvention)
  nature!: NatureReductionSubvention;

  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;

  @IsDateString()
  date!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  montant!: number;

  @IsUUID('4')
  compteContrepartieId!: string;

  @IsString()
  @MaxLength(500)
  @Matches(/\S/, { message: 'Le motif est obligatoire.' })
  motif!: string;
}

/** § 4.6 · méthode de dépréciation des biens subventionnés, déclarée une fois. */
export class MethodeDepreciationSubventionDto {
  @IsEnum(MethodeDepreciationBienSubventionne)
  methode!: MethodeDepreciationBienSubventionne;
}

/** Un bien du legs (lot 7) · ce que la saisie d'un bien demande, sans contrepartie. */
export class BienDuLegsDto {
  @IsUUID('4')
  compteImmobilisationId!: string;

  @IsString()
  @MaxLength(190)
  @Matches(/\S/, { message: 'La désignation du bien est obligatoire.' })
  designation!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valeurOrigine!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  dureeAmortissementAns?: number;

  @IsOptional()
  @IsDateString()
  dateMiseEnService?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  natureFiscaleCle?: string;
}

/**
 * LE LEGS D'IMMOBILISATIONS GREVÉ DE DETTES (lot 7) · SYCEBNL Partie 3 ch. 2
 * § 1.2.2 · D 2 / C 4861 + C 167, une pièce par bien (décision D-16).
 */
export class RecevoirLegsDto {
  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;

  /** Date de l'acte · « au vu de l'acte » (§ 1.2.2). */
  @IsDateString()
  dateActe!: string;

  @IsString()
  @MaxLength(120)
  @Matches(/\S/, { message: "La référence de l'acte est obligatoire." })
  referenceActe!: string;

  @IsUUID('4')
  compteFondsId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  dettes!: number;

  @IsOptional()
  @IsUUID('4')
  compteDettesId?: string;

  @ValidateNested({ each: true })
  @Type(() => BienDuLegsDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  biens!: BienDuLegsDto[];
}

/** Un bien acquis pour un prix global · son montant, ou la différence. */
export class BienDuPrixGlobalDto {
  @IsUUID('4')
  compteImmobilisationId!: string;

  @IsString()
  @MaxLength(190)
  @Matches(/\S/, { message: 'La désignation du bien est obligatoire.' })
  designation!: string;

  /** Montant à l'acte, valeur attribuable ou valeur directe · absent pour le bien par différence. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  montant?: number;

  @IsOptional()
  @IsBoolean()
  parDifference?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  dureeAmortissementAns?: number;

  @IsOptional()
  @IsDateString()
  dateMiseEnService?: string;
}

export class StockDuFondsDto {
  @IsUUID('4')
  compteId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  montant!: number;
}

/**
 * LA VENTILATION D'UN PRIX GLOBAL (lot 8) · AUDCIF art. 38, Titre VIII
 * ch. 11 § 1.7.1 (ensemble immobilier) et ch. 2 § 7.2.1 (fonds de commerce).
 * Une pièce par bien (décision D-17).
 */
export class AcquerirAPrixGlobalDto {
  @IsUUID('4')
  exerciceId!: string;

  @IsUUID('4')
  journalId!: string;

  @IsDateString()
  dateAcquisition!: string;

  @IsString()
  @MaxLength(120)
  @Matches(/\S/, { message: "La référence de l'acte ou de la facture est obligatoire." })
  referenceActe!: string;

  @IsUUID('4')
  compteContrepartieId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  prix!: number;

  @IsIn(['ENSEMBLE', 'FONDS_DE_COMMERCE'])
  nature!: 'ENSEMBLE' | 'FONDS_DE_COMMERCE';

  /** ENSEMBLE seulement. */
  @IsOptional()
  @IsIn(['ACTE', 'VALEURS_ATTRIBUABLES', 'COMPARAISON_TERRAINS_NUS', 'COUT_RECONSTRUCTION', 'PRIX_DE_MARCHE', 'FORFAIT'])
  fondement?: FondementVentilation;

  /** D'où viennent les valeurs (transactions comparables, devis, expertise) · exigée hors acte. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceValeurs?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motifSansComparaison?: string;

  @ValidateNested({ each: true })
  @Type(() => BienDuPrixGlobalDto)
  @ArrayMaxSize(50)
  biens!: BienDuPrixGlobalDto[];

  /** FONDS_DE_COMMERCE seulement · les stocks repris, ligne de classe 3 sans fiche (décision D-18). */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => StockDuFondsDto)
  @ArrayMaxSize(50)
  stocks?: StockDuFondsDto[];

  /** FONDS_DE_COMMERCE seulement · durée du fonds commercial si elle est limitée (ch. 2 § 7.2.2.1). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  dureeFondsCommercialAns?: number;
}

/**
 * LE REMPLACEMENT IMPRÉVU D'UNE PARTIE NON IDENTIFIÉE À L'ORIGINE (lot 8) ·
 * AUDCIF Titre VIII ch. 4 § 4.2 et § 3.1.2 (décision D-19).
 */
export class RemplacerPartieDto extends RenouvelerComposantDto {
  @IsString()
  @MaxLength(190)
  @Matches(/\S/, { message: 'Nommez la partie remplacée.' })
  designationPartie!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valeurOrigineEstimee!: number;

  @IsIn(['COUT_ACTUEL_A_NEUF', 'POURCENTAGE_IMMOBILISATIONS_RECENTES', 'INFORMATIONS_FOURNISSEURS', 'DEPENSES_DE_RENOUVELLEMENT'])
  methodeEstimation!: MethodeEstimationPartie;

  @IsString()
  @MaxLength(500)
  @Matches(/\S/, { message: "Indiquez la source de l'estimation." })
  sourceEstimation!: string;

  /** La décomposition revue · durées distinctes, coût significatif (art. 38-1). */
  @IsString()
  @MaxLength(500)
  @Matches(/\S/, { message: 'Indiquez pourquoi la structure se décompose.' })
  justificationDecomposition!: string;
}

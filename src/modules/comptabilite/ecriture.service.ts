import { motifLignesTenues } from './lignes-tenues';
import { ecartClasse9, motifRefusClasse9 } from './classe-9-equilibree';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LOT_ECRITURES, LOT_LECTURE, PremiersSelon, lireParLots, pageApres } from '../../common/lecture-par-lots';
import { regrouperSurCollectifs } from '../tiers/collectifs-tiers';
import { PrismaService } from '../../common/prisma.service';
import {
  MotifImputationOuverture,
  Compte,
  NumerotationPiece,
  Prisma,
  Referentiel,
  StatutEcriture,
  StatutExercice,
  TypeCompteDetailTotal,
} from '@prisma/client';
import { CriteresRecherche, filtreRecherche } from './recherche-ecritures';
import { CreerEcritureDto, ImputationOuvertureDto, LigneEcritureDto } from './dto/creer-ecriture.dto';
import { CorrigerEcritureDto } from './dto/corriger-ecriture.dto';
import { ReimputerDto } from './dto/reimputer.dto';
import { dateDansExercice, lignesDeReimputation, motifRefusFusionComptes, motifRefusLigne } from './reimputation';
import { libelleReference, referencesVers } from '../../common/suppression/references';
import { ModifierEcritureDto, ValiderJusquaDto } from './dto/brouillard.dto';
import { JournalService } from '../journaux/journal.service';
import { ExerciceService, refuserSiPeriodeClose } from '../exercice/exercice.service';
import { AnalytiqueService } from '../analytique/analytique.service';
import { avecRetrySerialisable } from '../../common/prisma-retry.util';
import { coursDeLaLigne, motifRefusLigneEnDevise, porteUneDevise } from './ligne-en-devise';
import { designationLettrage, estTenueParUnLettrage } from '../lettrage/ligne-lettree';
import { ouverteALaCloture } from '../lettrage/ouverte-a-la-cloture';
import { ancienneteJours, brouillardInvalidable, enRetardDeCentralisation, JOURS_CENTRALISATION } from './centralisation-brouillard';
import { transactionJournalisee } from '../../common/audit/transaction-journalisee';
import { agregatsParCompte, filtresDesTroisColonnes, lignesDeBalance, totauxDeBalance } from './balance-trois-colonnes';
import { AUCUN_VIREMENT, VirementsParCompte } from '../immobilisations/virements-mise-en-service';
import { exerciceDuDossierOuRefus } from '../../common/exercice-introuvable';

/**
 * Une ligne est au débit si son montant est porté du côté débit · quel que
 * soit son SIGNE. Une correction par inscription en négatif (art. 20 de
 * l'AUDCIF, voir `corrigerParInscriptionEnNegatif`) porte un débit négatif :
 * c'est toujours une ligne de débit, et la tester par `> 0` la rangerait au
 * crédit, avec la contrepartie du mauvais côté dans le grand livre et dans
 * l'export d'audit.
 */
function estLigneDebit(l: { debit: Prisma.Decimal | number }): boolean {
  return Math.abs(Number(l.debit)) > 0.005;
}

/** Une ligne de la balance âgée : un compte de tiers, ses tranches de retard. */
/**
 * Une tranche d'antériorité · elle porte SES DEUX libellés.
 *
 * Les dossiers de révision réels titrent chaque colonne deux fois : la période
 * calendaire exacte (« Du 01/09/2025 au 30/09/2025 ») et l'âge qu'elle
 * représente à la date de référence (« moins de 120 jours »). Les deux
 * servent · la première pour retrouver la facture, la seconde pour apprécier
 * le retard sans compter les mois sur ses doigts.
 */
export interface TrancheAgee {
  cle: string;
  libellePeriode: string;
  libelleAge: string;
}

/** Une ligne de balance âgée · un TIERS, pas un compte. */
export interface LigneAgee {
  cle: string;
  libelle: string;
  codeTiers: string;
  numero: string;
  /** Un montant par tranche, dans l'ordre de `tranches`. Vide pour un créditeur. */
  montants: number[];
  solde: number;
}

/** Une échéance à venir, ligne à ligne · le détail de l'échéancier. */
export interface EcheanceDetail {
  ligneId: string;
  date: Date;
  tranche: string;
  compteNumero: string;
  compteIntitule: string;
  /** Nom du tiers quand le compte lui est rattaché · l'intitulé du compte sinon. */
  tiers: string | null;
  libelle: string;
  reference: string | null;
  montant: number;
  sens: 'ENCAISSEMENT' | 'DECAISSEMENT';
}

/** Une tranche de l'échéancier · ce qui tombe dans une fenêtre de temps. */
export interface TrancheEcheancier {
  cle: string;
  libelle: string;
  /** Bornes en jours à compter de la date de référence · `null` = sans borne. */
  deJours: number | null;
  aJours: number | null;
  encaissements: number;
  decaissements: number;
  /** Encaissements moins décaissements de la tranche. */
  net: number;
  /** Trésorerie projetée à la fin de la tranche, cumul depuis la trésorerie actuelle. */
  tresorerieProjetee: number;
}

/**
 * Règle non négociable du moteur comptable : une écriture n'existe que si
 * total(débit) === total(crédit), et un exercice clôturé n'accepte plus
 * aucune écriture (piste d'audit + intégrité légale). Ces deux contrôles
 * vivent ici, pas côté client, pour rester valables quel que soit le canal
 * d'entrée (UI web, import CSV, API partenaire...).
 */
/**
 * PLAFONDS DE FENÊTRE · mesurés, pas devinés.
 *
 * Banc d'essai du 2026-09-03, dossier d'un million de lignes, tas de 460 Mio
 * (la taille par défaut d'un conteneur Cloud Run) :
 *
 *  · journal sur 15 jours, 41 000 lignes · 6,2 s et 44 Mo de JSON, à la limite
 *  · journal sur 45 jours, 123 000 lignes · `JavaScript heap out of memory`,
 *    PROCESSUS MORT, et avec lui tous les autres dossiers servis par la même
 *    instance
 *  · grand livre complet et liasse Excel complète · morts eux aussi
 *
 * Les états financiers, eux, tiennent en une demi-seconde à un million de
 * lignes : ils sont agrégés par la base (`groupBy`). Le plafond n'est donc
 * pas le volume du dossier, c'est le nombre de lignes qu'UNE fenêtre réclame
 * d'un coup.
 *
 * Deux traitements différents, et la différence est comptable, pas technique :
 *
 *  · le JOURNAL est un écran de TRAVAIL · on peut n'en montrer qu'une tranche,
 *    à condition de le DIRE (`tronque`) et de garder des totaux justes, pris
 *    sur le périmètre entier par un agrégat SQL ;
 *  · le GRAND LIVRE est un livre obligatoire (AUDCIF art. 22, 6° · chemin de
 *    révision). Un grand livre amputé en silence est un document FAUX. On le
 *    REFUSE au-delà du plafond, en disant par où passer.
 */
/**
 * LE PÉRIMÈTRE DU JOURNAL · une seule écriture de ce filtre, deux lecteurs.
 *
 * La fenêtre Journal le lit par tranches ; l'export Excel le lit en flux, du
 * premier au dernier. Écrire le filtre deux fois aurait produit deux journaux
 * plausibles et différents pour les mêmes critères · la fenêtre montrant ce que
 * le fichier ne porte pas, ou l'inverse. C'est le même motif que
 * `calculerPropositions` au lettrage et `construireLigneTva` à la saisie.
 */
export function perimetreJournal(
  tenantId: string,
  filtres: {
    exerciceId?: string;
    journalId?: string;
    dateDebut?: string;
    dateFin?: string;
    inclureBrouillard?: boolean;
  } & CriteresRecherche,
): Prisma.EcritureWhereInput {
  return {
    tenantId,
    ...(filtres.inclureBrouillard === false ? { statut: StatutEcriture.VALIDEE } : {}),
    ...(filtres.exerciceId ? { exerciceId: filtres.exerciceId } : {}),
    ...(filtres.journalId ? { journalId: filtres.journalId } : {}),
    ...(filtres.dateDebut || filtres.dateFin
      ? {
          date: {
            ...(filtres.dateDebut ? { gte: new Date(filtres.dateDebut) } : {}),
            ...(filtres.dateFin ? { lte: new Date(filtres.dateFin) } : {}),
          },
        }
      : {}),
    // Les critères de la recherche d'écritures (compte, montant, pièce,
    // référence, libellé) · voir recherche-ecritures.ts pour leur lecture.
    ...filtreRecherche(filtres),
  };
}

export const PLAFOND_ECRITURES_PAR_FENETRE = 2000;
export const PLAFOND_LIGNES_GRAND_LIVRE = 20000;

/**
 * PÉRIMÈTRES DE LA BALANCE ÂGÉE.
 *
 * L'ANTÉRIORITÉ NE VEUT PAS DIRE LA MÊME CHOSE PARTOUT, et c'est le seul
 * point qui compte dans cet élargissement. Sur un 40 ou un 41, une ligne
 * ancienne est un DÉLAI DE RÈGLEMENT dépassé : le crédit commercial est
 * accordé pour un temps, et le tableau mesure ce temps. Sur un compte de
 * personnel, d'organismes sociaux ou d'État, il n'y a AUCUN crédit commercial
 * · la dette naît à une date et se règle à une échéance légale, et un solde
 * au 31 décembre y est la situation normale (la paie de décembre versée en
 * janvier, les cotisations du quatrième trimestre déclarées après la
 * clôture). Servir le même tableau sans le dire ferait lire un retard de
 * règlement là où il n'y a qu'un calendrier.
 *
 * D'OÙ UNE PHRASE PAR PÉRIMÈTRE, rendue avec l'état · c'est elle qui décide
 * si le cabinet appelle son client ou classe la ligne.
 *
 * LES COMPTES DE TVA SONT ÉCARTÉS DU 44, et c'est le refus de ce chantier.
 * Les 443 (TVA facturée), 444 (TVA due ou crédit de TVA), 445 (TVA
 * récupérable) et 446 (autres taxes sur le chiffre d'affaires) ne portent ni
 * créance ni dette d'échéance : ce sont les termes d'une LIQUIDATION
 * périodique, remise à zéro par la déclaration du mois. Les vieillir
 * produirait une antériorité sur des lignes qui n'ont pas d'échéance, et
 * chaque dossier verrait s'afficher un « retard » massif sur le compte le
 * plus mouvementé de sa classe 4. Le suivi de la TVA a son module.
 *
 * `TOUS` reste le crédit commercial, 40 et 41 · c'est le sens usuel de
 * l'expression, et c'est le périmètre dont la performance est mesurée
 * (docs/capacite-mesuree.md). Les autres périmètres se demandent nommément.
 */
export type PerimetreBalanceAgee =
  | 'TOUS'
  | 'CLIENTS_41'
  | 'FOURNISSEURS'
  | 'PERSONNEL_42'
  | 'SOCIAL_43'
  | 'ETAT_44'
  | 'DIVERS_47';

export const PERIMETRES_BALANCE_AGEE: Record<
  PerimetreBalanceAgee,
  { racines: string[]; exclusions: string[]; libelle: string; lecture: string }
> = {
  TOUS: {
    racines: ['40', '41'],
    exclusions: [],
    libelle: 'Crédit commercial · fournisseurs (40) et clients (41)',
    lecture:
      "Une ligne ancienne est un délai de règlement dépassé : le crédit commercial est accordé pour un temps, " +
      'et ce tableau mesure ce temps.',
  },
  CLIENTS_41: {
    racines: ['41'],
    exclusions: [],
    libelle: 'Clients, adhérents et usagers (41)',
    lecture:
      "Une créance ancienne appelle un rappel, puis une dépréciation : c'est ici que se prépare le passage au " +
      "compte de créances douteuses et l'estimation du risque de non-recouvrement.",
  },
  FOURNISSEURS: {
    racines: ['40'],
    exclusions: [],
    libelle: 'Fournisseurs et comptes rattachés (40)',
    lecture:
      "Une dette ancienne est un retard de paiement, ou une facture réglée sans être lettrée. Les deux se " +
      'traitent, et seule la seconde est une erreur de tenue.',
  },
  PERSONNEL_42: {
    racines: ['42'],
    exclusions: [],
    libelle: 'Personnel (42)',
    lecture:
      "AUCUN CRÉDIT COMMERCIAL ICI · la rémunération naît à une date et se règle à une échéance de paie. Un " +
      "solde à la clôture est NORMAL (la paie de décembre versée en janvier). Ce qui se lit, c'est une ligne " +
      "qui traverse plusieurs paies sans être soldée : une avance jamais retenue, un acompte oublié, une " +
      'opposition non reversée.',
  },
  SOCIAL_43: {
    racines: ['43'],
    exclusions: [],
    libelle: 'Organismes sociaux (43)',
    lecture:
      "AUCUN CRÉDIT COMMERCIAL ICI · les cotisations se déclarent et se règlent à une échéance légale, et un " +
      "solde à la clôture est la situation normale du dernier trimestre. Ce qui se lit, c'est une cotisation " +
      "d'une période ANTÉRIEURE encore ouverte : une déclaration non payée, qui court des majorations.",
  },
  ETAT_44: {
    racines: ['44'],
    // Voir l'en-tête : les comptes de TVA sont une liquidation périodique,
    // pas une créance ou une dette d'échéance.
    exclusions: ['443', '444', '445', '446'],
    libelle: 'État et collectivités publiques (44), hors comptes de TVA',
    lecture:
      "AUCUN CRÉDIT COMMERCIAL ICI · l'impôt naît d'une déclaration et se règle à une échéance légale. Les " +
      "comptes de TVA (443 à 446) sont ÉCARTÉS de ce tableau : ce sont les termes d'une liquidation " +
      "périodique, remise à zéro chaque mois, et les vieillir afficherait un retard qui n'existe pas. Ce qui " +
      "se lit ici, c'est un impôt d'une période antérieure encore ouvert, ou un acompte versé jamais imputé.",
  },
  DIVERS_47: {
    racines: ['47'],
    exclusions: [],
    libelle: 'Débiteurs et créditeurs divers (47)',
    lecture:
      // Citation du Contenu du COMPTE 47 (AUDCIF Titre VII ; même phrase à la
      // fiche 47 du SYCEBNL). « Autres que celles liées à l'activité » est la
      // phrase du COMPTE 45 (organismes internationaux), qu'on lui prêtait à
      // tort jusqu'au 2026-09-30 (passe R1, B1).
      "C'est ici que l'antériorité dit le plus. Le compte 47 enregistre « les opérations EN INSTANCE DE " +
      "RÉGULARISATION » (AUDCIF Titre VII, compte 47) : elles n'ont pas vocation à rester ouvertes. Une " +
      'ligne ouverte depuis plusieurs exercices y appelle la question du réviseur · correspond-elle encore ' +
      "à quelque chose ?",
  },
};


/**
 * Nom d'un module qui retient une écriture, tel que le refus le cite.
 * Exporté pour qu'un module qui défait sa propre opération se nomme par la
 * même chaîne que le refus, jamais par une copie qui divergerait.
 */
export type DetenteurEcriture = string;
export const DETENTEUR_LIQUIDATION_TVA: DetenteurEcriture = 'une liquidation de TVA';
export const DETENTEUR_PAIE_DU_MOIS: DetenteurEcriture = 'la paie du mois (bulletins de paie)';
export const DETENTEUR_RECLASSEMENT_CREANCE: DetenteurEcriture = 'une créance douteuse (reclassement au 416)';
export const DETENTEUR_REVUE_CREANCE: DetenteurEcriture = 'une créance douteuse (revue de la dépréciation)';
export const DETENTEUR_MOUVEMENT_CREANCE: DetenteurEcriture = 'une créance douteuse (perte ou recouvrement)';

/**
 * Suppression demandée PAR le module qui tient l'écriture · audit du serveur
 * du 2026-09-27, B1. `annulerLiquidation` appelait `supprimer`, qui refusait
 * parce qu'une liquidation tenait l'écriture · le module qui défait
 * l'opération était précisément celui que le refus renvoyait vers lui-même,
 * et le verrou anti-double-liquidation n'avait plus de marche arrière.
 */
export interface SuppressionPourLeModule {
  detenteur: DetenteurEcriture;
  liberer: (tx: Prisma.TransactionClient) => Promise<unknown>;
}

/** Une ligne telle que les contrôles d'entrée la lisent · saisie, import ou canevas. */
export interface LigneEntree {
  compteId: string;
  debit?: number;
  credit?: number;
  tauxTvaId?: string | null;
  ventilations?: { sectionId: string; debit?: number; credit?: number }[];
  deviseId?: string | null;
  montantDevise?: number | null;
  coursApplique?: number | null;
}

/** Une pièce soumise aux contrôles d'entrée · voir `EcritureService.controlesDEntree`. */
export interface PieceEntree {
  exerciceId: string;
  journalId: string;
  date: string | Date;
  lignes?: LigneEntree[];
  reporterAuPremierJourOuvert?: boolean;
  /**
   * Faux pour les seuls chemins qui NE PEUVENT PAS porter de ventilation · les
   * deux imports et le canevas du groupe, dont aucun fichier n'a de colonne de
   * section. Exiger la ventilation obligatoire y rendrait l'import impossible
   * à tout dossier qui l'a posée, sans rien lui offrir ; les lignes entrent au
   * brouillard et se ventilent ensuite, et l'état de contrôle des cumuls
   * signale celles qui restent sans répartition. Tous les AUTRES contrôles
   * restent joués.
   */
  exigerVentilationObligatoire?: boolean;
}

/**
 * Le refus d'une date hors de l'exercice, ou null · une règle, un message.
 * Exporté parce que la reprise de balance doit le poser AVANT toute lecture
 * de son fichier (audit du serveur du 2026-09-27, F3) : elle prenait
 * `dateOperation` telle quelle, et un bilan d'ouverture daté de l'année
 * d'avant entrait dans l'exercice courant sans qu'aucun total ne bouge.
 */
export function motifDateHorsExercice(date: Date, exercice: { dateDebut: Date; dateFin: Date }): string | null {
  if (Number.isNaN(date.getTime())) return "La date de l'écriture est illisible.";
  if (date >= exercice.dateDebut && date <= exercice.dateFin) return null;
  return (
    `La date ${date.toISOString().slice(0, 10)} sort de l'exercice sélectionné ` +
    `(${exercice.dateDebut.toISOString().slice(0, 10)} au ${exercice.dateFin.toISOString().slice(0, 10)}) · ` +
    "une écriture est rattachée à l'exercice qu'elle concerne."
  );
}

/**
 * Les données d'UNE ligne saisie, telles qu'elles s'écrivent en base · un seul
 * constructeur pour `creer` et `modifier` (audit du serveur du 2026-09-27, F4).
 *
 * `modifier` recréait ses lignes à la main et en oubliait quatre champs : le
 * montant en devise, le cours appliqué, la devise et la ventilation
 * analytique. Toute retouche d'un brouillard en devise sortait donc l'écriture
 * de la réévaluation de clôture (qui lit `montantDevise` et `coursApplique`),
 * et toute retouche d'une pièce ventilée la sortait du réalisé du bailleur ·
 * sans un message, l'écriture restant équilibrée. Deux listes de champs
 * écrites séparément divergent au premier ajout ; celle-ci est la seule.
 */
export function donneesLigneSaisie(
  l: LigneEcritureDto,
  sectionsParId: Map<string, { planId: string }>,
) {
  return {
    compteId: l.compteId,
    libelle: l.libelle,
    debit: l.debit ?? 0,
    credit: l.credit ?? 0,
    tauxTvaId: l.tauxTvaId,
    dateEcheance: l.dateEcheance ? new Date(l.dateEcheance) : undefined,
    // DATE DU VERSEMENT · elle ne se déduit d'aucune autre. Sans
    // cette ligne, le DTO l'accepte, l'écran l'envoie, et Prisma la
    // laisse tomber en silence : la colonne resterait NULL et le
    // registre des retenues continuerait de dater l'échéance sur
    // l'écriture, ce que les art. 18 et suivants de la loi
    // n° 004/2003 ne veulent pas. Voir le commentaire du schéma.
    dateVersement: l.dateVersement ? new Date(l.dateVersement) : undefined,
    deviseId: l.deviseId,
    montantDevise: l.montantDevise,
    // Saisi, ou déduit des deux montants (audit final F49, ligne-en-devise.ts).
    coursApplique: coursDeLaLigne(l),
    ...(l.ventilations && l.ventilations.length > 0
      ? {
          ventilations: {
            create: l.ventilations.map((v) => ({
              sectionId: v.sectionId,
              planId: sectionsParId.get(v.sectionId)!.planId,
              debit: v.debit ?? 0,
              credit: v.credit ?? 0,
            })),
          },
        }
      : {}),
  };
}

/** La mémoire partagée par les contrôles d'un lot de pièces (audit final F2). */
export type MemoireControles = Map<string, Promise<unknown>>;

/** Lit une fois par clé quand une mémoire est fournie, à chaque appel sinon. */
function memoriser<T>(memoire: MemoireControles | undefined, cle: string, lire: () => Promise<T>): Promise<T> {
  if (!memoire) return lire();
  if (!memoire.has(cle)) memoire.set(cle, lire());
  return memoire.get(cle) as Promise<T>;
}

/**
 * Les comptes d'une pièce, bornés au dossier · avec une mémoire, seuls les
 * comptes jamais vus sont lus, en une requête pour la pièce.
 */
async function comptesDeLaPiece(
  db: Prisma.TransactionClient | PrismaService,
  tenantId: string,
  compteIds: string[],
  memoire?: MemoireControles,
) {
  if (!memoire) return db.compte.findMany({ where: { id: { in: compteIds }, tenantId } });
  const manquants = compteIds.filter((id) => !memoire.has(`compte:${id}`));
  if (manquants.length) {
    const lus = db.compte.findMany({ where: { id: { in: manquants }, tenantId } });
    for (const id of manquants) memoire.set(`compte:${id}`, lus.then((liste) => liste.find((c) => c.id === id) ?? null));
  }
  const comptes = await Promise.all(compteIds.map((id) => memoire.get(`compte:${id}`) as Promise<Compte | null>));
  return comptes.filter((c): c is Compte => c !== null);
}

@Injectable()
export class EcritureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journalService: JournalService,
    private readonly exerciceService: ExerciceService,
    private readonly analytiqueService: AnalytiqueService,
  ) {}


  /**
   * IMPUTATION DIRECTE AUX CAPITAUX PROPRES D'OUVERTURE · l'une des deux
   * seules exceptions à la correspondance bilan de clôture / bilan
   * d'ouverture, et la seule façon légitime de rompre cette correspondance.
   *
   * AUDCIF art. 34 et Titre V ; SYCEBNL art. 16, 4) et cadre conceptuel
   * § 3.3.1.2.4. La convention interdit d'imputer directement sur les capitaux
   * propres les incidences d'un changement de méthode et les charges et
   * produits d'exercices antérieurs omis · ils transitent par le compte de
   * résultat. Deux exceptions seulement :
   *
   *  1. CHANGEMENT_METHODE · « l'impact du changement déterminé à l'ouverture
   *     est imputé en report à nouveau dès l'ouverture de l'exercice », et
   *     seulement pour un changement à IMPACT FORT SIGNIFICATIF ;
   *  2. CORRECTION_ERREUR_SIGNIFICATIVE · « la correction d'une erreur
   *     significative commise au cours d'un exercice antérieur doit être
   *     opérée par ajustement des capitaux propres d'ouverture ».
   *
   * POURQUOI UNE ROUTE À PART, et non une écriture ordinaire sur le compte 12.
   * Parce qu'une imputation directe aux capitaux propres passée comme une
   * écriture quelconque est INDISCERNABLE d'une erreur d'imputation : elle
   * s'équilibre, la balance boucle, et rien ne dit que la rupture de
   * correspondance était voulue ni au titre de quelle exception. Le motif et
   * la justification transforment un mouvement suspect en exception motivée,
   * et c'est précisément ce que les deux textes demandent de dire en Notes
   * annexes.
   *
   * CE QUE LE LOGICIEL NE JUGE PAS · le caractère « fort significatif » du
   * changement, le caractère significatif de l'erreur, et le montant. Le
   * premier est une appréciation, le second aussi, et le troisième suppose de
   * reconstituer les comptes « comme si la méthode avait toujours été
   * appliquée ». Trois choses qu'un logiciel ne peut pas faire à la place du
   * comptable, et dont un calcul deviné vaudrait pire que rien.
   */
  async imputerAuxCapitauxPropresDOuverture(
    tenantId: string,
    createdBy: string,
    dto: ImputationOuvertureDto,
  ) {
    if (!dto.justification.trim()) {
      throw new BadRequestException(
        'La justification est obligatoire : les deux textes exigent que le changement de méthode ou la correction ' +
          "d'erreur soit exposé dans les Notes annexes, et c'est elle qui rend l'exception vérifiable.",
      );
    }
    if (Math.abs(dto.montant) <= 0.005) {
      throw new BadRequestException("Une imputation d'ouverture de montant nul ne corrige rien");
    }

    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce tenant');

    const [ran, contrepartie] = await Promise.all([
      this.prisma.compte.findFirst({ where: { id: dto.compteReportANouveauId, tenantId } }),
      this.prisma.compte.findFirst({ where: { id: dto.compteContrepartieId, tenantId } }),
    ]);
    if (!ran) throw new BadRequestException('Compte de report à nouveau introuvable pour ce tenant');
    if (!contrepartie) throw new BadRequestException('Compte de contrepartie introuvable pour ce tenant');
    // Le compte 12 porte le report à nouveau dans les DEUX plans semés · c'est
    // la seule vérification de compte que les textes permettent de poser ici,
    // et elle empêche de faire passer pour une imputation d'ouverture un
    // mouvement sur un tout autre poste de capitaux propres.
    if (!ran.numero.startsWith('12')) {
      throw new BadRequestException(
        "L'imputation d'ouverture se porte au compte 12 « Report à nouveau ». Les deux textes parlent d'un " +
          'ajustement des capitaux propres D\'OUVERTURE, que le report à nouveau est le seul compte à porter.',
      );
    }
    if (contrepartie.numero.startsWith('6') || contrepartie.numero.startsWith('7')) {
      // Une contrepartie de gestion ferait transiter l'impact par le RÉSULTAT,
      // ce qui est exactement le traitement ORDINAIRE dont ces deux cas sont
      // l'exception. L'opération serait alors juste, mais ne serait plus une
      // imputation d'ouverture · autant la saisir comme une écriture normale.
      throw new BadRequestException(
        "La contrepartie d'une imputation d'ouverture est un poste de BILAN. Une contrepartie de charge ou de " +
          'produit ferait transiter l’impact par le résultat de l’exercice, ce qui est le traitement ordinaire ' +
          'auquel ces deux cas font exception.',
      );
    }

    const motifs: Record<MotifImputationOuverture, string> = {
      CHANGEMENT_METHODE: 'Changement de méthode comptable',
      CORRECTION_ERREUR_SIGNIFICATIVE: "Correction d'erreur significative d'un exercice antérieur",
    };
    const montant = Math.abs(dto.montant);
    const ecriture = await this.creer(tenantId, createdBy, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: exercice.dateDebut.toISOString().slice(0, 10),
      libelle: `${motifs[dto.motif]} · imputation aux capitaux propres d'ouverture`,
      lignes:
        dto.montant > 0
          ? [
              { compteId: ran.id, debit: montant, credit: 0 },
              { compteId: contrepartie.id, debit: 0, credit: montant },
            ]
          : [
              { compteId: contrepartie.id, debit: montant, credit: 0 },
              { compteId: ran.id, debit: 0, credit: montant },
            ],
    } as CreerEcritureDto);

    return this.prisma.ecriture.update({
      where: { id: ecriture.id },
      data: {
        motifImputationOuverture: dto.motif,
        justificationImputationOuverture: dto.justification.trim(),
      },
    });
  }

  /**
   * MISE EN SOMMEIL D'UN COMPTE · la saisie se CONFIRME. La source ne dit pas
   * que le sommeil interdit : elle dit « désactivation réversible,
   * confirmation requise en saisie » (skill sage-i7, tiers.md), et le plan
   * comptable ne décrit que la « désactivation réversible d'un compte sans
   * suppression » (comptabilite-generale.md). Refuser sec bloquerait une
   * régularisation légitime sur un compte qu'on a endormi trop tôt ; laisser
   * passer sans rien dire rendait le sommeil purement décoratif, l'écran seul
   * le tenant. D'où le chemin du report de l'art. 22, 4° · refus nommé, puis
   * second envoi qui confirme.
   *
   * Appelée par le CONTRÔLEUR seulement, jamais par `creer` · la clôture, les
   * imports, la paie et les autres modules passent des écritures que personne
   * ne « saisit », et une clôture ne doit jamais tomber parce qu'un compte de
   * charge mouvementé dans l'exercice a été endormi depuis.
   */
  async verifierComptesEnSommeil(
    tenantId: string,
    lignes: { compteId: string }[] | undefined,
    confirme: boolean | undefined,
  ) {
    if (confirme || !lignes || lignes.length === 0) return;
    const ids = [...new Set(lignes.map((l) => l.compteId))];
    const endormis = await this.prisma.compte.findMany({
      where: { id: { in: ids }, tenantId, estActif: false },
      select: { numero: true },
    });
    if (endormis.length === 0) return;
    throw new BadRequestException(
      `Compte en sommeil : ${endormis.map((c) => c.numero).join(', ')} · confirmez la saisie ` +
        'ou réactivez le compte dans le plan comptable.',
    );
  }

  /**
   * LES CONTRÔLES D'ENTRÉE D'UNE PIÈCE, SANS LA NUMÉROTER NI LA CRÉER · audit
   * du serveur du 2026-09-27, F3.
   *
   * `creer` portait seul la liste · exercice ouvert, date dans l'exercice,
   * journal actif, équilibre et deux lignes, taux de TVA et comptes du
   * dossier, comptes Détail, verrou de période, ventilation. Trois autres
   * chemins écrivent au journal (la reprise de balance, l'import d'écritures,
   * le canevas du groupe) et en recopiaient chacun une partie · la reprise de
   * balance prenait une date hors de l'exercice, l'import passait par-dessus
   * une période close, le canevas écrivait dans un journal en sommeil. Chaque
   * écriture ainsi née s'équilibre et la balance boucle : rien en aval ne
   * voit le défaut, et c'est exactement le § 10 bis. La liste vit donc UNE
   * fois, ici, et les quatre chemins l'appellent.
   *
   * `db` sert aux LECTURES qui doivent voir la transaction de l'appelant · la
   * reprise de balance crée ses comptes manquants dans la même transaction
   * que l'écriture, et une lecture hors d'elle ne les trouverait pas. Rien
   * n'est écrit ici.
   *
   * `lignes` absent ne contrôle que l'en-tête · c'est le cas d'une
   * modification qui ne touche qu'au libellé ou à la date.
   */
  async controlesDEntree(
    tenantId: string,
    piece: PieceEntree,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
    // LA MÉMOIRE D'UN LOT (audit final F2) · un import contrôle des milliers de
    // pièces sur le même exercice, les mêmes journaux et les mêmes comptes.
    // Relus à chaque pièce, ils coûtaient quatre requêtes par pièce. Les
    // RÈGLES ne changent pas · seule la lecture est partagée.
    memoire?: MemoireControles,
  ) {
    const exercice = await memoriser(memoire, `exercice:${piece.exerciceId}`, () =>
      db.exercice.findFirst({ where: { id: piece.exerciceId, tenantId } }),
    );
    if (!exercice) {
      throw new BadRequestException('Exercice introuvable pour ce tenant');
    }
    if (exercice.statut === StatutExercice.CLOTURE) {
      throw new ForbiddenException("Impossible d'enregistrer une écriture sur un exercice clôturé");
    }

    // LA DATE DOIT TOMBER DANS L'EXERCICE, et c'est `modifier` qui le disait
    // déjà · pas `creer`. L'asymétrie était le défaut : on ne pouvait pas
    // DÉPLACER une écriture hors de son exercice, on pouvait l'y CRÉER.
    //
    // Rien ne le signalait ensuite. Tous les états filtrent sur
    // `exerciceId` · une écriture datée du 04 novembre 2025 mais rattachée à
    // l'exercice 2026 entre au bilan et au compte de résultat 2026, s'équilibre
    // comme les autres, et la balance boucle. Seule la lecture du journal
    // laisserait voir la date étrangère. C'est la faute de janvier, celle où
    // l'on tape l'année qui vient de finir.
    //
    // Le postulat de la SPÉCIALISATION DES EXERCICES l'interdit des deux
    // côtés · SYCEBNL cadre conceptuel § 3.3.1.2.3 et AUDCIF, Titre I : les
    // charges et les produits sont rattachés à l'exercice qui les concerne.
    let date = new Date(piece.date);
    const horsExercice = motifDateHorsExercice(date, exercice);
    if (horsExercice) throw new BadRequestException(horsExercice);

    const journal = await memoriser(memoire, `journal:${piece.journalId}`, () =>
      this.journalService.trouver(tenantId, piece.journalId),
    );
    if (!journal.estActif) {
      throw new BadRequestException(`Le journal ${journal.code} est en sommeil`);
    }

    let sectionsParId = new Map<string, { planId: string; code: string; planCode: string }>();
    if (piece.lignes) {
      const totalDebit = piece.lignes.reduce((s, l) => s + (l.debit ?? 0), 0);
      const totalCredit = piece.lignes.reduce((s, l) => s + (l.credit ?? 0), 0);
      if (piece.lignes.length < 2 || Math.abs(totalDebit - totalCredit) > 0.005) {
        throw new BadRequestException(
          `Écriture déséquilibrée : débit=${totalDebit} crédit=${totalCredit}`,
        );
      }

      // Les tauxTvaId ne participent pas à l'équilibre (informatifs, posés sur
      // la ligne de TVA par la saisie guidée "Achat/Vente avec TVA") mais
      // doivent rester scopés au tenant · sans ce contrôle, un appel API direct
      // pourrait rattacher une ligne au taux d'un autre tenant (la FK Prisma ne
      // vérifie que l'existence de l'id, pas son tenant).
      const tauxTvaIds = [...new Set(piece.lignes.map((l) => l.tauxTvaId).filter((id): id is string => !!id))];
      if (tauxTvaIds.length > 0) {
        const tauxTrouves = await db.tauxTva.findMany({ where: { id: { in: tauxTvaIds }, tenantId } });
        if (tauxTrouves.length !== tauxTvaIds.length) {
          throw new BadRequestException('Un ou plusieurs taux de TVA sont introuvables pour ce tenant');
        }
      }

      // Comptes Total (regroupement par racine, §3.1) : jamais mouvementables
      // directement · leur solde n'est qu'une agrégation des comptes Détail de
      // même préfixe numérique (voir balance() plus bas). Un appel API direct
      // pourrait sinon y poster une écriture, brisant l'invariant du moteur de
      // mapping futur (§3.5) qui suppose que seuls les comptes Détail portent
      // des mouvements réels.
      const compteIds = [...new Set(piece.lignes.map((l) => l.compteId))];
      const comptes = await comptesDeLaPiece(db, tenantId, compteIds, memoire);
      if (comptes.length !== compteIds.length) {
        throw new BadRequestException('Un ou plusieurs comptes sont introuvables pour ce tenant');
      }
      const comptesTotal = comptes.filter((c) => c.typeCompte === TypeCompteDetailTotal.TOTAL);
      if (comptesTotal.length > 0) {
        throw new BadRequestException(
          `Impossible de saisir sur un compte Total (${comptesTotal.map((c) => c.numero).join(', ')}) · ` +
            'ce sont des comptes de regroupement, saisissez sur le compte Détail concerné',
        );
      }
      // LA CLASSE 9 S'ÉQUILIBRE EN ELLE-MÊME (classe-9-equilibree.ts) · une
      // pièce D 90 / C 571 boucle et fait tomber le bilan sans cause nommée.
      // Le référentiel n'est lu que sur l'écart, pour citer SON texte.
      const numeroParId = new Map(comptes.map((c) => [c.id, c.numero]));
      const ecart = ecartClasse9(
        piece.lignes.map((l) => ({ numero: numeroParId.get(l.compteId) ?? '', debit: l.debit, credit: l.credit })),
      );
      if (ecart !== 0) {
        const dossier = await db.tenant.findFirst({ where: { id: tenantId }, select: { referentiel: true } });
        throw new BadRequestException(motifRefusClasse9(dossier?.referentiel ?? Referentiel.SYSCOHADA, ecart));
      }
    }

    let dateValeur: Date | null = null;

    // AUDCIF ART. 22, 4° · sur demande expresse, l'opération datée d'une
    // période clôturée est enregistrée au premier jour de la période ouverte,
    // sa date réelle gardée comme date de valeur. Jamais au-delà de
    // l'exercice : la charge ou le produit changerait d'exercice, contre le
    // postulat de spécialisation. Voir exercice/report-periode-close.ts.
    if (piece.reporterAuPremierJourOuvert) {
      const premier = await this.exerciceService.premierJourOuvert(tenantId, piece.journalId, date);
      if (premier.getTime() !== date.getTime()) {
        if (premier > exercice.dateFin) {
          throw new BadRequestException(
            `Le premier jour non clôturé (${premier.toISOString().slice(0, 10)}) tombe hors de l'exercice ` +
              `(clos le ${exercice.dateFin.toISOString().slice(0, 10)}) · reporter l'opération changerait l'exercice qui ` +
              "porte la charge ou le produit. Rouvrez la période, ou traitez-la comme une opération d'exercice antérieur.",
          );
        }
        dateValeur = date;
        date = premier;
      }
    }

    // Clôtures Partielle/Totale (par journal) et Période (tous journaux) :
    // verrouillage de saisie indépendant du statut CLOTURE de l'exercice ·
    // voir ExerciceService.verifierEcritureAutorisee.
    if (memoire) {
      const clotures = await memoriser(memoire, `clotures:${piece.journalId}`, () =>
        this.exerciceService.cloturesApplicables(tenantId, piece.journalId),
      );
      refuserSiPeriodeClose(clotures, piece.journalId, date);
    } else {
      await this.exerciceService.verifierEcritureAutorisee(tenantId, piece.journalId, date);
    }

    if (piece.lignes) {
      // Ventilation analytique · seuls les plans marqués « ventilation
      // obligatoire » bloquent ici. Les autres laissent passer, et l'état de
      // contrôle des cumuls signale les lignes restées sans répartition.
      if (piece.exigerVentilationObligatoire !== false) {
        await this.analytiqueService.verifierVentilationObligatoire(tenantId, piece.lignes);
      }
      sectionsParId = await this.verifierSectionsVentilees(tenantId, piece.lignes, db);
      // LIGNES EN DEVISE (audit final F49) · la devise est celle du dossier,
      // jamais la monnaie de tenue, et le montant de la ligne est la
      // contrevaleur du montant en devise au cours appliqué.
      if (piece.lignes.some(porteUneDevise)) {
        const devises = await memoriser(memoire, 'devises', () =>
          db.devise.findMany({ where: { tenantId }, select: { id: true, code: true } }),
        );
        const parId = new Map(devises.map((d) => [d.id, d]));
        for (const [i, l] of piece.lignes.entries()) {
          const motif = motifRefusLigneEnDevise(l, l.deviseId ? parId.get(l.deviseId) : undefined);
          if (motif) throw new BadRequestException(`Ligne ${i + 1} · ${motif}`);
        }
      }
    }

    return { exercice, journal, date, dateValeur, sectionsParId };
  }

  async creer(tenantId: string, createdBy: string, dto: CreerEcritureDto) {
    const { journal, date, dateValeur, sectionsParId } = await this.controlesDEntree(tenantId, dto);

    // Le calcul du numéro de pièce (lire le max actuel, l'incrémenter) et la
    // création de l'écriture doivent former une seule opération atomique :
    // sans ça, deux écritures créées au même instant sur le même journal
    // pourraient lire le même max et recevoir le même numeroPiece. Voir
    // avecRetrySerialisable pour le détail (transaction Serializable +
    // reprise automatique). Testé jusqu'à 12 écritures envoyées en parfaite
    // simultanéité sur le même journal/mois : aucun doublon de numeroPiece.
    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const numeroPiece = await this.journalService.prochainNumeroPiece(tenantId, journal, dto.exerciceId, date, tx);
        return tx.ecriture.create({
          data: {
            tenantId,
            exerciceId: dto.exerciceId,
            journalId: dto.journalId,
            numeroPiece,
            date,
            dateValeur,
            libelle: dto.libelle,
            reference: dto.reference,
            createdBy,
            lignes: { create: dto.lignes.map((l) => donneesLigneSaisie(l, sectionsParId)) },
          },
          include: { lignes: true, journal: true },
        });
      },
      `Trop d'écritures enregistrées au même instant sur le journal ${journal.code} · veuillez réessayer.`,
    );
  }



  /**
   * Contrôle des sections ventilées en saisie · scope du dossier, type Détail,
   * section active, et équilibre PAR PLAN de chaque ligne. La contrainte n'est
   * pas « une section par ligne » mais « sur un plan donné, la ventilation
   * d'une ligne couvre son montant en totalité, ou il n'y en a aucune » : une
   * dépense partagée entre deux projets est parfaitement légitime.
   *
   * Retourne les sections indexées par id, pour que la création de l'écriture
   * puisse dénormaliser le planId sur chaque ventilation sans requête de plus.
   */
  private async verifierSectionsVentilees(
    tenantId: string,
    lignes: LigneEntree[],
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const sectionIds = [
      ...new Set(lignes.flatMap((l) => (l.ventilations ?? []).map((v) => v.sectionId))),
    ];
    const sectionsParId = new Map<string, { planId: string; code: string; planCode: string }>();
    if (sectionIds.length === 0) return sectionsParId;

    const sections = await db.sectionAnalytique.findMany({
      where: { id: { in: sectionIds }, tenantId },
      include: { plan: { select: { code: true } } },
    });
    if (sections.length !== sectionIds.length) {
      throw new BadRequestException('Une ou plusieurs sections analytiques sont introuvables pour ce dossier');
    }
    const totale = sections.find((s) => s.type === TypeCompteDetailTotal.TOTAL);
    if (totale) {
      throw new BadRequestException(
        `La section ${totale.code} est de type Total : elle regroupe ses sections Détail dans les états et ne reçoit pas de ventilation directe.`,
      );
    }
    const sommeil = sections.find((s) => !s.estActive);
    if (sommeil) {
      throw new BadRequestException(`La section analytique ${sommeil.code} est en sommeil`);
    }
    for (const s of sections) {
      sectionsParId.set(s.id, { planId: s.planId, code: s.code, planCode: s.plan.code });
    }

    for (const [index, ligne] of lignes.entries()) {
      if (!ligne.ventilations || ligne.ventilations.length === 0) continue;
      const parPlan = new Map<string, { debit: number; credit: number; planCode: string }>();
      for (const v of ligne.ventilations) {
        const s = sectionsParId.get(v.sectionId)!;
        const cumul = parPlan.get(s.planId) ?? { debit: 0, credit: 0, planCode: s.planCode };
        cumul.debit += v.debit ?? 0;
        cumul.credit += v.credit ?? 0;
        parPlan.set(s.planId, cumul);
      }
      for (const [, cumul] of parPlan) {
        if (
          Math.abs(cumul.debit - (ligne.debit ?? 0)) > 0.005 ||
          Math.abs(cumul.credit - (ligne.credit ?? 0)) > 0.005
        ) {
          throw new BadRequestException(
            `Ligne ${index + 1} : ventilation incomplète sur le plan ${cumul.planCode} · ` +
              `${cumul.debit.toFixed(2)} au débit et ${cumul.credit.toFixed(2)} au crédit, ` +
              `pour une ligne de ${(ligne.debit ?? 0).toFixed(2)} / ${(ligne.credit ?? 0).toFixed(2)}.`,
          );
        }
      }
    }
    return sectionsParId;
  }


  // ==========================================================================
  // BROUILLARD ET VALIDATION
  //
  // Une écriture naît en BROUILLARD : modifiable et supprimable, elle n'est pas
  // encore au livre-journal. La VALIDER l'y fait entrer, et la rend intangible
  // au sens de l'article 20 · à partir de là, seule l'inscription en négatif
  // corrige.
  //
  // Cette frontière n'existait pas jusqu'ici : toute écriture était définitive
  // dès sa saisie, et une faute de frappe repérée dans la seconde coûtait une
  // contre-écriture. Le brouillard réconcilie l'ergonomie et l'intangibilité,
  // sans rien céder sur la seconde.
  //
  // Les deux référentiels bornent ce séjour, mais PAS AU MÊME DÉLAI, et le
  // logiciel servait le plus court aux deux. Une entreprise voyait donc
  // signalées « en retard de centralisation » des écritures qui ne l'étaient
  // pas, trois semaines avant de l'être :
  //
  //  · SYCEBNL, Partie 2 ch. 2 · « les données des documents auxiliaires sont
  //    centralisées au moins chaque semaine dans le journal ou le grand-livre » ;
  //  · AUDCIF, art. 19 · « les totaux de ces supports sont périodiquement et au
  //    moins une fois par mois centralisés dans le livre-journal et le
  //    grand-livre ».
  //
  // Au-delà, une écriture laissée en brouillard n'est plus un document de
  // travail, c'est un retard de centralisation. L'état du brouillard le
  // signale nommément, et ControlesService applique le même barème.
  // ==========================================================================

  private async trouverEnBrouillard(tenantId: string, ecritureId: string) {
    const ecriture = await this.prisma.ecriture.findFirst({
      where: { id: ecritureId, tenantId },
      include: { lignes: true, journal: true, exercice: true },
    });
    if (!ecriture) throw new NotFoundException('Écriture introuvable pour ce dossier.');
    if (ecriture.statut === StatutEcriture.VALIDEE) {
      throw new ForbiddenException(
        `L'écriture n° ${ecriture.numeroPiece ?? ''} est validée : elle est entrée au livre-journal et ne se modifie ` +
          "plus. L'article 20 de l'AUDCIF n'ouvre qu'une voie, la correction par inscription en négatif.",
      );
    }
    if (ecriture.exercice.statut === StatutExercice.CLOTURE) {
      throw new ForbiddenException("L'exercice de cette écriture est clôturé.");
    }
    // LE REPORT À-NOUVEAU NE SE RETOUCHE PAS DEPUIS LE JOURNAL · audit du
    // serveur du 2026-09-27, B3. Né au brouillard dans un exercice ouvert, il
    // passait toutes les gardes ci-dessus : un DELETE retirait le bilan
    // d'ouverture entier, un PATCH en changeait les montants, la balance
    // bouclait, et l'exercice clos ne se rouvre pas pour relancer le report.
    // Le bilan d'ouverture cessait de correspondre au bilan de clôture
    // (SYCEBNL art. 16, 4) · AUDCIF art. 34) sans que rien ne le voie.
    // Seul reste retouchable celui du PREMIER exercice : il porte le bilan
    // d'ouverture saisi à la reprise du dossier, pas un report calculé.
    if (ecriture.estGenereeParCloture) {
      const premier = await this.prisma.exercice.findFirst({
        where: { tenantId },
        orderBy: { dateDebut: 'asc' },
        select: { id: true },
      });
      if (premier?.id !== ecriture.exerciceId) {
        throw new ForbiddenException(
          "Cette écriture est un report à-nouveau calculé à la clôture · elle ne se modifie ni ne se supprime " +
            "depuis le journal. Un report provisoire se relance depuis la fenêtre Exercices ; une erreur d'un " +
            "exercice clôturé passe par l'imputation déclarée aux capitaux propres d'ouverture.",
        );
      }
    }
    // Soldé OU partiel (audit final F50, lettrage/ligne-lettree.ts).
    const lettree = ecriture.lignes.find(estTenueParUnLettrage);
    if (lettree) {
      throw new BadRequestException(
        `Une ligne de cette écriture est lettrée (${designationLettrage(lettree)}) : délettrez-la avant de modifier l'écriture.`,
      );
    }
    const pointee = ecriture.lignes.find((l) => l.rapprochementId);
    if (pointee) {
      throw new BadRequestException(
        'Une ligne de cette écriture est pointée dans un rapprochement bancaire : dépointez-la avant de modifier.',
      );
    }
    return ecriture;
  }

  /**
   * Modifie une écriture en brouillard. Les lignes sont remplacées en bloc :
   * une écriture est un tout équilibré, et retoucher une ligne isolément
   * ouvrirait une fenêtre où elle ne l'est plus.
   *
   * MÊMES CONTRÔLES ET MÊMES CHAMPS QUE `creer` · audit du serveur du
   * 2026-09-27, F4. `modifier` refaisait à la main une partie des contrôles
   * (ni le taux de TVA du dossier, ni les sections ventilées, ni le journal
   * en sommeil) et recréait ses lignes sans la devise ni la ventilation.
   * Un brouillard retouché pouvait donc se rattacher au taux d'un autre
   * dossier, défaut que `creer` dit fermer, ou perdre son montant en devise
   * sans un mot. Les deux passent désormais par `controlesDEntree` et
   * `donneesLigneSaisie`.
   *
   * Et UNE ÉCRITURE QU'UN MODULE TIENT NE SE MODIFIE PAS D'ICI (F2) · la
   * liquidation, la facture, le bulletin, l'affectation affirment un montant
   * que l'écriture ne porterait plus.
   *
   * LA FACTURE, À PART (audit final F65) · elle LAISSE PARTIR son écriture
   * (`detenteurs-ecriture.ts` · supprimée au brouillard, la facture redevient
   * « à comptabiliser » et se repasse), mais elle ne la laisse pas se
   * RETOUCHER. Modifiée ici, l'écriture changeait de montants pendant que la
   * facture la désignait toujours comme son enregistrement · la pièce disait
   * un total, le journal un autre, et rien ne le signalait. Ce refus était
   * écrit dans ce commentaire sans qu'une ligne l'exécute.
   */
  async modifier(tenantId: string, ecritureId: string, dto: ModifierEcritureDto) {
    const ecriture = await this.trouverEnBrouillard(tenantId, ecritureId);
    await this.verifierAucunModuleNeLaTient(tenantId, [ecritureId], 'se modifie');
    const facture = await this.prisma.facture.findFirst({
      where: { tenantId, ecritureId },
      select: { numeroSerie: true },
    });
    if (facture) {
      throw new BadRequestException(
        `Cette écriture enregistre la facture ${facture.numeroSerie} · elle ne se modifie pas d'ici, la facture ` +
          "dirait un montant et le journal un autre. Supprimez-la au brouillard : la facture redevient « à " +
          "comptabiliser » et se repasse depuis la fenêtre Facturation.",
      );
    }
    const { date, sectionsParId } = await this.controlesDEntree(tenantId, {
      exerciceId: ecriture.exerciceId,
      journalId: ecriture.journalId,
      date: dto.date ? new Date(dto.date) : ecriture.date,
      lignes: dto.lignes,
    });

    // UN JOURNAL MENSUEL NUMÉROTE PAR MOIS (audit final F58) · une pièce
    // déplacée dans un autre mois gardait le numéro de son mois d'origine ·
    // un doublon dans le mois d'arrivée, que l'analyse des journaux ne
    // pouvait pas distinguer. Elle reçoit le numéro suivant du mois
    // d'arrivée, dans la transaction sérialisable qui la déplace, comme à la
    // création. Le trou laissé dans le mois d'origine est celui d'une pièce
    // retirée, et l'analyse des journaux le montre.
    const changeDeMois =
      ecriture.journal.numerotation === NumerotationPiece.MENSUELLE &&
      (date.getUTCFullYear() !== ecriture.date.getUTCFullYear() || date.getUTCMonth() !== ecriture.date.getUTCMonth());

    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        if (dto.lignes) {
          // Les ventilations analytiques suivent leurs lignes (onDelete: Cascade
          // sur VentilationAnalytique.ligne) : remplacer les lignes remplace
          // aussi l'ANCIENNE ventilation, et la nouvelle vient avec les lignes
          // reçues, par le même constructeur que la création.
          await tx.ligneEcriture.deleteMany({ where: { ecritureId } });
        }
        const numeroPiece = changeDeMois
          ? await this.journalService.prochainNumeroPiece(tenantId, ecriture.journal, ecriture.exerciceId, date, tx)
          : undefined;
        return tx.ecriture.update({
          where: { id: ecritureId },
          data: {
            date,
            ...(numeroPiece !== undefined ? { numeroPiece } : {}),
            libelle: dto.libelle ?? undefined,
            reference: dto.reference ?? undefined,
            ...(dto.lignes ? { lignes: { create: dto.lignes.map((l) => donneesLigneSaisie(l, sectionsParId)) } } : {}),
          },
          include: { lignes: { include: { compte: true } }, journal: true },
        });
      },
      "Trop d'opérations simultanées sur ce journal · veuillez réessayer.",
    );
  }

  /**
   * Supprime une écriture en brouillard. Une écriture validée ne se supprime
   * pas · et une écriture qu'un AUTRE MODULE tient ne se supprime pas non plus.
   *
   * CE QUE RIEN NE VOYAIT. Des tables portent un lien facultatif vers une
   * écriture · l'immobilisation vers son écriture de sortie, la réévaluation
   * vers ses écarts, sa provision et son extourne, la régularisation vers sa
   * constatation et sa reprise, l'échéance d'abonnement, la donation, et
   * l'affectation du résultat. Sur une relation FACULTATIVE, PostgreSQL ne
   * refuse pas la suppression : Prisma y pose `ON DELETE SET NULL` par défaut.
   * Le lien se dénoue donc SANS ERREUR.
   *
   * La conséquence n'est visible nulle part. L'immobilisation reste marquée
   * sortie sans l'écriture qui l'a sortie, la réévaluation reste inscrite sans
   * ses écarts, et surtout l'affectation du résultat reste enregistrée alors
   * que le report à nouveau n'a jamais bougé · le bilan d'ouverture de
   * l'exercice suivant cesse de correspondre à la clôture du précédent
   * (SYCEBNL art. 16, 4) · AUDCIF art. 34), et le contrôle qui surveille les
   * mouvements du compte 12 ne peut rien y voir, puisque le défaut est une
   * ABSENCE de mouvement. Les deux lignes disparaissant ensemble, la balance
   * boucle toujours.
   *
   * On refuse donc, en nommant le module qui tient l'écriture · c'est chez lui
   * que l'opération se défait, jamais par la suppression de sa contrepartie
   * comptable.
   */
  async supprimer(tenantId: string, ecritureId: string, pourLeModule?: SuppressionPourLeModule) {
    await this.trouverEnBrouillard(tenantId, ecritureId);
    await this.verifierAucunModuleNeLaTient(tenantId, [ecritureId], 'se supprime', pourLeModule?.detenteur);
    await transactionJournalisee(this.prisma, async (tx) => {
      // Le module libère son marqueur DANS la même transaction · jamais
      // avant (un échec laisserait l'écriture sans son opération), jamais
      // après (l'écriture partie, le marqueur interdirait encore la période).
      if (pourLeModule) await pourLeModule.liberer(tx);
      await tx.ligneEcriture.deleteMany({ where: { ecritureId } });
      await tx.ecriture.delete({ where: { id: ecritureId } });
    });
    return { supprime: true };
  }

  /**
   * COMPENSATION · retire une écriture que l'appelant vient de créer, quand
   * l'opération qui devait l'accompagner n'a pas pu s'écrire.
   *
   * Audit du serveur du 2026-09-27, F1 · deux sites supprimaient la TÊTE
   * seule. Les lignes sont en ON DELETE RESTRICT : la suppression levait, et
   * l'un des sites AVALAIT l'erreur, laissant au journal une liquidation de
   * TVA sans marqueur · la période redevenait liquidable et la seconde
   * liquidation doublait la TVA due. Lignes puis tête, dans une transaction,
   * et l'erreur REMONTE : une compensation qui échoue ne se tait jamais.
   * Aucune garde de statut ni de détenteur · l'écriture vient de naître au
   * brouillard dans la même requête, rien d'autre ne la tient encore.
   *
   * SAUF LE MODULE APPELANT, qui a pu poser son lien entre-temps (la paie lie
   * ses bulletins APRÈS la création). `liberer` le dénoue dans la MÊME
   * transaction, avant les lignes · deux transactions laisseraient, sur un
   * échec de la seconde, une écriture libre que rien ne tient plus (audit
   * final F107).
   */
  async retirerCompensation(
    tenantId: string,
    ecritureId: string,
    liberer?: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ) {
    await transactionJournalisee(this.prisma, async (tx) => {
      const ecriture = await tx.ecriture.findFirst({ where: { id: ecritureId, tenantId }, select: { id: true } });
      if (!ecriture) return;
      if (liberer) await liberer(tx);
      await tx.ligneEcriture.deleteMany({ where: { ecritureId } });
      await tx.ecriture.delete({ where: { id: ecritureId } });
    });
  }

  /**
   * LES MODULES QUI TIENNENT CES ÉCRITURES · la liste, UNE fois, et les quatre
   * gestes qui retouchent une écriture la lisent (audit du serveur du
   * 2026-09-27, F2). Seule la suppression la consultait : `modifier`
   * remplaçait les lignes d'une liquidation de TVA ou d'une affectation,
   * `reimputer` ne connaissait que les trois détenteurs immobilisation, et la
   * correction par inscription en négatif annulait au journal une liquidation
   * dont le marqueur disait encore la période liquidée. Chaque fois
   * l'écriture restait équilibrée, et c'est le module qui mentait.
   *
   * La liste reste ÉCRITE À LA MAIN, jamais déduite du schéma (§ 10 bis) ·
   * une relation nouvelle doit obliger quelqu'un à décider si son module
   * retient l'écriture ou la laisse partir.
   */
  private async detenteursDe(tenantId: string, ecritureIds: string[]): Promise<DetenteurEcriture[]> {
    const ecritureId = { in: [...new Set(ecritureIds)] };
    // Le `tenantId` accompagne l'id de l'écriture partout, alors même que cet
    // id est déjà unique · le cloisonnement se pose aux DEUX bouts, et un
    // comptage qui ne le porte pas est un comptage qui traverserait les
    // dossiers si l'id venait d'ailleurs que de la ligne du dessus.
    // Plusieurs de ces tables n'ont PAS de `tenantId` · elles sont portées par
    // leur parent (voir MODELES_PORTES_PAR_LEUR_PARENT), et c'est l'écriture
    // elle-même, déjà vérifiée pour ce dossier, qui les cloisonne.
    const parLEcriture = { ecritureId };
    const detenteursPossibles: Array<[string, Promise<number>]> = [
      ['une immobilisation (acquisition)', this.prisma.immobilisation.count({ where: { tenantId, ecritureAcquisitionId: ecritureId } })],
      ['une immobilisation (sortie)', this.prisma.immobilisation.count({ where: { tenantId, ecritureSortieId: ecritureId } })],
      ['une immobilisation (produit de cession)', this.prisma.immobilisation.count({ where: { tenantId, ecritureProduitCessionId: ecritureId } })],
      ['une immobilisation (mise en service d’un en-cours)', this.prisma.immobilisation.count({ where: { tenantId, ecritureMiseEnServiceId: ecritureId } })],
      ['une immobilisation (solde de la dette d\'acquisition)', this.prisma.immobilisation.count({ where: { tenantId, ecritureSoldeDetteAleatoireId: ecritureId } })],
      ["une dotation aux amortissements", this.prisma.dotationAmortissement.count({ where: parLEcriture })],
      ["une dépréciation d'immobilisation", this.prisma.depreciationImmobilisation.count({ where: parLEcriture })],
      // Le reclassement d'un bien · la clé est RESTRICT, et sans ce refus nommé
      // la base levait une erreur brute après que la garde avait laissé passer
      // (audit du serveur I1, voir detenteurs-ecriture.ts).
      ["un reclassement d'immobilisation", this.prisma.reclassementImmobilisation.count({ where: parLEcriture })],
      // Une réévaluation ANNULÉE ne retient plus ses écritures (D6) · validées,
      // elles sont neutralisées par leur inscription en négatif.
      ['une réévaluation de devise', this.prisma.reevaluation.count({
        where: { tenantId, annuleeLe: null, OR: [{ ecritureEcartsId: ecritureId }, { ecritureProvisionId: ecritureId }, { ecritureExtourneId: ecritureId }] },
      })],
      ['une régularisation', this.prisma.regularisation.count({
        where: { tenantId, OR: [{ ecritureConstatationId: ecritureId }, { ecritureRepriseId: ecritureId }] },
      })],
      ["une échéance d'abonnement", this.prisma.echeanceAbonnement.count({ where: parLEcriture })],
      [DETENTEUR_LIQUIDATION_TVA, this.prisma.liquidationTva.count({ where: { tenantId, ecritureId } })],
      ['une donation', this.prisma.donation.count({ where: { tenantId, ecritureId } })],
      ['une affectation du résultat', this.prisma.affectationResultat.count({ where: { tenantId, ecritureId } })],
      // Le rattachement à un engagement de dépense. Sans ce refus nommé, la
      // clé étrangère RESTRICT renverrait une erreur brute de la base · et
      // s'il n'y avait pas de clé du tout, le reste à exécuter de l'engagement
      // REMONTERAIT tout seul, gonflant la colonne Engagement du tableau
      // d'exécution budgétaire sans que personne ne l'ait décidé.
      ["l'exécution d'un engagement de dépense", this.prisma.executionEngagement.count({ where: parLEcriture })],
      // Le mouvement de magasin, en inventaire permanent. Sans ce refus, le
      // lien se dénouerait en silence et la fiche de stock afficherait
      // « écriture non passée » sur un mouvement qui en avait une · la fiche
      // et le compte divergeraient alors du montant du mouvement, et l'écart
      // remonterait à la clôture sous la forme d'un MALI D'INVENTAIRE qui
      // n'existe pas, mis à la charge de l'entité.
      // Un mouvement ANNULÉ ne tient plus son écriture (audit final F133) · elle
      // se corrige alors au journal, et la fiche la nomme.
      ['un mouvement de magasin', this.prisma.mouvementStock.count({ where: { tenantId, ecritureId, annuleLe: null } })],
      // L'écart d'inventaire redressé (audit du serveur de 2026-09, I2 · le
      // lien n'était écrit nulle part, il l'est au rattachement). Sans ce
      // refus, le lien se dénouerait en silence et la campagne dirait le
      // manquant passé sur une pièce disparue du journal.
      ["un écart d'inventaire (redressement)", this.prisma.ecartInventaire.count({ where: { tenantId, ecritureId } })],
      // La clôture d'un contrat de location-acquisition (detenteurs-ecriture.ts).
      ["la clôture d'un contrat de location-acquisition", this.prisma.clotureLocationAcquisition.count({
        where: { tenantId, OR: [{ ecritureId }, { ecritureExtourneId: ecritureId }] },
      })],
      ["la reprise d'une subvention d'investissement", this.prisma.repriseSubventionImmobilisation.count({ where: { tenantId, ecritureId } })],
      ["la réduction d'une subvention rattachée à un bien", this.prisma.reductionSubventionImmobilisation.count({ where: { tenantId, ecritureId } })],
      ["la révision rétroactive d'un plan d'amortissement", this.prisma.revisionPlanAmortissement.count({ where: { tenantId, ecritureId } })],
      ["l'incorporation de coûts d'emprunt", this.prisma.coutEmpruntIncorpore.count({ where: { tenantId, ecritureId } })],
      ['la réévaluation des immobilisations', this.prisma.reevaluationBilan.count({ where: { tenantId, ecritureId } })],
      ['la reprise de la provision spéciale de réévaluation', this.prisma.repriseProvisionReevaluation.count({ where: { tenantId, ecritureId } })],
      ['la provision pour démantèlement', this.prisma.mouvementDemantelement.count({ where: { tenantId, ecritureId } })],
      // Les créances douteuses (ligne A7) · elles se retirent depuis leur
      // fenêtre, qui libère sa ligne dans la même transaction.
      [DETENTEUR_RECLASSEMENT_CREANCE, this.prisma.creanceDouteuse.count({ where: { tenantId, ecritureReclassementId: ecritureId } })],
      // Une revue ANNULÉE ne retient plus son écriture (B2) · validée, elle est
      // neutralisée par son inscription en négatif.
      [DETENTEUR_REVUE_CREANCE, this.prisma.ajustementCreanceDouteuse.count({ where: { tenantId, ecritureId, annuleeLe: null } })],
      // Un mouvement annulé (K4) ne retient plus · son écriture validée est
      // neutralisée par l'inscription en négatif, celle du brouillard est partie.
      [DETENTEUR_MOUVEMENT_CREANCE, this.prisma.mouvementCreanceDouteuse.count({ where: { tenantId, ecritureId, annuleeLe: null } })],
      // La paie du mois (P9). Sans ce refus, la clé RESTRICT renverrait une
      // erreur brute ; sans la clé, les bulletins se diraient passés sans
      // écriture, ou repartiraient en silence dans la paie suivante. La
      // passation se défait depuis la fenêtre Personnel, qui libère les
      // bulletins dans le même geste.
      [DETENTEUR_PAIE_DU_MOIS, this.prisma.bulletinPaie.count({ where: { tenantId, ecritureId } })],
      // L'ordre de virement non annulé. Sans ce refus, la pièce de règlement
      // disparaîtrait sous un ordre que la banque exécute quand même · la
      // dette serait rouverte au 40 pendant que le fournisseur est payé.
      // L'annulation de l'ordre, avec son motif, libère la pièce.
      // Le dérogatoire d'un exercice · supprimée seule, l'écriture laisserait
      // le plan fiscal se dire passé, et le cumul du 151 faux.
      ['un amortissement dérogatoire', this.prisma.amortissementDerogatoire.count({ where: { tenantId, ecritureId } })],
      ['un ordre de virement', this.prisma.ligneOrdreVirement.count({ where: { tenantId, ecritureId } })],
      // La consignation d'emballages, par l'une OU l'autre de ses deux
      // écritures (posées au rattachement, audit I2). Le lien dénoué en
      // silence laisserait le registre annoncer une consignation ouverte ou
      // dénouée sans l'écriture qui l'a faite · et c'est précisément ce
      // registre qui existe pour montrer ce qui reste à qualifier au 4094 et
      // au 4194.
      ["une consignation d'emballages", this.prisma.consignation.count({
        where: { tenantId, OR: [{ ecritureConsignationId: ecritureId }, { ecritureDenouementId: ecritureId }] },
      })],
    ];
    const resultats = await Promise.all(detenteursPossibles.map(([, p]) => p));
    return detenteursPossibles.filter((_, i) => resultats[i] > 0).map(([nom]) => nom);
  }

  /**
   * Le refus nommé · `geste` dit ce qui est refusé (« se supprime », « se
   * modifie », « se réimpute », « se corrige »), et le message renvoie au
   * module, seul à savoir défaire ou reprendre son opération.
   */
  private async verifierAucunModuleNeLaTient(
    tenantId: string,
    ecritureIds: string[],
    geste: string,
    detenteurLibere?: DetenteurEcriture,
  ) {
    // Le SEUL détenteur que l'appelant libère lui-même est écarté · tous les
    // autres refusent encore. Une écriture tenue par deux modules ne sort pas
    // parce que l'un des deux la lâche.
    const detenteurs = (await this.detenteursDe(tenantId, ecritureIds)).filter((nom) => nom !== detenteurLibere);
    if (detenteurs.length > 0) {
      throw new BadRequestException(
        `Cette écriture est la contrepartie comptable de ${detenteurs.join(' et ')} · ` +
          `elle ne ${geste} pas d'ici. Reprenez l'opération dans son module : ` +
          "retouchée seule, elle laisserait le module affirmer un montant ou une opération que " +
          "l'écriture ne porte plus, et rien ne le signalerait.",
      );
    }
  }

  /**
   * Valide une sélection d'écritures : elles entrent au livre-journal. Le
   * contrôle d'équilibre est refait ici · une écriture ne devrait jamais être
   * déséquilibrée en base, mais la validation est le dernier point où on peut
   * encore l'empêcher d'entrer dans un document légal.
   */
  /**
   * DOUBLE REGARD · le validateur comparé à l'auteur, quand le dossier l'a
   * décidé.
   *
   * LA VALIDATION EST LE FRANCHISSEMENT. C'est elle qui fait entrer la pièce au
   * livre-journal, et l'AUDCIF art. 22, 2° pose que « l'irréversibilité des
   * traitements interdise toute suppression, addition ou modification
   * ultérieure ». Rien ne se dévalide ensuite · aucun chemin de dévalidation
   * n'existe dans ce dépôt.
   *
   * LE MÊME ARTICLE NE NOMME PERSONNE. Il impose l'acte (« Toute donnée entrée
   * fait l'objet d'une validation, mise en œuvre au terme de chaque période qui
   * ne peut excéder un mois ») et se tait sur son auteur. L'art. 69 délègue
   * expressément : « L'entité détermine, sous sa responsabilité, les procédures
   * nécessaires. » D'où une OPTION par dossier, désactivée par défaut, et non
   * une règle imposée · voir `Tenant.doubleRegardValidation`.
   *
   * CE QUI NE LÈVE PAS, ET POURQUOI. Le refus du double regard ne jette AUCUNE
   * exception, à la différence du déséquilibre et de l'exercice clôturé qui la
   * jettent tous deux. Il ÉCARTE. La raison est dans l'art. 22, 2° lui-même :
   * la validation se fait « au terme de chaque période qui ne peut excéder un
   * mois », donc par lots. Jeter sur le lot entier ferait qu'une seule écriture
   * écartée empêcherait de valider toutes les autres, et la période passerait
   * son terme. L'écriture n'entre pas au livre-journal, ce QUI EST le refus ;
   * ce qui change est sa forme, un compteur nommé plutôt qu'un jet.
   *
   * LA LIMITE, ÉCRITE PARCE QU'ELLE NE SE DEVINE PAS · le logiciel ne contrôle
   * que l'IDENTITÉ, jamais l'INDÉPENDANCE. Aucun texte lu ne dit si un
   * ADMIN_CABINET qui valide la saisie d'un comptable constitue un second
   * regard, ni si un comptable qui en valide un autre en constitue un. Même
   * parti assumé que la pièce de rechange et l'indice de perte de valeur.
   *
   * ET UN FLUX OÙ LA VÉRIFICATION EST STRUCTURELLEMENT VIDE · `GroupeService`
   * fait naître des écritures dans le dossier d'une CELLULE en portant le
   * `createdBy` d'un utilisateur du SIÈGE. Le comptable de la cellule les
   * valide, l'identité diffère, le double regard est satisfait, et personne
   * dans la cellule n'a rien relu. C'est une limite du contrôle d'identité,
   * pas un défaut à corriger ici.
   */
  async valider(
    tenantId: string,
    valideeBy: string,
    ecritureIds: string[],
    derogation?: { secondRegardNom?: string; secondRegardMotif?: string },
  ) {
    const ecritures = await this.prisma.ecriture.findMany({
      where: { id: { in: ecritureIds }, tenantId },
      include: { lignes: true, exercice: { select: { statut: true } }, journal: { select: { code: true } } },
    });
    if (ecritures.length !== ecritureIds.length) {
      throw new NotFoundException('Une ou plusieurs écritures sont introuvables pour ce dossier.');
    }
    const dejaValidees = ecritures.filter((e) => e.statut === StatutEcriture.VALIDEE);
    const aValider = ecritures.filter((e) => e.statut === StatutEcriture.BROUILLARD);

    for (const e of aValider) {
      // Le report PROVISOIRE ne se valide jamais · validé, il ne pourrait plus
      // être remplacé à la relance ni par la clôture (AUDCIF art. 22, 2°).
      if (e.estANouveauProvisoire) {
        throw new BadRequestException(
          "Le report à-nouveau PROVISOIRE ne se valide pas · il est remplacé par le report définitif à la clôture de l'exercice précédent.",
        );
      }
      if (e.exercice.statut === StatutExercice.CLOTURE) {
        throw new ForbiddenException(`L'exercice de l'écriture ${e.journal.code} n° ${e.numeroPiece ?? ''} est clôturé.`);
      }
      const debit = e.lignes.reduce((s, l) => s + Number(l.debit), 0);
      const credit = e.lignes.reduce((s, l) => s + Number(l.credit), 0);
      if (Math.abs(debit - credit) > 0.005) {
        throw new BadRequestException(
          `L'écriture ${e.journal.code} n° ${e.numeroPiece ?? ''} est déséquilibrée (${debit} / ${credit}) : ` +
            'corrigez-la avant de la valider.',
        );
      }
    }

    // Le dossier est relu ICI et pas ailleurs · même chemin que `brouillard`,
    // qui lit le référentiel de la même façon. Un second chemin de lecture
    // finirait par diverger.
    const dossier = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { doubleRegardValidation: true, referentiel: true },
    });

    const visa = this.visaSecondRegard(derogation);
    // PARTITION, jamais un jet · voir la raison en tête de méthode.
    //
    // LES ÉCRITURES DE CLÔTURE EN SONT EXCLUES, et l'exclusion est écrite. Les
    // textes raisonnent sur des données « entrée[s] » par une personne
    // (art. 22, 1°), et rien ne dit qui « saisit » un report à nouveau calculé
    // à partir de soldes déjà validés. L'inverse aurait une conséquence
    // muette : les états financiers lisent la balance sans le brouillard, un
    // report à nouveau resté non validable disparaîtrait du bilan d'ouverture
    // tout en restant à la balance, et le bilan d'ouverture cesserait de
    // correspondre au bilan de clôture sans qu'aucun total ne bouge.
    const soumises =
      dossier.doubleRegardValidation && !visa
        ? aValider.filter((e) => !e.estGenereeParCloture)
        : [];
    const ecartees = soumises.filter((e) => e.createdBy === valideeBy);
    const idsEcartees = new Set(ecartees.map((e) => e.id));
    const validables = aValider.filter((e) => !idsEcartees.has(e.id));

    const valideeAt = new Date();
    if (validables.length > 0) {
      await this.prisma.ecriture.updateMany({
        where: { id: { in: validables.map((e) => e.id) }, tenantId },
        // Le visa n'est apposé QUE si une dérogation a été produite. Tamponner
        // tout le lot poserait un second regard nominatif sur des pièces qui
        // n'en avaient pas besoin, et le document remis à un auditeur
        // affirmerait une relecture qui n'a pas eu lieu.
        data: {
          statut: StatutEcriture.VALIDEE,
          valideeAt,
          valideeBy,
          ...(visa ? { secondRegardNom: visa.nom, secondRegardMotif: visa.motif } : {}),
        },
      });
    }
    return {
      validees: validables.length,
      dejaValidees: dejaValidees.length,
      refuseesSecondRegard: ecartees.length,
      sousDerogation: visa ? validables.length : 0,
      motifRefus: ecartees.length > 0 ? this.motifDoubleRegard(dossier.referentiel) : null,
    };
  }

  /**
   * La dérogation nominative · les deux champs vont ENSEMBLE.
   *
   * Un nom sans motif ne dit pas ce qui a été relu, un motif sans nom ne dit
   * pas par qui. Le refus est posé ici et non par un décorateur de classe,
   * parce qu'un message de validation ne peut pas EXPLIQUER pourquoi le motif
   * est exigé, et que c'est justement l'explication qui empêche de le remplir
   * au hasard.
   */
  private visaSecondRegard(d?: { secondRegardNom?: string; secondRegardMotif?: string }) {
    const nom = d?.secondRegardNom?.trim();
    const motif = d?.secondRegardMotif?.trim();
    if (!nom && !motif) return null;
    if (!nom || !motif) {
      throw new BadRequestException(
        'Une dérogation au double regard porte un NOM et un MOTIF, et les deux sont exigés. Le nom dit qui a relu ' +
          'la pièce hors du logiciel, le motif dit ce qui a été relu · c\'est ce couple, et lui seul, qui rend le ' +
          'visa opposable à un auditeur. Un nom seul n\'atteste de rien.',
      );
    }
    return { nom, motif };
  }

  /**
   * Le motif servi à l'écran · AIGUILLÉ SUR LE RÉFÉRENTIEL DU DOSSIER.
   *
   * L'obligation d'organisation atteint les deux référentiels, mais PAS par le
   * même article : l'art. 69 de l'AUDCIF est EXCLU par l'art. 3 du SYCEBNL, qui
   * atteint la même chose par son art. 16, 2). Servir l'un à l'autre est
   * exactement la transposition que ce dépôt a déjà corrigée une fois.
   */
  private motifDoubleRegard(referentiel: Referentiel): string {
    const commun =
      'Ce dossier exige un second regard : une écriture n’est validée que par un autre utilisateur que celui qui ' +
      'l’a saisie. Aucun texte n’impose cette séparation · c’est une procédure que l’entité s’est donnée, et elle ' +
      'se règle dans Paramètres du dossier. ';
    return referentiel === Referentiel.SYCEBNL
      ? commun +
          'SYCEBNL, art. 16, 2) : « la mise en place de procédures nécessaires à une organisation comptable ' +
          'permettant un contrôle interne fiable et le contrôle externe […] ». L’art. 69 de l’AUDCIF, qui délègue ' +
          'expressément ces procédures à l’entité, est exclu par l’art. 3 du SYCEBNL.'
      : commun +
          'AUDCIF, art. 69 : « L’entité détermine, sous sa responsabilité, les procédures nécessaires à la mise en ' +
          'place d’une organisation comptable permettant aussi bien un contrôle interne fiable que le contrôle ' +
          'externe […]. »';
  }

  /** Valide tout le brouillard jusqu'à une date, éventuellement sur un seul journal. */
  async validerJusqua(tenantId: string, valideeBy: string, dto: ValiderJusquaDto) {
    const ecritures = await this.prisma.ecriture.findMany({
      where: {
        tenantId,
        exerciceId: dto.exerciceId,
        statut: StatutEcriture.BROUILLARD,
        // Le report provisoire attend la clôture, pas une validation par lot.
        estANouveauProvisoire: false,
        date: { lte: new Date(dto.dateLimite) },
        ...(dto.journalId ? { journalId: dto.journalId } : {}),
      },
      select: { id: true },
    });
    if (ecritures.length === 0) {
      // FORME COMPLÈTE, et c'est ce qui casserait en silence : un retour à
      // trois champs ferait lire `undefined` au client sur le compteur des
      // écartées, l'écran n'afficherait rien, et la période passerait pour
      // centralisée alors qu'elle ne l'est pas.
      return {
        validees: 0,
        dejaValidees: 0,
        refuseesSecondRegard: 0,
        sousDerogation: 0,
        motifRefus: null,
      };
    }
    return this.valider(
      tenantId,
      valideeBy,
      ecritures.map((e) => e.id),
      dto,
    );
  }

  /**
   * État du brouillard · État → Brouillard de Sage, augmenté du retard de
   * centralisation qu'impose le référentiel du dossier. Chaque écriture porte
   * son ancienneté en jours et un drapeau au-delà du délai applicable, sept
   * jours en SYCEBNL et un mois en SYSCOHADA.
   */
  async brouillard(
    tenantId: string,
    params: { exerciceId: string; journalId?: string; dateDebut?: string; dateFin?: string },
  ) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true },
    });
    const joursCentralisation = JOURS_CENTRALISATION[tenant.referentiel];
    // Le statut de l'exercice décide de ce qui est validable (audit final F77).
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: params.exerciceId, tenantId },
      select: { statut: true },
    });
    if (!exercice) throw new NotFoundException('Exercice introuvable pour ce dossier.');
    const where: Prisma.EcritureWhereInput = {
      tenantId,
      exerciceId: params.exerciceId,
      statut: StatutEcriture.BROUILLARD,
      ...(params.journalId ? { journalId: params.journalId } : {}),
      ...(params.dateDebut || params.dateFin
        ? {
            date: {
              ...(params.dateDebut ? { gte: new Date(params.dateDebut) } : {}),
              ...(params.dateFin ? { lte: new Date(params.dateFin) } : {}),
            },
          }
        : {}),
    };
    const maintenant = Date.now();

    // LES TOTAUX SONT CEUX DU BROUILLARD ENTIER, LA LISTE UNE TRANCHE (audit
    // final F185) · même parti que le journal. Les totaux se prennent sur un
    // parcours par lots, qui ne garde que des compteurs ; la liste s'arrête au
    // plafond d'une fenêtre, et le dit.
    const totaux = { nombre: 0, debit: 0, credit: 0, desequilibrees: 0, enRetard: 0 };
    await lireParLots(
      (curseur) =>
        this.prisma.ecriture.findMany({
          where: { ...where, tenantId },
          select: {
            id: true,
            createdAt: true,
            estANouveauProvisoire: true,
            estGenereeParCloture: true,
            lignes: { select: { debit: true, credit: true } },
          },
          ...pageApres(curseur, LOT_ECRITURES),
        }),
      (e) => {
        const debit = e.lignes.reduce((t, l) => t + Number(l.debit), 0);
        const credit = e.lignes.reduce((t, l) => t + Number(l.credit), 0);
        totaux.nombre++;
        totaux.debit += debit;
        totaux.credit += credit;
        if (Math.abs(debit - credit) > 0.005) totaux.desequilibrees++;
        if (enRetardDeCentralisation(e, exercice.statut, tenant.referentiel, maintenant)) totaux.enRetard++;
      },
      LOT_ECRITURES,
    );

    const ecritures = await this.prisma.ecriture.findMany({
      where: { ...where, tenantId },
      take: PLAFOND_ECRITURES_PAR_FENETRE,
      include: {
        journal: { select: { code: true, intitule: true } },
        lignes: {
          include: {
            compte: { select: { numero: true, intitule: true } },
            ventilations: { select: { sectionId: true, debit: true, credit: true } },
          },
        },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    const lignes = ecritures.map((e) => {
      const anciennete = ancienneteJours(e.createdAt, maintenant);
      const invalidable = brouillardInvalidable(e, exercice.statut);
      const debit = e.lignes.reduce((s, l) => s + Number(l.debit), 0);
      const credit = e.lignes.reduce((s, l) => s + Number(l.credit), 0);
      return {
        id: e.id,
        date: e.date.toISOString().slice(0, 10),
        createdAt: e.createdAt.toISOString(),
        journal: e.journal.code,
        journalIntitule: e.journal.intitule,
        numeroPiece: e.numeroPiece,
        libelle: e.libelle,
        reference: e.reference,
        debit,
        credit,
        equilibree: Math.abs(debit - credit) <= 0.005,
        ancienneteJours: anciennete,
        // Un brouillard que personne ne peut valider n'est pas en retard · il
        // reste au brouillard par construction, et l'écran le dit.
        invalidable,
        retardCentralisation: enRetardDeCentralisation(e, exercice.statut, tenant.referentiel, maintenant),
        // Tout ce que la modification doit renvoyer pour ne rien perdre · le
        // PATCH remplace les lignes en bloc, si bien qu'un champ que l'écran
        // ne connaît pas (taux de TVA, échéance, devise, ventilation) serait
        // effacé par la simple correction d'un libellé.
        // Les deux dates passent en propriétés abrégées · `date-versement.spec`
        // compte les endroits où une ligne NAÎT par la clé écrite en toutes
        // lettres, et cette lecture n'en est pas un.
        lignes: e.lignes.map((l) => {
          const dateEcheance = l.dateEcheance ? l.dateEcheance.toISOString().slice(0, 10) : null;
          const dateVersement = l.dateVersement ? l.dateVersement.toISOString().slice(0, 10) : null;
          return {
            compteId: l.compteId,
            compteNumero: l.compte.numero,
            compteIntitule: l.compte.intitule,
            libelle: l.libelle,
            debit: Number(l.debit),
            credit: Number(l.credit),
            tauxTvaId: l.tauxTvaId ?? null,
            dateEcheance,
            dateVersement,
            deviseId: l.deviseId ?? null,
            montantDevise: l.montantDevise === null || l.montantDevise === undefined ? null : Number(l.montantDevise),
            coursApplique: l.coursApplique === null || l.coursApplique === undefined ? null : Number(l.coursApplique),
            ventilations: (l.ventilations ?? []).map((v) => ({
              sectionId: v.sectionId,
              debit: Number(v.debit),
              credit: Number(v.credit),
            })),
          };
        }),
      };
    });

    return {
      lignes,
      totaux,
      /** Vrai quand la liste ne montre pas tout le brouillard · l'écran le dit. */
      tronque: totaux.nombre > lignes.length,
      plafond: PLAFOND_ECRITURES_PAR_FENETRE,
      delaiCentralisationJours: joursCentralisation,
    };
  }

  /**
   * RÉIMPUTATION · déplacer des lignes d'un compte vers un autre. Règles et
   * sources dans reimputation.ts : une ligne au brouillard change de compte
   * (ce n'est pas encore le livre-journal, art. 22, 2°) ; une ligne validée
   * ne bouge jamais, et la réimputation passe l'inscription en négatif puis
   * l'enregistrement exact (art. 20), une écriture par pièce d'origine, dans
   * son journal. TOUT est vérifié avant la première écriture · un lot ne
   * s'arrête pas au milieu en laissant la moitié des lignes déplacées.
   *
   * Les ventilations analytiques suivent · recopiées en négatif sur la ligne
   * annulée et à l'identique sur la ligne exacte, pour que le projet d'une
   * charge ne change pas avec son compte.
   */
  async reimputer(tenantId: string, createdBy: string, dto: ReimputerDto, options: { simuler?: boolean } = {}) {
    const ids = [...new Set(dto.ligneIds)];
    const cible = await this.prisma.compte.findFirst({ where: { id: dto.compteCibleId, tenantId } });
    if (!cible) throw new NotFoundException('Compte cible introuvable pour ce dossier.');
    if (cible.typeCompte !== TypeCompteDetailTotal.DETAIL) {
      throw new BadRequestException(`Le ${cible.numero} est un compte Total · il ne reçoit pas d'écriture.`);
    }
    if (!cible.estActif) {
      throw new BadRequestException(`Le ${cible.numero} est en sommeil · réactivez-le avant d'y réimputer.`);
    }

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: { id: { in: ids }, ecriture: { tenantId } },
      include: {
        compte: { select: { numero: true } },
        ventilations: true,
        ecriture: {
          include: {
            exercice: true,
            journal: true,
            immobilisationAcquisition: { select: { id: true } },
            immobilisationSortie: { select: { id: true } },
            dotationAmortissement: { select: { id: true } },
          },
        },
      },
    });
    if (lignes.length !== ids.length) throw new NotFoundException('Une ou plusieurs lignes sont introuvables.');
    const exercices = new Set(lignes.map((l) => l.ecriture.exerciceId));
    if (exercices.size > 1) throw new BadRequestException('Les lignes à réimputer doivent appartenir au même exercice.');

    const refus = lignes
      .map((l) =>
        motifRefusLigne(
          {
            id: l.id,
            compteId: l.compteId,
            compteNumero: l.compte.numero,
            debit: Number(l.debit),
            credit: Number(l.credit),
            lettre: l.lettre,
            lettrageId: l.lettrageId,
            rapprochementId: l.rapprochementId,
            tauxTvaId: l.tauxTvaId,
            statut: l.ecriture.statut,
            exerciceClos: l.ecriture.exercice.statut === StatutExercice.CLOTURE,
            estGenereeParCloture: l.ecriture.estGenereeParCloture,
            tenueParImmobilisation: !!(
              l.ecriture.immobilisationAcquisition ||
              l.ecriture.immobilisationSortie ||
              l.ecriture.dotationAmortissement
            ),
          },
          cible.id,
        ),
      )
      .filter((m): m is string => m !== null);
    if (refus.length) throw new BadRequestException([...new Set(refus)].join(' '));

    // TOUS LES DÉTENTEURS, PAS SEULEMENT LES TROIS DE L'IMMOBILISATION · audit
    // du serveur du 2026-09-27, F2. Au brouillard la ligne change de compte en
    // place ; validée, la réimputation passe une inscription en négatif. Dans
    // les deux cas le module qui tient l'écriture (liquidation, bulletin,
    // affectation…) affirmerait ensuite une imputation qui n'est plus la sienne.
    await this.verifierAucunModuleNeLaTient(tenantId, lignes.map((l) => l.ecritureId), 'se réimpute');

    const auBrouillard = lignes.filter((l) => l.ecriture.statut === StatutEcriture.BROUILLARD);
    // LE VERROU DE PÉRIODE VAUT AUSSI AU BROUILLARD (F3). Il n'était vérifié
    // que pour les lignes validées · une ligne au brouillard d'une période
    // close changeait de compte alors que `modifier` l'aurait refusé. La ligne
    // garde sa date : c'est à SA date, dans SON journal, que le verrou se lit.
    const brouillardsVus = new Set<string>();
    for (const l of auBrouillard) {
      if (brouillardsVus.has(l.ecritureId)) continue;
      brouillardsVus.add(l.ecritureId);
      await this.exerciceService.verifierEcritureAutorisee(tenantId, l.ecriture.journalId, l.ecriture.date);
    }
    const validees = lignes.filter((l) => l.ecriture.statut === StatutEcriture.VALIDEE);

    const exercice = lignes[0].ecriture.exercice;
    const date = dto.date ? new Date(dto.date) : new Date();
    const parEcriture = new Map<string, typeof validees>();
    for (const l of validees) parEcriture.set(l.ecritureId, [...(parEcriture.get(l.ecritureId) ?? []), l]);
    if (validees.length) {
      if (date < exercice.dateDebut || date > exercice.dateFin) {
        throw new BadRequestException(
          "La date de la réimputation sort de l'exercice des lignes · l'inscription en négatif ne vaut que pour une erreur « commise et découverte sur l'exercice en cours » (AUDCIF art. 20).",
        );
      }
      for (const groupe of parEcriture.values()) {
        await this.exerciceService.verifierEcritureAutorisee(tenantId, groupe[0].ecriture.journalId, date);
      }
    }

    // Une fusion vérifie TOUS ses exercices avant d'en écrire un seul.
    if (options.simuler) return { auBrouillard: auBrouillard.length, validees: validees.length, ecrituresPassees: [] };

    const motif = dto.motif.trim();
    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        // Une requête pour tout le brouillard, jamais une par ligne (audit
        // final F2) · la fusion d'un compte chargé en faisait des milliers.
        if (auBrouillard.length) {
          await tx.ligneEcriture.updateMany({ where: { id: { in: auBrouillard.map((l) => l.id) } }, data: { compteId: cible.id } });
        }
        const passees: { numeroPiece: number | null; journal: string }[] = [];
        for (const groupe of parEcriture.values()) {
          const origine = groupe[0].ecriture;
          const numeroPiece = await this.journalService.prochainNumeroPiece(
            tenantId,
            origine.journal,
            origine.exerciceId,
            date,
            tx,
          );
          const e = await tx.ecriture.create({
            data: {
              tenantId,
              exerciceId: origine.exerciceId,
              journalId: origine.journalId,
              numeroPiece,
              date,
              libelle: `Réimputation vers ${cible.numero} · ${origine.libelle}`.slice(0, 190),
              reference: origine.reference,
              createdBy,
              motifCorrection: motif,
              lignes: {
                create: groupe.flatMap((l) =>
                  lignesDeReimputation({ compteId: l.compteId, debit: Number(l.debit), credit: Number(l.credit) }, cible.id).map(
                    (p) => ({
                      compteId: p.compteId,
                      libelle: l.libelle,
                      debit: p.debit,
                      credit: p.credit,
                      dateEcheance: l.dateEcheance,
                      dateVersement: l.dateVersement,
                      // La devise suit la ligne, sans signe, comme à la
                      // correction (audit final F1) · le sens de la ligne dit
                      // de quel côté elle tombe.
                      deviseId: l.deviseId,
                      montantDevise: l.montantDevise,
                      coursApplique: l.coursApplique,
                      ventilations: {
                        create: l.ventilations.map((v) => ({
                          sectionId: v.sectionId,
                          planId: v.planId,
                          debit: Number(v.debit) * p.signeAnalytique,
                          credit: Number(v.credit) * p.signeAnalytique,
                        })),
                      },
                    }),
                  ),
                ),
              },
            },
            select: { numeroPiece: true },
          });
          passees.push({ numeroPiece: e.numeroPiece, journal: origine.journal.code });
        }
        return { auBrouillard: auBrouillard.length, validees: validees.length, ecrituresPassees: passees };
      },
      "Trop d'écritures enregistrées au même instant · veuillez réessayer.",
      // Chaque pièce passée coûte son numéro et sa tête, chaque ligne validée
      // deux inscriptions, chacune avec ses ventilations.
      { operations: 1 + parEcriture.size * 2 + validees.reduce((t, l) => t + 2 * (1 + l.ventilations.length), 0) },
    );
  }

  /**
   * FUSION DE COMPTES · voir `motifRefusFusionComptes` (reimputation.ts). Les
   * lignes de chaque exercice ouvert sont réimputées, toutes vérifiées avant
   * la première écriture, puis le compte absorbé est mis en sommeil. Ce que
   * les structures (taux de taxes, journaux, modèles, fiches d'immobilisation…)
   * disent encore de lui est RENDU, jamais reporté d'office · qu'un taux de
   * TVA passe d'un compte à l'autre est une décision, pas une conséquence.
   */
  async fusionnerComptes(tenantId: string, createdBy: string, sourceId: string, cibleId: string, motif: string) {
    const [source, cible] = await Promise.all([
      this.prisma.compte.findFirst({ where: { id: sourceId, tenantId } }),
      this.prisma.compte.findFirst({ where: { id: cibleId, tenantId } }),
    ]);
    if (!source || !cible) throw new NotFoundException('Compte introuvable pour ce dossier.');
    const refus = motifRefusFusionComptes(source, cible);
    if (refus) throw new BadRequestException(refus);
    if (!motif?.trim()) throw new BadRequestException('Le motif de la fusion est obligatoire.');

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: { compteId: source.id, ecriture: { tenantId, exercice: { statut: StatutExercice.OUVERT } } },
      select: { id: true, ecriture: { select: { exercice: { select: { id: true, dateDebut: true, dateFin: true } } } } },
    });
    const parExercice = new Map<string, { exercice: { dateDebut: Date; dateFin: Date }; ids: string[] }>();
    for (const l of lignes) {
      const e = l.ecriture.exercice;
      const g = parExercice.get(e.id) ?? { exercice: e, ids: [] };
      g.ids.push(l.id);
      parExercice.set(e.id, g);
    }
    const aujourdhui = new Date();
    const demandes = [...parExercice.values()].map((g) => ({
      ligneIds: g.ids,
      compteCibleId: cible.id,
      date: dateDansExercice(aujourdhui, g.exercice).toISOString().slice(0, 10),
      motif: `Fusion du ${source.numero} dans le ${cible.numero} · ${motif.trim()}`,
    }));
    for (const d of demandes) await this.reimputer(tenantId, createdBy, d, { simuler: true });

    const resultats = [];
    for (const d of demandes) resultats.push(await this.reimputer(tenantId, createdBy, d));
    await this.prisma.compte.update({ where: { id: source.id }, data: { estActif: false } });

    const restantes = await referencesVers(this.prisma, 'Compte', source.id, tenantId, ['LigneEcriture.compteId']);
    return {
      fusionne: true,
      source: source.numero,
      cible: cible.numero,
      auBrouillard: resultats.reduce((t, r) => t + r.auBrouillard, 0),
      validees: resultats.reduce((t, r) => t + r.validees, 0),
      ecrituresPassees: resultats.flatMap((r) => r.ecrituresPassees),
      // Ce qui cite encore le compte absorbé, à repointer par le cabinet.
      encoreUtilisePar: restantes.map(libelleReference),
    };
  }

  /**
   * CORRECTION D'ERREUR PAR INSCRIPTION EN NÉGATIF · art. 20 de l'AUDCIF,
   * repris mot pour mot par la Partie 2 ch. 2 du SYCEBNL :
   *
   *   « Les documents comptables doivent être tenus SANS BLANC NI ALTÉRATION
   *   D'AUCUNE SORTE. Toute correction d'erreur commise et découverte sur
   *   l'exercice en cours, s'effectue EXCLUSIVEMENT par l'inscription en
   *   négatif des éléments erronés ; l'enregistrement exact est ensuite
   *   opéré. »
   *
   * ## Pourquoi ce n'est PAS une contre-passation
   *
   * L'adverbe « exclusivement » exclut la contre-passation, qui inverse débit
   * et crédit. Ce n'est pas la même écriture, et la différence est mesurable :
   *
   *  - une erreur de 1 000 au débit du 604, CONTRE-PASSÉE, laisse ce compte
   *    avec 1 000 au débit ET 1 000 au crédit ; INSCRITE EN NÉGATIF, elle le
   *    laisse à zéro des deux côtés. Or la même section de la Partie 2 ch. 2
   *    impose à la balance générale de faire apparaître « le cumul depuis
   *    l'ouverture de l'exercice des mouvements débiteurs et le cumul des
   *    mouvements créditeurs » : la contre-passation gonfle les deux cumuls,
   *    l'inscription en négatif les laisse exacts ;
   *  - l'effet dépasse la présentation. Le tableau des flux lit les
   *    immobilisations en `DEBIT_SEUL` (une acquisition est un débit, une
   *    cession un crédit · voir correspondance-tft.ts) : une acquisition
   *    erronée CONTRE-PASSÉE apparaîtrait comme une acquisition ET une
   *    cession, deux flux de trésorerie qui n'ont jamais eu lieu. En négatif,
   *    l'acquisition se réduit à zéro et rien n'apparaît. Même mécanique pour
   *    les notes annexes qui ventilent augmentations et diminutions.
   *
   * ## Ce que la correction refuse de faire
   *
   * Une écriture n'est pas seule au monde : d'autres objets la référencent et
   * affirment quelque chose à son sujet. La corriger sans le dire laisserait
   * ces affirmations en place, devenues fausses · c'est-à-dire exactement
   * l'« altération » que le texte proscrit. Chaque refus ci-dessous nomme
   * l'objet concerné pour que l'utilisateur sache par où passer.
   */
  async corrigerParInscriptionEnNegatif(
    tenantId: string,
    createdBy: string,
    ecritureId: string,
    dto: CorrigerEcritureDto,
  ) {
    const origine = await this.prisma.ecriture.findFirst({
      where: { id: ecritureId, tenantId },
      include: {
        lignes: { include: { ventilations: true } },
        journal: true,
        exercice: true,
        correction: { select: { id: true, numeroPiece: true } },
        immobilisationAcquisition: { select: { id: true, designation: true } },
        immobilisationSortie: { select: { id: true, designation: true } },
        dotationAmortissement: { select: { id: true } },
      },
    });
    if (!origine) throw new NotFoundException('Écriture introuvable pour ce dossier.');

    if (origine.statut === StatutEcriture.BROUILLARD) {
      throw new BadRequestException(
        "Cette écriture est encore en brouillard : elle n'est pas entrée au livre-journal. " +
          "Modifiez-la directement plutôt que d'y ajouter une inscription en négatif, qui laisserait " +
          'deux écritures là où il n\'y a qu\'une saisie à reprendre.',
      );
    }

    this.verifierCorrigeable(origine);
    // Les refus nommés ci-dessus disent l'immobilisation avec sa désignation ;
    // tous les AUTRES détenteurs refusent ici (audit du serveur du 2026-09-27,
    // F2). Corriger l'écriture d'une liquidation de TVA l'annulerait au journal
    // pendant que le marqueur dit encore la période liquidée, et celle d'une
    // affectation laisserait le résultat « affecté » sans mouvement du 12.
    await this.verifierAucunModuleNeLaTient(tenantId, [origine.id], 'se corrige');

    const date = dto.date ? new Date(dto.date) : new Date();

    // « erreur commise et DÉCOUVERTE SUR L'EXERCICE EN COURS » : la correction
    // par inscription en négatif ne vaut QUE dans ce cas. Une erreur d'un
    // exercice antérieur relève d'un tout autre traitement, que le cadre
    // conceptuel décrit précisément · on le NOMME plutôt que d'appliquer
    // silencieusement le mauvais.
    if (date < origine.exercice.dateDebut || date > origine.exercice.dateFin) {
      throw new BadRequestException(
        `La date de correction (${date.toLocaleDateString('fr-FR')}) sort de l'exercice de l'écriture corrigée ` +
          `(${origine.exercice.dateDebut.toLocaleDateString('fr-FR')} – ${origine.exercice.dateFin.toLocaleDateString('fr-FR')}). ` +
          "L'inscription en négatif ne vaut que pour une erreur « commise et découverte sur l'exercice en cours ». " +
          "Une erreur d'un exercice antérieur suit un autre traitement (cadre conceptuel, § corrections d'erreurs) : " +
          'elle doit faire l’objet d’une information dans les Notes annexes, et, si elle est significative, ' +
          "être corrigée par ajustement du report à nouveau d'ouverture ; si elle ne l'est pas, directement dans les " +
          "comptes de l'exercice en cours.",
      );
    }

    await this.exerciceService.verifierEcritureAutorisee(tenantId, origine.journalId, date);

    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const numeroPiece = await this.journalService.prochainNumeroPiece(
          tenantId,
          origine.journal,
          origine.exerciceId,
          date,
          tx,
        );
        return tx.ecriture.create({
          data: {
            tenantId,
            exerciceId: origine.exerciceId,
            // Même journal que l'erreur : la correction appartient à la même
            // série chronologique que ce qu'elle corrige.
            journalId: origine.journalId,
            numeroPiece,
            date,
            libelle: `Correction (inscription en négatif) · ${origine.libelle}`,
            reference: origine.reference,
            createdBy,
            corrigeEcritureId: origine.id,
            motifCorrection: dto.motifCorrection.trim(),
            lignes: {
              // Les MÊMES comptes, dans les MÊMES sens, au signe près · voir
              // `lignesEnNegatif`, partagée avec l'annulation d'une
              // réévaluation des devises (ligne A6, D6).
              create: lignesEnNegatif(origine.lignes),
            },
          },
          include: { lignes: true, journal: true },
        });
      },
      `Trop d'écritures enregistrées au même instant sur le journal ${origine.journal.code} · veuillez réessayer.`,
    );
  }

  /**
   * L'INSCRIPTION EN NÉGATIF D'UNE ÉCRITURE QU'UN MODULE ANNULE LUI-MÊME
   * (annulation d'une réévaluation des devises, ligne A6, décision D6) · AUDCIF
   * art. 20, al. 2. Elle diffère de `corrigerParInscriptionEnNegatif` en trois
   * points, et pour la même raison · c'est le MODULE qui tient l'écriture qui
   * l'annule, avec son motif, au journal d'audit.
   *  · le détenteur ne refuse pas · c'est lui qui demande ;
   *  · l'écriture d'annulation entre VALIDÉE (art. 22, 2°) · au brouillard,
   *    elle pourrait se supprimer seule, et l'écriture annulée reprendrait
   *    effet pendant que le module la dit annulée ;
   *  · elle est datée du jour de l'écriture annulée, ou du PREMIER JOUR DE LA
   *    PÉRIODE NON CLÔTURÉE avec sa date de valeur (art. 22, 4°,
   *    `premierJourOuvert`), jamais hors de l'exercice.
   * Refus · exercice clôturé (art. 20, al. 3 · le report à nouveau, hors du
   * geste), écriture déjà corrigée.
   */
  async inscrireEnNegatifPourAnnulation(
    tenantId: string,
    userId: string,
    ecritureId: string,
    motif: string,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    const origine = await db.ecriture.findFirst({
      where: { id: ecritureId, tenantId },
      include: { lignes: { include: { ventilations: true } }, journal: true, exercice: true, correction: { select: { id: true } } },
    });
    if (!origine) throw new NotFoundException('Écriture introuvable pour ce dossier.');
    if (origine.exercice.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException(
        `L'écriture n° ${origine.numeroPiece ?? '·'} appartient à un exercice clôturé · son erreur se corrige par le report à nouveau ` +
          "(AUDCIF art. 20, al. 3), hors de ce geste.",
      );
    }
    if (origine.correction) {
      throw new BadRequestException(`L'écriture n° ${origine.numeroPiece ?? '·'} est déjà corrigée par inscription en négatif.`);
    }
    // Lettrée ou pointée · le module appelant l'a refusée avant la
    // transaction ; le refus est rejoué ici, à la source, pour tout appelant.
    const tenues = motifLignesTenues(origine.lignes, `l'écriture n° ${origine.numeroPiece ?? '·'}`, 'annuler');
    if (tenues) throw new BadRequestException(tenues);
    let date = origine.date;
    let dateValeur: Date | null = null;
    const premier = await this.exerciceService.premierJourOuvert(tenantId, origine.journalId, date);
    if (premier.getTime() !== date.getTime()) {
      if (premier > origine.exercice.dateFin) {
        throw new BadRequestException(
          `Le premier jour non clôturé du journal ${origine.journal.code} (${premier.toISOString().slice(0, 10)}) tombe hors de l'exercice · ` +
            "rouvrez la période pour inscrire l'annulation (AUDCIF art. 22, 4°).",
        );
      }
      dateValeur = date;
      date = premier;
    }
    const numeroPiece = await this.journalService.prochainNumeroPiece(tenantId, origine.journal, origine.exerciceId, date, tx);
    const maintenant = new Date();
    return db.ecriture.create({
      data: {
        tenantId,
        exerciceId: origine.exerciceId,
        journalId: origine.journalId,
        numeroPiece,
        date,
        dateValeur,
        libelle: `Annulation (inscription en négatif) · ${origine.libelle}`.slice(0, 250),
        reference: origine.reference,
        createdBy: userId,
        corrigeEcritureId: origine.id,
        motifCorrection: motif.trim(),
        statut: StatutEcriture.VALIDEE,
        valideeBy: userId,
        valideeAt: maintenant,
        lignes: { create: lignesEnNegatif(origine.lignes) },
      },
      select: { id: true, numeroPiece: true, date: true },
    });
  }

  /**
   * Les cinq états qui interdisent la correction. Chacun correspond à une
   * affirmation qu'un autre objet porte sur cette écriture et que la
   * corriger rendrait fausse sans la corriger elle.
   */
  private verifierCorrigeable(e: {
    estGenereeParCloture: boolean;
    numeroPiece: number | null;
    corrigeEcritureId: string | null;
    correction: { numeroPiece: number | null } | null;
    exercice: { statut: StatutExercice };
    lignes: { lettre: string | null; lettrageId: string | null; rapprochementId: string | null }[];
    immobilisationAcquisition: { designation: string } | null;
    immobilisationSortie: { designation: string } | null;
    dotationAmortissement: { id: string } | null;
  }) {
    if (e.exercice.statut === StatutExercice.CLOTURE) {
      throw new ForbiddenException(
        "L'exercice est clôturé. Le texte vise l'erreur « commise et découverte sur l'exercice en cours », et les " +
          'erreurs de cet exercice « doivent être corrigées AVANT l’arrêté des comptes » (cadre conceptuel).',
      );
    }
    if (e.correction) {
      throw new BadRequestException(
        `Cette écriture est déjà corrigée (pièce n° ${e.correction.numeroPiece ?? '·'}). Appliquer une seconde fois ` +
          "l'inscription en négatif inverserait l'erreur au lieu de l'annuler.",
      );
    }
    if (e.corrigeEcritureId) {
      throw new BadRequestException(
        "Cette écriture EST une correction. La corriger à son tour ré-inscrirait l'erreur : passez une nouvelle " +
          "écriture pour l'enregistrement exact (« l'enregistrement exact est ensuite opéré »).",
      );
    }
    // LA CONVENTION A DEUX EXCEPTIONS, ET LE REFUS LES NOMME.
    //
    // Le refus est juste : une écriture de clôture ne se retouche pas à la
    // main. Mais la règle citée n'est pas absolue. Le cadre conceptuel des
    // DEUX référentiels (SYCEBNL Partie 1 ch. 2 § 3.3.1 ; AUDCIF Titre V)
    // ouvre deux exceptions à la correspondance « bilan de clôture, bilan
    // d'ouverture », et deux seulement, où l'imputation se fait directement
    // sur les capitaux propres, par le compte de report à nouveau :
    //
    //  1. l'incidence d'un changement de méthodes ayant un impact FORT
    //     significatif, imputée dès l'ouverture de l'exercice ;
    //  2. la correction d'une erreur SIGNIFICATIVE commise au cours d'un
    //     exercice antérieur.
    //
    // Les deux ont leur chemin depuis le 2026-09-03 ·
    // `imputerAuxCapitauxPropresDOuverture`, fenêtre Exercices. Ce
    // commentaire et le refus disaient qu'aucune n'en avait (audit final F64),
    // et le message renvoyait à « annuler la clôture », qu'aucune route ne
    // fait pour un exercice · il nommait une démarche impossible et taisait
    // la seule qui existe.
    if (e.estGenereeParCloture) {
      throw new BadRequestException(
        "Cette écriture a été générée par la clôture (solde des classes 6/7, report à-nouveau). La corriger à la main " +
          "désaccorderait le report à-nouveau du bilan d'ouverture, alors que le bilan d'ouverture d'un exercice doit " +
          "correspondre au bilan de clôture de l'exercice précédent (SYCEBNL art. 16, 4 ; AUDCIF art. 34). Seules deux " +
          "exceptions rompent cette correspondance, un changement de méthode à impact fort significatif et la " +
          "correction d'une erreur significative d'un exercice antérieur · elles passent par l'imputation déclarée " +
          "aux capitaux propres d'ouverture (fenêtre Exercices).",
      );
    }
    if (e.immobilisationAcquisition || e.immobilisationSortie) {
      const immo = e.immobilisationAcquisition ?? e.immobilisationSortie!;
      throw new BadRequestException(
        `Cette écriture porte ${e.immobilisationAcquisition ? "l'acquisition" : 'la sortie'} de l'immobilisation ` +
          `« ${immo.designation} ». La corriger seule laisserait la fiche d'immobilisation et son plan ` +
          "d'amortissement en place, désormais sans écriture exacte en face : passez par le module Immobilisations.",
      );
    }
    if (e.dotationAmortissement) {
      throw new BadRequestException(
        "Cette écriture porte une dotation aux amortissements. La corriger seule laisserait la dotation enregistrée " +
          'sur la fiche d’immobilisation sans contrepartie comptable : passez par le module Immobilisations.',
      );
    }
    const tenues = motifLignesTenues(e.lignes, 'cette écriture', 'corriger');
    if (tenues) throw new BadRequestException(tenues);
  }

  /** Journal : liste chronologique des écritures, filtrable par exercice/journal/période/recherche. */
  async lister(
    tenantId: string,
    filtres: {
      exerciceId?: string;
      journalId?: string;
      dateDebut?: string;
      dateFin?: string;
      recherche?: string;
      compte?: string;
      montantMin?: number;
      montantMax?: number;
      numeroPiece?: number;
      reference?: string;
      /**
       * Le journal est un état de TRAVAIL : il montre le brouillard par
       * défaut, marqué comme tel, pour que le comptable voie où il en est.
       * `false` donne le livre-journal seul, tel qu'il sera imprimé.
       */
      inclureBrouillard?: boolean;
      /**
       * Nombre maximal d'écritures, les plus récentes d'abord quand il est
       * posé. Le tableau de bord n'affiche que quelques mouvements : lui
       * faire télécharger l'exercice entier était le premier poste de
       * lenteur relevé à l'audit. Absent = comportement historique (tout).
       */
      limite?: number;
      /**
       * Les plus récentes d'abord, sous le même plafond (audit final F61) ·
       * la saisie montre la dernière pièce, celle qu'on vient d'enregistrer.
       * Lue dans l'ordre chronologique, une fenêtre de plus de deux mille
       * pièces en perdait justement la fin.
       */
      plusRecentesDAbord?: boolean;
    },
  ) {
    const where = perimetreJournal(tenantId, filtres);

    // AUCUNE COLLECTION SANS BORNE · sans ce plafond, la fenêtre Journal
    // d'un gros dossier tuait le serveur (voir PLAFOND_ECRITURES_PAR_FENETRE).
    // Une limite explicite (le tableau de bord) garde la sienne.
    const take = filtres.limite ?? PLAFOND_ECRITURES_PAR_FENETRE;
    const ecritures = await this.prisma.ecriture.findMany({
      take,
      where,
      include: {
        lignes: { include: { compte: true } },
        journal: true,
        // Correction (art. 20 AUDCIF) : le journal doit montrer qu'une
        // écriture a été annulée par inscription en négatif, sinon le lecteur
        // additionne une erreur et son annulation sans savoir laquelle est
        // laquelle. `corrigeEcritureId` et `motifCorrection` sont des scalaires,
        // donc déjà renvoyés · seul le lien inverse doit être demandé.
        correction: { select: { id: true, numeroPiece: true, date: true } },
        corrigeEcriture: { select: { id: true, numeroPiece: true, date: true, libelle: true } },
      },
      // Départage explicite : à date égale, l'ordre de sortie serait sinon
      // laissé au plan d'exécution PostgreSQL et pourrait changer d'un export
      // à l'autre (voir TRI_GRAND_LIVRE).
      orderBy: filtres.limite || filtres.plusRecentesDAbord
        ? [{ date: 'desc' }, { numeroPiece: 'desc' }, { id: 'desc' }]
        : [{ date: 'asc' }, { numeroPiece: 'asc' }, { id: 'asc' }],
    });

    // LES TOTAUX SONT CEUX DU JOURNAL, PAS CEUX DE L'ÉCRAN · additionner les
    // seules écritures rendues donnerait un total juste pour la tranche et
    // faux pour le journal, sans que rien ne le dise. Ils viennent donc
    // toujours d'un agrégat SQL sur le périmètre complet · c'est aussi ce
    // qu'affiche Sage en pied de fenêtre (« Totaux journal »).
    const [agg, total] = await Promise.all([
      this.prisma.ligneEcriture.aggregate({
        _sum: { debit: true, credit: true },
        where: { ecriture: where },
      }),
      // `tenantId` répété alors que `where` le porte déjà · le balayage de
      // cloisonnement lit le CODE, pas la valeur d'une variable, et une borne
      // qu'il ne voit pas est une borne qu'un relecteur ne voit pas non plus.
      this.prisma.ecriture.count({ where: { ...where, tenantId } }),
    ]);

    return {
      ecritures,
      totaux: { debit: Number(agg._sum.debit ?? 0), credit: Number(agg._sum.credit ?? 0) },
      /** Nombre d'écritures du périmètre, tranche ou pas. */
      total,
      /** Vrai quand l'écran ne montre pas tout · l'interface DOIT le dire. */
      tronque: total > ecritures.length,
      plafond: take,
    };
  }

  /**
   * Tri total et déterministe des lignes de grand livre. La date seule ne
   * suffit pas : deux écritures du même jour (une facture et son règlement,
   * ou toutes les écritures d'une clôture datées de la fin d'exercice)
   * sortiraient dans un ordre laissé au plan d'exécution PostgreSQL, qui
   * peut changer d'un appel à l'autre. La colonne « solde progressif »
   * différerait alors entre deux exports du MÊME exercice · inacceptable
   * pour un dossier d'audit, où l'on recoupe deux tirages ligne à ligne.
   * Le `id` final garantit un ordre total.
   */
  private static readonly TRI_GRAND_LIVRE = [
    { ecriture: { date: 'asc' } },
    { ecriture: { numeroPiece: 'asc' } },
    { id: 'asc' },
  ] satisfies Prisma.LigneEcritureOrderByWithRelationInput[];

  /**
   * Contreparties de TOUTES les écritures d'un périmètre, précalculées en une
   * requête plate : pour chaque écriture, la liste des comptes débités et
   * celle des comptes crédités.
   *
   * Règle (voir docs/plan-de-construction.md, « Export Excel · compte
   * contrepartie ») : la contrepartie d'une ligne, ce sont les comptes
   * DISTINCTS de sens opposé dans la même écriture. Exacte et non ambiguë
   * dans les cas usuels (2 lignes, N débits/1 crédit, 1 débit/M crédits) ;
   * dans le cas rare d'une écriture à débits ET crédits multiples simultanés
   * (N×M), la liste porte plusieurs comptes candidats plutôt qu'un choix
   * arbitraire faussement précis. Retenir le seul sens opposé écarte au
   * passage la ligne elle-même et toute autre ligne portant le même compte du
   * même côté · inutile d'y ajouter un « sauf soi-même » ad hoc.
   *
   * Motif : la contrepartie d'une ligne ne dépend que de son SENS et de son
   * écriture · il n'y a donc que deux réponses possibles par écriture, pas
   * une par ligne. Les charger via `ecriture: { lignes: ... }` imbriqué
   * dupliquait l'écriture entière autant de fois qu'elle a de lignes
   * (amplification en O(k²) : mesuré 2,4 Go de RSS sur 50 000 lignes, et une
   * écriture de ventilation de paie à 100 lignes suffisait à faire tomber le
   * processus · donc tous les tenants avec lui, l'application étant
   * mono-processus).
   */
  private async chargerContreparties(
    where: Prisma.LigneEcritureWhereInput,
  ): Promise<Map<string, { DEBIT: string[]; CREDIT: string[] }>> {
    const brut = await this.prisma.ligneEcriture.findMany({
      where,
      select: { ecritureId: true, debit: true, compte: { select: { numero: true } } },
    });

    // Ensembles pendant l'accumulation (dédoublonnage), figés en tableaux
    // ensuite : la contrepartie d'une ligne au débit est la liste des comptes
    // CRÉDITÉS, et réciproquement · d'où l'inversion à la fin.
    const debits = new Map<string, Set<string>>();
    const credits = new Map<string, Set<string>>();
    for (const l of brut) {
      // Le SENS d'une ligne est le côté où son montant est porté, pas le
      // signe de ce montant : une correction par inscription en négatif
      // (art. 20 AUDCIF) porte un débit NÉGATIF, qui reste un débit. Tester
      // `> 0` la rangeait au crédit et lui donnait la mauvaise contrepartie.
      const cible = estLigneDebit(l) ? debits : credits;
      let ens = cible.get(l.ecritureId);
      if (!ens) {
        ens = new Set();
        cible.set(l.ecritureId, ens);
      }
      ens.add(l.compte.numero);
    }

    const parEcriture = new Map<string, { DEBIT: string[]; CREDIT: string[] }>();
    for (const ecritureId of new Set([...debits.keys(), ...credits.keys()])) {
      parEcriture.set(ecritureId, {
        // Ligne au débit → contrepartie = comptes crédités.
        DEBIT: [...(credits.get(ecritureId) ?? [])],
        // Ligne au crédit → contrepartie = comptes débités.
        CREDIT: [...(debits.get(ecritureId) ?? [])],
      });
    }
    return parEcriture;
  }

  /** Mise en forme d'une ligne de grand livre, solde progressif fourni par l'appelant. */
  private static versLigneGrandLivre(
    l: {
      id: string;
      ecritureId: string;
      libelle: string | null;
      debit: Prisma.Decimal;
      credit: Prisma.Decimal;
      lettre: string | null;
      ecriture: {
        date: Date;
        libelle: string;
        reference: string | null;
        numeroPiece: number | null;
        journal: { code: string };
      };
    },
    soldeProgressif: number,
    contreparties: Map<string, { DEBIT: string[]; CREDIT: string[] }>,
  ) {
    const sens = estLigneDebit(l) ? 'DEBIT' : 'CREDIT';
    return {
      id: l.id,
      date: l.ecriture.date,
      journalCode: l.ecriture.journal.code,
      numeroPiece: l.ecriture.numeroPiece,
      libelle: l.libelle ?? l.ecriture.libelle,
      reference: l.ecriture.reference,
      debit: Number(l.debit),
      credit: Number(l.credit),
      lettre: l.lettre,
      soldeProgressif,
      contrepartie: contreparties.get(l.ecritureId)?.[sens] ?? [],
    };
  }

  /**
   * ÉCHÉANCIER DE TRÉSORERIE · ce qui va tomber, et ce qu'il restera en
   * caisse quand ce sera tombé.
   *
   * ## Pourquoi il ne fait pas double emploi avec la balance âgée
   *
   * La balance âgée regarde EN ARRIÈRE : elle ventile par ancienneté de
   * retard ce qui aurait dû être réglé. L'échéancier regarde EN AVANT : il
   * ventile par date d'exigibilité ce qui va devoir l'être, et le confronte
   * à la trésorerie disponible. Ce sont deux questions différentes, et une
   * association qui vit de tranches de subvention se pose surtout la seconde.
   *
   * Sage les distingue d'ailleurs lui aussi (`sage-i7`,
   * `comptabilite-generale.md` : « Échéancier : état de suivi des échéances à
   * venir, DISTINCT de la balance âgée »).
   *
   * ## Assiette
   *
   * Les lignes non lettrées des comptes de tiers, classes 40 à 44 · pas
   * seulement les fournisseurs et les clients. Une ASBL congolaise doit
   * autant d'argent à son personnel (42), aux organismes sociaux (43) et à
   * l'État (44) qu'à ses fournisseurs, et ces trois-là ont des dates de
   * reversement strictes (voir docs/fiscalite-asbl-rdc.md, section 6). Un
   * échéancier qui les ignorerait manquerait précisément ce qui met une
   * association en défaut.
   *
   * `lettre: null` et non `lettrageId: null` : une ligne d'un groupe de
   * lettrage PARTIEL reste due pour son solde, elle a donc sa place ici.
   *
   * L'échéance retenue est `dateEcheance` ; à défaut, la date de l'écriture,
   * même règle que la balance âgée et que Sage.
   *
   * ## Sens
   *
   * Une ligne de tiers au débit est une créance : son dénouement est un
   * ENCAISSEMENT. Au crédit, c'est une dette : un DÉCAISSEMENT.
   *
   * ## Détail ligne à ligne, totaux compensés
   *
   * Contrairement à la balance âgée, qui agrège par compte, le détail garde
   * une ligne par écriture avec sa pièce : c'est ce qu'on attend d'un état
   * d'en-cours, où l'on veut savoir QUELLE facture tombe quand. Une
   * correction par inscription en négatif (art. 20 AUDCIF) y reste donc
   * visible à côté de la ligne qu'elle corrige · elles se compensent dans le
   * total de la tranche, et c'est la projection qui décide.
   */
  async echeancier(
    tenantId: string,
    params: { exerciceId: string; dateReference?: string },
  ) {
    const ref = params.dateReference ? new Date(params.dateReference) : new Date();
    // Minuit, pour qu'une échéance du jour ne bascule pas en retard selon
    // l'heure d'ouverture de l'écran.
    ref.setHours(0, 0, 0, 0);

    // Trésorerie disponible au sens du plan SYCEBNL : classe 5 hors 59
    // (dépréciations, qui ne sont pas des liquidités). PAR AGRÉGAT (audit
    // final F185) · toutes les lignes de trésorerie passaient en mémoire pour
    // n'en garder qu'une somme.
    const tresorerie = await this.prisma.ligneEcriture.aggregate({
      where: {
        ecriture: { tenantId, exerciceId: params.exerciceId },
        compte: { numero: { startsWith: '5' }, NOT: { numero: { startsWith: '59' } } },
      },
      _sum: { debit: true, credit: true },
    });
    const tresorerieActuelle = Number(tresorerie._sum.debit ?? 0) - Number(tresorerie._sum.credit ?? 0);

    const TRANCHES: Array<{ cle: string; libelle: string; deJours: number | null; aJours: number | null }> = [
      { cle: 'echu', libelle: 'Échu, non réglé', deJours: null, aJours: -1 },
      { cle: 'j0a7', libelle: 'À 7 jours', deJours: 0, aJours: 7 },
      { cle: 'j8a30', libelle: 'De 8 à 30 jours', deJours: 8, aJours: 30 },
      { cle: 'j31a60', libelle: 'De 31 à 60 jours', deJours: 31, aJours: 60 },
      { cle: 'j61a90', libelle: 'De 61 à 90 jours', deJours: 61, aJours: 90 },
      { cle: 'plus90', libelle: 'Au-delà de 90 jours', deJours: 91, aJours: null },
    ];

    const trancheDe = (echeance: Date): string => {
      const jours = Math.floor((echeance.getTime() - ref.getTime()) / 86_400_000);
      if (jours < 0) return 'echu';
      if (jours <= 7) return 'j0a7';
      if (jours <= 30) return 'j8a30';
      if (jours <= 60) return 'j31a60';
      if (jours <= 90) return 'j61a90';
      return 'plus90';
    };

    // PAR TRANCHES (audit final F185) · les tranches cumulent TOUTES les
    // échéances ; la liste détaillée garde les plus proches, jusqu'au plafond
    // d'une fenêtre, et le dit.
    const cumuls = new Map<string, { encaissements: number; decaissements: number }>();
    const plusProches = new PremiersSelon<EcheanceDetail>(
      PLAFOND_ECRITURES_PAR_FENETRE,
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    let lignesSansEcheance = 0;
    await lireParLots(
      (curseur) =>
        this.prisma.ligneEcriture.findMany({
          where: {
            ecriture: { tenantId, exerciceId: params.exerciceId },
            lettre: null,
            OR: ['40', '41', '42', '43', '44'].map((r) => ({ compte: { numero: { startsWith: r } } })),
          },
          include: {
            compte: {
              select: {
                id: true,
                numero: true,
                intitule: true,
                tiersCompte: { select: { tiers: { select: { nom: true } } } },
              },
            },
            ecriture: { select: { date: true, libelle: true, reference: true } },
          },
          ...pageApres(curseur, LOT_LECTURE),
        }),
      (l) => {
        if (l.dateEcheance === null) lignesSansEcheance++;
        const net = Number(l.debit) - Number(l.credit);
        if (Math.abs(net) < 0.005) return;
        const date = l.dateEcheance ?? l.ecriture.date;
        const tranche = trancheDe(date);
        const c = cumuls.get(tranche) ?? { encaissements: 0, decaissements: 0 };
        if (net > 0) c.encaissements += net;
        else c.decaissements -= net;
        cumuls.set(tranche, c);
        plusProches.ajouter({
          ligneId: l.id,
          date,
          tranche: trancheDe(date),
          compteNumero: l.compte.numero,
          compteIntitule: l.compte.intitule,
          tiers: l.compte.tiersCompte?.tiers.nom ?? null,
          libelle: l.libelle ?? l.ecriture.libelle,
          reference: l.ecriture.reference,
          montant: Math.abs(net),
          sens: net > 0 ? 'ENCAISSEMENT' : 'DECAISSEMENT',
        });
      },
    );
    const details = plusProches.elements();

    let cumul = tresorerieActuelle;
    const tranches: TrancheEcheancier[] = TRANCHES.map((t) => {
      const { encaissements, decaissements } = cumuls.get(t.cle) ?? { encaissements: 0, decaissements: 0 };
      const net = encaissements - decaissements;
      cumul += net;
      return {
        ...t,
        encaissements: Math.round(encaissements * 100) / 100,
        decaissements: Math.round(decaissements * 100) / 100,
        net: Math.round(net * 100) / 100,
        tresorerieProjetee: Math.round(cumul * 100) / 100,
      };
    });

    // La première tranche où la projection passe sous zéro · c'est LA
    // réponse que cherche un trésorier, et elle doit être nommée plutôt que
    // laissée à lire dans une colonne.
    const premiereTrancheNegative = tranches.find((t) => t.tresorerieProjetee < 0) ?? null;

    return {
      dateReference: ref,
      tresorerieActuelle: Math.round(tresorerieActuelle * 100) / 100,
      tranches,
      details,
      /** Vrai quand la liste détaillée ne montre que les plus proches · les tranches restent entières. */
      tronque: plusProches.tronquee,
      nombreDetails: plusProches.nombre,
      alerte: premiereTrancheNegative
        ? {
            tranche: premiereTrancheNegative.cle,
            libelle: premiereTrancheNegative.libelle,
            tresorerieProjetee: premiereTrancheNegative.tresorerieProjetee,
            message:
              `La trésorerie projetée devient négative dans la tranche « ${premiereTrancheNegative.libelle} » ` +
              `(${premiereTrancheNegative.tresorerieProjetee.toFixed(2)}). Les échéances de cette tranche et des ` +
              'suivantes ne pourront pas être honorées sans encaissement supplémentaire.',
          }
        : null,
      // Les échéances non renseignées prennent la date de l'écriture : c'est
      // la règle, mais elle fausse la projection si beaucoup de lignes en
      // relèvent. Le compte est donné pour que le lecteur en juge.
      lignesSansEcheance,
    };
  }

  /**
   * BALANCE ÂGÉE · l'antériorité des créances et dettes non lettrées, tiers
   * par tiers, dans la présentation des dossiers de révision réels.
   *
   * ELLE NE VENTILE PLUS PAR TRANCHES GLISSANTES DE TRENTE JOURS, et c'est le
   * cœur de la correction. Un état « 1 à 30 j / 31 à 60 j / 61 à 90 j / + 90 »
   * calculé depuis une date de référence est illisible pour qui doit retrouver
   * la facture : il faut refaire les dates de tête. Le modèle relevé sur un
   * dossier congolais réel (« Balance âgée Client - CARRIGRES au 31-12-2025 »,
   * ouvert cellule par cellule) titre chaque colonne par une PÉRIODE
   * CALENDAIRE, et rappelle l'âge correspondant au-dessus :
   *
   *     |            | 180 j et + | < 150 j | < 120 j | < 90 j | < 60 j | < 30 j |
   *     | avant le   | Du 01/01   | Du 01/08| Du 01/09| Du 01/10|Du 01/11|Du 01/12|
   *     | 01/01/2025 | au 31/07   | au 31/08| au 30/09| au 31/10|au 30/11|au 31/12|
   *
   * Soit sept tranches : les CINQ derniers mois entiers un par un, le reste de
   * l'exercice en un bloc, et tout ce qui précède l'exercice dans une colonne
   * d'ouverture. Un mois est une unité que le comptable manipule ; trente
   * jours glissants n'en sont pas une.
   *
   * DEUXIÈME CORRECTION · la ligne est un TIERS, pas un compte. Un tiers peut
   * porter plusieurs comptes rattachés (un 411 d'exploitation et un 416
   * douteux, typiquement) ; les présenter sur deux lignes éclate son
   * exposition. À défaut de tiers rattaché, la ligne reste le compte, nommé
   * comme tel · c'est encore une anomalie à voir, pas une ligne à masquer.
   *
   * TROISIÈME CORRECTION · les tiers dont le solde est À L'ENVERS ne sont pas
   * ventilés. Un client créditeur n'a pas d'antériorité de créance : le
   * ventiler par âge de retard est un contresens, et il pollue chaque colonne.
   * Ils sont rendus à part, avec leur seul solde et leur propre total. D'où
   * trois totaux, comme chez eux : débiteurs, créditeurs, et le net qui doit
   * RECOUPER la balance auxiliaire des mêmes comptes · c'est le contrôle
   * croisé que le réviseur fait en premier, et il était impossible tant que
   * les deux sens étaient mélangés.
   *
   * Assiette inchangée : les lignes NON LETTRÉES des comptes de tiers, chacune
   * rattachée à son échéance saisie ou, à défaut, à sa date d'écriture (Sage
   * 100 i7 : « reprend la date d'écriture comme échéance si celle-ci n'a pas
   * été saisie »). Chaque ligne pèse son montant NET (débit − crédit) : une
   * correction par inscription en négatif (art. 20 AUDCIF) annule ainsi sa
   * ligne d'origine dans la même tranche au lieu de gonfler deux tranches en
   * sens opposés.
   */
  async balanceAgee(
    tenantId: string,
    params: { exerciceId: string; dateReference?: string; type?: PerimetreBalanceAgee },
  ) {
    // UN EXERCICE D'UN AUTRE DOSSIER, OU INCONNU, EST UN 404 NOMMÉ (jumeau de
    // l'audit final F222) · `findFirstOrThrow` rendait l'erreur brute de
    // Prisma, que Nest sert en 500 sans un mot.
    const exercice = exerciceDuDossierOuRefus(
      await this.prisma.exercice.findFirst({
        where: { id: params.exerciceId, tenantId },
        select: { dateDebut: true, dateFin: true },
      }),
    );
    // La date de référence ne peut pas sortir de l'exercice : au-delà, les
    // colonnes mensuelles n'auraient plus d'écriture à recevoir.
    const demande = params.dateReference ? new Date(params.dateReference) : new Date();
    const ref = demande > exercice.dateFin ? exercice.dateFin : demande;
    const type: PerimetreBalanceAgee = params.type ?? 'TOUS';
    const perimetre = PERIMETRES_BALANCE_AGEE[type];
    const racines = perimetre.racines;

    // --- Les sept tranches ---------------------------------------------
    const jour = (d: Date) => d.toLocaleDateString('fr-FR');
    const MOIS_DETAILLES = 5;
    // Premier jour du mois de la date de référence, puis on remonte.
    const debutsDeMois: Date[] = [];
    for (let i = 0; i < MOIS_DETAILLES; i++) {
      debutsDeMois.unshift(new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - i, 1)));
    }
    const debutFenetre = debutsDeMois[0];
    const tranches: TrancheAgee[] = [];
    const bornes: Array<{ min: Date | null; max: Date | null }> = [];

    tranches.push({
      cle: 'ouverture',
      libellePeriode: `Avant le ${jour(exercice.dateDebut)}`,
      libelleAge: "Antérieur à l'exercice",
    });
    bornes.push({ min: null, max: exercice.dateDebut });

    // Le bloc « reste de l'exercice » n'existe que si l'exercice commence
    // avant la fenêtre mensuelle · sur un exercice de moins de cinq mois, ou
    // une date de référence proche de l'ouverture, il serait vide et faux.
    if (exercice.dateDebut < debutFenetre) {
      const veille = new Date(debutFenetre.getTime() - 86_400_000);
      tranches.push({
        cle: 'ancien',
        libellePeriode: `Du ${jour(exercice.dateDebut)} au ${jour(veille)}`,
        libelleAge: `${MOIS_DETAILLES * 30 + 30} jours et plus`,
      });
      bornes.push({ min: exercice.dateDebut, max: debutFenetre });
    }

    debutsDeMois.forEach((debut, i) => {
      const finMois = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth() + 1, 1));
      const dernierJour = new Date(finMois.getTime() - 86_400_000);
      // Le mois le plus récent est le moins de 30 jours ; on remonte de 30 en
      // 30, comme dans le modèle relevé.
      const age = (MOIS_DETAILLES - i) * 30;
      tranches.push({
        cle: debut.toISOString().slice(0, 7),
        libellePeriode: `Du ${jour(debut)} au ${jour(dernierJour)}`,
        libelleAge: `Moins de ${age} jours`,
      });
      bornes.push({ min: debut, max: finMois });
    });

    const indexTranche = (echeance: Date): number => {
      for (let i = bornes.length - 1; i >= 0; i--) {
        const { min, max } = bornes[i];
        if ((min === null || echeance >= min) && (max === null || echeance < max)) return i;
      }
      // Une échéance postérieure à la fenêtre (saisie en avance) rejoint le
      // mois le plus récent plutôt que de disparaître de l'état.
      return bornes.length - 1;
    };

    // --- Les lignes -----------------------------------------------------
    const [lignes, rattachements] = await Promise.all([
      this.prisma.ligneEcriture.findMany({
        where: {
          // L'ÉTAT AU JOUR DIT (audit final F52) · une facture postérieure à
          // la date de référence n'existait pas encore, et un règlement
          // postérieur ne la soldait pas encore. La date qui compte est celle
          // des écritures du groupe, jamais celle du lettrage · même règle
          // que les notes par échéance (lettrage/ouverte-a-la-cloture.ts).
          ecriture: { tenantId, exerciceId: params.exerciceId, date: { lte: ref } },
          AND: [ouverteALaCloture(ref)],
          OR: racines.map((r) => ({ compte: { numero: { startsWith: r } } })),
          // LES EXCLUSIONS DU PÉRIMÈTRE · voir `PERIMETRES_BALANCE_AGEE`.
          ...(perimetre.exclusions.length > 0
            ? { NOT: perimetre.exclusions.map((e) => ({ compte: { numero: { startsWith: e } } })) }
            : {}),
        },
        include: {
          compte: { select: { id: true, numero: true, intitule: true } },
          ecriture: { select: { date: true, estGenereeParCloture: true, estSoldeDesComptesDeGestion: true } },
        },
      }),
      this.prisma.tiersCompte.findMany({
        where: { tiers: { tenantId } },
        select: { compteId: true, tiers: { select: { id: true, code: true, nom: true } } },
      }),
    ]);
    const tiersDuCompte = new Map(rattachements.map((r) => [r.compteId, r.tiers]));

    const parCle = new Map<string, LigneAgee>();
    for (const l of lignes) {
      const net = Number(l.debit) - Number(l.credit);
      if (Math.abs(net) < 0.005) continue;
      const tiers = tiersDuCompte.get(l.compte.id);
      const cle = tiers ? `tiers:${tiers.id}` : `compte:${l.compte.id}`;
      const entree =
        parCle.get(cle) ??
        ({
          cle,
          // « 410038 - CREC 8 » chez eux · code du tiers, puis son nom.
          libelle: tiers ? `${tiers.code} - ${tiers.nom}` : `${l.compte.numero} - ${l.compte.intitule}`,
          codeTiers: tiers?.code ?? '',
          numero: l.compte.numero,
          montants: tranches.map(() => 0),
          solde: 0,
        } satisfies LigneAgee);
      // UNE LIGNE DE REPORT SANS ÉCHÉANCE EST ANTÉRIEURE À L'EXERCICE (audit
      // final F51) · le report est daté du premier jour, et la borne de la
      // colonne l'excluait · une facture de N-1 tombait dans les tranches de
      // l'exercice. Avec une échéance, c'est elle qui range, comme ailleurs.
      const estReport = l.ecriture.estGenereeParCloture && !l.ecriture.estSoldeDesComptesDeGestion;
      entree.montants[estReport && !l.dateEcheance ? 0 : indexTranche(l.dateEcheance ?? l.ecriture.date)] += net;
      entree.solde += net;
      parCle.set(cle, entree);
    }

    const arrondir = (x: number) => Math.round(x * 100) / 100;
    const toutes = [...parCle.values()]
      .map((c) => ({ ...c, montants: c.montants.map(arrondir), solde: arrondir(c.solde) }))
      .filter((c) => Math.abs(c.solde) >= 0.005 || c.montants.some((m) => Math.abs(m) >= 0.005));

    // Les plus exposés en tête · c'est l'ordre du dossier de révision, et le
    // premier écran doit porter ce qui fait réagir.
    const debiteurs = toutes.filter((c) => c.solde > 0).sort((a, b) => b.solde - a.solde);
    const crediteurs = toutes
      .filter((c) => c.solde <= 0)
      // Un créditeur n'a pas d'antériorité de créance · ses tranches sont
      // vidées plutôt que rendues, pour qu'aucune lecture ne les additionne.
      .map((c) => ({ ...c, montants: [] as number[] }))
      .sort((a, b) => b.solde - a.solde);

    const parTranche = tranches.map((_, i) => arrondir(debiteurs.reduce((t, c) => t + c.montants[i], 0)));
    const totalDebiteurs = arrondir(debiteurs.reduce((t, c) => t + c.solde, 0));
    const totalCrediteurs = arrondir(crediteurs.reduce((t, c) => t + c.solde, 0));

    return {
      dateReference: ref.toISOString().slice(0, 10),
      debutExercice: exercice.dateDebut.toISOString().slice(0, 10),
      type,
      // CE QUE L'ANTÉRIORITÉ VEUT DIRE DANS CE PÉRIMÈTRE · sans cette phrase,
      // le même tableau se lit comme un retard de règlement sur des comptes
      // où un solde ancien est parfaitement normal.
      lecture: perimetre.lecture,
      libellePerimetre: perimetre.libelle,
      tranches,
      debiteurs,
      crediteurs,
      totaux: {
        parTranche,
        debiteurs: totalDebiteurs,
        crediteurs: totalCrediteurs,
        // Ce net doit recouper le solde de la balance auxiliaire des mêmes
        // comptes · c'est le contrôle croisé du réviseur.
        net: arrondir(totalDebiteurs + totalCrediteurs),
      },
    };
  }

  /**
   * JUSTIFICATIF DE SOLDE · le détail qui compose le solde d'un compte à une
   * date, et son recoupement avec la balance.
   *
   * C'est la pièce maîtresse d'un dossier de révision, et le logiciel n'en
   * produisait aucune. Le dossier ouvert sur le Drive la répète pour une
   * dizaine de comptes (471100 factures à recevoir, 471500 provision fiscale,
   * 472300 charges constatées d'avance, 469150 débiteurs divers, 230000 immos
   * en cours, 270000 immos financières, 360100 stock à l'extérieur, 417000
   * clients douteux…). Sans elle, il faut sortir le grand livre du compte et
   * le retravailler à la main.
   *
   * CE N'EST PAS LE GRAND LIVRE DU COMPTE, et la différence est tout le sujet.
   * Le grand livre est borné à l'exercice ; le justificatif remonte AUSSI LOIN
   * QUE NÉCESSAIRE. Leur détail du compte 469150 arrêté au 31/12/2025 part de
   * 2020 · une créance sur un tiers divers ouverte il y a cinq ans compose
   * encore le solde d'aujourd'hui, et le grand livre de 2025 ne la montre pas.
   *
   * LE PIÈGE DE L'À-NOUVEAU. Remonter tout l'historique et garder les
   * écritures d'à-nouveau double le solde : l'à-nouveau reprend le cumul des
   * exercices antérieurs, qu'on est déjà en train de lister ligne à ligne. Ils
   * sont donc écartés · SAUF ceux du PREMIER exercice du dossier, qui ne
   * reprennent rien mais portent le bilan d'ouverture, c'est-à-dire la
   * position de départ. Les écarter tous ferait disparaître le point de
   * départ d'un dossier repris en cours de vie, silencieusement.
   *
   * LE RECOUPEMENT est calculé par un AUTRE CHEMIN que la liste : report
   * (à-nouveaux) plus mouvements de l'exercice, comme la balance. Recouper la
   * liste contre elle-même ne prouverait rien ; la recouper contre la balance
   * attrape précisément le double comptage ci-dessus.
   */
  async justificatifSolde(
    tenantId: string,
    params: { compteId: string; exerciceId: string; dateArret?: string; masquerLettrees?: boolean },
  ) {
    const [compteLu, exerciceLu, premierExercice] = await Promise.all([
      this.prisma.compte.findFirst({
        where: { id: params.compteId, tenantId },
        select: { id: true, numero: true, intitule: true },
      }),
      this.prisma.exercice.findFirst({
        where: { id: params.exerciceId, tenantId },
        select: { id: true, dateDebut: true, dateFin: true },
      }),
      this.prisma.exercice.findFirst({
        where: { tenantId },
        orderBy: { dateDebut: 'asc' },
        select: { id: true },
      }),
    ]);
    // L'EXERCICE ET LE COMPTE SE VÉRIFIENT, ils ne se présument pas (jumeau de
    // l'audit final F222) · `findFirstOrThrow` rendait une erreur de Prisma
    // servie en 500. L'exercice d'abord, comme tout état : c'est lui que
    // l'export lit en même temps que l'identité du dossier.
    const exercice = exerciceDuDossierOuRefus(exerciceLu);
    if (!compteLu) {
      throw new NotFoundException('Compte introuvable dans ce dossier : aucun justificatif de solde ne peut être établi.');
    }
    const compte = compteLu;
    const demande = params.dateArret ? new Date(params.dateArret) : exercice.dateFin;
    const arret = demande > exercice.dateFin ? exercice.dateFin : demande;

    const whereJustificatif: Prisma.LigneEcritureWhereInput = {
      compteId: compte.id,
      ...(params.masquerLettrees ? { lettre: null } : {}),
      ecriture: {
        tenantId,
        date: { lte: arret },
        // Les à-nouveaux de clôture sont exclus · voir le piège ci-dessus.
        // Ceux du premier exercice portent le bilan d'ouverture et restent.
        // L'écriture qui SOLDE les classes 6 à 8 reste toujours (audit
        // final F53) · sans elle, un compte de charge cumulait ses années
        // closes et le recoupement annonçait un écart inexistant.
        NOT: {
          AND: [
            { estGenereeParCloture: true },
            { estSoldeDesComptesDeGestion: false },
            // L'exercice demandé est du dossier, le premier existe donc ·
            // le repli ne sert qu'au typage.
            { exerciceId: { not: premierExercice?.id ?? exercice.id } },
          ],
        },
      },
    };
    // UN JUSTIFICATIF NE SE TRONQUE PAS (audit final F185) · c'est la pièce
    // qui justifie un solde, et amputée elle en justifierait un autre. Au-delà
    // du plafond d'une fenêtre il se refuse, en disant par où passer.
    const nombreLignes = await this.prisma.ligneEcriture.count({ where: whereJustificatif });
    if (nombreLignes > PLAFOND_LIGNES_GRAND_LIVRE) {
      throw new BadRequestException(
        `Le justificatif du compte ${compte.numero} porte ${nombreLignes.toLocaleString('fr-FR')} lignes, au-delà ` +
          `de ce qu'une fenêtre peut afficher (${PLAFOND_LIGNES_GRAND_LIVRE.toLocaleString('fr-FR')}). Masquez ` +
          `les lignes lettrées, ou avancez la date d'arrêt.`,
      );
    }
    const lignes = await this.prisma.ligneEcriture.findMany({
      where: whereJustificatif,
      include: {
        devise: { select: { code: true } },
        ecriture: {
          select: {
            date: true,
            libelle: true,
            reference: true,
            numeroPiece: true,
            estGenereeParCloture: true,
            estSoldeDesComptesDeGestion: true,
            journal: { select: { code: true } },
          },
        },
      },
      orderBy: [{ ecriture: { date: 'asc' } }, { id: 'asc' }],
    });

    const arrondir = (x: number) => Math.round(x * 100) / 100;
    const detail = lignes.map((l) => ({
      ligneId: l.id,
      date: l.ecriture.date,
      journal: l.ecriture.journal.code,
      numeroPiece: l.ecriture.numeroPiece,
      reference: l.ecriture.reference ?? '',
      // Le libellé de la ligne prime · c'est lui qui nomme l'opération. À
      // défaut, celui de l'écriture, jamais rien.
      libelle: l.libelle ?? l.ecriture.libelle,
      debit: Number(l.debit),
      credit: Number(l.credit),
      deviseTransaction: l.devise?.code ?? '',
      montantDevise: l.montantDevise === null ? null : Number(l.montantDevise),
      lettre: l.lettre ?? '',
      estANouveau: l.ecriture.estGenereeParCloture && !l.ecriture.estSoldeDesComptesDeGestion,
    }));

    const totalDebit = arrondir(detail.reduce((t, l) => t + l.debit, 0));
    const totalCredit = arrondir(detail.reduce((t, l) => t + l.credit, 0));
    const solde = arrondir(totalDebit - totalCredit);

    // --- Recoupement, par l'autre chemin ---------------------------------
    const agregat = await this.prisma.ligneEcriture.aggregate({
      where: { compteId: compte.id, ecriture: { tenantId, exerciceId: params.exerciceId } },
      _sum: { debit: true, credit: true },
    });
    const soldeBalance = arrondir(Number(agregat._sum.debit ?? 0) - Number(agregat._sum.credit ?? 0));
    const ecart = arrondir(solde - soldeBalance);
    // Le recoupement n'a de sens qu'à la clôture · à une date intermédiaire,
    // la balance de l'exercice porte des mouvements postérieurs à l'arrêté, et
    // annoncer un écart serait une fausse alerte.
    const arreteALaCloture = arret.getTime() === exercice.dateFin.getTime();

    return {
      compte,
      dateArret: arret.toISOString().slice(0, 10),
      masquerLettrees: params.masquerLettrees ?? false,
      lignes: detail,
      totaux: { debit: totalDebit, credit: totalCredit, solde },
      recoupement: {
        applicable: arreteALaCloture && !params.masquerLettrees,
        soldeBalance,
        ecart,
        concordant: Math.abs(ecart) < 0.005,
      },
    };
  }

  /**
   * ÉVOLUTION PLURIANNUELLE DES SOLDES · le même compte sur plusieurs
   * exercices, côte à côte.
   *
   * Le logiciel ne comparait jamais que N et N-1, parce que c'est ce que les
   * états financiers publient. Un réviseur, lui, regarde plus loin : le
   * fichier de préparation de liasse ouvert sur le Drive porte une feuille
   * « Evolution balances » qui aligne HUIT exercices. C'est ce qui fait voir
   * une provision qui ne bouge plus depuis quatre ans, une créance douteuse
   * jamais apurée, un compte d'attente qui gonfle d'année en année · aucune de
   * ces trois anomalies n'est visible sur deux colonnes.
   *
   * LE SOLDE RETENU EST CELUI DE CLÔTURE DE CHAQUE EXERCICE, à-nouveaux
   * compris · c'est la définition de la balance (report + mouvements), et
   * c'est ce qui rend la colonne comparable à la balance de l'année. Ne
   * prendre que les mouvements donnerait, sur un compte de bilan, une colonne
   * qui ne veut rien dire.
   *
   * MAIS AVANT LE SOLDE DES COMPTES DE GESTION (régression de l'audit final
   * F4) · l'écriture qui solde les classes 6 à 8 sur le 13 est de l'exercice,
   * si bien qu'une charge ou un produit d'un exercice clos valait zéro, et
   * que la colonne d'un exercice clos ne se comparait plus à celle d'un
   * exercice ouvert. Elle est écartée, comme `avantSoldeDesComptesDeGestion`
   * l'écarte de la balance des états · le 13 garde ce que les autres
   * écritures y ont passé.
   *
   * Un exercice où le compte n'a jamais été mouvementé rend `null`, pas zéro.
   * La nuance compte : zéro dit « soldé », null dit « n'existait pas encore »,
   * et les confondre fait lire une extinction là où il n'y a qu'une création.
   */
  async evolutionSoldes(tenantId: string, params: { nbExercices?: number } = {}) {
    const nb = Math.min(Math.max(params.nbExercices ?? 8, 2), 20);
    const exercices = await this.prisma.exercice.findMany({
      where: { tenantId },
      orderBy: { dateDebut: 'desc' },
      take: nb,
      select: { id: true, dateDebut: true, dateFin: true, statut: true },
    });

    // Une agrégation par exercice · `exerciceId` vit sur l'écriture, pas sur
    // la ligne, donc un `groupBy` unique sur les deux dimensions n'est pas
    // possible. Vingt requêtes au maximum, lancées ensemble.
    const [comptes, ...agregats] = await Promise.all([
      this.prisma.compte.findMany({
        where: { tenantId, typeCompte: { not: TypeCompteDetailTotal.TOTAL } },
        orderBy: { numero: 'asc' },
        select: { id: true, numero: true, intitule: true, classe: true },
      }),
      ...exercices.map((e) =>
        this.prisma.ligneEcriture.groupBy({
          by: ['compteId'],
          where: { ecriture: { tenantId, exerciceId: e.id, estSoldeDesComptesDeGestion: false } },
          _sum: { debit: true, credit: true },
        }),
      ),
    ]);

    const arrondir = (x: number) => Math.round(x * 100) / 100;
    const parExercice = agregats.map(
      (groupes) =>
        new Map(
          groupes.map((g) => [g.compteId, arrondir(Number(g._sum.debit ?? 0) - Number(g._sum.credit ?? 0))]),
        ),
    );

    const annee = (d: Date) => d.toISOString().slice(0, 4);
    const colonnes = exercices.map((e) => ({
      id: e.id,
      libelle: annee(e.dateFin),
      dateFin: e.dateFin.toISOString().slice(0, 10),
      statut: e.statut,
    }));

    const lignes = comptes
      .map((c) => ({
        compteId: c.id,
        numero: c.numero,
        intitule: c.intitule,
        classe: c.classe,
        soldes: parExercice.map((m) => (m.has(c.id) ? (m.get(c.id) as number) : null)),
      }))
      // Un compte que rien n'a jamais touché sur la fenêtre n'apporte rien ·
      // le plan entier noierait les comptes réellement mouvementés.
      .filter((l) => l.soldes.some((s) => s !== null));

    return { exercices: colonnes, lignes };
  }

  /** Grand livre d'un compte : ses lignes avec solde progressif. */
  async grandLivre(tenantId: string, compteId: string, exerciceId?: string) {
    const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
    if (!compte) {
      throw new BadRequestException('Compte introuvable pour ce tenant');
    }

    const perimetreEcriture = { tenantId, ...(exerciceId ? { exerciceId } : {}) };

    const [lignes, contreparties] = await Promise.all([
      this.prisma.ligneEcriture.findMany({
        where: { compteId, ecriture: perimetreEcriture },
        include: { ecriture: { include: { journal: true } } },
        orderBy: EcritureService.TRI_GRAND_LIVRE,
      }),
      // Restreint aux seules écritures qui touchent ce compte.
      this.chargerContreparties({
        ecriture: { ...perimetreEcriture, lignes: { some: { compteId } } },
      }),
    ]);

    let solde = 0;
    const lignesAvecSolde = lignes.map((l) => {
      solde += Number(l.debit) - Number(l.credit);
      return EcritureService.versLigneGrandLivre(l, solde, contreparties);
    });

    return { compte, lignes: lignesAvecSolde, soldeFinal: solde };
  }

  /**
   * Grand livre COMPLET : tous les comptes mouvementés de l'exercice, chacun
   * avec ses lignes et son solde progressif propre. C'est la forme
   * réellement exploitable pour un audit · un auditeur veut le grand livre
   * entier d'un coup, pas compte par compte.
   *
   * Deux requêtes plates (les lignes, puis les contreparties agrégées par
   * écriture) puis regroupement en mémoire : ni N+1, ni duplication
   * quadratique de l'écriture · voir `chargerContreparties`.
   *
   * Les comptes Total (§3.1) n'apparaissent jamais : ils ne portent aucun
   * mouvement propre par construction (imposé par `creer()`), donc aucune
   * ligne ne les référence.
   */
  async grandLivreComplet(tenantId: string, exerciceId?: string) {
    const perimetreEcriture = { tenantId, ...(exerciceId ? { exerciceId } : {}) };

    // UN GRAND LIVRE NE SE TRONQUE PAS · c'est un livre obligatoire, et un
    // livre amputé en silence est un document faux. Au-delà du plafond on
    // refuse, en disant par où passer · le grand livre d'un compte, lui,
    // reste ouvert quel que soit le volume du dossier (mesuré à 0,6 s sur un
    // million de lignes).
    const nombreLignes = await this.prisma.ligneEcriture.count({ where: { ecriture: perimetreEcriture } });
    if (nombreLignes > PLAFOND_LIGNES_GRAND_LIVRE) {
      throw new BadRequestException(
        `Ce grand livre porte ${nombreLignes.toLocaleString('fr-FR')} lignes, au-delà de ce qu'une fenêtre peut ` +
          `afficher (${PLAFOND_LIGNES_GRAND_LIVRE.toLocaleString('fr-FR')}). Ouvrez le grand livre compte par ` +
          `compte, ou restreignez l'exercice.`,
      );
    }

    const [lignes, contreparties] = await Promise.all([
      this.prisma.ligneEcriture.findMany({
        where: { ecriture: perimetreEcriture },
        include: { compte: true, ecriture: { include: { journal: true } } },
        orderBy: [{ compte: { numero: 'asc' } }, ...EcritureService.TRI_GRAND_LIVRE],
      }),
      this.chargerContreparties({ ecriture: perimetreEcriture }),
    ]);

    const parCompte = new Map<
      string,
      {
        compte: { id: string; numero: string; intitule: string };
        lignes: ReturnType<typeof EcritureService.versLigneGrandLivre>[];
        solde: number;
      }
    >();

    for (const l of lignes) {
      let entree = parCompte.get(l.compteId);
      if (!entree) {
        entree = {
          compte: { id: l.compte.id, numero: l.compte.numero, intitule: l.compte.intitule },
          lignes: [],
          solde: 0,
        };
        parCompte.set(l.compteId, entree);
      }
      entree.solde += Number(l.debit) - Number(l.credit);
      entree.lignes.push(EcritureService.versLigneGrandLivre(l, entree.solde, contreparties));
    }

    return (
      [...parCompte.values()]
        .map((e) => ({
          compte: e.compte,
          lignes: e.lignes,
          soldeFinal: e.solde,
          totalDebit: e.lignes.reduce((s, l) => s + l.debit, 0),
          totalCredit: e.lignes.reduce((s, l) => s + l.credit, 0),
        }))
        // Même filtre que `balance()` : un compte dont tous les mouvements
        // sont à 0/0 n'y figure pas non plus. Sans cet alignement, deux états
        // exportés le même jour ne listent pas les mêmes comptes · écart que
        // relèverait immédiatement un auditeur.
        .filter((c) => c.totalDebit !== 0 || c.totalCredit !== 0)
    );
  }

  /**
   * Balance : solde débit/crédit cumulé par compte sur l'exercice.
   *
   * Chaque ligne porte AUSSI la même somme scindée en deux :
   *
   * - `reportDebit` / `reportCredit` · les lignes issues d'écritures générées
   *   par la clôture (`estGenereeParCloture`). Pour un compte de bilan c'est le
   *   report à-nouveau, donc la SITUATION À L'OUVERTURE de l'exercice.
   * - `mouvementDebit` / `mouvementCredit` · tout le reste, c'est-à-dire les
   *   MOUVEMENTS PROPRES de l'exercice.
   *
   * Cette scission n'est pas un raffinement : sans elle, `totalDebit` d'un
   * compte d'immobilisation englobe le report à-nouveau, et un bâtiment détenu
   * depuis 2020 serait présenté comme une acquisition de l'exercice dans les
   * notes 5A à 5F (« AUGMENTATIONS B »). Les tableaux de situations et
   * mouvements du texte officiel (Partie 4, ch. 2, notes 5A-5F et 30) exigent
   * précisément cette distinction.
   *
   * - `clotureDebit` / `clotureCredit` · l'écriture qui, sur un exercice
   *   CLÔTURÉ, solde les classes 6 à 8 sur le 13
   *   (`estSoldeDesComptesDeGestion`). Elle n'est ni une ouverture ni une
   *   activité de l'exercice ; elle rangeait jusqu'au 2026-09-27 en `report*`,
   *   si bien qu'une classe 6 ou 7 affichait en ouverture l'inverse de son
   *   total de l'année (audit final F5).
   */
  /**
   * Balance générale.
   *
   * `inclureBrouillard` vaut vrai pour les états de TRAVAIL : le comptable
   * doit voir où il en est, brouillard compris. Les états LÉGAUX (bilan,
   * compte de résultat, tableau de flux, livre d'inventaire, notes annexes)
   * passent faux et ne lisent que le livre-journal · un état financier bâti
   * sur des écritures non validées n'engagerait personne.
   */
  /**
   * BALANCE GÉNÉRALE · la fonction la plus sollicitée du logiciel. Les états
   * financiers, les exports, l'analytique et le plan comptable en dépendent
   * tous, et sa lenteur se voit donc partout.
   *
   * Deux choses la rendaient lente, l'une et l'autre corrigées ici.
   *
   * 1. ELLE RAPATRIAIT TOUTES LES LIGNES. Un `include: { lignesEcriture }`
   *    transférait chaque ligne d'écriture de l'exercice, plus son écriture
   *    parente, pour n'en faire que six sommes. Un dossier de dix mille
   *    lignes transportait dix mille objets sur le réseau pour produire une
   *    page. Des `groupBy` font désormais la somme DANS Postgres et ne
   *    ramènent qu'une ligne par compte, un par colonne (report, mouvements,
   *    clôture, `filtresDesTroisColonnes`), parce que la colonne tient aux
   *    drapeaux de l'écriture (`estGenereeParCloture`,
   *    `estSoldeDesComptesDeGestion`) et non à la ligne.
   *
   * 2. ELLE AGRÉGEAIT LES COMPTES TOTAL, ET PLUS PERSONNE N'EN VOULAIT.
   *    Chaque compte Total balayait la liste entière des comptes pour trouver
   *    ses enfants par `startsWith` · un travail en N² qui a d'abord été rendu
   *    linéaire, puis retiré. Les comptes Total sont écartés d'emblée par
   *    `lignesDeBalance` (balance-trois-colonnes.ts, audit final F253).
   *
   * UNE BALANCE GÉNÉRALE LISTE LES COMPTES MOUVEMENTÉS, PAS UNE HIÉRARCHIE.
   *
   * Les lignes de sous-totalisation par compte principal (10, 40, 60…) ont
   * été retirées à la demande du cabinet : une balance se lit compte par
   * compte, dans l'ordre croissant des numéros, et les sous-totaux d'une
   * arborescence y ajoutent des lignes que personne ne pointe. Ils n'étaient
   * d'ailleurs consommés NULLE PART · les six appelants internes (états
   * financiers, fiscalité, groupe, exports) les écartaient tous par le même
   * `filter(l => l.typeCompte !== TOTAL)`, chacun pour la même raison :
   * additionner un agrégat déjà compté dans ses enfants double les montants.
   *
   * CE QUI RESTE DANS LA LISTE, et pourquoi : tout compte de détail qui a un
   * mouvement, y compris ceux dont le solde retombe à zéro (un débit de 100
   * et un crédit de 100). Les exclure casserait l'égalité de la balance
   * elle-même, dont les colonnes de totaux additionnent des MOUVEMENTS et non
   * des soldes · un compte soldé a bougé, et sa ligne le prouve.
   */
  /**
   * LA BALANCE, ÉVENTUELLEMENT ARRÊTÉE À UNE DATE.
   *
   * `arreteAu` borne la lecture aux écritures dont la DATE COMPTABLE est
   * antérieure ou égale · c'est la matière première d'une situation
   * intermédiaire (AUDCIF, Titre VIII ch. 39), qui n'existait sous aucune
   * forme : ni les états, ni la balance elle-même ne prenaient de date, et un
   * cabinet à qui une banque demandait une situation au 30 juin devait la
   * monter hors du logiciel.
   *
   * LE REPORT À-NOUVEAU RESTE PRIS, et c'est mécanique plutôt que voulu :
   * l'écriture de report est datée de l'OUVERTURE de l'exercice, donc
   * toujours antérieure à une date d'arrêté située dans l'exercice. C'est
   * aussi pourquoi une date hors de l'exercice est refusée par les appelants ·
   * en deçà de l'ouverture, la balance perdrait le report et présenterait des
   * soldes amputés du bilan d'ouverture sans que rien ne le dise.
   */
  async balance(tenantId: string, exerciceId: string, inclureBrouillard = true, arreteAu?: Date) {
    const filtreEcriture = {
      tenantId,
      exerciceId,
      ...(inclureBrouillard ? {} : { statut: StatutEcriture.VALIDEE }),
      ...(arreteAu ? { date: { lte: arreteAu } } : {}),
    };
    // TROIS COLONNES ET NON DEUX (audit final F4, F5) · le report à-nouveau,
    // les mouvements, et l'écriture qui solde les comptes de gestion. Le calcul
    // vit dans `balance-trois-colonnes.ts`, que la lecture du groupe appelle
    // aussi (audit final F190) · une cellule vue du siège a la même balance
    // que chez elle.
    const filtres = filtresDesTroisColonnes(filtreEcriture);
    const [comptes, reports, mouvements, clotures] = await Promise.all([
      this.prisma.compte.findMany({ where: { tenantId }, orderBy: { numero: 'asc' } }),
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        where: { ecriture: filtres.reports },
        _sum: { debit: true, credit: true },
      }),
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        where: { ecriture: filtres.mouvements },
        _sum: { debit: true, credit: true },
      }),
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        where: { ecriture: filtres.clotures },
        _sum: { debit: true, credit: true },
      }),
    ]);

    const lignesBalance = lignesDeBalance(comptes, agregatsParCompte(reports, mouvements, clotures));
    return { lignes: lignesBalance, totaux: totauxDeBalance(lignesBalance) };
  }

  /**
   * LES VIREMENTS DE MISE EN SERVICE D'UN EXERCICE, par compte
   * (`immobilisations/virements-mise-en-service.ts`, décision D6 de Manasse
   * du 2026-10-01).
   *
   * Les écritures retenues sont celles qu'une fiche d'immobilisation désigne
   * par `ecritureMiseEnServiceId` · la LIAISON, jamais le compte ni le
   * libellé, un crédit du 2x9 pouvant aussi être un rebut. Le filtre est celui
   * de la colonne « mouvements » de `balance(…, false)`, que lisent les notes
   * annexes et le tableau des flux · LIVRE-JOURNAL SEUL, report à-nouveau
   * exclu. Une mise en service restée au brouillard n'est pas encore dans les
   * mouvements de ces états ; la retrancher les ferait passer sous zéro.
   *
   * Une somme demandée à la base (`groupBy`), une ligne par compte touché ·
   * jamais les lignes rapatriées (CLAUDE.md § 8 bis).
   */
  async virementsDeMiseEnService(tenantId: string, exerciceId: string | null): Promise<VirementsParCompte> {
    return this.mouvementsLiesParCompte(tenantId, exerciceId, { immobilisationMiseEnService: { isNot: null } });
  }

  /**
   * LES MOUVEMENTS DE L'ÉCRITURE DE RÉÉVALUATION D'UN EXERCICE, par compte
   * (lot 14, `immobilisations/reevaluation-bilan.ts`). Reconnue par la
   * LIAISON (`ReevaluationBilan.ecritureId`), jamais par le compte ni le
   * libellé, comme la mise en service · un crédit du 106 peut aussi être une
   * réévaluation passée à la main, que ni le texte ni la balance ne
   * décomposent. Même filtre que la colonne « mouvements » des états
   * (livre-journal seul), borné à la date d'arrêté d'une situation
   * intermédiaire quand il y en a une, comme la balance qu'il corrige.
   *
   * Lue par les tableaux des flux (AUDCIF Titre IX ch. 5 § 1.3, « – Écart et
   * provision spéciale de réévaluation de l'exercice de réévaluation
   * uniquement » ; SYCEBNL, poste FI et FJ) et par les tableaux des valeurs
   * brutes des Notes annexes (colonne « Suite à une réévaluation pratiquée au
   * cours de l'exercice »).
   */
  async mouvementsDeReevaluation(tenantId: string, exerciceId: string | null, arreteAu?: Date): Promise<VirementsParCompte> {
    return this.mouvementsLiesParCompte(tenantId, exerciceId, { reevaluationBilan: { isNot: null } }, arreteAu);
  }

  /** Une seule lecture des écritures LIÉES à un module, par compte · une somme demandée à la base. */
  private async mouvementsLiesParCompte(
    tenantId: string,
    exerciceId: string | null,
    liaison: Prisma.EcritureWhereInput,
    arreteAu?: Date,
  ): Promise<VirementsParCompte> {
    if (!exerciceId) return AUCUN_VIREMENT;
    const { mouvements } = filtresDesTroisColonnes({
      tenantId,
      exerciceId,
      statut: StatutEcriture.VALIDEE,
      ...(arreteAu ? { date: { lte: arreteAu } } : {}),
    });
    const groupes = await this.prisma.ligneEcriture.groupBy({
      by: ['compteId'],
      where: { ecriture: { ...mouvements, ...liaison } },
      _sum: { debit: true, credit: true },
    });
    return new Map(
      groupes.map((g) => [g.compteId, { debit: Number(g._sum.debit ?? 0), credit: Number(g._sum.credit ?? 0) }]),
    );
  }

  /**
   * BALANCE GÉNÉRALE REGROUPÉE PAR COLLECTIF · chaque compte individuel de
   * tiers (Compte.collectifId) est fondu sur son collectif, comme la balance
   * générale de Sage ; le détail tiers par tiers reste à la balance
   * auxiliaire. Les totaux sont ceux de la balance compte par compte.
   */
  async balanceRegroupeeParCollectif(tenantId: string, exerciceId: string) {
    const [balance, individuels] = await Promise.all([
      this.balance(tenantId, exerciceId),
      this.prisma.compte.findMany({
        where: { tenantId, collectifId: { not: null } },
        select: { id: true, collectif: { select: { id: true, numero: true, intitule: true } } },
      }),
    ]);
    const collectifDe = new Map(individuels.filter((c) => c.collectif).map((c) => [c.id, c.collectif!]));
    return { lignes: regrouperSurCollectifs(balance.lignes, collectifDe), totaux: balance.totaux };
  }

  /**
   * BALANCE CUMULÉE DEPUIS L'ORIGINE DU DOSSIER, arrêtée à la fin d'un
   * exercice. C'est la matière première des colonnes « SOLDE CUMULE DEBUT
   * EXERCICE N » et « SOLDE CUMULE FIN EXERCICE N » du Tableau emplois
   * ressources (SYCEBNL, Partie 4 ch. 3, Section 1), qui suit le cycle de vie
   * d'un PROJET et non celui d'un exercice · un bailleur finance sur trois
   * ans, et la colonne de l'exercice ne dit rien de ce qu'il a déjà versé.
   *
   * DEUX RÈGLES DE LECTURE, ET CHACUNE A DÉJÀ COÛTÉ UN DÉFAUT AILLEURS.
   *
   * 1. LES ÉCRITURES DE CLÔTURE SONT EXCLUES. Le report à-nouveau rejoue à
   *    l'ouverture le solde de clôture de l'exercice précédent : additionné
   *    aux mouvements qui l'ont produit, il compte une deuxième fois le même
   *    décaissement, puis une troisième l'année suivante. Un cumul sur trois
   *    exercices rendrait le triple des fonds reçus, sans qu'aucun état ne se
   *    déséquilibre · la Note 9 porte la même règle, pour la même raison.
   * 2. SAUF CELLES DU PREMIER EXERCICE, qui portent le BILAN D'OUVERTURE du
   *    dossier. Un cabinet qui reprend un projet en cours saisit son solde de
   *    départ par cette écriture-là : l'exclure amputerait le cumul de tout ce
   *    qui précède l'entrée dans OmegaX, et le montant manquant serait
   *    exactement celui que le bailleur a déjà versé. Même règle, même
   *    justification que `justificatifSolde`.
   *
   * D'où la scission rendue : `report*` porte ce bilan d'ouverture, `mouvement*`
   * l'ensemble des opérations réelles de la fenêtre, et `solde` leur somme ·
   * c'est-à-dire la situation cumulée à la fin de l'exercice demandé.
   *
   * `inclureBrouillard` vaut FAUX par défaut, à l'inverse de `balance()` : le
   * seul appelant est un état financier.
   */
  async balanceCumulee(tenantId: string, exerciceId: string, inclureBrouillard = false) {
    // 404 nommé, jamais l'erreur brute de Prisma servie en 500 (jumeau de
    // l'audit final F222) · la Note 9 et les colonnes cumulées du tableau
    // emplois ressources passent par ici.
    const exercice = exerciceDuDossierOuRefus(
      await this.prisma.exercice.findFirst({
        where: { id: exerciceId, tenantId },
        select: { id: true, dateDebut: true },
      }),
    );
    const exercices = await this.prisma.exercice.findMany({
      where: { tenantId, dateDebut: { lte: exercice.dateDebut } },
      orderBy: { dateDebut: 'asc' },
      select: { id: true },
    });
    const idsFenetre = exercices.map((e) => e.id);
    const premierExerciceId = idsFenetre[0];

    const filtreEcriture = {
      tenantId,
      exerciceId: { in: idsFenetre },
      ...(inclureBrouillard ? {} : { statut: StatutEcriture.VALIDEE }),
    };

    const [comptes, ouverture, mouvements] = await Promise.all([
      this.prisma.compte.findMany({ where: { tenantId }, orderBy: { numero: 'asc' } }),
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        // Le bilan d'ouverture du dossier, et lui seul (règle 2 ci-dessus) ·
        // jamais l'écriture qui solde les classes 6 à 8 du premier exercice
        // quand il est clos, qui n'ouvre rien (audit final F206).
        where: {
          ecriture: { ...filtreEcriture, exerciceId: premierExerciceId, estGenereeParCloture: true, estSoldeDesComptesDeGestion: false },
        },
        _sum: { debit: true, credit: true },
      }),
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        where: { ecriture: { ...filtreEcriture, estGenereeParCloture: false } },
        _sum: { debit: true, credit: true },
      }),
    ]);

    const parCompte = new Map<string, { debit: number; credit: number; reportDebit: number; reportCredit: number }>();
    const cumuler = (
      groupes: Array<{ compteId: string; _sum: { debit: unknown; credit: unknown } }>,
      estOuverture: boolean,
    ) => {
      for (const g of groupes) {
        const a = parCompte.get(g.compteId) ?? { debit: 0, credit: 0, reportDebit: 0, reportCredit: 0 };
        const d = Number(g._sum.debit ?? 0);
        const c = Number(g._sum.credit ?? 0);
        a.debit += d;
        a.credit += c;
        if (estOuverture) {
          a.reportDebit += d;
          a.reportCredit += c;
        }
        parCompte.set(g.compteId, a);
      }
    };
    cumuler(ouverture, true);
    cumuler(mouvements, false);

    const lignes = comptes
      .filter((c) => c.typeCompte !== TypeCompteDetailTotal.TOTAL)
      .map((c) => {
        const a = parCompte.get(c.id) ?? { debit: 0, credit: 0, reportDebit: 0, reportCredit: 0 };
        return {
          compteId: c.id,
          numero: c.numero,
          intitule: c.intitule,
          classe: c.classe,
          typeCompte: c.typeCompte,
          totalDebit: a.debit,
          totalCredit: a.credit,
          reportDebit: a.reportDebit,
          reportCredit: a.reportCredit,
          // Le bilan d'ouverture fait partie du cumul du projet · il compte
          // donc dans les mouvements de la fenêtre, en plus d'être exposé à
          // part pour qui a besoin de le distinguer.
          mouvementDebit: a.debit,
          mouvementCredit: a.credit,
          solde: a.debit - a.credit,
        };
      })
      .filter((l) => l.totalDebit !== 0 || l.totalCredit !== 0);

    return { lignes, totaux: { debit: lignes.reduce((s, l) => s + l.totalDebit, 0), credit: lignes.reduce((s, l) => s + l.totalCredit, 0) } };
  }

  /**
   * BALANCE AUXILIAIRE · la balance des comptes de tiers, tiers par tiers.
   *
   * Ce n'est pas la balance âgée, et la confusion coûte cher : la balance
   * âgée ventile un solde par tranche de retard, la balance auxiliaire porte
   * les MOUVEMENTS de la période et le solde qui en résulte, tiers par tiers.
   * Un réviseur lit la seconde pour circulariser et rapprocher, la première
   * pour apprécier le risque de non-recouvrement. Le logiciel savait produire
   * la balance âgée et pas la balance auxiliaire.
   *
   * Ce que le SYSCOHADA appelle « comptes rattachés » (AUDCIF, comptes 40 et
   * 41) est ici la table TiersCompte : un compte de détail par tiers, rattaché
   * à un compte collectif par sa racine. La balance auxiliaire est donc la
   * balance générale restreinte à ces racines, augmentée du code et du nom du
   * tiers.
   *
   * UN COMPTE DE TIERS SANS TIERS RATTACHÉ N'EST PAS ÉCARTÉ. C'est même la
   * ligne la plus utile de l'état : un 411 mouvementé que personne ne
   * réclame est soit un tiers non créé, soit une imputation directe sur le
   * compte collectif · dans les deux cas la circularisation passera à côté.
   * Il ressort avec un code et un nom vides, et le drapeau `sansTiers`.
   */
  async balanceAuxiliaire(
    tenantId: string,
    params: { exerciceId: string; type?: 'CLIENTS' | 'FOURNISSEURS' | 'TOUS'; inclureBrouillard?: boolean },
  ) {
    const type = params.type ?? 'TOUS';
    const racines = type === 'CLIENTS' ? ['41'] : type === 'FOURNISSEURS' ? ['40'] : ['40', '41'];

    const [{ lignes }, rattachements] = await Promise.all([
      this.balance(tenantId, params.exerciceId, params.inclureBrouillard ?? true),
      this.prisma.tiersCompte.findMany({
        where: { tiers: { tenantId } },
        select: { compteId: true, tiers: { select: { code: true, nom: true, type: true } } },
      }),
    ]);
    const parCompte = new Map(rattachements.map((r) => [r.compteId, r.tiers]));

    const arrondi = (x: number) => Math.round(x * 100) / 100;
    const comptes = lignes
      .filter((l) => racines.some((r) => l.numero.startsWith(r)))
      .map((l) => {
        const tiers = parCompte.get(l.compteId);
        const solde = arrondi(l.totalDebit - l.totalCredit);
        return {
          compteId: l.compteId,
          numero: l.numero,
          intitule: l.intitule,
          codeTiers: tiers?.code ?? '',
          nomTiers: tiers?.nom ?? '',
          sansTiers: !tiers,
          reportDebit: arrondi(l.reportDebit),
          reportCredit: arrondi(l.reportCredit),
          mouvementDebit: arrondi(l.mouvementDebit),
          mouvementCredit: arrondi(l.mouvementCredit),
          // Les deux colonnes de solde s'excluent · un compte est débiteur OU
          // créditeur, jamais les deux. C'est la présentation des dossiers de
          // révision : « Solde Debit » et « Solde Credit » en regard.
          soldeDebit: solde > 0 ? solde : 0,
          soldeCredit: solde < 0 ? -solde : 0,
          solde,
        };
      })
      .sort((a, b) => a.numero.localeCompare(b.numero) || a.codeTiers.localeCompare(b.codeTiers));

    const somme = (cle: 'reportDebit' | 'reportCredit' | 'mouvementDebit' | 'mouvementCredit' | 'soldeDebit' | 'soldeCredit' | 'solde') =>
      arrondi(comptes.reduce((t, c) => t + c[cle], 0));

    return {
      type,
      comptes,
      totaux: {
        reportDebit: somme('reportDebit'),
        reportCredit: somme('reportCredit'),
        mouvementDebit: somme('mouvementDebit'),
        mouvementCredit: somme('mouvementCredit'),
        soldeDebit: somme('soldeDebit'),
        soldeCredit: somme('soldeCredit'),
        solde: somme('solde'),
      },
    };
  }
}

/**
 * LES LIGNES D'UNE INSCRIPTION EN NÉGATIF · AUDCIF art. 20, al. 2. Les MÊMES
 * comptes, dans les MÊMES sens, au signe près ; ni lettre ni pointage, qui
 * appartiennent à la ligne d'origine. Une seule écriture de la règle, servie
 * à la correction d'une écriture et à l'annulation d'une réévaluation des
 * devises (ligne A6, D6).
 */
export function lignesEnNegatif(lignes: Array<Prisma.LigneEcritureGetPayload<{ include: { ventilations: true } }>>) {
  return lignes.map((l) => ({
    compteId: l.compteId,
    libelle: l.libelle,
    debit: l.debit.negated(),
    credit: l.credit.negated(),
    tauxTvaId: l.tauxTvaId,
    dateEcheance: l.dateEcheance,
    // La contre-passation reprend les deux dates de l'origine · une
    // inscription en négatif annule une opération, elle ne la
    // redate pas. La retenue contre-passée doit sortir du registre
    // par le MÊME mois qu'elle y est entrée, sans quoi elle
    // creuserait un mois et en gonflerait un autre.
    dateVersement: l.dateVersement,
    // LA DEVISE ET L'ANALYTIQUE SUIVENT (audit final F1). Sans
    // elles, le grand livre revenait à zéro pendant que le réalisé
    // par section et la position en devise gardaient l'opération
    // annulée. Le montant en devise se recopie SANS SIGNE, comme
    // il est stocké : c'est le sens de la ligne qui le donne
    // (lettrage, réévaluation). Les ventilations, elles, portent
    // leur propre débit et crédit, et passent en négatif.
    deviseId: l.deviseId,
    montantDevise: l.montantDevise,
    coursApplique: l.coursApplique,
    ventilations: {
      create: l.ventilations.map((v) => ({
        sectionId: v.sectionId,
        planId: v.planId,
        debit: v.debit.negated(),
        credit: v.credit.negated(),
      })),
    },
  }));
}

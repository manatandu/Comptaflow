import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Prisma, StatutExercice, TypeCompteDetailTotal } from '@prisma/client';
import { CreerEcritureDto } from './dto/creer-ecriture.dto';
import { CorrigerEcritureDto } from './dto/corriger-ecriture.dto';
import { JournalService } from '../journaux/journal.service';
import { ExerciceService } from '../exercice/exercice.service';
import { avecRetrySerialisable } from '../../common/prisma-retry.util';

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
export interface LigneAgee {
  compteId: string;
  numero: string;
  intitule: string;
  nonEchu: number;
  j1a30: number;
  j31a60: number;
  j61a90: number;
  plus90: number;
  total: number;
}

/**
 * Règle non négociable du moteur comptable : une écriture n'existe que si
 * total(débit) === total(crédit), et un exercice clôturé n'accepte plus
 * aucune écriture (piste d'audit + intégrité légale). Ces deux contrôles
 * vivent ici, pas côté client, pour rester valables quel que soit le canal
 * d'entrée (UI web, import CSV, API partenaire...).
 */
@Injectable()
export class EcritureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journalService: JournalService,
    private readonly exerciceService: ExerciceService,
  ) {}

  async creer(tenantId: string, createdBy: string, dto: CreerEcritureDto) {
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: dto.exerciceId, tenantId },
    });
    if (!exercice) {
      throw new BadRequestException('Exercice introuvable pour ce tenant');
    }
    if (exercice.statut === StatutExercice.CLOTURE) {
      throw new ForbiddenException("Impossible d'enregistrer une écriture sur un exercice clôturé");
    }

    const journal = await this.journalService.trouver(tenantId, dto.journalId);
    if (!journal.estActif) {
      throw new BadRequestException(`Le journal ${journal.code} est en sommeil`);
    }

    const totalDebit = dto.lignes.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = dto.lignes.reduce((s, l) => s + (l.credit ?? 0), 0);
    if (dto.lignes.length < 2 || Math.abs(totalDebit - totalCredit) > 0.005) {
      throw new BadRequestException(
        `Écriture déséquilibrée : débit=${totalDebit} crédit=${totalCredit}`,
      );
    }

    // Les tauxTvaId ne participent pas à l'équilibre (informatifs, posés sur
    // la ligne de TVA par la saisie guidée "Achat/Vente avec TVA") mais
    // doivent rester scopés au tenant · sans ce contrôle, un appel API direct
    // pourrait rattacher une ligne au taux d'un autre tenant (la FK Prisma ne
    // vérifie que l'existence de l'id, pas son tenant).
    const tauxTvaIds = [...new Set(dto.lignes.map((l) => l.tauxTvaId).filter((id): id is string => !!id))];
    if (tauxTvaIds.length > 0) {
      const tauxTrouves = await this.prisma.tauxTva.findMany({ where: { id: { in: tauxTvaIds }, tenantId } });
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
    const compteIds = [...new Set(dto.lignes.map((l) => l.compteId))];
    const comptes = await this.prisma.compte.findMany({ where: { id: { in: compteIds }, tenantId } });
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

    const date = new Date(dto.date);

    // Clôtures Partielle/Totale (par journal) et Période (tous journaux) :
    // verrouillage de saisie indépendant du statut CLOTURE de l'exercice ·
    // voir ExerciceService.verifierEcritureAutorisee.
    await this.exerciceService.verifierEcritureAutorisee(tenantId, dto.journalId, date);

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
            libelle: dto.libelle,
            reference: dto.reference,
            createdBy,
            lignes: {
              create: dto.lignes.map((l) => ({
                compteId: l.compteId,
                libelle: l.libelle,
                debit: l.debit ?? 0,
                credit: l.credit ?? 0,
                tauxTvaId: l.tauxTvaId,
                dateEcheance: l.dateEcheance ? new Date(l.dateEcheance) : undefined,
              })),
            },
          },
          include: { lignes: true, journal: true },
        });
      },
      `Trop d'écritures enregistrées au même instant sur le journal ${journal.code} · veuillez réessayer.`,
    );
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
        lignes: true,
        journal: true,
        exercice: true,
        correction: { select: { id: true, numeroPiece: true } },
        immobilisationAcquisition: { select: { id: true, designation: true } },
        immobilisationSortie: { select: { id: true, designation: true } },
        dotationAmortissement: { select: { id: true } },
      },
    });
    if (!origine) throw new NotFoundException('Écriture introuvable pour ce dossier.');

    this.verifierCorrigeable(origine);

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
              // Les MÊMES comptes, dans les MÊMES sens, au signe près : c'est
              // la définition de l'« inscription en négatif des éléments
              // erronés ». Ni lettre ni pointage ne sont repris · ils
              // appartiennent à la ligne d'origine, pas à sa correction.
              create: origine.lignes.map((l) => ({
                compteId: l.compteId,
                libelle: l.libelle,
                debit: l.debit.negated(),
                credit: l.credit.negated(),
                tauxTvaId: l.tauxTvaId,
                dateEcheance: l.dateEcheance,
              })),
            },
          },
          include: { lignes: true, journal: true },
        });
      },
      `Trop d'écritures enregistrées au même instant sur le journal ${origine.journal.code} · veuillez réessayer.`,
    );
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
    lignes: { lettre: string | null; rapprochementId: string | null }[];
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
    if (e.estGenereeParCloture) {
      throw new BadRequestException(
        "Cette écriture a été générée par la clôture (solde des classes 6/7, report à-nouveau). La corriger à la main " +
          "désaccorderait le report à-nouveau du bilan d'ouverture, alors que « le Bilan d'ouverture d'un exercice doit " +
          "correspondre au Bilan de clôture de l'exercice précédent » (art. 16-4). Annulez la clôture pour la refaire.",
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
    const lettrees = e.lignes.filter((l) => l.lettre);
    if (lettrees.length > 0) {
      throw new BadRequestException(
        `${lettrees.length} ligne(s) de cette écriture sont lettrées (${[...new Set(lettrees.map((l) => l.lettre))].join(', ')}). ` +
          'Le lettrage affirme que ces lignes sont soldées entre elles ; corriger sans délettrer laisserait cette ' +
          'affirmation en place, devenue fausse. Délettrez-les d’abord.',
      );
    }
    const pointees = e.lignes.filter((l) => l.rapprochementId);
    if (pointees.length > 0) {
      throw new BadRequestException(
        `${pointees.length} ligne(s) de cette écriture sont pointées dans un rapprochement bancaire. Le pointage ` +
          'affirme la concordance avec un relevé ; dépointez-les d’abord (possible tant que le rapprochement est en cours).',
      );
    }
  }

  /** Journal : liste chronologique des écritures, filtrable par exercice/journal/période/recherche. */
  async lister(
    tenantId: string,
    filtres: { exerciceId?: string; journalId?: string; dateDebut?: string; dateFin?: string; recherche?: string },
  ) {
    const ecritures = await this.prisma.ecriture.findMany({
      where: {
        tenantId,
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
        ...(filtres.recherche ? { libelle: { contains: filtres.recherche, mode: 'insensitive' as const } } : {}),
      },
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
      orderBy: [{ date: 'asc' }, { numeroPiece: 'asc' }, { id: 'asc' }],
    });

    const totalDebit = ecritures.reduce((s, e) => s + e.lignes.reduce((s2, l) => s2 + Number(l.debit), 0), 0);
    const totalCredit = ecritures.reduce((s, e) => s + e.lignes.reduce((s2, l) => s2 + Number(l.credit), 0), 0);
    return { ecritures, totaux: { debit: totalDebit, credit: totalCredit } };
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
   * BALANCE ÂGÉE · état prévisionnel des échéances (Sage : État → Balance
   * âgée : « état prévisionnel des échéances à venir, ventilées par tranches
   * de dates, en fonction d'une date de référence »).
   *
   * Assiette : les lignes NON LETTRÉES des comptes de tiers (racine 40
   * fournisseurs, 41 adhérents/clients-usagers · nomenclature SYCEBNL) de
   * l'exercice. Une ligne lettrée est soldée par définition : elle n'a plus
   * d'échéance à suivre. L'échéance retenue est LigneEcriture.dateEcheance ;
   * à défaut, la date de l'écriture (même règle que Sage : « le programme
   * reprend la date d'écriture comme échéance si celle-ci n'a pas été saisie »).
   *
   * Chaque ligne pèse son montant NET (débit − crédit) : une correction par
   * inscription en négatif (art. 20 AUDCIF) annule ainsi sa ligne d'origine
   * dans la même tranche au lieu de gonfler deux tranches en sens opposés.
   * Les montants restent signés · créances au débit positives (41), dettes
   * au crédit négatives (40) vues du compte : le client présente les deux
   * familles séparément.
   */
  async balanceAgee(
    tenantId: string,
    params: { exerciceId: string; dateReference?: string; type?: 'CLIENTS' | 'FOURNISSEURS' | 'TOUS' },
  ) {
    const ref = params.dateReference ? new Date(params.dateReference) : new Date();
    const type = params.type ?? 'TOUS';
    const racines = type === 'CLIENTS' ? ['41'] : type === 'FOURNISSEURS' ? ['40'] : ['40', '41'];

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        ecriture: { tenantId, exerciceId: params.exerciceId },
        lettre: null,
        OR: racines.map((r) => ({ compte: { numero: { startsWith: r } } })),
      },
      include: {
        compte: { select: { id: true, numero: true, intitule: true } },
        ecriture: { select: { date: true } },
      },
    });

    type Tranche = 'nonEchu' | 'j1a30' | 'j31a60' | 'j61a90' | 'plus90';
    const trancheDe = (echeance: Date): Tranche => {
      const retardJours = Math.floor((ref.getTime() - echeance.getTime()) / 86_400_000);
      if (retardJours <= 0) return 'nonEchu';
      if (retardJours <= 30) return 'j1a30';
      if (retardJours <= 60) return 'j31a60';
      if (retardJours <= 90) return 'j61a90';
      return 'plus90';
    };

    const parCompte = new Map<string, LigneAgee>();
    for (const l of lignes) {
      const net = Number(l.debit) - Number(l.credit);
      if (Math.abs(net) < 0.005) continue;
      const entree =
        parCompte.get(l.compte.id) ??
        ({
          compteId: l.compte.id,
          numero: l.compte.numero,
          intitule: l.compte.intitule,
          nonEchu: 0,
          j1a30: 0,
          j31a60: 0,
          j61a90: 0,
          plus90: 0,
          total: 0,
        } satisfies LigneAgee);
      const tranche = trancheDe(l.dateEcheance ?? l.ecriture.date);
      entree[tranche] += net;
      entree.total += net;
      parCompte.set(l.compte.id, entree);
    }

    const arrondir = (x: LigneAgee): LigneAgee => ({
      ...x,
      nonEchu: Math.round(x.nonEchu * 100) / 100,
      j1a30: Math.round(x.j1a30 * 100) / 100,
      j31a60: Math.round(x.j31a60 * 100) / 100,
      j61a90: Math.round(x.j61a90 * 100) / 100,
      plus90: Math.round(x.plus90 * 100) / 100,
      total: Math.round(x.total * 100) / 100,
    });
    // Un compte dont toutes les tranches se compensent à zéro (avances égales
    // aux factures, corrections) n'apporte rien à l'état : écarté.
    const comptes = [...parCompte.values()]
      .map(arrondir)
      .filter((c) => Math.abs(c.total) >= 0.005 || [c.nonEchu, c.j1a30, c.j31a60, c.j61a90, c.plus90].some((t) => Math.abs(t) >= 0.005))
      .sort((a, b) => a.numero.localeCompare(b.numero));

    const totaux = comptes.reduce(
      (acc, c) => ({
        compteId: '',
        numero: '',
        intitule: '',
        nonEchu: acc.nonEchu + c.nonEchu,
        j1a30: acc.j1a30 + c.j1a30,
        j31a60: acc.j31a60 + c.j31a60,
        j61a90: acc.j61a90 + c.j61a90,
        plus90: acc.plus90 + c.plus90,
        total: acc.total + c.total,
      }),
      { compteId: '', numero: '', intitule: '', nonEchu: 0, j1a30: 0, j31a60: 0, j61a90: 0, plus90: 0, total: 0 },
    );

    return { dateReference: ref.toISOString().slice(0, 10), type, comptes, totaux: arrondir(totaux) };
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
   * Réserve, à connaître avant de lire `report*` sur un compte de gestion :
   * pour un exercice CLÔTURÉ, l'écriture de solde des classes 6 et 7 porte le
   * même drapeau. Sur une classe 6 ou 7, `report*` est donc la contrepassation
   * de clôture, pas une ouverture · les charges et les produits ne se
   * reportent pas. `mouvement*` reste, lui, juste dans tous les cas.
   */
  async balance(tenantId: string, exerciceId: string) {
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId },
      orderBy: { numero: 'asc' },
      include: {
        lignesEcriture: {
          where: { ecriture: { tenantId, exerciceId } },
          include: { ecriture: { select: { estGenereeParCloture: true } } },
        },
      },
    });

    const somme = (lignes: typeof comptes[number]['lignesEcriture'], champ: 'debit' | 'credit') =>
      lignes.reduce((s, l) => s + Number(l[champ]), 0);

    const soldeDirectParCompte = new Map(
      comptes.map((c) => {
        const report = c.lignesEcriture.filter((l) => l.ecriture.estGenereeParCloture);
        const mouvement = c.lignesEcriture.filter((l) => !l.ecriture.estGenereeParCloture);
        return [
          c.id,
          {
            totalDebit: somme(c.lignesEcriture, 'debit'),
            totalCredit: somme(c.lignesEcriture, 'credit'),
            reportDebit: somme(report, 'debit'),
            reportCredit: somme(report, 'credit'),
            mouvementDebit: somme(mouvement, 'debit'),
            mouvementCredit: somme(mouvement, 'credit'),
          },
        ];
      }),
    );

    /** Les six agrégats d'une ligne, résolus pareillement pour Détail et Total. */
    const CHAMPS = ['totalDebit', 'totalCredit', 'reportDebit', 'reportCredit', 'mouvementDebit', 'mouvementCredit'] as const;
    type Agregats = Record<(typeof CHAMPS)[number], number>;

    const lignesBalance = comptes
      .map((c) => {
        let agregats: Agregats;
        if (c.typeCompte === TypeCompteDetailTotal.TOTAL) {
          // Comptes Total (§3.1) : jamais de mouvement propre (imposé par
          // EcritureService.creer) · leur solde agrège tous les comptes
          // DÉTAIL de même préfixe numérique (jamais les comptes Total
          // imbriqués eux-mêmes, pour ne pas compter deux fois les mêmes
          // mouvements en cas de hiérarchie à plusieurs niveaux).
          const enfantsDetail = comptes.filter(
            (autre) => autre.id !== c.id && autre.numero.startsWith(c.numero) && autre.typeCompte === TypeCompteDetailTotal.DETAIL,
          );
          agregats = Object.fromEntries(
            CHAMPS.map((f) => [f, enfantsDetail.reduce((s, e) => s + soldeDirectParCompte.get(e.id)![f], 0)]),
          ) as Agregats;
        } else {
          agregats = soldeDirectParCompte.get(c.id)!;
        }
        return {
          compteId: c.id,
          numero: c.numero,
          intitule: c.intitule,
          classe: c.classe,
          typeCompte: c.typeCompte,
          ...agregats,
          solde: agregats.totalDebit - agregats.totalCredit,
        };
      })
      .filter((l) => l.totalDebit !== 0 || l.totalCredit !== 0);

    // Les comptes Total n'entrent pas dans les totaux généraux : leur solde
    // n'est qu'un agrégat d'affichage des comptes Détail déjà comptés à côté
    // · les additionner aussi doublerait les montants.
    const lignesDetailSeules = lignesBalance.filter((l) => l.typeCompte !== TypeCompteDetailTotal.TOTAL);

    return {
      lignes: lignesBalance,
      totaux: {
        debit: lignesDetailSeules.reduce((s, l) => s + l.totalDebit, 0),
        credit: lignesDetailSeules.reduce((s, l) => s + l.totalCredit, 0),
      },
    };
  }
}

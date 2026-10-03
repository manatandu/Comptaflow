import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  NatureCreanceDouteuse,
  Prisma,
  Referentiel,
  StatutExercice,
  TypeCompteDetailTotal,
  TypeJournal,
  TypeMouvementCreanceDouteuse,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { transactionJournalisee } from '../../common/audit/transaction-journalisee';
import { motifRefusDepreciationSmt } from '../../common/systeme-minimal';
import {
  DETENTEUR_MOUVEMENT_CREANCE,
  DETENTEUR_RECLASSEMENT_CREANCE,
  DETENTEUR_REVUE_CREANCE,
  EcritureService,
} from '../comptabilite/ecriture.service';
import {
  COMPTES_CREANCES_DOUTEUSES,
  RACINES_CREANCE_SOURCE,
  centimes,
  compte416Propose,
  compte491,
  comptePertePropose,
  depreciationEnPlace,
  ecartDeDepreciation,
  motifRefusMouvement,
  motifRefusReclassement,
  motifRefusRevue,
  piecesLisibles,
  resteDeLaCreance,
} from './creances-douteuses';
import {
  PerteCreanceDto,
  PieceJustificativeDto,
  ReclasserCreanceDto,
  RecouvrementCreanceDto,
  RevoirDepreciationDto,
} from './dto/creances-douteuses.dto';

const n = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);
const jour = (d: Date) => d.toISOString().slice(0, 10);

/** Borne de la liste servie · au-delà, la liste le dit (`tronque`). */
export const PLAFOND_CREANCES_LISTEES = 500;
const PLAFOND_COMPTES_CANDIDATS = 1000;

/**
 * CRÉANCES DOUTEUSES OU LITIGIEUSES · la règle est dans `creances-douteuses.ts`
 * ; ici, la lecture des comptes, des créances et de leurs revues, puis
 * l'écriture, retenue par sa ligne (`detenteurs-ecriture.ts`).
 *
 * CHAQUE GESTE PROPOSE AVANT D'ÉCRIRE · `etat` rend la proposition, le geste
 * la REJOUE au serveur (jamais un montant calculé par l'écran), et l'écriture
 * part au brouillard par `EcritureService.creer`, comme toute pièce.
 */
@Injectable()
export class CreancesDouteusesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
  ) {}

  private async regime(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, systemeComptableSyscohada: true, jeuEtatsFinanciersSycebnl: true },
    });
  }

  private async exercice(tenantId: string, id: string) {
    const ex = await this.prisma.exercice.findFirst({ where: { id, tenantId } });
    if (!ex) throw new BadRequestException('Exercice introuvable pour ce dossier.');
    return ex;
  }

  private async journal(tenantId: string, id: string) {
    const j = await this.prisma.journal.findFirst({
      where: { id, tenantId },
      select: { id: true, code: true, type: true, compteTresorerieId: true },
    });
    if (!j) throw new BadRequestException('Journal introuvable pour ce dossier.');
    return j;
  }

  private async compteParId(tenantId: string, id: string) {
    const c = await this.prisma.compte.findFirst({
      where: { id, tenantId },
      select: { id: true, numero: true, intitule: true, typeCompte: true, estActif: true },
    });
    if (!c) throw new BadRequestException('Compte introuvable pour ce dossier.');
    return c;
  }

  /** Le premier compte de détail actif sous une racine · un compte absent se nomme. */
  private async compteDetail(tenantId: string, racine: string) {
    const c = await this.prisma.compte.findFirst({
      where: { tenantId, numero: { startsWith: racine }, typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true },
      orderBy: { numero: 'asc' },
      select: { id: true, numero: true, intitule: true, typeCompte: true },
    });
    if (!c) throw new BadRequestException(`Aucun compte ${racine} de détail au plan du dossier · ouvrez-le d'abord.`);
    return c;
  }

  /** Solde (débit moins crédit) d'un compte dans un exercice, jusqu'à une date comprise, brouillard compris. */
  private async solde(tenantId: string, compteId: string, exerciceId: string, au: Date) {
    const s = await this.prisma.ligneEcriture.aggregate({
      where: { compteId, ecriture: { tenantId, exerciceId, date: { lte: au } } },
      _sum: { debit: true, credit: true },
    });
    return centimes(n(s._sum.debit) - n(s._sum.credit));
  }

  /** Solde d'une racine dans un exercice, à sa fin · pour le rapprochement avec le module. */
  private async soldeRacine(tenantId: string, racine: string, exerciceId: string) {
    const s = await this.prisma.ligneEcriture.aggregate({
      where: { compte: { tenantId, numero: { startsWith: racine } }, ecriture: { tenantId, exerciceId } },
      _sum: { debit: true, credit: true },
    });
    return centimes(n(s._sum.debit) - n(s._sum.credit));
  }

  private async creance(tenantId: string, id: string) {
    const c = await this.prisma.creanceDouteuse.findFirst({
      where: { id, tenantId },
      include: {
        compteCreance: { select: { id: true, numero: true, intitule: true, tiersCompte: { select: { tiers: { select: { nom: true } } } } } },
        compte416: { select: { id: true, numero: true, intitule: true } },
        compte491: { select: { id: true, numero: true, intitule: true } },
        ajustements: { include: { exercice: { select: { dateDebut: true, dateFin: true } } }, orderBy: { date: 'asc' } },
        mouvements: { orderBy: { date: 'asc' } },
      },
    });
    if (!c) throw new NotFoundException('Créance douteuse introuvable pour ce dossier.');
    return c;
  }

  /**
   * LES COMPTES DU FORMULAIRE · les créances clients à solde débiteur à la fin
   * de l'exercice (lues sur la balance), et les comptes de détail du 416 que
   * le texte prescrit. Aucune liste de choix filtrée par la rétention · voir
   * `listes-de-comptes.ts`, régime « texte ».
   */
  async comptes(tenantId: string, exerciceId: string) {
    const [{ referentiel }, ex] = await Promise.all([this.regime(tenantId), this.exercice(tenantId, exerciceId)]);
    const racines = RACINES_CREANCE_SOURCE[referentiel];
    const groupes = await this.prisma.ligneEcriture.groupBy({
      by: ['compteId'],
      where: {
        ecriture: { tenantId, exerciceId: ex.id },
        compte: { tenantId, typeCompte: TypeCompteDetailTotal.DETAIL, OR: racines.map((r) => ({ numero: { startsWith: r } })) },
      },
      _sum: { debit: true, credit: true },
      orderBy: { compteId: 'asc' },
      take: PLAFOND_COMPTES_CANDIDATS + 1,
    });
    const debiteurs = groupes
      .map((g) => ({ compteId: g.compteId, solde: centimes(n(g._sum?.debit) - n(g._sum?.credit)) }))
      .filter((g) => g.solde > 0.005);
    const [comptesCreances, comptes416] = await Promise.all([
      this.prisma.compte.findMany({
        where: { tenantId, id: { in: debiteurs.map((d) => d.compteId) } },
        select: { id: true, numero: true, intitule: true, tiersCompte: { select: { tiers: { select: { nom: true } } } } },
        orderBy: { numero: 'asc' },
        take: PLAFOND_COMPTES_CANDIDATS,
      }),
      this.prisma.compte.findMany({
        where: { tenantId, numero: { startsWith: COMPTES_CREANCES_DOUTEUSES.creances416 }, typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true },
        select: { id: true, numero: true, intitule: true },
        orderBy: { numero: 'asc' },
        take: 50,
      }),
    ]);
    const soldes = new Map(debiteurs.map((d) => [d.compteId, d.solde]));
    return {
      referentiel,
      creances: comptesCreances.map((c) => ({
        id: c.id,
        numero: c.numero,
        intitule: c.intitule,
        tiers: c.tiersCompte?.tiers.nom ?? null,
        solde: soldes.get(c.id) ?? 0,
        // Le 416 proposé pour chaque nature · l'écran le présélectionne.
        propose416: {
          LITIGIEUSE: compte416Propose(referentiel, NatureCreanceDouteuse.LITIGIEUSE, c.numero),
          DOUTEUSE: compte416Propose(referentiel, NatureCreanceDouteuse.DOUTEUSE, c.numero),
        },
      })),
      tronque: groupes.length > PLAFOND_COMPTES_CANDIDATS,
      comptes416,
    };
  }

  /**
   * LA LISTE DE L'EXERCICE · chaque créance reclassée au plus tard à sa
   * clôture, avec le reste au 416, la dépréciation en place à l'ouverture et
   * à la clôture, sa revue, ses mouvements. Le rapprochement confronte les
   * totaux du module aux soldes du 416 et du 491 · une écriture passée à la
   * main sur ces comptes s'y voit, et rien n'est retranché.
   */
  async lister(tenantId: string, exerciceId: string) {
    const ex = await this.exercice(tenantId, exerciceId);
    const [total, lignes, regime] = await Promise.all([
      this.prisma.creanceDouteuse.count({ where: { tenantId, dateReclassement: { lte: ex.dateFin } } }),
      this.prisma.creanceDouteuse.findMany({
        where: { tenantId, dateReclassement: { lte: ex.dateFin } },
        include: {
          compteCreance: { select: { id: true, numero: true, intitule: true, tiersCompte: { select: { tiers: { select: { nom: true } } } } } },
          compte416: { select: { id: true, numero: true, intitule: true } },
          compte491: { select: { id: true, numero: true, intitule: true } },
          ajustements: { include: { exercice: { select: { dateDebut: true, dateFin: true } } }, orderBy: { date: 'asc' } },
          mouvements: { orderBy: { date: 'asc' } },
        },
        orderBy: [{ dateReclassement: 'asc' }, { id: 'asc' }],
        take: PLAFOND_CREANCES_LISTEES,
      }),
      this.regime(tenantId),
    ]);
    const creances = lignes.map((c) => this.presenter(c, ex, regime.referentiel));
    const [solde416, solde491] = await Promise.all([
      this.soldeRacine(tenantId, COMPTES_CREANCES_DOUTEUSES.creances416, ex.id),
      this.soldeRacine(tenantId, '491', ex.id),
    ]);
    return {
      exercice: { id: ex.id, dateDebut: ex.dateDebut, dateFin: ex.dateFin, statut: ex.statut },
      systemeMinimal: !!motifRefusDepreciationSmt(regime),
      total,
      tronque: total > lignes.length,
      creances,
      rapprochement: total > lignes.length
        ? null
        : {
            solde416,
            resteModule: centimes(creances.reduce((s, c) => s + c.resteALaCloture, 0)),
            // Le 491 est créditeur · rendu en positif pour se comparer.
            solde491: centimes(-solde491),
            depreciationModule: centimes(creances.reduce((s, c) => s + c.depreciationALaCloture, 0)),
          },
    };
  }

  private presenter(
    c: Awaited<ReturnType<CreancesDouteusesService['creance']>>,
    ex: { id: string; dateDebut: Date; dateFin: Date },
    referentiel: Referentiel,
  ) {
    const revues = c.ajustements.map((a) => ({ exerciceDateFin: a.exercice.dateFin, ecart: n(a.ecart) }));
    const mouvements = c.mouvements.map((m) => ({ date: m.date, montant: n(m.montant) }));
    const enPlaceOuverture = depreciationEnPlace(revues, ex.dateDebut);
    const revue = c.ajustements.find((a) => a.exerciceId === ex.id) ?? null;
    const depreciationALaCloture = revue ? n(revue.depreciationNecessaire) : enPlaceOuverture;
    return {
      id: c.id,
      nature: c.nature,
      compteCreance: { id: c.compteCreance.id, numero: c.compteCreance.numero, intitule: c.compteCreance.intitule },
      tiers: c.compteCreance.tiersCompte?.tiers.nom ?? null,
      compte416: c.compte416,
      compte491: c.compte491,
      dateReclassement: c.dateReclassement,
      montant: n(c.montant),
      motif: c.motif,
      pieces: c.pieces,
      ecritureReclassementId: c.ecritureReclassementId,
      resteALaCloture: resteDeLaCreance(n(c.montant), mouvements, ex.dateFin),
      depreciationOuverture: enPlaceOuverture,
      depreciationALaCloture: centimes(depreciationALaCloture),
      comptePertePropose: comptePertePropose(referentiel, c.compteCreance.numero),
      revue: revue
        ? {
            id: revue.id,
            date: revue.date,
            depreciationNecessaire: n(revue.depreciationNecessaire),
            depreciationEnPlace: n(revue.depreciationEnPlace),
            ecart: n(revue.ecart),
            motif: revue.motif,
            pieces: revue.pieces,
            ecritureId: revue.ecritureId,
          }
        : null,
      revues: c.ajustements.map((a) => ({
        id: a.id,
        exerciceId: a.exerciceId,
        date: a.date,
        depreciationNecessaire: n(a.depreciationNecessaire),
        ecart: n(a.ecart),
        motif: a.motif,
        ecritureId: a.ecritureId,
      })),
      mouvements: c.mouvements.map((m) => ({
        id: m.id,
        type: m.type,
        date: m.date,
        montant: n(m.montant),
        motif: m.motif,
        pieces: m.pieces,
        ecritureId: m.ecritureId,
      })),
    };
  }

  private pieces(p: PieceJustificativeDto[]) {
    return piecesLisibles(p);
  }

  /** Une ligne en devise non lettrée sur le compte d'origine, dans l'exercice. */
  private async ligneEnDevise(tenantId: string, compteId: string, exerciceId: string) {
    const k = await this.prisma.ligneEcriture.count({
      where: { compteId, deviseId: { not: null }, lettre: null, ecriture: { tenantId, exerciceId } },
    });
    return k > 0;
  }

  /** Fiche du compte 41 · D 416 / C compte du client, à la date choisie. */
  async reclasser(tenantId: string, userId: string, dto: ReclasserCreanceDto) {
    const [{ referentiel }, ex, journal, source] = await Promise.all([
      this.regime(tenantId),
      this.exercice(tenantId, dto.exerciceId),
      this.journal(tenantId, dto.journalId),
      this.compteParId(tenantId, dto.compteCreanceId),
    ]);
    const date = new Date(dto.date.slice(0, 10));
    const propose = compte416Propose(referentiel, dto.nature, source.numero);
    if (!dto.compte416Id && !propose) {
      throw new BadRequestException(
        `Le compte ${source.numero} ne dit pas si le débiteur est un adhérent (4161) ou un client-usager (4162) · choisissez le 416.`,
      );
    }
    const c416 = dto.compte416Id ? await this.compteParId(tenantId, dto.compte416Id) : await this.compteDetail(tenantId, propose!);
    const pieces = this.pieces(dto.pieces);
    const [soldeDebiteur, ligneEnDevise, c491] = await Promise.all([
      this.solde(tenantId, source.id, ex.id, date),
      this.ligneEnDevise(tenantId, source.id, ex.id),
      this.compteDetail(tenantId, compte491(dto.nature)),
    ]);
    const motif = motifRefusReclassement({
      referentiel,
      nature: dto.nature,
      numeroSource: source.numero,
      sourceEstDetail: source.typeCompte === TypeCompteDetailTotal.DETAIL,
      numero416: c416.numero,
      numero416EstDetail: c416.typeCompte === TypeCompteDetailTotal.DETAIL,
      montant: dto.montant,
      soldeDebiteur,
      ligneEnDevise,
      motif: dto.motif,
      pieces,
      exerciceOuvert: ex.statut === StatutExercice.OUVERT,
      dateDansExercice: date >= ex.dateDebut && date <= ex.dateFin,
      journalGeneral: journal.type === TypeJournal.GENERAL,
    });
    if (motif) throw new BadRequestException(motif);

    const nature = dto.nature === NatureCreanceDouteuse.LITIGIEUSE ? 'litigieuse' : 'douteuse';
    const ecriture = await this.ecritures.creer(tenantId, userId, {
      exerciceId: ex.id,
      journalId: journal.id,
      date: jour(date),
      libelle: `Créance ${nature} reclassée · ${source.numero} ${source.intitule}`.slice(0, 190),
      lignes: [
        { compteId: c416.id, debit: centimes(dto.montant), credit: 0 },
        { compteId: source.id, debit: 0, credit: centimes(dto.montant) },
      ],
    });
    try {
      const ligne = await transactionJournalisee(this.prisma, (tx) =>
        tx.creanceDouteuse.create({
          data: {
            tenantId,
            exerciceId: ex.id,
            nature: dto.nature,
            compteCreanceId: source.id,
            compte416Id: c416.id,
            compte491Id: c491.id,
            dateReclassement: date,
            montant: centimes(dto.montant),
            motif: dto.motif.trim(),
            pieces: pieces as unknown as Prisma.InputJsonValue,
            ecritureReclassementId: ecriture.id,
            createdBy: userId,
          },
        }),
      );
      return { ...ligne, montant: n(ligne.montant) };
    } catch (err) {
      // Une ligne refusée ne laisse pas son écriture au journal.
      await this.ecritures.retirerCompensation(tenantId, ecriture.id);
      throw err;
    }
  }

  /**
   * L'ÉTAT DE LA REVUE pour un exercice · la dépréciation en place, le reste
   * de la créance à la clôture, et le motif qui refuserait la revue. Rien
   * n'est écrit ; le geste rejoue ce calcul.
   */
  private async entreeRevue(tenantId: string, id: string, exerciceId: string) {
    const [c, ex, regime] = await Promise.all([this.creance(tenantId, id), this.exercice(tenantId, exerciceId), this.regime(tenantId)]);
    const revues = c.ajustements.map((a) => ({ exerciceDateFin: a.exercice.dateFin, ecart: n(a.ecart) }));
    const enPlace = depreciationEnPlace(revues, ex.dateDebut);
    const reste = resteDeLaCreance(n(c.montant), c.mouvements.map((m) => ({ date: m.date, montant: n(m.montant) })), ex.dateFin);
    const posterieure = c.ajustements.find((a) => a.exercice.dateDebut.getTime() > ex.dateFin.getTime()) ?? null;
    // Les exercices ouverts entre le reclassement et celui-ci, sans revue ·
    // on revoit dans l'ordre (fiche du compte 49, « à la clôture de
    // l'exercice »), comme la réévaluation des devises.
    const anterieurs = await this.prisma.exercice.findMany({
      where: { tenantId, statut: StatutExercice.OUVERT, dateFin: { gte: c.dateReclassement, lt: ex.dateDebut } },
      select: { id: true, dateDebut: true, dateFin: true },
      orderBy: { dateDebut: 'asc' },
      take: 20,
    });
    const revus = new Set(c.ajustements.map((a) => a.exerciceId));
    return {
      c,
      ex,
      enPlace,
      reste,
      posterieure,
      anterieursSansRevue: anterieurs.filter((e) => !revus.has(e.id)).map((e) => `l'exercice clos le ${jour(e.dateFin)}`),
      refusSmt: motifRefusDepreciationSmt(regime),
    };
  }

  /**
   * Fiche du compte 49 · la dépréciation revue « à la clôture de
   * l'exercice ». Seul l'écart avec la dépréciation en place se passe ·
   * D 6594 / C 491 pour la hausse, D 491 / C 7594 pour la baisse, datée du
   * dernier jour de l'exercice. Un écart nul garde la revue sans écriture.
   */
  async revoir(tenantId: string, userId: string, id: string, dto: RevoirDepreciationDto) {
    const e = await this.entreeRevue(tenantId, id, dto.exerciceId);
    const journal = await this.journal(tenantId, dto.journalId);
    const pieces = this.pieces(dto.pieces);
    if (e.c.ajustements.some((a) => a.exerciceId === e.ex.id)) {
      throw new ConflictException('La dépréciation de cette créance est déjà revue pour cet exercice · retirez la revue pour la refaire.');
    }
    const motif = motifRefusRevue({
      necessaire: dto.depreciationNecessaire,
      enPlace: e.enPlace,
      reste: e.reste,
      motif: dto.motif,
      pieces,
      exerciceOuvert: e.ex.statut === StatutExercice.OUVERT,
      avantReclassement: e.ex.dateFin.getTime() < e.c.dateReclassement.getTime(),
      revuePosterieure: e.posterieure ? jour(e.posterieure.date) : null,
      anterieursSansRevue: e.anterieursSansRevue,
      refusSmt: e.refusSmt,
      journalGeneral: journal.type === TypeJournal.GENERAL,
    });
    if (motif) throw new BadRequestException(motif);

    const ecart = ecartDeDepreciation(e.enPlace, dto.depreciationNecessaire);
    let ecritureId: string | null = null;
    if (Math.abs(ecart) >= 0.005) {
      const autre = await this.compteDetail(tenantId, ecart > 0 ? COMPTES_CREANCES_DOUTEUSES.dotation : COMPTES_CREANCES_DOUTEUSES.reprise);
      const montant = Math.abs(ecart);
      const ecriture = await this.ecritures.creer(tenantId, userId, {
        exerciceId: e.ex.id,
        journalId: journal.id,
        date: jour(e.ex.dateFin),
        libelle: `${ecart > 0 ? 'Dépréciation' : 'Reprise de dépréciation'} · créance ${e.c.compteCreance.numero} ${e.c.compteCreance.intitule}`.slice(0, 190),
        lignes:
          ecart > 0
            ? [
                { compteId: autre.id, debit: montant, credit: 0 },
                { compteId: e.c.compte491.id, debit: 0, credit: montant },
              ]
            : [
                { compteId: e.c.compte491.id, debit: montant, credit: 0 },
                { compteId: autre.id, debit: 0, credit: montant },
              ],
      });
      ecritureId = ecriture.id;
    }
    try {
      const ligne = await transactionJournalisee(this.prisma, (tx) =>
        tx.ajustementCreanceDouteuse.create({
          data: {
            tenantId,
            creanceId: e.c.id,
            exerciceId: e.ex.id,
            date: new Date(jour(e.ex.dateFin)),
            depreciationNecessaire: centimes(dto.depreciationNecessaire),
            depreciationEnPlace: e.enPlace,
            ecart,
            motif: dto.motif.trim(),
            pieces: pieces as unknown as Prisma.InputJsonValue,
            ecritureId,
            createdBy: userId,
          },
        }),
      );
      return { ...ligne, depreciationNecessaire: n(ligne.depreciationNecessaire), depreciationEnPlace: n(ligne.depreciationEnPlace), ecart: n(ligne.ecart) };
    } catch (err) {
      if (ecritureId) await this.ecritures.retirerCompensation(tenantId, ecritureId);
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('La dépréciation de cette créance est déjà revue pour cet exercice.');
      }
      throw err;
    }
  }

  /** La proposition de revue d'un exercice · ce que le geste écrirait pour une dépréciation nécessaire donnée. */
  async propositionRevue(tenantId: string, id: string, exerciceId: string) {
    const e = await this.entreeRevue(tenantId, id, exerciceId);
    return {
      depreciationEnPlace: e.enPlace,
      resteALaCloture: e.reste,
      dateRevue: jour(e.ex.dateFin),
      dejaRevue: e.c.ajustements.some((a) => a.exerciceId === e.ex.id),
      revuePosterieure: e.posterieure ? jour(e.posterieure.date) : null,
      anterieursSansRevue: e.anterieursSansRevue,
      dotationRefuseeSmt: e.refusSmt,
    };
  }

  private async mouvement(
    tenantId: string,
    userId: string,
    id: string,
    type: TypeMouvementCreanceDouteuse,
    dto: PerteCreanceDto | RecouvrementCreanceDto,
  ) {
    const [c, ex, journal, { referentiel }] = await Promise.all([
      this.creance(tenantId, id),
      this.exercice(tenantId, dto.exerciceId),
      this.journal(tenantId, dto.journalId),
      this.regime(tenantId),
    ]);
    const date = new Date(dto.date.slice(0, 10));
    const pieces = this.pieces(dto.pieces);
    const reste = resteDeLaCreance(n(c.montant), c.mouvements.map((m) => ({ date: m.date, montant: n(m.montant) })), date);
    const revueApres = c.ajustements.find((a) => a.exercice.dateFin.getTime() >= date.getTime()) ?? null;

    let comptePerte: { id: string; numero: string; estDetail: boolean } | null = null;
    if (type === TypeMouvementCreanceDouteuse.PERTE) {
      const choisi = (dto as PerteCreanceDto).comptePerteId;
      if (choisi) {
        const k = await this.compteParId(tenantId, choisi);
        comptePerte = { id: k.id, numero: k.numero, estDetail: k.typeCompte === TypeCompteDetailTotal.DETAIL };
      } else {
        const propose = comptePertePropose(referentiel, c.compteCreance.numero);
        if (propose) {
          const k = await this.compteDetail(tenantId, propose);
          comptePerte = { id: k.id, numero: k.numero, estDetail: true };
        }
      }
    }
    const journalAttendu =
      type === TypeMouvementCreanceDouteuse.RECOUVREMENT
        ? journal.type === TypeJournal.TRESORERIE && !!journal.compteTresorerieId
        : journal.type === TypeJournal.GENERAL;
    const motif = motifRefusMouvement({
      type,
      montant: dto.montant,
      reste,
      motif: dto.motif,
      pieces,
      exerciceOuvert: ex.statut === StatutExercice.OUVERT,
      dateDansExercice: date >= ex.dateDebut && date <= ex.dateFin,
      avantReclassement: date.getTime() < c.dateReclassement.getTime(),
      revueApres: revueApres ? jour(revueApres.date) : null,
      journalAttendu,
      numeroPerte: comptePerte?.numero ?? null,
      numeroPerteEstDetail: comptePerte?.estDetail ?? false,
    });
    if (motif) throw new BadRequestException(motif);

    const montant = centimes(dto.montant);
    const debit = type === TypeMouvementCreanceDouteuse.PERTE ? comptePerte!.id : journal.compteTresorerieId!;
    const ecriture = await this.ecritures.creer(tenantId, userId, {
      exerciceId: ex.id,
      journalId: journal.id,
      date: jour(date),
      libelle: `${type === TypeMouvementCreanceDouteuse.PERTE ? 'Perte sur créance irrécouvrable' : 'Recouvrement de créance douteuse'} · ${c.compteCreance.numero} ${c.compteCreance.intitule}`.slice(0, 190),
      lignes: [
        { compteId: debit, debit: montant, credit: 0 },
        { compteId: c.compte416.id, debit: 0, credit: montant },
      ],
    });
    try {
      const ligne = await transactionJournalisee(this.prisma, (tx) =>
        tx.mouvementCreanceDouteuse.create({
          data: {
            tenantId,
            creanceId: c.id,
            exerciceId: ex.id,
            type,
            date,
            montant,
            motif: dto.motif.trim(),
            pieces: pieces as unknown as Prisma.InputJsonValue,
            ecritureId: ecriture.id,
            createdBy: userId,
          },
        }),
      );
      return { ...ligne, montant: n(ligne.montant) };
    } catch (err) {
      await this.ecritures.retirerCompensation(tenantId, ecriture.id);
      throw err;
    }
  }

  /** Fiche du compte 65 · D 651 / C 416 pour la part irrécouvrable. */
  perte(tenantId: string, userId: string, id: string, dto: PerteCreanceDto) {
    return this.mouvement(tenantId, userId, id, TypeMouvementCreanceDouteuse.PERTE, dto);
  }

  /** L'encaissement d'une créance reclassée · D trésorerie du journal / C 416. */
  recouvrement(tenantId: string, userId: string, id: string, dto: RecouvrementCreanceDto) {
    return this.mouvement(tenantId, userId, id, TypeMouvementCreanceDouteuse.RECOUVREMENT, dto);
  }

  /**
   * RETIRER, AU BROUILLARD SEULEMENT · l'écriture part avec sa ligne, par la
   * suppression du journal qui libère le module dans la même transaction.
   * Validée, elle ne se retire plus (AUDCIF art. 22, 2°) et le journal le dit.
   * On ne retire que le DERNIER acte · une revue lue par une revue
   * postérieure, ou un mouvement compté par une revue, resterait faux.
   */
  async retirerCreance(tenantId: string, id: string) {
    const c = await this.creance(tenantId, id);
    if (c.ajustements.length > 0 || c.mouvements.length > 0) {
      throw new BadRequestException('Cette créance porte déjà une revue ou un mouvement · retirez-les d’abord, du plus récent au plus ancien.');
    }
    await this.ecritures.supprimer(tenantId, c.ecritureReclassementId, {
      detenteur: DETENTEUR_RECLASSEMENT_CREANCE,
      liberer: (tx) => tx.creanceDouteuse.delete({ where: { id: c.id } }),
    });
    return { retire: true };
  }

  async retirerRevue(tenantId: string, id: string, revueId: string) {
    const c = await this.creance(tenantId, id);
    const revue = c.ajustements.find((a) => a.id === revueId);
    if (!revue) throw new NotFoundException('Revue introuvable pour cette créance.');
    if (c.ajustements.some((a) => a.exercice.dateDebut.getTime() > revue.exercice.dateFin.getTime())) {
      throw new BadRequestException('Une revue d’un exercice postérieur a lu celle-ci · retirez d’abord la plus récente.');
    }
    if (revue.ecritureId) {
      await this.ecritures.supprimer(tenantId, revue.ecritureId, {
        detenteur: DETENTEUR_REVUE_CREANCE,
        liberer: (tx) => tx.ajustementCreanceDouteuse.delete({ where: { id: revue.id } }),
      });
    } else {
      await transactionJournalisee(this.prisma, (tx) => tx.ajustementCreanceDouteuse.delete({ where: { id: revue.id } }));
    }
    return { retire: true };
  }

  async retirerMouvement(tenantId: string, id: string, mouvementId: string) {
    const c = await this.creance(tenantId, id);
    const mv = c.mouvements.find((m) => m.id === mouvementId);
    if (!mv) throw new NotFoundException('Mouvement introuvable pour cette créance.');
    const revue = c.ajustements.find((a) => a.exercice.dateFin.getTime() >= mv.date.getTime());
    if (revue) {
      throw new BadRequestException(
        `La revue de la clôture du ${jour(revue.date)} a compté ce mouvement dans le reste de la créance · retirez-la d’abord.`,
      );
    }
    await this.ecritures.supprimer(tenantId, mv.ecritureId, {
      detenteur: DETENTEUR_MOUVEMENT_CREANCE,
      liberer: (tx) => tx.mouvementCreanceDouteuse.delete({ where: { id: mv.id } }),
    });
    return { retire: true };
  }
}

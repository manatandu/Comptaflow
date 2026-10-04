import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ClasseCompte, ComportementGestion, Prisma, StatutExercice, TypeCompteDetailTotal } from '@prisma/client';
import { PrismaService } from '../../../common/prisma.service';
import { transactionJournalisee } from '../../../common/audit/transaction-journalisee';
import { lireParLots, pageApres, LOT_LECTURE } from '../../../common/lecture-par-lots';
import { filtresDesTroisColonnes } from '../../comptabilite/balance-trois-colonnes';
import { moisCouverts } from '../../etats-financiers/comparabilite-exercices';
import { motifRefusOd } from '../od-analytique';
import { OdAnalytiqueService } from '../od-analytique.service';
import { motifRefusComportement, type Comportement } from './comportement-gestion';
import { motifRefusCle, propositionRepartition, type CumulCompteSection, type ModeCle } from './cles-repartition';
import { coutDeProduction, motifRefusDonnees } from './cout-production';
import { seuilDeRentabilite } from './seuil-rentabilite';
import type {
  CreerCleRepartitionDto,
  DeclarerComportementsDto,
  DeclarerCoutProductionDto,
  RepartirDto,
} from './dto/comptabilite-gestion.dto';

/**
 * COMPTABILITÉ DE GESTION (ligne A20) · voir les moteurs purs de ce dossier
 * pour les règles et leurs sources. Ce service lit et déclare ; la seule
 * chose qu'il écrit hors de ses propres tables, ce sont des OD ANALYTIQUES
 * (table à part, équilibrées), jamais une écriture ni une ligne d'écriture.
 */

const classeChiffre = (c: ClasseCompte) => c.replace('CLASSE_', '');
const jour = (d: Date) => d.toISOString().slice(0, 10);

/** Une date AAAA-MM-JJ lue à minuit UTC, comme les dates des écritures. */
function dateDuJour(texte: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texte)) throw new BadRequestException('La date est une date AAAA-MM-JJ.');
  const d = new Date(`${texte}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('La date est une date AAAA-MM-JJ.');
  return d;
}

@Injectable()
export class ComptabiliteGestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly od: OdAnalytiqueService,
  ) {}

  private async exercice(tenantId: string, exerciceId: string) {
    const ex = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!ex) throw new NotFoundException('Exercice introuvable pour ce dossier.');
    return ex;
  }

  private refuserSiClos(ex: { statut: StatutExercice }) {
    if (ex.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException("L'exercice est clôturé · son analytique ne se corrige plus.");
    }
  }

  // ---------------------------------------------------------------------------
  // MOUVEMENTS DE GESTION · classes 6 et 7, colonne MOUVEMENT de la balance
  // (clôture et à-nouveau exclus, `filtresDesTroisColonnes`), brouillard
  // compris · la balance générale de l'écran lit la même chose.
  // ---------------------------------------------------------------------------

  private async mouvementsDeGestion(tenantId: string, exerciceId: string) {
    const filtres = filtresDesTroisColonnes({ tenantId, exerciceId });
    const groupes = await this.prisma.ligneEcriture.groupBy({
      by: ['compteId'],
      where: {
        ecriture: filtres.mouvements,
        compte: { tenantId, classe: { in: [ClasseCompte.CLASSE_6, ClasseCompte.CLASSE_7] } },
      },
      _sum: { debit: true, credit: true },
    });
    return new Map(groupes.map((g) => [g.compteId, { debit: Number(g._sum.debit ?? 0), credit: Number(g._sum.credit ?? 0) }]));
  }

  /**
   * Les comptes de gestion à déclarer · ceux que l'exercice a mouvementés, et
   * ceux qui portent déjà une déclaration (pour pouvoir la retirer). Le plan
   * d'un dossier est borné (quelques milliers de comptes au plus) ; la liste
   * ne rapatrie que les classes 6 et 7 et le dit si elle dépasse son plafond.
   */
  async comportements(tenantId: string, exerciceId: string) {
    await this.exercice(tenantId, exerciceId);
    const mouvements = await this.mouvementsDeGestion(tenantId, exerciceId);
    const PLAFOND = 2000;
    const where: Prisma.CompteWhereInput = {
      tenantId,
      typeCompte: TypeCompteDetailTotal.DETAIL,
      classe: { in: [ClasseCompte.CLASSE_6, ClasseCompte.CLASSE_7] },
      OR: [{ id: { in: [...mouvements.keys()] } }, { comportementGestion: { not: null } }],
    };
    const [comptes, total] = await Promise.all([
      this.prisma.compte.findMany({
        // Le dossier se relit à l'appel · le balayage du cloisonnement le
        // cherche dans l'argument même, pas dans une variable plus haut.
        where: { ...where, tenantId },
        orderBy: { numero: 'asc' },
        take: PLAFOND,
        select: { id: true, numero: true, intitule: true, classe: true, comportementGestion: true, partVariableGestionPct: true },
      }),
      this.prisma.compte.count({ where: { ...where, tenantId } }),
    ]);
    return {
      comptes: comptes.map((c) => {
        const m = mouvements.get(c.id) ?? { debit: 0, credit: 0 };
        return {
          compteId: c.id,
          numero: c.numero,
          intitule: c.intitule,
          classe: classeChiffre(c.classe),
          comportement: c.comportementGestion,
          partVariablePct: c.partVariableGestionPct === null ? null : Number(c.partVariableGestionPct),
          mouvementDebit: m.debit,
          mouvementCredit: m.credit,
        };
      }),
      total,
      tronque: total > comptes.length,
    };
  }

  /**
   * La déclaration · une mise à jour UNITAIRE par compte, dans une transaction
   * (le journal d'audit date et attribue chacune ; un `updateMany` n'y
   * laisserait que le filtre). Tout se vérifie avant la première écriture.
   */
  async declarerComportements(tenantId: string, dto: DeclarerComportementsDto) {
    const ids = dto.declarations.map((d) => d.compteId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Un compte figure deux fois dans la déclaration.');
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, numero: true, classe: true, typeCompte: true },
    });
    const parId = new Map(comptes.map((c) => [c.id, c]));
    for (const d of dto.declarations) {
      const c = parId.get(d.compteId);
      if (!c) throw new NotFoundException('Compte introuvable pour ce dossier.');
      if (c.typeCompte !== TypeCompteDetailTotal.DETAIL) {
        throw new BadRequestException(`Le compte ${c.numero} est un compte Total · le comportement se déclare sur ses comptes de détail.`);
      }
      const motif = motifRefusComportement({
        numero: c.numero,
        classe: classeChiffre(c.classe),
        comportement: (d.comportement ?? null) as Comportement | null,
        partVariablePct: d.partVariablePct ?? null,
      });
      if (motif) throw new BadRequestException(motif);
    }
    await transactionJournalisee(this.prisma, async (tx) => {
      for (const d of dto.declarations) {
        await tx.compte.update({
          where: { id: d.compteId },
          data: {
            comportementGestion: (d.comportement ?? null) as ComportementGestion | null,
            partVariableGestionPct: d.partVariablePct ?? null,
          },
        });
      }
    });
    return { declares: dto.declarations.length };
  }

  /** Le seuil de rentabilité de l'exercice · définition d'OmegaX (`seuil-rentabilite.ts`). */
  async seuilRentabilite(tenantId: string, exerciceId: string) {
    const ex = await this.exercice(tenantId, exerciceId);
    const mouvements = await this.mouvementsDeGestion(tenantId, exerciceId);
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId, id: { in: [...mouvements.keys()] } },
      select: { id: true, numero: true, intitule: true, classe: true, comportementGestion: true, partVariableGestionPct: true },
      orderBy: { numero: 'asc' },
    });
    const mois = moisCouverts(ex);
    const resultat = seuilDeRentabilite(
      comptes.map((c) => ({
        numero: c.numero,
        intitule: c.intitule,
        classe: classeChiffre(c.classe),
        mouvementDebit: mouvements.get(c.id)?.debit ?? 0,
        mouvementCredit: mouvements.get(c.id)?.credit ?? 0,
        comportement: c.comportementGestion as Comportement | null,
        partVariablePct: c.partVariableGestionPct === null ? null : Number(c.partVariableGestionPct),
      })),
      mois,
    );
    return { exercice: { id: ex.id, dateDebut: jour(ex.dateDebut), dateFin: jour(ex.dateFin), mois }, brouillardCompris: true, ...resultat };
  }

  // ---------------------------------------------------------------------------
  // CUMULS D'UNE SECTION PAR COMPTE · ventilations ET OD, la même réunion que
  // `cumulsPlan` des états analytiques, ici compte par compte. Lu par
  // tranches (F185) · une section peut porter une année de lignes.
  // ---------------------------------------------------------------------------

  private async cumulsDeSection(tenantId: string, sectionId: string, exerciceId: string, du: Date, au: Date) {
    const parCompte = new Map<string, { debit: number; credit: number }>();
    const ajouter = (compteId: string, d: number, c: number) => {
      const a = parCompte.get(compteId) ?? { debit: 0, credit: 0 };
      // Accumulé en centimes · cent lignes à 0,10 ne font pas 9,999999.
      a.debit = Math.round((a.debit + d) * 100) / 100;
      a.credit = Math.round((a.credit + c) * 100) / 100;
      parCompte.set(compteId, a);
    };
    await lireParLots(
      (curseur) =>
        this.prisma.ventilationAnalytique.findMany({
          where: {
            sectionId,
            // La clôture qui solde les classes 6 à 8 ne porte aucune
            // ventilation ; le filtre le garantit plutôt que de le supposer.
            ligne: { ecriture: { tenantId, exerciceId, date: { gte: du, lte: au }, estSoldeDesComptesDeGestion: false } },
          },
          select: { id: true, debit: true, credit: true, ligne: { select: { compteId: true } } },
          ...pageApres(curseur, LOT_LECTURE),
        }),
      (v) => ajouter(v.ligne.compteId, Number(v.debit), Number(v.credit)),
    );
    await lireParLots(
      (curseur) =>
        this.prisma.ligneOdAnalytique.findMany({
          where: { tenantId, sectionId, od: { tenantId, exerciceId, date: { gte: du, lte: au } } },
          select: { id: true, debit: true, credit: true, od: { select: { compteId: true } } },
          ...pageApres(curseur, LOT_LECTURE),
        }),
      (l) => ajouter(l.od.compteId, Number(l.debit), Number(l.credit)),
    );
    if (parCompte.size === 0) return [] as (CumulCompteSection & { classe: string })[];
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId, id: { in: [...parCompte.keys()] } },
      select: { id: true, numero: true, intitule: true, classe: true },
    });
    return comptes.map((c) => ({
      compteId: c.id,
      numero: c.numero,
      intitule: c.intitule,
      classe: classeChiffre(c.classe),
      ...(parCompte.get(c.id) as { debit: number; credit: number }),
    }));
  }

  // ---------------------------------------------------------------------------
  // CLÉS DE RÉPARTITION
  // ---------------------------------------------------------------------------

  async cles(tenantId: string, exerciceId: string) {
    await this.exercice(tenantId, exerciceId);
    const cles = await this.prisma.cleRepartition.findMany({
      where: { tenantId, exerciceId },
      orderBy: { createdAt: 'asc' },
      include: {
        plan: { select: { code: true, intitule: true } },
        sectionSource: { select: { code: true, intitule: true } },
        lignes: { include: { sectionCible: { select: { code: true, intitule: true } } } },
        _count: { select: { ods: true } },
      },
    });
    return cles.map((k) => ({
      id: k.id,
      planId: k.planId,
      plan: k.plan,
      sectionSourceId: k.sectionSourceId,
      sectionSource: k.sectionSource,
      libelle: k.libelle,
      mode: k.mode,
      unite: k.unite,
      source: k.source,
      odsProduites: k._count.ods,
      lignes: k.lignes
        .map((l) => ({ sectionCibleId: l.sectionCibleId, code: l.sectionCible.code, intitule: l.sectionCible.intitule, valeur: Number(l.valeur) }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    }));
  }

  private async sectionsDuPlan(tenantId: string, planId: string) {
    const sections = await this.prisma.sectionAnalytique.findMany({
      where: { tenantId, planId },
      select: { id: true, planId: true, code: true, type: true, estActive: true },
    });
    return sections.map((s) => ({ ...s, estTotal: s.type === TypeCompteDetailTotal.TOTAL }));
  }

  async creerCle(tenantId: string, userId: string, dto: CreerCleRepartitionDto) {
    const ex = await this.exercice(tenantId, dto.exerciceId);
    this.refuserSiClos(ex);
    const plan = await this.prisma.planAnalytique.findFirst({ where: { id: dto.planId, tenantId } });
    if (!plan) throw new NotFoundException('Plan analytique introuvable pour ce dossier.');
    const sections = await this.sectionsDuPlan(tenantId, plan.id);
    const motif = motifRefusCle({
      planId: plan.id,
      sectionSourceId: dto.sectionSourceId,
      mode: dto.mode as ModeCle,
      lignes: dto.lignes,
      sections,
      source: dto.source,
    });
    if (motif) throw new BadRequestException(motif);
    if (dto.mode === 'UNITES' && !dto.unite?.trim()) {
      throw new BadRequestException("Une clé en unités nomme son unité (m², heures, effectif).");
    }
    try {
      return await this.prisma.cleRepartition.create({
        data: {
          tenantId,
          exerciceId: ex.id,
          planId: plan.id,
          sectionSourceId: dto.sectionSourceId,
          libelle: dto.libelle.trim(),
          mode: dto.mode,
          unite: dto.mode === 'UNITES' ? dto.unite!.trim() : null,
          source: dto.source.trim(),
          createdBy: userId,
          lignes: { create: dto.lignes.map((l) => ({ tenantId, sectionCibleId: l.sectionCibleId, valeur: l.valeur })) },
        },
        select: { id: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Cette section a déjà une clé sur cet exercice · retirez-la avant d’en déclarer une autre.');
      }
      throw e;
    }
  }

  async supprimerCle(tenantId: string, id: string) {
    const cle = await this.prisma.cleRepartition.findFirst({
      where: { id, tenantId },
      include: { exercice: true, _count: { select: { ods: true } } },
    });
    if (!cle) throw new NotFoundException('Clé de répartition introuvable pour ce dossier.');
    this.refuserSiClos(cle.exercice);
    if (cle._count.ods > 0) {
      throw new ConflictException(
        `La clé a produit ${cle._count.ods} OD analytique(s) · retirez-les d'abord (Saisie des OD analytiques), elles portent sa justification.`,
      );
    }
    await this.prisma.cleRepartition.delete({ where: { id: cle.id } });
    return { supprime: true };
  }

  /**
   * REPRENDRE LES CLÉS DE L'EXERCICE PRÉCÉDENT · une surface ou un effectif ne
   * change pas forcément d'une année à l'autre, mais une clé de N ne vaut pas
   * d'office pour N+1 · le cabinet la reprend par un geste, et chaque clé
   * reprise est revérifiée (une section mise en sommeil depuis l'écarte, dit).
   */
  async reprendreCles(tenantId: string, userId: string, exerciceId: string) {
    const ex = await this.exercice(tenantId, exerciceId);
    this.refuserSiClos(ex);
    const precedent = await this.prisma.exercice.findFirst({
      where: { tenantId, dateFin: { lt: ex.dateDebut } },
      orderBy: { dateFin: 'desc' },
    });
    if (!precedent) throw new BadRequestException("Aucun exercice ne précède celui-ci · rien à reprendre.");
    const [anciennes, deja] = await Promise.all([
      this.prisma.cleRepartition.findMany({ where: { tenantId, exerciceId: precedent.id }, include: { lignes: true, sectionSource: { select: { code: true } } } }),
      this.prisma.cleRepartition.findMany({ where: { tenantId, exerciceId: ex.id }, select: { sectionSourceId: true } }),
    ]);
    const occupees = new Set(deja.map((d) => d.sectionSourceId));
    const ecartees: { section: string; motif: string }[] = [];
    let reprises = 0;
    for (const k of anciennes) {
      if (occupees.has(k.sectionSourceId)) {
        ecartees.push({ section: k.sectionSource.code, motif: 'une clé existe déjà sur cet exercice' });
        continue;
      }
      const sections = await this.sectionsDuPlan(tenantId, k.planId);
      const lignes = k.lignes.map((l) => ({ sectionCibleId: l.sectionCibleId, valeur: Number(l.valeur) }));
      const motif = motifRefusCle({ planId: k.planId, sectionSourceId: k.sectionSourceId, mode: k.mode as ModeCle, lignes, sections, source: k.source });
      if (motif) {
        ecartees.push({ section: k.sectionSource.code, motif });
        continue;
      }
      await this.prisma.cleRepartition.create({
        data: {
          tenantId,
          exerciceId: ex.id,
          planId: k.planId,
          sectionSourceId: k.sectionSourceId,
          libelle: k.libelle,
          mode: k.mode,
          unite: k.unite,
          source: `${k.source} (reprise de l'exercice clos le ${jour(precedent.dateFin)})`,
          createdBy: userId,
          lignes: { create: lignes.map((l) => ({ tenantId, sectionCibleId: l.sectionCibleId, valeur: l.valeur })) },
        },
      });
      reprises++;
    }
    return { reprises, ecartees };
  }

  /** La proposition de répartition à une date · rien n'est écrit. */
  async proposition(tenantId: string, cleId: string, dateTexte?: string) {
    const cle = await this.prisma.cleRepartition.findFirst({
      where: { id: cleId, tenantId },
      include: { exercice: true, lignes: true, sectionSource: { select: { code: true, intitule: true } } },
    });
    if (!cle) throw new NotFoundException('Clé de répartition introuvable pour ce dossier.');
    const ex = cle.exercice;
    const date = dateTexte ? dateDuJour(dateTexte) : ex.dateFin;
    if (date < ex.dateDebut || date > ex.dateFin) throw new BadRequestException("La date de la répartition tombe hors de l'exercice.");
    // Fin du jour inclusive · une ligne ventilée datée du jour même se répartit.
    const au = new Date(date.getTime() + 24 * 3600 * 1000 - 1);
    const cumuls = await this.cumulsDeSection(tenantId, cle.sectionSourceId, ex.id, ex.dateDebut, au);
    const lignes = cle.lignes.map((l) => ({ sectionCibleId: l.sectionCibleId, valeur: Number(l.valeur) }));
    const ods = propositionRepartition(cumuls, cle.sectionSourceId, lignes);
    const codes = new Map(
      (await this.prisma.sectionAnalytique.findMany({
        where: { tenantId, id: { in: [cle.sectionSourceId, ...lignes.map((l) => l.sectionCibleId)] } },
        select: { id: true, code: true },
      })).map((s) => [s.id, s.code]),
    );
    return {
      cle: { id: cle.id, libelle: cle.libelle, sectionSource: cle.sectionSource },
      date: jour(date),
      exerciceClos: ex.statut === StatutExercice.CLOTURE,
      ods: ods.map((o) => ({ ...o, lignes: o.lignes.map((l) => ({ ...l, code: codes.get(l.sectionId) ?? null })) })),
      total: ods.reduce((t, o) => t + Math.abs(o.solde), 0),
    };
  }

  /**
   * PASSER LA RÉPARTITION · la proposition est REJOUÉE par le serveur (jamais
   * un montant reçu du client), confrontée aux soldes que l'écran a montrés ·
   * une ventilation passée entre-temps change le chiffre, et le 409 le dit
   * plutôt que de passer un montant que personne n'a vu. Toutes les OD dans
   * UNE transaction · une répartition à moitié passée laisserait la section
   * source vidée sur un compte et pleine sur l'autre.
   */
  async repartir(tenantId: string, userId: string, cleId: string, dto: RepartirDto) {
    const prop = await this.proposition(tenantId, cleId, dto.date);
    if (prop.exerciceClos) throw new BadRequestException("L'exercice est clôturé · son analytique ne se corrige plus.");
    if (prop.ods.length === 0) throw new BadRequestException('La section à répartir ne porte aucun solde à cette date · rien à passer.');
    const vus = dto.soldes ?? {};
    const centimes = (n: number) => Math.round(n * 100);
    const divergent =
      Object.keys(vus).length !== prop.ods.length || prop.ods.some((o) => vus[o.compteId] === undefined || centimes(vus[o.compteId]) !== centimes(o.solde));
    if (divergent) {
      throw new ConflictException('Les soldes de la section ont changé depuis la proposition · relisez-la avant de passer la répartition.');
    }
    const date = dateDuJour(prop.date);
    await this.od.refuserSiPeriodeClose(tenantId, date);
    const cle = await this.prisma.cleRepartition.findFirst({ where: { id: cleId, tenantId }, include: { plan: true } });
    if (!cle) throw new NotFoundException('Clé de répartition introuvable pour ce dossier.');
    const sections = await this.sectionsDuPlan(tenantId, cle.planId);
    // La règle des OD se rejoue sur chacune · la répartition ne passe que ce
    // que la saisie à la main admettrait.
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId, id: { in: prop.ods.map((o) => o.compteId) } },
      select: { id: true, classe: true },
    });
    const classeDe = new Map(comptes.map((c) => [c.id, classeChiffre(c.classe)]));
    for (const o of prop.ods) {
      const motif = motifRefusOd({
        planId: cle.planId,
        lignes: o.lignes,
        sections: sections.map((s) => ({ id: s.id, planId: s.planId, code: s.code, estTotal: s.estTotal })),
        classeCompte: classeDe.get(o.compteId) ?? '',
        classesVentilees: cle.plan.classesVentilees,
      });
      if (motif) throw new BadRequestException(`Compte ${o.numero} · ${motif}`);
    }
    await transactionJournalisee(this.prisma, async (tx) => {
      for (const o of prop.ods) {
        await tx.odAnalytique.create({
          data: {
            tenantId,
            exerciceId: cle.exerciceId,
            planId: cle.planId,
            compteId: o.compteId,
            cleRepartitionId: cle.id,
            date,
            reference: 'REPARTITION',
            libelle: `Répartition · ${cle.libelle}`.slice(0, 200),
            createdBy: userId,
            lignes: { create: o.lignes.map((l) => ({ tenantId, sectionId: l.sectionId, debit: l.debit, credit: l.credit })) },
          },
        });
      }
    });
    return { ods: prop.ods.length, total: prop.total };
  }

  // ---------------------------------------------------------------------------
  // COÛT DE PRODUCTION
  // ---------------------------------------------------------------------------

  async coutsProduction(tenantId: string, exerciceId: string) {
    const ex = await this.exercice(tenantId, exerciceId);
    const declarations = await this.prisma.coutProductionDeclare.findMany({
      where: { tenantId, exerciceId },
      include: { section: { select: { code: true, intitule: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const resultat = [];
    for (const d of declarations) {
      const cumuls = await this.cumulsDeSection(tenantId, d.sectionId, ex.id, ex.dateDebut, ex.dateFin);
      const ids = cumuls.filter((c) => c.classe === '6').map((c) => c.compteId);
      const comportements = new Map(
        (await this.prisma.compte.findMany({
          where: { tenantId, id: { in: ids } },
          select: { id: true, comportementGestion: true, partVariableGestionPct: true },
        })).map((c) => [c.id, c]),
      );
      const charges = cumuls
        .filter((c) => c.classe === '6')
        .map((c) => ({
          compteId: c.compteId,
          numero: c.numero,
          intitule: c.intitule,
          montant: Math.round((c.debit - c.credit) * 100) / 100,
          comportement: (comportements.get(c.compteId)?.comportementGestion ?? null) as Comportement | null,
          partVariablePct:
            comportements.get(c.compteId)?.partVariableGestionPct == null ? null : Number(comportements.get(c.compteId)!.partVariableGestionPct),
        }))
        .sort((a, b) => a.numero.localeCompare(b.numero));
      const donnees = {
        capaciteNormale: Number(d.capaciteNormale),
        activiteReelle: Number(d.activiteReelle),
        quantiteProduite: d.quantiteProduite === null ? null : Number(d.quantiteProduite),
      };
      resultat.push({
        id: d.id,
        sectionId: d.sectionId,
        section: d.section,
        unite: d.unite,
        source: d.source,
        ...donnees,
        charges,
        // Les produits ventilés sur la section ne sont pas des coûts · comptés
        // à part pour qu'on voie qu'ils n'ont pas été soustraits.
        produitsVentiles: cumuls.filter((c) => c.classe !== '6').length,
        calcul: coutDeProduction(charges, donnees),
      });
    }
    return { exercice: { id: ex.id, dateDebut: jour(ex.dateDebut), dateFin: jour(ex.dateFin) }, declarations: resultat };
  }

  async declarerCoutProduction(tenantId: string, userId: string, dto: DeclarerCoutProductionDto) {
    const ex = await this.exercice(tenantId, dto.exerciceId);
    this.refuserSiClos(ex);
    const section = await this.prisma.sectionAnalytique.findFirst({ where: { id: dto.sectionId, tenantId } });
    if (!section) throw new NotFoundException('Section analytique introuvable pour ce dossier.');
    if (section.type === TypeCompteDetailTotal.TOTAL) {
      throw new BadRequestException(`${section.code} est une rubrique (section Total) · le coût se calcule sur une section de détail.`);
    }
    const donnees = {
      capaciteNormale: dto.capaciteNormale,
      activiteReelle: dto.activiteReelle,
      quantiteProduite: dto.quantiteProduite ?? null,
      source: dto.source,
      unite: dto.unite,
    };
    const motif = motifRefusDonnees(donnees);
    if (motif) throw new BadRequestException(motif);
    const data = {
      unite: dto.unite.trim(),
      capaciteNormale: dto.capaciteNormale,
      activiteReelle: dto.activiteReelle,
      quantiteProduite: dto.quantiteProduite ?? null,
      source: dto.source.trim(),
    };
    // Retouchée par son identifiant, jamais par un upsert sur la clé composée ·
    // le journal d'audit lit l'état antérieur de CETTE ligne.
    const existante = await this.prisma.coutProductionDeclare.findFirst({ where: { tenantId, exerciceId: ex.id, sectionId: section.id } });
    if (existante) {
      await this.prisma.coutProductionDeclare.update({ where: { id: existante.id }, data });
      return { id: existante.id };
    }
    return this.prisma.coutProductionDeclare.create({
      data: { tenantId, exerciceId: ex.id, sectionId: section.id, createdBy: userId, ...data },
      select: { id: true },
    });
  }

  async supprimerCoutProduction(tenantId: string, id: string) {
    const d = await this.prisma.coutProductionDeclare.findFirst({ where: { id, tenantId }, include: { exercice: true } });
    if (!d) throw new NotFoundException('Déclaration introuvable pour ce dossier.');
    this.refuserSiClos(d.exercice);
    await this.prisma.coutProductionDeclare.delete({ where: { id: d.id } });
    return { supprime: true };
  }
}

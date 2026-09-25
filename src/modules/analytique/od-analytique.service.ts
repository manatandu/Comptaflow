import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { GranulariteCloture, StatutExercice, TypeCompteDetailTotal } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { CreerOdAnalytiqueDto } from './dto/od-analytique.dto';
import { motifRefusOd } from './od-analytique';
import { motifLigneFigee } from '../exercice/gel-cloture';

/**
 * OD ANALYTIQUES · voir od-analytique.ts pour la règle et sa source. Ce
 * service vérifie tout AVANT d'écrire, puis rend les cumuls par section que
 * les états analytiques ajoutent à ceux des ventilations.
 */
@Injectable()
export class OdAnalytiqueService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(tenantId: string, exerciceId: string, planId?: string) {
    const ods = await this.prisma.odAnalytique.findMany({
      where: { tenantId, exerciceId, ...(planId ? { planId } : {}) },
      include: {
        plan: { select: { code: true, intitule: true } },
        compte: { select: { numero: true, intitule: true } },
        lignes: { include: { section: { select: { code: true, intitule: true } } } },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    return ods.map((o) => ({
      id: o.id,
      date: o.date.toISOString().slice(0, 10),
      reference: o.reference,
      libelle: o.libelle,
      planId: o.planId,
      plan: o.plan,
      compte: o.compte,
      montant: o.lignes.reduce((t, l) => t + Number(l.debit), 0),
      lignes: o.lignes.map((l) => ({
        sectionId: l.sectionId,
        sectionCode: l.section.code,
        sectionIntitule: l.section.intitule,
        debit: Number(l.debit),
        credit: Number(l.credit),
      })),
    }));
  }

  async creer(tenantId: string, userId: string, dto: CreerOdAnalytiqueDto) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new NotFoundException('Exercice introuvable pour ce dossier.');
    if (exercice.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException("L'exercice est clôturé · son analytique ne se corrige plus.");
    }
    const date = new Date(dto.date);
    if (date < exercice.dateDebut || date > exercice.dateFin) {
      throw new BadRequestException("La date de l'OD tombe hors de l'exercice.");
    }
    await this.refuserSiPeriodeClose(tenantId, date);
    const plan = await this.prisma.planAnalytique.findFirst({ where: { id: dto.planId, tenantId } });
    if (!plan) throw new NotFoundException('Plan analytique introuvable pour ce dossier.');
    const compte = await this.prisma.compte.findFirst({ where: { id: dto.compteId, tenantId } });
    if (!compte) throw new NotFoundException('Compte introuvable pour ce dossier.');
    const sections = await this.prisma.sectionAnalytique.findMany({
      where: { tenantId, id: { in: dto.lignes.map((l) => l.sectionId) } },
      select: { id: true, planId: true, code: true, type: true },
    });
    const refus = motifRefusOd({
      planId: plan.id,
      lignes: dto.lignes,
      sections: sections.map((s) => ({ ...s, estTotal: s.type === TypeCompteDetailTotal.TOTAL })),
      classeCompte: compte.classe.replace('CLASSE_', ''),
      classesVentilees: plan.classesVentilees,
    });
    if (refus) throw new BadRequestException(refus);

    return this.prisma.odAnalytique.create({
      data: {
        tenantId,
        exerciceId: exercice.id,
        planId: plan.id,
        compteId: compte.id,
        date,
        reference: dto.reference || null,
        libelle: dto.libelle,
        createdBy: userId,
        lignes: {
          create: dto.lignes.map((l) => ({
            tenantId,
            sectionId: l.sectionId,
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
          })),
        },
      },
      select: { id: true },
    });
  }

  /** Une OD est extra-comptable · elle se retire tant que l'exercice est ouvert. */
  async supprimer(tenantId: string, id: string) {
    const od = await this.prisma.odAnalytique.findFirst({ where: { id, tenantId }, include: { exercice: true } });
    if (!od) throw new NotFoundException('OD analytique introuvable pour ce dossier.');
    if (od.exercice.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException("L'exercice est clôturé · son analytique ne se corrige plus.");
    }
    await this.refuserSiPeriodeClose(tenantId, od.date);
    await this.prisma.odAnalytique.delete({ where: { id } });
    return { supprime: true };
  }

  /**
   * Une OD analytique n'a pas de journal · seule la clôture de PÉRIODE, qui
   * vaut pour tous les journaux, l'atteint (exercice/gel-cloture.ts). La
   * clôture totale d'un journal ne la concerne pas, la partielle non plus.
   */
  private async refuserSiPeriodeClose(tenantId: string, date: Date) {
    const clotures = await this.prisma.cloture.findMany({
      where: { tenantId, annuleeAt: null, granularite: GranulariteCloture.PERIODE },
      select: { granularite: true, journalId: true, dateLimite: true },
    });
    const motif = motifLigneFigee({ journalId: '', date, exerciceClos: false }, clotures);
    if (motif) {
      throw new BadRequestException(`L'OD analytique ne se passe ni ne se retire à cette date : ${motif}.`);
    }
  }

  /** Cumuls des OD d'un plan sur une fenêtre, section par section. */
  async cumulsParSection(tenantId: string, planId: string, exerciceId: string, du: Date, au: Date) {
    const groupes = await this.prisma.ligneOdAnalytique.groupBy({
      by: ['sectionId'],
      where: { tenantId, od: { tenantId, planId, exerciceId, date: { gte: du, lte: au } } },
      _sum: { debit: true, credit: true },
    });
    return new Map(
      groupes.map((g) => [g.sectionId, { debit: Number(g._sum.debit ?? 0), credit: Number(g._sum.credit ?? 0) }]),
    );
  }
}

import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { StatutExercice } from '@prisma/client';
import { CreerEcritureDto } from './dto/creer-ecriture.dto';
import { JournalService } from '../journaux/journal.service';

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

    const date = new Date(dto.date);
    const numeroPiece = await this.journalService.prochainNumeroPiece(tenantId, journal, dto.exerciceId, date);

    return this.prisma.ecriture.create({
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
          })),
        },
      },
      include: { lignes: true, journal: true },
    });
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
      include: { lignes: { include: { compte: true } }, journal: true },
      orderBy: { date: 'asc' },
    });

    const totalDebit = ecritures.reduce((s, e) => s + e.lignes.reduce((s2, l) => s2 + Number(l.debit), 0), 0);
    const totalCredit = ecritures.reduce((s, e) => s + e.lignes.reduce((s2, l) => s2 + Number(l.credit), 0), 0);
    return { ecritures, totaux: { debit: totalDebit, credit: totalCredit } };
  }

  /** Grand livre d'un compte : ses lignes avec solde progressif. */
  async grandLivre(tenantId: string, compteId: string, exerciceId?: string) {
    const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
    if (!compte) {
      throw new BadRequestException('Compte introuvable pour ce tenant');
    }

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        compteId,
        ecriture: { tenantId, ...(exerciceId ? { exerciceId } : {}) },
      },
      include: { ecriture: { include: { journal: true } } },
      orderBy: { ecriture: { date: 'asc' } },
    });

    let solde = 0;
    const lignesAvecSolde = lignes.map((l) => {
      solde += Number(l.debit) - Number(l.credit);
      return {
        date: l.ecriture.date,
        journalCode: l.ecriture.journal.code,
        libelle: l.libelle ?? l.ecriture.libelle,
        reference: l.ecriture.reference,
        debit: Number(l.debit),
        credit: Number(l.credit),
        soldeProgressif: solde,
      };
    });

    return { compte, lignes: lignesAvecSolde, soldeFinal: solde };
  }

  /** Balance : solde débit/crédit cumulé par compte sur l'exercice. */
  async balance(tenantId: string, exerciceId: string) {
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId },
      orderBy: { numero: 'asc' },
      include: {
        lignesEcriture: { where: { ecriture: { tenantId, exerciceId } } },
      },
    });

    const lignesBalance = comptes
      .map((c) => {
        const totalDebit = c.lignesEcriture.reduce((s, l) => s + Number(l.debit), 0);
        const totalCredit = c.lignesEcriture.reduce((s, l) => s + Number(l.credit), 0);
        return {
          compteId: c.id,
          numero: c.numero,
          intitule: c.intitule,
          classe: c.classe,
          totalDebit,
          totalCredit,
          solde: totalDebit - totalCredit,
        };
      })
      .filter((l) => l.totalDebit !== 0 || l.totalCredit !== 0);

    return {
      lignes: lignesBalance,
      totaux: {
        debit: lignesBalance.reduce((s, l) => s + l.totalDebit, 0),
        credit: lignesBalance.reduce((s, l) => s + l.totalCredit, 0),
      },
    };
  }
}

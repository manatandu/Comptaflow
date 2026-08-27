import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { StatutExercice } from '@prisma/client';
import { CreerEcritureDto } from './dto/creer-ecriture.dto';

/**
 * Règle non négociable du moteur comptable : une écriture n'existe que si
 * total(débit) === total(crédit), et un exercice clôturé n'accepte plus
 * aucune écriture (piste d'audit + intégrité légale). Ces deux contrôles
 * vivent ici, pas côté client, pour rester valables quel que soit le canal
 * d'entrée (UI web, import CSV, API partenaire...).
 */
@Injectable()
export class EcritureService {
  constructor(private readonly prisma: PrismaService) {}

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

    const totalDebit = dto.lignes.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = dto.lignes.reduce((s, l) => s + (l.credit ?? 0), 0);
    if (dto.lignes.length < 2 || Math.abs(totalDebit - totalCredit) > 0.005) {
      throw new BadRequestException(
        `Écriture déséquilibrée : débit=${totalDebit} crédit=${totalCredit}`,
      );
    }

    return this.prisma.ecriture.create({
      data: {
        tenantId,
        exerciceId: dto.exerciceId,
        journalCode: dto.journalCode,
        date: new Date(dto.date),
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
      include: { lignes: true },
    });
  }
}

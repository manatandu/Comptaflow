import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { LotVirementDto } from './lots-virement.dto';
import { motifRefusLot } from './lots-virement';

/** Lots de virements récurrents · règles dans lots-virement.ts. */
@Injectable()
export class LotsVirementService {
  constructor(private readonly prisma: PrismaService) {}

  lister(tenantId: string) {
    return this.prisma.lotVirement
      .findMany({
        where: { tenantId },
        orderBy: { nom: 'asc' },
        include: {
          lignes: {
            where: { tenantId },
            orderBy: { ordre: 'asc' },
            include: { compte: { select: { numero: true, intitule: true } } },
          },
        },
      })
      .then((lots) =>
        lots.map((l) => ({
          id: l.id,
          nom: l.nom,
          journalId: l.journalId,
          lignes: l.lignes.map((x) => ({
            compteId: x.compteId,
            numero: x.compte.numero,
            intitule: x.compte.intitule,
            montant: Number(x.montant),
          })),
        })),
      );
  }

  private async verifier(tenantId: string, dto: LotVirementDto) {
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId, id: { in: dto.lignes.map((l) => l.compteId) } },
      select: { id: true, numero: true, typeCompte: true },
    });
    const refus = motifRefusLot(dto.nom, dto.lignes, comptes);
    if (refus) throw new BadRequestException(refus);
    if (dto.journalId) {
      const j = await this.prisma.journal.findFirst({ where: { id: dto.journalId, tenantId }, select: { type: true } });
      if (!j) throw new NotFoundException('Journal introuvable dans ce dossier.');
      if (j.type !== 'TRESORERIE') throw new BadRequestException('Un virement se passe dans un journal de trésorerie.');
    }
  }

  private lignes(tenantId: string, dto: LotVirementDto) {
    return dto.lignes.map((l, i) => ({ tenantId, compteId: l.compteId, montant: new Prisma.Decimal(l.montant), ordre: i + 1 }));
  }

  private conflit(e: unknown, nom: string): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException(`Un lot « ${nom.trim()} » existe déjà.`);
    }
    throw e;
  }

  async creer(tenantId: string, auteur: string, dto: LotVirementDto) {
    await this.verifier(tenantId, dto);
    try {
      return await this.prisma.lotVirement.create({
        data: { tenantId, nom: dto.nom.trim(), journalId: dto.journalId ?? null, creePar: auteur, lignes: { create: this.lignes(tenantId, dto) } },
      });
    } catch (e) {
      this.conflit(e, dto.nom);
    }
  }

  /** Les lignes sont REMPLACÉES · un lot se relit tel qu'il a été enregistré en dernier. */
  async modifier(tenantId: string, id: string, dto: LotVirementDto) {
    const lot = await this.prisma.lotVirement.findFirst({ where: { id, tenantId } });
    if (!lot) throw new NotFoundException('Lot introuvable dans ce dossier.');
    await this.verifier(tenantId, dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.ligneLotVirement.deleteMany({ where: { tenantId, lotId: lot.id } });
        return tx.lotVirement.update({
          where: { id: lot.id },
          data: { nom: dto.nom.trim(), journalId: dto.journalId ?? null, lignes: { create: this.lignes(tenantId, dto) } },
        });
      });
    } catch (e) {
      this.conflit(e, dto.nom);
    }
  }

  async supprimer(tenantId: string, id: string) {
    const lot = await this.prisma.lotVirement.findFirst({ where: { id, tenantId } });
    if (!lot) throw new NotFoundException('Lot introuvable dans ce dossier.');
    await this.prisma.lotVirement.delete({ where: { id: lot.id } });
    return { supprime: true };
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ClasseCompte, Prisma } from '@prisma/client';
import { PLAN_COMPTES_SYCEBNL } from './compte-seed';
import { CreerCompteDto, ModifierCompteDto } from './dto/creer-compte.dto';

@Injectable()
export class CompteService {
  constructor(private readonly prisma: PrismaService) {}

  /** Appelé une fois à la création du tenant (voir AuthService.register). */
  async seedPlanSycebnl(tenantId: string) {
    await this.prisma.compte.createMany({
      data: PLAN_COMPTES_SYCEBNL.map((c) => ({ ...c, tenantId })),
      skipDuplicates: true,
    });
  }

  async lister(tenantId: string, filtres: { classe?: ClasseCompte; recherche?: string; actifsSeuls?: boolean }) {
    const where: Prisma.CompteWhereInput = {
      tenantId,
      ...(filtres.classe ? { classe: filtres.classe } : {}),
      ...(filtres.actifsSeuls ? { estActif: true } : {}),
      ...(filtres.recherche
        ? {
            OR: [
              { numero: { contains: filtres.recherche } },
              { intitule: { contains: filtres.recherche, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.prisma.compte.findMany({ where, orderBy: { numero: 'asc' } });
  }

  async creer(tenantId: string, dto: CreerCompteDto) {
    const existant = await this.prisma.compte.findUnique({
      where: { tenantId_numero: { tenantId, numero: dto.numero } },
    });
    if (existant) {
      throw new ConflictException(`Le compte ${dto.numero} existe déjà pour ce tenant`);
    }
    return this.prisma.compte.create({ data: { ...dto, tenantId } });
  }

  async modifier(tenantId: string, compteId: string, dto: ModifierCompteDto) {
    const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
    if (!compte) {
      throw new NotFoundException('Compte introuvable pour ce tenant');
    }
    return this.prisma.compte.update({ where: { id: compteId }, data: dto });
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreerBailleurDto, ModifierBailleurDto } from './dto/bailleur.dto';

/**
 * Bailleur (ou sous-projet) · regroupe les sous-comptes 162-164/462-464
 * qui lui sont propres (voir Compte.bailleurId, prisma/schema.prisma). CRUD
 * volontairement minimal, sur le même modèle que TiersService : ce module
 * ne fait que nommer un groupe de comptes, la substance (rattachement des
 * comptes, calcul de la Note 9) vit ailleurs (CompteService.modifier,
 * EtatsFinanciersProjetService.noteBailleur).
 */
@Injectable()
export class BailleurService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(tenantId: string, actifsSeuls = false) {
    return this.prisma.bailleur.findMany({
      where: { tenantId, ...(actifsSeuls ? { estActif: true } : {}) },
      orderBy: { code: 'asc' },
    });
  }

  async creer(tenantId: string, dto: CreerBailleurDto) {
    const existant = await this.prisma.bailleur.findUnique({
      where: { tenantId_code: { tenantId, code: dto.code } },
    });
    if (existant) {
      throw new ConflictException(`Un bailleur porte déjà le code "${dto.code}" pour ce tenant`);
    }
    return this.prisma.bailleur.create({ data: { ...dto, tenantId } });
  }

  async modifier(tenantId: string, bailleurId: string, dto: ModifierBailleurDto) {
    const bailleur = await this.prisma.bailleur.findFirst({ where: { id: bailleurId, tenantId } });
    if (!bailleur) {
      throw new NotFoundException('Bailleur introuvable pour ce tenant');
    }
    return this.prisma.bailleur.update({ where: { id: bailleurId }, data: dto });
  }
}

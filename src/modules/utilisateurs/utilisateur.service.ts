import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma.service';
import { CreerUtilisateurDto, ModifierUtilisateurDto } from './dto/utilisateur.dto';

const SALT_ROUNDS = 12;

// Champs exposés côté API · motDePasse (haché) n'en fait jamais partie.
const SELECTION = { id: true, email: true, role: true, estActif: true, createdAt: true } as const;

@Injectable()
export class UtilisateurService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(tenantId: string) {
    return this.prisma.user.findMany({ where: { tenantId }, select: SELECTION, orderBy: { createdAt: 'asc' } });
  }

  async creer(tenantId: string, dto: CreerUtilisateurDto) {
    const existant = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existant) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }
    const motDePasseHache = await bcrypt.hash(dto.motDePasse, SALT_ROUNDS);
    return this.prisma.user.create({
      data: { tenantId, email: dto.email, motDePasse: motDePasseHache, role: dto.role },
      select: SELECTION,
    });
  }

  async modifier(tenantId: string, userId: string, utilisateurCourantId: string, dto: ModifierUtilisateurDto) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable pour ce tenant');
    }
    if (userId === utilisateurCourantId && dto.estActif === false) {
      throw new BadRequestException('Impossible de désactiver son propre compte');
    }
    return this.prisma.user.update({ where: { id: userId }, data: dto, select: SELECTION });
  }
}

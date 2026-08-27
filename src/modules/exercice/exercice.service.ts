import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { StatutExercice } from '@prisma/client';
import { CreerExerciceDto } from './dto/creer-exercice.dto';

@Injectable()
export class ExerciceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crée l'exercice de l'année en cours à l'inscription du tenant (1er janvier → 31 décembre). */
  async creerExerciceCourant(tenantId: string) {
    const annee = new Date().getFullYear();
    return this.prisma.exercice.create({
      data: {
        tenantId,
        dateDebut: new Date(Date.UTC(annee, 0, 1)),
        dateFin: new Date(Date.UTC(annee, 11, 31)),
      },
    });
  }

  async lister(tenantId: string) {
    return this.prisma.exercice.findMany({ where: { tenantId }, orderBy: { dateDebut: 'desc' } });
  }

  async creer(tenantId: string, dto: CreerExerciceDto) {
    const dateDebut = new Date(dto.dateDebut);
    const dateFin = new Date(dto.dateFin);
    if (dateFin <= dateDebut) {
      throw new BadRequestException("La date de fin doit être postérieure à la date de début");
    }
    return this.prisma.exercice.create({ data: { tenantId, dateDebut, dateFin } });
  }

  async cloturer(tenantId: string, exerciceId: string) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!exercice) {
      throw new NotFoundException('Exercice introuvable pour ce tenant');
    }
    if (exercice.statut === StatutExercice.CLOTURE) {
      throw new ForbiddenException('Cet exercice est déjà clôturé');
    }
    return this.prisma.exercice.update({ where: { id: exerciceId }, data: { statut: StatutExercice.CLOTURE } });
  }
}

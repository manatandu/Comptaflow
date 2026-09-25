import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { EtatPersonnaliseDto } from './dto/etat-personnalise.dto';
import { calculerColonne, LigneDefinition, motifRefusDefinition, PLAFOND_EXERCICES } from './moteur-etat-personnalise';

/**
 * ÉTATS PERSONNALISÉS · définitions enregistrées, calculées à la demande sur
 * la balance de chaque exercice choisi (`EcritureService.balance`, la même que
 * la balance générale) · aucun chiffre n'est stocké, un état se recalcule
 * toujours sur les livres du moment.
 */
@Injectable()
export class EtatsPersonnalisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
  ) {}

  lister(tenantId: string) {
    return this.prisma.etatPersonnalise.findMany({ where: { tenantId }, orderBy: { nom: 'asc' } });
  }

  private verifier(dto: EtatPersonnaliseDto): LigneDefinition[] {
    const lignes = dto.lignes.map((l) => ({
      cle: l.cle.trim().toUpperCase(),
      libelle: l.libelle.trim(),
      racines: l.racines?.trim() || undefined,
      mesure: l.mesure,
      sens: l.sens,
      total: l.total?.trim().toUpperCase() || undefined,
    }));
    const motif = motifRefusDefinition(lignes);
    if (motif) throw new BadRequestException(motif);
    return lignes;
  }

  private async doublon<T>(p: Promise<T>, nom: string): Promise<T> {
    try {
      return await p;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Un état « ${nom} » existe déjà dans ce dossier.`);
      }
      throw e;
    }
  }

  creer(tenantId: string, dto: EtatPersonnaliseDto) {
    const lignes = this.verifier(dto);
    return this.doublon(
      this.prisma.etatPersonnalise.create({ data: { tenantId, nom: dto.nom.trim(), lignes: lignes as unknown as Prisma.InputJsonValue } }),
      dto.nom.trim(),
    );
  }

  async modifier(tenantId: string, id: string, dto: EtatPersonnaliseDto) {
    await this.lire(tenantId, id);
    const lignes = this.verifier(dto);
    return this.doublon(
      this.prisma.etatPersonnalise.update({ where: { id }, data: { nom: dto.nom.trim(), lignes: lignes as unknown as Prisma.InputJsonValue } }),
      dto.nom.trim(),
    );
  }

  async supprimer(tenantId: string, id: string) {
    await this.lire(tenantId, id);
    await this.prisma.etatPersonnalise.delete({ where: { id } });
    return { supprime: true };
  }

  private async lire(tenantId: string, id: string) {
    const e = await this.prisma.etatPersonnalise.findFirst({ where: { id, tenantId } });
    if (!e) throw new NotFoundException('État introuvable');
    return e;
  }

  /**
   * Une colonne par exercice, dans l'ordre chronologique · jusqu'à cinq,
   * comme l'historique de l'Édition pilotée. La définition est REVÉRIFIÉE ·
   * enregistrée avant un correctif de la règle, elle ne doit pas se calculer
   * sur une lecture que la porte refuse aujourd'hui.
   */
  async calculer(tenantId: string, id: string, exerciceIds: string[], inclureBrouillard: boolean) {
    const etat = await this.lire(tenantId, id);
    const lignes = etat.lignes as unknown as LigneDefinition[];
    const motif = motifRefusDefinition(lignes);
    if (motif) throw new BadRequestException(`Définition à corriger · ${motif}`);
    const ids = [...new Set(exerciceIds)].filter(Boolean);
    if (ids.length === 0) throw new BadRequestException('Choisissez au moins un exercice.');
    if (ids.length > PLAFOND_EXERCICES) throw new BadRequestException(`Au plus ${PLAFOND_EXERCICES} exercices côte à côte.`);
    const exercices = await this.prisma.exercice.findMany({
      where: { tenantId, id: { in: ids } },
      orderBy: { dateDebut: 'asc' },
      select: { id: true, dateDebut: true, dateFin: true },
    });
    if (exercices.length !== ids.length) throw new NotFoundException('Exercice introuvable dans ce dossier.');
    const colonnes = await Promise.all(
      exercices.map(async (ex) => ({
        exerciceId: ex.id,
        dateDebut: ex.dateDebut,
        dateFin: ex.dateFin,
        valeurs: calculerColonne(lignes, (await this.ecritures.balance(tenantId, ex.id, inclureBrouillard)).lignes),
      })),
    );
    return { etat: { id: etat.id, nom: etat.nom, lignes }, inclureBrouillard, colonnes };
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { chargerLignes } from '../etats-financiers/etats-financiers.communs';
import { ActiviteIfrsDto, RegleIfrsDto, RetraitementIfrsDto } from './dto/ifrs.dto';
import { construireEtatsIfrs, EtatsIfrs, LIBELLES_GROUPES, motifRefusRetraitement, RefusIfrs, RetraitementDeclare } from './etats-ifrs';
import { motifRefusRegle, RUBRIQUES_IFRS } from './rubriques-ifrs';

/**
 * ÉTATS IFRS EN SUS DU JEU LÉGAL · item 15, tranche 1. Le grand livre est lu
 * comme par les états légaux (`chargerLignes`, livre-journal seul), et rien
 * n'y est écrit · les règles et les retraitements vivent dans leurs tables.
 *
 * LE COMPARATIF est un second calcul sur l'exercice précédent, avec SES
 * retraitements et les mêmes règles · sans exercice précédent, la colonne est
 * vide et non nulle.
 */
@Injectable()
export class IfrsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
  ) {}

  private async exercice(tenantId: string, exerciceId: string) {
    const ex = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId }, select: { id: true, dateDebut: true, dateFin: true } });
    if (!ex) throw new NotFoundException('Exercice introuvable dans ce dossier.');
    return ex;
  }

  private async retraitementsDe(tenantId: string, exerciceId: string) {
    const rs = await this.prisma.retraitementIfrs.findMany({
      where: { tenantId, exerciceId },
      include: { lignes: { orderBy: { ordre: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return rs.map((r) => ({ ...r, lignes: r.lignes.map((l) => ({ ...l, montant: Number(l.montant) })) }));
  }

  private async calculer(
    tenantId: string,
    ex: { id: string; dateDebut: Date },
    regles: { prefixe: string; rubrique: string }[],
    activite: ActiviteIfrsDto['activitePrincipale'],
  ): Promise<EtatsIfrs> {
    const lignes = await chargerLignes(this.ecritures, tenantId, ex.id);
    const retraitements: RetraitementDeclare[] = (await this.retraitementsDe(tenantId, ex.id)).map((r) => ({
      id: r.id,
      libelle: r.libelle,
      fondement: r.fondement,
      lignes: r.lignes.map((l) => ({ rubrique: l.rubrique, montant: l.montant })),
    }));
    try {
      return construireEtatsIfrs(
        { dateDebut: ex.dateDebut },
        lignes.map((l) => ({ numero: l.numero, intitule: l.intitule, solde: Number(l.solde) })),
        regles,
        retraitements,
        activite ?? null,
      );
    } catch (e) {
      if (e instanceof RefusIfrs) throw new BadRequestException(e.message);
      throw e;
    }
  }

  async etat(tenantId: string, exerciceId: string) {
    const ex = await this.exercice(tenantId, exerciceId);
    const [parametres, regles, retraitements] = await Promise.all([
      this.prisma.parametresIfrs.findUnique({ where: { tenantId } }),
      this.prisma.regleCorrespondanceIfrs.findMany({ where: { tenantId }, orderBy: { prefixe: 'asc' } }),
      this.retraitementsDe(tenantId, ex.id),
    ]);
    const activite = parametres?.activitePrincipale ?? null;
    const r = regles.map((x) => ({ prefixe: x.prefixe, rubrique: x.rubrique }));
    const n = await this.calculer(tenantId, ex, r, activite);
    const precedent = await this.prisma.exercice.findFirst({
      where: { tenantId, dateFin: { lt: ex.dateDebut } },
      orderBy: { dateFin: 'desc' },
      select: { id: true, dateDebut: true },
    });
    let n1: EtatsIfrs | null = null;
    let motifN1: string | null = null;
    if (!precedent) motifN1 = 'Aucun exercice précédent dans le dossier · la colonne comparative est vide.';
    else {
      try {
        n1 = await this.calculer(tenantId, precedent, r, activite);
      } catch (e) {
        motifN1 = `Le comparatif ne s’établit pas · ${(e as Error).message}`;
      }
    }
    return {
      activitePrincipale: activite,
      regles,
      retraitements,
      rubriques: RUBRIQUES_IFRS,
      groupes: LIBELLES_GROUPES,
      n,
      n1,
      motifN1,
    };
  }

  async declarerActivite(tenantId: string, dto: ActiviteIfrsDto) {
    const activitePrincipale = dto.activitePrincipale ?? null;
    return this.prisma.parametresIfrs.upsert({ where: { tenantId }, create: { tenantId, activitePrincipale }, update: { activitePrincipale } });
  }

  async ajouterRegle(tenantId: string, dto: RegleIfrsDto) {
    const prefixe = dto.prefixe.trim();
    const motif = motifRefusRegle(prefixe, dto.rubrique);
    if (motif) throw new BadRequestException(motif);
    try {
      return await this.prisma.regleCorrespondanceIfrs.create({ data: { tenantId, prefixe, rubrique: dto.rubrique } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Une règle existe déjà pour le préfixe ${prefixe} · retirez-la avant d’en poser une autre.`);
      }
      throw e;
    }
  }

  async supprimerRegle(tenantId: string, id: string) {
    const r = await this.prisma.regleCorrespondanceIfrs.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!r) throw new NotFoundException('Règle introuvable dans ce dossier.');
    await this.prisma.regleCorrespondanceIfrs.delete({ where: { id } });
    return { supprime: true };
  }

  async ajouterRetraitement(tenantId: string, dto: RetraitementIfrsDto) {
    const ex = await this.exercice(tenantId, dto.exerciceId);
    const motif = motifRefusRetraitement({ libelle: dto.libelle, fondement: dto.fondement, lignes: dto.lignes });
    if (motif) throw new BadRequestException(motif);
    return this.prisma.retraitementIfrs.create({
      data: {
        tenantId,
        exerciceId: ex.id,
        libelle: dto.libelle.trim(),
        fondement: dto.fondement.trim(),
        lignes: { create: dto.lignes.map((l, i) => ({ tenantId, ordre: i + 1, rubrique: l.rubrique, montant: l.montant })) },
      },
      include: { lignes: true },
    });
  }

  async supprimerRetraitement(tenantId: string, id: string) {
    const r = await this.prisma.retraitementIfrs.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!r) throw new NotFoundException('Retraitement introuvable dans ce dossier.');
    await this.prisma.retraitementIfrs.delete({ where: { id } });
    return { supprime: true };
  }
}

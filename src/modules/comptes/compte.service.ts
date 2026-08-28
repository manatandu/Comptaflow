import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ClasseCompte, Prisma, TypeCompteDetailTotal } from '@prisma/client';
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

  async lister(
    tenantId: string,
    filtres: { classe?: ClasseCompte; recherche?: string; actifsSeuls?: boolean; typeCompte?: TypeCompteDetailTotal },
  ) {
    const where: Prisma.CompteWhereInput = {
      tenantId,
      ...(filtres.classe ? { classe: filtres.classe } : {}),
      ...(filtres.actifsSeuls ? { estActif: true } : {}),
      ...(filtres.typeCompte ? { typeCompte: filtres.typeCompte } : {}),
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
    // Longueur maximale du numéro de compte — paramètre par dossier (§ voir
    // Tenant.longueurCompte dans le schéma), pas une constante globale : le
    // DTO ne valide qu'un format générique (3-13 chiffres, plage Sage), la
    // borne réelle du dossier se vérifie ici.
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (dto.numero.length > tenant.longueurCompte) {
      throw new BadRequestException(
        `Le numéro de compte "${dto.numero}" dépasse la longueur autorisée pour ce dossier (${tenant.longueurCompte} chiffres) — voir Structure > Paramètres du dossier.`,
      );
    }
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
    // Un compte Total (regroupement par racine, §3.1) ne peut jamais avoir
    // reçu d'écriture directement — voir EcritureService.creer(). Basculer
    // un compte déjà mouvementé en Total laisserait ces mouvements orphelins
    // d'une comptabilisation cohérente (ils resteraient dans le solde agrégé
    // sans qu'on puisse plus jamais les corriger par une contre-écriture sur
    // ce même compte).
    if (dto.typeCompte === TypeCompteDetailTotal.TOTAL && compte.typeCompte !== TypeCompteDetailTotal.TOTAL) {
      const aDesMouvements = await this.prisma.ligneEcriture.findFirst({ where: { compteId } });
      if (aDesMouvements) {
        throw new BadRequestException(
          `Le compte ${compte.numero} a déjà des écritures — impossible de le basculer en compte Total`,
        );
      }
    }
    // `null` = détacher explicitement ; une chaîne = doit être un bailleur du
    // même tenant (jamais un simple id accepté sans vérification, sinon un
    // compte pourrait se retrouver rattaché à un bailleur d'un autre dossier).
    if (dto.bailleurId) {
      const bailleur = await this.prisma.bailleur.findFirst({ where: { id: dto.bailleurId, tenantId } });
      if (!bailleur) {
        throw new BadRequestException("Bailleur introuvable pour ce tenant");
      }
    }
    return this.prisma.compte.update({ where: { id: compteId }, data: dto });
  }
}

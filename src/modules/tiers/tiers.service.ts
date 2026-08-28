import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ClasseCompte, Prisma, TypeTiers } from '@prisma/client';
import { CreerTiersDto, ModifierTiersDto, RattacherCompteDto } from './dto/tiers.dto';
import { CreerModeleReglementDto, ModifierModeleReglementDto } from './dto/modele-reglement.dto';

/**
 * Tiers (cf. docs/plan-de-construction.md §3.2) : Client/Fournisseur/Salarié/
 * Autre, avec un ou plusieurs comptes généraux rattachés (dont un Principal)
 * et un modèle de règlement optionnel. Dépend du Lettrage déjà livré — le
 * suivi par tiers n'a de sens que parce que le solde réel (mouvements non
 * lettrés) est calculable.
 */
@Injectable()
export class TiersService {
  constructor(private readonly prisma: PrismaService) {}

  private async trouver(tenantId: string, tiersId: string) {
    const tiers = await this.prisma.tiers.findFirst({
      where: { id: tiersId, tenantId },
      include: {
        modeleReglement: true,
        // orderBy explicite : sans lui, Postgres ne garantit aucun ordre
        // stable, et l'ordre peut visiblement changer après un simple UPDATE
        // (ex. bascule du compte Principal) — repéré en testant le bouton
        // "Détacher" dans l'UI (la ligne visée changeait de position).
        comptesRattaches: { include: { compte: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!tiers) {
      throw new NotFoundException('Tiers introuvable pour ce tenant');
    }
    return tiers;
  }

  async lister(tenantId: string, filtres: { type?: TypeTiers; recherche?: string; actifsSeuls?: boolean }) {
    const where: Prisma.TiersWhereInput = {
      tenantId,
      ...(filtres.type ? { type: filtres.type } : {}),
      ...(filtres.actifsSeuls ? { estActif: true } : {}),
      ...(filtres.recherche
        ? {
            OR: [
              { code: { contains: filtres.recherche, mode: 'insensitive' } },
              { nom: { contains: filtres.recherche, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.prisma.tiers.findMany({
      where,
      include: {
        modeleReglement: true,
        // orderBy explicite : sans lui, Postgres ne garantit aucun ordre
        // stable, et l'ordre peut visiblement changer après un simple UPDATE
        // (ex. bascule du compte Principal) — repéré en testant le bouton
        // "Détacher" dans l'UI (la ligne visée changeait de position).
        comptesRattaches: { include: { compte: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async obtenir(tenantId: string, tiersId: string) {
    return this.trouver(tenantId, tiersId);
  }

  async creer(tenantId: string, dto: CreerTiersDto) {
    const existant = await this.prisma.tiers.findUnique({ where: { tenantId_code: { tenantId, code: dto.code } } });
    if (existant) {
      throw new ConflictException(`Le tiers ${dto.code} existe déjà pour ce tenant`);
    }
    if (dto.modeleReglementId) {
      await this.trouverModeleReglement(tenantId, dto.modeleReglementId);
    }
    return this.prisma.tiers.create({ data: { ...dto, tenantId } });
  }

  async modifier(tenantId: string, tiersId: string, dto: ModifierTiersDto) {
    await this.trouver(tenantId, tiersId);
    if (dto.modeleReglementId) {
      await this.trouverModeleReglement(tenantId, dto.modeleReglementId);
    }
    return this.prisma.tiers.update({ where: { id: tiersId }, data: dto });
  }

  /**
   * Rattache un compte à ce tiers. Un compte ne peut être rattaché qu'à un
   * seul tiers à la fois (contrainte @unique sur TiersCompte.compteId — voir
   * schéma) ; s'il est marqué Principal, tout autre compte Principal de ce
   * tiers perd cette marque (un seul Principal à la fois).
   */
  async rattacherCompte(tenantId: string, tiersId: string, dto: RattacherCompteDto) {
    await this.trouver(tenantId, tiersId);
    const compte = await this.prisma.compte.findFirst({ where: { id: dto.compteId, tenantId } });
    if (!compte) {
      throw new NotFoundException('Compte introuvable pour ce tenant');
    }
    if (compte.classe !== ClasseCompte.CLASSE_4) {
      throw new BadRequestException('Seul un compte de classe 4 (Tiers) peut être rattaché à un tiers');
    }
    const dejaRattache = await this.prisma.tiersCompte.findUnique({ where: { compteId: dto.compteId } });
    if (dejaRattache && dejaRattache.tiersId !== tiersId) {
      throw new ConflictException('Ce compte est déjà rattaché à un autre tiers');
    }
    if (dejaRattache) {
      throw new ConflictException('Ce compte est déjà rattaché à ce tiers');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.estPrincipal) {
        await tx.tiersCompte.updateMany({ where: { tiersId }, data: { estPrincipal: false } });
      }
      return tx.tiersCompte.create({
        data: { tiersId, compteId: dto.compteId, estPrincipal: !!dto.estPrincipal },
      });
    });
  }

  async definirComptePrincipal(tenantId: string, tiersId: string, compteId: string) {
    await this.trouver(tenantId, tiersId);
    const rattachement = await this.prisma.tiersCompte.findFirst({ where: { tiersId, compteId } });
    if (!rattachement) {
      throw new NotFoundException("Ce compte n'est pas rattaché à ce tiers");
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.tiersCompte.updateMany({ where: { tiersId }, data: { estPrincipal: false } });
      return tx.tiersCompte.update({ where: { id: rattachement.id }, data: { estPrincipal: true } });
    });
  }

  async detacherCompte(tenantId: string, tiersId: string, compteId: string) {
    await this.trouver(tenantId, tiersId);
    const rattachement = await this.prisma.tiersCompte.findFirst({ where: { tiersId, compteId } });
    if (!rattachement) {
      throw new NotFoundException("Ce compte n'est pas rattaché à ce tiers");
    }
    await this.prisma.tiersCompte.delete({ where: { id: rattachement.id } });
    return { compteId, detache: true };
  }

  // -----------------------------------------------------------------------
  // Modèles de règlement — entité réutilisable entre tiers (§3.2).
  // -----------------------------------------------------------------------

  private async trouverModeleReglement(tenantId: string, id: string) {
    const modele = await this.prisma.modeleReglement.findFirst({ where: { id, tenantId } });
    if (!modele) {
      throw new NotFoundException('Modèle de règlement introuvable pour ce tenant');
    }
    return modele;
  }

  async listerModelesReglement(tenantId: string) {
    return this.prisma.modeleReglement.findMany({ where: { tenantId }, orderBy: { intitule: 'asc' } });
  }

  async creerModeleReglement(tenantId: string, dto: CreerModeleReglementDto) {
    const existant = await this.prisma.modeleReglement.findUnique({
      where: { tenantId_intitule: { tenantId, intitule: dto.intitule } },
    });
    if (existant) {
      throw new ConflictException(`Le modèle de règlement "${dto.intitule}" existe déjà pour ce tenant`);
    }
    return this.prisma.modeleReglement.create({ data: { ...dto, tenantId } });
  }

  async modifierModeleReglement(tenantId: string, id: string, dto: ModifierModeleReglementDto) {
    await this.trouverModeleReglement(tenantId, id);
    return this.prisma.modeleReglement.update({ where: { id }, data: dto });
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreerTauxTvaDto, ModifierTauxTvaDto } from './dto/taux-tva.dto';
import { TAUX_TVA_DEFAUT } from './taux-tva-seed';

/**
 * TVA (cf. docs/plan-de-construction.md §3.1/§5) : entité "Taux" paramétrable,
 * fondée sur l'O.-L. n° 10/001 du 20/08/2010 modifiée par la LF 2026 (skill
 * `fiscalite-rdc/tva`). Portée MVP : référentiel (taux + comptes rattachés
 * 443/445) uniquement — voir le commentaire du modèle TauxTva dans
 * schema.prisma pour ce qui reste hors scope (application aux lignes
 * d'écriture, registre de suivi par taux).
 */
@Injectable()
export class TauxTvaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Appelé une fois à la création du tenant (voir AuthService.register). */
  async seedTauxDefaut(tenantId: string) {
    for (const t of TAUX_TVA_DEFAUT) {
      const compteCollecte = t.numeroCompteCollecte
        ? await this.prisma.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: t.numeroCompteCollecte } } })
        : null;
      const compteDeductible = t.numeroCompteDeductible
        ? await this.prisma.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: t.numeroCompteDeductible } } })
        : null;
      await this.prisma.tauxTva.upsert({
        where: { tenantId_code: { tenantId, code: t.code } },
        update: {},
        create: {
          tenantId,
          code: t.code,
          intitule: t.intitule,
          taux: t.taux,
          compteCollecteId: compteCollecte?.id,
          compteDeductibleId: compteDeductible?.id,
        },
      });
    }
  }

  async lister(tenantId: string, actifsSeuls?: boolean) {
    return this.prisma.tauxTva.findMany({
      where: { tenantId, ...(actifsSeuls ? { estActif: true } : {}) },
      include: { compteCollecte: true, compteDeductible: true },
      orderBy: { taux: 'desc' },
    });
  }

  private async trouver(tenantId: string, id: string) {
    const taux = await this.prisma.tauxTva.findFirst({ where: { id, tenantId } });
    if (!taux) {
      throw new NotFoundException('Taux de TVA introuvable pour ce tenant');
    }
    return taux;
  }

  private async verifierComptes(tenantId: string, dto: { compteCollecteId?: string | null; compteDeductibleId?: string | null }) {
    for (const compteId of [dto.compteCollecteId, dto.compteDeductibleId]) {
      if (!compteId) continue;
      const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
      if (!compte) {
        throw new NotFoundException('Compte introuvable pour ce tenant');
      }
    }
  }

  async creer(tenantId: string, dto: CreerTauxTvaDto) {
    const existant = await this.prisma.tauxTva.findUnique({ where: { tenantId_code: { tenantId, code: dto.code } } });
    if (existant) {
      throw new ConflictException(`Le taux de TVA ${dto.code} existe déjà pour ce tenant`);
    }
    await this.verifierComptes(tenantId, dto);
    return this.prisma.tauxTva.create({ data: { ...dto, tenantId } });
  }

  async modifier(tenantId: string, id: string, dto: ModifierTauxTvaDto) {
    await this.trouver(tenantId, id);
    await this.verifierComptes(tenantId, dto);
    return this.prisma.tauxTva.update({ where: { id }, data: dto });
  }

  /**
   * Registre/déclaration TVA sur une période : pour chaque taux, somme les
   * lignes créditées sur son compte de collecte (443) et les lignes débitées
   * sur son compte de déduction (445), taguées à ce taux (LigneEcriture.
   * tauxTvaId — posé par la saisie guidée "Achat/Vente avec TVA"). Lecture
   * seule : ne comptabilise PAS la liquidation sur le compte 444 (État, TVA
   * due ou crédit de TVA) — poser cette écriture reste une action manuelle
   * de l'utilisateur pour l'instant, comme n'importe quelle écriture. Ne
   * couvre pas le prorata de déduction (art. 43-49 O.-L.).
   */
  async declaration(tenantId: string, dateDebut: Date, dateFin: Date) {
    const taux = await this.prisma.tauxTva.findMany({ where: { tenantId }, orderBy: { taux: 'desc' } });

    const lignes = [];
    for (const t of taux) {
      let totalCollecte = 0;
      let totalDeductible = 0;
      if (t.compteCollecteId) {
        const agg = await this.prisma.ligneEcriture.aggregate({
          where: { tauxTvaId: t.id, compteId: t.compteCollecteId, ecriture: { tenantId, date: { gte: dateDebut, lte: dateFin } } },
          _sum: { credit: true },
        });
        totalCollecte = Number(agg._sum.credit ?? 0);
      }
      if (t.compteDeductibleId) {
        const agg = await this.prisma.ligneEcriture.aggregate({
          where: { tauxTvaId: t.id, compteId: t.compteDeductibleId, ecriture: { tenantId, date: { gte: dateDebut, lte: dateFin } } },
          _sum: { debit: true },
        });
        totalDeductible = Number(agg._sum.debit ?? 0);
      }
      if (totalCollecte === 0 && totalDeductible === 0) continue; // taux sans mouvement sur la période
      lignes.push({
        tauxId: t.id,
        code: t.code,
        intitule: t.intitule,
        taux: Number(t.taux),
        totalCollecte,
        totalDeductible,
        net: totalCollecte - totalDeductible,
      });
    }

    const totalCollecte = lignes.reduce((s, l) => s + l.totalCollecte, 0);
    const totalDeductible = lignes.reduce((s, l) => s + l.totalDeductible, 0);
    const net = totalCollecte - totalDeductible;

    return {
      dateDebut,
      dateFin,
      lignes,
      totalCollecte,
      totalDeductible,
      net,
      sens: net >= 0 ? ('A_PAYER' as const) : ('CREDIT' as const),
    };
  }
}

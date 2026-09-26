import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { normaliserIban } from '../banques/banques';
import { motifRefusRibTiers } from './ribs-tiers';
import { RibTiersDto } from './dto/ribs-tiers.dto';

const nul = (v: string | undefined) => (v === undefined || v.trim() === '' ? null : v.trim());

/**
 * RIB DES TIERS · voir ribs-tiers.ts. Structure du tiers, écrite par
 * l'administrateur comme la fiche elle-même : un RIB modifié en silence
 * détourne un paiement, et c'est pourquoi la table est aussi au journal
 * d'audit.
 */
@Injectable()
export class RibsTiersService {
  constructor(private readonly prisma: PrismaService) {}

  private async tiersDuDossier(tenantId: string, tiersId: string) {
    const tiers = await this.prisma.tiers.findFirst({ where: { id: tiersId, tenantId }, select: { id: true } });
    if (!tiers) throw new NotFoundException('Tiers introuvable pour ce dossier.');
    return tiers;
  }

  private async trouver(tenantId: string, id: string) {
    const rib = await this.prisma.ribTiers.findFirst({ where: { id, tenantId } });
    if (!rib) throw new NotFoundException('RIB introuvable pour ce dossier.');
    return rib;
  }

  private donnees(dto: RibTiersDto) {
    const iban = nul(dto.iban);
    const donnees = {
      banque: dto.banque.trim(),
      titulaire: nul(dto.titulaire),
      codeBanque: nul(dto.codeBanque),
      codeGuichet: nul(dto.codeGuichet),
      numeroCompte: nul(dto.numeroCompte),
      cle: nul(dto.cle),
      iban: iban ? normaliserIban(iban) : null,
      codeBic: nul(dto.codeBic)?.toUpperCase() ?? null,
      devise: nul(dto.devise)?.toUpperCase() ?? null,
      commentaire: nul(dto.commentaire),
    };
    const refus = motifRefusRibTiers(donnees);
    if (refus) throw new BadRequestException(refus);
    return donnees;
  }

  lister(tenantId: string, tiersId: string) {
    return this.tiersDuDossier(tenantId, tiersId).then(() =>
      this.prisma.ribTiers.findMany({
        where: { tenantId, tiersId },
        orderBy: [{ estPrincipal: 'desc' }, { createdAt: 'asc' }],
      }),
    );
  }

  /**
   * UN SEUL RIB PRINCIPAL PAR TIERS, et le premier l'est d'office · un tiers
   * qui n'a qu'un RIB ne doit pas se voir refuser un ordre de virement parce
   * que personne n'a coché la case. Marquer un autre principal retire la
   * marque au précédent, dans la même transaction.
   */
  async creer(tenantId: string, tiersId: string, dto: RibTiersDto) {
    await this.tiersDuDossier(tenantId, tiersId);
    const donnees = this.donnees(dto);
    const existants = await this.prisma.ribTiers.count({ where: { tenantId, tiersId } });
    const principal = existants === 0 || dto.estPrincipal === true;
    return this.prisma.$transaction(async (tx) => {
      if (principal) await tx.ribTiers.updateMany({ where: { tenantId, tiersId }, data: { estPrincipal: false } });
      return tx.ribTiers.create({ data: { ...donnees, tenantId, tiersId, estPrincipal: principal } });
    });
  }

  async modifier(tenantId: string, id: string, dto: RibTiersDto) {
    const rib = await this.trouver(tenantId, id);
    const donnees = this.donnees(dto);
    return this.prisma.$transaction(async (tx) => {
      if (dto.estPrincipal === true && !rib.estPrincipal) {
        await tx.ribTiers.updateMany({ where: { tenantId, tiersId: rib.tiersId }, data: { estPrincipal: false } });
      }
      return tx.ribTiers.update({
        where: { id: rib.id },
        data: { ...donnees, ...(dto.estPrincipal === true ? { estPrincipal: true } : {}) },
      });
    });
  }

  /**
   * Retirer le principal laisse le tiers SANS principal si d'autres RIB
   * restent · en désigner un d'office choisirait le compte où partira le
   * prochain virement, et c'est une décision.
   */
  async supprimer(tenantId: string, id: string) {
    const rib = await this.trouver(tenantId, id);
    await this.prisma.ribTiers.delete({ where: { id: rib.id } });
    return { supprime: true };
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { ModeReportANouveau, NatureCompteType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  Fourchette,
  LIBELLES_NATURE,
  NATURES_PAR_DEFAUT,
  NatureParametree,
  incoherencesDeReport,
  lireFourchettes,
  motifRefusFourchettes,
  natureDe,
} from './natures-compte';

/**
 * Les natures du dossier, posées à la première lecture si le dossier n'en a
 * pas · un dossier créé avant le point 14 les reçoit ainsi sans migration de
 * données, et toujours avec les défauts relus contre les deux semis.
 */
export async function naturesDuDossier(prisma: unknown, tenantId: string): Promise<NatureParametree[]> {
  const client = prisma as {
    natureCompte: {
      findMany: (a: Prisma.NatureCompteFindManyArgs) => Promise<Array<{ nature: NatureCompteType; fourchettes: unknown; modeReportANouveau: ModeReportANouveau; lettrable: boolean }>>;
      createMany: (a: Prisma.NatureCompteCreateManyArgs) => Promise<unknown>;
    };
  };
  let lignes = await client.natureCompte.findMany({ where: { tenantId } });
  const manquantes = NATURES_PAR_DEFAUT.filter((d) => !lignes.some((l) => l.nature === d.nature));
  if (manquantes.length > 0) {
    await client.natureCompte.createMany({
      data: manquantes.map((d) => ({
        tenantId,
        nature: d.nature,
        fourchettes: d.fourchettes as unknown as Prisma.InputJsonValue,
        modeReportANouveau: d.modeReportANouveau,
        lettrable: d.lettrable,
      })),
      skipDuplicates: true,
    });
    lignes = await client.natureCompte.findMany({ where: { tenantId } });
  }
  const ordre = NATURES_PAR_DEFAUT.map((d) => d.nature);
  return lignes
    .map((l) => ({ nature: l.nature, fourchettes: lireFourchettes(l.fourchettes), modeReportANouveau: l.modeReportANouveau, lettrable: l.lettrable }))
    .sort((a, b) => ordre.indexOf(a.nature) - ordre.indexOf(b.nature));
}

@Injectable()
export class NaturesCompteService {
  constructor(private readonly prisma: PrismaService) {}

  /** Les natures, et les comptes dont le report contredit leur nature. */
  async lister(tenantId: string) {
    const natures = await naturesDuDossier(this.prisma, tenantId);
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId },
      select: { id: true, numero: true, intitule: true, typeCompte: true, modeReportANouveau: true },
      orderBy: { numero: 'asc' },
    });
    return {
      natures: natures.map((n) => ({ ...n, libelle: LIBELLES_NATURE[n.nature] })),
      incoherences: incoherencesDeReport(comptes, natures),
    };
  }

  async modifier(
    tenantId: string,
    nature: NatureCompteType,
    dto: { fourchettes?: Fourchette[]; modeReportANouveau?: ModeReportANouveau; lettrable?: boolean },
  ) {
    if (!Object.values(NatureCompteType).includes(nature)) throw new BadRequestException('Nature de compte inconnue.');
    const natures = await naturesDuDossier(this.prisma, tenantId);
    if (dto.fourchettes) {
      const fourchettes = dto.fourchettes.map((f) => ({ du: String(f.du ?? '').trim(), au: String(f.au ?? '').trim() }));
      const refus = motifRefusFourchettes(nature, fourchettes, natures);
      if (refus) throw new BadRequestException(refus);
      dto = { ...dto, fourchettes };
    }
    await this.prisma.natureCompte.update({
      where: { tenantId_nature: { tenantId, nature } },
      data: {
        ...(dto.fourchettes ? { fourchettes: dto.fourchettes as unknown as Prisma.InputJsonValue } : {}),
        ...(dto.modeReportANouveau ? { modeReportANouveau: dto.modeReportANouveau } : {}),
        ...(dto.lettrable !== undefined ? { lettrable: dto.lettrable } : {}),
      },
    });
    return this.lister(tenantId);
  }

  /**
   * RÉTABLIT le mode de report de la nature sur les comptes qui le
   * contredisent · l'option « rétablissement automatique du code » de Sage,
   * mais demandée, jamais passée d'office à la clôture. Le mode ne commande que
   * les à-nouveaux à venir : aucune écriture passée ne bouge.
   */
  async aligner(tenantId: string, compteIds?: string[]) {
    const { incoherences } = await this.lister(tenantId);
    const cibles = incoherences.filter((c) => !compteIds || compteIds.includes(c.id));
    for (const c of cibles) {
      await this.prisma.compte.update({ where: { id: c.id }, data: { modeReportANouveau: c.modeAttendu } });
    }
    return { alignes: cibles.length, ...(await this.lister(tenantId)) };
  }

  /** La nature d'un numéro · pour la fiche compte et la création. */
  async natureDuNumero(tenantId: string, numero: string) {
    return natureDe(numero, await naturesDuDossier(this.prisma, tenantId));
  }
}

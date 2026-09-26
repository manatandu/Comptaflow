import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatutBulletinPaie } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { VersionBaremePaieDto } from './dto/personnel.dto';
import { RESERVE_BAREME_CABINET } from './cotisations-paie';
import {
  BAREMES_SERVIS,
  lireValeurs,
  moisCouverts,
  motifRefusVersion,
  versionsLivrees,
  type NomBareme,
} from './baremes-dossier';

/**
 * BARÈMES DE PAIE DATÉS · les versions que le cabinet ajoute aux textes
 * livrés. Règles et sources dans baremes-dossier.ts.
 */
@Injectable()
export class BaremesPaieService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(tenantId: string) {
    const dossier = await this.prisma.versionBaremePaie.findMany({
      where: { tenantId },
      orderBy: [{ bareme: 'asc' }, { aPartirDu: 'asc' }],
    });
    return {
      baremes: BAREMES_SERVIS,
      livrees: versionsLivrees(),
      dossier: dossier.map((v) => ({
        id: v.id,
        bareme: v.bareme,
        aPartirDu: v.aPartirDu,
        reference: v.reference,
        valeurs: v.valeurs,
        saisiPar: v.saisiPar,
        createdAt: v.createdAt,
      })),
      reserve: RESERVE_BAREME_CABINET,
    };
  }

  /**
   * Les bulletins ÉMIS d'un mois couvert par une version. Ils sont figés et ne
   * bougent pas · mais ils ont été calculés sans elle (ajout) ou avec elle
   * (retrait), et c'est au cabinet de décider s'il les annule et les réémet.
   */
  private bulletinsCouverts(tenantId: string, depuis: string, avant: string | null) {
    return this.prisma.bulletinPaie.findMany({
      where: {
        tenantId,
        statut: StatutBulletinPaie.EMIS,
        moisDePaie: { gte: depuis, ...(avant ? { lt: avant } : {}) },
      },
      select: { numero: true, moisDePaie: true },
      orderBy: { numero: 'asc' },
    });
  }

  /**
   * UN BULLETIN DÉJÀ ÉMIS SUR LA PÉRIODE N'EMPÊCHE PAS L'AJOUT · un texte peut
   * mordre à sa signature et n'être connu du cabinet que des semaines plus
   * tard (l'arrêté ONEM de 2025 en est un). Refuser l'ajout laisserait calculer
   * les mois suivants au taux abrogé. Les bulletins concernés sont RENDUS avec
   * la réponse, pour que la régularisation soit une décision et non un oubli.
   */
  async ajouter(tenantId: string, auteur: string, dto: VersionBaremePaieDto) {
    const existantes = await this.prisma.versionBaremePaie.findMany({
      where: { tenantId, bareme: dto.bareme },
      select: { aPartirDu: true },
    });
    const refus = motifRefusVersion(dto, existantes.map((e) => e.aPartirDu));
    if (refus) throw new BadRequestException(refus);
    const lecture = lireValeurs(dto.bareme as NomBareme, dto.valeurs);
    if (!lecture.ok) throw new BadRequestException(lecture.motif);
    let version;
    try {
      version = await this.prisma.versionBaremePaie.create({
        data: {
          tenantId,
          bareme: dto.bareme,
          aPartirDu: dto.aPartirDu,
          reference: dto.reference.trim(),
          valeurs: lecture.valeurs as Prisma.InputJsonValue,
          saisiPar: auteur,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Une version ${dto.bareme} du ${dto.aPartirDu} existe déjà.`);
      }
      throw e;
    }
    const { depuis } = moisCouverts(dto.aPartirDu, null);
    const bulletinsDejaEmis = await this.bulletinsCouverts(tenantId, depuis, null);
    return { version, bulletinsDejaEmis };
  }

  /**
   * UN RETRAIT NE DOIT PAS FAIRE MENTIR UN BULLETIN · si un bulletin émis
   * porte un mois que la version couvre, il a pu être calculé avec elle, et
   * son taux ne se relirait plus nulle part. Le retrait est refusé tant que
   * ces bulletins ne sont pas annulés.
   */
  async supprimer(tenantId: string, id: string) {
    const v = await this.prisma.versionBaremePaie.findFirst({ where: { id, tenantId } });
    if (!v) throw new NotFoundException('Version de barème introuvable dans ce dossier.');
    const suivante = await this.prisma.versionBaremePaie.findFirst({
      where: { tenantId, bareme: v.bareme, aPartirDu: { gt: v.aPartirDu } },
      orderBy: { aPartirDu: 'asc' },
      select: { aPartirDu: true },
    });
    const { depuis, avant } = moisCouverts(v.aPartirDu, suivante?.aPartirDu ?? null);
    const emis = await this.bulletinsCouverts(tenantId, depuis, avant);
    if (emis.length) {
      const liste = emis.slice(0, 5).map((b) => `n° ${b.numero} (${b.moisDePaie})`).join(', ');
      throw new BadRequestException(
        `${emis.length} bulletin(s) émis sur la période de cette version (${liste}${emis.length > 5 ? ', …' : ''}) ont pu être calculés avec elle · ` +
          'annulez-les avant de la retirer, sans quoi leur taux ne se relirait plus nulle part.',
      );
    }
    await this.prisma.versionBaremePaie.delete({ where: { id: v.id } });
    return { supprime: true };
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { refuserBailleurHorsSycebnl } from '../../common/bailleur-referentiel';
import { ClasseCompte, Prisma, Referentiel, TypeCompteDetailTotal } from '@prisma/client';
import { PLAN_COMPTES_SYCEBNL } from './compte-seed';
import { PLAN_COMPTES_SYSCOHADA } from './compte-seed-syscohada';
import { CreerCompteDto, ModifierCompteDto } from './dto/creer-compte.dto';

/**
 * Comptes ouverts au lettrage à la création d'un dossier.
 *
 * CPCC, Notes de cours d'organisation comptable, ch. 6 : « les principaux
 * comptes pour lesquels le lettrage a un intérêt sont principalement les
 * comptes de tiers (classe 4) ». Le même chapitre illustre pourtant le
 * lettrage sur le compte 585 Virements internes, d'où la classe 58 ici.
 *
 * Ce n'est qu'un DÉFAUT : le texte laisse à l'entité « la liberté de définir
 * la liste des comptes auxquels s'applique le lettrage », et le drapeau reste
 * modifiable compte par compte depuis le plan comptable.
 */
export function estLettrableParDefaut(numero: string): boolean {
  return numero.startsWith('4') || numero.startsWith('58');
}

@Injectable()
export class CompteService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appelé une fois à la création du tenant (voir AuthService.register) ·
   * sème le plan du référentiel choisi. Les deux plans suivent les mêmes
   * conventions (feuilles à 8 chiffres, en-têtes TOTAL non complétés), toute
   * la mécanique en aval (balance, Total/Détail, lettrage) est donc commune.
   */
  /**
   * `client` reçoit la transaction de `AuthService.register` quand le semis
   * fait partie d'une création de dossier · hors de ce cas il vaut
   * `this.prisma` et rien ne change pour les autres appelants.
   */
  async seedPlan(tenantId: string, referentiel: Referentiel, client: Prisma.TransactionClient = this.prisma) {
    const plan = referentiel === Referentiel.SYSCOHADA ? PLAN_COMPTES_SYSCOHADA : PLAN_COMPTES_SYCEBNL;
    await client.compte.createMany({
      data: plan.map((c) => ({
        ...c,
        tenantId,
        // Un compte Total (tout en-tête de division semé NON complété par
        // compte-seed.ts ou compte-seed-syscohada.ts · voir CLAUDE.md § 7) ne
        // peut jamais recevoir d'écriture, donc jamais de lettrage : une case
        // cochée sur une ligne qui ne mouvementera jamais rien serait
        // trompeuse. Le défaut par numéro (classes 4 et 58) ne s'applique donc
        // qu'aux comptes Détail.
        //
        // Le compte de « 44 comptes principaux à 2 chiffres » qui figurait ici
        // ne correspondait à aucun des deux plans, et il aurait de toute façon
        // vieilli à chaque régénération : la règle se dit par la CONVENTION de
        // semis, pas par un décompte.
        lettrable: c.typeCompte === 'TOTAL' ? false : estLettrableParDefaut(c.numero),
      })),
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
    // Longueur maximale du numéro de compte · paramètre par dossier (§ voir
    // Tenant.longueurCompte dans le schéma), pas une constante globale : le
    // DTO ne valide qu'un format générique (3-13 chiffres, plage Sage), la
    // borne réelle du dossier se vérifie ici.
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (dto.numero.length > tenant.longueurCompte) {
      throw new BadRequestException(
        `Le numéro de compte "${dto.numero}" dépasse la longueur autorisée pour ce dossier (${tenant.longueurCompte} chiffres) · voir Structure > Paramètres du dossier.`,
      );
    }
    const existant = await this.prisma.compte.findUnique({
      where: { tenantId_numero: { tenantId, numero: dto.numero } },
    });
    if (existant) {
      throw new ConflictException(`Le compte ${dto.numero} existe déjà pour ce tenant`);
    }
    // `lettrable` omis : on retient le défaut déduit du numéro plutôt que le
    // `false` du schéma, pour qu'un compte de tiers créé à la main se
    // comporte comme ceux du plan semé.
    return this.prisma.compte.create({
      data: { ...dto, tenantId, lettrable: dto.lettrable ?? estLettrableParDefaut(dto.numero) },
    });
  }

  async modifier(tenantId: string, compteId: string, dto: ModifierCompteDto) {
    const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
    if (!compte) {
      throw new NotFoundException('Compte introuvable pour ce tenant');
    }
    // Un compte Total (regroupement par racine, §3.1) ne peut jamais avoir
    // reçu d'écriture directement · voir EcritureService.creer(). Basculer
    // un compte déjà mouvementé en Total laisserait ces mouvements orphelins
    // d'une comptabilisation cohérente (ils resteraient dans le solde agrégé
    // sans qu'on puisse plus jamais les corriger par une contre-écriture sur
    // ce même compte).
    if (dto.typeCompte === TypeCompteDetailTotal.TOTAL && compte.typeCompte !== TypeCompteDetailTotal.TOTAL) {
      const aDesMouvements = await this.prisma.ligneEcriture.findFirst({ where: { compteId } });
      if (aDesMouvements) {
        throw new BadRequestException(
          `Le compte ${compte.numero} a déjà des écritures · impossible de le basculer en compte Total`,
        );
      }
    }
    // `null` = détacher explicitement ; une chaîne = doit être un bailleur du
    // même tenant (jamais un simple id accepté sans vérification, sinon un
    // compte pourrait se retrouver rattaché à un bailleur d'un autre dossier).
    await refuserBailleurHorsSycebnl(this.prisma, tenantId, dto.bailleurId);
    if (dto.bailleurId) {
      const bailleur = await this.prisma.bailleur.findFirst({ where: { id: dto.bailleurId, tenantId } });
      if (!bailleur) {
        throw new BadRequestException("Bailleur introuvable pour ce tenant");
      }
    }
    return this.prisma.compte.update({ where: { id: compteId }, data: dto });
  }
}

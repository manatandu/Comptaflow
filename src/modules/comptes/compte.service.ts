import { renvoisDuPlanSyscohada } from './renvois-plan-syscohada';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { referencesVers, refuserSiReferences } from '../../common/suppression/references';
import { PrismaService } from '../../common/prisma.service';
import { refuserBailleurHorsSycebnl } from '../../common/bailleur-referentiel';
import { ClasseCompte, Prisma, Referentiel, TypeCompteDetailTotal } from '@prisma/client';
import { PLAN_COMPTES_SYCEBNL } from './compte-seed';
import { CATALOGUE_RETRAITEMENTS } from '../fiscalite/catalogue-retraitements';
import { PLAN_COMPTES_SYSCOHADA } from './compte-seed-syscohada';
import { CreerCompteDto, ModifierCompteDto } from './dto/creer-compte.dto';
import { naturesDuDossier } from './natures-compte.service';
import { LIBELLES_NATURE, natureDe } from './natures-compte';
import { classeDuNumero } from './classe-du-numero';
import { identifiantsUtilises } from '../../common/suppression/references';

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
        // Le plan normalisé part NON retenu · le cabinet retient ce qu'il
        // utilise, et tout compte utilisé reste proposé (schema.prisma).
        estRetenu: false,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Les renvois annexés au plan, pour un dossier SYSCOHADA seul
   * (renvois-plan-syscohada.ts) · le plan SYCEBNL n'en porte aucun, et ses
   * numéros ne disent pas la même chose.
   */
  async renvoisDuPlan(tenantId: string) {
    const dossier = await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { referentiel: true } });
    return dossier?.referentiel === Referentiel.SYSCOHADA ? renvoisDuPlanSyscohada() : [];
  }

  async lister(
    tenantId: string,
    filtres: {
      classe?: ClasseCompte;
      recherche?: string;
      actifsSeuls?: boolean;
      typeCompte?: TypeCompteDetailTotal;
      /** Ne rendre que les comptes retenus ou déjà utilisés (listes de choix). */
      retenus?: boolean;
      /** Rendre pour chaque compte s'il est utilisé (fenêtre Plan comptable). */
      usage?: boolean;
    },
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
    const [comptes, natures] = await Promise.all([
      this.prisma.compte.findMany({ where, orderBy: { numero: 'asc' } }),
      naturesDuDossier(this.prisma, tenantId),
    ]);
    // La nature s'AFFICHE, elle ne se stocke pas · « la nature d'un compte
    // s'affiche automatiquement en fonction du numéro de compte et du
    // paramétrage des comptes par nature » (support Sage 100).
    // UTILISÉ = référencé par quoi que ce soit, lu dans le schéma. Le lien
    // d'un compte individuel vers son collectif n'est pas un usage du
    // collectif · un collectif ne se saisit pas à la place de ses tiers.
    const utilises =
      filtres.retenus || filtres.usage
        ? await identifiantsUtilises(this.prisma, 'Compte', comptes.map((c) => c.id), tenantId, ['Compte.collectifId'])
        : null;
    return comptes
      .filter((c) => !filtres.retenus || c.estRetenu || utilises!.has(c.id))
      .map((c) => {
        const n = natureDe(c.numero, natures);
        return {
          ...c,
          nature: n ? LIBELLES_NATURE[n.nature] : null,
          ...(utilises ? { utilise: utilises.has(c.id) } : {}),
        };
      });
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
    this.verifierCodeRetraitement(dto.codeRetraitementFiscal);
    // LA CLASSE SE LIT DANS LE NUMÉRO (audit final F40) · jamais celle que
    // l'écran propose par défaut.
    const classe = classeDuNumero(dto.numero);
    if (!classe) {
      throw new BadRequestException(
        `Le compte ${dto.numero} ne commence pas par un chiffre de classe (1 à 9) · la classe d'un compte est le ` +
          'premier chiffre de son numéro.',
      );
    }
    if (dto.classe && dto.classe !== classe) {
      throw new BadRequestException(
        `Le compte ${dto.numero} est de la classe ${classe.slice(-1)}, que donne son premier chiffre · la classe ` +
          `${dto.classe.slice(-1)} indiquée le rangerait ailleurs dans les états.`,
      );
    }
    const existant = await this.prisma.compte.findUnique({
      where: { tenantId_numero: { tenantId, numero: dto.numero } },
    });
    if (existant) {
      throw new ConflictException(`Le compte ${dto.numero} existe déjà pour ce tenant`);
    }
    // Défauts pris à la NATURE du numéro (natures-compte.ts, Sage i7 :
    // « le programme affecte automatiquement la nature du compte en fonction
    // de son numéro »), puis à la règle d'avant hors de toute nature · un
    // compte de tiers créé à la main se comporte comme ceux du plan semé.
    const nature = natureDe(dto.numero, await naturesDuDossier(this.prisma, tenantId));
    return this.prisma.compte.create({
      data: {
        ...dto,
        classe,
        tenantId,
        lettrable: dto.lettrable ?? nature?.lettrable ?? estLettrableParDefaut(dto.numero),
        ...(dto.modeReportANouveau ?? nature?.modeReportANouveau
          ? { modeReportANouveau: dto.modeReportANouveau ?? nature?.modeReportANouveau }
          : {}),
      },
    });
  }

  /**
   * Le code de retraitement fiscal doit exister au catalogue.
   *
   * Pas de clé étrangère : le catalogue est une table de code, pas une table
   * de base. La garde est donc ICI · un code inconnu enregistré en base
   * produirait, à chaque exercice, une proposition sans libellé ni article,
   * c'est-à-dire une réintégration que personne ne peut justifier.
   *
   * La chaîne vide vaut EFFACEMENT du traitement · c'est ce que rend une
   * liste déroulante qu'on remet à « aucun ».
   */
  private verifierCodeRetraitement(code: string | null | undefined) {
    if (code === undefined || code === null || code === '') return;
    if (!CATALOGUE_RETRAITEMENTS.some((d) => d.code === code)) {
      throw new BadRequestException(
        `Code de retraitement fiscal inconnu : ${code}. Voir le catalogue de la fenêtre Fiscalité.`,
      );
    }
  }

  /**
   * SUPPRESSION D'UN COMPTE · voir common/suppression/references.ts. Refusée
   * s'il est mouvementé ou utilisé ailleurs, et, pour un compte TOTAL, tant
   * qu'il regroupe des sous-comptes · les retirer d'un en-tête laisserait
   * des comptes Détail sans rubrique dans le plan.
   */
  async supprimer(tenantId: string, compteId: string) {
    const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
    if (!compte) throw new NotFoundException('Compte introuvable pour ce dossier.');
    const sousComptes = await this.prisma.compte.count({
      where: { tenantId, numero: { startsWith: compte.numero }, id: { not: compte.id } },
    });
    if (sousComptes > 0) {
      throw new ConflictException(
        `Le compte ${compte.numero} regroupe ${sousComptes} sous-compte(s) · supprimez-les d'abord ou mettez-le en sommeil.`,
      );
    }
    refuserSiReferences(`Le compte ${compte.numero}`, await referencesVers(this.prisma, 'Compte', compte.id, tenantId));
    await this.prisma.compte.delete({ where: { id: compte.id } });
    return { supprime: true };
  }

  /**
   * NE RETENIR QUE LES COMPTES UTILISÉS · remet tout le plan du dossier à
   * « non retenu ». Rien ne disparaît de ce qui sert · un compte utilisé reste
   * proposé par la règle de `lister`. Le geste d'un dossier existant dont le
   * plan entier a été retenu par la migration.
   */
  async neRetenirQueLesUtilises(tenantId: string) {
    const { count } = await this.prisma.compte.updateMany({ where: { tenantId, estRetenu: true }, data: { estRetenu: false } });
    return { comptesDesretenus: count };
  }

  async modifier(tenantId: string, compteId: string, dto: ModifierCompteDto) {
    this.verifierCodeRetraitement(dto.codeRetraitementFiscal);
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

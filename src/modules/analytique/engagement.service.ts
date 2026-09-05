import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NatureEngagement, StatutEngagement, StatutEcriture } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { CloreEngagementDto, CreerEngagementDto, RattacherExecutionDto } from './dto/engagement.dto';

/** En dessous, deux montants sont le même montant · les arrondis de Decimal. */
const EPSILON = 0.005;

/**
 * ENGAGEMENTS DE DÉPENSE HORS COMPTABILITÉ.
 *
 * La colonne Engagement (3) du tableau d'exécution budgétaire a TROIS termes
 * (SYCEBNL, Guide d'application, ch. 7, APPLICATION 22, règle (d)) :
 *
 *  1. « solde créditeur balance N des comptes fournisseurs d'exploitation
 *     (compte 40) et d'investissement (compte 481) » ;
 *  2. « bons de commande de biens et services remis aux fournisseurs au cours
 *     de l'exercice budgétaire, NON EXÉCUTÉS » ;
 *  3. « contrats signés par les parties prenantes au cours de l'exercice
 *     budgétaire, NON EXÉCUTÉS ».
 *
 * Le terme 1 est comptable, et `EtatsFinanciersProjetBudgetService` le porte
 * depuis l'origine. Ce service tient les termes 2 et 3, qui ne sont pas des
 * écritures : un bon de commande remis ne débite ni ne crédite rien, et c'est
 * pour cela même qu'il engage le budget sans apparaître dans les comptes.
 *
 * LE RESTE À EXÉCUTER, JAMAIS LE MONTANT ENTIER. Quand la facture arrive, la
 * dépense entre au 40 et rejoint le terme 1. Un bon de commande qui resterait
 * entier dans le terme 2 ferait compter la même dépense DEUX FOIS, et ce
 * défaut ne se voit nulle part : le tableau boucle toujours, puisque
 * Réalisation = (2) + (3) par construction, et seul le crédit disponible est
 * faux, en moins. Le rattachement à l'écriture qui exécute est donc la
 * mécanique centrale de ce module, pas un agrément.
 */
@Injectable()
export class EngagementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * RESTE À EXÉCUTER d'un engagement · ce qui pèse encore sur le budget.
   *
   * Un engagement CLOS ne pèse plus rien, quel que soit son reste : c'est le
   * sens même de la clôture manuelle (commande annulée, contrat résilié).
   * Et le reste est borné à zéro par le bas · une sur-exécution (la facture
   * dépasse le bon de commande) est un dépassement de la dépense réelle, que
   * la colonne Décaissement porte déjà ; la faire passer en engagement négatif
   * la retrancherait une seconde fois.
   */
  static resteAExecuter(engagement: {
    statut: StatutEngagement;
    montant: unknown;
    executions: { montant: unknown }[];
  }): number {
    if (engagement.statut === StatutEngagement.CLOS) return 0;
    const execute = engagement.executions.reduce((s, e) => s + Number(e.montant), 0);
    return Math.max(0, Number(engagement.montant) - execute);
  }

  /**
   * Le reste à exécuter de chaque section, pour un exercice · c'est ce que le
   * tableau d'exécution budgétaire ajoute à sa colonne Engagement.
   *
   * Rendu en Map plutôt qu'en liste : l'appelant boucle sur ses sections, pas
   * sur ses engagements, et une section sans engagement doit lire zéro sans
   * qu'il ait à s'en soucier.
   */
  async resteParSection(tenantId: string, exerciceId: string): Promise<Map<string, number>> {
    const engagements = await this.prisma.engagementDepense.findMany({
      where: { tenantId, exerciceId },
      select: { sectionId: true, statut: true, montant: true, executions: { select: { montant: true } } },
    });
    const parSection = new Map<string, number>();
    for (const e of engagements) {
      const reste = EngagementService.resteAExecuter(e);
      if (reste < EPSILON) continue;
      parSection.set(e.sectionId, (parSection.get(e.sectionId) ?? 0) + reste);
    }
    return parSection;
  }

  /** Le registre, tel qu'un réviseur le demande : montant, exécuté, reste. */
  async lister(tenantId: string, exerciceId: string) {
    const engagements = await this.prisma.engagementDepense.findMany({
      where: { tenantId, exerciceId },
      orderBy: [{ date: 'asc' }, { reference: 'asc' }],
      include: {
        section: { select: { id: true, code: true, intitule: true } },
        executions: {
          orderBy: { createdAt: 'asc' },
          include: {
            ecriture: { select: { id: true, date: true, numeroPiece: true, libelle: true, statut: true } },
          },
        },
      },
    });
    return engagements.map((e) => {
      const execute = e.executions.reduce((s, x) => s + Number(x.montant), 0);
      return {
        id: e.id,
        nature: e.nature,
        reference: e.reference,
        objet: e.objet,
        beneficiaire: e.beneficiaire,
        date: e.date,
        montant: Number(e.montant),
        statut: e.statut,
        motifCloture: e.motifCloture,
        section: e.section,
        montantExecute: execute,
        resteAExecuter: EngagementService.resteAExecuter(e),
        executions: e.executions.map((x) => ({
          id: x.id,
          montant: Number(x.montant),
          ecriture: x.ecriture,
        })),
      };
    });
  }

  async creer(tenantId: string, userId: string, dto: CreerEngagementDto) {
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: dto.exerciceId, tenantId },
      select: { id: true, dateDebut: true, dateFin: true, statut: true },
    });
    if (!exercice) throw new NotFoundException("Exercice introuvable dans ce dossier.");

    // La section doit appartenir au dossier ET porter des budgets · engager
    // une ligne d'un plan qui ne budgète pas ferait peser un engagement sur un
    // tableau où il n'apparaîtrait jamais.
    const section = await this.prisma.sectionAnalytique.findFirst({
      where: { id: dto.sectionId, tenantId },
      select: { id: true, code: true, intitule: true, plan: { select: { gererBudgets: true, code: true } } },
    });
    if (!section) throw new NotFoundException('Section analytique introuvable dans ce dossier.');
    if (!section.plan.gererBudgets) {
      throw new BadRequestException(
        `La section ${section.code} appartient au plan « ${section.plan.code} », qui ne gère pas les budgets. ` +
          "Un engagement pèse sur une ligne du tableau d'exécution budgétaire : il ne peut viser qu'une section d'un plan budgétaire.",
      );
    }

    const date = new Date(dto.date);
    // « au cours de l'exercice budgétaire » (règle (d)) · la borne est dans le
    // texte, pas une commodité. Un bon de commande de l'an dernier pèse sur le
    // budget de l'an dernier.
    if (date < exercice.dateDebut || date > exercice.dateFin) {
      throw new BadRequestException(
        `La date de l'engagement (${date.toISOString().slice(0, 10)}) est hors de l'exercice ` +
          `(${exercice.dateDebut.toISOString().slice(0, 10)} au ${exercice.dateFin.toISOString().slice(0, 10)}). ` +
          "Le guide ne retient que les engagements pris « au cours de l'exercice budgétaire ».",
      );
    }
    if (dto.montant <= 0) {
      throw new BadRequestException("Le montant de l'engagement doit être strictement positif.");
    }

    const doublon = await this.prisma.engagementDepense.findFirst({
      where: { tenantId, exerciceId: dto.exerciceId, nature: dto.nature, reference: dto.reference.trim() },
      select: { id: true },
    });
    if (doublon) {
      throw new BadRequestException(
        `Un engagement de même nature porte déjà la référence « ${dto.reference.trim()} » sur cet exercice. ` +
          'Une double saisie doublerait le poids de cette commande sur le budget.',
      );
    }

    return this.prisma.engagementDepense.create({
      data: {
        tenantId,
        exerciceId: dto.exerciceId,
        sectionId: dto.sectionId,
        nature: dto.nature,
        reference: dto.reference.trim(),
        objet: dto.objet.trim(),
        beneficiaire: dto.beneficiaire.trim(),
        date,
        montant: dto.montant,
        createdBy: userId,
      },
    });
  }

  /**
   * RATTACHER une écriture à l'engagement qu'elle exécute · c'est ce geste,
   * et lui seul, qui fait sortir la dépense de la colonne Engagement hors
   * comptabilité au moment où elle y entre par les comptes.
   */
  async rattacherExecution(tenantId: string, userId: string, engagementId: string, dto: RattacherExecutionDto) {
    const engagement = await this.prisma.engagementDepense.findFirst({
      where: { id: engagementId, tenantId },
      include: { executions: { select: { montant: true, ecritureId: true } } },
    });
    if (!engagement) throw new NotFoundException('Engagement introuvable dans ce dossier.');
    if (engagement.statut === StatutEngagement.CLOS) {
      throw new BadRequestException(
        "Cet engagement est clos : il ne pèse plus sur le budget et ne peut plus recevoir d'exécution. Rouvrez-le d'abord.",
      );
    }

    const ecriture = await this.prisma.ecriture.findFirst({
      where: { id: dto.ecritureId, tenantId },
      select: { id: true, exerciceId: true, statut: true, numeroPiece: true },
    });
    if (!ecriture) throw new NotFoundException('Écriture introuvable dans ce dossier.');
    // Le tableau d'un exercice ne lit que les écritures de cet exercice : une
    // écriture d'un autre exercice ferait baisser un reste à exécuter sans
    // qu'aucun décaissement ne vienne le remplacer dans la même colonne.
    if (ecriture.exerciceId !== engagement.exerciceId) {
      throw new BadRequestException(
        "L'écriture appartient à un autre exercice que l'engagement. Le tableau d'exécution budgétaire est établi exercice par exercice.",
      );
    }
    if (engagement.executions.some((x) => x.ecritureId === dto.ecritureId)) {
      throw new BadRequestException(
        'Cette écriture est déjà rattachée à cet engagement. La rattacher deux fois retrancherait deux fois le même reste à exécuter.',
      );
    }
    if (dto.montant <= 0) {
      throw new BadRequestException("Le montant d'exécution doit être strictement positif.");
    }

    const dejaExecute = engagement.executions.reduce((s, x) => s + Number(x.montant), 0);
    // Le dépassement est REFUSÉ plutôt que rogné : rogner en silence ferait
    // croire au comptable que sa facture est intégralement rattachée alors
    // qu'une partie ne le serait pas, et le montant rattaché ne recouperait
    // plus la pièce.
    if (dejaExecute + dto.montant - Number(engagement.montant) > EPSILON) {
      throw new BadRequestException(
        `L'exécution cumulée (${(dejaExecute + dto.montant).toFixed(2)}) dépasserait le montant engagé ` +
          `(${Number(engagement.montant).toFixed(2)}). Si la dépense réelle excède la commande, rattachez le montant ` +
          "engagé et laissez l'excédent suivre son cours comptable : il est déjà porté par la colonne Décaissement.",
      );
    }

    return this.prisma.executionEngagement.create({
      data: { engagementId, ecritureId: dto.ecritureId, montant: dto.montant, createdBy: userId },
    });
  }

  /** Détacher une écriture rattachée par erreur · le reste remonte d'autant. */
  async detacherExecution(tenantId: string, engagementId: string, executionId: string) {
    const execution = await this.prisma.executionEngagement.findFirst({
      where: { id: executionId, engagementId, engagement: { tenantId } },
      select: { id: true },
    });
    if (!execution) throw new NotFoundException("Rattachement introuvable sur cet engagement.");
    await this.prisma.executionEngagement.delete({ where: { id: executionId } });
    return { detache: true };
  }

  /**
   * CLORE un engagement sans qu'il soit exécuté · commande annulée, contrat
   * résilié. Le motif est exigé : un engagement qui disparaît du tableau sans
   * explication est une correction sans trace, et c'est le crédit disponible
   * du projet qu'elle déplace.
   */
  async clore(tenantId: string, engagementId: string, dto: CloreEngagementDto) {
    const engagement = await this.prisma.engagementDepense.findFirst({
      where: { id: engagementId, tenantId },
      select: { id: true, statut: true },
    });
    if (!engagement) throw new NotFoundException('Engagement introuvable dans ce dossier.');
    if (engagement.statut === StatutEngagement.CLOS) {
      throw new BadRequestException('Cet engagement est déjà clos.');
    }
    if (!dto.motif?.trim()) {
      throw new BadRequestException(
        "Le motif de clôture est obligatoire : clore un engagement libère du crédit disponible sur le projet, et le bailleur doit pouvoir savoir pourquoi.",
      );
    }
    return this.prisma.engagementDepense.update({
      where: { id: engagementId },
      data: { statut: StatutEngagement.CLOS, motifCloture: dto.motif.trim() },
    });
  }

  /** Rouvrir un engagement clos par erreur · il repèse sur le budget. */
  async rouvrir(tenantId: string, engagementId: string) {
    const engagement = await this.prisma.engagementDepense.findFirst({
      where: { id: engagementId, tenantId },
      select: { id: true, statut: true },
    });
    if (!engagement) throw new NotFoundException('Engagement introuvable dans ce dossier.');
    if (engagement.statut !== StatutEngagement.CLOS) {
      throw new BadRequestException("Cet engagement n'est pas clos.");
    }
    return this.prisma.engagementDepense.update({
      where: { id: engagementId },
      data: { statut: StatutEngagement.OUVERT, motifCloture: null },
    });
  }

  /**
   * Supprimer un engagement saisi par erreur. Refusé dès qu'une exécution y
   * est rattachée : ce n'est plus une erreur de saisie mais un fait comptable,
   * et il se CLÔT avec son motif plutôt qu'il ne s'efface.
   */
  async supprimer(tenantId: string, engagementId: string) {
    const engagement = await this.prisma.engagementDepense.findFirst({
      where: { id: engagementId, tenantId },
      select: { id: true, _count: { select: { executions: true } } },
    });
    if (!engagement) throw new NotFoundException('Engagement introuvable dans ce dossier.');
    if (engagement._count.executions > 0) {
      throw new BadRequestException(
        "Cet engagement porte des écritures d'exécution : il ne s'efface pas. Clôturez-le avec son motif, ou détachez d'abord ses exécutions.",
      );
    }
    await this.prisma.engagementDepense.delete({ where: { id: engagementId } });
    return { supprime: true };
  }

  /**
   * Les écritures de l'exercice, pour le sélecteur de rattachement. Seules les
   * VALIDÉES sont proposées : le tableau d'exécution budgétaire ne lit que le
   * validé, et rattacher un brouillard ferait baisser l'engagement sans que le
   * décaissement correspondant apparaisse nulle part.
   */
  async ecrituresRattachables(tenantId: string, exerciceId: string) {
    return this.prisma.ecriture.findMany({
      where: { tenantId, exerciceId, statut: StatutEcriture.VALIDEE, estGenereeParCloture: false },
      orderBy: [{ date: 'desc' }],
      take: 200,
      select: { id: true, date: true, numeroPiece: true, libelle: true, reference: true },
    });
  }
}

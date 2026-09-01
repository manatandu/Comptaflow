import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ClasseCompte, Prisma, Referentiel, TypeCompteDetailTotal } from '@prisma/client';
import {
  CreerPlanAnalytiqueDto,
  CreerSectionDto,
  DoterBudgetDto,
  LigneVentilationDto,
  ModifierBudgetMoisDto,
  ModifierPlanAnalytiqueDto,
  ModifierSectionDto,
} from './dto/analytique.dto';

/** Chiffre de classe d'un compte : CLASSE_6 donne 6. */
function chiffreClasse(classe: ClasseCompte): string {
  return classe.replace('CLASSE_', '');
}

/** Une ligne de balance analytique : une section, ses mouvements, son solde. */
export interface LigneBalanceAnalytique {
  sectionId: string;
  code: string;
  intitule: string;
  type: TypeCompteDetailTotal;
  debit: number;
  credit: number;
  solde: number;
}

/** Une ligne d'état budgétaire : le prévu, le réalisé, l'écart. */
export interface LigneEtatBudgetaire {
  sectionId: string | null;
  code: string;
  intitule: string;
  budget: number;
  realise: number;
  ecart: number;
  /** Pourcentage de consommation, null quand aucun budget n'est doté. */
  tauxConsommation: number | null;
  /** Vrai pour une section mouvementée sans budget : la dépense hors budget. */
  horsBudget: boolean;
}

/**
 * COMPTABILITÉ ANALYTIQUE ET BUDGÉTAIRE.
 *
 * Voir docs/analytique-et-budget.md pour ce que disent les manuels Sage et ce
 * qu'OmegaX en retient. En deux phrases : la classe 9 du SYCEBNL réserve
 * 92 à 99 à la comptabilité analytique de gestion, d'usage libre ; pour une
 * EBNL cet usage est le suivi par projet et par bailleur, et le budget se
 * porte sur les sections analytiques plutôt que sur un plan de postes séparé.
 */
@Injectable()
export class AnalytiqueService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deux axes livrés à la création du dossier, et pas onze : le guide Sage
   * écrit pour une ONG n'en paramètre qu'un seul, « PROJETS », et une EBNL a
   * exactement deux questions à poser à sa comptabilité · quel projet a
   * consommé la dépense, et quel financeur la couvre. Un troisième axe reste
   * créable à la main si l'entité en a l'usage.
   *
   * Aucune section n'est créée : elles portent les projets et les bailleurs
   * réels du dossier, que nous ne connaissons pas.
   *
   * Pour un dossier SYSCOHADA, seul l'axe « Projets » est livré : la notion
   * de bailleur de fonds est propre aux EBNL (SYCEBNL, division 46) · une
   * entreprise qui veut suivre ses financeurs crée son axe à la main.
   */
  async seedPlansDefaut(tenantId: string, referentiel: Referentiel) {
    const existants = await this.prisma.planAnalytique.count({ where: { tenantId } });
    if (existants > 0) return;
    await this.prisma.planAnalytique.createMany({
      data: [
        {
          tenantId,
          code: 'PROJ',
          intitule: 'Projets et programmes',
          // La classe 9 ventilée n'a de sens qu'en SYCEBNL (contributions
          // volontaires en nature, rapportées par projet) · en SYSCOHADA
          // elle porte les engagements hors bilan, qu'on ne ventile pas.
          classesVentilees: referentiel === Referentiel.SYCEBNL ? '2,6,7,9' : '2,6,7',
          gererBudgets: true,
          ordre: 1,
        },
        ...(referentiel === Referentiel.SYCEBNL
          ? [
              {
                tenantId,
                code: 'BAIL',
                intitule: 'Bailleurs et financements',
                classesVentilees: '2,6,7,9',
                // Le budget se tient par projet ; le bailleur sert à rapporter,
                // pas à budgéter. Un même projet peut d'ailleurs être cofinancé.
                gererBudgets: false,
                ordre: 2,
              },
            ]
          : []),
      ],
    });
  }

  // -------------------------------------------------------------------------
  // Plans
  // -------------------------------------------------------------------------

  async listerPlans(tenantId: string) {
    return this.prisma.planAnalytique.findMany({
      where: { tenantId },
      orderBy: [{ ordre: 'asc' }, { code: 'asc' }],
      include: { _count: { select: { sections: true } } },
    });
  }

  async creerPlan(tenantId: string, dto: CreerPlanAnalytiqueDto) {
    const existant = await this.prisma.planAnalytique.findFirst({ where: { tenantId, code: dto.code } });
    if (existant) {
      throw new ConflictException(`Un plan analytique porte déjà le code ${dto.code}`);
    }
    return this.prisma.planAnalytique.create({
      data: {
        tenantId,
        code: dto.code,
        intitule: dto.intitule,
        classesVentilees: dto.classesVentilees,
        ventilationObligatoire: dto.ventilationObligatoire,
        gererBudgets: dto.gererBudgets,
        ordre: dto.ordre,
      },
    });
  }

  async modifierPlan(tenantId: string, planId: string, dto: ModifierPlanAnalytiqueDto) {
    await this.trouverPlan(tenantId, planId);
    return this.prisma.planAnalytique.update({ where: { id: planId }, data: dto });
  }

  async supprimerPlan(tenantId: string, planId: string) {
    await this.trouverPlan(tenantId, planId);
    const ventilations = await this.prisma.ventilationAnalytique.count({ where: { planId } });
    if (ventilations > 0) {
      throw new BadRequestException(
        `Ce plan porte ${ventilations} ventilation(s) : il ne peut plus être supprimé. Mettez-le en sommeil.`,
      );
    }
    await this.prisma.sectionAnalytique.deleteMany({ where: { planId } });
    await this.prisma.planAnalytique.delete({ where: { id: planId } });
    return { supprime: true };
  }

  private async trouverPlan(tenantId: string, planId: string) {
    const plan = await this.prisma.planAnalytique.findFirst({ where: { id: planId, tenantId } });
    if (!plan) throw new NotFoundException('Plan analytique introuvable pour ce dossier');
    return plan;
  }

  // -------------------------------------------------------------------------
  // Sections
  // -------------------------------------------------------------------------

  async listerSections(tenantId: string, planId: string) {
    await this.trouverPlan(tenantId, planId);
    return this.prisma.sectionAnalytique.findMany({
      where: { planId },
      orderBy: { code: 'asc' },
      include: { bailleur: { select: { id: true, code: true, nom: true } } },
    });
  }

  async creerSection(tenantId: string, planId: string, dto: CreerSectionDto) {
    await this.trouverPlan(tenantId, planId);
    const existante = await this.prisma.sectionAnalytique.findFirst({ where: { planId, code: dto.code } });
    if (existante) {
      throw new ConflictException(`Une section porte déjà le code ${dto.code} dans ce plan`);
    }
    if (dto.bailleurId) {
      const bailleur = await this.prisma.bailleur.findFirst({ where: { id: dto.bailleurId, tenantId } });
      if (!bailleur) throw new BadRequestException('Bailleur introuvable pour ce dossier');
    }
    const dateDebut = dto.dateDebut ? new Date(dto.dateDebut) : null;
    const dateFin = dto.dateFin ? new Date(dto.dateFin) : null;
    if (dateDebut && dateFin && dateFin < dateDebut) {
      throw new BadRequestException('La date de fin de la convention précède sa date de début');
    }
    return this.prisma.sectionAnalytique.create({
      data: {
        planId,
        tenantId,
        code: dto.code,
        intitule: dto.intitule,
        type: dto.type,
        bailleurId: dto.bailleurId,
        dateDebut,
        dateFin,
      },
      include: { bailleur: { select: { id: true, code: true, nom: true } } },
    });
  }

  async modifierSection(tenantId: string, sectionId: string, dto: ModifierSectionDto) {
    await this.trouverSection(tenantId, sectionId);
    if (dto.bailleurId) {
      const bailleur = await this.prisma.bailleur.findFirst({ where: { id: dto.bailleurId, tenantId } });
      if (!bailleur) throw new BadRequestException('Bailleur introuvable pour ce dossier');
    }
    return this.prisma.sectionAnalytique.update({
      where: { id: sectionId },
      data: {
        intitule: dto.intitule,
        bailleurId: dto.bailleurId,
        dateDebut: dto.dateDebut === null ? null : dto.dateDebut ? new Date(dto.dateDebut) : undefined,
        dateFin: dto.dateFin === null ? null : dto.dateFin ? new Date(dto.dateFin) : undefined,
        estActive: dto.estActive,
      },
      include: { bailleur: { select: { id: true, code: true, nom: true } } },
    });
  }

  async supprimerSection(tenantId: string, sectionId: string) {
    await this.trouverSection(tenantId, sectionId);
    const ventilations = await this.prisma.ventilationAnalytique.count({ where: { sectionId } });
    if (ventilations > 0) {
      throw new BadRequestException(
        `Cette section porte ${ventilations} ventilation(s) : elle ne peut plus être supprimée. Mettez-la en sommeil.`,
      );
    }
    await this.prisma.budgetSection.deleteMany({ where: { sectionId } });
    await this.prisma.sectionAnalytique.delete({ where: { id: sectionId } });
    return { supprime: true };
  }

  private async trouverSection(tenantId: string, sectionId: string) {
    const section = await this.prisma.sectionAnalytique.findFirst({
      where: { id: sectionId, tenantId },
      include: { plan: true },
    });
    if (!section) throw new NotFoundException('Section analytique introuvable pour ce dossier');
    return section;
  }

  // -------------------------------------------------------------------------
  // Budget
  // -------------------------------------------------------------------------

  /**
   * Dote une section pour un exercice et répartit le montant sur les mois
   * RÉELLEMENT couverts par la convention. Répartir sur douze mois un
   * financement de huit fausserait tous les écarts mensuels : c'est le seul
   * écart de fond avec la répartition homogène de Sage.
   *
   * Le reliquat de l'arrondi tombe sur le dernier mois, pour que la somme des
   * dotations mensuelles égale exactement la dotation annuelle.
   */
  async doterBudget(tenantId: string, sectionId: string, dto: DoterBudgetDto) {
    const section = await this.trouverSection(tenantId, sectionId);
    if (section.type === TypeCompteDetailTotal.TOTAL) {
      throw new BadRequestException(
        "Une section Total ne se dote pas : elle totalise ses sections Détail. Dotez les sections Détail qu'elle regroupe.",
      );
    }
    if (!section.plan.gererBudgets) {
      throw new BadRequestException(
        `Le plan ${section.plan.code} ne gère pas les budgets. Activez « Gérer les budgets » sur le plan.`,
      );
    }
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce dossier');

    const mois = this.moisCouverts(exercice.dateDebut, exercice.dateFin, section.dateDebut, section.dateFin);
    if (mois.length === 0) {
      throw new BadRequestException(
        "La convention de cette section ne recouvre aucun mois de l'exercice : il n'y a rien à doter.",
      );
    }

    const centimes = Math.round(dto.montantAnnuel * 100);
    const part = Math.trunc(centimes / mois.length);
    const reliquat = centimes - part * mois.length;

    await this.prisma.$transaction(async (tx) => {
      await tx.budgetSection.deleteMany({ where: { sectionId, exerciceId: dto.exerciceId } });
      await tx.budgetSection.create({
        data: { sectionId, exerciceId: dto.exerciceId, mois: null, montant: new Prisma.Decimal(dto.montantAnnuel) },
      });
      await tx.budgetSection.createMany({
        data: mois.map((m, i) => ({
          sectionId,
          exerciceId: dto.exerciceId,
          mois: m,
          montant: new Prisma.Decimal((part + (i === mois.length - 1 ? reliquat : 0)) / 100),
        })),
      });
    });

    return this.budget(tenantId, sectionId, dto.exerciceId);
  }

  /** Retouche d'un mois. La dotation annuelle suit, pour rester cohérente. */
  async modifierBudgetMois(tenantId: string, sectionId: string, dto: ModifierBudgetMoisDto) {
    await this.trouverSection(tenantId, sectionId);
    await this.prisma.budgetSection.upsert({
      where: { sectionId_exerciceId_mois: { sectionId, exerciceId: dto.exerciceId, mois: dto.mois } },
      create: {
        sectionId,
        exerciceId: dto.exerciceId,
        mois: dto.mois,
        montant: new Prisma.Decimal(dto.montant),
      },
      update: { montant: new Prisma.Decimal(dto.montant) },
    });
    const mensuels = await this.prisma.budgetSection.findMany({
      where: { sectionId, exerciceId: dto.exerciceId, mois: { not: null } },
    });
    const total = mensuels.reduce((s, b) => s + Number(b.montant), 0);
    await this.prisma.budgetSection.upsert({
      // Prisma type la clé composée avec un `mois: number` : la ligne
      // annuelle porte pourtant `mois = null`, ce que la contrainte unique
      // accepte. On force le type ici plutôt que d'ajouter une colonne
      // sentinelle qui polluerait le modèle.
      where: {
        sectionId_exerciceId_mois: {
          sectionId,
          exerciceId: dto.exerciceId,
          mois: null as unknown as number,
        },
      },
      create: { sectionId, exerciceId: dto.exerciceId, mois: null, montant: new Prisma.Decimal(total) },
      update: { montant: new Prisma.Decimal(total) },
    });
    return this.budget(tenantId, sectionId, dto.exerciceId);
  }

  async budget(tenantId: string, sectionId: string, exerciceId: string) {
    await this.trouverSection(tenantId, sectionId);
    const lignes = await this.prisma.budgetSection.findMany({
      where: { sectionId, exerciceId },
      orderBy: { mois: 'asc' },
    });
    return {
      annuel: Number(lignes.find((l) => l.mois === null)?.montant ?? 0),
      mensuel: lignes
        .filter((l) => l.mois !== null)
        .map((l) => ({ mois: l.mois as number, montant: Number(l.montant) })),
    };
  }

  /**
   * Mois de l'exercice couverts par la convention de la section. Sans
   * convention, tous les mois de l'exercice.
   */
  private moisCouverts(
    debutExercice: Date,
    finExercice: Date,
    debutSection: Date | null,
    finSection: Date | null,
  ): number[] {
    const debut = debutSection && debutSection > debutExercice ? debutSection : debutExercice;
    const fin = finSection && finSection < finExercice ? finSection : finExercice;
    if (fin < debut) return [];
    const mois: number[] = [];
    const curseur = new Date(debut.getFullYear(), debut.getMonth(), 1);
    while (curseur <= fin) {
      mois.push(curseur.getMonth() + 1);
      curseur.setMonth(curseur.getMonth() + 1);
    }
    return mois;
  }

  // -------------------------------------------------------------------------
  // Ventilation
  // -------------------------------------------------------------------------

  /**
   * Remplace la ventilation d'une ligne sur les plans touchés par les sections
   * fournies. La règle vérifiée n'est pas « une ventilation par ligne » mais,
   * PAR PLAN : la somme des ventilations égale le montant de la ligne, ou il
   * n'y en a aucune. Une dépense peut ainsi être partagée entre deux projets
   * et rapportée à un seul bailleur.
   */
  async ventilerLigne(tenantId: string, ligneEcritureId: string, ventilations: LigneVentilationDto[]) {
    const ligne = await this.prisma.ligneEcriture.findFirst({
      where: { id: ligneEcritureId, ecriture: { tenantId } },
      include: { compte: { select: { numero: true, classe: true } } },
    });
    if (!ligne) throw new NotFoundException('Ligne d\'écriture introuvable pour ce dossier');

    const sectionIds = [...new Set(ventilations.map((v) => v.sectionId))];
    const sections = await this.prisma.sectionAnalytique.findMany({
      where: { id: { in: sectionIds }, tenantId },
      include: { plan: true },
    });
    if (sections.length !== sectionIds.length) {
      throw new BadRequestException('Une ou plusieurs sections sont introuvables pour ce dossier');
    }
    const totale = sections.find((s) => s.type === TypeCompteDetailTotal.TOTAL);
    if (totale) {
      throw new BadRequestException(
        `La section ${totale.code} est de type Total : elle totalise ses sections Détail dans les états et ne reçoit pas de ventilation directe.`,
      );
    }
    const inactive = sections.find((s) => !s.estActive);
    if (inactive) {
      throw new BadRequestException(`La section ${inactive.code} est en sommeil`);
    }

    // Équilibre par plan.
    const parPlan = new Map<string, { debit: number; credit: number; code: string }>();
    for (const v of ventilations) {
      const section = sections.find((s) => s.id === v.sectionId)!;
      const cumul = parPlan.get(section.planId) ?? { debit: 0, credit: 0, code: section.plan.code };
      cumul.debit += v.debit ?? 0;
      cumul.credit += v.credit ?? 0;
      parPlan.set(section.planId, cumul);
    }
    const debitLigne = Number(ligne.debit);
    const creditLigne = Number(ligne.credit);
    for (const [, cumul] of parPlan) {
      if (Math.abs(cumul.debit - debitLigne) > 0.005 || Math.abs(cumul.credit - creditLigne) > 0.005) {
        throw new BadRequestException(
          `Ventilation incomplète sur le plan ${cumul.code} : ${cumul.debit.toFixed(2)} au débit et ` +
            `${cumul.credit.toFixed(2)} au crédit, pour une ligne de ${debitLigne.toFixed(2)} / ${creditLigne.toFixed(2)}. ` +
            "Une ligne est ventilée en totalité sur un plan, ou pas du tout.",
        );
      }
    }

    const plansTouches = [...parPlan.keys()];
    await this.prisma.$transaction(async (tx) => {
      // On n'efface que les plans touchés : ventiler l'axe Projet ne doit pas
      // effacer l'axe Bailleur posé auparavant.
      await tx.ventilationAnalytique.deleteMany({
        where: {
          ligneEcritureId,
          ...(plansTouches.length > 0 ? { planId: { in: plansTouches } } : {}),
        },
      });
      if (ventilations.length > 0) {
        await tx.ventilationAnalytique.createMany({
          data: ventilations.map((v) => ({
            ligneEcritureId,
            sectionId: v.sectionId,
            planId: sections.find((s) => s.id === v.sectionId)!.planId,
            debit: new Prisma.Decimal(v.debit ?? 0),
            credit: new Prisma.Decimal(v.credit ?? 0),
          })),
        });
      }
    });

    return this.ventilationsDeLigne(tenantId, ligneEcritureId);
  }

  /** Efface toute ventilation de la ligne, tous plans confondus. */
  async effacerVentilation(tenantId: string, ligneEcritureId: string) {
    const ligne = await this.prisma.ligneEcriture.findFirst({
      where: { id: ligneEcritureId, ecriture: { tenantId } },
      select: { id: true },
    });
    if (!ligne) throw new NotFoundException('Ligne d\'écriture introuvable pour ce dossier');
    await this.prisma.ventilationAnalytique.deleteMany({ where: { ligneEcritureId } });
    return { efface: true };
  }

  async ventilationsDeLigne(tenantId: string, ligneEcritureId: string) {
    return this.prisma.ventilationAnalytique.findMany({
      where: { ligneEcritureId, section: { tenantId } },
      include: { section: { select: { id: true, code: true, intitule: true, planId: true } } },
    });
  }

  /**
   * Vérifie qu'une ligne respecte les plans à ventilation OBLIGATOIRE. Appelé
   * par la saisie avant enregistrement : quand aucun plan n'est obligatoire
   * (le défaut), une ligne non ventilée passe et c'est le contrôle des cumuls
   * qui la signale, comme chez Sage.
   */
  async verifierVentilationObligatoire(
    tenantId: string,
    lignes: { compteId: string; ventilations?: LigneVentilationDto[] }[],
  ) {
    const plans = await this.prisma.planAnalytique.findMany({
      where: { tenantId, estActif: true, ventilationObligatoire: true },
    });
    if (plans.length === 0) return;

    const comptes = await this.prisma.compte.findMany({
      where: { id: { in: [...new Set(lignes.map((l) => l.compteId))] }, tenantId },
      select: { id: true, numero: true, classe: true },
    });
    const sectionsUtilisees = await this.prisma.sectionAnalytique.findMany({
      where: { id: { in: lignes.flatMap((l) => (l.ventilations ?? []).map((v) => v.sectionId)) } },
      select: { id: true, planId: true },
    });

    for (const ligne of lignes) {
      const compte = comptes.find((c) => c.id === ligne.compteId);
      if (!compte) continue;
      const chiffre = chiffreClasse(compte.classe);
      for (const plan of plans) {
        if (!plan.classesVentilees.split(',').includes(chiffre)) continue;
        const ventilee = (ligne.ventilations ?? []).some(
          (v) => sectionsUtilisees.find((s) => s.id === v.sectionId)?.planId === plan.id,
        );
        if (!ventilee) {
          throw new BadRequestException(
            `Le compte ${compte.numero} (classe ${chiffre}) doit être ventilé sur le plan ${plan.code} · ` +
              'la ventilation y est obligatoire.',
          );
        }
      }
    }
  }
}

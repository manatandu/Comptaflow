import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import type { LigneBalanceAnalytique, LigneEtatBudgetaire } from './analytique.service';

/** Une ligne du grand livre analytique : le détail d'une section. */
export interface LigneGrandLivreAnalytique {
  date: string;
  journal: string;
  numeroPiece: number | null;
  compteNumero: string;
  compteIntitule: string;
  libelle: string;
  debit: number;
  credit: number;
  soldeProgressif: number;
}

/** Une ligne du contrôle des cumuls : la preuve que l'analytique boucle. */
export interface LigneControleCumuls {
  planId: string;
  planCode: string;
  planIntitule: string;
  mouvementsGenerauxDebit: number;
  mouvementsGenerauxCredit: number;
  mouvementsAnalytiquesDebit: number;
  mouvementsAnalytiquesCredit: number;
  ecartDebit: number;
  ecartCredit: number;
  /** Lignes qui auraient dû être ventilées et ne le sont pas. */
  lignesSansRepartition: {
    ecritureId: string;
    date: string;
    journal: string;
    compteNumero: string;
    compteIntitule: string;
    libelle: string;
    debit: number;
    credit: number;
  }[];
}

/**
 * ÉTATS ANALYTIQUES ET BUDGÉTAIRES.
 *
 * Quatre états, repris des manuels Sage et recalés sur le SYCEBNL (voir
 * docs/analytique-et-budget.md) :
 *
 *  - la BALANCE analytique : mouvements et solde par section ;
 *  - le GRAND LIVRE analytique : le détail d'une section, solde progressif ;
 *  - le CONTRÔLE DES CUMULS : cumuls généraux face aux cumuls analytiques,
 *    écarts, et liste des écritures qui auraient dû être ventilées. C'est
 *    l'état qui prouve à un bailleur que le total par projet égale le total
 *    comptable · sans lui, un rapport d'exécution n'est pas défendable ;
 *  - l'ÉTAT BUDGÉTAIRE : prévu, réalisé, écart, avec les sections mouvementées
 *    sans budget marquées « hors budget » (option « comptes non budgétisés »
 *    de Sage) · c'est précisément ce qu'un financeur veut voir.
 */
@Injectable()
export class EtatsAnalytiquesService {
  constructor(private readonly prisma: PrismaService) {}

  private async plan(tenantId: string, planId: string) {
    const plan = await this.prisma.planAnalytique.findFirst({ where: { id: planId, tenantId } });
    if (!plan) throw new NotFoundException('Plan analytique introuvable pour ce dossier');
    return plan;
  }

  private async bornes(tenantId: string, exerciceId: string, dateDebut?: string, dateFin?: string) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce dossier');
    return {
      exercice,
      du: dateDebut ? new Date(dateDebut) : exercice.dateDebut,
      au: dateFin ? new Date(dateFin) : exercice.dateFin,
    };
  }

  /**
   * Balance analytique. Les sections Total ne portent pas de ventilation :
   * elles totalisent leurs sections Détail de même racine, exactement comme
   * un compte Total totalise ses comptes Détail dans la balance générale.
   */
  async balance(
    tenantId: string,
    params: { planId: string; exerciceId: string; dateDebut?: string; dateFin?: string },
  ): Promise<{ lignes: LigneBalanceAnalytique[]; totaux: { debit: number; credit: number; solde: number } }> {
    await this.plan(tenantId, params.planId);
    const { du, au } = await this.bornes(tenantId, params.exerciceId, params.dateDebut, params.dateFin);

    const sections = await this.prisma.sectionAnalytique.findMany({
      where: { planId: params.planId },
      orderBy: { code: 'asc' },
    });
    const ventilations = await this.prisma.ventilationAnalytique.groupBy({
      by: ['sectionId'],
      where: {
        planId: params.planId,
        ligne: { ecriture: { tenantId, exerciceId: params.exerciceId, date: { gte: du, lte: au } } },
      },
      _sum: { debit: true, credit: true },
    });
    const cumuls = new Map(ventilations.map((v) => [v.sectionId, v._sum]));

    const lignes: LigneBalanceAnalytique[] = sections.map((s) => {
      if (s.type === TypeCompteDetailTotal.TOTAL) {
        // Racine : on additionne les sections Détail dont le code commence
        // par celui de la section Total.
        const filles = sections.filter((f) => f.type === TypeCompteDetailTotal.DETAIL && f.code.startsWith(s.code));
        const debit = filles.reduce((t, f) => t + Number(cumuls.get(f.id)?.debit ?? 0), 0);
        const credit = filles.reduce((t, f) => t + Number(cumuls.get(f.id)?.credit ?? 0), 0);
        return { sectionId: s.id, code: s.code, intitule: s.intitule, type: s.type, debit, credit, solde: debit - credit };
      }
      const debit = Number(cumuls.get(s.id)?.debit ?? 0);
      const credit = Number(cumuls.get(s.id)?.credit ?? 0);
      return { sectionId: s.id, code: s.code, intitule: s.intitule, type: s.type, debit, credit, solde: debit - credit };
    });

    const detail = lignes.filter((l) => l.type === TypeCompteDetailTotal.DETAIL);
    return {
      lignes,
      totaux: {
        debit: detail.reduce((t, l) => t + l.debit, 0),
        credit: detail.reduce((t, l) => t + l.credit, 0),
        solde: detail.reduce((t, l) => t + l.solde, 0),
      },
    };
  }

  /** Grand livre analytique d'une section, avec solde progressif. */
  async grandLivre(
    tenantId: string,
    params: { sectionId: string; exerciceId: string; dateDebut?: string; dateFin?: string },
  ) {
    const section = await this.prisma.sectionAnalytique.findFirst({
      where: { id: params.sectionId, tenantId },
      include: { plan: { select: { code: true, intitule: true } } },
    });
    if (!section) throw new NotFoundException('Section analytique introuvable pour ce dossier');
    const { du, au } = await this.bornes(tenantId, params.exerciceId, params.dateDebut, params.dateFin);

    const ventilations = await this.prisma.ventilationAnalytique.findMany({
      where: {
        sectionId: params.sectionId,
        ligne: { ecriture: { tenantId, exerciceId: params.exerciceId, date: { gte: du, lte: au } } },
      },
      include: {
        ligne: {
          include: {
            compte: { select: { numero: true, intitule: true } },
            ecriture: { select: { id: true, date: true, libelle: true, numeroPiece: true, journal: { select: { code: true } } } },
          },
        },
      },
    });

    ventilations.sort((a, b) => {
      const d = a.ligne.ecriture.date.getTime() - b.ligne.ecriture.date.getTime();
      return d !== 0 ? d : (a.ligne.ecriture.numeroPiece ?? 0) - (b.ligne.ecriture.numeroPiece ?? 0);
    });

    let cumul = 0;
    const lignes: LigneGrandLivreAnalytique[] = ventilations.map((v) => {
      cumul += Number(v.debit) - Number(v.credit);
      return {
        date: v.ligne.ecriture.date.toISOString().slice(0, 10),
        journal: v.ligne.ecriture.journal.code,
        numeroPiece: v.ligne.ecriture.numeroPiece,
        compteNumero: v.ligne.compte.numero,
        compteIntitule: v.ligne.compte.intitule,
        libelle: v.ligne.libelle ?? v.ligne.ecriture.libelle,
        debit: Number(v.debit),
        credit: Number(v.credit),
        soldeProgressif: cumul,
      };
    });

    return {
      section: {
        id: section.id,
        code: section.code,
        intitule: section.intitule,
        plan: section.plan,
        dateDebut: section.dateDebut?.toISOString().slice(0, 10) ?? null,
        dateFin: section.dateFin?.toISOString().slice(0, 10) ?? null,
      },
      lignes,
      totaux: {
        debit: lignes.reduce((t, l) => t + l.debit, 0),
        credit: lignes.reduce((t, l) => t + l.credit, 0),
        solde: cumul,
      },
    };
  }

  /**
   * Contrôle des cumuls. Compare, pour chaque plan, les mouvements généraux
   * des comptes que le plan est censé ventiler aux mouvements effectivement
   * ventilés, et liste les écritures manquantes. Un écart non nul n'est pas
   * une anomalie technique : c'est du travail de ventilation qui reste à
   * faire, et l'état dit exactement lequel.
   */
  async controleCumuls(
    tenantId: string,
    params: { exerciceId: string; dateDebut?: string; dateFin?: string; planId?: string },
  ): Promise<LigneControleCumuls[]> {
    const { du, au } = await this.bornes(tenantId, params.exerciceId, params.dateDebut, params.dateFin);
    const plans = await this.prisma.planAnalytique.findMany({
      where: { tenantId, estActif: true, ...(params.planId ? { id: params.planId } : {}) },
      orderBy: [{ ordre: 'asc' }, { code: 'asc' }],
    });

    const resultats: LigneControleCumuls[] = [];
    for (const plan of plans) {
      const classes = plan.classesVentilees
        .split(',')
        .map((c) => `CLASSE_${c}` as ClasseCompte)
        .filter((c) => Object.values(ClasseCompte).includes(c));

      const lignesConcernees = await this.prisma.ligneEcriture.findMany({
        where: {
          ecriture: { tenantId, exerciceId: params.exerciceId, date: { gte: du, lte: au } },
          compte: { classe: { in: classes } },
        },
        include: {
          compte: { select: { numero: true, intitule: true } },
          ecriture: { select: { id: true, date: true, libelle: true, journal: { select: { code: true } } } },
          ventilations: { where: { planId: plan.id }, select: { debit: true, credit: true } },
        },
      });

      let generalDebit = 0;
      let generalCredit = 0;
      let analytiqueDebit = 0;
      let analytiqueCredit = 0;
      const sansRepartition: LigneControleCumuls['lignesSansRepartition'] = [];

      for (const l of lignesConcernees) {
        generalDebit += Number(l.debit);
        generalCredit += Number(l.credit);
        for (const v of l.ventilations) {
          analytiqueDebit += Number(v.debit);
          analytiqueCredit += Number(v.credit);
        }
        if (l.ventilations.length === 0 && (Number(l.debit) !== 0 || Number(l.credit) !== 0)) {
          sansRepartition.push({
            ecritureId: l.ecriture.id,
            date: l.ecriture.date.toISOString().slice(0, 10),
            journal: l.ecriture.journal.code,
            compteNumero: l.compte.numero,
            compteIntitule: l.compte.intitule,
            libelle: l.libelle ?? l.ecriture.libelle,
            debit: Number(l.debit),
            credit: Number(l.credit),
          });
        }
      }

      resultats.push({
        planId: plan.id,
        planCode: plan.code,
        planIntitule: plan.intitule,
        mouvementsGenerauxDebit: generalDebit,
        mouvementsGenerauxCredit: generalCredit,
        mouvementsAnalytiquesDebit: analytiqueDebit,
        mouvementsAnalytiquesCredit: analytiqueCredit,
        ecartDebit: generalDebit - analytiqueDebit,
        ecartCredit: generalCredit - analytiqueCredit,
        lignesSansRepartition: sansRepartition,
      });
    }
    return resultats;
  }

  /**
   * État budgétaire : prévu, réalisé, écart, par section.
   *
   * Le RÉALISÉ d'une section est le solde de ses ventilations, mais lu du bon
   * côté : une section de dépenses se consomme au débit, une section de
   * ressources s'exécute au crédit. Plutôt que d'imposer un sens à la section,
   * on retient la valeur absolue du solde · une section ne mélange pas les
   * deux en pratique, et le signe brut ferait apparaître un budget « négatif »
   * sur les ressources.
   *
   * Une section mouvementée sans budget est marquée `horsBudget` : c'est
   * l'option « impression des comptes non budgétisés » de Sage, et pour un
   * bailleur c'est la ligne la plus importante de l'état.
   */
  async etatBudgetaire(
    tenantId: string,
    params: { planId: string; exerciceId: string; dateDebut?: string; dateFin?: string; mois?: number },
  ): Promise<{ lignes: LigneEtatBudgetaire[]; totaux: LigneEtatBudgetaire }> {
    const plan = await this.plan(tenantId, params.planId);
    if (!plan.gererBudgets) {
      throw new BadRequestException(`Le plan ${plan.code} ne gère pas les budgets.`);
    }
    const { exercice, du, au } = await this.bornes(tenantId, params.exerciceId, params.dateDebut, params.dateFin);

    // Un mois demandé restreint la fenêtre de réalisé ET la dotation lue.
    let debut = du;
    let fin = au;
    if (params.mois) {
      const annee = exercice.dateDebut.getFullYear() + (params.mois < exercice.dateDebut.getMonth() + 1 ? 1 : 0);
      debut = new Date(annee, params.mois - 1, 1);
      fin = new Date(annee, params.mois, 0, 23, 59, 59);
    }

    const sections = await this.prisma.sectionAnalytique.findMany({
      where: { planId: params.planId, type: TypeCompteDetailTotal.DETAIL },
      orderBy: { code: 'asc' },
    });
    const budgets = await this.prisma.budgetSection.findMany({
      where: {
        exerciceId: params.exerciceId,
        sectionId: { in: sections.map((s) => s.id) },
        mois: params.mois ?? null,
      },
    });
    const ventilations = await this.prisma.ventilationAnalytique.groupBy({
      by: ['sectionId'],
      where: {
        planId: params.planId,
        ligne: { ecriture: { tenantId, exerciceId: params.exerciceId, date: { gte: debut, lte: fin } } },
      },
      _sum: { debit: true, credit: true },
    });
    const cumuls = new Map(ventilations.map((v) => [v.sectionId, v._sum]));

    const lignes: LigneEtatBudgetaire[] = sections.map((s) => {
      const budget = Number(budgets.find((b) => b.sectionId === s.id)?.montant ?? 0);
      const somme = cumuls.get(s.id);
      const realise = Math.abs(Number(somme?.debit ?? 0) - Number(somme?.credit ?? 0));
      return {
        sectionId: s.id,
        code: s.code,
        intitule: s.intitule,
        budget,
        realise,
        ecart: budget - realise,
        tauxConsommation: budget !== 0 ? (realise / budget) * 100 : null,
        horsBudget: budget === 0 && realise !== 0,
      };
    });

    const budgetTotal = lignes.reduce((t, l) => t + l.budget, 0);
    const realiseTotal = lignes.reduce((t, l) => t + l.realise, 0);
    return {
      lignes,
      totaux: {
        sectionId: null,
        code: '',
        intitule: 'Total',
        budget: budgetTotal,
        realise: realiseTotal,
        ecart: budgetTotal - realiseTotal,
        tauxConsommation: budgetTotal !== 0 ? (realiseTotal / budgetTotal) * 100 : null,
        horsBudget: false,
      },
    };
  }
}

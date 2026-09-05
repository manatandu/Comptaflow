import { Injectable, NotFoundException } from '@nestjs/common';
import { StatutEcriture } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { LigneBalancePourEtat, chargerLignes, correspond } from './etats-financiers.communs';
import { EngagementService } from '../analytique/engagement.service';
import { COMPTES_TRESORERIE_PROJET } from './correspondance-projet-emplois-ressources';

/**
 * TABLEAU D'EXÉCUTION BUDGÉTAIRE et TABLEAU DE RÉCONCILIATION DE TRÉSORERIE
 * du jeu SYCEBNL « projets de développement et assimilés » (Partie 4, ch. 3,
 * Sections 2 et 3 · le premier est aussi la NOTE 24 du même chapitre).
 *
 * Ces deux tableaux étaient déclarés hors périmètre. Le premier l'était à
 * juste titre tant que le logiciel n'avait pas de brique budgétaire ; il ne
 * l'est plus depuis que `BudgetSection` existe, et sa règle de remplissage
 * figure au **Guide d'application, chapitre 7, APPLICATION 22**.
 */

// ---------------------------------------------------------------------------
// TABLEAU D'EXÉCUTION BUDGÉTAIRE
// ---------------------------------------------------------------------------

export interface LigneExecutionBudgetaire {
  code: string;
  libelle: string;
  budget: number;
  decaissement: number;
  /**
   * Les deux moitiés de la colonne Engagement (3), rendues séparément parce
   * qu'un réviseur doit pouvoir dire d'où vient chaque franc : l'une se
   * recoupe avec la balance, l'autre avec un registre. Un total qui les
   * mêlerait ne serait justifiable ni par l'une ni par l'autre.
   */
  engagementComptable: number;
  engagementHorsComptabilite: number;
  engagement: number;
  realisation: number;
  creditDisponible: number;
  /** `null` quand le budget est nul · diviser par zéro n'a pas de sens. */
  executionPourcent: number | null;
}

@Injectable()
export class EtatsFinanciersProjetBudgetService {
  constructor(
    private readonly ecritureService: EcritureService,
    private readonly prisma: PrismaService,
    private readonly engagementService: EngagementService,
  ) {}

  private async chargerLignes(tenantId: string, exerciceId: string): Promise<LigneBalancePourEtat[]> {
    return chargerLignes(this.ecritureService, tenantId, exerciceId);
  }

  /**
   * TABLEAU SUIVI EXÉCUTION BUDGET · colonnes officielles :
   * Code | Libellé | Budget (1) | Décaissement (2) | Engagement (3) |
   * Réalisation (4 = 2+3) | Crédit disponible (5 = 1-4) | Exécution % (4/1).
   *
   * ## La nomenclature budgétaire
   *
   * Le guide dit : « Remplir, code et libellé, suivant la NOMENCLATURE
   * BUDGÉTAIRE DU PROJET », et « le plan comptable doit être conçu en tenant
   * compte du budget du projet ». Dans OmegaX cette nomenclature est un PLAN
   * ANALYTIQUE : ses sections portent un code, un intitulé et un budget par
   * exercice (`BudgetSection`). Le tableau est donc produit pour un plan
   * donné, une ligne par section.
   *
   * ## Décaissement contre engagement
   *
   * Le guide définit le décaissement par les mouvements débit des comptes 2,
   * 6 et 8 corrigés des variations de dettes fournisseurs, et l'engagement
   * par « le solde créditeur balance N des comptes fournisseurs
   * d'exploitation (40) et d'investissement (481) ». Autrement dit : ce qui
   * est engagé mais pas encore payé est un engagement, le reste est un
   * décaissement.
   *
   * Ces deux définitions sont globales ; le tableau, lui, est PAR LIGNE
   * BUDGÉTAIRE. Une variation de solde du compte 401 ne se répartit pas
   * entre lignes budgétaires : le compte fournisseur n'est pas ventilé, c'est
   * la charge qui l'est. La règle est donc appliquée à la source, écriture
   * par écriture, ce qui donne le même résultat en agrégé tout en étant
   * exact par section :
   *
   *  - une dépense dont l'écriture a touché la trésorerie est DÉCAISSÉE ;
   *  - une dépense passée en compte de tiers est ENGAGÉE tant que la ligne de
   *    tiers correspondante n'est pas lettrée, DÉCAISSÉE une fois lettrée.
   *
   * C'est aussi ce qui donne son utilité au lettrage sur ce jeu d'états : il
   * ne sert pas qu'à justifier un solde, il fait basculer une dépense de la
   * colonne Engagement à la colonne Décaissement.
   *
   * ## Les deux termes NON COMPTABLES de la colonne Engagement
   *
   * Le guide ajoute à l'engagement « les bons de commande de biens et
   * services remis aux fournisseurs au cours de l'exercice budgétaire, non
   * exécutés » et « les contrats signés par les parties prenantes au cours de
   * l'exercice budgétaire, non exécutés ». Ni les uns ni les autres ne sont
   * des écritures : un bon de commande remis ne débite ni ne crédite rien, et
   * c'est pour cela même qu'il engage le budget sans apparaître dans les
   * comptes.
   *
   * Le tableau les DÉCLARAIT hors de portée et demandait à l'utilisateur de
   * les ajouter à la main sur l'état imprimé. C'était honnête tant que rien ne
   * les tenait, et c'était faux dès qu'un bailleur lisait le crédit
   * disponible : celui-ci était surévalué de tout ce qui était commandé sans
   * être encore facturé. Le registre `EngagementDepense` les tient depuis, et
   * ce qui entre ici est le RESTE À EXÉCUTER de chacun, jamais son montant
   * entier · un bon de commande déjà facturé pèse par les comptes, et l'y
   * ajouter une seconde fois compterait la même dépense deux fois sans
   * qu'aucun contrôle d'équilibre ne puisse le voir.
   *
   * Les deux moitiés restent SÉPARÉES dans la sortie. Un réviseur recoupe
   * l'une avec la balance et l'autre avec un registre de bons de commande :
   * un total fondu ne serait justifiable par aucun des deux documents.
   */
  async executionBudgetaire(tenantId: string, exerciceId: string, planId?: string) {
    const plan = planId
      ? await this.prisma.planAnalytique.findFirst({ where: { id: planId, tenantId } })
      : await this.prisma.planAnalytique.findFirst({
          where: { tenantId, estActif: true, gererBudgets: true },
          orderBy: { ordre: 'asc' },
        });
    if (!plan) {
      throw new NotFoundException(
        "Aucun plan analytique à budgets n'est défini pour ce dossier. Le tableau d'exécution budgétaire suit la nomenclature budgétaire du projet : créez un plan analytique et ses sections avant de l'établir.",
      );
    }

    const [sections, budgets, ecritures, resteEngageParSection] = await Promise.all([
      this.prisma.sectionAnalytique.findMany({
        where: { planId: plan.id, tenantId },
        orderBy: { code: 'asc' },
      }),
      this.prisma.budgetSection.findMany({ where: { exerciceId, section: { planId: plan.id } } }),
      this.prisma.ecriture.findMany({
        where: { tenantId, exerciceId, statut: StatutEcriture.VALIDEE, estGenereeParCloture: false },
        include: {
          lignes: {
            include: { compte: true, ventilations: true },
          },
        },
      }),
      this.engagementService.resteParSection(tenantId, exerciceId),
    ]);

    const budgetParSection = new Map<string, number>();
    for (const b of budgets) {
      budgetParSection.set(b.sectionId, (budgetParSection.get(b.sectionId) ?? 0) + Number(b.montant));
    }

    const decaisseParSection = new Map<string, number>();
    const engageParSection = new Map<string, number>();

    for (const e of ecritures) {
      const toucheTresorerie = e.lignes.some((l) => correspond(l.compte.numero, COMPTES_TRESORERIE_PROJET));
      // Lignes de tiers fournisseurs de cette écriture · leur lettrage dit si
      // la dépense a fini par être payée.
      const lignesFournisseurs = e.lignes.filter((l) => correspond(l.compte.numero, ['40', '481']));
      const toutesLettrees = lignesFournisseurs.length > 0 && lignesFournisseurs.every((l) => l.lettre !== null);
      const decaissee = toucheTresorerie || toutesLettrees;

      for (const l of e.lignes) {
        for (const v of l.ventilations) {
          if (v.planId !== plan.id) continue;
          const montant = Number(v.debit) - Number(v.credit);
          if (Math.abs(montant) < 0.005) continue;
          const cible = decaissee ? decaisseParSection : engageParSection;
          cible.set(v.sectionId, (cible.get(v.sectionId) ?? 0) + montant);
        }
      }
    }

    const lignes: LigneExecutionBudgetaire[] = sections.map((s) => {
      const budget = budgetParSection.get(s.id) ?? 0;
      const decaissement = decaisseParSection.get(s.id) ?? 0;
      const engagementComptable = engageParSection.get(s.id) ?? 0;
      const engagementHorsComptabilite = resteEngageParSection.get(s.id) ?? 0;
      const engagement = engagementComptable + engagementHorsComptabilite;
      const realisation = decaissement + engagement;
      return {
        code: s.code,
        libelle: s.intitule,
        budget,
        decaissement,
        engagementComptable,
        engagementHorsComptabilite,
        engagement,
        realisation,
        creditDisponible: budget - realisation,
        executionPourcent: Math.abs(budget) < 0.005 ? null : (realisation / budget) * 100,
      };
    });

    const total = lignes.reduce(
      (t, l) => ({
        budget: t.budget + l.budget,
        decaissement: t.decaissement + l.decaissement,
        engagementComptable: t.engagementComptable + l.engagementComptable,
        engagementHorsComptabilite: t.engagementHorsComptabilite + l.engagementHorsComptabilite,
        engagement: t.engagement + l.engagement,
        realisation: t.realisation + l.realisation,
        creditDisponible: t.creditDisponible + l.creditDisponible,
      }),
      {
        budget: 0,
        decaissement: 0,
        engagementComptable: 0,
        engagementHorsComptabilite: 0,
        engagement: 0,
        realisation: 0,
        creditDisponible: 0,
      },
    );

    return {
      plan: { id: plan.id, code: plan.code, intitule: plan.intitule },
      lignes,
      total: {
        ...total,
        executionPourcent: Math.abs(total.budget) < 0.005 ? null : (total.realisation / total.budget) * 100,
      },
      // La mention ne DISPARAÎT pas : elle change de sens. Elle disait « le
      // logiciel ne les tient pas » ; elle dit maintenant d'où ils viennent et
      // ce qui les rend complets, à savoir la tenue du registre. Un engagement
      // non saisi reste invisible, et le taire ferait croire à une exhaustivité
      // que seul le comptable peut donner.
      engagementsHorsComptabilite:
        "La colonne Engagement réunit les trois termes du guide (ch. 7, APPLICATION 22, règle (d)) : le solde créditeur des comptes fournisseurs d'exploitation (40) et d'investissement (481), les bons de commande remis aux fournisseurs non exécutés, et les contrats signés non exécutés. Les deux derniers ne sont pas des écritures : ils viennent du registre des engagements, pour leur RESTE À EXÉCUTER. Un engagement qui n'y est pas saisi ne pèse pas sur ce tableau.",
    };
  }

  // -------------------------------------------------------------------------
  // TABLEAU DE RÉCONCILIATION DE TRÉSORERIE (Section 3, repères A à I)
  // -------------------------------------------------------------------------

  /**
   * TABLEAU DE RÉCONCILIATION DE LA TRÉSORERIE.
   *
   * Le chapitre 3 donne les neuf libellés et leur formule
   * (G = A+B+C+D-E-F, I = G-H) mais aucun rattachement aux comptes, et le
   * guide d'application n'en donne pas non plus. Les libellés sont toutefois
   * explicites, et le rattachement se lit dans les CONTREPARTIES des
   * mouvements de trésorerie · même mécanique que le journal unique du
   * Système Minimal de Trésorerie.
   *
   * Deux repères ne se calculent pas, et l'état le dit au lieu de les
   * inventer :
   *
   *  - **E, virements sur comptes opérationnels.** Le tableau est écrit du
   *    point de vue du COMPTE SPÉCIAL du projet, celui que le bailleur
   *    alimente, et retranche ce qui en part vers les comptes opérationnels.
   *    Aucun modèle du logiciel ne désigne le compte spécial. Le tableau est
   *    donc établi sur la trésorerie CONSOLIDÉE du dossier, où les virements
   *    internes s'annulent d'eux-mêmes : E vaut zéro, et ce n'est pas une
   *    approximation mais la valeur exacte de ce périmètre.
   *  - **H, paiements en instance.** Chèques émis non encaissés, ordres de
   *    virement en cours : par nature extra-comptables. Le montant est un
   *    paramètre de l'état, à saisir par l'entité, et il est repris tel quel
   *    sur l'impression.
   */
  async reconciliationTresorerie(tenantId: string, exerciceId: string, paiementsEnInstance = 0) {
    const [lignes, ecritures] = await Promise.all([
      this.chargerLignes(tenantId, exerciceId),
      this.prisma.ecriture.findMany({
        where: { tenantId, exerciceId, statut: StatutEcriture.VALIDEE, estGenereeParCloture: false },
        include: { lignes: { include: { compte: true } } },
      }),
    ]);

    const estTresorerie = (numero: string) => correspond(numero, COMPTES_TRESORERIE_PROJET);
    const lignesTresorerie = lignes.filter((l) => estTresorerie(l.numero));
    const tresorerieDebut = lignesTresorerie.reduce((s, l) => s + l.reportDebit - l.reportCredit, 0);
    const tresorerieFin = lignesTresorerie.reduce((s, l) => s + l.solde, 0);

    // Ventilation des encaissements par nature de contrepartie, et total des
    // décaissements · les virements internes (flux net nul) sont écartés,
    // c'est ce qui rend E égal à zéro sur un périmètre consolidé.
    let fondsBailleurs = 0;
    let interets = 0;
    let autresFonds = 0;
    let depenses = 0;

    for (const e of ecritures) {
      const tresorerie = e.lignes.filter((l) => estTresorerie(l.compte.numero));
      if (tresorerie.length === 0) continue;
      const flux = tresorerie.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
      if (Math.abs(flux) < 0.005) continue;
      if (flux < 0) {
        depenses += -flux;
        continue;
      }
      for (const l of e.lignes.filter((x) => !estTresorerie(x.compte.numero))) {
        const contribution = Number(l.credit) - Number(l.debit);
        if (Math.abs(contribution) < 0.005) continue;
        // 161 à 164 (fonds d'investissement) et 462 à 464 (fonds
        // d'administration) · Partie 3, ch. 3, décaissement des bailleurs.
        if (correspond(l.compte.numero, ['161', '162', '163', '164', '462', '463', '464'])) {
          fondsBailleurs += contribution;
        } else if (correspond(l.compte.numero, ['77'])) {
          interets += contribution;
        } else {
          autresFonds += contribution;
        }
      }
    }

    const g = tresorerieDebut + fondsBailleurs + interets + autresFonds - 0 - depenses;
    const repere = (rep: string, libelle: string, montant: number) => ({ rep, libelle, montant });

    return {
      lignes: [
        repere('A', 'TRESORERIE EN DEBUT EXERCICE N', tresorerieDebut),
        repere('B', "FONDS RECUS DES BAILLEURS AU COURS DE L'EXERCICE N", fondsBailleurs),
        repere('C', "INTERETS RECUS AU COURS DE L'EXERCICE N", interets),
        repere('D', "AUTRES FONDS REÇUS AU COURS DE L'EXERCICE N", autresFonds),
        repere('E', 'VIREMENTS SUR COMPTES OPÉRATIONNELS', 0),
        repere('F', "DEPENSES DE L'EXERCICE N", depenses),
        repere('G', "TRESORERIE EN FIN D'EXERCICE N (A+B+C+D-E-F)", g),
        repere('H', 'PAIEMENTS EN INSTANCE', paiementsEnInstance),
        repere('I', 'TRESORERIE NET DES PAIEMENTS EN INSTANCE (G-H)', g - paiementsEnInstance),
      ],
      controle: {
        // G, reconstitué depuis les flux, doit égaler la trésorerie de
        // clôture lue à la balance. C'est le seul contrôle possible sur cet
        // état, le texte n'en prévoyant aucun.
        tresorerieBalance: tresorerieFin,
        ecart: g - tresorerieFin,
        boucle: Math.abs(g - tresorerieFin) < 0.01,
      },
      avertissements: [
        "Repère E : le tableau officiel est écrit du point de vue du compte spécial alimenté par le bailleur et retranche les virements vers les comptes opérationnels. Aucun modèle du logiciel ne désigne ce compte spécial ; l'état est donc établi sur la trésorerie consolidée du dossier, où les virements internes s'annulent. E vaut zéro par construction, ce n'est pas une omission.",
        "Repère H : les paiements en instance (chèques émis non encaissés, virements en cours) sont extra-comptables. Le montant est celui que vous avez saisi ; il n'est pas déduit de la comptabilité.",
      ],
    };
  }
}

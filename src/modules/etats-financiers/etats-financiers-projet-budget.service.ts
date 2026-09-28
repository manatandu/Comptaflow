import { Injectable, NotFoundException } from '@nestjs/common';
import { StatutEcriture, TypeCompteDetailTotal } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { LOT_ECRITURES, LOT_LECTURE, lireParLots, pageApres } from '../../common/lecture-par-lots';
import { EcritureService } from '../comptabilite/ecriture.service';
import { LigneBalancePourEtat, chargerLignes, correspond } from './etats-financiers.communs';
import { EngagementService } from '../analytique/engagement.service';
import { totalDesFeuilles, valeurDeLaLigne } from '../analytique/rubriques-budgetaires';
import { COMPTES_TRESORERIE_PROJET } from './correspondance-projet-emplois-ressources';
import { ouverteALaCloture } from '../lettrage/ouverte-a-la-cloture';
import { exerciceDuDossierOuRefus } from '../../common/exercice-introuvable';

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
  /** Vrai pour une RUBRIQUE (section Total) · sous-total de ses feuilles. */
  estRubrique: boolean;
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

/**
 * Les comptes dont le solde créditeur fait l'engagement · « compte 40 » et
 * « compte 481 », le 409 (avances et acomptes versés) écarté comme au (c).
 */
const COMPTES_ENGAGEMENT = ['40', '481'];

/**
 * LE SEUL REFUS QUI APPELLE LE REPLI « EN SAISIE » (audit final F83) · le
 * dossier n'a aucun plan analytique à budgets, et n'a donc rien à exécuter.
 * La note 35 (24) et la liasse attrapaient TOUTE erreur pour se replier ·
 * une panne du calcul sortait une note vierge, et une grille à remplir,
 * sous le motif « aucun plan à budgets », qui était faux. Une classe
 * nommée, pour qu'aucun autre 404 ne passe pour celui-là.
 */
export class AucunPlanABudgetsException extends NotFoundException {}

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
   * Parmi les lignes fournisseurs NOMMÉES, celles qui sont encore dues à la
   * clôture · non lettrées, ou soldées par un règlement postérieur (règle de
   * F10, `ouverteALaCloture`, écrite une seule fois).
   *
   * LA QUESTION SE POSE LOT PAR LOT (audit final F187). Elle se posait sur
   * tout l'exercice d'un coup, pour tous les 40 et 481, et la réponse restait
   * en mémoire le temps du tableau. Posée sur les seules lignes candidates
   * d'une tranche, elle rend la même appartenance pour chacune d'elles, et
   * la mémoire ne dépend plus de la taille du dossier. Les identifiants
   * partent par paquets de LOT_LECTURE · une écriture importée peut porter
   * des milliers de lignes fournisseurs, et une liste `in` sans borne
   * rencontrerait la limite des paramètres liés de la base.
   */
  private async lignesOuvertesParmi(
    tenantId: string,
    exerciceId: string,
    dateFin: Date,
    ids: readonly string[],
  ): Promise<Set<string>> {
    const ouvertes = new Set<string>();
    for (let i = 0; i < ids.length; i += LOT_LECTURE) {
      const lignes = await this.prisma.ligneEcriture.findMany({
        where: {
          id: { in: ids.slice(i, i + LOT_LECTURE) },
          ecriture: { tenantId, exerciceId, statut: StatutEcriture.VALIDEE },
          ...ouverteALaCloture(dateFin),
        },
        select: { id: true },
      });
      for (const l of lignes) ouvertes.add(l.id);
    }
    return ouvertes;
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
    // L'EXERCICE SE VÉRIFIE AVANT LE PLAN (jumeau de l'audit final F222). Lu
    // après, un exercice d'un autre dossier tombait en 500 sur
    // `findFirstOrThrow` quand le plan existait, et sous le motif « aucun
    // plan à budgets » quand il n'existait pas · ce second refus est le seul
    // que la note 35 (24) rattrape pour se replier en saisie, si bien qu'un
    // exercice inconnu y aurait servi une grille vierge au lieu d'un 404.
    const exercice = exerciceDuDossierOuRefus(
      await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId }, select: { dateFin: true } }),
    );
    const plan = planId
      ? await this.prisma.planAnalytique.findFirst({ where: { id: planId, tenantId } })
      : await this.prisma.planAnalytique.findFirst({
          where: { tenantId, estActif: true, gererBudgets: true },
          orderBy: { ordre: 'asc' },
        });
    if (!plan) {
      throw new AucunPlanABudgetsException(
        "Aucun plan analytique à budgets n'est défini pour ce dossier. Le tableau d'exécution budgétaire suit la nomenclature budgétaire du projet : créez un plan analytique et ses sections avant de l'établir.",
      );
    }

    const decaisseParSection = new Map<string, number>();
    const engageParSection = new Map<string, number>();

    const toucheTresorerie = (lignes: readonly { compte: { numero: string } }[]) =>
      lignes.some((l) => correspond(l.compte.numero, COMPTES_TRESORERIE_PROJET));
    // L'ENGAGEMENT EST LE SEUL « solde créditeur balance N des comptes
    // fournisseurs d'exploitation (compte 40) et d'investissement (compte
    // 481) » (SYCEBNL, Guide d'application, Application 22, (d)). Tout le
    // reste des débits des classes 2, 6 et 8 est DÉCAISSEMENT, (c) · une
    // paie 661/422, une dotation, une OD n'ont aucune ligne fournisseur et
    // restaient « engagées » pour toujours (audit final F11). Les 42 et 43
    // n'entrent pas dans l'engagement : le guide ne les y met pas.
    const estFournisseurQuiEngage = (numero: string) => correspond(numero, COMPTES_ENGAGEMENT, ['409']);

    /*
      L'EXERCICE SE LIT PAR TRANCHES (audit final F187). Le tableau chargeait
      d'un coup toutes les écritures validées de l'exercice, chacune avec ses
      lignes, la fiche entière de leur compte et toutes leurs ventilations, et
      il le faisait à chaque ouverture des notes 35 et 24 · le motif même qui
      a fait tomber le banc d'un million de lignes. C'est un DOCUMENT, il ne se
      tronque pas : il se lit en entier, une tranche de LOT_ECRITURES à la
      fois, et ne garde que ses deux cumuls par section.

      TROIS RESSERREMENTS, AUCUN NE CHANGE UN MONTANT.
       · Seules les écritures dont une ligne est ventilée sur CE plan sont
         lues · une écriture sans ventilation du plan (un règlement, un
         encaissement, une écriture de bilan) n'ajoute rien aux cumuls.
       · De chaque ligne, seuls son identifiant, le numéro de son compte et
         ses ventilations du plan · c'est tout ce que le classement lit. Les
         AUTRES lignes de l'écriture restent toutes lues, parce que le
         classement se fait sur l'écriture entière (trésorerie touchée,
         fournisseur encore dû).
       · Les lignes fournisseurs ouvertes à la clôture ne sont plus cherchées
         sur tout l'exercice, mais parmi les seules candidates de la tranche
         (`lignesOuvertesParmi`) · même règle, même réponse pour chacune.
    */
    const parcours = lireParLots(
      async (curseur) => {
        const lot = await this.prisma.ecriture.findMany({
          where: {
            tenantId,
            exerciceId,
            statut: StatutEcriture.VALIDEE,
            estGenereeParCloture: false,
            lignes: { some: { ventilations: { some: { planId: plan.id } } } },
          },
          select: {
            id: true,
            lignes: {
              select: {
                id: true,
                compte: { select: { numero: true } },
                ventilations: {
                  where: { planId: plan.id },
                  select: { planId: true, sectionId: true, debit: true, credit: true },
                },
              },
            },
          },
          ...pageApres(curseur, LOT_ECRITURES),
        });
        // Une écriture qui touche la trésorerie est décaissée quoi qu'elle
        // porte d'autre · ses lignes fournisseurs ne sont pas des candidates.
        const candidates = lot
          .filter((e) => !toucheTresorerie(e.lignes))
          .flatMap((e) => e.lignes.filter((l) => estFournisseurQuiEngage(l.compte.numero)).map((l) => l.id));
        const ouvertes = await this.lignesOuvertesParmi(tenantId, exerciceId, exercice.dateFin, candidates);
        return lot.map((e) => ({
          id: e.id,
          lignes: e.lignes,
          engagee:
            !toucheTresorerie(e.lignes) &&
            e.lignes.some((l) => estFournisseurQuiEngage(l.compte.numero) && ouvertes.has(l.id)),
        }));
      },
      (e) => {
        const cible = e.engagee ? engageParSection : decaisseParSection;
        for (const l of e.lignes) {
          for (const v of l.ventilations) {
            if (v.planId !== plan.id) continue;
            const montant = Number(v.debit) - Number(v.credit);
            if (Math.abs(montant) < 0.005) continue;
            cible.set(v.sectionId, (cible.get(v.sectionId) ?? 0) + montant);
          }
        }
      },
      LOT_ECRITURES,
    );

    const [sections, budgets, resteEngageParSection, nombreOd] = await Promise.all([
      this.prisma.sectionAnalytique.findMany({
        where: { planId: plan.id, tenantId },
        orderBy: { code: 'asc' },
      }),
      // LA DOTATION ANNUELLE SEULE (audit final F37) · `doterBudget` écrit
      // une ligne annuelle ET une ligne par mois, dont la somme refait
      // l'annuel. Les additionner sans filtre doublait le budget des notes
      // 35 et 24, et le crédit disponible avec lui.
      this.prisma.budgetSection.findMany({ where: { exerciceId, mois: null, section: { planId: plan.id } } }),
      this.engagementService.resteParSection(tenantId, exerciceId),
      this.prisma.odAnalytique.count({ where: { tenantId, exerciceId, planId: plan.id } }),
      parcours,
    ]);

    const budgetParSection = new Map<string, number>();
    for (const b of budgets) {
      budgetParSection.set(b.sectionId, (budgetParSection.get(b.sectionId) ?? 0) + Number(b.montant));
    }

    /*
      LES RUBRIQUES TOTALISENT LEURS FEUILLES, ELLES NE RESTENT PLUS À ZÉRO.
      Une section Total ne reçoit ni budget ni ventilation · elle n'existe QUE
      pour être totalisée (voir `rubriques-budgetaires.ts`). Le tableau la
      rendait donc en ligne vide : « 1 Personnel · budget 0, réalisé 0 », qui ne
      se distingue pas d'une rubrique inutilisée. Le guide veut pourtant le
      tableau « suivant la nomenclature budgétaire du projet », et une
      nomenclature de bailleur a des rubriques.
    */
    const budgetDe = (id: string) => budgetParSection.get(id) ?? 0;
    const decaisseDe = (id: string) => decaisseParSection.get(id) ?? 0;
    const engageComptableDe = (id: string) => engageParSection.get(id) ?? 0;
    const engageHorsComptaDe = (id: string) => resteEngageParSection.get(id) ?? 0;

    const composer = (
      code: string,
      libelle: string,
      estRubrique: boolean,
      budget: number,
      decaissement: number,
      engagementComptable: number,
      engagementHorsComptabilite: number,
    ): LigneExecutionBudgetaire => {
      const engagement = engagementComptable + engagementHorsComptabilite;
      const realisation = decaissement + engagement;
      return {
        code,
        libelle,
        estRubrique,
        budget,
        decaissement,
        engagementComptable,
        engagementHorsComptabilite,
        engagement,
        realisation,
        creditDisponible: budget - realisation,
        executionPourcent: Math.abs(budget) < 0.005 ? null : (realisation / budget) * 100,
      };
    };

    const lignes: LigneExecutionBudgetaire[] = sections.map((s) =>
      composer(
        s.code,
        s.intitule,
        s.type === TypeCompteDetailTotal.TOTAL,
        valeurDeLaLigne(s, sections, budgetDe),
        valeurDeLaLigne(s, sections, decaisseDe),
        valeurDeLaLigne(s, sections, engageComptableDe),
        valeurDeLaLigne(s, sections, engageHorsComptaDe),
      ),
    );

    /*
      LE TOTAL NE SOMME QUE LES FEUILLES, et il sommait les lignes affichées.
      Ce n'était juste que PAR ACCIDENT : les sections Total valaient toujours
      zéro, faute de pouvoir être dotées. Maintenant qu'elles portent leur
      sous-total, sommer la colonne compterait chaque dépense autant de fois
      qu'elle a de rubriques au-dessus d'elle · le double du vrai sur une
      nomenclature à deux niveaux, sur un tableau dont chaque ligne est juste.
    */
    const total = {
      budget: totalDesFeuilles(sections, budgetDe),
      decaissement: totalDesFeuilles(sections, decaisseDe),
      engagementComptable: totalDesFeuilles(sections, engageComptableDe),
      engagementHorsComptabilite: totalDesFeuilles(sections, engageHorsComptaDe),
      engagement: 0,
      realisation: 0,
      creditDisponible: 0,
    };
    total.engagement = total.engagementComptable + total.engagementHorsComptabilite;
    total.realisation = total.decaissement + total.engagement;
    total.creditDisponible = total.budget - total.realisation;

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
      // LES OD ANALYTIQUES N'ENTRENT PAS ICI, et c'est dit. Ce tableau est
      // établi sur la COMPTABILITÉ (guide, ch. 7, APPLICATION 22), et sa
      // colonne décaissement / engagement se lit sur l'écriture elle-même
      // (trésorerie touchée, fournisseur lettré) · une OD extra-comptable ne
      // dit pas si le montant qu'elle déplace a été payé. Les états
      // analytiques, eux, la reprennent (manuel Sage i7).
      odAnalytiquesNonReprises:
        nombreOd > 0
          ? `${nombreOd} OD analytique(s) de ce plan ne sont pas reprises · ce tableau est établi sur la comptabilité, et une OD ne dit pas si le montant qu'elle déplace a été payé ou engagé. Pour qu'une correction y pèse, corrigez la ventilation de l'écriture d'origine.`
          : null,
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
  async reconciliationTresorerie(tenantId: string, exerciceId: string, paiementsEnInstance: number | null = null) {
    // Aucun contrôle ne lisait l'exercice · un identifiant inconnu, ou celui
    // d'un autre dossier, rendait un tableau tout à zéro, rapproché et
    // présentable (jumeau de l'audit final F222). Il se refuse d'abord.
    exerciceDuDossierOuRefus(await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId }, select: { id: true } }));
    const estTresorerie = (numero: string) => correspond(numero, COMPTES_TRESORERIE_PROJET);

    // Ventilation des encaissements par nature de contrepartie, et total des
    // décaissements · les virements internes (flux net nul) sont écartés,
    // c'est ce qui rend E égal à zéro sur un périmètre consolidé.
    let fondsBailleurs = 0;
    let interets = 0;
    let autresFonds = 0;
    let depenses = 0;

    /*
      MÊME LECTURE PAR TRANCHES que le tableau d'exécution (audit final F187) ·
      c'est la même famille, dans le même fichier. Seules les écritures qui
      touchent un compte de trésorerie sont lues, les autres n'y entrant pas,
      et de chaque ligne seuls le numéro de son compte et ses deux montants.
      Un document ne se tronque pas · l'exercice est lu en entier.
    */
    const [lignes] = await Promise.all([
      this.chargerLignes(tenantId, exerciceId),
      lireParLots(
        (curseur) =>
          this.prisma.ecriture.findMany({
            where: {
              tenantId,
              exerciceId,
              statut: StatutEcriture.VALIDEE,
              estGenereeParCloture: false,
              lignes: { some: { compte: { OR: COMPTES_TRESORERIE_PROJET.map((p) => ({ numero: { startsWith: p } })) } } },
            },
            select: {
              id: true,
              lignes: { select: { debit: true, credit: true, compte: { select: { numero: true } } } },
            },
            ...pageApres(curseur, LOT_ECRITURES),
          }),
        (e) => {
          const tresorerie = e.lignes.filter((l) => estTresorerie(l.compte.numero));
          if (tresorerie.length === 0) return;
          const flux = tresorerie.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
          if (Math.abs(flux) < 0.005) return;
          if (flux < 0) {
            depenses += -flux;
            return;
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
        },
        LOT_ECRITURES,
      ),
    ]);

    const lignesTresorerie = lignes.filter((l) => estTresorerie(l.numero));
    const tresorerieDebut = lignesTresorerie.reduce((s, l) => s + l.reportDebit - l.reportCredit, 0);
    const tresorerieFin = lignesTresorerie.reduce((s, l) => s + l.solde, 0);

    const g = tresorerieDebut + fondsBailleurs + interets + autresFonds - 0 - depenses;
    // `null` pour H non renseigné, et donc pour I (audit final F13) · jamais
    // un zéro qui ressemblerait à une réponse.
    const repere = (rep: string, libelle: string, montant: number | null) => ({ rep, libelle, montant });

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
        repere('I', 'TRESORERIE NET DES PAIEMENTS EN INSTANCE (G-H)', paiementsEnInstance === null ? null : g - paiementsEnInstance),
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

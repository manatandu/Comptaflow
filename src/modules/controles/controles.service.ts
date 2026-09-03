import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import {
  ClasseCompte,
  FormeJuridiqueSyscohada,
  JeuEtatsFinanciersSycebnl,
  Referentiel,
  SensDepreciation,
  StatutEcriture,
  StatutExoneration,
  SystemeComptableSyscohada,
  TypeCompteDetailTotal,
} from '@prisma/client';
import { JOURS_ALERTE_RENOUVELLEMENT } from '../exonerations/correspondance-exonerations';
import { regleAuditeur, type RegleAuditeur } from './regles-auditeur';
import { PREFIXES_CHIFFRE_AFFAIRES_SYSCOHADA } from '../etats-financiers-syscohada/correspondance-compte-resultat-syscohada';

/**
 * SEUILS DE DÉSIGNATION DU CONTRÔLEUR DES COMPTES · ils ne sont PLUS ici.
 *
 * Ils dépendent du référentiel et, en SYSCOHADA, de la forme juridique · voir
 * `regles-auditeur.ts`, qui porte les quatre règles lues à leur source. Ces
 * trois constantes restent exportées parce que des écrans les citent, mais
 * elles ne valent que pour le SYCEBNL et le disent.
 *
 * Exprimés en FRANCS CFA par les textes, et laissés tels quels : le logiciel
 * ne connaît pas le taux applicable au dossier, et un seuil converti à un
 * taux inventé induirait en erreur plus sûrement qu'un seuil brut annoncé
 * comme tel. Même règle que pour le seuil du Système minimal de trésorerie.
 */
export const SEUIL_BILAN_AUDITEUR = 100_000_000;
export const SEUIL_RESSOURCES_AUDITEUR = 200_000_000;
export const SEUIL_EFFECTIF_AUDITEUR = 20;

/** Classes du bilan · 1 à 5. Les 6 à 8 sont de gestion, la 9 est hors bilan. */
const CLASSES_BILAN: ClasseCompte[] = [
  ClasseCompte.CLASSE_1,
  ClasseCompte.CLASSE_2,
  ClasseCompte.CLASSE_3,
  ClasseCompte.CLASSE_4,
  ClasseCompte.CLASSE_5,
];

/** Un critère de désignation du contrôleur des comptes, mesuré et comparé à son seuil. */
export interface CritereAuditeur {
  critere: string;
  valeur: number;
  seuil: number;
  franchi: boolean;
  detail: string;
}

/** Gravité d'une anomalie · commande la couleur et l'ordre de lecture. */
export type Gravite = 'BLOQUANT' | 'AVERTISSEMENT' | 'INFORMATION';

export interface AnomalieControle {
  /** Repère stable, pour qu'un contrôle puisse être suivi d'un exercice à l'autre. */
  code: string;
  gravite: Gravite;
  libelle: string;
  /** Ce que l'anomalie empêche ou risque, en une phrase. */
  consequence: string;
  /** Ce qu'il faut faire. */
  action: string;
  occurrences: {
    reference: string;
    detail: string;
    montant?: number;
    date?: string;
  }[];
}

export interface RapportControles {
  exerciceId: string;
  genereLe: string;
  anomalies: AnomalieControle[];
  totaux: { bloquants: number; avertissements: number; informations: number };
}

/** Une journée de caisse : le solde au soir, et s'il est négatif. */
export interface JourneeCaisse {
  date: string;
  mouvementDebit: number;
  mouvementCredit: number;
  soldeFinJournee: number;
  negatif: boolean;
}

export interface ControleCaisse {
  compteId: string;
  numero: string;
  intitule: string;
  journal: string | null;
  soldeFinal: number;
  premierJourNegatif: string | null;
  nombreJoursNegatifs: number;
  journees: JourneeCaisse[];
}

/**
 * ANALYSE ET CONTRÔLES · État → Analyse et contrôles, et État → Contrôle de
 * caisse chez Sage 100 i7.
 *
 * ## Le contrôle de caisse
 *
 * Le manuel Sage écrit pour une ONG pose la règle sans détour : « Il est
 * impossible de clôturer un journal de caisse s'il a été créditeur pour un
 * jour de la période ; afin d'éviter cela, il est impératif d'enregistrer les
 * écritures d'approvisionnement avant les dépenses. » Une caisse créditrice
 * signifie qu'on a décaissé de l'argent qu'on n'avait pas : c'est
 * matériellement impossible, donc c'est une erreur de saisie ou une dépense
 * non justifiée.
 *
 * OmegaX reprend la règle et la renforce sur deux points. Le contrôle ne
 * s'exécute pas seulement au moment de clôturer, mais à la demande et en
 * continu ; et il ne dit pas « la caisse a été créditrice », il nomme LE JOUR
 * exact du passage sous zéro, parce que c'est cette date qu'il faut aller
 * regarder. En RDC, où une part réelle de l'activité associative passe par la
 * caisse espèces, c'est le contrôle le plus souvent utile.
 *
 * ## Les autres contrôles
 *
 * Ils cherchent ce qu'aucun total ne montre : un compte de tiers dont le solde
 * est du mauvais côté, une créance lettrée depuis trop longtemps, une écriture
 * sans pièce justificative, un compte hors nomenclature (celle du SYCEBNL ou
 * celle du SYSCOHADA, selon le dossier). Un logiciel
 * qui se contente d'enregistrer laisse ces anomalies dormir jusqu'à l'audit.
 */
@Injectable()
export class ControlesService {
  /** Au-delà, une créance ou une dette non lettrée mérite qu'on la regarde. */
  private static readonly JOURS_ANCIENNETE_TIERS = 180;
  /**
   * Délai de centralisation du brouillard · il DIFFÈRE selon le référentiel,
   * et servir le plus strict des deux à tout le monde n'est pas prudent, c'est
   * faux : on reprochait à une entreprise un retard que sa loi n'a jamais
   * exigé, en citant un texte qui n'est pas le sien.
   *
   *  · SYCEBNL, Partie 2 ch. 2 · centralisation au moins CHAQUE SEMAINE ;
   *  · AUDCIF, art. 19 · centralisation au moins une fois par MOIS.
   */
  private static readonly JOURS_CENTRALISATION: Record<Referentiel, number> = {
    [Referentiel.SYCEBNL]: 7,
    [Referentiel.SYSCOHADA]: 30,
  };

  constructor(private readonly prisma: PrismaService) {}

  private async exercice(tenantId: string, exerciceId: string) {
    const ex = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!ex) throw new BadRequestException('Exercice introuvable pour ce dossier');
    return ex;
  }

  /**
   * Contrôle de caisse, compte par compte, jour par jour.
   *
   * Le solde est reconstitué chronologiquement : une caisse ne peut pas être
   * créditrice, donc tout jour où elle l'est signale soit une dépense saisie
   * avant son approvisionnement, soit une sortie sans justification.
   */
  async controleCaisse(tenantId: string, exerciceId: string): Promise<ControleCaisse[]> {
    await this.exercice(tenantId, exerciceId);

    // Comptes de caisse : le 57 des DEUX plans (« Caisse » au SYCEBNL comme
    // au SYSCOHADA), plus tout compte rattaché à un
    // journal de trésorerie dont le code ou l'intitulé parle de caisse.
    const comptes = await this.prisma.compte.findMany({
      where: {
        tenantId,
        typeCompte: TypeCompteDetailTotal.DETAIL,
        OR: [{ numero: { startsWith: '57' } }, { journauxTresorerie: { some: {} } }],
      },
      include: { journauxTresorerie: { select: { code: true, intitule: true } } },
    });
    const comptesCaisse = comptes.filter(
      (c) =>
        c.numero.startsWith('57') ||
        c.journauxTresorerie.some((j) => /caiss|especes|espèces/i.test(`${j.code} ${j.intitule}`)),
    );
    if (comptesCaisse.length === 0) return [];

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        compteId: { in: comptesCaisse.map((c) => c.id) },
        ecriture: { tenantId, exerciceId },
      },
      select: { compteId: true, debit: true, credit: true, ecriture: { select: { date: true } } },
    });

    return comptesCaisse.map((compte) => {
      const parJour = new Map<string, { debit: number; credit: number }>();
      for (const l of lignes) {
        if (l.compteId !== compte.id) continue;
        const jour = l.ecriture.date.toISOString().slice(0, 10);
        const acc = parJour.get(jour) ?? { debit: 0, credit: 0 };
        acc.debit += Number(l.debit);
        acc.credit += Number(l.credit);
        parJour.set(jour, acc);
      }

      let cumul = 0;
      const journees: JourneeCaisse[] = [...parJour.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, m]) => {
          cumul += m.debit - m.credit;
          return {
            date,
            mouvementDebit: m.debit,
            mouvementCredit: m.credit,
            soldeFinJournee: cumul,
            // Tolérance au centime : un arrondi ne doit pas déclencher une
            // alerte de caisse créditrice.
            negatif: cumul < -0.005,
          };
        });

      const negatives = journees.filter((j) => j.negatif);
      return {
        compteId: compte.id,
        numero: compte.numero,
        intitule: compte.intitule,
        journal: compte.journauxTresorerie[0]?.code ?? null,
        soldeFinal: cumul,
        premierJourNegatif: negatives[0]?.date ?? null,
        nombreJoursNegatifs: negatives.length,
        journees,
      };
    });
  }

  /** Batterie complète de contrôles sur un exercice. */
  /**
   * ÉVOLUTION MENSUELLE PAR COMPTE · douze colonnes plus le cumul.
   *
   * Le besoin vient d'un dossier réel : le reporting CARRIGRES (Drive,
   * exercices 2024 et 2025) est bâti presque entièrement sur cette vue, un
   * compte par ligne et un mois par colonne, du salaire de base aux ventes de
   * grès par calibre. C'est ainsi qu'un chef comptable repère ce qu'aucun
   * cumul ne montre : une charge qui double en juillet, un produit qui
   * disparaît en septembre, une régularisation passée deux fois.
   *
   * OmegaX savait donner le cumul de l'exercice et la comparaison N/N-1 ;
   * entre les deux, il n'y avait rien. Douze colonnes, c'est la granularité
   * à laquelle une anomalie devient visible sans ouvrir le grand livre.
   *
   * Deux partis pris :
   *  - le REPORT À-NOUVEAU est exclu des colonnes mensuelles et présenté à
   *    part. Sans cela, janvier porterait l'intégralité du passé et écraserait
   *    toute lecture de l'année ;
   *  - le montant retenu est le NET SIGNÉ du mois (débit moins crédit), pas
   *    deux colonnes par mois. Vingt-quatre colonnes ne se lisent pas, et le
   *    sens du solde d'un compte est connu de son détenteur.
   */
  async evolutionMensuelle(
    tenantId: string,
    exerciceId: string,
    options: { classe?: ClasseCompte; inclureBrouillard?: boolean } = {},
  ) {
    const ex = await this.exercice(tenantId, exerciceId);

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        compte: { tenantId, ...(options.classe ? { classe: options.classe } : {}) },
        ecriture: {
          tenantId,
          exerciceId,
          ...(options.inclureBrouillard === false ? { statut: StatutEcriture.VALIDEE } : {}),
        },
      },
      select: {
        debit: true,
        credit: true,
        compte: { select: { id: true, numero: true, intitule: true, classe: true, typeCompte: true } },
        ecriture: { select: { date: true, estGenereeParCloture: true } },
      },
    });

    // Les mois de l'exercice, dans l'ordre, bornes comprises. Un exercice
    // décalé ou de première année n'en compte pas douze : la table de colonnes
    // se déduit de l'exercice, elle n'est pas figée sur l'année civile.
    const mois: { cle: string; libelle: string }[] = [];
    const curseur = new Date(Date.UTC(ex.dateDebut.getUTCFullYear(), ex.dateDebut.getUTCMonth(), 1));
    const fin = new Date(Date.UTC(ex.dateFin.getUTCFullYear(), ex.dateFin.getUTCMonth(), 1));
    while (curseur <= fin) {
      mois.push({
        cle: `${curseur.getUTCFullYear()}-${String(curseur.getUTCMonth() + 1).padStart(2, '0')}`,
        libelle: curseur.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      });
      curseur.setUTCMonth(curseur.getUTCMonth() + 1);
    }

    const parCompte = new Map<
      string,
      {
        compteId: string;
        numero: string;
        intitule: string;
        classe: ClasseCompte;
        report: number;
        parMois: Map<string, number>;
      }
    >();

    for (const l of lignes) {
      // Un compte TOTAL ne porte jamais d'écriture directe (voir
      // EcritureService.creer) ; s'il en portait, l'inclure doublerait les
      // montants de sa racine.
      if (l.compte.typeCompte === TypeCompteDetailTotal.TOTAL) continue;
      const net = Number(l.debit) - Number(l.credit);
      let e = parCompte.get(l.compte.id);
      if (!e) {
        e = {
          compteId: l.compte.id,
          numero: l.compte.numero,
          intitule: l.compte.intitule,
          classe: l.compte.classe,
          report: 0,
          parMois: new Map(),
        };
        parCompte.set(l.compte.id, e);
      }
      if (l.ecriture.estGenereeParCloture) {
        e.report += net;
        continue;
      }
      const d = l.ecriture.date;
      const cle = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      e.parMois.set(cle, (e.parMois.get(cle) ?? 0) + net);
    }

    const comptes = [...parCompte.values()]
      .map((e) => {
        const valeurs = mois.map((m) => e.parMois.get(m.cle) ?? 0);
        const cumul = valeurs.reduce((s, v) => s + v, 0);
        const nonNuls = valeurs.filter((v) => Math.abs(v) > 0.005);
        const moyenne = nonNuls.length > 0 ? cumul / nonNuls.length : 0;
        // Le mois qui s'écarte le plus de la moyenne des mois mouvementés ·
        // c'est la colonne que l'œil doit aller voir en premier. Nul quand le
        // compte n'a bougé qu'une fois : un mois isolé n'est pas un écart.
        let moisAberrant: string | null = null;
        if (nonNuls.length >= 3 && Math.abs(moyenne) > 0.005) {
          let pire = 0;
          valeurs.forEach((v, i) => {
            const ecart = Math.abs(v - moyenne) / Math.abs(moyenne);
            if (Math.abs(v) > 0.005 && ecart > pire && ecart >= 1) {
              pire = ecart;
              moisAberrant = mois[i].cle;
            }
          });
        }
        return {
          compteId: e.compteId,
          numero: e.numero,
          intitule: e.intitule,
          classe: e.classe,
          report: e.report,
          valeurs,
          cumul,
          soldeFinal: e.report + cumul,
          moisAberrant,
        };
      })
      .filter((c) => Math.abs(c.cumul) > 0.005 || Math.abs(c.report) > 0.005)
      .sort((a, b) => a.numero.localeCompare(b.numero));

    return {
      exerciceId: ex.id,
      mois,
      comptes,
      classe: options.classe ?? null,
      /*
       * Le total d'une colonne n'a de sens QUE filtré sur une classe. Sur
       * l'ensemble du plan, la somme des nets signés d'un mois vaut zéro par
       * construction (partie double) : une ligne de totaux à zéro sur douze
       * colonnes ressemble à un bug alors que c'est une tautologie. Nul quand
       * aucune classe n'est demandée, et l'écran ne l'affiche alors pas.
       */
      totaux: options.classe ? mois.map((_, i) => comptes.reduce((s, c) => s + c.valeurs[i], 0)) : null,
    };
  }

  /**
   * COMPTES DORMANTS · date du dernier mouvement, compte par compte.
   *
   * Le grand livre CARRIGRES porte, à côté de chaque compte, sa date de
   * création et celle de son dernier mouvement : on y lit des comptes ouverts
   * en 1963 dont le dernier mouvement date de 2012, toujours dans le plan.
   * Un plan comptable qui accumule des comptes morts se lit de plus en plus
   * mal, et un compte dormant à solde non nul est une question à poser avant
   * l'arrêté, pas après.
   *
   * OmegaX savait mettre un compte en sommeil (`estActif`) sans jamais dire
   * LESQUELS le méritaient. Ce contrôle le dit.
   */
  async comptesDormants(tenantId: string, moisSansMouvement = 12) {
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId, typeCompte: TypeCompteDetailTotal.DETAIL },
      select: {
        id: true,
        numero: true,
        intitule: true,
        classe: true,
        estActif: true,
        lignesEcriture: {
          select: { debit: true, credit: true, ecriture: { select: { date: true } } },
        },
      },
      orderBy: { numero: 'asc' },
    });

    const seuil = new Date();
    seuil.setMonth(seuil.getMonth() - moisSansMouvement);

    return comptes
      .map((c) => {
        const dates = c.lignesEcriture.map((l) => l.ecriture.date.getTime());
        const dernier = dates.length > 0 ? new Date(Math.max(...dates)) : null;
        const solde = c.lignesEcriture.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
        return {
          compteId: c.id,
          numero: c.numero,
          intitule: c.intitule,
          classe: c.classe,
          estActif: c.estActif,
          dernierMouvement: dernier ? dernier.toISOString() : null,
          nombreEcritures: c.lignesEcriture.length,
          solde,
          // Un compte jamais mouvementé n'est pas « dormant » : il n'a jamais
          // servi. Les deux cas appellent des décisions différentes, on les
          // distingue plutôt que de les confondre sous une même étiquette.
          jamaisMouvemente: dernier === null,
        };
      })
      .filter((c) => c.estActif && (c.jamaisMouvemente || new Date(c.dernierMouvement!) < seuil))
      .sort((a, b) => {
        // Un compte dormant à solde non nul passe devant : c'est celui qui
        // pose une question comptable, pas seulement un problème de propreté.
        const poids = (x: typeof a) => (Math.abs(x.solde) > 0.005 ? 0 : 1);
        return poids(a) - poids(b) || a.numero.localeCompare(b.numero);
      });
  }

  /**
   * SEUILS DE DÉSIGNATION DE L'AUDITEUR · Acte uniforme SYCEBNL, article 19.
   *
   * Les trois critères sont ALTERNATIFS, et le texte les exprime en francs
   * CFA. Aucune conversion n'est appliquée : le logiciel ne connaît pas le
   * taux applicable au dossier et un seuil converti à un taux inventé serait
   * pire qu'un seuil brut. Même discipline que pour le seuil du Système
   * minimal de trésorerie (voir etats-financiers-smt.service.ts).
   *
   * Exposé publiquement : l'écran d'analyse s'en sert pour alerter, mais la
   * mesure vaut aussi comme diagnostic à part entière, hors anomalie.
   */
  async seuilsAuditeur(
    tenantId: string,
    exerciceId: string,
    effectifPermanent: number,
  ): Promise<{
    criteres: CritereAuditeur[];
    franchis: CritereAuditeur[];
    obligationDeclenchee: boolean;
    obligationSansSeuil: boolean;
    regle: RegleAuditeur;
    conversionAppliquee: boolean;
    source: string | null;
  }> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, formeJuridiqueSyscohada: true },
    });
    const regle = regleAuditeur(tenant.referentiel, tenant.formeJuridiqueSyscohada);

    // Une forme sans règle lue ne mesure RIEN · annoncer un seuil emprunté à
    // une autre forme serait pire que se taire.
    if (regle.genre === 'AUCUNE_REGLE_LUE') {
      return {
        criteres: [],
        franchis: [],
        obligationDeclenchee: false,
        obligationSansSeuil: false,
        regle,
        conversionAppliquee: false,
        source: null,
      };
    }
    // La société anonyme désigne un commissaire aux comptes sans condition de
    // taille : mesurer ses seuils n'aurait aucun sens.
    if (regle.genre === 'TOUJOURS') {
      return {
        criteres: [],
        franchis: [],
        obligationDeclenchee: false,
        obligationSansSeuil: true,
        regle,
        conversionAppliquee: false,
        source: regle.source,
      };
    }

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: { ecriture: { tenantId, exerciceId, statut: StatutEcriture.VALIDEE } },
      select: { debit: true, credit: true, compte: { select: { numero: true, classe: true, typeCompte: true } } },
    });

    const estSyscohada = tenant.referentiel === Referentiel.SYSCOHADA;
    let totalBilan = 0;
    let produits = 0;
    for (const l of lignes) {
      // Les comptes de TOTAL agrègent leurs enfants : les compter reviendrait
      // à compter deux fois les mêmes montants.
      if (l.compte.typeCompte === TypeCompteDetailTotal.TOTAL) continue;
      const solde = Number(l.debit) - Number(l.credit);
      if (CLASSES_BILAN.includes(l.compte.classe)) {
        // Total du bilan = somme des soldes DÉBITEURS des classes 1 à 5,
        // c'est-à-dire l'actif · approximation assumée et annoncée.
        if (solde > 0) totalBilan += solde;
      }
      // LA MESURE DES PRODUITS DIFFÈRE, et c'est le fond de l'affaire.
      // Le SYCEBNL parle de RESSOURCES annuelles, qui embrassent toute la
      // classe 7 (cotisations, dons, subventions, produits financiers).
      // L'AUSCGIE parle de CHIFFRE D'AFFAIRES, qui est le poste XB du compte
      // de résultat, soit les seuls comptes 701 à 707 · dérivés du modèle, pas
      // réécrits. Mesurer la classe 7 entière pour une entreprise gonflerait
      // son chiffre d'affaires de ses produits financiers et de ses reprises,
      // et la déclarerait au-dessus d'un seuil qu'elle n'a pas franchi.
      if (estSyscohada) {
        if (PREFIXES_CHIFFRE_AFFAIRES_SYSCOHADA.some((p) => l.compte.numero.startsWith(p))) produits += -solde;
      } else if (l.compte.classe === ClasseCompte.CLASSE_7) {
        produits += -solde;
      }
    }
    totalBilan = Math.round(totalBilan * 100) / 100;
    produits = Math.round(produits * 100) / 100;

    const criteres = [
      {
        critere: 'Total du bilan',
        valeur: totalBilan,
        seuil: regle.seuilBilan,
        franchi: totalBilan > regle.seuilBilan,
        detail: `Total du bilan approché à ${totalBilan.toLocaleString('fr-FR')} · seuil ${regle.seuilBilan.toLocaleString('fr-FR')} FCFA`,
      },
      {
        critere: regle.libelleProduits,
        valeur: produits,
        seuil: regle.seuilProduits,
        franchi: produits > regle.seuilProduits,
        detail: `${regle.libelleProduits} de l'exercice ${produits.toLocaleString('fr-FR')} · seuil ${regle.seuilProduits.toLocaleString('fr-FR')} FCFA`,
      },
      {
        critere: 'Effectif permanent',
        valeur: effectifPermanent,
        seuil: regle.seuilEffectif,
        franchi: effectifPermanent > regle.seuilEffectif,
        detail:
          effectifPermanent > 0
            ? `${effectifPermanent} personnes employées à titre permanent · seuil ${regle.seuilEffectif}`
            : "Effectif non renseigné · à saisir dans Structure > Paramètres du dossier pour que ce critère soit mesuré",
      },
    ];

    const franchis = criteres.filter((c) => c.franchi);
    // LE NOMBRE DE CRITÈRES REQUIS EST LE POINT. Le SYCEBNL en demande UN
    // (« l'un des trois »), l'AUSCGIE en demande DEUX sur trois. Alerter une
    // entreprise sur un seul critère l'aurait envoyée chercher un commissaire
    // aux comptes qu'elle n'est pas tenue de désigner.
    const obligationDeclenchee = regle.genre === 'ALTERNATIF' ? franchis.length >= 1 : franchis.length >= 2;

    return {
      criteres,
      franchis,
      obligationDeclenchee,
      obligationSansSeuil: false,
      regle,
      // Le seuil est légalement exprimé en FCFA et n'est PAS converti · voir
      // la note de tête de `regles-auditeur.ts`.
      conversionAppliquee: false,
      source: regle.source,
    };
  }

  async analyser(tenantId: string, exerciceId: string): Promise<RapportControles> {
    const ex = await this.exercice(tenantId, exerciceId);
    // Le jeu d'états commande un contrôle : le S.M.T est une comptabilité de
    // trésorerie, où le passage par un tiers n'a pas lieu d'être exigé.
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const anomalies: AnomalieControle[] = [];

    // --- 1. Caisse créditrice ------------------------------------------------
    const caisses = await this.controleCaisse(tenantId, exerciceId);
    const caissesNegatives = caisses.filter((c) => c.nombreJoursNegatifs > 0);
    if (caissesNegatives.length > 0) {
      anomalies.push({
        code: 'CAISSE_CREDITRICE',
        gravite: 'BLOQUANT',
        libelle: 'Caisse créditrice',
        consequence:
          "Une caisse ne peut pas être créditrice : on aurait décaissé de l'argent qu'on n'avait pas. C'est une erreur de saisie ou une sortie non justifiée.",
        action:
          "Enregistrez les approvisionnements de caisse AVANT les dépenses du même jour, ou retrouvez la pièce manquante.",
        occurrences: caissesNegatives.map((c) => ({
          reference: `${c.numero} ${c.intitule}`,
          detail: `Créditrice ${c.nombreJoursNegatifs} jour(s), pour la première fois le ${c.premierJourNegatif}`,
          date: c.premierJourNegatif ?? undefined,
          montant: Math.min(...c.journees.filter((j) => j.negatif).map((j) => j.soldeFinJournee)),
        })),
      });
    }

    // --- 2. Écritures déséquilibrées ----------------------------------------
    const ecritures = await this.prisma.ecriture.findMany({
      where: { tenantId, exerciceId },
      select: {
        id: true,
        date: true,
        libelle: true,
        reference: true,
        numeroPiece: true,
        statut: true,
        createdAt: true,
        journal: { select: { code: true } },
        lignes: { select: { debit: true, credit: true, lettre: true, compte: { select: { numero: true } } } },
      },
    });

    const desequilibrees = ecritures.filter((e) => {
      const d = e.lignes.reduce((s, l) => s + Number(l.debit), 0);
      const c = e.lignes.reduce((s, l) => s + Number(l.credit), 0);
      return Math.abs(d - c) > 0.005;
    });
    if (desequilibrees.length > 0) {
      anomalies.push({
        code: 'ECRITURE_DESEQUILIBREE',
        gravite: 'BLOQUANT',
        libelle: 'Écriture déséquilibrée',
        consequence: "Une écriture dont le débit ne vaut pas le crédit fausse la balance et tous les états qui en dépendent.",
        action: "Reprenez la pièce dans la saisie. Si elle est validée, corrigez-la par inscription en négatif.",
        occurrences: desequilibrees.map((e) => ({
          reference: `${e.journal.code} n° ${e.numeroPiece ?? '·'}`,
          detail: e.libelle,
          date: e.date.toISOString().slice(0, 10),
          montant:
            e.lignes.reduce((s, l) => s + Number(l.debit), 0) - e.lignes.reduce((s, l) => s + Number(l.credit), 0),
        })),
      });
    }

    // --- 3. Écritures sans pièce justificative -------------------------------
    const sansReference = ecritures.filter(
      (e) => !e.reference?.trim() && !['AN', 'OD'].includes(e.journal.code) && e.lignes.length > 0,
    );
    if (sansReference.length > 0) {
      anomalies.push({
        code: 'SANS_PIECE',
        gravite: 'AVERTISSEMENT',
        libelle: 'Écriture sans référence de pièce justificative',
        consequence:
          "Un auditeur remonte de l'écriture à sa pièce par cette référence. Sans elle, la justification repose sur la mémoire.",
        action: 'Renseignez le numéro de facture, de reçu ou de chèque sur la pièce.',
        occurrences: sansReference.slice(0, 200).map((e) => ({
          reference: `${e.journal.code} n° ${e.numeroPiece ?? '·'}`,
          detail: e.libelle,
          date: e.date.toISOString().slice(0, 10),
        })),
      });
    }

    // --- 4. Brouillard en retard de centralisation ---------------------------
    const maintenant = Date.now();
    const joursCentralisation = ControlesService.JOURS_CENTRALISATION[tenant.referentiel];
    const brouillardEnRetard = ecritures.filter(
      (e) =>
        e.statut === StatutEcriture.BROUILLARD &&
        (maintenant - e.createdAt.getTime()) / 86_400_000 > joursCentralisation,
    );
    if (brouillardEnRetard.length > 0) {
      const estSycebnlCentralisation = tenant.referentiel === Referentiel.SYCEBNL;
      anomalies.push({
        code: 'BROUILLARD_EN_RETARD',
        gravite: 'AVERTISSEMENT',
        libelle: estSycebnlCentralisation
          ? 'Brouillard non centralisé depuis plus de sept jours'
          : "Brouillard non centralisé depuis plus d'un mois",
        consequence: estSycebnlCentralisation
          ? "Le SYCEBNL veut les journaux auxiliaires centralisés au moins chaque semaine dans le journal ou le grand-livre (Partie 2, ch. 2). Au-delà, ce n'est plus un document de travail."
          : "L'AUDCIF veut les journaux auxiliaires centralisés au moins une fois par mois (art. 19). Au-delà, ce n'est plus un document de travail.",
        action: 'Relisez ces écritures dans État → Brouillard et validez-les.',
        occurrences: brouillardEnRetard.slice(0, 200).map((e) => ({
          reference: `${e.journal.code} n° ${e.numeroPiece ?? '·'}`,
          detail: `${e.libelle} · saisie il y a ${Math.floor((maintenant - e.createdAt.getTime()) / 86_400_000)} jours`,
          date: e.date.toISOString().slice(0, 10),
        })),
      });
    }

    // --- 5. Comptes de tiers au solde inversé --------------------------------
    // Intitulé officiel de la division 41 · « Clients et comptes rattachés »
    // (SYSCOHADA) ou « Adhérents, clients-usagers et comptes rattachés »
    // (SYCEBNL, Partie 2 ch. 3, COMPTE 41).
    const qualite41 = tenant.referentiel === Referentiel.SYCEBNL ? 'adhérent ou client-usager' : 'client';
    const qualite41Capitale = tenant.referentiel === Referentiel.SYCEBNL ? 'Adhérent / client-usager' : 'Client';
    const soldesTiers = new Map<string, number>();
    for (const e of ecritures) {
      for (const l of e.lignes) {
        const n = l.compte.numero;
        if (!n.startsWith('40') && !n.startsWith('41')) continue;
        soldesTiers.set(n, (soldesTiers.get(n) ?? 0) + Number(l.debit) - Number(l.credit));
      }
    }
    // 409 « Fournisseurs débiteurs » et 419 « Clients créditeurs » (« Adhérents,
    // clients-usagers créditeurs » au SYCEBNL) portent des AVANCES : leur sens
    // est inversé par construction, dans les deux plans, et toutes leurs
    // subdivisions suivent · 4091 avances et acomptes versés, 4092 groupe,
    // 4093 sous-traitants, 4094 emballages et matériels à rendre, 4098 avoirs
    // à obtenir ; en face 4191 avances et acomptes reçus, 4192 groupe, 4194
    // emballages consignés, 4198 avoirs à accorder. Les signaler était une
    // fausse alerte systématique, sur tous les dossiers qui reçoivent ou
    // versent un acompte · et une fausse alerte répétée apprend à ignorer le
    // contrôle, ce qui coûte plus qu'elle ne rapporte.
    //
    // On INVERSE leur sens attendu plutôt que de les exclure : un 409
    // créditeur ou un 419 débiteur reste une anomalie, et l'exclusion pure
    // l'aurait rendue invisible. Ce défaut-là n'est propre à aucun
    // référentiel · les deux plans portent les mêmes racines, il se corrige
    // une seule fois, sans branche.
    const inverses = [...soldesTiers.entries()].filter(([numero, solde]) => {
      if (numero.startsWith('409')) return solde < -0.005; // débiteur par nature
      if (numero.startsWith('419')) return solde > 0.005; // créditeur par nature
      return (numero.startsWith('41') && solde < -0.005) || (numero.startsWith('40') && solde > 0.005);
    });
    if (inverses.length > 0) {
      anomalies.push({
        code: 'TIERS_SOLDE_INVERSE',
        gravite: 'AVERTISSEMENT',
        libelle: 'Compte de tiers au solde inversé',
        // Le 41 est « Clients et comptes rattachés » en SYSCOHADA et
        // « Adhérents, clients-usagers et comptes rattachés » en SYCEBNL ·
        // parler d'adhérents à une entreprise commerciale n'a pas de sens.
        consequence: `Un ${qualite41} (41) créditeur, ou un fournisseur (40) débiteur, traduit le plus souvent un règlement imputé au mauvais compte, un double encaissement, ou une avance à reclasser. Sur un 409 ou un 419, c'est l'inverse : leur sens normal est celui de l'avance.`,
        // LA NON-COMPENSATION COMMANDE LA CORRECTION · « aucune compensation ne
        // pourrait s'effectuer entre les comptes fournisseurs à solde débiteur
        // et les comptes fournisseurs à solde créditeur : les premiers
        // figurent à l'actif du bilan, les seconds au passif » (plan de
        // comptes, COMPTE 40, dans les deux référentiels ; AUDCIF art. 34 et
        // SYCEBNL art. 16, 5°). Un 401 débiteur laissé tel quel se retrouve
        // au passif en diminution des dettes · c'est la compensation même que
        // le texte interdit. Le message doit donc dire le reclassement, pas
        // seulement inviter à regarder.
        action:
          'Interrogez le compte et lettrez-le : le solde non lettré dira ce qui reste réellement dû. ' +
          "S'il s'agit d'une avance, reclassez-la à l'arrêté (401 débiteur vers 4091 avances versées, " +
          '411 créditeur vers 4191 avances reçues) : la compensation entre un poste d’actif et un poste ' +
          'de passif est interdite, et l’avance doit figurer en clair de son côté du bilan.',
        occurrences: inverses.map(([numero, solde]) => ({
          reference: numero,
          detail: numero.startsWith('409')
            ? 'Fournisseur débiteur (409) au solde créditeur'
            : numero.startsWith('419')
              ? `${qualite41Capitale} créditeur (419) au solde débiteur`
              : numero.startsWith('41')
                ? `${qualite41Capitale} créditeur`
                : 'Fournisseur débiteur',
          montant: solde,
        })),
      });
    }

    // --- 6. Créances et dettes anciennes non lettrées ------------------------
    const seuil = new Date(ex.dateFin);
    seuil.setDate(seuil.getDate() - ControlesService.JOURS_ANCIENNETE_TIERS);
    const anciennes = ecritures.filter(
      (e) =>
        e.date < seuil &&
        e.lignes.some(
          (l) =>
            !l.lettre &&
            (l.compte.numero.startsWith('40') || l.compte.numero.startsWith('41')) &&
            Math.abs(Number(l.debit) - Number(l.credit)) > 0.005,
        ),
    );
    if (anciennes.length > 0) {
      anomalies.push({
        code: 'TIERS_ANCIEN_NON_LETTRE',
        gravite: 'INFORMATION',
        libelle: `Mouvement de tiers non lettré depuis plus de ${ControlesService.JOURS_ANCIENNETE_TIERS} jours`,
        consequence:
          // Le 416 RECLASSE la créance (« Créances clients litigieuses ou
          // douteuses » · « Créances adhérents, clients-usagers litigieuses ou
          // douteuses » au SYCEBNL). La DÉPRÉCIATION se constate au 491, dans
          // les deux plans. Le message envoyait vers un compte qui n'en porte
          // aucune. Le compte de charge n'est pas nommé : son intitulé diffère
          // d'un référentiel à l'autre.
          "Une créance ancienne non lettrée est soit déjà réglée sans que le rapprochement ait été fait, soit douteuse · dans le second cas elle se reclasse au 416 (créances litigieuses ou douteuses) et appelle une dépréciation au 491 (note annexe).",
        action: 'Lettrez ce qui est réglé ; pour le reste, appréciez le risque et dépréciez si nécessaire.',
        occurrences: anciennes.slice(0, 200).map((e) => ({
          reference: `${e.journal.code} n° ${e.numeroPiece ?? '·'}`,
          detail: e.libelle,
          date: e.date.toISOString().slice(0, 10),
        })),
      });
    }

    // --- 6 bis. Charge imputée directement sur la trésorerie -----------------
    /*
     * LE PASSAGE PAR LE TIERS.
     *
     * Une charge se constate d'abord contre un TIERS (classe 4), et le tiers
     * se solde ensuite contre la TRÉSORERIE (classe 5). Deux écritures, jamais
     * une. Débiter 6221 Loyers par le crédit de 5211 Banque, c'est enregistrer
     * une dépense dont on ne saura jamais à qui elle a été payée.
     *
     * Ce n'est pas une convention de cabinet, c'est le schéma du référentiel.
     * SYCEBNL, Partie 3, ch. 3 :
     *
     *   § 2.2 Engagement des dépenses suivant la nature de charges :
     *     « 6 ou 8  Charges par nature      DÉBIT
     *       4       Comptes de tiers (1)          CRÉDIT »
     *   § 2.4 Paiement des dépenses :
     *     « 4  Compte de tiers   DÉBIT
     *       5  Trésorerie              CRÉDIT »
     *
     * Le guide d'application ne dit pas autre chose, et le dit vingt-deux
     * fois : sur ses 22 applications chiffrées, AUCUNE charge n'est imputée
     * directement sur un compte de trésorerie. L'APPLICATION 12 est la plus
     * probante · l'énoncé précise « Règlement par chèque », donc un paiement
     * immédiat, et le guide passe malgré tout deux écritures (636 par le
     * crédit de 40, puis 40 par le crédit de 52). Même les frais avancés par
     * un bénévole transitent par un tiers (4572, APPLICATION 17).
     *
     * Le fondement est le postulat de la comptabilité d'engagement (Partie 1,
     * ch. 2, § 3.3.1.1.3) : « les effets des transactions sont pris en compte
     * dès que ces transactions se produisent et non pas au moment des
     * encaissements ou paiements ». Le compte de tiers EST le mécanisme qui
     * sépare le moment où la charge naît de celui où elle est payée. Sans lui,
     * la comptabilité redevient une comptabilité de caisse.
     *
     * TROIS RÉSERVES, sans quoi le contrôle crierait à tort.
     *
     * 1. LES PRODUITS NE SONT PAS CONCERNÉS. Le même guide encaisse
     *    directement 57 Caisse par le crédit de 706 Revenus des manifestations,
     *    et 57 + 52 par le crédit de 7041 Dons. Un don reçu en espèces n'a pas
     *    de tiers : personne ne le doit, il est là. La règle est asymétrique et
     *    ce contrôle ne regarde donc que les CHARGES.
     * 2. LE S.M.T EST HORS CHAMP. Le postulat lui-même réserve « les
     *    dispositions spécifiques concernant le Système Minimal de
     *    Trésorerie », qui est une comptabilité de trésorerie par construction
     *    (art. 5 et 6). Y exiger un tiers serait exiger l'inverse du
     *    référentiel.
     * 3. CE N'EST PAS BLOQUANT. Le contrôle avertit, il n'interdit pas. Une
     *    dépense de caisse de 2 000 francs contre un reçu, sur laquelle nommer
     *    un fournisseur n'apporte rien, reste une écriture qu'un comptable peut
     *    vouloir passer. C'est à lui de trancher, pas au logiciel · mais il
     *    doit le voir.
     */
    // Le Système minimal de trésorerie existe DANS LES DEUX RÉFÉRENTIELS, et
    // le test ne regardait que celui du SYCEBNL. Or un dossier SYSCOHADA au
    // SMT garde par défaut `jeuEtatsFinanciersSycebnl` à
    // ASSOCIATIONS_ORDRES_PROFESSIONNELS (valeur par défaut du schéma, sans
    // signification pour lui) : il passait donc le test et subissait un
    // contrôle que l'AUDCIF Titre X écarte, puisque le SMT est une
    // comptabilité de trésorerie par construction.
    const auSystemeMinimal =
      tenant.referentiel === Referentiel.SYSCOHADA
        ? tenant.systemeComptableSyscohada === SystemeComptableSyscohada.MINIMAL_TRESORERIE
        : tenant.jeuEtatsFinanciersSycebnl === JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE;
    if (!auSystemeMinimal) {
      const chargesDirectes = ecritures.filter((e) => {
        const aUneCharge = e.lignes.some(
          (l) =>
            (l.compte.numero.startsWith('6') || l.compte.numero.startsWith('8')) &&
            Number(l.debit) - Number(l.credit) > 0.005,
        );
        if (!aUneCharge) return false;
        const aUneTresorerieCreditee = e.lignes.some(
          (l) =>
            l.compte.numero.startsWith('5') &&
            !l.compte.numero.startsWith('59') &&
            Number(l.credit) - Number(l.debit) > 0.005,
        );
        if (!aUneTresorerieCreditee) return false;
        // La présence d'un tiers dans la MÊME écriture suffit à l'absoudre :
        // c'est le cas d'une écriture composée (facture + règlement partiel)
        // ou d'une retenue à la source, où le tiers est bien nommé.
        const aUnTiers = e.lignes.some((l) => l.compte.numero.startsWith('4'));
        return !aUnTiers;
      });

      if (chargesDirectes.length > 0) {
        anomalies.push({
          code: 'CHARGE_SANS_TIERS',
          gravite: 'AVERTISSEMENT',
          libelle: 'Charge imputée directement sur la trésorerie, sans passer par un tiers',
          // Le postulat de la comptabilité d'engagement existe dans les deux
          // référentiels, sous deux références différentes · citer la Partie 3
          // ch. 3 du SYCEBNL (projets de développement) à une entreprise
          // renverrait à un chapitre qui ne la concerne pas.
          consequence:
            'On ne saura jamais à qui cette dépense a été payée : ni relevé fournisseur, ni balance âgée, ni lettrage, ni circularisation possible. La charge et son règlement sont confondus en une seule écriture, ce que le postulat de la comptabilité d’engagement écarte ' +
            (tenant.referentiel === Referentiel.SYCEBNL
              ? '(SYCEBNL, Partie 1, ch. 2).'
              : '(AUDCIF, Titre V · cadre conceptuel).'),
          action:
            'Passez deux écritures : la charge par le crédit du tiers (compte 40 fournisseur, 42 personnel, 43 organismes sociaux, 44 État selon le cas), puis le règlement par le débit de ce tiers et le crédit de la trésorerie.' +
            (tenant.referentiel === Referentiel.SYCEBNL ? ' C’est le schéma des § 2.2 et 2.4 de la Partie 3, ch. 3.' : ''),
          occurrences: chargesDirectes.slice(0, 200).map((e) => ({
            reference: `${e.journal.code} n° ${e.numeroPiece ?? '·'}`,
            detail: `${e.libelle} · ${e.lignes
              .filter((l) => l.compte.numero.startsWith('6') || l.compte.numero.startsWith('8'))
              .map((l) => l.compte.numero)
              .join(', ')} soldé(s) directement en trésorerie`,
            montant: e.lignes
              .filter((l) => l.compte.numero.startsWith('6') || l.compte.numero.startsWith('8'))
              .reduce((s2, l) => s2 + Number(l.debit) - Number(l.credit), 0),
            date: e.date.toISOString().slice(0, 10),
          })),
        });
      }
    }

    // --- 6 bis. Méthode de comptabilisation des cotisations non précisée ----
    // Cadre conceptuel SYCEBNL § 5.4.2.1 : « Le fait générateur de la
    // comptabilisation des cotisations et du droit d'entrée est l'appel [...]
    // Toutefois, si l'entité ne peut justifier d'un droit d'agir en
    // recouvrement, [...] lors de leur encaissement effectif », et
    // « L'entité doit préciser dans les notes annexes, la méthode retenue ».
    //
    // Le contrôle ne se déclenche QUE si le dossier a mouvementé des
    // cotisations ou un droit d'entrée : une association qui n'en appelle pas
    // n'a rien à préciser, et un contrôle qui crie sans objet finit ignoré.
    if (
      tenant.referentiel === Referentiel.SYCEBNL &&
      tenant.jeuEtatsFinanciersSycebnl === JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS &&
      !tenant.methodeCotisations
    ) {
      const mouvementees = ecritures.filter((e) =>
        e.lignes.some((l) => l.compte.numero.startsWith('701') || l.compte.numero.startsWith('103')),
      );
      if (mouvementees.length > 0) {
        anomalies.push({
          code: 'METHODE_COTISATIONS_NON_PRECISEE',
          gravite: 'AVERTISSEMENT',
          libelle: "Méthode de comptabilisation des cotisations et du droit d'entrée non précisée",
          consequence:
            "Le cadre conceptuel (§ 5.4.2.1) impose de préciser en notes annexes la méthode retenue, et " +
            "conditionne l'appel au fait que l'entité puisse justifier d'un droit d'agir en recouvrement. " +
            'Sans ce choix, rien ne dit si les créances portées au 411 Adhérents sont recouvrables, et la ' +
            'mention obligatoire manque à la liasse.',
          action:
            'Lire les statuts : ouvrent-ils une voie de recouvrement de la cotisation en cas de défaillance ? ' +
            'Porter la réponse dans Structure > Paramètres du dossier, puis la reprendre dans la note ' +
            '« Règles et méthodes comptables ».',
          occurrences: mouvementees.slice(0, 200).map((e) => ({
            reference: `${e.journal.code} n° ${e.numeroPiece ?? '·'}`,
            detail: `${e.libelle} · cotisations ou droit d'entrée mouvementés`,
            date: e.date.toISOString().slice(0, 10),
          })),
        });
      }
    }

    // --- 7. Comptes hors nomenclature (SYCEBNL ou SYSCOHADA selon le dossier) --------------------------------
    // La classe 8 existe (H.A.O.) mais un compte dont le premier chiffre n'est
    // pas cohérent avec sa classe enregistrée signale un plan bricolé, souvent
    // par import.
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId },
      select: { numero: true, intitule: true, classe: true },
    });
    const incoherents = comptes.filter((c) => c.classe !== (`CLASSE_${c.numero[0]}` as ClasseCompte));
    if (incoherents.length > 0) {
      anomalies.push({
        code: 'COMPTE_HORS_NOMENCLATURE',
        gravite: 'AVERTISSEMENT',
        libelle: 'Compte dont la classe ne suit pas son numéro',
        consequence:
          "Les états financiers rangent chaque compte d'après sa classe : un compte mal classé apparaît au mauvais poste du bilan ou du compte de résultat.",
        action: 'Corrigez le numéro ou la classe du compte dans le plan comptable.',
        occurrences: incoherents.map((c) => ({
          reference: c.numero,
          detail: `${c.intitule} · rangé en ${c.classe.replace('CLASSE_', 'classe ')}`,
        })),
      });
    }

    // --- 8. Comptes mouvementés absents des états ---------------------------
    // Un compte de classe 9 mouvementé est normal, mais il ne doit jamais
    // peser sur le résultat : le signaler évite qu'on s'étonne de ne pas le
    // retrouver au compte de résultat.
    //
    // LA CLASSE 9 NE PORTE PAS LA MÊME CHOSE DANS LES DEUX PLANS. En SYCEBNL
    // ce sont les contributions volontaires en nature (900 à 914). En
    // SYSCOHADA ce sont les engagements hors bilan (90 · obtenus au débit des
    // 901-904, accordés au crédit des 905-908, contreparties 911-918) ET la
    // comptabilité analytique de gestion (92 à 99). Annoncer des
    // « contributions volontaires en nature » à une entreprise qui vient
    // d'enregistrer une caution, et la renvoyer à une note annexe absente de
    // sa liasse, était faux deux fois.
    const classe9 = [...new Set(ecritures.flatMap((e) => e.lignes.map((l) => l.compte.numero)))].filter((n) =>
      n.startsWith('9'),
    );
    if (classe9.length > 0) {
      const estSycebnlClasse9 = tenant.referentiel === Referentiel.SYCEBNL;
      anomalies.push({
        code: 'CLASSE_9_MOUVEMENTEE',
        gravite: 'INFORMATION',
        libelle: estSycebnlClasse9
          ? 'Contributions volontaires en nature enregistrées'
          : 'Comptes de classe 9 mouvementés (engagements hors bilan ou comptabilité analytique)',
        consequence: estSycebnlClasse9
          ? 'Les comptes de classe 9 sont hors bilan et hors résultat : ils ne modifient ni le résultat ni la situation nette, et se présentent en note annexe.'
          : 'Les comptes de classe 9 sont hors bilan et hors compte de résultat. Les engagements des comptes 90 et 91 se portent aux Notes annexes · ils supposent une convention écrite. Les comptes 92 à 99 relèvent de la comptabilité analytique de gestion et n’entrent dans aucun état de synthèse.',
        action: estSycebnlClasse9
          ? 'Vérifiez que la note annexe des contributions volontaires est renseignée.'
          : 'Vérifiez que la note annexe des engagements hors bilan est renseignée.',
        occurrences: classe9.map((n) => ({ reference: n, detail: 'Compte de classe 9 mouvementé' })),
      });
    }

    // --- 10. Seuils de désignation de l'auditeur (SYCEBNL, art. 19) ---------
    //
    // Trois critères ALTERNATIFS : total du bilan supérieur à 100 000 000
    // FCFA, ressources annuelles supérieures à 200 000 000 FCFA, ou effectif
    // permanent supérieur à vingt personnes. Un seul suffit à rendre la
    // désignation d'un auditeur OBLIGATOIRE (et l'article 24 assortit le
    // dispositif de sanctions pénales).
    //
    // Le logiciel n'en portait rien : une entité pouvait franchir un seuil,
    // arrêter ses comptes et les déposer sans que rien ne le signale, alors
    // que les deux montants sont calculés depuis toujours pour les états
    // financiers, et que l'effectif est désormais renseigné sur le dossier.
    //
    // Le contrôle ne prétend PAS conclure : le total du bilan et les
    // ressources sont ici approchés depuis la balance (classes 1 à 5 pour le
    // bilan, classe 7 pour les ressources), pas repris de la liasse arrêtée.
    // Il alerte, l'expert tranche · d'où la gravité AVERTISSEMENT.
    const seuils = await this.seuilsAuditeur(tenantId, exerciceId, tenant.effectifPermanent);
    if (seuils.obligationDeclenchee) {
      const alternatif = seuils.regle.genre === 'ALTERNATIF';
      anomalies.push({
        code: 'SEUIL_AUDITEUR_FRANCHI',
        gravite: 'AVERTISSEMENT',
        libelle: alternatif
          ? "Seuil de désignation d'un auditeur franchi"
          : 'Deux des trois seuils de désignation du commissaire aux comptes sont franchis',
        consequence: alternatif
          ? "L'article 19 de l'Acte uniforme SYCEBNL rend la désignation d'un auditeur OBLIGATOIRE dès qu'un SEUL des " +
            'trois critères est franchi : total du bilan supérieur à 100 000 000 FCFA, ressources annuelles supérieures ' +
            "à 200 000 000 FCFA, ou plus de vingt personnes employées à titre permanent. Les articles 24 à 27 prévoient " +
            'des sanctions pénales.'
          : `${seuils.source} rend la désignation d'un commissaire aux comptes obligatoire dès que DEUX des trois ` +
            'conditions sont remplies à la clôture. Le dossier en remplit deux ou plus.',
        action: alternatif
          ? "Faites désigner un auditeur, et prévoyez de lui remettre les états financiers et le rapport de gestion au " +
            "moins 45 jours avant l'assemblée générale (art. 19, alinéa 4). Les montants ci-dessous sont approchés " +
            'depuis la balance : confrontez-les à la liasse arrêtée avant de conclure.'
          : "Faites désigner un commissaire aux comptes. La sortie de l'obligation suppose DEUX exercices consécutifs " +
            "sous les seuils, que ce contrôle ne mesure pas · il ne regarde qu'un exercice. Les montants ci-dessous " +
            'sont approchés depuis la balance : confrontez-les à la liasse arrêtée avant de conclure.',
        occurrences: seuils.franchis.map((f) => ({ reference: f.critere, detail: f.detail })),
      });
    }
    // La société anonyme n'a pas de seuil à franchir · son obligation est
    // permanente, et un dossier qui l'ignore ne verrait jamais rien passer.
    if (seuils.obligationSansSeuil && seuils.regle.genre === 'TOUJOURS') {
      anomalies.push({
        code: 'COMMISSAIRE_AUX_COMPTES_OBLIGATOIRE',
        gravite: 'INFORMATION',
        libelle: 'Commissaire aux comptes obligatoire, sans condition de taille',
        consequence: `${seuils.regle.source} · ${seuils.regle.motif}`,
        action: "Vérifiez que le mandat est en cours et que le commissaire recevra les comptes en temps utile.",
        occurrences: [],
      });
    }

    // --- 11. Arrêtés d'exonération périmés ou sur le point de l'être --------
    //
    // Un arrêté prévisionnel du Ministère du Plan vaut deux ans (note
    // circulaire n° 003/2013, section B.III). Périmé, il se découvre au port,
    // la marchandise déjà débarquée et les frais de magasinage qui courent ·
    // c'est l'échéance la plus coûteuse à manquer de toutes celles que le
    // logiciel suit, et la seule qui ne laisse aucune régularisation possible
    // après coup : sans titre, les droits sont dus (code des douanes,
    // art. 338).
    //
    // Soixante jours d'avance, parce que le renouvellement exige un rapport
    // d'évaluation SUR TERRAIN, qui suppose une descente à organiser.
    // Le module des exonérations douanières est réservé au SYCEBNL côté
    // serveur (ExonerationsController · @ReferentielsAutorises) : le contrôle
    // porte la même borne, sans quoi le cloisonnement ne serait fait que d'un
    // côté et une exonération arrivée par un autre chemin servirait la
    // procédure ASBL de la note circulaire 003/2013 à une entreprise.
    const aujourdhui = new Date();
    const exonerations =
      tenant.referentiel !== Referentiel.SYCEBNL
        ? []
        : await this.prisma.exoneration.findMany({
      where: {
        tenantId,
        statut: StatutExoneration.ACCORDE,
        dateFinValidite: { not: null, lte: new Date(aujourdhui.getTime() + JOURS_ALERTE_RENOUVELLEMENT * 86_400_000) },
      },
            orderBy: { dateFinValidite: 'asc' },
          });
    if (exonerations.length > 0) {
      const perimes = exonerations.filter((e) => e.dateFinValidite! < aujourdhui);
      anomalies.push({
        code: 'EXONERATION_A_RENOUVELER',
        gravite: perimes.length > 0 ? 'BLOQUANT' : 'AVERTISSEMENT',
        libelle:
          perimes.length > 0
            ? "Arrêté d'exonération EXPIRÉ"
            : "Arrêté d'exonération à renouveler sous soixante jours",
        consequence:
          "Aucune franchise ne se présume : « Il ne peut être accordé de franchise des droits et taxes qu'en " +
          "application des conventions internationales ou que par la loi ou en vertu de celle-ci » (code des " +
          "douanes, ordonnance-loi n° 10/002, art. 338). Sans arrêté en cours de validité, les droits et taxes " +
          'sont dus à l’importation, et la marchandise reste au port aux frais de l’entité.',
        action:
          "Déposez le dossier de renouvellement au Ministère du Plan : requête signée, copie de l'ancien arrêté, " +
          "rapport d'évaluation sur terrain et liste quantifiée des biens (note circulaire n° 003/2013, " +
          'section B.III). Le rapport de terrain suppose une descente · c’est lui qui commande le délai.',
        occurrences: exonerations.map((e) => ({
          reference: e.referenceArrete ?? e.objet,
          detail:
            e.dateFinValidite! < aujourdhui
              ? `Expiré le ${e.dateFinValidite!.toISOString().slice(0, 10)}`
              : `Expire le ${e.dateFinValidite!.toISOString().slice(0, 10)}`,
        })),
      });
    }

    // --- 12. Bien repris sans son amortissement antérieur --------------------
    //
    // Un bien mis en service AVANT le premier exercice du dossier a été amorti
    // ailleurs, et ce cumul doit être repris sur sa fiche. À défaut, le calcul
    // de la dotation repart de zéro : le bien s'amortit sa durée entière une
    // seconde fois, et la valeur nette comptable des états s'écarte du solde du
    // compte 28 porté par le bilan d'ouverture.
    //
    // Rien ne casse · les écritures s'équilibrent, aucun total ne bouge. C'est
    // pourquoi ce contrôle existe : l'erreur ne se signale jamais d'elle-même.
    const premierExercice = await this.prisma.exercice.findFirst({
      where: { tenantId },
      orderBy: { dateDebut: 'asc' },
      select: { dateDebut: true },
    });
    if (premierExercice) {
      const reprises = await this.prisma.immobilisation.findMany({
        where: {
          tenantId,
          statut: 'EN_SERVICE',
          dateMiseEnService: { lt: premierExercice.dateDebut },
          amortissementAnterieur: 0,
        },
        select: { designation: true, dateMiseEnService: true, valeurOrigine: true },
        orderBy: { dateMiseEnService: 'asc' },
      });
      if (reprises.length > 0) {
        anomalies.push({
          code: 'IMMO_REPRISE_SANS_ANTERIEUR',
          gravite: 'AVERTISSEMENT',
          libelle: 'Bien mis en service avant le dossier, sans amortissement antérieur repris',
          consequence:
            "Le calcul de la dotation ne connaît que les annuités passées dans ce logiciel : il repart de zéro et " +
            "amortira le bien sa durée entière une seconde fois. La valeur nette comptable des états s'écartera " +
            'alors du solde du compte 28 repris par le bilan d’ouverture, sans qu’aucun total ne le signale.',
          action:
            "Renseignez l'amortissement déjà pratiqué sur la fiche du bien (Structure > Immobilisations) · c'est le " +
            'cumul porté au compte 28 pour ce bien à la date de reprise.',
          occurrences: reprises.slice(0, 200).map((i) => ({
            reference: i.designation,
            detail: `Mis en service le ${i.dateMiseEnService.toISOString().slice(0, 10)}, avant l'ouverture du dossier`,
            montant: Number(i.valeurOrigine),
            date: i.dateMiseEnService.toISOString().slice(0, 10),
          })),
        });
      }
    }

    // --- 13. Immobilisation amortissable sans dotation sur l'exercice --------
    //
    // « LA CONSTATATION DE LA DOTATION AUX AMORTISSEMENTS D'UNE IMMOBILISATION
    // AMORTISSABLE EST OBLIGATOIRE MÊME EN CAS D'ABSENCE OU D'INSUFFISANCE DE
    // BÉNÉFICE » · AUDCIF art. 45, dernier alinéa. L'article n'est pas dans la
    // liste d'exclusion de l'art. 3 du SYCEBNL, dont la fiche du COMPTE 28 dit
    // la même chose : le contrôle vaut pour les deux référentiels.
    //
    // Ce qui se passe quand on l'oublie · le résultat est surévalué du montant
    // de la dotation non passée, la valeur nette comptable reste à sa valeur
    // brute, et RIEN NE LE SIGNALE : les écritures s'équilibrent, la balance
    // boucle, le bilan boucle. Pire, l'oubli devient irréparable à la clôture,
    // qui ferme l'exercice à toute écriture nouvelle.
    //
    // AVERTISSEMENT et non BLOQUANT, et la clôture ne refuse pas · un cabinet
    // peut avoir passé ses dotations à la main, par une écriture directe 68/28,
    // sans passer par le module. Dans ce cas la comptabilité est juste et la
    // table des dotations vide : bloquer serait refuser une clôture régulière.
    // Le logiciel signale ce qu'il voit et laisse le comptable trancher.
    const amortissables = await this.prisma.immobilisation.findMany({
      where: {
        tenantId,
        statut: 'EN_SERVICE',
        // Un bien pas encore en service ne s'amortit pas · l'amortissement
        // court de la mise en état de fonctionner (art. 45), pas de l'achat.
        dateMiseEnService: { lte: ex.dateFin },
      },
      select: {
        designation: true,
        dateMiseEnService: true,
        valeurOrigine: true,
        valeurResiduelle: true,
        amortissementAnterieur: true,
        dotations: { select: { exerciceId: true, montant: true } },
      },
      orderBy: { dateMiseEnService: 'asc' },
    });
    const sansDotation = amortissables.filter((i) => {
      if (i.dotations.some((d) => d.exerciceId === exerciceId)) return false;
      // Un bien intégralement amorti n'a plus rien à doter · l'absence de
      // dotation y est la situation normale, pas un oubli.
      const base = Number(i.valeurOrigine) - Number(i.valeurResiduelle);
      const cumul =
        Number(i.amortissementAnterieur) +
        i.dotations.reduce((t, d) => t + Number(d.montant), 0);
      return base - cumul > 0.005;
    });
    if (sansDotation.length > 0) {
      anomalies.push({
        code: 'IMMO_SANS_DOTATION',
        gravite: 'AVERTISSEMENT',
        libelle: 'Immobilisation amortissable sans dotation sur cet exercice',
        consequence:
          "L'AUDCIF, art. 45, rend la dotation obligatoire « même en cas d'absence ou d'insuffisance de bénéfice ». " +
          'Sans elle, le résultat est surévalué du montant non doté et la valeur nette comptable reste à la valeur ' +
          'brute, sans qu’aucun total ne le signale : les écritures s’équilibrent et la balance boucle. La clôture ' +
          'rendra l’oubli irréparable, l’exercice n’acceptant plus aucune écriture.',
        action:
          'Passez les dotations de l’exercice (Structure > Immobilisations > Dotations) avant de clôturer. Si vos ' +
          'dotations ont été saisies à la main par une écriture 68/28 sans passer par le module, ce signalement est ' +
          'sans objet pour les biens concernés.',
        occurrences: sansDotation.slice(0, 200).map((i) => ({
          reference: i.designation,
          detail: `Mis en service le ${i.dateMiseEnService.toISOString().slice(0, 10)}, aucune dotation sur cet exercice`,
          montant: Number(i.valeurOrigine),
          date: i.dateMiseEnService.toISOString().slice(0, 10),
        })),
      });
    }

    // --- 14. Personnel extérieur resté au compte 637 à la clôture ------------
    //
    // LES DEUX RÉFÉRENTIELS ÉCRIVENT LE MÊME VIREMENT, CHACUN DANS SON TEXTE ·
    // ce n'est pas une transposition de l'un vers l'autre.
    //
    //  · SYCEBNL, Partie 2 ch. 3, fiche du COMPTE 63 : « en cours d'exercice,
    //    l'entité utilisatrice enregistre les factures reçues […] au débit du
    //    compte 637 ; À LA CLÔTURE DE L'EXERCICE, LE COMPTE 637 EST VIRÉ, POUR
    //    SOLDE, AU DÉBIT DU COMPTE 667 » ; la fiche du COMPTE 66 le redit :
    //    « ce virement solde le compte 637 ».
    //  · AUDCIF, Titre VIII ch. 27 § 2 : « à la clôture de l'exercice, les
    //    comptes 6371 et 6372 sont virés, pour solde, au débit du compte
    //    667 ».
    //
    // POURQUOI · c'est l'une des quatre applications de la prééminence de la
    // réalité sur l'apparence. La facture est juridiquement un service
    // extérieur ; économiquement, c'est du travail. Le texte range donc la
    // charge en personnel malgré l'absence de contrat de travail.
    //
    // CE QUI EST FAUX SI PERSONNE NE LE FAIT · la charge reste sur la ligne
    // « Services extérieurs » du compte de résultat au lieu de la ligne
    // « Charges de personnel » (TG contre TJ au SYCEBNL, RH contre le poste
    // de personnel au SYSCOHADA). Le résultat net ne bouge pas d'un franc :
    // les deux comptes sont en classe 6. Rien ne se déséquilibre, la balance
    // boucle, et c'est pour cela que l'oubli ne se signale jamais seul. Au
    // SYSCOHADA il fausse en outre la cascade des soldes intermédiaires que
    // l'art. 31 de l'AUDCIF impose de faire apparaître, la valeur ajoutée se
    // calculant après les services extérieurs et avant les charges de
    // personnel.
    const lignes637 = await this.prisma.ligneEcriture.findMany({
      where: {
        compte: { tenantId, numero: { startsWith: '637' } },
        ecriture: { tenantId, exerciceId },
      },
      select: { debit: true, credit: true, compte: { select: { numero: true, intitule: true } } },
    });
    const soldes637 = new Map<string, { intitule: string; solde: number }>();
    for (const l of lignes637) {
      const acc = soldes637.get(l.compte.numero) ?? { intitule: l.compte.intitule, solde: 0 };
      acc.solde += Number(l.debit) - Number(l.credit);
      soldes637.set(l.compte.numero, acc);
    }
    const restes637 = [...soldes637.entries()]
      .filter(([, v]) => Math.abs(v.solde) > 0.005)
      .sort(([a], [b]) => a.localeCompare(b));
    if (restes637.length > 0) {
      const sourceVirement =
        tenant.referentiel === Referentiel.SYCEBNL
          ? 'SYCEBNL, Partie 2 ch. 3, fiches des comptes 63 et 66'
          : 'AUDCIF, Titre VIII ch. 27 § 2';
      anomalies.push({
        code: 'PERSONNEL_EXTERIEUR_NON_VIRE',
        gravite: 'AVERTISSEMENT',
        libelle: 'Personnel extérieur resté au compte 637 à la clôture',
        consequence:
          `Le texte (${sourceVirement}) veut qu'à la clôture le compte 637 soit viré, POUR SOLDE, au débit du ` +
          "compte 667 : c'est l'une des quatre applications de la prééminence de la réalité sur l'apparence, la " +
          "facture étant juridiquement un service extérieur mais économiquement du travail. Tant que le virement " +
          "n'est pas passé, la charge s'imprime sur la ligne « Services extérieurs » au lieu de « Charges de " +
          'personnel ». Le résultat net ne bouge pas, les deux comptes étant en classe 6 : rien ne se ' +
          "déséquilibre et l'oubli ne se signale jamais de lui-même.",
        action:
          'Passez le virement de fin d’exercice : débit 667 « Rémunération transférée de personnel extérieur », ' +
          'crédit 637 pour le solde. Pensez à indiquer aux notes annexes l’origine des charges ainsi transférées, ' +
          'afin de ne pas fausser l’assiette des prélèvements assis sur la masse salariale.',
        occurrences: restes637.slice(0, 200).map(([numero, v]) => ({
          reference: `${numero} ${v.intitule}`,
          detail: 'Solde débiteur non viré au compte 667',
          montant: Math.round(v.solde * 100) / 100,
        })),
      });
    }

    // --- 15. Dépréciation d'immobilisation que le module ignore ---------------
    //
    // LES DEUX TEXTES IMPOSENT LA DÉPRÉCIATION, chacun dans le sien.
    //
    //  · SYCEBNL, Partie 2 ch. 3, fiche du COMPTE 29 : « à la clôture de chaque
    //    exercice une entité doit apprécier s'il existe un quelconque indice
    //    qu'un actif a subi une perte de valeur […] l'actif doit être déprécié
    //    lorsque la valeur nette comptable est supérieure à la valeur actuelle
    //    […] même en cas d'absence ou d'insuffisance d'excédent, il doit être
    //    procédé aux dotations nécessaires ». Et : « les dépréciations sont
    //    inscrites distinctement à l'actif, EN DIMINUTION DE LA VALEUR BRUTE
    //    des biens correspondants pour donner leur valeur comptable nette ».
    //  · AUDCIF art. 46 et Titre VIII ch. 12, en termes identiques, avec en
    //    plus la règle de recalcul : « après la comptabilisation d'une perte de
    //    valeur, l'amortissement de l'actif doit être calculé sur la base de la
    //    valeur comptable brute diminuée de la valeur résiduelle
    //    prévisionnelle, des amortissements cumulés ET DE LA DÉPRÉCIATION ».
    //
    // CE QUE LE MODULE FAIT, ET QUI DIVERGE. Le schéma déclare la dépréciation
    // hors périmètre, ce qui est un choix assumé · mais les comptes 29 sont
    // semés et mouvementables, et un cabinet qui constate un indice DOIT doter.
    // Dans ce cas, deux divergences s'installent sans bruit :
    //
    //  1. la base amortissable du module reste « valeur d'origine moins valeur
    //     résiduelle » · elle ignore la dépréciation, et le plan d'amortissement
    //     s'écarte de la règle de recalcul dès l'exercice suivant ;
    //  2. la SORTIE du bien crédite le compte d'immobilisation pour sa valeur
    //     d'origine et débite l'amortissement cumulé, sans jamais solder le 29 ·
    //     la valeur comptable nette portée au compte 81 est alors surévaluée du
    //     montant déprécié, la plus ou moins-value de cession est fausse
    //     d'autant, et le compte 29 garde un solde pour un bien qui n'existe
    //     plus.
    //
    // Le contrôle ne se déclenche que si le dossier fait LES DEUX : porter une
    // dépréciation ET tenir des immobilisations dans le module. Une
    // dépréciation seule (titres, dossier sans module) ne diverge de rien.
    const lignes29 = await this.prisma.ligneEcriture.findMany({
      where: {
        compte: { tenantId, numero: { startsWith: '29' } },
        ecriture: { tenantId, exerciceId },
      },
      select: { debit: true, credit: true, compte: { select: { numero: true, intitule: true } } },
    });
    const soldes29 = new Map<string, { intitule: string; solde: number }>();
    for (const l of lignes29) {
      const acc = soldes29.get(l.compte.numero) ?? { intitule: l.compte.intitule, solde: 0 };
      // Une dépréciation est CRÉDITRICE · le solde retenu est donc crédit
      // moins débit, la reprise venant en diminution.
      acc.solde += Number(l.credit) - Number(l.debit);
      soldes29.set(l.compte.numero, acc);
    }
    /*
      CE QUE LE MODULE A LUI-MÊME POSTÉ NE COMPTE PAS.

      Depuis que la dépréciation est portée dans le module, ses propres
      écritures mouvementent elles aussi le compte 29. Les compter ici ferait
      crier le contrôle sur le dossier qui fait exactement ce qu'on lui
      demande · et un avertissement qui se trompe est un avertissement qu'on
      apprend à ignorer. On retranche donc, compte 29 par compte 29, ce que la
      table DepreciationImmobilisation porte pour cet exercice ; ne reste que
      ce qui a été passé à la main, qui est le seul cas divergent.
    */
    if ([...soldes29.values()].some((v) => v.solde > 0.005)) {
      const duModule = await this.prisma.depreciationImmobilisation.findMany({
        where: { exerciceId, immobilisation: { tenantId } },
        select: { sens: true, montant: true, compteDepreciation: { select: { numero: true } } },
      });
      for (const d of duModule) {
        const acc = soldes29.get(d.compteDepreciation.numero);
        if (!acc) continue;
        acc.solde -= d.sens === SensDepreciation.DOTATION ? Number(d.montant) : -Number(d.montant);
      }
    }

    const depreciations = [...soldes29.entries()]
      .filter(([, v]) => v.solde > 0.005)
      .sort(([a], [b]) => a.localeCompare(b));
    if (depreciations.length > 0) {
      const immosDuModule = await this.prisma.immobilisation.count({
        where: { tenantId, statut: 'EN_SERVICE' },
      });
      if (immosDuModule > 0) {
        const sourceDepreciation =
          tenant.referentiel === Referentiel.SYCEBNL
            ? 'SYCEBNL, Partie 2 ch. 3, fiche du compte 29'
            : 'AUDCIF art. 46 et Titre VIII ch. 12';
        anomalies.push({
          code: 'DEPRECIATION_IMMO_HORS_MODULE',
          gravite: 'AVERTISSEMENT',
          libelle: 'Dépréciation d’immobilisation que le module ne connaît pas',
          consequence:
            `Le texte (${sourceDepreciation}) inscrit la dépréciation en diminution de la valeur brute pour ` +
            'donner la valeur comptable nette. Le module d’immobilisations ne la connaît pas : sa base ' +
            'amortissable reste la valeur d’origine diminuée de la seule valeur résiduelle, et sa SORTIE de bien ' +
            'ne solde pas le compte 29. Sur un bien déprécié, la valeur comptable nette portée au compte 81 sera ' +
            'donc surévaluée du montant déprécié, la plus ou moins-value de cession fausse d’autant, et le ' +
            'compte 29 gardera un solde pour un bien qui n’existe plus. Rien ne se déséquilibre : l’écriture ' +
            'reste équilibrée et la balance boucle.',
          action:
            'Avant de sortir un bien déprécié, passez la reprise de sa dépréciation à la main (débit 29, crédit ' +
            '79 ou 863 selon le caractère de l’opération), puis sortez le bien. Vérifiez aussi le plan ' +
            'd’amortissement des biens dépréciés, que le module continue de calculer sur la base d’origine.',
          occurrences: depreciations.slice(0, 200).map(([numero, v]) => ({
            reference: `${numero} ${v.intitule}`,
            detail: 'Dépréciation portée hors du module d’immobilisations',
            montant: Math.round(v.solde * 100) / 100,
          })),
        });
      }
    }

    // --- 16. Réévaluation portée hors du module d'immobilisations -------------
    //
    // MÊME FAMILLE QUE LE CONTRÔLE 15, ET LE MÊME MÉCANISME · le module range
    // la valeur d'entrée dans `valeurOrigine`, et rien d'extérieur ne peut la
    // mettre à jour. Une réévaluation passée à la main augmente la valeur au
    // bilan (débit du compte 2x, crédit du 106) sans que le module en sache
    // rien : il continue d'amortir et de sortir le bien au coût historique.
    //
    // CE QUE CHAQUE TEXTE DIT, ET SEULEMENT LUI.
    //
    //  · SYCEBNL · le cadre conceptuel (§ 3.3.1.2.1) prévoit « le recours à la
    //    réévaluation qui peut être libre ou légale », portant « exclusivement
    //    sur les immobilisations corporelles et financières », et la fiche du
    //    COMPTE 106 en fait « la contrepartie au passif du bilan des
    //    augmentations de valeur d'éléments actifs ».
    //  · AUDCIF · art. 62 à 65 et Titre VIII ch. 28, qui ajoutent DEUX règles
    //    que le texte SYCEBNL n'écrit pas et qu'il ne faut donc pas lui prêter :
    //    l'art. 64, « la valeur réévaluée des immobilisations amortissables
    //    sert de base au calcul des amortissements sur la durée d'utilité
    //    restant à courir depuis l'ouverture de l'exercice de réévaluation » ;
    //    et le ch. 28 § 6, « le solde de l'écart de réévaluation d'un bien
    //    cédé ou mis hors service doit faire l'objet d'un transfert à un poste
    //    de réserve non distribuable ».
    //
    // La conséquence logicielle, elle, est la même des deux côtés : le bilan
    // porte la valeur réévaluée, le module la valeur historique. Sa dotation
    // et sa sortie divergent, sans qu'aucune écriture ne se déséquilibre.
    const lignes106 = await this.prisma.ligneEcriture.findMany({
      where: {
        compte: { tenantId, numero: { startsWith: '106' } },
        ecriture: { tenantId, exerciceId },
      },
      select: { debit: true, credit: true, compte: { select: { numero: true, intitule: true } } },
    });
    const soldes106 = new Map<string, { intitule: string; solde: number }>();
    for (const l of lignes106) {
      const acc = soldes106.get(l.compte.numero) ?? { intitule: l.compte.intitule, solde: 0 };
      // L'écart de réévaluation est CRÉDITEUR · c'est une contrepartie de passif.
      acc.solde += Number(l.credit) - Number(l.debit);
      soldes106.set(l.compte.numero, acc);
    }
    const ecartsReevaluation = [...soldes106.entries()]
      .filter(([, v]) => v.solde > 0.005)
      .sort(([a], [b]) => a.localeCompare(b));
    if (ecartsReevaluation.length > 0) {
      const immosReevaluees = await this.prisma.immobilisation.count({
        where: { tenantId, statut: 'EN_SERVICE' },
      });
      if (immosReevaluees > 0) {
        const estSycebnlReevaluation = tenant.referentiel === Referentiel.SYCEBNL;
        anomalies.push({
          code: 'REEVALUATION_IMMO_HORS_MODULE',
          gravite: 'AVERTISSEMENT',
          libelle: 'Écart de réévaluation que le module d’immobilisations ne connaît pas',
          consequence:
            (estSycebnlReevaluation
              ? 'Le SYCEBNL (cadre conceptuel § 3.3.1.2.1 et fiche du compte 106) fait de l’écart de ' +
                'réévaluation la contrepartie au passif de l’augmentation de valeur portée à l’actif. '
              : 'L’AUDCIF (art. 62 à 65 et Titre VIII ch. 28) impose en outre que la valeur RÉÉVALUÉE serve de ' +
                'base aux amortissements sur la durée restant à courir (art. 64), et que le solde de l’écart ' +
                'd’un bien cédé soit transféré à une réserve non distribuable (ch. 28 § 6). ') +
            'Or le module d’immobilisations garde la valeur d’origine historique : il continue d’amortir et de ' +
            'sortir le bien sur cette base. Le bilan porte la valeur réévaluée, le module la valeur ancienne, et ' +
            'aucune écriture ne se déséquilibre · la balance boucle des deux façons.',
          action:
            'Reprenez à la main le plan d’amortissement des biens réévalués, et, avant toute cession, la sortie ' +
            'de l’écart de réévaluation correspondant. Vérifiez aussi que la réévaluation porte bien sur ' +
            'l’ENSEMBLE des immobilisations corporelles et financières : une réévaluation partielle est ' +
            'interdite.',
          occurrences: ecartsReevaluation.slice(0, 200).map(([numero, v]) => ({
            reference: `${numero} ${v.intitule}`,
            detail: 'Écart de réévaluation porté hors du module d’immobilisations',
            montant: Math.round(v.solde * 100) / 100,
          })),
        });
      }
    }

    // --- 17 à 19. Les trois indices de minoration relevés par la DGI ----------
    //
    // SOURCE · séminaire CPCC sur l'arrêté des comptes 2024, module « Travaux
    // de fin d'exercice : détermination du résultat comptable et du résultat
    // fiscal », animé par la Division chargée de la Formation de la DGI. Le
    // module présente une série d'écritures dont l'absence est lue par
    // l'administration comme une « intention de MINORER la base imposable ».
    //
    // CE QUE CES TROIS CONTRÔLES NE SONT PAS · une accusation. Chacun des cas
    // a une explication innocente possible, et c'est pourquoi ils avertissent
    // au lieu de bloquer. Ce qu'ils apportent, c'est de montrer au cabinet ce
    // qu'un vérificateur regardera, AVANT qu'il ne le regarde.
    //
    // LES TAUX ET LES NOMS D'IMPÔT DE CE SÉMINAIRE NE SONT PAS REPRIS · il
    // décrit l'IBP, abrogé au 1er janvier 2026 par la loi n° 23/053 et
    // remplacé par l'IS et l'IRPP. Seuls les MÉCANISMES d'écriture sont
    // retenus ici, et aucun d'eux ne dépend d'un taux.
    //
    // Le filtrage par préfixe est refait EN JAVASCRIPT après la requête. Ce
    // n'est pas une redondance inutile : il rend chaque contrôle indépendant
    // de ce que les autres demandent à la même table, ce qui compte autant en
    // test qu'en lecture.
    const lignesFiscales = await this.prisma.ligneEcriture.findMany({
      where: {
        compte: { tenantId, OR: [{ numero: { startsWith: '613' } }, { numero: { startsWith: '781' } }] },
        ecriture: { tenantId, exerciceId },
      },
      select: { debit: true, credit: true, compte: { select: { numero: true, intitule: true } } },
    });
    const mouvement = (prefixe: string) =>
      lignesFiscales
        .filter((l) => l.compte.numero.startsWith(prefixe))
        .reduce((t, l) => t + Number(l.debit) + Number(l.credit), 0);
    const solde613 = lignesFiscales
      .filter((l) => l.compte.numero.startsWith('613'))
      .reduce((t, l) => t + Number(l.debit) - Number(l.credit), 0);

    // --- 17. Transport pour le compte de tiers, jamais transféré -------------
    //
    // Le compte 613 enregistre un transport que l'entité AVANCE pour le compte
    // d'un tiers et refacture. Tant que le transfert de charges n'est pas
    // passé, la charge reste chez elle : le résultat est minoré du montant
    // refacturé, et la contrepartie attendue au compte 781 n'existe pas.
    // Contrôle réservé au SYSCOHADA · une entité à but non lucratif est
    // exemptée d'impôt sur les sociétés (loi n° 23/053, art. 5), le risque
    // d'assiette n'a donc pas d'objet pour elle.
    if (tenant.referentiel === Referentiel.SYSCOHADA && solde613 > 0.005 && mouvement('781') <= 0.005) {
      anomalies.push({
        code: 'TRANSPORT_TIERS_SANS_TRANSFERT',
        gravite: 'AVERTISSEMENT',
        libelle: 'Transport pour le compte de tiers sans transfert de charges',
        consequence:
          'Le compte 613 porte un solde débiteur alors qu’aucun compte 781 « Transferts de charges » n’a été ' +
          'mouvementé de l’exercice. Un transport avancé pour le compte d’un tiers se refacture : sans le ' +
          'transfert, la charge reste dans le résultat de l’entité, qui s’en trouve minoré du montant refacturé. ' +
          'L’administration fiscale lit cette absence comme un indice de minoration de la base imposable.',
        action:
          'Si ces transports ont bien été refacturés, passez le transfert de charges au crédit du compte 781. ' +
          'S’ils sont restés à votre charge, le compte 613 n’est pas le bon : ils relèvent alors du compte 61 ' +
          'correspondant à la nature du transport.',
        occurrences: [{ reference: '613 Transports pour le compte de tiers', detail: 'Solde débiteur non transféré', montant: Math.round(solde613 * 100) / 100 }],
      });
    }

    // --- 18. Extourne de régularisation d'un montant différent ---------------
    //
    // LE CAS LE PLUS FIN DES TROIS, et celui que la balance ne trahit jamais.
    // Le module de la DGI le démontre par un extrait : à la clôture, le 476 a
    // bien un solde DÉBITEUR et le 477 un solde CRÉDITEUR, tout paraît sain ·
    // mais les MOUVEMENTS de la période portent un crédit de 50 000 sur le 476
    // qui ne correspond à rien. « À la clôture, les soldes normaux de ces
    // comptes cachent leurs mouvements anormaux. »
    //
    // Le vice est l'extourne d'ouverture passée pour un montant AUTRE que le
    // solde de clôture de l'exercice précédent : extourner moins qu'on n'avait
    // constaté laisse une charge d'avance au bilan, extourner plus crée une
    // charge qui n'existe pas. Dans les deux sens le résultat est faux, et rien
    // ne se déséquilibre.
    //
    // Le contrôle compare donc l'extourne au solde repris, et non les soldes
    // entre eux. Il vaut pour LES DEUX RÉFÉRENTIELS : ce n'est pas un risque
    // d'assiette, c'est une régularisation fausse.
    const exercicePrecedent = await this.prisma.exercice.findFirst({
      where: { tenantId, dateFin: { lt: ex.dateDebut } },
      orderBy: { dateFin: 'desc' },
      select: { id: true, dateFin: true },
    });
    // Le faux Prisma des tests rend l'exercice courant pour toute recherche ·
    // sans cette garde, le contrôle se comparerait à lui-même.
    if (exercicePrecedent && exercicePrecedent.dateFin < ex.dateDebut) {
      const lignesRegul = await this.prisma.ligneEcriture.findMany({
        where: {
          compte: { tenantId, OR: [{ numero: { startsWith: '476' } }, { numero: { startsWith: '477' } }] },
          ecriture: { tenantId, exerciceId: { in: [exerciceId, exercicePrecedent.id] } },
        },
        select: {
          debit: true,
          credit: true,
          ecriture: { select: { exerciceId: true } },
          compte: { select: { numero: true, intitule: true } },
        },
      });
      const ecarts: Array<{ numero: string; intitule: string; repris: number; extourne: number }> = [];
      for (const prefixe of ['476', '477']) {
        const duCompte = lignesRegul.filter((l) => l.compte.numero.startsWith(prefixe));
        const numeros = [...new Set(duCompte.map((l) => l.compte.numero))];
        for (const numero of numeros) {
          const lignes = duCompte.filter((l) => l.compte.numero === numero);
          // Solde de clôture de l'exercice précédent, dans son sens naturel ·
          // débiteur pour une charge constatée d'avance, créditeur pour un
          // produit constaté d'avance.
          const soldePrecedent = lignes
            .filter((l) => l.ecriture.exerciceId === exercicePrecedent.id)
            .reduce(
              (t, l) => t + (prefixe === '476' ? Number(l.debit) - Number(l.credit) : Number(l.credit) - Number(l.debit)),
              0,
            );
          // Ce qui a été EXTOURNÉ sur l'exercice · le sens inverse.
          const extourne = lignes
            .filter((l) => l.ecriture.exerciceId === exerciceId)
            .reduce((t, l) => t + (prefixe === '476' ? Number(l.credit) : Number(l.debit)), 0);
          if (soldePrecedent > 0.005 && Math.abs(extourne - soldePrecedent) > 0.005) {
            ecarts.push({ numero, intitule: lignes[0].compte.intitule, repris: soldePrecedent, extourne });
          }
        }
      }
      if (ecarts.length > 0) {
        anomalies.push({
          code: 'EXTOURNE_REGULARISATION_INCOHERENTE',
          gravite: 'AVERTISSEMENT',
          libelle: 'Extourne de régularisation d’un montant différent du solde repris',
          consequence:
            'Une charge ou un produit constaté d’avance à la clôture précédente doit être extourné à l’ouverture ' +
            'POUR SON MONTANT EXACT. Extourner moins laisse au bilan une régularisation qui n’a plus d’objet ; ' +
            'extourner plus crée une charge ou un produit qui n’a jamais existé. Dans les deux sens le résultat ' +
            'de l’exercice est faux, et rien ne le signale : l’écriture s’équilibre et le solde de clôture peut ' +
            'redevenir parfaitement normal. C’est précisément ce que l’administration fiscale recherche sur ces ' +
            'deux comptes.',
          action:
            'Rapprochez l’extourne du solde repris, compte par compte, et corrigez l’écart. Si l’écart est ' +
            'volontaire (une part de la régularisation court encore), la reprise doit être étalée par une ' +
            'écriture explicite, pas par une extourne partielle silencieuse.',
          occurrences: ecarts.slice(0, 200).map((e) => ({
            reference: `${e.numero} ${e.intitule}`,
            detail: `Solde repris ${e.repris.toFixed(2)}, extourné ${e.extourne.toFixed(2)}`,
            montant: Math.round((e.extourne - e.repris) * 100) / 100,
          })),
        });
      }

      // --- 19. Avance client reportée d'un exercice à l'autre ----------------
      //
      // « Les avances et acomptes reçus des clients au cours de l'exercice N-1
      // doivent être considérés à juste titre le CHIFFRE D'AFFAIRES de
      // l'exercice N. » C'est la lecture de l'administration, pas une règle de
      // l'AUDCIF · d'où un contrôle qui INFORME et n'accuse pas, et qui ne
      // s'adresse qu'aux dossiers SYSCOHADA, une entité à but non lucratif
      // étant exemptée d'impôt sur les sociétés (loi n° 23/053, art. 5).
      if (tenant.referentiel === Referentiel.SYSCOHADA) {
        const lignes419 = await this.prisma.ligneEcriture.findMany({
          where: {
            compte: { tenantId, numero: { startsWith: '419' } },
            ecriture: { tenantId, exerciceId: exercicePrecedent.id },
          },
          select: { debit: true, credit: true, compte: { select: { numero: true, intitule: true } } },
        });
        const soldes419 = new Map<string, { intitule: string; solde: number }>();
        for (const l of lignes419.filter((x) => x.compte.numero.startsWith('419'))) {
          const acc = soldes419.get(l.compte.numero) ?? { intitule: l.compte.intitule, solde: 0 };
          acc.solde += Number(l.credit) - Number(l.debit);
          soldes419.set(l.compte.numero, acc);
        }
        const avancesReportees = [...soldes419.entries()]
          .filter(([, v]) => v.solde > 0.005)
          .sort(([a], [b]) => a.localeCompare(b));
        if (avancesReportees.length > 0) {
          anomalies.push({
            code: 'AVANCE_CLIENT_REPORTEE',
            gravite: 'INFORMATION',
            libelle: 'Avances clients reçues à l’exercice précédent, à rattacher au chiffre d’affaires',
            consequence:
              'Des avances et acomptes reçus des clients figuraient au compte 419 à la clôture précédente. ' +
              'L’administration fiscale considère que ces avances constituent le chiffre d’affaires de ' +
              'l’exercice suivant : maintenues au passif sans que la vente soit constatée, elles minorent le ' +
              'produit imposable. Ce n’est pas une règle de l’AUDCIF mais une position de contrôle, d’où un ' +
              'simple signalement.',
            action:
              'Vérifiez, avance par avance, que la livraison ou la prestation a été facturée sur cet exercice et ' +
              'que le compte 419 a été soldé en conséquence. Une avance qui subsiste doit pouvoir être ' +
              'justifiée par une commande encore en cours.',
            occurrences: avancesReportees.slice(0, 200).map(([numero, v]) => ({
              reference: `${numero} ${v.intitule}`,
              detail: 'Solde créditeur à la clôture de l’exercice précédent',
              montant: Math.round(v.solde * 100) / 100,
            })),
          });
        }
      }
    }

    const ordre: Record<Gravite, number> = { BLOQUANT: 0, AVERTISSEMENT: 1, INFORMATION: 2 };
    anomalies.sort((a, b) => ordre[a.gravite] - ordre[b.gravite]);

    return {
      exerciceId,
      genereLe: new Date().toISOString(),
      anomalies,
      totaux: {
        bloquants: anomalies.filter((a) => a.gravite === 'BLOQUANT').length,
        avertissements: anomalies.filter((a) => a.gravite === 'AVERTISSEMENT').length,
        informations: anomalies.filter((a) => a.gravite === 'INFORMATION').length,
      },
    };
  }
}

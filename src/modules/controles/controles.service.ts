import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import {
  ClasseCompte,
  JeuEtatsFinanciersSycebnl,
  StatutEcriture,
  StatutExoneration,
  TypeCompteDetailTotal,
} from '@prisma/client';
import { JOURS_ALERTE_RENOUVELLEMENT } from '../exonerations/correspondance-exonerations';

/**
 * SEUILS DE DÉSIGNATION DE L'AUDITEUR · Acte uniforme SYCEBNL, article 19.
 *
 * Exprimés en FRANCS CFA par le texte, et laissés tels quels : le logiciel ne
 * connaît pas le taux applicable au dossier, et un seuil converti à un taux
 * inventé induirait en erreur plus sûrement qu'un seuil brut annoncé comme
 * tel. Même règle que pour le seuil du Système minimal de trésorerie.
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
 * sans pièce justificative, un compte hors nomenclature SYCEBNL. Un logiciel
 * qui se contente d'enregistrer laisse ces anomalies dormir jusqu'à l'audit.
 */
@Injectable()
export class ControlesService {
  /** Au-delà, une créance ou une dette non lettrée mérite qu'on la regarde. */
  private static readonly JOURS_ANCIENNETE_TIERS = 180;
  /** Délai de centralisation du brouillard · SYCEBNL, Partie 2 ch. 2. */
  private static readonly JOURS_CENTRALISATION = 7;

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

    // Comptes de caisse : le 57 du SYCEBNL, plus tout compte rattaché à un
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
  async seuilsAuditeur(tenantId: string, exerciceId: string, effectifPermanent: number) {
    const lignes = await this.prisma.ligneEcriture.findMany({
      where: { ecriture: { tenantId, exerciceId, statut: StatutEcriture.VALIDEE } },
      select: { debit: true, credit: true, compte: { select: { classe: true, typeCompte: true } } },
    });

    let totalBilan = 0;
    let ressources = 0;
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
      if (l.compte.classe === ClasseCompte.CLASSE_7) ressources += -solde;
    }
    totalBilan = Math.round(totalBilan * 100) / 100;
    ressources = Math.round(ressources * 100) / 100;

    const criteres = [
      {
        critere: 'Total du bilan',
        valeur: totalBilan,
        seuil: SEUIL_BILAN_AUDITEUR,
        franchi: totalBilan > SEUIL_BILAN_AUDITEUR,
        detail: `Total du bilan approché à ${totalBilan.toLocaleString('fr-FR')} · seuil ${SEUIL_BILAN_AUDITEUR.toLocaleString('fr-FR')} FCFA`,
      },
      {
        critere: 'Ressources annuelles',
        valeur: ressources,
        seuil: SEUIL_RESSOURCES_AUDITEUR,
        franchi: ressources > SEUIL_RESSOURCES_AUDITEUR,
        detail: `Ressources de l'exercice ${ressources.toLocaleString('fr-FR')} · seuil ${SEUIL_RESSOURCES_AUDITEUR.toLocaleString('fr-FR')} FCFA`,
      },
      {
        critere: 'Effectif permanent',
        valeur: effectifPermanent,
        seuil: SEUIL_EFFECTIF_AUDITEUR,
        franchi: effectifPermanent > SEUIL_EFFECTIF_AUDITEUR,
        detail:
          effectifPermanent > 0
            ? `${effectifPermanent} personnes employées à titre permanent · seuil ${SEUIL_EFFECTIF_AUDITEUR}`
            : "Effectif non renseigné · à saisir dans Structure > Paramètres du dossier pour que ce critère soit mesuré",
      },
    ];

    return {
      criteres,
      franchis: criteres.filter((c) => c.franchi),
      // Le seuil est légalement exprimé en FCFA et n'est PAS converti · voir
      // la note de tête de cette méthode.
      conversionAppliquee: false,
      source: 'Acte uniforme SYCEBNL du 22 décembre 2022, article 19 (sanctions : articles 24 à 27)',
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
    const brouillardEnRetard = ecritures.filter(
      (e) =>
        e.statut === StatutEcriture.BROUILLARD &&
        (maintenant - e.createdAt.getTime()) / 86_400_000 > ControlesService.JOURS_CENTRALISATION,
    );
    if (brouillardEnRetard.length > 0) {
      anomalies.push({
        code: 'BROUILLARD_EN_RETARD',
        gravite: 'AVERTISSEMENT',
        libelle: 'Brouillard non centralisé depuis plus de sept jours',
        consequence:
          "Le SYCEBNL veut les journaux auxiliaires centralisés au moins chaque semaine dans le journal ou le grand-livre (Partie 2, ch. 2). Au-delà, ce n'est plus un document de travail.",
        action: 'Relisez ces écritures dans État → Brouillard et validez-les.',
        occurrences: brouillardEnRetard.slice(0, 200).map((e) => ({
          reference: `${e.journal.code} n° ${e.numeroPiece ?? '·'}`,
          detail: `${e.libelle} · saisie il y a ${Math.floor((maintenant - e.createdAt.getTime()) / 86_400_000)} jours`,
          date: e.date.toISOString().slice(0, 10),
        })),
      });
    }

    // --- 5. Comptes de tiers au solde inversé --------------------------------
    const soldesTiers = new Map<string, number>();
    for (const e of ecritures) {
      for (const l of e.lignes) {
        const n = l.compte.numero;
        if (!n.startsWith('40') && !n.startsWith('41')) continue;
        soldesTiers.set(n, (soldesTiers.get(n) ?? 0) + Number(l.debit) - Number(l.credit));
      }
    }
    const inverses = [...soldesTiers.entries()].filter(
      ([numero, solde]) =>
        (numero.startsWith('41') && solde < -0.005) || (numero.startsWith('40') && solde > 0.005),
    );
    if (inverses.length > 0) {
      anomalies.push({
        code: 'TIERS_SOLDE_INVERSE',
        gravite: 'AVERTISSEMENT',
        libelle: 'Compte de tiers au solde inversé',
        consequence:
          "Un adhérent ou client-usager (41) créditeur, ou un fournisseur (40) débiteur, traduit le plus souvent un règlement imputé au mauvais compte, un double encaissement, ou une avance à reclasser.",
        action: 'Interrogez le compte et lettrez-le : le solde non lettré dira ce qui reste réellement dû.',
        occurrences: inverses.map(([numero, solde]) => ({
          reference: numero,
          detail: numero.startsWith('41') ? 'Adhérent / client-usager créditeur' : 'Fournisseur débiteur',
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
          "Une créance ancienne non lettrée est soit déjà réglée sans que le rapprochement ait été fait, soit douteuse · dans le second cas elle appelle une dépréciation (compte 416, note annexe).",
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
    if (tenant.jeuEtatsFinanciersSycebnl !== JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE) {
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
          consequence:
            "On ne saura jamais à qui cette dépense a été payée : ni relevé fournisseur, ni balance âgée, ni lettrage, ni circularisation possible. La charge et son règlement sont confondus en une seule écriture, ce que le postulat de la comptabilité d'engagement écarte (SYCEBNL, Partie 1, ch. 2).",
          action:
            "Passez deux écritures : la charge par le crédit du tiers (compte 40 fournisseur, 42 personnel, 43 organismes sociaux, 44 État selon le cas), puis le règlement par le débit de ce tiers et le crédit de la trésorerie. C'est le schéma des § 2.2 et 2.4 de la Partie 3, ch. 3.",
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

    // --- 7. Comptes hors nomenclature SYCEBNL --------------------------------
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
    // Un compte de classe 9 mouvementé est normal (contributions volontaires),
    // mais il ne doit jamais peser sur le résultat : le signaler évite qu'on
    // s'étonne de ne pas le retrouver au compte de résultat.
    const classe9 = [...new Set(ecritures.flatMap((e) => e.lignes.map((l) => l.compte.numero)))].filter((n) =>
      n.startsWith('9'),
    );
    if (classe9.length > 0) {
      anomalies.push({
        code: 'CLASSE_9_MOUVEMENTEE',
        gravite: 'INFORMATION',
        libelle: 'Contributions volontaires en nature enregistrées',
        consequence:
          "Les comptes de classe 9 sont hors bilan et hors résultat : ils ne modifient ni le résultat ni la situation nette, et se présentent en note annexe.",
        action: 'Vérifiez que la note annexe des contributions volontaires est renseignée.',
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
    if (seuils.franchis.length > 0) {
      anomalies.push({
        code: 'SEUIL_AUDITEUR_FRANCHI',
        gravite: 'AVERTISSEMENT',
        libelle: "Seuil de désignation d'un auditeur franchi",
        consequence:
          "L'article 19 de l'Acte uniforme SYCEBNL rend la désignation d'un auditeur OBLIGATOIRE dès qu'un seul des " +
          'trois critères est franchi : total du bilan supérieur à 100 000 000 FCFA, ressources annuelles supérieures ' +
          "à 200 000 000 FCFA, ou plus de vingt personnes employées à titre permanent. Les articles 24 à 27 prévoient " +
          'des sanctions pénales.',
        action:
          "Faites désigner un auditeur, et prévoyez de lui remettre les états financiers et le rapport de gestion au " +
          "moins 45 jours avant l'assemblée générale (art. 19, alinéa 4). Les montants ci-dessous sont approchés " +
          'depuis la balance : confrontez-les à la liasse arrêtée avant de conclure.',
        occurrences: seuils.franchis.map((f) => ({ reference: f.critere, detail: f.detail })),
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
    const aujourdhui = new Date();
    const exonerations = await this.prisma.exoneration.findMany({
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

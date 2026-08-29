import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ClasseCompte, StatutEcriture, TypeCompteDetailTotal } from '@prisma/client';

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
  async analyser(tenantId: string, exerciceId: string): Promise<RapportControles> {
    const ex = await this.exercice(tenantId, exerciceId);
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

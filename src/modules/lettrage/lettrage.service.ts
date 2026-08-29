import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Prisma } from '@prisma/client';
import { avecRetrySerialisable } from '../../common/prisma-retry.util';

const EPSILON = 0.005;

/** Convertit un rang (1, 2, 3, ...) en lettre façon Sage/Excel : A, B, ..., Z, AA, AB, ... */
function indexVersLettre(n: number): string {
  let s = '';
  while (n > 0) {
    const reste = (n - 1) % 26;
    s = String.fromCharCode(65 + reste) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function lettreVersIndex(lettre: string): number {
  let n = 0;
  for (const ch of lettre.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

/**
 * Lettrage : rapprochement débit/crédit sur un compte (cf.
 * docs/plan-de-construction.md §3.1) · prérequis du report à-nouveau
 * "Détail" et de toute gestion sérieuse des tiers. Toutes les lignes d'un
 * même rapprochement partagent la même lettre ; le lettrage n'est autorisé
 * que si le solde des lignes sélectionnées est nul (même règle que Sage :
 * "le solde lettrage doit être nul avant de lancer le traitement").
 */
@Injectable()
export class LettrageService {
  constructor(private readonly prisma: PrismaService) {}

  private async trouverCompte(tenantId: string, compteId: string) {
    const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
    if (!compte) {
      throw new NotFoundException('Compte introuvable pour ce tenant');
    }
    return compte;
  }

  /** Lignes du compte, groupées par lettre pour faciliter la lecture côté client. */
  async lister(tenantId: string, compteId: string, nonLettreesSeulement?: boolean) {
    await this.trouverCompte(tenantId, compteId);
    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        compteId,
        ecriture: { tenantId },
        ...(nonLettreesSeulement ? { lettre: null } : {}),
      },
      include: { ecriture: { include: { journal: true } } },
      orderBy: { ecriture: { date: 'asc' } },
    });
    return lignes.map((l) => ({
      id: l.id,
      date: l.ecriture.date,
      journalCode: l.ecriture.journal.code,
      libelle: l.libelle ?? l.ecriture.libelle,
      reference: l.ecriture.reference,
      debit: Number(l.debit),
      credit: Number(l.credit),
      lettre: l.lettre,
    }));
  }

  /**
   * Calcule la prochaine lettre disponible pour ce compte · même risque de
   * condition de course que le numéro de pièce des journaux (deux lettrages
   * simultanés sur le même compte pourraient lire la même "dernière lettre"),
   * donc toujours appelé DANS la transaction sérialisable de lettrerManuel.
   */
  private async prochaineLettre(tx: Prisma.TransactionClient, compteId: string): Promise<string> {
    const lignes = await tx.ligneEcriture.findMany({
      where: { compteId, lettre: { not: null } },
      select: { lettre: true },
      distinct: ['lettre'],
    });
    const maxIndex = lignes.reduce((max, l) => Math.max(max, l.lettre ? lettreVersIndex(l.lettre) : 0), 0);
    return indexVersLettre(maxIndex + 1);
  }

  async lettrerManuel(tenantId: string, compteId: string, ligneIds: string[]) {
    await this.trouverCompte(tenantId, compteId);

    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const lignes = await tx.ligneEcriture.findMany({
          where: { id: { in: ligneIds } },
          include: { ecriture: true },
        });

        if (lignes.length !== ligneIds.length) {
          throw new NotFoundException('Une ou plusieurs lignes sont introuvables');
        }
        for (const l of lignes) {
          if (l.compteId !== compteId || l.ecriture.tenantId !== tenantId) {
            throw new BadRequestException('Toutes les lignes doivent appartenir au compte et au tenant indiqués');
          }
          if (l.lettre) {
            throw new BadRequestException(
              `La ligne du ${l.ecriture.date.toISOString().slice(0, 10)} est déjà lettrée (${l.lettre}) · délettrez-la d'abord`,
            );
          }
        }
        // Pas de contrôle de clôture d'exercice ici, volontairement : le
        // lettrage porte sur des lignes déjà enregistrées (il ne modifie ni
        // montant ni compte), et reste possible après une clôture partielle
        // · même règle que chez Sage ("le lettrage... pourront tout de même
        // être effectués" après une clôture partielle).

        const solde = lignes.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
        if (Math.abs(solde) > EPSILON) {
          throw new BadRequestException(
            `Le solde des lignes sélectionnées n'est pas nul (${solde.toFixed(2)}) · le lettrage est impossible`,
          );
        }

        const lettre = await this.prochaineLettre(tx, compteId);
        await tx.ligneEcriture.updateMany({ where: { id: { in: ligneIds } }, data: { lettre } });
        return { lettre, nombreLignes: ligneIds.length };
      },
      `Trop de lettrages effectués au même instant sur ce compte · veuillez réessayer.`,
    );
  }

  async delettrer(tenantId: string, compteId: string, lettre: string) {
    await this.trouverCompte(tenantId, compteId);
    const resultat = await this.prisma.ligneEcriture.updateMany({
      where: { compteId, lettre, ecriture: { tenantId } },
      data: { lettre: null },
    });
    if (resultat.count === 0) {
      throw new NotFoundException(`Aucune ligne lettrée "${lettre}" trouvée sur ce compte`);
    }
    return { lettre, nombreLignes: resultat.count };
  }

  /**
   * Recherche un sous-ensemble de `lignes` dont la somme des montants vaut
   * exactement `cible` (à EPSILON près) · cas N-pour-1 du lettrage
   * automatique (plusieurs petites factures qui soldent un seul règlement,
   * ou l'inverse). Backtracking sur les montants en centimes (entiers, pour
   * éviter les écarts flottants), lignes triées par montant décroissant pour
   * couper les branches tôt (somme des lignes restantes < reste à trouver).
   * Coût exponentiel dans le pire cas · c'est pourquoi l'appelant plafonne le
   * nombre de lignes soumises (voir LIMITE_LIGNES_SUBSET_SUM ci-dessous) :
   * au-delà, la recherche N-pour-1 est simplement sautée pour ce groupe,
   * sans erreur (le 1-pour-1 reste, lui, toujours effectué).
   */
  private trouverSousEnsemble(lignes: Array<{ id: string; montant: number }>, cible: number): string[] | null {
    const trie = [...lignes].sort((a, b) => b.montant - a.montant);
    const centimes = trie.map((l) => Math.round(l.montant * 100));
    const cibleCentimes = Math.round(cible * 100);
    const n = centimes.length;

    const sommeSuffixe = new Array(n + 1).fill(0);
    for (let i = n - 1; i >= 0; i--) sommeSuffixe[i] = sommeSuffixe[i + 1] + centimes[i];

    const choisis: number[] = [];
    const backtrack = (i: number, reste: number): boolean => {
      if (reste === 0) return true;
      if (i >= n || reste < 0 || sommeSuffixe[i] < reste) return false;
      choisis.push(i);
      if (backtrack(i + 1, reste - centimes[i])) return true;
      choisis.pop();
      return backtrack(i + 1, reste);
    };

    if (!backtrack(0, cibleCentimes)) return null;
    return choisis.map((i) => trie[i].id);
  }

  /**
   * Toutes les sommes atteignables par un sous-ensemble NON VIDE de `lignes`,
   * en centimes → un sous-ensemble (n'importe lequel) qui l'atteint. Énumère
   * les 2^n - 1 combinaisons non vides · c'est pourquoi l'appelant plafonne
   * strictement `lignes.length` (voir LIMITE_LIGNES_PARTITION) avant d'appeler
   * cette méthode : à 16 lignes, 65 535 combinaisons, largement praticable
   * pour une action manuelle ; au-delà, ça grossit trop vite.
   */
  private sommesAtteignables(lignes: Array<{ id: string; montant: number }>): Map<number, string[]> {
    const centimes = lignes.map((l) => Math.round(l.montant * 100));
    const resultat = new Map<number, string[]>();
    const n = lignes.length;
    for (let masque = 1; masque < 1 << n; masque++) {
      let somme = 0;
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        if (masque & (1 << i)) {
          somme += centimes[i];
          ids.push(lignes[i].id);
        }
      }
      // Ne garde que le premier sous-ensemble trouvé pour une somme donnée ·
      // peu importe lequel, seule l'existence d'un match compte ici.
      if (!resultat.has(somme)) resultat.set(somme, ids);
    }
    return resultat;
  }

  /**
   * Cas général N-pour-M : un sous-ensemble de débits et un sous-ensemble de
   * crédits, tous deux non triviaux (au moins une ligne d'un côté, une ligne
   * de l'autre · les cas 1-pour-N et N-pour-1 sont déjà couverts par les
   * passes précédentes), dont les sommes sont exactement égales. Recherche
   * le match de plus petite taille totale (nombre de lignes) pour limiter la
   * casse d'un lettrage trop gourmand qui engloutirait tout le pool restant.
   */
  private trouverPartitionGenerale(
    debits: Array<{ id: string; montant: number }>,
    credits: Array<{ id: string; montant: number }>,
  ): { debits: string[]; credits: string[] } | null {
    const sommesDebits = this.sommesAtteignables(debits);
    const sommesCredits = this.sommesAtteignables(credits);

    let meilleur: { debits: string[]; credits: string[] } | null = null;
    for (const [somme, debitIds] of sommesDebits) {
      const creditIds = sommesCredits.get(somme);
      if (!creditIds) continue;
      if (!meilleur || debitIds.length + creditIds.length < meilleur.debits.length + meilleur.credits.length) {
        meilleur = { debits: debitIds, credits: creditIds };
      }
    }
    return meilleur;
  }

  /**
   * Lettrage automatique · mécanisme en deux temps façon Sage :
   * 1. Paires exactes 1-pour-1 (une ligne au débit, une au crédit de
   *    exactement le même montant) · le cas le plus fréquent, traité en
   *    premier pour réduire vite le nombre de lignes restantes.
   * 2. N-pour-1 : plusieurs lignes d'un côté dont la somme égale exactement
   *    une ligne de l'autre côté (ex. trois factures soldées par un seul
   *    virement, ou un acompte réparti sur plusieurs factures) · recherche
   *    par sous-ensemble, plafonnée à `LIMITE_LIGNES_SUBSET_SUM` lignes du
   *    côté fouillé pour rester borné en temps de calcul.
   * 3. N-pour-M : un sous-ensemble de débits ET un sous-ensemble de crédits
   *    (au moins deux lignes de chaque côté, sinon c'est déjà couvert par la
   *    passe précédente) de somme égale · ex. deux factures réglées par deux
   *    virements dont aucune paire ni aucun total 1-pour-N ne coïncide
   *    individuellement. Énumère toutes les combinaisons possibles des deux
   *    côtés (2^n), donc plafonnée bien plus bas (`LIMITE_LIGNES_PARTITION`)
   *    que le N-pour-1 · au-delà, cette dernière passe est sautée (les
   *    précédentes restent, elles, toujours effectuées).
   */
  async lettrageAutomatique(tenantId: string, compteId: string) {
    await this.trouverCompte(tenantId, compteId);

    const LIMITE_LIGNES_SUBSET_SUM = 25;
    const LIMITE_LIGNES_PARTITION = 16;

    const nonLettrees = await this.prisma.ligneEcriture.findMany({
      where: { compteId, lettre: null, ecriture: { tenantId } },
      orderBy: { ecriture: { date: 'asc' } },
    });

    // Ce qui compte pour le lettrage est l'EFFET NET d'une ligne sur le
    // compte, pas la colonne dans laquelle elle est écrite. Sur toutes les
    // lignes ordinaires (un seul côté servi) le résultat est identique ; la
    // différence apparaît sur une correction par inscription en négatif
    // (art. 20 de l'AUDCIF), qui porte un débit négatif : économiquement
    // c'est un crédit, et l'ancienne lecture `> 0` l'écartait des DEUX côtés,
    // si bien qu'une facture annulée et son annulation ne pouvaient jamais se
    // solder l'une l'autre.
    const net = (l: { debit: Prisma.Decimal; credit: Prisma.Decimal }) => Number(l.debit) - Number(l.credit);
    let debitsRestants = nonLettrees
      .filter((l) => net(l) > EPSILON)
      .map((l) => ({ id: l.id, montant: net(l) }));
    let creditsRestants = nonLettrees
      .filter((l) => net(l) < -EPSILON)
      .map((l) => ({ id: l.id, montant: -net(l) }));

    const groupes: string[][] = [];

    // 1) Paires exactes 1-pour-1
    for (const debit of [...debitsRestants]) {
      const idx = creditsRestants.findIndex((c) => Math.abs(c.montant - debit.montant) <= EPSILON);
      if (idx !== -1) {
        const [credit] = creditsRestants.splice(idx, 1);
        debitsRestants = debitsRestants.filter((d) => d.id !== debit.id);
        groupes.push([debit.id, credit.id]);
      }
    }

    // 2) N débits pour 1 crédit
    if (debitsRestants.length <= LIMITE_LIGNES_SUBSET_SUM) {
      for (const credit of [...creditsRestants]) {
        const sousEnsemble = this.trouverSousEnsemble(debitsRestants, credit.montant);
        if (sousEnsemble) {
          groupes.push([credit.id, ...sousEnsemble]);
          debitsRestants = debitsRestants.filter((d) => !sousEnsemble.includes(d.id));
          creditsRestants = creditsRestants.filter((c) => c.id !== credit.id);
        }
      }
    }

    // 3) N crédits pour 1 débit
    if (creditsRestants.length <= LIMITE_LIGNES_SUBSET_SUM) {
      for (const debit of [...debitsRestants]) {
        const sousEnsemble = this.trouverSousEnsemble(creditsRestants, debit.montant);
        if (sousEnsemble) {
          groupes.push([debit.id, ...sousEnsemble]);
          creditsRestants = creditsRestants.filter((c) => !sousEnsemble.includes(c.id));
          debitsRestants = debitsRestants.filter((d) => d.id !== debit.id);
        }
      }
    }

    // 4) N pour M · partition générale sur ce qui reste, en boucle tant
    // qu'un match existe (chaque match retire des lignes des deux pools).
    while (
      debitsRestants.length >= 2 &&
      creditsRestants.length >= 2 &&
      debitsRestants.length <= LIMITE_LIGNES_PARTITION &&
      creditsRestants.length <= LIMITE_LIGNES_PARTITION
    ) {
      const partition = this.trouverPartitionGenerale(debitsRestants, creditsRestants);
      if (!partition) break;
      groupes.push([...partition.debits, ...partition.credits]);
      debitsRestants = debitsRestants.filter((d) => !partition.debits.includes(d.id));
      creditsRestants = creditsRestants.filter((c) => !partition.credits.includes(c.id));
    }

    if (groupes.length === 0) {
      return { groupes: 0, lettres: [] };
    }

    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const lettres: string[] = [];
        for (const ligneIds of groupes) {
          const lettre = await this.prochaineLettre(tx, compteId);
          await tx.ligneEcriture.updateMany({ where: { id: { in: ligneIds } }, data: { lettre } });
          lettres.push(lettre);
        }
        return { groupes: groupes.length, lettres };
      },
      'Trop de lettrages effectués au même instant sur ce compte · veuillez réessayer.',
    );
  }
}

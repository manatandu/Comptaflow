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
 * docs/plan-de-construction.md §3.1) — prérequis du report à-nouveau
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
   * Calcule la prochaine lettre disponible pour ce compte — même risque de
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
              `La ligne du ${l.ecriture.date.toISOString().slice(0, 10)} est déjà lettrée (${l.lettre}) — délettrez-la d'abord`,
            );
          }
        }
        // Pas de contrôle de clôture d'exercice ici, volontairement : le
        // lettrage porte sur des lignes déjà enregistrées (il ne modifie ni
        // montant ni compte), et reste possible après une clôture partielle
        // — même règle que chez Sage ("le lettrage... pourront tout de même
        // être effectués" après une clôture partielle).

        const solde = lignes.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
        if (Math.abs(solde) > EPSILON) {
          throw new BadRequestException(
            `Le solde des lignes sélectionnées n'est pas nul (${solde.toFixed(2)}) — le lettrage est impossible`,
          );
        }

        const lettre = await this.prochaineLettre(tx, compteId);
        await tx.ligneEcriture.updateMany({ where: { id: { in: ligneIds } }, data: { lettre } });
        return { lettre, nombreLignes: ligneIds.length };
      },
      `Trop de lettrages effectués au même instant sur ce compte — veuillez réessayer.`,
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
   * Lettrage automatique — version "petit à petit" du mécanisme Sage :
   * rapproche les paires exactes 1 pour 1 (une ligne au débit et une au
   * crédit de exactement le même montant). Le cas plus général (plusieurs
   * lignes d'un côté pour une seule de l'autre, montants combinés) est un
   * enrichissement futur — voir docs/plan-de-construction.md.
   */
  async lettrageAutomatique(tenantId: string, compteId: string) {
    await this.trouverCompte(tenantId, compteId);

    const nonLettrees = await this.prisma.ligneEcriture.findMany({
      where: { compteId, lettre: null, ecriture: { tenantId } },
      orderBy: { ecriture: { date: 'asc' } },
    });

    const debits = nonLettrees.filter((l) => Number(l.debit) > 0 && Number(l.credit) === 0);
    const credits = nonLettrees.filter((l) => Number(l.credit) > 0 && Number(l.debit) === 0);

    const paires: Array<[string, string]> = [];
    const creditsRestants = [...credits];
    for (const debit of debits) {
      const idx = creditsRestants.findIndex((c) => Math.abs(Number(c.credit) - Number(debit.debit)) <= EPSILON);
      if (idx !== -1) {
        const [credit] = creditsRestants.splice(idx, 1);
        paires.push([debit.id, credit.id]);
      }
    }

    if (paires.length === 0) {
      return { paires: 0, lettres: [] };
    }

    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const lettres: string[] = [];
        for (const [debitId, creditId] of paires) {
          const lettre = await this.prochaineLettre(tx, compteId);
          await tx.ligneEcriture.updateMany({ where: { id: { in: [debitId, creditId] } }, data: { lettre } });
          lettres.push(lettre);
        }
        return { paires: paires.length, lettres };
      },
      'Trop de lettrages effectués au même instant sur ce compte — veuillez réessayer.',
    );
  }
}

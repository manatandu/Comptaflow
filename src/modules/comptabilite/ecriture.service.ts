import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Prisma, StatutExercice } from '@prisma/client';
import { CreerEcritureDto } from './dto/creer-ecriture.dto';
import { JournalService } from '../journaux/journal.service';

// Code Prisma d'un échec de sérialisation (conflit d'écriture concurrente) —
// voir la note sur la transaction dans creer() ci-dessous.
const CODE_CONFLIT_TRANSACTION = 'P2034';
const TENTATIVES_MAX = 5;

function attendre(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Règle non négociable du moteur comptable : une écriture n'existe que si
 * total(débit) === total(crédit), et un exercice clôturé n'accepte plus
 * aucune écriture (piste d'audit + intégrité légale). Ces deux contrôles
 * vivent ici, pas côté client, pour rester valables quel que soit le canal
 * d'entrée (UI web, import CSV, API partenaire...).
 */
@Injectable()
export class EcritureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journalService: JournalService,
  ) {}

  async creer(tenantId: string, createdBy: string, dto: CreerEcritureDto) {
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: dto.exerciceId, tenantId },
    });
    if (!exercice) {
      throw new BadRequestException('Exercice introuvable pour ce tenant');
    }
    if (exercice.statut === StatutExercice.CLOTURE) {
      throw new ForbiddenException("Impossible d'enregistrer une écriture sur un exercice clôturé");
    }

    const journal = await this.journalService.trouver(tenantId, dto.journalId);
    if (!journal.estActif) {
      throw new BadRequestException(`Le journal ${journal.code} est en sommeil`);
    }

    const totalDebit = dto.lignes.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = dto.lignes.reduce((s, l) => s + (l.credit ?? 0), 0);
    if (dto.lignes.length < 2 || Math.abs(totalDebit - totalCredit) > 0.005) {
      throw new BadRequestException(
        `Écriture déséquilibrée : débit=${totalDebit} crédit=${totalCredit}`,
      );
    }

    const date = new Date(dto.date);

    // Le calcul du numéro de pièce (lire le max actuel, l'incrémenter) et la
    // création de l'écriture doivent former une seule opération atomique :
    // sans ça, deux écritures créées au même instant sur le même journal
    // pourraient lire le même max et recevoir le même numeroPiece. La
    // transaction Serializable fait échouer l'une des deux transactions
    // concurrentes (erreur P2034) plutôt que de laisser passer un doublon ;
    // on retente alors automatiquement (jusqu'à TENTATIVES_MAX, avec un
    // délai croissant + un peu d'aléatoire pour éviter que des tentatives
    // reparties en même temps se re-percutent aussitôt), comme le recommande
    // Postgres pour ce niveau d'isolation. Testé jusqu'à 8 écritures
    // envoyées en parfaite simultanéité sur le même journal/mois : aucun
    // doublon de numeroPiece.
    for (let tentative = 1; tentative <= TENTATIVES_MAX; tentative++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const numeroPiece = await this.journalService.prochainNumeroPiece(
              tenantId,
              journal,
              dto.exerciceId,
              date,
              tx,
            );
            return tx.ecriture.create({
              data: {
                tenantId,
                exerciceId: dto.exerciceId,
                journalId: dto.journalId,
                numeroPiece,
                date,
                libelle: dto.libelle,
                reference: dto.reference,
                createdBy,
                lignes: {
                  create: dto.lignes.map((l) => ({
                    compteId: l.compteId,
                    libelle: l.libelle,
                    debit: l.debit ?? 0,
                    credit: l.credit ?? 0,
                  })),
                },
              },
              include: { lignes: true, journal: true },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (err) {
        const estConflit =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === CODE_CONFLIT_TRANSACTION;
        if (!estConflit) throw err;
        if (tentative === TENTATIVES_MAX) {
          // Toutes les tentatives ont buté sur la même contention : jamais
          // un 500 brut ici, un message que l'utilisateur peut comprendre
          // et sur lequel il peut agir (réessayer).
          throw new ConflictException(
            `Trop d'écritures enregistrées au même instant sur le journal ${journal.code} — veuillez réessayer.`,
          );
        }
        await attendre(20 * tentative + Math.random() * 30);
      }
    }
    // Inatteignable (la boucle retourne ou relance à chaque itération) —
    // seulement là pour satisfaire le vérificateur de types.
    throw new Error('Échec inattendu de la création de l’écriture');
  }

  /** Journal : liste chronologique des écritures, filtrable par exercice/journal/période/recherche. */
  async lister(
    tenantId: string,
    filtres: { exerciceId?: string; journalId?: string; dateDebut?: string; dateFin?: string; recherche?: string },
  ) {
    const ecritures = await this.prisma.ecriture.findMany({
      where: {
        tenantId,
        ...(filtres.exerciceId ? { exerciceId: filtres.exerciceId } : {}),
        ...(filtres.journalId ? { journalId: filtres.journalId } : {}),
        ...(filtres.dateDebut || filtres.dateFin
          ? {
              date: {
                ...(filtres.dateDebut ? { gte: new Date(filtres.dateDebut) } : {}),
                ...(filtres.dateFin ? { lte: new Date(filtres.dateFin) } : {}),
              },
            }
          : {}),
        ...(filtres.recherche ? { libelle: { contains: filtres.recherche, mode: 'insensitive' as const } } : {}),
      },
      include: { lignes: { include: { compte: true } }, journal: true },
      orderBy: { date: 'asc' },
    });

    const totalDebit = ecritures.reduce((s, e) => s + e.lignes.reduce((s2, l) => s2 + Number(l.debit), 0), 0);
    const totalCredit = ecritures.reduce((s, e) => s + e.lignes.reduce((s2, l) => s2 + Number(l.credit), 0), 0);
    return { ecritures, totaux: { debit: totalDebit, credit: totalCredit } };
  }

  /** Grand livre d'un compte : ses lignes avec solde progressif. */
  async grandLivre(tenantId: string, compteId: string, exerciceId?: string) {
    const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
    if (!compte) {
      throw new BadRequestException('Compte introuvable pour ce tenant');
    }

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        compteId,
        ecriture: { tenantId, ...(exerciceId ? { exerciceId } : {}) },
      },
      include: { ecriture: { include: { journal: true } } },
      orderBy: { ecriture: { date: 'asc' } },
    });

    let solde = 0;
    const lignesAvecSolde = lignes.map((l) => {
      solde += Number(l.debit) - Number(l.credit);
      return {
        date: l.ecriture.date,
        journalCode: l.ecriture.journal.code,
        libelle: l.libelle ?? l.ecriture.libelle,
        reference: l.ecriture.reference,
        debit: Number(l.debit),
        credit: Number(l.credit),
        soldeProgressif: solde,
      };
    });

    return { compte, lignes: lignesAvecSolde, soldeFinal: solde };
  }

  /** Balance : solde débit/crédit cumulé par compte sur l'exercice. */
  async balance(tenantId: string, exerciceId: string) {
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId },
      orderBy: { numero: 'asc' },
      include: {
        lignesEcriture: { where: { ecriture: { tenantId, exerciceId } } },
      },
    });

    const lignesBalance = comptes
      .map((c) => {
        const totalDebit = c.lignesEcriture.reduce((s, l) => s + Number(l.debit), 0);
        const totalCredit = c.lignesEcriture.reduce((s, l) => s + Number(l.credit), 0);
        return {
          compteId: c.id,
          numero: c.numero,
          intitule: c.intitule,
          classe: c.classe,
          totalDebit,
          totalCredit,
          solde: totalDebit - totalCredit,
        };
      })
      .filter((l) => l.totalDebit !== 0 || l.totalCredit !== 0);

    return {
      lignes: lignesBalance,
      totaux: {
        debit: lignesBalance.reduce((s, l) => s + l.totalDebit, 0),
        credit: lignesBalance.reduce((s, l) => s + l.totalCredit, 0),
      },
    };
  }
}

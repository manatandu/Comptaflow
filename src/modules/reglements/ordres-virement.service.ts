import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatutOrdreVirement } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  coordonneesImprimees,
  motifRefusAnnulation,
  motifRefusDeviseDonneur,
  motifRefusImpression,
} from '../tiers/ribs-tiers';

/** Ce que l'ordre recopie · le donneur (le RIB du journal) et un bénéficiaire par compte réglé. */
export interface PreparationOrdre {
  donneur: { banque: string; coordonnees: string; codeBic: string | null };
  beneficiaires: Map<string, { tiersId: string; beneficiaire: string; banque: string; coordonnees: string; codeBic: string | null }>;
}

export interface LigneAOrdonner {
  compteId: string;
  montant: number;
  reference: string | null;
  ecritureId: string;
  pieceReglement: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * ORDRES DE VIREMENT · voir tiers/ribs-tiers.ts pour les règles et ce que la
 * source en dit. L'ordre naît de la fenêtre Règlement des tiers, en même temps
 * que ses pièces, et ne se crée pas ailleurs · un ordre sans pièce de
 * règlement ferait payer une dette que le livre dit encore due.
 */
@Injectable()
export class OrdresVirementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * TOUT CE QUE L'ORDRE EXIGE SE VÉRIFIE AVANT LA PREMIÈRE PIÈCE · le RIB du
   * journal (le compte à débiter), sa devise, et le RIB PRINCIPAL de chaque
   * tiers. Un refus découvert après coup laisserait des pièces de règlement
   * passées sans l'ordre qui devait les exécuter.
   */
  async preparer(tenantId: string, journalId: string, compteIds: string[]): Promise<PreparationOrdre> {
    const rib = await this.prisma.ribBanque.findFirst({
      where: { tenantId, journalId },
      include: { banque: { select: { intitule: true } }, journal: { select: { code: true } } },
    });
    if (!rib) {
      const journal = await this.prisma.journal.findFirst({ where: { id: journalId, tenantId }, select: { code: true } });
      throw new BadRequestException(
        `Aucun RIB n'est rattaché au journal ${journal?.code ?? ''} (Structure > Banques) · l'ordre de virement n'aurait pas de compte à débiter.`,
      );
    }
    const refusDevise = motifRefusDeviseDonneur(rib.devise, rib.journal?.code ?? '');
    if (refusDevise) throw new BadRequestException(refusDevise);
    const donneur = { banque: rib.banque.intitule, coordonnees: coordonneesImprimees({ ...rib, banque: rib.banque.intitule }), codeBic: rib.codeBic };
    if (!donneur.coordonnees) {
      throw new BadRequestException(`Le RIB ${rib.abrege} ne porte ni IBAN ni numéro de compte · complétez-le dans Structure > Banques.`);
    }

    const comptes = await this.prisma.compte.findMany({
      where: { tenantId, id: { in: compteIds } },
      select: {
        id: true,
        numero: true,
        tiersCompte: { select: { tiers: { select: { id: true, code: true, nom: true, ribs: { where: { tenantId, estPrincipal: true } } } } } },
      },
    });
    const beneficiaires: PreparationOrdre['beneficiaires'] = new Map();
    const manques: string[] = [];
    for (const id of compteIds) {
      const c = comptes.find((x) => x.id === id);
      const tiers = c?.tiersCompte?.tiers;
      if (!c || !tiers) {
        manques.push(`le compte ${c?.numero ?? id} n'est rattaché à aucun tiers`);
        continue;
      }
      const principal = tiers.ribs[0];
      if (!principal) {
        manques.push(`${tiers.code} · ${tiers.nom} n'a pas de RIB principal`);
        continue;
      }
      beneficiaires.set(id, {
        tiersId: tiers.id,
        beneficiaire: principal.titulaire ?? tiers.nom,
        banque: principal.banque,
        coordonnees: coordonneesImprimees(principal),
        codeBic: principal.codeBic,
      });
    }
    if (manques.length) {
      throw new BadRequestException(
        `Ordre de virement impossible · ${manques.join(' ; ')}. Renseignez les coordonnées bancaires dans la fiche du tiers, ou décochez l'ordre de virement.`,
      );
    }
    return { donneur, beneficiaires };
  }

  /**
   * CRÉE L'ORDRE sur les pièces déjà passées. Numérotation CONTINUE par
   * dossier, jamais réutilisée, ordres annulés compris · deux créations
   * simultanées prennent le même « dernier numéro », l'index unique refuse la
   * seconde, et elle est rejouée sur le suivant.
   */
  async creer(tenantId: string, email: string, journalId: string, date: string, preparation: PreparationOrdre, lignes: LigneAOrdonner[]) {
    const total = round2(lignes.reduce((s, l) => s + l.montant, 0));
    const creer = () =>
      this.prisma.$transaction(async (tx) => {
        const dernier = await tx.ordreVirement.aggregate({ where: { tenantId }, _max: { numero: true } });
        return tx.ordreVirement.create({
          data: {
            tenantId,
            numero: (dernier._max.numero ?? 0) + 1,
            date: new Date(date),
            journalId,
            donneurBanque: preparation.donneur.banque,
            donneurCoordonnees: preparation.donneur.coordonnees,
            donneurBic: preparation.donneur.codeBic,
            total,
            creePar: email,
            lignes: {
              create: lignes.map((l) => {
                const b = preparation.beneficiaires.get(l.compteId)!;
                return {
                  tenantId,
                  tiersId: b.tiersId,
                  beneficiaire: b.beneficiaire,
                  banque: b.banque,
                  coordonnees: b.coordonnees,
                  codeBic: b.codeBic,
                  montant: round2(l.montant),
                  reference: l.reference,
                  pieceReglement: l.pieceReglement,
                  ecritureId: l.ecritureId,
                };
              }),
            },
          },
          select: { id: true, numero: true, total: true },
        });
      });
    for (let essai = 0; ; essai++) {
      try {
        return await creer();
      } catch (e) {
        if (essai < 2 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
  }

  lister(tenantId: string) {
    return this.prisma.ordreVirement.findMany({
      where: { tenantId },
      orderBy: { numero: 'desc' },
      take: 500,
      include: { journal: { select: { code: true, intitule: true } }, _count: { select: { lignes: true } } },
    });
  }

  async detail(tenantId: string, id: string) {
    const ordre = await this.prisma.ordreVirement.findFirst({
      where: { id, tenantId },
      include: {
        journal: { select: { code: true, intitule: true } },
        lignes: { orderBy: { beneficiaire: 'asc' } },
      },
    });
    if (!ordre) throw new NotFoundException('Ordre de virement introuvable pour ce dossier.');
    return ordre;
  }

  /**
   * L'IMPRESSION EST ENREGISTRÉE AU SERVEUR, jamais déduite de l'écran · la
   * PREMIÈRE fait passer l'ordre d'« en attente d'impression » à « imprimé »
   * et en garde la date et l'auteur ; les suivantes ne changent que le
   * compteur, ce qui dit qu'un duplicata existe.
   */
  async imprimer(tenantId: string, id: string, email: string) {
    const ordre = await this.detail(tenantId, id);
    const refus = motifRefusImpression(ordre.statut);
    if (refus) throw new BadRequestException(refus);
    const premiere = ordre.statut === StatutOrdreVirement.A_IMPRIMER;
    await this.prisma.ordreVirement.update({
      where: { id: ordre.id },
      data: {
        nombreImpressions: { increment: 1 },
        ...(premiere ? { statut: StatutOrdreVirement.IMPRIME, premiereImpressionLe: new Date(), premiereImpressionPar: email } : {}),
      },
    });
    return this.detail(tenantId, id);
  }

  /**
   * L'ANNULATION LIBÈRE LES PIÈCES, ELLE NE LES DÉFAIT PAS · le règlement
   * reste au journal, et c'est au comptable de le supprimer ou de le garder
   * (un chèque peut remplacer le virement). La référence de la pièce reste sur
   * l'ordre · un ordre annulé doit encore dire ce qu'il devait exécuter.
   */
  async annuler(tenantId: string, id: string, email: string, motif: string) {
    const ordre = await this.detail(tenantId, id);
    const refus = motifRefusAnnulation(ordre.statut, motif);
    if (refus) throw new BadRequestException(refus);
    await this.prisma.$transaction([
      this.prisma.ligneOrdreVirement.updateMany({ where: { tenantId, ordreId: ordre.id }, data: { ecritureId: null } }),
      this.prisma.ordreVirement.update({
        where: { id: ordre.id },
        data: { statut: StatutOrdreVirement.ANNULE, annuleLe: new Date(), annulePar: email, motifAnnulation: motif.trim() },
      }),
    ]);
    return this.detail(tenantId, id);
  }
}

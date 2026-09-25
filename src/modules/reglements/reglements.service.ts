import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TypeJournal } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { LettrageService } from '../lettrage/lettrage.service';
import { refuserSiLignesFigees } from '../exercice/gel-cloture';
import { EnregistrerReglementsDto } from './reglements.dto';
import {
  estEcheanceAReglerSur,
  lignesDuReglement,
  montantDu,
  motifRefusMontant,
  type SensReglement,
} from './reglement-tiers';

/**
 * RÈGLEMENT DES TIERS · voir reglement-tiers.ts pour les règles et leurs
 * sources. Ce service lit les échéances ouvertes, passe UNE pièce de
 * trésorerie par tiers, et LETTRE aussitôt la facture et son règlement.
 *
 * Le lettrage est posé par la même action, et ce n'est pas une présomption
 * comme celle du lettrage automatique · le comptable a CHOISI les factures
 * qu'il paie, et le règlement a été calculé sur elles. D'où l'origine
 * MANUEL, qui dit qu'un humain a apparié ces lignes.
 */
@Injectable()
export class ReglementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
    private readonly lettrage: LettrageService,
  ) {}

  /**
   * ÉCHÉANCES OUVERTES de l'exercice, dues au plus tard à `jusquau`. Une
   * ligne sans échéance est due à sa date d'écriture, la même lecture que
   * l'échéancier et la balance âgée. Seules les lignes JAMAIS lettrées sont
   * rendues · un groupe partiel se complète depuis l'interrogation et
   * lettrage, qui connaît son reste à solder.
   */
  async echeances(tenantId: string, exerciceId: string, sens: SensReglement, jusquau?: string) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!exercice) throw new NotFoundException('Exercice introuvable pour ce dossier.');
    const limite = jusquau ? new Date(jusquau) : null;
    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        ecriture: { tenantId, exerciceId },
        lettrageId: null,
        compte: { tenantId, numero: { startsWith: sens === 'FOURNISSEUR' ? '40' : '41' } },
        ...(sens === 'FOURNISSEUR' ? { credit: { gt: 0 } } : { debit: { gt: 0 } }),
      },
      include: {
        ecriture: { select: { date: true, libelle: true, reference: true, numeroPiece: true, journal: { select: { code: true } } } },
        compte: { select: { id: true, numero: true, intitule: true, tiersCompte: { select: { tiers: { select: { nom: true, code: true } } } } } },
      },
      orderBy: [{ compteId: 'asc' }, { ecriture: { date: 'asc' } }],
    });

    const retenues = lignes
      .filter((l) => estEcheanceAReglerSur(l.compte.numero, sens))
      .map((l) => ({
        id: l.id,
        compteId: l.compteId,
        echeance: l.dateEcheance ?? l.ecriture.date,
        date: l.ecriture.date,
        journalCode: l.ecriture.journal.code,
        numeroPiece: l.ecriture.numeroPiece,
        reference: l.ecriture.reference,
        libelle: l.libelle ?? l.ecriture.libelle,
        montant: montantDu({ debit: Number(l.debit), credit: Number(l.credit) }, sens),
      }))
      .filter((l) => !limite || l.echeance.getTime() <= limite.getTime());

    const parCompte = new Map<string, { compteId: string; numero: string; intitule: string; tiers: string | null; lignes: typeof retenues }>();
    for (const l of retenues) {
      const c = lignes.find((x) => x.id === l.id)!.compte;
      if (!parCompte.has(c.id)) {
        parCompte.set(c.id, {
          compteId: c.id,
          numero: c.numero,
          intitule: c.intitule,
          tiers: c.tiersCompte ? `${c.tiersCompte.tiers.code} · ${c.tiersCompte.tiers.nom}` : null,
          lignes: [],
        });
      }
      parCompte.get(c.id)!.lignes.push(l);
    }
    return [...parCompte.values()];
  }

  /**
   * ENREGISTRE les règlements · une pièce par tiers, au journal de trésorerie
   * choisi, puis le lettrage. Tout est VÉRIFIÉ avant la première écriture ·
   * un lot de dix règlements ne doit pas s'arrêter au sixième en laissant
   * cinq pièces passées et cinq non.
   */
  async enregistrer(tenantId: string, userId: string, dto: EnregistrerReglementsDto) {
    const journal = await this.prisma.journal.findFirst({ where: { id: dto.journalId, tenantId } });
    if (!journal) throw new NotFoundException('Journal introuvable pour ce dossier.');
    if (journal.type !== TypeJournal.TRESORERIE || !journal.compteTresorerieId) {
      throw new BadRequestException(
        `Le journal ${journal.code} n'est pas un journal de trésorerie rattaché à un compte de banque ou de caisse · ` +
          'un règlement se passe au journal du moyen de paiement.',
      );
    }
    const compteTresorerieId = journal.compteTresorerieId;

    const idsComptes = dto.reglements.map((r) => r.compteId);
    if (new Set(idsComptes).size !== idsComptes.length) {
      throw new BadRequestException('Un même tiers figure deux fois · ses factures se règlent en une seule pièce.');
    }
    const toutesLignes = dto.reglements.flatMap((r) => r.ligneIds);
    if (new Set(toutesLignes).size !== toutesLignes.length) {
      throw new BadRequestException('Une même facture figure dans deux règlements.');
    }

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: { id: { in: toutesLignes }, ecriture: { tenantId } },
      include: {
        compte: { select: { numero: true, intitule: true, tiersCompte: { select: { tiers: { select: { nom: true } } } } } },
        ecriture: { select: { exerciceId: true } },
      },
    });
    if (lignes.length !== toutesLignes.length) {
      throw new NotFoundException('Une ou plusieurs factures sont introuvables.');
    }

    const plan = dto.reglements.map((r) => {
      const siennes = lignes.filter((l) => r.ligneIds.includes(l.id));
      for (const l of siennes) {
        if (l.compteId !== r.compteId) {
          throw new BadRequestException('Toutes les factures d\'un règlement doivent être sur le compte du tiers réglé.');
        }
        if (!estEcheanceAReglerSur(l.compte.numero, dto.sens)) {
          throw new BadRequestException(`Le compte ${l.compte.numero} ne porte pas d'échéance à régler dans ce sens.`);
        }
        if (l.lettrageId) {
          throw new BadRequestException(`Une facture du compte ${l.compte.numero} est déjà lettrée · elle n'est plus due.`);
        }
        if (l.ecriture.exerciceId !== dto.exerciceId) {
          throw new BadRequestException('Les factures réglées doivent appartenir à l\'exercice du règlement.');
        }
      }
      const du = Math.round(siennes.reduce((s, l) => s + montantDu({ debit: Number(l.debit), credit: Number(l.credit) }, dto.sens), 0) * 100) / 100;
      if (!(du > 0)) {
        throw new BadRequestException(`Rien n'est dû sur les factures choisies du compte ${siennes[0].compte.numero}.`);
      }
      const montant = r.montant ?? du;
      const refus = motifRefusMontant(montant, du);
      if (refus) throw new BadRequestException(`${siennes[0].compte.numero} · ${refus}`);
      return { r, compte: siennes[0].compte, du, montant };
    });

    // Le lettrage vient APRÈS la pièce · une facture figée par une clôture
    // (exercice/gel-cloture.ts) le ferait refuser une fois la pièce passée.
    // Vérifiée ici, avec le reste, avant la première écriture.
    await refuserSiLignesFigees(this.prisma, tenantId, toutesLignes, 'régler');

    const resultats = [];
    for (const { r, compte, du, montant } of plan) {
      const libelle = `Règlement ${compte.tiersCompte?.tiers.nom ?? compte.intitule}`.slice(0, 190);
      const ecriture = await this.ecritures.creer(tenantId, userId, {
        exerciceId: dto.exerciceId,
        journalId: dto.journalId,
        date: dto.date,
        libelle,
        reference: r.reference || undefined,
        lignes: lignesDuReglement({ sens: dto.sens, compteTiersId: r.compteId, compteTresorerieId, montant, libelle }),
      });
      const ligneTiers = ecriture.lignes.find((l) => l.compteId === r.compteId)!;
      const partiel = Math.round(montant * 100) < Math.round(du * 100);
      const lettre = await this.lettrage.lettrerManuel(tenantId, r.compteId, [...r.ligneIds, ligneTiers.id], userId, {
        autoriserPartiel: partiel,
      });
      resultats.push({ compte: compte.numero, ecritureId: ecriture.id, montant, partiel, lettre: lettre.lettre });
    }
    return { reglements: resultats };
  }
}

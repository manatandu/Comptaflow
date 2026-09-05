import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CaractereEngagement, StatutConvention } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  CloreConventionDto,
  CreerConventionDto,
  CreerRapportDto,
  CreerTrancheDto,
  EncaisserTrancheDto,
  ModifierConventionDto,
} from './dto/convention.dto';

const EPSILON = 0.005;

/**
 * CONVENTIONS DE FINANCEMENT · le dossier de subvention.
 *
 * LA RÈGLE QUI COMMANDE TOUT LE MODULE. SYCEBNL, cadre conceptuel § 5.4.2.4 :
 * « Un engagement de financement est comptabilisé dans les créances à recevoir
 * de l'entité bénéficiaire s'il correspond à un engagement FERME ET
 * INCONDITIONNEL et a fait l'objet d'un ÉCRIT SIGNÉ par les représentants
 * habilités des tiers financeurs. Un engagement CONDITIONNEL doit faire
 * l'objet d'une mention dans les Notes annexes et ne sera comptabilisé que
 * lorsque les conditions sont remplies. »
 *
 * Le caractère de l'engagement commande donc le TRAITEMENT lui-même. Les deux
 * erreurs symétriques sont muettes : une promesse conditionnelle portée en
 * créance gonfle l'actif d'une somme qui pourrait ne jamais venir, un
 * engagement ferme laissé hors bilan le sous-évalue, et dans les deux cas
 * l'écriture s'équilibre et la balance boucle.
 *
 * CE SERVICE NE QUALIFIE PAS, IL SE SOUVIENT. C'est le cabinet qui lit la
 * convention et décide si l'engagement est ferme ou conditionnel · rien ici ne
 * se déduit d'un montant ni d'un nom de bailleur. Le service exige seulement
 * que la décision soit écrite, refuse les combinaisons que le texte interdit,
 * et rend la mention de Notes annexes que le texte réclame. Il ne PASSE aucune
 * écriture : porter d'office une créance à recevoir serait exactement le
 * logiciel qui tranche à la place du comptable.
 */
@Injectable()
export class ConventionFinancementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ce qu'une convention apporte au bilan, et ce qu'elle n'apporte qu'aux
   * notes · la traduction directe du § 5.4.2.4.
   */
  static traitement(convention: {
    caractere: CaractereEngagement;
    ecritSigne: boolean;
  }): 'CREANCE_A_RECEVOIR' | 'MENTION_NOTES_ANNEXES' {
    // Les DEUX conditions du texte, et non la seule fermeté · « ferme et
    // inconditionnel ET a fait l'objet d'un écrit signé ». Un accord verbal
    // ferme ne se comptabilise pas.
    return convention.caractere === CaractereEngagement.FERME_INCONDITIONNEL && convention.ecritSigne
      ? 'CREANCE_A_RECEVOIR'
      : 'MENTION_NOTES_ANNEXES';
  }

  private static resteARecevoir(convention: {
    statut: StatutConvention;
    montantAccorde: unknown;
    tranches: { montantEncaisse: unknown | null }[];
  }): number {
    // Une convention RÉSILIÉE n'attend plus rien · le reste cesse d'être une
    // créance au jour de la résiliation, et le laisser courir maintiendrait au
    // bilan un actif que plus aucun texte ne fonde.
    if (convention.statut === StatutConvention.RESILIEE) return 0;
    const encaisse = convention.tranches.reduce((s, t) => s + Number(t.montantEncaisse ?? 0), 0);
    return Math.max(0, Number(convention.montantAccorde) - encaisse);
  }

  async lister(tenantId: string, aujourdhui = new Date()) {
    const conventions = await this.prisma.conventionFinancement.findMany({
      where: { tenantId },
      orderBy: [{ dateDebut: 'desc' }],
      include: {
        bailleur: { select: { id: true, code: true, nom: true } },
        tranches: { orderBy: { numero: 'asc' } },
        rapports: { orderBy: { dateEcheance: 'asc' } },
      },
    });
    return conventions.map((c) => {
      const encaisse = c.tranches.reduce((s, t) => s + Number(t.montantEncaisse ?? 0), 0);
      return {
        id: c.id,
        bailleur: c.bailleur,
        reference: c.reference,
        objet: c.objet,
        ecritSigne: c.ecritSigne,
        signataire: c.signataire,
        dateSignature: c.dateSignature,
        dateDebut: c.dateDebut,
        dateFin: c.dateFin,
        montantAccorde: Number(c.montantAccorde),
        caractere: c.caractere,
        conditions: c.conditions,
        statut: c.statut,
        motifCloture: c.motifCloture,
        traitement: ConventionFinancementService.traitement(c),
        montantEncaisse: encaisse,
        resteARecevoir: ConventionFinancementService.resteARecevoir(c),
        // Le jalon 11 du planning de clôture (loi n° 004/2001, art. 37)
        // demande de vérifier la validité à chaque exercice · la voici, plutôt
        // qu'une case à cocher que personne ne peut recouper.
        expiree: c.statut === StatutConvention.EN_COURS && c.dateFin < aujourdhui,
        tranches: c.tranches.map((t) => ({
          id: t.id,
          numero: t.numero,
          libelle: t.libelle,
          montant: Number(t.montant),
          datePrevue: t.datePrevue,
          dateEncaissement: t.dateEncaissement,
          montantEncaisse: t.montantEncaisse === null ? null : Number(t.montantEncaisse),
          enRetard: t.dateEncaissement === null && t.datePrevue < aujourdhui,
        })),
        rapports: c.rapports.map((r) => ({
          id: r.id,
          intitule: r.intitule,
          nature: r.nature,
          dateEcheance: r.dateEcheance,
          dateTransmission: r.dateTransmission,
          observation: r.observation,
          enRetard: r.dateTransmission === null && r.dateEcheance < aujourdhui,
        })),
      };
    });
  }

  /**
   * LES MENTIONS DE NOTES ANNEXES QUE LE § 5.4.2.4 IMPOSE · une phrase par
   * engagement conditionnel, avec ses conditions. Ce n'est pas un agrément :
   * le texte dit « DOIT faire l'objet d'une mention », et une promesse
   * conditionnelle que rien ne mentionne disparaît purement et simplement des
   * états.
   */
  async mentionsEngagementsConditionnels(tenantId: string): Promise<string[]> {
    const conventions = await this.prisma.conventionFinancement.findMany({
      where: {
        tenantId,
        caractere: CaractereEngagement.CONDITIONNEL,
        statut: { not: StatutConvention.RESILIEE },
      },
      orderBy: [{ dateDebut: 'asc' }],
      include: { bailleur: { select: { code: true, nom: true } }, tranches: { select: { montantEncaisse: true } } },
    });
    return conventions.map((c) => {
      const reste = ConventionFinancementService.resteARecevoir(c);
      return (
        `${c.bailleur.nom} (${c.bailleur.code}) · convention ${c.reference}, ${c.objet}. ` +
        `Engagement CONDITIONNEL de ${Number(c.montantAccorde).toLocaleString('fr-FR')}, ` +
        `dont ${reste.toLocaleString('fr-FR')} restant à recevoir. Conditions : ${c.conditions ?? '·'}. ` +
        "Cet engagement n'est pas comptabilisé en créance : il ne le sera que lorsque les conditions seront remplies " +
        '(SYCEBNL, cadre conceptuel § 5.4.2.4).'
      );
    });
  }

  /**
   * Ce que le cabinet peut porter en créance à recevoir · engagements fermes,
   * inconditionnels ET assortis de leur écrit signé, pour leur reste. Rendu
   * pour être VU, jamais écrit d'office.
   */
  async creancesARecevoir(tenantId: string) {
    const conventions = await this.prisma.conventionFinancement.findMany({
      where: {
        tenantId,
        caractere: CaractereEngagement.FERME_INCONDITIONNEL,
        ecritSigne: true,
        statut: StatutConvention.EN_COURS,
      },
      include: { bailleur: { select: { code: true, nom: true } }, tranches: { select: { montantEncaisse: true } } },
    });
    return conventions
      .map((c) => ({
        reference: c.reference,
        bailleur: `${c.bailleur.code} · ${c.bailleur.nom}`,
        montantAccorde: Number(c.montantAccorde),
        resteARecevoir: ConventionFinancementService.resteARecevoir(c),
      }))
      .filter((c) => c.resteARecevoir > EPSILON);
  }

  async creer(tenantId: string, userId: string, dto: CreerConventionDto) {
    const bailleur = await this.prisma.bailleur.findFirst({
      where: { id: dto.bailleurId, tenantId },
      select: { id: true },
    });
    if (!bailleur) throw new NotFoundException('Bailleur introuvable dans ce dossier.');

    this.verifierCoherence(dto);

    const doublon = await this.prisma.conventionFinancement.findFirst({
      where: { tenantId, bailleurId: dto.bailleurId, reference: dto.reference.trim() },
      select: { id: true },
    });
    if (doublon) {
      throw new BadRequestException(
        `Ce bailleur porte déjà une convention « ${dto.reference.trim()} ». Deux exemplaires de la même convention ` +
          'doubleraient le montant accordé, et donc la créance à recevoir.',
      );
    }

    return this.prisma.conventionFinancement.create({
      data: {
        tenantId,
        bailleurId: dto.bailleurId,
        reference: dto.reference.trim(),
        objet: dto.objet.trim(),
        ecritSigne: dto.ecritSigne ?? false,
        signataire: dto.signataire?.trim() || null,
        dateSignature: dto.dateSignature ? new Date(dto.dateSignature) : null,
        dateDebut: new Date(dto.dateDebut),
        dateFin: new Date(dto.dateFin),
        montantAccorde: dto.montantAccorde,
        caractere: dto.caractere,
        conditions: dto.conditions?.trim() || null,
        createdBy: userId,
      },
    });
  }

  /**
   * Les refus que le § 5.4.2.4 impose, plus ceux que la simple cohérence de
   * dates commande. Ils sont posés à la RACINE · un engagement mal qualifié ne
   * se rattrape par aucun contrôle en aval, puisque tout en aval est cohérent
   * avec la mauvaise qualification.
   */
  private verifierCoherence(dto: {
    caractere: CaractereEngagement;
    conditions?: string;
    ecritSigne?: boolean;
    signataire?: string;
    montantAccorde: number;
    dateDebut: string;
    dateFin: string;
  }) {
    if (dto.montantAccorde <= 0) {
      throw new BadRequestException('Le montant accordé doit être strictement positif.');
    }
    if (new Date(dto.dateFin) < new Date(dto.dateDebut)) {
      throw new BadRequestException('La date de fin de la convention précède sa date de début.');
    }
    if (dto.caractere === CaractereEngagement.CONDITIONNEL && !dto.conditions?.trim()) {
      throw new BadRequestException(
        "Un engagement CONDITIONNEL doit dire à quoi il est conditionné : le § 5.4.2.4 impose de le mentionner en " +
          "Notes annexes, et « conditionnel » sans ses conditions ne se mentionne pas.",
      );
    }
    if (dto.ecritSigne && !dto.signataire?.trim()) {
      throw new BadRequestException(
        "Nommez le signataire : le texte parle des « représentants HABILITÉS des tiers financeurs », et un écrit signé " +
          "par quelqu'un d'autre n'engage pas le financeur.",
      );
    }
  }

  async modifier(tenantId: string, conventionId: string, dto: ModifierConventionDto) {
    const convention = await this.prisma.conventionFinancement.findFirst({
      where: { id: conventionId, tenantId },
    });
    if (!convention) throw new NotFoundException('Convention introuvable dans ce dossier.');

    const fusion = {
      caractere: dto.caractere ?? convention.caractere,
      conditions: dto.conditions ?? convention.conditions ?? undefined,
      ecritSigne: dto.ecritSigne ?? convention.ecritSigne,
      signataire: dto.signataire ?? convention.signataire ?? undefined,
      montantAccorde: dto.montantAccorde ?? Number(convention.montantAccorde),
      dateDebut: dto.dateDebut ?? convention.dateDebut.toISOString(),
      dateFin: dto.dateFin ?? convention.dateFin.toISOString(),
    };
    // Vérifiée sur la FUSION et non sur le seul envoi · passer une convention
    // de FERME à CONDITIONNEL sans joindre les conditions passerait sinon
    // entre les mailles, et l'engagement se retrouverait conditionnel sans
    // mention possible.
    this.verifierCoherence(fusion);

    return this.prisma.conventionFinancement.update({
      where: { id: conventionId },
      data: {
        objet: dto.objet?.trim(),
        ecritSigne: dto.ecritSigne,
        signataire: dto.signataire?.trim(),
        dateSignature: dto.dateSignature ? new Date(dto.dateSignature) : undefined,
        dateDebut: dto.dateDebut ? new Date(dto.dateDebut) : undefined,
        dateFin: dto.dateFin ? new Date(dto.dateFin) : undefined,
        montantAccorde: dto.montantAccorde,
        caractere: dto.caractere,
        conditions: dto.conditions?.trim(),
      },
    });
  }

  async clore(tenantId: string, conventionId: string, dto: CloreConventionDto) {
    const convention = await this.prisma.conventionFinancement.findFirst({
      where: { id: conventionId, tenantId },
      select: { id: true, statut: true },
    });
    if (!convention) throw new NotFoundException('Convention introuvable dans ce dossier.');
    if (convention.statut !== StatutConvention.EN_COURS) {
      throw new BadRequestException("Cette convention n'est plus en cours.");
    }
    // La résiliation fait tomber le reste à recevoir : sans motif, un actif
    // disparaît du dossier sans que personne ne puisse dire pourquoi.
    if (dto.statut === StatutConvention.RESILIEE && !dto.motif?.trim()) {
      throw new BadRequestException(
        'Le motif de résiliation est obligatoire : elle fait tomber le reste à recevoir de la convention.',
      );
    }
    return this.prisma.conventionFinancement.update({
      where: { id: conventionId },
      data: { statut: dto.statut, motifCloture: dto.motif?.trim() || null },
    });
  }

  // --- Tranches ------------------------------------------------------------

  async ajouterTranche(tenantId: string, conventionId: string, dto: CreerTrancheDto) {
    const convention = await this.prisma.conventionFinancement.findFirst({
      where: { id: conventionId, tenantId },
      include: { tranches: { select: { numero: true, montant: true } } },
    });
    if (!convention) throw new NotFoundException('Convention introuvable dans ce dossier.');
    if (dto.montant <= 0) throw new BadRequestException('Le montant de la tranche doit être strictement positif.');

    const dejaPrevu = convention.tranches.reduce((s, t) => s + Number(t.montant), 0);
    // Le total des tranches ne peut pas dépasser l'accordé · sinon
    // l'échéancier annoncerait au bailleur un versement qu'aucune convention
    // ne fonde, et le reste à recevoir deviendrait négatif à l'encaissement.
    if (dejaPrevu + dto.montant - Number(convention.montantAccorde) > EPSILON) {
      throw new BadRequestException(
        `Le total des tranches (${(dejaPrevu + dto.montant).toFixed(2)}) dépasserait le montant accordé ` +
          `(${Number(convention.montantAccorde).toFixed(2)}).`,
      );
    }
    if (convention.tranches.some((t) => t.numero === dto.numero)) {
      throw new BadRequestException(`La tranche n° ${dto.numero} existe déjà sur cette convention.`);
    }

    return this.prisma.trancheFinancement.create({
      data: {
        conventionId,
        numero: dto.numero,
        libelle: dto.libelle.trim(),
        montant: dto.montant,
        datePrevue: new Date(dto.datePrevue),
      },
    });
  }

  async encaisserTranche(tenantId: string, conventionId: string, trancheId: string, dto: EncaisserTrancheDto) {
    const tranche = await this.prisma.trancheFinancement.findFirst({
      where: { id: trancheId, conventionId, convention: { tenantId } },
      select: { id: true, dateEncaissement: true },
    });
    if (!tranche) throw new NotFoundException('Tranche introuvable sur cette convention.');
    if (tranche.dateEncaissement) {
      throw new BadRequestException('Cette tranche est déjà encaissée.');
    }
    if (dto.montantEncaisse <= 0) {
      throw new BadRequestException('Le montant encaissé doit être strictement positif.');
    }
    return this.prisma.trancheFinancement.update({
      where: { id: trancheId },
      data: { dateEncaissement: new Date(dto.dateEncaissement), montantEncaisse: dto.montantEncaisse },
    });
  }

  async supprimerTranche(tenantId: string, conventionId: string, trancheId: string) {
    const tranche = await this.prisma.trancheFinancement.findFirst({
      where: { id: trancheId, conventionId, convention: { tenantId } },
      select: { id: true, dateEncaissement: true },
    });
    if (!tranche) throw new NotFoundException('Tranche introuvable sur cette convention.');
    if (tranche.dateEncaissement) {
      throw new BadRequestException(
        "Cette tranche est encaissée : elle ne s'efface pas. Un encaissement effacé ferait remonter le reste à recevoir sans qu'aucun remboursement ne l'explique.",
      );
    }
    await this.prisma.trancheFinancement.delete({ where: { id: trancheId } });
    return { supprime: true };
  }

  // --- Rapports dus --------------------------------------------------------

  async ajouterRapport(tenantId: string, conventionId: string, dto: CreerRapportDto) {
    const convention = await this.prisma.conventionFinancement.findFirst({
      where: { id: conventionId, tenantId },
      select: { id: true },
    });
    if (!convention) throw new NotFoundException('Convention introuvable dans ce dossier.');
    return this.prisma.rapportBailleur.create({
      data: {
        conventionId,
        intitule: dto.intitule.trim(),
        nature: dto.nature,
        dateEcheance: new Date(dto.dateEcheance),
        observation: dto.observation?.trim() || null,
      },
    });
  }

  async transmettreRapport(tenantId: string, conventionId: string, rapportId: string, dateTransmission: string) {
    const rapport = await this.prisma.rapportBailleur.findFirst({
      where: { id: rapportId, conventionId, convention: { tenantId } },
      select: { id: true },
    });
    if (!rapport) throw new NotFoundException('Rapport introuvable sur cette convention.');
    return this.prisma.rapportBailleur.update({
      where: { id: rapportId },
      data: { dateTransmission: new Date(dateTransmission) },
    });
  }

  async supprimerRapport(tenantId: string, conventionId: string, rapportId: string) {
    const rapport = await this.prisma.rapportBailleur.findFirst({
      where: { id: rapportId, conventionId, convention: { tenantId } },
      select: { id: true },
    });
    if (!rapport) throw new NotFoundException('Rapport introuvable sur cette convention.');
    await this.prisma.rapportBailleur.delete({ where: { id: rapportId } });
    return { supprime: true };
  }
}

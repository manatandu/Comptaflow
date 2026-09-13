import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NatureReponseDevis, Prisma, Referentiel } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EmettreDevisDto, EnregistrerReponseDto, RevoquerDevisDto } from './dto/devis.dto';
import {
  AUCUNE_CONDITION_DE_FORME,
  DELAIS_DE_CONFORMITE,
  etatDevis,
  MOTIF_HORS_SYCEBNL,
  NatureOperation,
  perimetreVenteCommerciale,
  PRIX_PRESUME_HORS_TAXES,
  qualifierOffre,
  revocabilite,
} from './vente-commerciale';

type DevisAvecLignes = Prisma.DevisGetPayload<{ include: { lignes: true } }>;

@Injectable()
export class CommercialService {
  constructor(private readonly prisma: PrismaService) {}

  private async dossier(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { id: true, nom: true, referentiel: true, formeJuridiqueSyscohada: true },
    });
  }

  /**
   * LE REFUS DE PÉRIMÈTRE EST SERVEUR, pas seulement visuel (§ 6) · une ASBL
   * n'est pas commerçante et l'art. 234 ne régit que la vente entre
   * commerçants. Le contrôleur porte déjà `@ReferentielsAutorises`, ce refus-ci
   * est la seconde porte.
   */
  private async exigerCommercant(tenantId: string) {
    const t = await this.dossier(tenantId);
    if (t.referentiel !== Referentiel.SYSCOHADA) throw new BadRequestException(MOTIF_HORS_SYCEBNL);
    return t;
  }

  private vue(d: DevisAvecLignes, reference: Date) {
    const lignes = d.lignes
      .slice()
      .sort((a, b) => a.ordre - b.ordre)
      .map((l) => ({
        id: l.id,
        ordre: l.ordre,
        designation: l.designation,
        quantite: Number(l.quantite),
        prixUnitaire: Number(l.prixUnitaire),
        montantHT: Number(l.montantHT),
      }));

    const etat = etatDevis({
      dateEmission: d.dateEmission,
      delaiJours: d.delaiJours,
      dateReponse: d.dateReponse,
      natureReponse: d.natureReponse,
      revoqueLe: d.revoqueLe,
      reference,
    });

    return {
      id: d.id,
      emetteur: d.emetteur,
      numero: d.numero,
      dateEmission: d.dateEmission,
      dateReception: d.dateReception,
      delaiJours: d.delaiJours,
      declareeIrrevocable: d.declareeIrrevocable,
      nature: d.nature,
      clientNom: d.clientNom,
      objet: d.objet,
      natureReponse: d.natureReponse,
      dateReponse: d.dateReponse,
      detailReponse: d.detailReponse,
      revoqueLe: d.revoqueLe,
      motifRevocation: d.motifRevocation,
      contrePropositionDeId: d.contrePropositionDeId,
      lignes,
      // TOTAL HORS TAXES, et la mention l'accompagne · art. 263.
      totalHT: lignes.reduce((s, l) => s + l.montantHT, 0),
      prixPresume: PRIX_PRESUME_HORS_TAXES,
      perimetre: perimetreVenteCommerciale(d.nature as NatureOperation),
      qualification: qualifierOffre({
        destinataireDetermine: d.destinataireDetermine,
        volonteDEtreLie: d.volonteDEtreLie,
        lignes,
      }),
      etat,
      revocabilite: revocabilite({
        delaiJours: d.delaiJours,
        declareeIrrevocable: d.declareeIrrevocable,
        dejaAcceptee: etat.etat === 'ACCEPTE',
      }),
    };
  }

  async lister(tenantId: string, params: { dateReference?: string } = {}) {
    await this.exigerCommercant(tenantId);
    const reference = params.dateReference ? new Date(params.dateReference) : new Date();
    const devis = await this.prisma.devis.findMany({
      where: { tenantId },
      include: { lignes: true },
      orderBy: [{ dateEmission: 'desc' }, { numero: 'desc' }],
    });
    return {
      dateReference: reference.toISOString().slice(0, 10),
      aucuneConditionDeForme: AUCUNE_CONDITION_DE_FORME,
      delaisDeConformite: DELAIS_DE_CONFORMITE,
      devis: devis.map((d) => this.vue(d, reference)),
    };
  }

  async emettre(tenantId: string, dto: EmettreDevisDto) {
    const t = await this.exigerCommercant(tenantId);

    let clientNom = dto.clientNom?.trim() ?? '';
    if (dto.tiersId) {
      const tiers = await this.prisma.tiers.findFirst({
        where: { id: dto.tiersId, tenantId },
        select: { nom: true },
      });
      if (!tiers) throw new NotFoundException('Tiers introuvable dans ce dossier.');
      clientNom = clientNom || tiers.nom;
    }
    if (!clientNom) {
      throw new BadRequestException(
        'Le destinataire doit être nommé · l’art. 241 réserve la qualité d’offre à la proposition adressée à ' +
          'des personnes DÉTERMINÉES, une proposition à des personnes indéterminées n’étant qu’une invitation à l’offre.',
      );
    }

    const doublon = await this.prisma.devis.findFirst({
      where: { tenantId, numero: dto.numero.trim() },
      select: { id: true },
    });
    if (doublon) throw new BadRequestException(`Le numéro « ${dto.numero.trim()} » est déjà porté par un devis de ce dossier.`);

    // UNE CONTRE-PROPOSITION SE RATTACHE À UNE OFFRE RÉELLEMENT REJETÉE.
    // L'accrocher à un devis accepté ferait naître une négociation sur un
    // contrat déjà formé, et l'art. 245 ne connaît la contre-proposition que
    // comme conséquence d'un REJET.
    let emetteur: 'DOSSIER' | 'CLIENT' = 'DOSSIER';
    if (dto.contrePropositionDeId) {
      const precedent = await this.prisma.devis.findFirst({
        where: { id: dto.contrePropositionDeId, tenantId },
        include: { contreProposition: { select: { id: true } } },
      });
      if (!precedent) throw new NotFoundException('Devis d’origine introuvable dans ce dossier.');
      if (precedent.natureReponse !== NatureReponseDevis.MODIFICATION_SUBSTANTIELLE) {
        throw new BadRequestException(
          'Une contre-proposition ne naît que d’une réponse portant une MODIFICATION SUBSTANTIELLE, qui « vaut ' +
            'rejet de l’offre et constitue une contre-proposition » (AUDCG art. 245, premier alinéa). Enregistrez ' +
            'd’abord cette réponse sur le devis d’origine.',
        );
      }
      if (precedent.contreProposition) {
        throw new BadRequestException('Ce devis a déjà donné lieu à une contre-proposition.');
      }
      // L'offre nouvelle vient de celui qui a rejeté · le sens s'inverse.
      emetteur = precedent.emetteur === 'DOSSIER' ? 'CLIENT' : 'DOSSIER';
    }

    const devis = await this.prisma.devis.create({
      data: {
        tenantId,
        emetteur,
        numero: dto.numero.trim(),
        dateEmission: new Date(dto.dateEmission),
        dateReception: dto.dateReception ? new Date(dto.dateReception) : null,
        delaiJours: dto.delaiJours ?? null,
        declareeIrrevocable: dto.declareeIrrevocable ?? false,
        destinataireDetermine: dto.destinataireDetermine ?? true,
        volonteDEtreLie: dto.volonteDEtreLie ?? true,
        nature: dto.nature,
        tiersId: dto.tiersId ?? null,
        clientNom,
        objet: dto.objet?.trim() || null,
        contrePropositionDeId: dto.contrePropositionDeId ?? null,
        lignes: {
          create: dto.lignes.map((l, i) => ({
            ordre: i + 1,
            designation: l.designation.trim(),
            quantite: new Prisma.Decimal(l.quantite),
            prixUnitaire: new Prisma.Decimal(l.prixUnitaire),
            montantHT: new Prisma.Decimal(l.montantHT),
          })),
        },
      },
      include: { lignes: true },
    });
    void t;
    return this.vue(devis, new Date());
  }

  /**
   * LA RÉPONSE EST UN FAIT REÇU, JAMAIS UN EFFET DU CALENDRIER. Art. 243 · « le
   * silence ou l'inaction ne peut à lui seul valoir acceptation ». Aucun chemin
   * du service ne pose `natureReponse` autrement que sur cet appel, et c'est ce
   * qui garantit qu'un délai écoulé ne fabrique ni acceptation ni refus.
   */
  async enregistrerReponse(tenantId: string, id: string, dto: EnregistrerReponseDto) {
    await this.exigerCommercant(tenantId);
    const devis = await this.prisma.devis.findFirst({ where: { id, tenantId }, include: { lignes: true } });
    if (!devis) throw new NotFoundException('Devis introuvable dans ce dossier.');
    if (devis.natureReponse) throw new BadRequestException('Une réponse est déjà enregistrée sur ce devis.');

    const reponse = new Date(dto.dateReponse);
    if (reponse.getTime() < devis.dateEmission.getTime()) {
      throw new BadRequestException('Une réponse ne peut pas parvenir avant que l’offre n’ait été émise.');
    }
    // UNE OFFRE RÉVOQUÉE AVANT LA RÉPONSE N'EST PLUS ACCEPTABLE · art. 242, la
    // révocation produit effet si elle parvient AVANT que le destinataire n'ait
    // exprimé son acceptation.
    if (devis.revoqueLe && devis.revoqueLe.getTime() < reponse.getTime()) {
      throw new BadRequestException(
        'Cette offre a été révoquée avant la date de cette réponse · l’art. 242 ne lui laisse plus d’effet.',
      );
    }
    if (
      (dto.natureReponse === NatureReponseDevis.MODIFICATION_NON_SUBSTANTIELLE ||
        dto.natureReponse === NatureReponseDevis.MODIFICATION_SUBSTANTIELLE) &&
      !dto.detailReponse?.trim()
    ) {
      // LA SUBSTANTIALITÉ EST UNE QUALIFICATION, et elle se justifie par écrit ·
      // c'est elle qui décide entre un contrat formé et un contrat à reprendre
      // à zéro, et personne ne saura six mois plus tard sur quoi elle reposait.
      throw new BadRequestException(
        'Dites ce que la réponse modifie. L’art. 245 fait de la substantialité de la modification la charnière ' +
          'entre une acceptation et un rejet valant contre-proposition : elle se qualifie, elle ne se calcule pas.',
      );
    }

    const maj = await this.prisma.devis.update({
      where: { id: devis.id },
      data: {
        natureReponse: dto.natureReponse,
        dateReponse: reponse,
        detailReponse: dto.detailReponse?.trim() || null,
      },
      include: { lignes: true },
    });
    return this.vue(maj, new Date());
  }

  async revoquer(tenantId: string, id: string, dto: RevoquerDevisDto) {
    await this.exigerCommercant(tenantId);
    const devis = await this.prisma.devis.findFirst({ where: { id, tenantId }, include: { lignes: true } });
    if (!devis) throw new NotFoundException('Devis introuvable dans ce dossier.');

    const vue = this.vue(devis, new Date());
    if (!vue.revocabilite.revocable) {
      throw new BadRequestException(`${vue.revocabilite.motif} (${vue.revocabilite.article})`);
    }

    const maj = await this.prisma.devis.update({
      where: { id: devis.id },
      data: { revoqueLe: new Date(dto.revoqueLe), motifRevocation: dto.motifRevocation.trim() },
      include: { lignes: true },
    });
    return this.vue(maj, new Date());
  }
}

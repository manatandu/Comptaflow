import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import {
  articleTrenteSeptApplicable,
  etatAccordCadre,
  MODELE_KAHASHA,
  PART_MAIN_OEUVRE_LOCALE_MINIMALE,
} from './conditions-ong-etrangere';

/**
 * ACCORD-CADRE AVEC LE MINISTÈRE DU PLAN · le manque que le logiciel déclarait
 * lui-même.
 *
 * LE MODULE N'ACCORDE RIEN ET NE CONCLUT RIEN. Il enregistre un acte signé
 * entre l'ONG et le Gouvernement, hors du logiciel, et il en tire les seules
 * conséquences qu'une date permet.
 */
@Injectable()
export class AccordCadreService {
  constructor(private readonly prisma: PrismaService) {}

  private async dossier(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { id: true, formeJuridique: true, droitEtranger: true },
    });
  }

  /**
   * LE PÉRIMÈTRE EST LE PREMIER REFUS. La sous-section II de la loi ne vise que
   * l'organisation ÉTRANGÈRE, et l'art. 35 réserve le mot ONG à une catégorie
   * précise. Enregistrer un accord-cadre sur une association confessionnelle ou
   * une ONG de droit congolais laisserait croire à une obligation que le texte
   * ne leur fait pas · § 10 bis.
   */
  private async exigerPerimetre(tenantId: string) {
    const t = await this.dossier(tenantId);
    if (!articleTrenteSeptApplicable(t.formeJuridique, t.droitEtranger)) {
      throw new BadRequestException(
        "L'accord-cadre avec le Ministère du Plan n'est exigé que d'une ORGANISATION NON GOUVERNEMENTALE de " +
          'DROIT ÉTRANGER · loi n° 004/2001, art. 37, sous-section II. Ce dossier ne l’est pas. Si c’en est une, ' +
          'corrigez la forme juridique et le drapeau « droit étranger » dans les paramètres du dossier ; sinon, ' +
          'aucun accord-cadre ne lui est demandé.',
      );
    }
    return t;
  }

  async etat(tenantId: string, params: { dateReference?: string } = {}) {
    const t = await this.dossier(tenantId);
    const applicable = articleTrenteSeptApplicable(t.formeJuridique, t.droitEtranger);
    const reference = params.dateReference ? new Date(params.dateReference) : new Date();

    const accords = applicable
      ? await this.prisma.accordCadrePlan.findMany({ where: { tenantId }, orderBy: { dateSignature: 'desc' } })
      : [];

    return {
      applicable,
      // Ce que le modèle du guide propose, TOUJOURS avec son origine · sans
      // elle, une clause de modèle passerait pour une règle de droit.
      modele: MODELE_KAHASHA,
      partMinimaleMainOeuvreLocale: PART_MAIN_OEUVRE_LOCALE_MINIMALE,
      accords: accords.map((a) => ({
        ...a,
        etat: etatAccordCadre({
          dateSignature: a.dateSignature,
          dureeAnnees: a.dureeAnnees,
          taciteReconduction: a.taciteReconduction,
          preavisMois: a.preavisMois,
          denonceLe: a.denonceLe,
          reference,
        }),
      })),
      dateReference: reference.toISOString().slice(0, 10),
    };
  }

  async enregistrer(
    tenantId: string,
    dto: {
      reference: string;
      dateSignature: string;
      dureeAnnees: number;
      taciteReconduction?: boolean;
      preavisMois?: number | null;
      representationRdc?: string | null;
      attestationsBonneConduiteLe?: string | null;
    },
  ) {
    await this.exigerPerimetre(tenantId);
    // La durée est SAISIE · aucun défaut. Voir `MODELE_KAHASHA` : les dix ans
    // du modèle Kahasha ne sont pas la loi, et un accord de trois ans lu sur
    // dix ferait croire à sept années de couverture qui n'existent pas.
    if (!Number.isInteger(dto.dureeAnnees) || dto.dureeAnnees < 1) {
      throw new BadRequestException(
        'La durée de l’accord, en années, est exigée · la loi n° 004/2001 n’en fixe aucune, et les dix ans ' +
          'souvent cités viennent de l’article IX du MODÈLE annexé au guide Kahasha. Recopiez celle de l’accord ' +
          'réellement signé.',
      );
    }
    return this.prisma.accordCadrePlan.create({
      data: {
        tenantId,
        reference: dto.reference.trim(),
        dateSignature: new Date(dto.dateSignature),
        dureeAnnees: dto.dureeAnnees,
        taciteReconduction: dto.taciteReconduction ?? false,
        preavisMois: dto.preavisMois ?? null,
        representationRdc: dto.representationRdc?.trim() || null,
        attestationsBonneConduiteLe: dto.attestationsBonneConduiteLe
          ? new Date(dto.attestationsBonneConduiteLe)
          : null,
      },
    });
  }

  /**
   * PART DE MAIN-D'ŒUVRE LOCALE · saisie, jamais calculée, et jamais sans sa
   * source. OmegaX n'a pas de module de paie : aucun effectif, aucune
   * nationalité, aucun contrat. Un pourcentage déduit d'un compte 66 serait une
   * invention, et c'est la source qu'un contrôleur demandera.
   */
  async declarerMainOeuvre(
    tenantId: string,
    id: string,
    dto: { part: number; source: string; date: string },
  ) {
    await this.exigerPerimetre(tenantId);
    const accord = await this.prisma.accordCadrePlan.findFirst({ where: { id, tenantId } });
    if (!accord) throw new NotFoundException('Accord-cadre introuvable');
    if (!dto.source.trim()) {
      throw new BadRequestException(
        'La source du relevé est exigée · registre du personnel, états de paie, déclaration ONEM. OmegaX ne ' +
          'détient aucun effectif et ne calcule pas cette part : c’est la source qu’un contrôleur demandera, ' +
          'pas le pourcentage.',
      );
    }
    if (dto.part < 0 || dto.part > 100) {
      throw new BadRequestException('La part de main-d’œuvre locale est un pourcentage, entre 0 et 100.');
    }
    return this.prisma.accordCadrePlan.update({
      where: { id: accord.id },
      data: {
        partMainOeuvreLocale: dto.part,
        sourceMainOeuvre: dto.source.trim(),
        dateMainOeuvre: new Date(dto.date),
      },
    });
  }

  /**
   * DÉNONCIATION · le seul fait qui arrête une tacite reconduction, comme le
   * refus exprès arrête la prorogation du mandat de l'auditeur.
   */
  async denoncer(tenantId: string, id: string, dto: { denonceLe: string; motif: string }) {
    await this.exigerPerimetre(tenantId);
    const accord = await this.prisma.accordCadrePlan.findFirst({ where: { id, tenantId } });
    if (!accord) throw new NotFoundException('Accord-cadre introuvable');
    if (!dto.motif.trim()) {
      throw new BadRequestException(
        'Le motif de la dénonciation est exigé · sans lui, une dénonciation par le Gouvernement ne se distingue ' +
          'plus d’un retrait volontaire de l’ONG, et c’est précisément la distinction qui compte.',
      );
    }
    return this.prisma.accordCadrePlan.update({
      where: { id: accord.id },
      data: { denonceLe: new Date(dto.denonceLe), motifDenonciation: dto.motif.trim() },
    });
  }
}

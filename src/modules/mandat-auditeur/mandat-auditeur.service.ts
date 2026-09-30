import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrganeDesignationAuditeur, Referentiel } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { regleAuditeur } from '../controles/regles-auditeur';
import {
  dernierExerciceCouvert,
  dureeMandat,
  fondementInscription,
  motifRefusDuree,
  motifRefusOrgane,
  motifRefusSuccession,
  NatureSuccession,
  successionOuverte,
} from './duree-mandat';

/**
 * MANDAT DU CONTRÔLEUR DES COMPTES · auditeur au SYCEBNL (art. 19 à 22),
 * commissaire aux comptes à l'AUSCGIE (art. 379, 703 à 705).
 *
 * Le logiciel savait dire QUI doit en désigner un et réclamait au cabinet, dans
 * le contrôle 6, de « vérifier que le mandat est en cours ». Aucune table ne le
 * détenait. Une exigence qu'on ne peut pas satisfaire est une exigence qui
 * apprend à être ignorée.
 *
 * LE MODULE NE DÉSIGNE PERSONNE ET NE PROROGE RIEN DE LUI-MÊME. Il enregistre
 * un acte qui a eu lieu, hors du logiciel, devant une assemblée. Tout ce qu'il
 * calcule est la conséquence de dates et d'un texte.
 */
@Injectable()
export class MandatAuditeurService {
  constructor(private readonly prisma: PrismaService) {}

  private async dossier(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { id: true, referentiel: true, formeJuridiqueSyscohada: true },
    });
  }

  /**
   * La durée que le texte propose pour un couple (référentiel, forme, organe),
   * servie à l'écran AVANT la saisie · c'est ce qui évite que le cabinet
   * découvre le refus après le clic, comme pour la longueur de compte.
   */
  async dureeProposee(tenantId: string, organe: OrganeDesignationAuditeur) {
    const t = await this.dossier(tenantId);
    const brute = dureeMandat(t.referentiel, t.formeJuridiqueSyscohada, organe);
    return {
      ...brute,
      // SYCEBNL art. 21, seconde phrase · la durée se réduit si l'entité a une
      // existence inférieure à trois exercices. OmegaX ne la mesure pas
      // (`motifRefusDuree`), le cabinet saisit la durée ramenée.
      reductionPossible: t.referentiel === Referentiel.SYCEBNL && brute.exercices !== null,
      // L'organe que le texte de la forme ne connaît pas, servi AVANT la
      // saisie · la route le refuse (`motifRefusOrgane`).
      organeRefuse: motifRefusOrgane(t.referentiel, t.formeJuridiqueSyscohada, organe),
      // AUSCGIE art. 706 et 728 · le remplaçant et le suppléant, SA et SAS.
      successionPossible: successionOuverte(t.referentiel, t.formeJuridiqueSyscohada),
    };
  }

  async lister(tenantId: string) {
    const mandats = await this.prisma.mandatAuditeur.findMany({
      where: { tenantId },
      orderBy: [{ premierExercice: 'desc' }, { rang: 'desc' }],
    });
    const t = await this.dossier(tenantId);
    return {
      mandats: mandats.map((m) => ({
        ...m,
        dernierExerciceCouvert: dernierExerciceCouvert(m.premierExercice, m.nombreExercices),
      })),
      referentiel: t.referentiel,
      // Le texte qui exige l'inscription au tableau, celui du DOSSIER · la
      // bulle d'aide servait « SYCEBNL art. 20 » à toute société.
      fondementInscription: fondementInscription(t.referentiel, t.formeJuridiqueSyscohada),
    };
  }

  async enregistrer(
    tenantId: string,
    dto: {
      nom: string;
      inscriptionOrdre: string;
      organeDesignation: OrganeDesignationAuditeur;
      dateDesignation: string;
      premierExercice: number;
      nombreExercices: number;
      rang?: number;
      mandatOrigineId?: string;
      natureSuccession?: NatureSuccession;
    },
  ) {
    const t = await this.dossier(tenantId);
    const rang = dto.rang ?? 1;

    // REFUS 1 · L'INSCRIPTION AU TABLEAU DE L'ORDRE.
    //
    // SYCEBNL art. 20 · « L'auditeur est CHOISI par les membres de l'entité à
    // but non lucratif parmi les EXPERTS-COMPTABLES INSCRITS AU TABLEAU de
    // l'ordre des experts-comptables ou de l'organe qui en tient lieu dans
    // chaque État partie » · l'ONEC en RDC. Côté SYSCOHADA, loi n° 15/002,
    // art. 59, et AUSCGIE art. 695 pour la SA et la SARL
    // (`fondementInscription`, passe D3) · la branche société ne citait aucun
    // texte, et présentait une condition légale d'exercice comme une
    // commodité de révision.
    //
    // Le logiciel ne consulte aucun tableau et ne VÉRIFIE donc rien. Il exige
    // la référence, parce que c'est elle qu'un réviseur demandera, pas le nom.
    // Même parti que la source d'un relevé d'unités d'œuvre. Prétendre
    // vérifier serait pire que ne rien exiger.
    if (!dto.inscriptionOrdre.trim()) {
      const fondement = fondementInscription(t.referentiel, t.formeJuridiqueSyscohada);
      throw new BadRequestException(
        `La référence d’inscription au tableau de l’ordre est exigée · ${fondement.source}, ${fondement.texte}. ` +
          'OmegaX ne consulte aucun tableau et ne vérifie pas cette référence · il la conserve, parce que c’est ' +
          'elle qu’un réviseur demandera.',
      );
    }

    // REFUS 1 BIS · UN ORGANE QUE LE TEXTE DE LA FORME NE CONNAÎT PAS (SA,
    // art. 703) · passe O1b, E2.
    const refusOrgane = motifRefusOrgane(t.referentiel, t.formeJuridiqueSyscohada, dto.organeDesignation);
    if (refusOrgane) throw new BadRequestException(refusOrgane);

    // REFUS 2 · LE RENOUVELLEMENT BORNÉ, ET SEULEMENT LÀ OÙ UN TEXTE LE BORNE.
    //
    // SYCEBNL art. 21 · « L'auditeur est nommé pour trois (3) exercices
    // RENOUVELABLES UNE FOIS. » Deux mandats, pas un de plus.
    //
    // Aucun article lu de l'AUSCGIE ne borne le renouvellement d'un commissaire
    // aux comptes. Appliquer la limite du SYCEBNL à une SARL INVENTERAIT une
    // interdiction · c'est le § 10 bis, et le cabinet corrigerait un manquement
    // qui n'existe pas.
    const brute = dureeMandat(t.referentiel, t.formeJuridiqueSyscohada, dto.organeDesignation);
    if (brute.mandatsMaximum !== null && rang > brute.mandatsMaximum) {
      throw new BadRequestException(
        `Un ${brute.mandatsMaximum + 1}e mandat consécutif n’est pas prévu · ${brute.source}, « l’auditeur ` +
          'est nommé pour trois (3) exercices renouvelables UNE FOIS ». Au-delà, c’est un autre auditeur ' +
          'que l’assemblée désigne.',
      );
    }

    // REFUS 3 · LA DURÉE, QUAND LE TEXTE EN FIXE UNE.
    //
    // La durée n'est pas au choix du cabinet là où un article la chiffre. Elle
    // l'est entièrement pour la SAS, la SNC, la commandite simple, le GIE, la
    // coopérative et l'entreprenant, dont aucun texte lu ne dit rien · d'où
    // `exercices: null`, et aucun refus.
    //
    // SAUF LE MANDAT QUI EN CONTINUE UN AUTRE (art. 706 et 728, passe O1b,
    // E1) · sa durée se lit sur le mandat d'origine, pas sur l'art. 704.
    const origine = await this.origineDeLaSuccession(tenantId, t, dto);
    if (origine) {
      const refus = motifRefusSuccession(dto.natureSuccession!, origine, dto.premierExercice, dto.nombreExercices);
      if (refus) throw new BadRequestException(`Durée refusée · ${refus}. Valeur reçue : ${dto.nombreExercices}.`);
    }
    const refusDuree = origine ? null : motifRefusDuree(t.referentiel, brute.exercices, dto.nombreExercices);
    if (refusDuree) {
      throw new BadRequestException(
        `La durée du mandat est de ${refusDuree} pour ce dossier · ${brute.source}` +
          (t.referentiel === Referentiel.SYCEBNL
            ? ', ramenée à la durée d’existence de l’entité si elle est inférieure (SYCEBNL art. 21, seconde phrase)'
            : '') +
          `. Valeur reçue : ${dto.nombreExercices}.`,
      );
    }

    return this.prisma.mandatAuditeur.create({
      data: {
        tenantId,
        nom: dto.nom.trim(),
        inscriptionOrdre: dto.inscriptionOrdre.trim(),
        organeDesignation: dto.organeDesignation,
        dateDesignation: new Date(dto.dateDesignation),
        premierExercice: dto.premierExercice,
        nombreExercices: dto.nombreExercices,
        rang,
        mandatOrigineId: origine?.id ?? null,
        natureSuccession: origine ? dto.natureSuccession! : null,
      },
    });
  }

  /**
   * Le mandat d'origine d'un remplacement ou d'un suppléant · null pour une
   * nomination initiale. Les deux champs vont ensemble, la succession n'est
   * ouverte qu'à la SA et à la SAS, et l'origine est un mandat DE CE DOSSIER.
   */
  private async origineDeLaSuccession(
    tenantId: string,
    t: { referentiel: Referentiel; formeJuridiqueSyscohada: Parameters<typeof successionOuverte>[1] },
    dto: { mandatOrigineId?: string; natureSuccession?: NatureSuccession },
  ) {
    if (!dto.mandatOrigineId && !dto.natureSuccession) return null;
    if (!dto.mandatOrigineId || !dto.natureSuccession) {
      throw new BadRequestException(
        'Un remplacement ou un suppléant se déclare avec le mandat qu’il continue · les deux vont ensemble.',
      );
    }
    if (!successionOuverte(t.referentiel, t.formeJuridiqueSyscohada)) {
      throw new BadRequestException(
        'Le remplacement (AUSCGIE art. 706) et le suppléant (art. 728) sont des règles de la société anonyme, ' +
          'que l’art. 853-3 rend applicables à la SAS · elles ne sont pas étendues à cette forme.',
      );
    }
    const origine = await this.prisma.mandatAuditeur.findFirst({ where: { id: dto.mandatOrigineId, tenantId } });
    if (!origine) throw new BadRequestException('Mandat d’origine introuvable dans ce dossier.');
    return origine;
  }

  /**
   * REFUS EXPRÈS DE PROROGATION · SYCEBNL art. 22, et AUSCGIE art. 709 pour
   * la SA (`regleDeProrogation`), le seul fait capable d'interrompre la
   * prorogation. Il vient du contrôleur lui-même, pas de l'entité : le module
   * l'enregistre, il ne le décide pas.
   */
  async refuserProrogation(tenantId: string, id: string, refus: boolean) {
    const mandat = await this.prisma.mandatAuditeur.findFirst({ where: { id, tenantId } });
    if (!mandat) throw new NotFoundException('Mandat introuvable');
    return this.prisma.mandatAuditeur.update({
      where: { id: mandat.id },
      data: { refusDeProrogation: refus },
    });
  }

  async clore(tenantId: string, id: string, dto: { finAnticipeeLe: string; motifFin: string }) {
    const mandat = await this.prisma.mandatAuditeur.findFirst({ where: { id, tenantId } });
    if (!mandat) throw new NotFoundException('Mandat introuvable');
    // Un mandat qui s'arrête avant son terme s'arrête POUR UNE RAISON ·
    // démission, révocation, empêchement. Sans motif écrit, la fiche ne
    // distingue plus une révocation d'un remplacement ordinaire, et c'est
    // justement la distinction qu'un réviseur cherche.
    if (!dto.motifFin.trim()) {
      throw new BadRequestException(
        'Le motif de fin anticipée est exigé · sans lui, une révocation ne se distingue plus d’un ' +
          'remplacement ordinaire, et c’est précisément ce qu’un réviseur cherche à savoir.',
      );
    }
    return this.prisma.mandatAuditeur.update({
      where: { id: mandat.id },
      data: { finAnticipeeLe: new Date(dto.finAnticipeeLe), motifFin: dto.motifFin.trim() },
    });
  }

  /** Le dossier est-il tenu d'avoir un contrôleur des comptes ? Règle existante. */
  async obligation(tenantId: string) {
    const t = await this.dossier(tenantId);
    return regleAuditeur(t.referentiel, t.formeJuridiqueSyscohada);
  }
}

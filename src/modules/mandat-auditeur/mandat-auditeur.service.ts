import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrganeDesignationAuditeur, Referentiel } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { regleAuditeur } from '../controles/regles-auditeur';
import { dernierExerciceCouvert, dureeMandat, dureeRamenee } from './duree-mandat';

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
    const nbExercices = await this.prisma.exercice.count({ where: { tenantId } });
    const brute = dureeMandat(t.referentiel, t.formeJuridiqueSyscohada, organe);
    const exercices = dureeRamenee(t.referentiel, brute.exercices, nbExercices);
    return {
      ...brute,
      exercices,
      // SYCEBNL art. 21, seconde phrase · « si l'entité a une existence
      // inférieure à trois exercices, son mandat est ramené à cette durée ».
      // Dire POURQUOI la durée proposée n'est pas celle du texte, sinon le
      // cabinet croira à un défaut du logiciel.
      ramenee: brute.exercices !== null && exercices !== null && exercices < brute.exercices,
      exercicesDeLEntite: nbExercices,
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
    },
  ) {
    const t = await this.dossier(tenantId);
    const rang = dto.rang ?? 1;

    // REFUS 1 · L'INSCRIPTION AU TABLEAU DE L'ORDRE.
    //
    // SYCEBNL art. 20 · « L'auditeur est CHOISI par les membres de l'entité à
    // but non lucratif parmi les EXPERTS-COMPTABLES INSCRITS AU TABLEAU de
    // l'ordre des experts-comptables ou de l'organe qui en tient lieu dans
    // chaque État partie » · l'ONEC en RDC.
    //
    // Le logiciel ne consulte aucun tableau et ne VÉRIFIE donc rien. Il exige
    // la référence, parce que c'est elle qu'un réviseur demandera, pas le nom.
    // Même parti que la source d'un relevé d'unités d'œuvre. Prétendre
    // vérifier serait pire que ne rien exiger.
    if (!dto.inscriptionOrdre.trim()) {
      throw new BadRequestException(
        t.referentiel === Referentiel.SYCEBNL
          ? 'La référence d’inscription au tableau de l’ordre est exigée · SYCEBNL art. 20, l’auditeur est ' +
            'choisi « parmi les experts-comptables inscrits au tableau de l’ordre des experts-comptables ou ' +
            'de l’organe qui en tient lieu dans chaque État partie » (l’ONEC en RDC). OmegaX ne consulte ' +
            'aucun tableau et ne vérifie pas cette référence · il la conserve, parce que c’est elle qu’un ' +
            'réviseur demandera.'
          : 'La référence d’inscription au tableau de l’ordre est exigée · c’est elle qu’un réviseur ' +
            'demandera, et OmegaX ne consulte aucun tableau : il conserve la référence sans la vérifier.',
      );
    }

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
    const nbExercices = await this.prisma.exercice.count({ where: { tenantId } });
    const attendue = dureeRamenee(t.referentiel, brute.exercices, nbExercices);
    if (attendue !== null && dto.nombreExercices !== attendue) {
      throw new BadRequestException(
        `La durée du mandat est de ${attendue} exercice(s) pour ce dossier · ${brute.source}` +
          (attendue !== brute.exercices
            ? ', ramenée à la durée d’existence de l’entité (SYCEBNL art. 21, seconde phrase)'
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
      },
    });
  }

  /**
   * REFUS EXPRÈS DE PROROGATION · SYCEBNL art. 22, le seul fait capable
   * d'interrompre la prorogation de plein droit. Il vient du contrôleur
   * lui-même, pas de l'entité : le module l'enregistre, il ne le décide pas.
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

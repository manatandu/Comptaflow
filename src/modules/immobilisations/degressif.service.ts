import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NatureDerogatoire } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { FORMES_PERSONNES_PHYSIQUES } from '../retenues/correspondance-retenues';
import { OptionDegressifDto, PasserDerogatoireDto } from './dto/immobilisation.dto';
import {
  CATEGORIES_ARTICLE_31,
  COMPTES_DEROGATOIRE,
  coefficientDegressif,
  derogatoireDeLExercice,
  motifRefusOptionDegressif,
  planFiscalDegressif,
} from './amortissement-degressif';

const n = (d: unknown) => Number(d ?? 0);

/**
 * DÉGRESSIF FISCAL ET DÉROGATOIRE · voir amortissement-degressif.ts pour les
 * textes. Le plan comptable du bien n'est jamais touché ; ce service tient le
 * plan FISCAL et passe, exercice par exercice, l'écart au 851/151 ou au
 * 151/861.
 */
@Injectable()
export class DegressifService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
  ) {}

  private async immo(tenantId: string, id: string) {
    const immo = await this.prisma.immobilisation.findFirst({
      where: { id, tenantId },
      include: {
        compteImmobilisation: { select: { numero: true } },
        dotations: { select: { exerciceId: true, montant: true } },
        derogatoires: true,
      },
    });
    if (!immo) throw new NotFoundException('Immobilisation introuvable pour ce dossier.');
    return immo;
  }

  private cumul(derogatoires: readonly { dotation: unknown; reprise: unknown }[]) {
    return Math.round(derogatoires.reduce((s, d) => s + n(d.dotation) - n(d.reprise), 0) * 100) / 100;
  }

  private async plan(tenantId: string, immo: Awaited<ReturnType<DegressifService['immo']>>) {
    const exercices = await this.prisma.exercice.findMany({
      where: { tenantId },
      select: { id: true, dateDebut: true, dateFin: true, statut: true },
      orderBy: { dateDebut: 'asc' },
    });
    const plan = planFiscalDegressif({
      base: Math.max(0, n(immo.valeurOrigine) - n(immo.valeurResiduelle)),
      dureeFiscaleAns: immo.dureeFiscaleAns ?? 0,
      dateMiseEnService: immo.dateMiseEnService,
      exercices,
    });
    return { exercices, plan };
  }

  /** Le plan fiscal confronté aux dotations comptables et au dérogatoire passé. */
  async planFiscal(tenantId: string, id: string) {
    const immo = await this.immo(tenantId, id);
    if (!immo.degressifFiscal) {
      return { degressifFiscal: false, categories: CATEGORIES_ARTICLE_31, lignes: [], cumulDerogatoire: 0 };
    }
    const { exercices, plan } = await this.plan(tenantId, immo);
    const lignes = plan.map((l) => {
      const e = exercices.find((x) => x.id === l.exerciceId)!;
      const comptable = immo.dotations.find((d) => d.exerciceId === l.exerciceId);
      const passe = immo.derogatoires.find((d) => d.exerciceId === l.exerciceId && d.nature === NatureDerogatoire.EXERCICE);
      return {
        exerciceId: l.exerciceId,
        dateDebut: e.dateDebut,
        dateFin: e.dateFin,
        valeurResiduelleDebut: l.valeurResiduelleDebut,
        annuiteFiscale: l.annuite,
        mode: l.mode,
        dotationComptable: comptable ? n(comptable.montant) : null,
        derogatoire: passe
          ? { dotation: n(passe.dotation), reprise: n(passe.reprise), excedentAReintegrer: n(passe.excedentAReintegrer) }
          : null,
      };
    });
    return {
      degressifFiscal: true,
      categorie: immo.categorieDegressif,
      dureeFiscaleAns: immo.dureeFiscaleAns,
      coefficient: coefficientDegressif(immo.dureeFiscaleAns ?? 0),
      categories: CATEGORIES_ARTICLE_31,
      lignes,
      cumulDerogatoire: this.cumul(immo.derogatoires),
    };
  }

  async opter(tenantId: string, id: string, dto: OptionDegressifDto) {
    const immo = await this.immo(tenantId, id);
    if (immo.degressifFiscal) throw new ConflictException('Le dégressif fiscal est déjà retenu pour ce bien.');
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, formeJuridiqueSyscohada: true },
    });
    const refus = motifRefusOptionDegressif({
      referentiel: tenant.referentiel,
      personnePhysique: !!tenant.formeJuridiqueSyscohada && FORMES_PERSONNES_PHYSIQUES.includes(tenant.formeJuridiqueSyscohada),
      numeroCompteImmobilisation: immo.compteImmobilisation.numero,
      categorie: dto.categorie,
      bienNeuf: dto.bienNeuf,
      dureeFiscaleAns: dto.dureeFiscaleAns,
      amortissementAnterieur: n(immo.amortissementAnterieur),
      dotationsPassees: immo.dotations.length,
    });
    if (refus) throw new BadRequestException(refus);
    return this.prisma.immobilisation.update({
      where: { id: immo.id },
      data: { degressifFiscal: true, categorieDegressif: dto.categorie, dureeFiscaleAns: dto.dureeFiscaleAns, optionDegressifLe: new Date() },
      select: { id: true, degressifFiscal: true, categorieDegressif: true, dureeFiscaleAns: true },
    });
  }

  private async compte(tenantId: string, numero: string) {
    const c = await this.prisma.compte.findUnique({ where: { tenantId_numero: { tenantId, numero } }, select: { id: true } });
    if (!c) throw new BadRequestException(`Compte ${numero} introuvable dans le plan du dossier.`);
    return c.id;
  }

  /**
   * LE DÉROGATOIRE D'UN EXERCICE. Trois conditions avant toute écriture · la
   * dotation COMPTABLE de l'exercice est passée (l'écart en dépend), les
   * exercices antérieurs du plan ont leur dérogatoire (sans quoi une annuité
   * fiscale serait perdue en silence), et l'exercice est dans le plan.
   */
  async passer(tenantId: string, userId: string, id: string, dto: PasserDerogatoireDto) {
    const immo = await this.immo(tenantId, id);
    if (!immo.degressifFiscal) throw new BadRequestException("Ce bien n'a pas l'option du dégressif fiscal.");
    const { plan } = await this.plan(tenantId, immo);
    const rang = plan.findIndex((l) => l.exerciceId === dto.exerciceId);
    if (rang < 0) throw new BadRequestException("Cet exercice n'est pas dans le plan fiscal du bien.");
    const passes = immo.derogatoires.filter((d) => d.nature === NatureDerogatoire.EXERCICE);
    if (passes.some((d) => d.exerciceId === dto.exerciceId)) {
      throw new ConflictException('Le dérogatoire de cet exercice est déjà passé.');
    }
    const manquant = plan.slice(0, rang).find((l) => !passes.some((d) => d.exerciceId === l.exerciceId));
    if (manquant) {
      throw new BadRequestException("Le dérogatoire d'un exercice antérieur du plan n'est pas passé · les exercices se traitent dans l'ordre.");
    }
    const comptable = immo.dotations.find((d) => d.exerciceId === dto.exerciceId);
    if (!comptable) {
      throw new BadRequestException("Passez d'abord la dotation comptable de l'exercice · le dérogatoire est l'écart entre l'annuité fiscale et elle.");
    }
    const annuite = plan[rang].annuite;
    const d = derogatoireDeLExercice(annuite, n(comptable.montant), this.cumul(immo.derogatoires));
    const exercice = await this.prisma.exercice.findFirstOrThrow({ where: { id: dto.exerciceId, tenantId } });

    let ecritureId: string | null = null;
    if (d.dotation > 0 || d.reprise > 0) {
      const c151 = await this.compte(tenantId, COMPTES_DEROGATOIRE.amortissementsDerogatoires);
      const contrepartie = await this.compte(tenantId, d.dotation > 0 ? COMPTES_DEROGATOIRE.dotationsHao : COMPTES_DEROGATOIRE.reprisesHao);
      const montant = d.dotation > 0 ? d.dotation : d.reprise;
      const ecriture = await this.ecritures.creer(tenantId, userId, {
        exerciceId: dto.exerciceId,
        journalId: dto.journalId,
        date: exercice.dateFin.toISOString().slice(0, 10),
        libelle: `${d.dotation > 0 ? 'Dotation' : 'Reprise'} amortissement dérogatoire · ${immo.designation}`.slice(0, 190),
        lignes:
          d.dotation > 0
            ? [
                { compteId: contrepartie, debit: montant, credit: 0 },
                { compteId: c151, debit: 0, credit: montant },
              ]
            : [
                { compteId: c151, debit: montant, credit: 0 },
                { compteId: contrepartie, debit: 0, credit: montant },
              ],
      });
      ecritureId = ecriture.id;
    }
    return this.prisma.amortissementDerogatoire.create({
      data: {
        tenantId,
        immobilisationId: immo.id,
        exerciceId: dto.exerciceId,
        nature: NatureDerogatoire.EXERCICE,
        annuiteFiscale: annuite,
        dotationComptable: n(comptable.montant),
        dotation: d.dotation,
        reprise: d.reprise,
        excedentAReintegrer: d.excedentAReintegrer,
        ecritureId,
      },
    });
  }

  /**
   * LE SOLDE D'UN BIEN QUI QUITTE L'ACTIF · une provision réglementée attachée
   * à un bien sorti n'a plus d'objet, et le 151 garderait sinon une réserve
   * sans bien. Reprise totale au 861, déclenchée par le cabinet avant la
   * sortie (lecture d'OmegaX · aucun texte lu ne règle ce moment).
   */
  async solder(tenantId: string, userId: string, id: string, dto: PasserDerogatoireDto) {
    const immo = await this.immo(tenantId, id);
    const cumul = this.cumul(immo.derogatoires);
    if (!(cumul > 0)) throw new BadRequestException("Aucun amortissement dérogatoire n'est à reprendre sur ce bien.");
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new NotFoundException('Exercice introuvable pour ce dossier.');
    const ecriture = await this.ecritures.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: exercice.dateFin.toISOString().slice(0, 10),
      libelle: `Reprise du solde de l'amortissement dérogatoire · ${immo.designation}`.slice(0, 190),
      lignes: [
        { compteId: await this.compte(tenantId, COMPTES_DEROGATOIRE.amortissementsDerogatoires), debit: cumul, credit: 0 },
        { compteId: await this.compte(tenantId, COMPTES_DEROGATOIRE.reprisesHao), debit: 0, credit: cumul },
      ],
    });
    return this.prisma.amortissementDerogatoire.create({
      data: {
        tenantId,
        immobilisationId: immo.id,
        exerciceId: dto.exerciceId,
        nature: NatureDerogatoire.SOLDE_SORTIE,
        annuiteFiscale: 0,
        dotationComptable: 0,
        dotation: 0,
        reprise: cumul,
        excedentAReintegrer: 0,
        ecritureId: ecriture.id,
      },
    });
  }
}


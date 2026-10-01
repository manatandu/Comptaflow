import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NatureDerogatoire, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { motifRefusAmortissementNonLineaireSmt } from '../../common/systeme-minimal';
import { FORMES_PERSONNES_PHYSIQUES } from '../retenues/correspondance-retenues';
import { OptionDegressifDto, PasserDerogatoireDto } from './dto/immobilisation.dto';
import {
  avertissementsDureeFiscale,
  CATEGORIES_ARTICLE_31,
  COMPTES_DEROGATOIRE,
  coefficientDegressif,
  derogatoireDeLExercice,
  motifRefusOptionDegressif,
  motifRegimeAnterieurDegressif,
  planFiscalDegressif,
} from './amortissement-degressif';
import { natureDuBareme } from './bareme-fiscal';

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
      exceptionnel: immo.amortissementExceptionnel,
    });
    return { exercices, plan };
  }

  /**
   * La nature du barème que le bien porte · c'est elle qui PROPOSE la durée à
   * l'option (arrêté n° 013/2025, art. 2), l'écran ne faisant que la reprendre.
   */
  private natureBareme(cle: string | null) {
    const nature = cle ? natureDuBareme(cle) : undefined;
    return nature ? { cle: nature.cle, designation: nature.designation, dureeAns: nature.dureeAns } : null;
  }

  /** Le plan fiscal confronté aux dotations comptables et au dérogatoire passé. */
  async planFiscal(tenantId: string, id: string) {
    const immo = await this.immo(tenantId, id);
    const regimeAnterieur = motifRegimeAnterieurDegressif(immo.dateMiseEnService);
    const natureBareme = this.natureBareme(immo.natureFiscaleCle);
    if (!immo.degressifFiscal) {
      return { degressifFiscal: false, categories: CATEGORIES_ARTICLE_31, lignes: [], cumulDerogatoire: 0, regimeAnterieur, natureBareme };
    }
    // Un bien mis en service avant 2026 et déjà sous option · aucun plan n'est
    // rendu, ni prolongé ni recommencé (B1). Le cumul du 151 reste montré,
    // puisque sa reprise reste ouverte.
    const { exercices, plan } = regimeAnterieur ? { exercices: [], plan: [] } : await this.plan(tenantId, immo);
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
      amortissementExceptionnel: immo.amortissementExceptionnel,
      prorataExport:
        immo.amortissementExceptionnel && immo.chiffreAffairesTotalHt != null && n(immo.chiffreAffairesTotalHt) > 0
          ? Math.round((n(immo.chiffreAffairesExportHt) / n(immo.chiffreAffairesTotalHt)) * 10000) / 10000
          : null,
      sourceChiffreAffairesExport: immo.sourceChiffreAffairesExport,
      categorie: immo.categorieDegressif,
      dureeFiscaleAns: immo.dureeFiscaleAns,
      coefficient: coefficientDegressif(immo.dureeFiscaleAns ?? 0),
      categories: CATEGORIES_ARTICLE_31,
      lignes,
      cumulDerogatoire: this.cumul(immo.derogatoires),
      regimeAnterieur,
      natureBareme,
      avertissements: avertissementsDureeFiscale({ natureFiscaleCle: immo.natureFiscaleCle, dureeFiscaleAns: immo.dureeFiscaleAns }),
    };
  }

  async opter(tenantId: string, id: string, dto: OptionDegressifDto) {
    const immo = await this.immo(tenantId, id);
    if (immo.degressifFiscal) throw new ConflictException('Le dégressif fiscal est déjà retenu pour ce bien.');
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, formeJuridiqueSyscohada: true, systemeComptableSyscohada: true },
    });
    const refusSmt = motifRefusAmortissementNonLineaireSmt(tenant, 'Le dégressif fiscal et son amortissement dérogatoire');
    if (refusSmt) throw new BadRequestException(refusSmt);
    const refus = motifRefusOptionDegressif({
      referentiel: tenant.referentiel,
      personnePhysique: !!tenant.formeJuridiqueSyscohada && FORMES_PERSONNES_PHYSIQUES.includes(tenant.formeJuridiqueSyscohada),
      numeroCompteImmobilisation: immo.compteImmobilisation.numero,
      categorie: dto.categorie,
      bienNeuf: dto.bienNeuf,
      dureeFiscaleAns: dto.dureeFiscaleAns,
      amortissementAnterieur: n(immo.amortissementAnterieur),
      dotationsPassees: immo.dotations.length,
      dateMiseEnService: immo.dateMiseEnService,
      exceptionnel: dto.exceptionnel
        ? {
            activiteIndustrielle: dto.activiteIndustrielle,
            chiffreAffairesExportHt: dto.chiffreAffairesExportHt,
            chiffreAffairesTotalHt: dto.chiffreAffairesTotalHt,
            source: dto.sourceChiffreAffaires,
          }
        : null,
    });
    if (refus) throw new BadRequestException(refus);
    const retenu = await this.prisma.immobilisation.update({
      where: { id: immo.id },
      data: {
        degressifFiscal: true,
        categorieDegressif: dto.categorie,
        dureeFiscaleAns: dto.dureeFiscaleAns,
        optionDegressifLe: new Date(),
        // La déclaration de l'art. 36 est GARDÉE · c'est elle que le contrôle
        // demandera, et le prorata ne se recalcule jamais sur d'autres chiffres.
        ...(dto.exceptionnel
          ? {
              amortissementExceptionnel: true,
              chiffreAffairesExportHt: dto.chiffreAffairesExportHt,
              chiffreAffairesTotalHt: dto.chiffreAffairesTotalHt,
              sourceChiffreAffairesExport: dto.sourceChiffreAffaires!.trim(),
            }
          : {}),
      },
      select: { id: true, degressifFiscal: true, categorieDegressif: true, dureeFiscaleAns: true, amortissementExceptionnel: true },
    });
    // L'écart avec le barème se SIGNALE, l'option est prise (arrêté n° 013/2025, art. 4).
    return { ...retenu, avertissements: avertissementsDureeFiscale({ natureFiscaleCle: immo.natureFiscaleCle, dureeFiscaleAns: dto.dureeFiscaleAns }) };
  }

  /**
   * L'ENREGISTREMENT QUI SUIT L'ÉCRITURE, ET CE QU'IL DÉFAIT S'IL EST REFUSÉ
   * (audit final F132). Deux clics passent les mêmes contrôles et posent chacun
   * leur écriture 851/151 · l'index unique (bien, exercice, nature) ne refuse
   * que la SECONDE fiche, et son écriture restait au journal sans rien qui la
   * tienne, doublant le dérogatoire au bilan. Elle est retirée par la
   * compensation commune, et le refus se dit en 409, comme `passerDotation`.
   */
  private async enregistrer<T>(tenantId: string, ecritureId: string | null, creer: () => Promise<T>, dejaPasse: string): Promise<T> {
    try {
      return await creer();
    } catch (err) {
      if (ecritureId) await this.ecritures.retirerCompensation(tenantId, ecritureId);
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException(dejaPasse);
      throw err;
    }
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
    // Sans mise en service, le plan est vide · le refus dit POURQUOI, au lieu du
    // « pas dans le plan » qui laisserait chercher une erreur d'exercice.
    if (!immo.dateMiseEnService) {
      throw new BadRequestException(
        "Ce bien n'est pas encore mis en service · aucun dérogatoire avant sa mise en service (loi n° 23/053, art. 34). Indiquez sa date de mise en service depuis la liste des biens.",
      );
    }
    // Une option prise avant le passage au SMT ne rouvre pas la porte · un
    // nouveau dérogatoire serait publié en F comme un amortissement. Le solde
    // (`solder`), lui, reste ouvert : il éteint l'historique.
    const regime = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, systemeComptableSyscohada: true },
    });
    const refusSmt = motifRefusAmortissementNonLineaireSmt(regime, 'Un nouvel amortissement dérogatoire');
    if (refusSmt) throw new BadRequestException(refusSmt);
    // Une option prise avant la borne du 1er janvier 2026 (B1) ne donne aucun
    // dérogatoire, sur aucun exercice · refus NOMMÉ, et non le « pas dans le
    // plan » d'un plan vide. `solder` reste ouvert.
    const anterieur = motifRegimeAnterieurDegressif(immo.dateMiseEnService);
    if (anterieur) throw new BadRequestException(anterieur);
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
    return this.enregistrer(
      tenantId,
      ecritureId,
      () =>
        this.prisma.amortissementDerogatoire.create({
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
        }),
      'Le dérogatoire de cet exercice est déjà passé.',
    );
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
    return this.enregistrer(
      tenantId,
      ecriture.id,
      () =>
        this.prisma.amortissementDerogatoire.create({
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
        }),
      'Le solde du dérogatoire de ce bien est déjà repris sur cet exercice.',
    );
  }
}


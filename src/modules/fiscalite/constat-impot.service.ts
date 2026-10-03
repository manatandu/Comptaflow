import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, StatutEcriture, StatutExercice, TypeCompteDetailTotal } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { transactionJournalisee } from '../../common/audit/transaction-journalisee';
import { EcritureService } from '../comptabilite/ecriture.service';
import { motifLignesTenues } from '../comptabilite/lignes-tenues';
import { ENTREE_EN_VIGUEUR_LOI_23_053 } from '../../common/entree-en-vigueur-loi-23-053';
import { FiscaliteService } from './fiscalite.service';
import {
  CONDITIONS_A_DECLARER,
  compteDeLaCharge,
  imputationAcomptes,
  lignesConstat,
  motifsRefusConstat,
} from './ecriture-impot-resultat';
import { AnnulerConstatImpotDto, PasserConstatImpotDto } from './dto/fiscalite.dto';

const arrondir = (n: number) => Math.round(n * 100) / 100;

/**
 * L'ÉCRITURE DE L'IMPÔT SUR LE RÉSULTAT · ligne A11 (relevé CPCC C7). Règles
 * et sources dans `ecriture-impot-resultat.ts`. Trois gestes.
 *
 *  · LIRE (`etat`) · la proposition, ses lignes et ses refus, ou le constat
 *    déjà passé avec l'écart entre son montant et l'impôt recalculé.
 *  · PASSER (`passer`) · au SEUL clic du cabinet, jamais d'office. Le montant
 *    est REJOUÉ par le serveur (`FiscaliteService.resultatFiscal`), jamais
 *    reçu du client ; l'écriture naît au BROUILLARD par
 *    `EcritureService.creer`, datée du dernier jour de l'exercice (« à la
 *    clôture de l'exercice », fiche du compte 89), et elle est RETENUE
 *    (`verifierAucunModuleNeLaTient`). Un seul constat non annulé par
 *    exercice · index unique NULLS NOT DISTINCT, le second clic reçoit 409 et
 *    son écriture est retirée.
 *  · ANNULER (`annuler`) · AUDCIF art. 20, al. 2 · au brouillard l'écriture
 *    est supprimée, validée elle est inscrite en négatif ; l'enregistrement est
 *    MARQUÉ annulé (journal d'audit), jamais supprimé.
 */
@Injectable()
export class ConstatImpotService {
  private readonly journal = new Logger(ConstatImpotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fiscalite: FiscaliteService,
    private readonly ecritures: EcritureService,
  ) {}

  private async constatEnPlace(tenantId: string, exerciceId: string) {
    return this.prisma.constatImpotResultat.findFirst({
      where: { tenantId, exerciceId, annuleeLe: null },
      include: { ecriture: { select: { id: true, numeroPiece: true, statut: true, date: true } } },
    });
  }

  /**
   * Ce que le calcul rejoue, et les motifs qui empêchent de proposer.
   * `resultatFiscal` refuse lui-même un dossier SYCEBNL (deuxième barrière
   * après `ReferentielGuard`).
   */
  private async rejouer(tenantId: string, exerciceId: string, attestationRegime: string | null | undefined) {
    const calcul = await this.fiscalite.resultatFiscal(tenantId, exerciceId);
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: exerciceId, tenantId },
      select: { statut: true, dateDebut: true, dateFin: true },
    });
    if (!exercice) throw new NotFoundException('Exercice introuvable');
    // LE BROUILLARD DE GESTION · le résultat fiscal ne lit que le livre-journal
    // (`lireBalance`, AUDCIF art. 22, 2°). Une charge restée au brouillard
    // n'entre pas dans le calcul · l'impôt constaté serait faux de sa part.
    const brouillardGestion = await this.prisma.ecriture.count({
      where: {
        tenantId,
        exerciceId,
        statut: StatutEcriture.BROUILLARD,
        lignes: {
          some: {
            OR: [
              { compte: { numero: { startsWith: '6' } } },
              { compte: { numero: { startsWith: '7' } } },
              { compte: { numero: { startsWith: '8' } } },
            ],
          },
        },
      },
    });
    const motifs = motifsRefusConstat({
      formeJuridique: calcul.formeJuridiqueSyscohada,
      regime: calcul.regime,
      impotDu: calcul.impotDu,
      minimumApplique: calcul.minimumApplique,
      simulationAvantLaLoi: exercice.dateDebut.getTime() < ENTREE_EN_VIGUEUR_LOI_23_053.getTime(),
      exerciceClos: exercice.statut === StatutExercice.CLOTURE,
      brouillardGestion,
      impotDejaConstate: calcul.impotExerciceAu89,
      soldeCompte89: calcul.soldeCompte89,
      reintegrationsImpot: calcul.reintegrationsImpot,
      attestationRegime,
    });
    return { calcul, exercice, motifs };
  }

  /** La proposition ou le constat en place · lecture seule, rien n'est écrit. */
  async etat(tenantId: string, exerciceId: string) {
    const enPlace = await this.constatEnPlace(tenantId, exerciceId);
    const annulees = await this.prisma.constatImpotResultat.count({
      where: { tenantId, exerciceId, annuleeLe: { not: null } },
    });
    if (enPlace) {
      const calcul = await this.fiscalite.resultatFiscal(tenantId, exerciceId);
      const montant = Number(enPlace.montantImpot);
      // L'ÉCART DIT, JAMAIS CORRIGÉ · un retraitement ajouté après le clic, ou
      // une réintégration du 89 oubliée après validation, change l'impôt
      // recalculé. Le constat garde le montant du clic · c'est au cabinet
      // d'annuler et de repasser.
      const ecart = calcul.impotDu === null ? null : arrondir(calcul.impotDu - montant);
      return {
        exerciceId,
        constat: {
          id: enPlace.id,
          montantImpot: montant,
          minimumApplique: enPlace.minimumApplique,
          montantImpute: Number(enPlace.montantImpute),
          attestationRegime: enPlace.attestationRegime,
          compteCharge: compteDeLaCharge(enPlace.minimumApplique),
          ecriture: enPlace.ecriture,
          createdAt: enPlace.createdAt,
          impotRecalcule: calcul.impotDu,
          ecartAvecCalcul: ecart,
        },
        proposition: null,
        motifsRefus: [] as string[],
        annulees,
      };
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { formeJuridiqueSyscohada: true } });
    // L'attestation n'est pas encore saisie à la lecture (`undefined`) · la
    // condition est servie à part, l'écran la demande avec le clic.
    const { calcul, motifs } = await this.rejouer(tenantId, exerciceId, undefined);
    const conditionADeclarer = tenant?.formeJuridiqueSyscohada ? CONDITIONS_A_DECLARER[tenant.formeJuridiqueSyscohada] ?? null : null;
    const impot = calcul.impotDu ?? 0;
    const imputation = imputationAcomptes({ declares: calcul.acomptesVerses, solde4492: calcul.acomptesAu4492, impot });
    return {
      exerciceId,
      constat: null,
      proposition:
        calcul.impotDu === null || calcul.impotDu <= 0.005
          ? null
          : {
              impot: calcul.impotDu,
              minimumApplique: calcul.minimumApplique,
              explication: calcul.explication,
              date: calcul.dateFin,
              lignes: lignesConstat(calcul.impotDu, calcul.minimumApplique, 0),
              imputation: {
                acomptesDeclares: calcul.acomptesVerses,
                solde4492: calcul.acomptesAu4492,
                montant: imputation.montant,
                motifRefus: imputation.motifRefus,
                lignes: imputation.montant > 0 ? lignesConstat(calcul.impotDu, calcul.minimumApplique, imputation.montant).slice(2) : [],
              },
              conditionADeclarer,
            },
      motifsRefus: motifs,
      annulees,
    };
  }

  private async compte(tenantId: string, numero: string) {
    const c = await this.prisma.compte.findFirst({
      where: { tenantId, numero },
      select: { id: true, typeCompte: true, estActif: true },
    });
    if (!c || c.typeCompte !== TypeCompteDetailTotal.DETAIL || !c.estActif) {
      throw new BadRequestException(
        `Le compte ${numero} n'est pas ouvert en compte de détail actif dans le plan du dossier · l'écriture de l'impôt l'exige ` +
          '(AUDCIF Titre VII, comptes 89 et 44). Ouvrez-le ou réactivez-le dans Plan comptable.',
      );
    }
    return c.id;
  }

  private async journalOd(tenantId: string) {
    const journal =
      (await this.prisma.journal.findFirst({ where: { tenantId, code: 'OD' } })) ??
      (await this.prisma.journal.findFirst({ where: { tenantId, type: 'GENERAL' } }));
    if (!journal) {
      throw new BadRequestException("Aucun journal des opérations diverses (code OD) pour recevoir l'écriture de l'impôt.");
    }
    return journal;
  }

  /** Le clic du cabinet · rejoue, refuse ou passe au brouillard. */
  async passer(tenantId: string, userId: string, exerciceId: string, dto: PasserConstatImpotDto) {
    const enPlace = await this.constatEnPlace(tenantId, exerciceId);
    if (enPlace) {
      throw new ConflictException(
        `L'impôt de cet exercice est déjà constaté (pièce n° ${enPlace.ecriture?.numeroPiece ?? '·'}) · annulez ce constat avant d'en passer un autre.`,
      );
    }
    const attestation = dto.attestationRegime?.trim() || null;
    const { calcul, exercice, motifs } = await this.rejouer(tenantId, exerciceId, attestation);
    if (motifs.length > 0) throw new BadRequestException(motifs.join(' '));
    const impot = calcul.impotDu!;
    let impute = 0;
    if (dto.imputerAcomptes) {
      const imputation = imputationAcomptes({ declares: calcul.acomptesVerses, solde4492: calcul.acomptesAu4492, impot });
      if (imputation.motifRefus) throw new BadRequestException(imputation.motifRefus);
      impute = imputation.montant;
    }
    const lignes = lignesConstat(impot, calcul.minimumApplique, impute);
    const ids = new Map<string, string>();
    for (const numero of new Set(lignes.map((l) => l.numero))) ids.set(numero, await this.compte(tenantId, numero));
    const journal = await this.journalOd(tenantId);

    const ecriture = await this.ecritures.creer(tenantId, userId, {
      exerciceId,
      journalId: journal.id,
      date: exercice.dateFin.toISOString().slice(0, 10),
      libelle: calcul.minimumApplique
        ? "Impôt minimum de l'exercice (loi n° 23/053, art. 57)"
        : "Impôt sur les bénéfices de l'exercice (loi n° 23/053, art. 56)",
      lignes: lignes.map((l) => ({
        compteId: ids.get(l.numero)!,
        ...(l.debit > 0 ? { debit: l.debit } : { credit: l.credit }),
        libelle: l.libelle,
      })),
    });
    try {
      const constat = await this.prisma.constatImpotResultat.create({
        data: {
          tenantId,
          exerciceId,
          montantImpot: new Prisma.Decimal(impot),
          minimumApplique: calcul.minimumApplique,
          montantImpute: new Prisma.Decimal(impute),
          attestationRegime: attestation,
          ecritureId: ecriture.id,
          createdBy: userId,
        },
      });
      return { constat: { id: constat.id, montantImpot: impot, montantImpute: impute }, ecriture: { id: ecriture.id, numeroPiece: ecriture.numeroPiece } };
    } catch (err) {
      // L'ÉCRITURE NE RESTE PAS SANS SON CONSTAT · un second clic simultané
      // bute sur l'index unique ; la pièce qu'il vient de créer est retirée,
      // et un retrait manqué est consigné sans masquer l'erreur d'origine.
      try {
        await this.ecritures.retirerCompensation(tenantId, ecriture.id);
      } catch (retrait) {
        this.journal.error(
          `Écriture ${ecriture.id} de l'impôt sur le résultat non retirée après l'échec du constat : ${(retrait as Error).message}`,
        );
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException("L'impôt de cet exercice vient d'être constaté par un autre geste · relisez la fenêtre.");
      }
      throw err;
    }
  }

  /** AUDCIF art. 20, al. 2 · brouillard supprimé, validé inscrit en négatif, constat marqué. */
  async annuler(tenantId: string, userId: string, exerciceId: string, dto: AnnulerConstatImpotDto) {
    const motif = dto.motif.trim();
    if (motif.length < 3) throw new BadRequestException("Le motif de l'annulation est obligatoire (AUDCIF art. 20).");
    const enPlace = await this.prisma.constatImpotResultat.findFirst({
      where: { tenantId, exerciceId, annuleeLe: null },
      include: {
        exercice: { select: { statut: true } },
        ecriture: { select: { id: true, numeroPiece: true, lignes: { select: { lettre: true, lettrageId: true, rapprochementId: true } } } },
      },
    });
    if (!enPlace) throw new NotFoundException("Aucun impôt constaté à annuler pour cet exercice.");
    if (enPlace.exercice.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException(
        "L'exercice est clôturé · l'écriture de l'impôt ne s'y annule plus. Une erreur se corrige par le report à nouveau (AUDCIF art. 20, al. 3), un rappel ou un dégrèvement ultérieur aux comptes 892 et 899.",
      );
    }
    const objet = `l'écriture de l'impôt n° ${enPlace.ecriture?.numeroPiece ?? '·'}`;
    if (enPlace.ecriture) {
      const tenues = motifLignesTenues(enPlace.ecriture.lignes, objet, 'annuler', ", puis annulez l'impôt constaté");
      if (tenues) throw new BadRequestException(tenues);
    }
    return transactionJournalisee(this.prisma, async (tx) => {
      const e = enPlace.ecriture;
      let annulation: Record<string, unknown> = { traitement: 'SANS_ECRITURE' };
      if (e) {
        // Relus DANS la transaction · un lettrage ou une validation posés
        // entre-temps changent l'issue.
        const relues = await tx.ligneEcriture.findMany({
          where: { ecritureId: e.id, ecriture: { tenantId } },
          select: { lettre: true, lettrageId: true, rapprochementId: true },
        });
        const tenues = motifLignesTenues(relues, objet, 'annuler', ", puis annulez l'impôt constaté");
        if (tenues) throw new BadRequestException(tenues);
        const statut = await tx.ecriture.findFirst({ where: { id: e.id, tenantId }, select: { statut: true } });
        if (!statut) throw new ConflictException(`L'écriture ${e.id} n'existe plus · relisez la fenêtre avant d'annuler.`);
        if (statut.statut === StatutEcriture.BROUILLARD) {
          annulation = { traitement: 'SUPPRIMEE', ecritureId: e.id, numeroPiece: e.numeroPiece };
        } else {
          const negatif = await this.ecritures.inscrireEnNegatifPourAnnulation(tenantId, userId, e.id, motif, tx);
          annulation = {
            traitement: 'INSCRITE_EN_NEGATIF',
            ecritureId: e.id,
            numeroPiece: e.numeroPiece,
            negatifId: negatif.id,
            negatifNumeroPiece: negatif.numeroPiece,
          };
        }
      }
      // Marqué AVANT la suppression du brouillard, par un `update` unitaire
      // (journal d'audit) sur une ligne encore non annulée · un second geste
      // simultané reçoit 409.
      try {
        await tx.constatImpotResultat.update({
          where: { id: enPlace.id, tenantId, annuleeLe: null },
          data: {
            annuleeLe: new Date(),
            annuleePar: userId,
            motifAnnulation: motif,
            annulation: annulation as Prisma.InputJsonValue,
            ...(annulation.traitement === 'SUPPRIMEE' ? { ecritureId: null } : {}),
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          throw new ConflictException('Cet impôt constaté est déjà annulé.');
        }
        throw err;
      }
      if (e && annulation.traitement === 'SUPPRIMEE') {
        await tx.ligneEcriture.deleteMany({ where: { ecritureId: e.id, ecriture: { tenantId, statut: StatutEcriture.BROUILLARD } } });
        const r = await tx.ecriture.deleteMany({ where: { id: e.id, tenantId, statut: StatutEcriture.BROUILLARD } });
        if (r.count !== 1) {
          throw new ConflictException(
            "L'écriture a été validée pendant l'annulation · rien n'est supprimé. Relancez l'annulation · validée, elle s'inscrira en négatif (AUDCIF art. 20, al. 2).",
          );
        }
      }
      return { annule: true, annulation };
    });
  }
}

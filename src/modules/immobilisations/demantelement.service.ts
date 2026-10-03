import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MotifRepriseDemantelement,
  NatureMouvementDemantelement,
  Prisma,
  StatutExercice,
  StatutImmobilisation,
  TypeComposant,
  TypeCompteDetailTotal,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { transactionJournalisee } from '../../common/audit/transaction-journalisee';
import { DesactualisationDemantelementDto, RepriseDemantelementDto } from './dto/immobilisation.dto';
import { motifRefusProvisionSmt } from '../../common/systeme-minimal';
import {
  desactualisationExercice,
  moisDeDesactualisation,
  motifRefusDesactualisation,
  motifRefusReprise,
  resteADesactualiser,
  valeurActualiseeDemantelement,
  ventilationReprise,
} from './demantelement';

const n = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);
const centimes = (x: number) => Math.round(x * 100) / 100;

/**
 * Les comptes que le texte nomme, les mêmes aux deux plans semés · 19840000
 * « Provisions pour démantèlement et remise en état », 69710000 (dotations
 * aux provisions financières pour risques et charges), 79110000 et 79710000
 * (reprises d'exploitation et financières pour risques et charges). AUDCIF
 * Titre VIII ch. 6 § 2.3 (exemple) et § 4.1 ; SYCEBNL, compte 19 (1984) et
 * comptes 69 et 79 de son plan.
 */
export const COMPTES_DEMANTELEMENT = {
  provision: '1984',
  desactualisation: '6971',
  repriseExploitation: '7911',
  repriseFinanciere: '7971',
} as const;

/**
 * LA PROVISION POUR DÉMANTÈLEMENT APRÈS L'ENTRÉE DU COMPOSANT (lot 15) · la
 * règle est dans `demantelement.ts` ; ici, la lecture du composant, de ses
 * mouvements et des exercices, puis l'écriture, retenue par sa ligne.
 */
@Injectable()
export class DemantelementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
  ) {}

  /** § 2.3 · la valeur actualisée proposée à l'entrée du composant. */
  valeurActualisee(coutFutur: number, tauxPourcent: number, annees: number) {
    if (!(coutFutur > 0) || !(tauxPourcent >= 0) || !(annees > 0)) {
      throw new BadRequestException("Indiquez le coût attendu, le taux d'actualisation et le nombre d'années jusqu'au démantèlement.");
    }
    return { valeurActualisee: valeurActualiseeDemantelement(coutFutur, tauxPourcent, annees) };
  }

  private async composant(tenantId: string, id: string) {
    const immo = await this.prisma.immobilisation.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        designation: true,
        typeComposant: true,
        immobilisationPrincipaleId: true,
        valeurOrigine: true,
        dateAcquisition: true,
        statut: true,
        ecritureAcquisitionId: true,
        coutFuturDemantelement: true,
        tauxActualisationDemantelementPourcent: true,
        mouvementsDemantelement: { orderBy: { date: 'asc' } },
      },
    });
    if (!immo) throw new NotFoundException('Immobilisation introuvable');
    // La voie directe du § 2.1 · « le composant [...] débité directement par
    // le crédit du compte 1984 ». Un composant entré autrement (trésorerie,
    // fournisseur) n'a aucune provision à suivre.
    const credit1984 = immo.ecritureAcquisitionId
      ? await this.prisma.ligneEcriture.count({
          where: {
            ecritureId: immo.ecritureAcquisitionId,
            ecriture: { tenantId },
            credit: { gt: 0 },
            compte: { tenantId, numero: { startsWith: COMPTES_DEMANTELEMENT.provision } },
          },
        })
      : 0;
    const estComposantDemantelement = !!immo.immobilisationPrincipaleId && immo.typeComposant === TypeComposant.DEMANTELEMENT;
    const desactualisations = immo.mouvementsDemantelement.filter((m) => m.nature === NatureMouvementDemantelement.DESACTUALISATION);
    const reprise = immo.mouvementsDemantelement.find((m) => m.nature === NatureMouvementDemantelement.REPRISE) ?? null;
    return {
      immo,
      entreParLaProvision: credit1984 > 0,
      // Repris au bilan d'ouverture · aucune écriture d'acquisition (F32).
      repris: !immo.ecritureAcquisitionId,
      estComposantDemantelement,
      desactualisations,
      reprise,
    };
  }

  private async regime(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, systemeComptableSyscohada: true, jeuEtatsFinanciersSycebnl: true },
    });
  }

  /** Les exercices antérieurs à `exercice` que la provision a traversés, sans leur désactualisation. */
  private async exercicesManquants(
    tenantId: string,
    c: Awaited<ReturnType<DemantelementService['composant']>>,
    exercice: { dateDebut: Date },
  ): Promise<string[]> {
    const anterieurs = await this.prisma.exercice.findMany({
      where: { tenantId, dateFin: { gte: c.immo.dateAcquisition }, dateDebut: { lt: exercice.dateDebut } },
      select: { id: true, dateDebut: true, dateFin: true },
      orderBy: { dateDebut: 'asc' },
      take: 50,
    });
    const passes = new Set(c.desactualisations.map((m) => m.exerciceId));
    return anterieurs
      .filter((e) => !passes.has(e.id))
      .map((e) => `l'exercice du ${e.dateDebut.toISOString().slice(0, 10)} au ${e.dateFin.toISOString().slice(0, 10)}`);
  }

  private async compte(tenantId: string, racine: string) {
    const c = await this.prisma.compte.findFirst({
      where: { tenantId, numero: { startsWith: racine }, typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true },
      orderBy: { numero: 'asc' },
      select: { id: true, numero: true },
    });
    if (!c) throw new BadRequestException(`Aucun compte ${racine} de détail au plan du dossier · ouvrez-le d'abord.`);
    return c;
  }

  /** L'état de la provision et la proposition de l'exercice · rien n'est écrit. */
  async etat(tenantId: string, id: string, exerciceId: string) {
    const c = await this.composant(tenantId, id);
    const exercice = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce dossier');
    const [proposition, regime] = await Promise.all([this.proposition(tenantId, c, exercice), this.regime(tenantId)]);
    const cumul = centimes(c.desactualisations.reduce((s, m) => s + n(m.montant), 0));
    return {
      // L'écran ne propose que ce que le serveur écrirait · reprise faite ou
      // composant repris, plus aucun bouton (§ 9 ter, le refus reste au serveur).
      repriseFaite: !!c.reprise,
      composantRepris: c.repris,
      systemeMinimal: !!motifRefusProvisionSmt(regime),
      provisionInitiale: c.entreParLaProvision ? n(c.immo.valeurOrigine) : null,
      cumulDesactualisations: cumul,
      provision: c.entreParLaProvision && !c.reprise ? centimes(n(c.immo.valeurOrigine) + cumul) : 0,
      coutFutur: c.immo.coutFuturDemantelement != null ? n(c.immo.coutFuturDemantelement) : null,
      tauxPourcent: c.immo.tauxActualisationDemantelementPourcent != null ? n(c.immo.tauxActualisationDemantelementPourcent) : null,
      mouvements: c.immo.mouvementsDemantelement.map((m) => ({
        id: m.id,
        nature: m.nature,
        date: m.date,
        montant: n(m.montant),
        repriseExploitation: m.repriseExploitation != null ? n(m.repriseExploitation) : null,
        repriseFinanciere: m.repriseFinanciere != null ? n(m.repriseFinanciere) : null,
        motifReprise: m.motifReprise,
      })),
      desactualisation: proposition,
      reprise:
        c.entreParLaProvision && !c.repris && !c.reprise
          ? ventilationReprise(n(c.immo.valeurOrigine), c.desactualisations.map((m) => n(m.montant)))
          : null,
    };
  }

  private async proposition(
    tenantId: string,
    c: Awaited<ReturnType<DemantelementService['composant']>>,
    exercice: { id: string; dateDebut: Date; dateFin: Date; statut: StatutExercice },
    arreteAu?: Date,
  ) {
    const mois = moisDeDesactualisation(exercice, c.immo.dateAcquisition, arreteAu);
    // Les exercices antérieurs que la provision a traversés · chacun doit
    // porter sa désactualisation avant celle-ci, sans quoi la provision
    // d'ouverture serait trop faible et l'erreur se propagerait.
    const [manquants, regime] = await Promise.all([this.exercicesManquants(tenantId, c, exercice), this.regime(tenantId)]);
    const passes = new Set(c.desactualisations.map((m) => m.exerciceId));
    const taux = c.immo.tauxActualisationDemantelementPourcent != null ? n(c.immo.tauxActualisationDemantelementPourcent) : null;
    const motif = motifRefusDesactualisation({
      estComposantDemantelement: c.estComposantDemantelement,
      refusSystemeMinimal: motifRefusProvisionSmt(regime),
      repris: c.repris,
      entreParLaProvision: c.entreParLaProvision,
      tauxPourcent: taux,
      exerciceOuvert: exercice.statut === StatutExercice.OUVERT,
      dejaPassee: passes.has(exercice.id),
      repriseFaite: !!c.reprise,
      enService: c.immo.statut === StatutImmobilisation.EN_SERVICE,
      mois,
      exercicesManquants: manquants,
    });
    const provisionOuverture = centimes(
      n(c.immo.valeurOrigine) +
        c.desactualisations.filter((m) => !(m.exerciceId === exercice.id)).reduce((s, m) => s + n(m.montant), 0),
    );
    const montant =
      taux == null
        ? 0
        : desactualisationExercice({
            provisionOuverture,
            tauxPourcent: taux,
            mois,
            coutFutur: c.immo.coutFuturDemantelement != null ? n(c.immo.coutFuturDemantelement) : null,
          });
    return { mois, provisionOuverture, montant, motifRefus: motif ?? (montant <= 0 ? 'Rien à désactualiser pour cet exercice.' : null) };
  }

  /** § 2.3 · D 6971 / C 1984, datée du dernier jour de l'exercice. */
  async desactualiser(tenantId: string, userId: string, id: string, dto: DesactualisationDemantelementDto) {
    const c = await this.composant(tenantId, id);
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce dossier');
    const p = await this.proposition(tenantId, c, exercice);
    if (p.motifRefus) throw new BadRequestException(p.motifRefus);
    const [dotation, provision] = await Promise.all([
      this.compte(tenantId, COMPTES_DEMANTELEMENT.desactualisation),
      this.compte(tenantId, COMPTES_DEMANTELEMENT.provision),
    ]);
    const date = exercice.dateFin.toISOString().slice(0, 10);
    const ecriture = await this.ecritures.creer(tenantId, userId, {
      exerciceId: exercice.id,
      journalId: dto.journalId,
      date,
      libelle: `Désactualisation de la provision pour démantèlement · ${c.immo.designation}`.slice(0, 190),
      lignes: [
        { compteId: dotation.id, debit: p.montant, credit: 0 },
        { compteId: provision.id, debit: 0, credit: p.montant },
      ],
    });
    return this.enregistrer(tenantId, ecriture.id, {
      tenantId,
      immobilisationId: id,
      exerciceId: exercice.id,
      nature: NatureMouvementDemantelement.DESACTUALISATION,
      date: new Date(date),
      montant: p.montant,
      ecritureId: ecriture.id,
      createdBy: userId,
    });
  }

  /**
   * § 4.1, § 4.2 · D 1984 / C 7911 (valeur d'entrée) / C 7971 (désactualisations).
   *
   * LA DÉSACTUALISATION COURUE JUSQU'À LA REPRISE EST PASSÉE D'ABORD, par la
   * reprise elle-même (D 6971 / C 1984 à la date de reprise), quand celle de
   * l'exercice ne l'est pas encore · sans elle, la charge financière courue
   * jusqu'à l'extinction ne serait jamais constatée (`motifRefusReprise`).
   * Elle court au prorata des mois traversés, comme une entrée en cours
   * d'exercice (décision proposée, `moisDeDesactualisation`). Au SMT, rien
   * n'est créé · la reprise solde la provision telle qu'elle est.
   */
  async reprendre(tenantId: string, userId: string, id: string, dto: RepriseDemantelementDto) {
    const c = await this.composant(tenantId, id);
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce dossier');
    const date = new Date(dto.date.slice(0, 10));
    const regime = await this.regime(tenantId);
    const auSmt = !!motifRefusProvisionSmt(regime);
    const taux = c.immo.tauxActualisationDemantelementPourcent != null ? n(c.immo.tauxActualisationDemantelementPourcent) : null;
    const coutFutur = c.immo.coutFuturDemantelement != null ? n(c.immo.coutFuturDemantelement) : null;
    const provisionAvant = centimes(n(c.immo.valeurOrigine) + c.desactualisations.reduce((s, m) => s + n(m.montant), 0));
    const doitDesactualiser = !auSmt && resteADesactualiser({ tauxPourcent: taux, provision: provisionAvant, coutFutur });
    const courante = c.desactualisations.find((m) => m.exerciceId === exercice.id) ?? null;
    const motif = motifRefusReprise({
      estComposantDemantelement: c.estComposantDemantelement,
      repris: c.repris,
      entreParLaProvision: c.entreParLaProvision,
      exerciceOuvert: exercice.statut === StatutExercice.OUVERT,
      repriseFaite: !!c.reprise,
      dateDansExercice: date >= exercice.dateDebut && date <= exercice.dateFin,
      exercicesManquants: doitDesactualiser ? await this.exercicesManquants(tenantId, c, exercice) : [],
      desactualiseeJusquAu: courante && courante.date > date ? courante.date.toISOString().slice(0, 10) : null,
    });
    if (motif) throw new BadRequestException(motif);

    const courue =
      doitDesactualiser && !courante
        ? desactualisationExercice({
            provisionOuverture: provisionAvant,
            tauxPourcent: taux!,
            mois: moisDeDesactualisation(exercice, c.immo.dateAcquisition, date),
            coutFutur,
          })
        : 0;
    const v = ventilationReprise(n(c.immo.valeurOrigine), [...c.desactualisations.map((m) => n(m.montant)), courue]);
    // Tous les comptes AVANT la première écriture · un compte manquant ne
    // laisse pas une désactualisation seule au journal.
    const [provision, exploitation, financiere, dotation] = await Promise.all([
      this.compte(tenantId, COMPTES_DEMANTELEMENT.provision),
      this.compte(tenantId, COMPTES_DEMANTELEMENT.repriseExploitation),
      v.financiere > 0 ? this.compte(tenantId, COMPTES_DEMANTELEMENT.repriseFinanciere) : Promise.resolve(null),
      courue > 0 ? this.compte(tenantId, COMPTES_DEMANTELEMENT.desactualisation) : Promise.resolve(null),
    ]);

    let mouvementCouru: { id: string; ecritureId: string } | null = null;
    if (courue > 0 && dotation) {
      const ecr = await this.ecritures.creer(tenantId, userId, {
        exerciceId: exercice.id,
        journalId: dto.journalId,
        date: dto.date.slice(0, 10),
        libelle: `Désactualisation courue jusqu'à la reprise · ${c.immo.designation}`.slice(0, 190),
        lignes: [
          { compteId: dotation.id, debit: courue, credit: 0 },
          { compteId: provision.id, debit: 0, credit: courue },
        ],
      });
      const m = await this.enregistrer(tenantId, ecr.id, {
        tenantId,
        immobilisationId: id,
        exerciceId: exercice.id,
        nature: NatureMouvementDemantelement.DESACTUALISATION,
        date,
        montant: courue,
        ecritureId: ecr.id,
        createdBy: userId,
      });
      mouvementCouru = { id: m.id, ecritureId: ecr.id };
    }

    try {
      const ecriture = await this.ecritures.creer(tenantId, userId, {
        exerciceId: exercice.id,
        journalId: dto.journalId,
        date: dto.date.slice(0, 10),
        libelle: `Reprise de la provision pour démantèlement · ${c.immo.designation}`.slice(0, 190),
        lignes: [
          { compteId: provision.id, debit: v.total, credit: 0 },
          { compteId: exploitation.id, debit: 0, credit: v.exploitation },
          ...(financiere ? [{ compteId: financiere.id, debit: 0, credit: v.financiere }] : []),
        ],
      });
      return await this.enregistrer(tenantId, ecriture.id, {
        tenantId,
        immobilisationId: id,
        exerciceId: exercice.id,
        nature: NatureMouvementDemantelement.REPRISE,
        date,
        montant: v.total,
        repriseExploitation: v.exploitation,
        repriseFinanciere: v.financiere,
        motifReprise: dto.motif as MotifRepriseDemantelement,
        ecritureId: ecriture.id,
        createdBy: userId,
      });
    } catch (err) {
      // La reprise refusée défait la désactualisation qu'elle venait de
      // passer · seule, elle arrêterait la provision à une date sans reprise.
      if (mouvementCouru) {
        const { id: mvId, ecritureId } = mouvementCouru;
        await transactionJournalisee(this.prisma, (tx) => tx.mouvementDemantelement.delete({ where: { id: mvId } }));
        await this.ecritures.retirerCompensation(tenantId, ecritureId);
      }
      throw err;
    }
  }

  private async enregistrer(tenantId: string, ecritureId: string, data: Prisma.MouvementDemantelementUncheckedCreateInput) {
    try {
      const ligne = await transactionJournalisee(this.prisma, (tx) => tx.mouvementDemantelement.create({ data }));
      return { ...ligne, montant: n(ligne.montant) };
    } catch (err) {
      // Une ligne refusée ne laisse pas son écriture au journal · et un double
      // envoi (index unique) se dit en 409, jamais en 500.
      await this.ecritures.retirerCompensation(tenantId, ecritureId);
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ce mouvement de la provision est déjà passé pour cet exercice.');
      }
      throw err;
    }
  }
}

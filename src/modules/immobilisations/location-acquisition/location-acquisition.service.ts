import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatutExercice } from '@prisma/client';
import { PrismaService } from '../../../common/prisma.service';
import { EcritureService } from '../../comptabilite/ecriture.service';
import { construireEcheancier, ContratSaisi } from './echeancier-location-acquisition';
import { COMPTES_LOCATION_ACQUISITION } from './nomenclature-location-acquisition';
import { ventilerExercice, VentilationExercice } from './cloture-location-acquisition';

const EPSILON = 0.005;
const n = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);
const centimes = (x: number) => Math.round(x * 100) / 100;

/**
 * LA CLÔTURE DES CONTRATS DE LOCATION-ACQUISITION (b2) · AUDCIF Titre VIII
 * ch. 8 § 2.1.8.2 et fiche du compte 17. Le module ne saisit aucun loyer · le
 * cabinet les porte au 623 au fil de l'exercice (§ 2.1.8.1, décision de
 * Manasse) ; le module PROPOSE puis PASSE, pour un exercice, le virement du
 * 623 au 17 et au 672, les intérêts courus au 176, et à l'ouverture l'extourne
 * des courus de l'exercice précédent.
 *
 * TROIS REFUS, chacun nommé · un exercice antérieur du contrat non clôturé
 * (la dette de départ serait fausse) ; un 623 qui ne porte pas les loyers à
 * virer (le crédit le rendrait créditeur, les redevances n'ont pas été
 * saisies) ; un compte du référentiel absent du plan.
 */
@Injectable()
export class LocationAcquisitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
  ) {}

  private async contrat(tenantId: string, id: string) {
    const c = await this.prisma.contratLocationAcquisition.findFirst({
      where: { id, tenantId },
      include: { immobilisation: { select: { designation: true } }, clotures: true },
    });
    if (!c) throw new NotFoundException('Contrat de location-acquisition introuvable');
    return c;
  }

  /** L'échéancier rejoué sur les chiffres FIGÉS à l'entrée · jamais recalculé sur une saisie nouvelle. */
  private echeancierDe(c: Awaited<ReturnType<LocationAcquisitionService['contrat']>>) {
    const saisi: ContratSaisi = {
      nature: c.nature,
      datePriseEffet: c.datePriseEffet,
      dureeMois: c.dureeMois,
      periodicite: c.periodicite,
      termeAEchoir: c.termeAEchoir,
      loyer: n(c.loyer),
      prixOption: n(c.prixOption),
      optionRaisonnablementCertaine: c.optionRaisonnablementCertaine,
      bienDeFaibleValeur: c.bienDeFaibleValeur,
      tauxAnnuel: c.tauxAnnuel != null ? n(c.tauxAnnuel) : null,
      valeurContrat: c.valeurContrat != null ? n(c.valeurContrat) : null,
    };
    return construireEcheancier(saisi);
  }

  private async compte(tenantId: string, numero: string) {
    const c = await this.prisma.compte.findUnique({ where: { tenantId_numero: { tenantId, numero } }, select: { id: true } });
    if (!c) throw new BadRequestException(`Compte ${numero} absent du plan du dossier · ouvrez-le avant la clôture du contrat.`);
    return c.id;
  }

  /** Les contrats du dossier, avec l'état de leur clôture pour l'exercice. */
  async lister(tenantId: string, exerciceId: string) {
    const contrats = await this.prisma.contratLocationAcquisition.findMany({
      where: { tenantId },
      include: {
        immobilisation: { select: { designation: true } },
        clotures: { where: { exerciceId }, select: { id: true, loyers: true, interetsCourus: true } },
      },
      orderBy: { datePriseEffet: 'asc' },
      take: 500,
    });
    return contrats.map((c) => ({
      id: c.id,
      reference: c.reference,
      nature: c.nature,
      designation: c.immobilisation.designation,
      datePriseEffet: c.datePriseEffet,
      dette: n(c.dette),
      cloture: c.clotures[0] ? { loyers: n(c.clotures[0].loyers), interetsCourus: n(c.clotures[0].interetsCourus) } : null,
    }));
  }

  /**
   * LA PROPOSITION POUR UN EXERCICE · ce qui serait passé, et ce qui l'en
   * empêche. Rien n'est écrit.
   */
  async proposer(tenantId: string, contratId: string, exerciceId: string) {
    const c = await this.contrat(tenantId, contratId);
    const exercice = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce dossier');
    const { referentiel } = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { referentiel: true } });
    const comptes = COMPTES_LOCATION_ACQUISITION[referentiel][c.nature];
    if (!comptes) throw new BadRequestException("Ce référentiel n'ouvre aucun compte pour cette nature de contrat.");
    const echeancier = this.echeancierDe(c);
    const ventilation = ventilerExercice(echeancier.lignes, c.datePriseEffet, echeancier.dette, echeancier.tauxPeriodique, exercice);

    const refus: string[] = [];
    if (c.clotures.some((cl) => cl.exerciceId === exerciceId)) refus.push('La clôture de ce contrat est déjà passée pour cet exercice.');
    if (exercice.statut !== StatutExercice.OUVERT) refus.push('Exercice clôturé · aucune écriture ne peut y entrer (AUDCIF art. 20).');
    if (exercice.dateFin < c.datePriseEffet) refus.push("L'exercice s'achève avant la prise d'effet du contrat · rien à clôturer.");

    // LES EXERCICES SE CLÔTURENT DANS L'ORDRE · un exercice antérieur couvert
    // par le contrat et non clôturé laisserait au 17 une dette que
    // l'échéancier ne connaît plus.
    const anterieurs = await this.prisma.exercice.findMany({
      where: { tenantId, dateFin: { gte: c.datePriseEffet }, dateDebut: { lt: exercice.dateDebut } },
      select: { id: true, dateDebut: true, dateFin: true },
      orderBy: { dateDebut: 'asc' },
      take: 100,
    });
    const nonClotures = anterieurs.filter((e) => !c.clotures.some((cl) => cl.exerciceId === e.id));
    if (nonClotures.length) {
      refus.push(
        `Clôturez d'abord le contrat sur l'exercice ${nonClotures[0].dateDebut.toISOString().slice(0, 10)} · ` +
          `${nonClotures[0].dateFin.toISOString().slice(0, 10)} · les exercices se traitent dans l'ordre.`,
      );
    }

    // L'EXTOURNE DES COURUS DE L'EXERCICE PRÉCÉDENT (fiche du compte 17) ·
    // celle de la clôture immédiatement antérieure, si elle en portait.
    const precedent = anterieurs[anterieurs.length - 1];
    const cloturePrecedente = precedent ? c.clotures.find((cl) => cl.exerciceId === precedent.id) : undefined;
    const extourne = cloturePrecedente ? n(cloturePrecedente.interetsCourus) : 0;

    // LE 623 PORTE-T-IL LES LOYERS ? Mouvements nets de l'exercice sur le
    // compte de redevances, hors solde des comptes de gestion (une lecture
    // des classes 6 à 8 ne lit jamais le total, CLAUDE.md § 6) et hors ce que
    // ce module y a déjà viré pour d'autres contrats · le compte est commun à
    // tous les contrats de même nature.
    const id623 = await this.prisma.compte.findUnique({
      where: { tenantId_numero: { tenantId, numero: comptes.redevances } },
      select: { id: true },
    });
    let porte623 = 0;
    if (id623) {
      const dejaVires = await this.prisma.clotureLocationAcquisition.findMany({
        where: { tenantId, exerciceId },
        select: { ecritureId: true },
        take: 500,
      });
      const agg = await this.prisma.ligneEcriture.aggregate({
        where: {
          compteId: id623.id,
          ecriture: {
            tenantId,
            exerciceId,
            estSoldeDesComptesDeGestion: false,
            id: { notIn: dejaVires.map((d) => d.ecritureId) },
          },
        },
        _sum: { debit: true, credit: true },
      });
      porte623 = centimes(n(agg._sum.debit) - n(agg._sum.credit));
    }
    const virementsAutres = await this.prisma.clotureLocationAcquisition.aggregate({
      where: { tenantId, exerciceId, contrat: { nature: c.nature } },
      _sum: { loyers: true },
    });
    const disponible623 = centimes(porte623 - n(virementsAutres._sum.loyers));
    if (ventilation.loyers > EPSILON && disponible623 + EPSILON < ventilation.loyers) {
      refus.push(
        `Le compte ${comptes.redevances} ne porte que ${disponible623.toFixed(2)} pour ${ventilation.loyers.toFixed(2)} de loyers échus · ` +
          'saisissez les redevances de l’exercice avant la clôture (AUDCIF Titre VIII ch. 8 § 2.1.8.1).',
      );
    }

    return {
      contrat: { id: c.id, reference: c.reference, designation: c.immobilisation.designation },
      exercice: { id: exercice.id, dateDebut: exercice.dateDebut, dateFin: exercice.dateFin },
      comptes,
      ventilation,
      extourne,
      porte623,
      disponible623,
      refus,
    };
  }

  /** Le passage · la proposition est REJOUÉE, jamais reçue du client. */
  async passer(tenantId: string, userId: string, contratId: string, dto: { exerciceId: string; journalId: string }) {
    const p = await this.proposer(tenantId, contratId, dto.exerciceId);
    if (p.refus.length) throw new BadRequestException(p.refus.join(' '));
    const v: VentilationExercice = p.ventilation;
    if (v.loyers <= EPSILON && v.interetsCourus <= EPSILON && p.extourne <= EPSILON) {
      throw new BadRequestException("Aucun loyer échu ni intérêt couru sur cet exercice · rien à passer.");
    }
    const [id17, id176, id672, id623] = await Promise.all([
      this.compte(tenantId, p.comptes.dette),
      this.compte(tenantId, p.comptes.interetsCourus),
      this.compte(tenantId, p.comptes.interets),
      this.compte(tenantId, p.comptes.redevances),
    ]);
    const nom = p.contrat.reference ? `${p.contrat.designation} (${p.contrat.reference})` : p.contrat.designation;
    const crees: string[] = [];
    try {
      let ecritureExtourneId: string | null = null;
      if (p.extourne > EPSILON) {
        const e = await this.ecritures.creer(tenantId, userId, {
          exerciceId: dto.exerciceId,
          journalId: dto.journalId,
          date: p.exercice.dateDebut.toISOString().slice(0, 10),
          libelle: `Extourne des intérêts courus · ${nom}`.slice(0, 190),
          lignes: [
            { compteId: id176, debit: p.extourne, credit: 0 },
            { compteId: id672, debit: 0, credit: p.extourne },
          ],
        });
        ecritureExtourneId = e.id;
        crees.push(e.id);
      }
      const lignes = [
        ...(v.capital > EPSILON ? [{ compteId: id17, debit: v.capital, credit: 0 }] : []),
        ...(v.interets + v.interetsCourus > EPSILON ? [{ compteId: id672, debit: centimes(v.interets + v.interetsCourus), credit: 0 }] : []),
        ...(v.loyers > EPSILON ? [{ compteId: id623, debit: 0, credit: v.loyers }] : []),
        ...(v.interetsCourus > EPSILON ? [{ compteId: id176, debit: 0, credit: v.interetsCourus }] : []),
      ];
      // Sans loyer ni courus, seule l'extourne existait · l'écriture de clôture
      // est alors absente, mais la clôture doit être retenue pour l'ordre des
      // exercices ; elle pointe sur l'extourne, seule écriture du geste.
      let ecritureId: string;
      if (lignes.length) {
        const e = await this.ecritures.creer(tenantId, userId, {
          exerciceId: dto.exerciceId,
          journalId: dto.journalId,
          date: p.exercice.dateFin.toISOString().slice(0, 10),
          libelle: `Redevances de location-acquisition · ${nom}`.slice(0, 190),
          lignes,
        });
        ecritureId = e.id;
        crees.push(e.id);
      } else {
        ecritureId = ecritureExtourneId!;
        ecritureExtourneId = null;
      }
      return await this.prisma.clotureLocationAcquisition.create({
        data: {
          tenantId,
          contratId,
          exerciceId: dto.exerciceId,
          loyers: v.loyers,
          capital: v.capital,
          interets: v.interets,
          interetsCourus: v.interetsCourus,
          ecritureId,
          ecritureExtourneId,
          createdBy: userId,
        },
      });
    } catch (err) {
      // Une clôture refusée ne laisse aucune de ses écritures au journal ·
      // un double envoi tombe sur l'index unique (contrat, exercice).
      for (const id of crees.reverse()) await this.ecritures.retirerCompensation(tenantId, id);
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('La clôture de ce contrat est déjà passée pour cet exercice.');
      }
      throw err;
    }
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PeriodiciteFacturationEditeur, Prisma, SensFacture, TypeFormuleAbonnement, TypeLicence } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { FacturationService } from '../facturation/facturation.service';
import { PlateformeService } from '../plateforme/plateforme.service';
import { jourLisible, usdEnFc } from '../personnel/conversion-usd';
import {
  AbonnementAFacturer,
  expirationApresPaiement,
  expirationInitiale,
  finEssaiDepuis,
  joursDepuis,
  FormulePrix,
  numeroFactureSuivant,
  verdictPeriode,
} from './facturation-abonnements';

/**
 * Les formules de la grille décidée le 2026-09-26 · posées SANS PRIX, que
 * l'opérateur saisit. Le contenu reprend la grille telle qu'elle a été
 * validée, rien de plus.
 */
export const FORMULES_INITIALES: { code: string; libelle: string; type: TypeFormuleAbonnement; contenu: string }[] = [
  { code: 'ESSENTIEL', libelle: 'Essentiel', type: 'FORMULE', contenu: '1 dossier, 2 utilisateurs · tenue, états financiers, notes' },
  { code: 'STANDARD', libelle: 'Standard', type: 'FORMULE', contenu: 'Essentiel + analytique et budgets, paie, TVA, immobilisations · 5 utilisateurs' },
  { code: 'CABINET', libelle: 'Cabinet', type: 'FORMULE', contenu: 'Paquet de dossiers, utilisateurs illimités' },
  { code: 'PAIE', libelle: 'Option paie', type: 'OPTION', contenu: 'La paie en supplément de la formule Essentiel' },
  { code: 'GROUPE', libelle: 'Option groupe', type: 'OPTION', contenu: 'Consolidation et IFRS, en supplément de Standard ou Cabinet' },
  { code: 'DOSSIER_SUPPLEMENTAIRE', libelle: 'Dossier supplémentaire', type: 'OPTION', contenu: 'Au-delà du paquet de la formule Cabinet, prix par dossier' },
];

export interface DemandeAbonnement {
  cabinetId: string;
  formuleCode: string;
  options: string[];
  dossiersSupplementaires: number;
  periodicite: PeriodiciteFacturationEditeur;
  debut: string;
  essai: boolean;
  tiersId: string;
}

/** Le jour du calendrier de Kinshasa (UTC+1). */
const aujourdhuiKinshasa = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const nombre = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));
const jour = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * LES ABONNEMENTS DES CABINETS ET LEUR FACTURATION, dans la console.
 *
 * LES FACTURES NAISSENT DANS LE DOSSIER DE VMG, par le module de facturation
 * du logiciel · la même pièce, les mêmes mentions, la même numérotation que
 * pour n'importe quel dossier, et JAMAIS un second circuit de facturation.
 * L'assujettissement à la TVA est donc celui du dossier de VMG
 * (`Tenant.assujettiTva`), l'interrupteur que Manasse basculera à la création
 * effective de la société · non assujetti, aucune ligne ne porte de TVA.
 *
 * LES PRIX SONT EN DOLLARS, LA FACTURE EN FRANCS · la comptabilité est tenue
 * en franc congolais (loi n° 23/053, art. 141, 1°). La conversion suit la
 * règle déjà retenue par le cabinet pour la paie : le cours saisi dans
 * Devises pour le JOUR de la facture, à la date exacte, et le refus s'il
 * manque. Le montant en dollars et le cours sont gardés à côté de la pièce.
 */
@Injectable()
export class AbonnementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly facturation: FacturationService,
    private readonly plateforme: PlateformeService,
  ) {}

  async formules() {
    const n = await this.prisma.formuleAbonnement.count();
    if (n === 0) {
      await this.prisma.formuleAbonnement.createMany({ data: FORMULES_INITIALES, skipDuplicates: true });
    }
    const f = await this.prisma.formuleAbonnement.findMany({ orderBy: [{ type: 'asc' }, { code: 'asc' }] });
    return f.map((x) => ({ ...x, prixMensuelUsd: nombre(x.prixMensuelUsd), prixAnnuelUsd: nombre(x.prixAnnuelUsd) }));
  }

  async fixerPrix(code: string, prixMensuelUsd: number | null, prixAnnuelUsd: number | null) {
    for (const p of [prixMensuelUsd, prixAnnuelUsd]) {
      if (p !== null && !(Number.isFinite(p) && p > 0)) throw new BadRequestException('Un prix est positif, ou laissé vide tant qu’il n’est pas arrêté.');
    }
    const f = await this.prisma.formuleAbonnement.findUnique({ where: { code }, select: { id: true } });
    if (!f) throw new NotFoundException('Formule introuvable.');
    await this.prisma.formuleAbonnement.update({
      where: { code },
      data: {
        prixMensuelUsd: prixMensuelUsd === null ? null : new Prisma.Decimal(prixMensuelUsd),
        prixAnnuelUsd: prixAnnuelUsd === null ? null : new Prisma.Decimal(prixAnnuelUsd),
      },
    });
    return this.formules();
  }

  /** Le dossier de l'éditeur · celui qui porte la licence PROPRIETAIRE, et lui seul. */
  private async dossierEditeur() {
    const l = await this.prisma.licence.findFirst({ where: { type: TypeLicence.PROPRIETAIRE }, select: { tenantId: true } });
    if (!l) throw new BadRequestException('Aucun dossier n’est désigné comme dossier de l’éditeur · les factures d’abonnement n’ont nulle part où naître.');
    return l.tenantId;
  }

  async lister() {
    const a = await this.prisma.abonnementCabinet.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        cabinet: { select: { nom: true, licence: { select: { dateExpiration: true, statut: true } } } },
        formule: { select: { code: true, libelle: true } },
        options: { select: { formule: { select: { code: true, libelle: true } } } },
        tiers: { select: { nom: true } },
        factures: {
          orderBy: { periode: 'desc' },
          take: 24,
          select: { id: true, periode: true, montantUsd: true, payeeLe: true, facture: { select: { numeroSerie: true, dateFacture: true } } },
        },
      },
    });
    return a.map((x) => ({
      id: x.id,
      cabinetId: x.cabinetId,
      cabinet: x.cabinet.nom,
      formule: x.formule,
      options: x.options.map((o) => o.formule),
      dossiersSupplementaires: x.dossiersSupplementaires,
      periodicite: x.periodicite,
      debut: jour(x.debut),
      finEssai: jour(x.finEssai),
      tiers: x.tiers.nom,
      actif: x.actif,
      echeanceLicence: jour(x.cabinet.licence?.dateExpiration ?? null),
      licenceSuspendue: x.cabinet.licence?.statut === 'SUSPENDUE',
      factures: x.factures.map((f) => ({
        id: f.id,
        periode: f.periode,
        montantUsd: Number(f.montantUsd),
        numero: f.facture.numeroSerie,
        emiseLe: jour(f.facture.dateFacture),
        payeeLe: jour(f.payeeLe),
        joursImpayee: f.payeeLe ? null : joursDepuis(jour(f.facture.dateFacture)!, aujourdhuiKinshasa()),
      })),
    }));
  }

  async enregistrer(d: DemandeAbonnement) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.debut)) throw new BadRequestException('Date de début illisible.');
    if (!Number.isInteger(d.dossiersSupplementaires) || d.dossiersSupplementaires < 0) {
      throw new BadRequestException('Le nombre de dossiers supplémentaires est un entier positif ou nul.');
    }
    const editeur = await this.dossierEditeur();
    if (d.cabinetId === editeur) throw new BadRequestException('Le dossier de l’éditeur ne s’abonne pas à lui-même.');
    const cabinet = await this.prisma.tenant.findUnique({ where: { id: d.cabinetId }, select: { id: true } });
    if (!cabinet) throw new NotFoundException('Cabinet introuvable.');
    const tiers = await this.prisma.tiers.findFirst({ where: { id: d.tiersId, tenantId: editeur }, select: { id: true } });
    if (!tiers) throw new BadRequestException('Le client facturé doit être un tiers du dossier de l’éditeur.');
    const formule = await this.prisma.formuleAbonnement.findUnique({ where: { code: d.formuleCode } });
    if (!formule || formule.type !== 'FORMULE') throw new BadRequestException('Formule introuvable.');
    const options = await this.prisma.formuleAbonnement.findMany({ where: { code: { in: d.options } } });
    if (options.length !== new Set(d.options).size || options.some((o) => o.type !== 'OPTION')) {
      throw new BadRequestException('Une option demandée n’existe pas.');
    }
    const data = {
      formuleId: formule.id,
      dossiersSupplementaires: d.dossiersSupplementaires,
      periodicite: d.periodicite,
      debut: new Date(`${d.debut}T00:00:00Z`),
      finEssai: d.essai ? new Date(`${finEssaiDepuis(d.debut)}T00:00:00Z`) : null,
      tiersId: d.tiersId,
    };
    // La licence d'abord · un dossier perpétuel refuse, et rien n'est écrit.
    // Fin de l'essai (ou début) plus le délai de paiement ; jamais reculée.
    await this.plateforme.echeanceAbonnement(d.cabinetId, expirationInitiale(d.debut, data.finEssai ? finEssaiDepuis(d.debut) : null));
    const existant = await this.prisma.abonnementCabinet.findUnique({ where: { cabinetId: d.cabinetId }, select: { id: true } });
    const a = existant
      ? await this.prisma.abonnementCabinet.update({ where: { id: existant.id }, data })
      : await this.prisma.abonnementCabinet.create({ data: { ...data, cabinetId: d.cabinetId } });
    await this.prisma.optionAbonnement.deleteMany({ where: { abonnementId: a.id } });
    if (options.length) {
      await this.prisma.optionAbonnement.createMany({ data: options.map((o) => ({ abonnementId: a.id, formuleId: o.id })) });
    }
    return { id: a.id };
  }

  /**
   * Déclare l'encaissement d'une facture d'abonnement · c'est lui, et lui
   * seul, qui prolonge la licence du client. La date est celle que
   * l'opérateur constate ; elle ne peut être ni future ni antérieure à la
   * facture.
   */
  async marquerPayee(factureAbonnementId: string, payeeLe: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payeeLe)) throw new BadRequestException('Date d’encaissement illisible.');
    const fa = await this.prisma.factureAbonnement.findUnique({
      where: { id: factureAbonnementId },
      select: { id: true, periode: true, payeeLe: true, facture: { select: { dateFacture: true } }, abonnement: { select: { cabinetId: true, periodicite: true, cabinet: { select: { licence: { select: { dateExpiration: true } } } } } } },
    });
    if (!fa) throw new NotFoundException('Facture d’abonnement introuvable.');
    if (fa.payeeLe) throw new BadRequestException(`Cette facture est déjà déclarée payée le ${jour(fa.payeeLe)}.`);
    if (payeeLe > aujourdhuiKinshasa()) throw new BadRequestException('Un encaissement ne se déclare pas dans le futur.');
    if (payeeLe < jour(fa.facture.dateFacture)!) throw new BadRequestException('L’encaissement ne peut précéder la facture.');
    const echeance = expirationApresPaiement(fa.periode, fa.abonnement.periodicite, jour(fa.abonnement.cabinet.licence?.dateExpiration ?? null));
    // Le paiement n'est noté que sur une facture encore impayée · deux clics
    // simultanés ne prolongent pas deux fois.
    const { count } = await this.prisma.factureAbonnement.updateMany({ where: { id: fa.id, payeeLe: null }, data: { payeeLe: new Date(`${payeeLe}T00:00:00Z`) } });
    if (count === 0) throw new BadRequestException('Cette facture vient d’être déclarée payée.');
    const retenue = await this.plateforme.echeanceAbonnement(fa.abonnement.cabinetId, echeance);
    return { echeanceLicence: retenue };
  }

  async activer(id: string, actif: boolean) {
    await this.prisma.abonnementCabinet.update({ where: { id }, data: { actif } });
    return { id, actif };
  }

  /**
   * Facture une période pour tous les abonnements · chacun rend son verdict,
   * et un abonnement refusé (prix manquant, essai) n'empêche pas les autres.
   * Le cours manquant, lui, arrête tout · il vaut pour toutes les factures.
   */
  async facturer(operateurTenantId: string, periode: string, dateFacture: string, tauxTvaId: string | null) {
    const editeur = await this.dossierEditeur();
    // Les factures s'écrivent dans le dossier de l'éditeur · la session doit
    // y être, sans quoi la garde de cloisonnement refuserait d'y écrire et,
    // surtout, personne de ce dossier n'aurait signé l'émission.
    if (operateurTenantId !== editeur) {
      throw new BadRequestException('Connectez-vous au dossier de l’éditeur pour facturer les abonnements.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFacture)) throw new BadRequestException('Date de facture illisible.');
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: editeur }, select: { assujettiTva: true } });
    let taux: { id: string; taux: number } | null = null;
    if (t.assujettiTva) {
      if (!tauxTvaId) throw new BadRequestException('Le dossier de l’éditeur est assujetti à la TVA · choisissez le taux à appliquer.');
      const x = await this.prisma.tauxTva.findFirst({ where: { id: tauxTvaId, tenantId: editeur }, select: { id: true, taux: true } });
      if (!x) throw new BadRequestException('Taux de TVA introuvable dans le dossier de l’éditeur.');
      taux = { id: x.id, taux: Number(x.taux) };
    }
    const jourCours = new Date(`${dateFacture}T00:00:00Z`);
    const cote = await this.prisma.coursDevise.findFirst({
      where: { date: jourCours, devise: { tenantId: editeur, code: 'USD' } },
      select: { cours: true },
    });
    if (!cote) {
      throw new BadRequestException(
        `Aucun cours du dollar américain (USD) n'est renseigné au ${jourLisible(jourCours)} dans le dossier de l'éditeur · ` +
          'les prix en dollars se convertissent au cours du jour de la facture, à saisir dans Devises. Le cours d’un autre jour n’est jamais repris.',
      );
    }
    const cours = Number(cote.cours);

    const abonnements = await this.prisma.abonnementCabinet.findMany({
      include: { cabinet: { select: { nom: true } }, formule: true, options: { include: { formule: true } }, factures: { where: { periode }, select: { id: true } } },
    });
    const resultats: { cabinet: string; statut: 'FACTURE' | 'DEJA_FACTURE' | 'NON_DU'; motif?: string; numero?: string; totalUsd?: number }[] = [];
    for (const a of abonnements) {
      if (a.factures.length) {
        resultats.push({ cabinet: a.cabinet.nom, statut: 'DEJA_FACTURE' });
        continue;
      }
      const prix = (f: typeof a.formule): FormulePrix => ({
        code: f.code,
        libelle: f.libelle,
        type: f.type,
        prixMensuelUsd: nombre(f.prixMensuelUsd),
        prixAnnuelUsd: nombre(f.prixAnnuelUsd),
      });
      const entree: AbonnementAFacturer = {
        formule: prix(a.formule),
        options: a.options.map((o) => prix(o.formule)),
        dossiersSupplementaires: a.dossiersSupplementaires,
        periodicite: a.periodicite,
        debut: jour(a.debut)!,
        finEssai: jour(a.finEssai),
        actif: a.actif,
      };
      const v = verdictPeriode(entree, periode);
      if (!v.du) {
        resultats.push({ cabinet: a.cabinet.nom, statut: 'NON_DU', motif: v.motif });
        continue;
      }
      const existants = await this.prisma.facture.findMany({
        where: { tenantId: editeur, sens: SensFacture.VENTE, numeroSerie: { startsWith: `VMG-${dateFacture.slice(0, 4)}-` } },
        select: { numeroSerie: true },
      });
      const numero = numeroFactureSuivant(dateFacture.slice(0, 4), existants.map((e) => e.numeroSerie));
      const lignes = v.lignes.map((l) => {
        const pu = usdEnFc(l.prixUnitaireUsd, cours);
        const ht = Math.round(pu * l.quantite * 100) / 100;
        return {
          designation: `${l.designation} · ${l.prixUnitaireUsd} USD au cours de ${cours} FC du ${dateFacture}`,
          quantite: l.quantite,
          prixUnitaire: pu,
          montantHT: ht,
          imposable: taux !== null,
          tauxTvaId: taux?.id,
          tauxApplique: taux?.taux,
          montantTva: taux ? Math.round(ht * taux.taux) / 100 : 0,
        };
      });
      const f = await this.facturation.enregistrer(editeur, {
        sens: SensFacture.VENTE,
        numeroSerie: numero,
        dateFacture,
        tiersId: a.tiersId,
        lignes,
      });
      try {
        await this.prisma.factureAbonnement.create({
          data: { abonnementId: a.id, periode, factureId: f.id, montantUsd: new Prisma.Decimal(v.totalUsd), cours: new Prisma.Decimal(cours) },
        });
      } catch (e) {
        // Un second clic a facturé la même période entre-temps · la pièce
        // en double est retirée, jamais laissée orpheline dans le facturier.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          await this.facturation.supprimer(editeur, f.id);
          resultats.push({ cabinet: a.cabinet.nom, statut: 'DEJA_FACTURE' });
          continue;
        }
        throw e;
      }
      resultats.push({ cabinet: a.cabinet.nom, statut: 'FACTURE', numero, totalUsd: v.totalUsd });
    }
    return { periode, cours, assujetti: t.assujettiTva, resultats };
  }
}

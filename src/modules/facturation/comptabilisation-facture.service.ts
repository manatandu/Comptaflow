import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SensFacture, TypeJournal } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ecritureDeFacture } from './ecriture-facture';

export interface DemandeComptabilisation {
  journalId: string;
  compteGestionId: string | null;
  /** Compte de gestion par ligne de la facture (identifiant de ligne → compte), s'il diffère. */
  comptesParLigne?: Record<string, string>;
}

/**
 * PASSER L'ÉCRITURE D'UNE FACTURE · au brouillard, par le chemin de saisie
 * ordinaire (`EcritureService.creer`), si bien que la numérotation du
 * journal, la date dans l'exercice, les clôtures et le double regard
 * s'appliquent comme à toute écriture. La facture est ensuite LIÉE à
 * l'écriture, un pour un · une facture déjà liée ne se passe pas deux fois.
 */
@Injectable()
export class ComptabilisationFactureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
  ) {}

  async comptabiliser(tenantId: string, userId: string, factureId: string, d: DemandeComptabilisation) {
    const f = await this.prisma.facture.findFirst({
      where: { id: factureId, tenantId },
      include: {
        lignes: { orderBy: { ordre: 'asc' }, include: { tauxTva: { select: { compteCollecteId: true, compteDeductibleId: true } } } },
        tiers: { select: { comptesRattaches: { where: { estPrincipal: true }, select: { compteId: true }, take: 1 } } },
      },
    });
    if (!f) throw new NotFoundException('Facture introuvable dans ce dossier.');
    if (f.ecritureId) throw new BadRequestException('Cette facture est déjà liée à une écriture · elle ne se passe pas deux fois.');

    const journal = await this.prisma.journal.findFirst({ where: { id: d.journalId, tenantId }, select: { type: true } });
    const typeAttendu = f.sens === SensFacture.VENTE ? TypeJournal.VENTES : TypeJournal.ACHATS;
    if (!journal) throw new NotFoundException('Journal introuvable dans ce dossier.');
    if (journal.type !== typeAttendu) {
      throw new BadRequestException(`Une facture ${f.sens === SensFacture.VENTE ? 'de vente' : 'd’achat'} se passe dans un journal ${f.sens === SensFacture.VENTE ? 'de ventes' : 'd’achats'}.`);
    }

    // Le compte de gestion doit être de la classe que le sens appelle · un
    // produit sur une vente, une charge ou une immobilisation sur un achat.
    const choisis = [d.compteGestionId, ...Object.values(d.comptesParLigne ?? {})].filter((x): x is string => !!x);
    const comptes = await this.prisma.compte.findMany({ where: { id: { in: choisis }, tenantId }, select: { id: true, numero: true } });
    for (const id of choisis) {
      const c = comptes.find((x) => x.id === id);
      if (!c) throw new NotFoundException('Compte introuvable dans ce dossier.');
      const ok = f.sens === SensFacture.VENTE ? c.numero.startsWith('7') : c.numero.startsWith('6') || c.numero.startsWith('2');
      if (!ok) {
        throw new BadRequestException(
          `Le compte ${c.numero} n’est pas ${f.sens === SensFacture.VENTE ? 'un compte de produit (classe 7)' : 'un compte de charge (classe 6) ni d’immobilisation (classe 2)'}.`,
        );
      }
    }

    const p = ecritureDeFacture(
      {
        sens: f.sens,
        nature: f.nature,
        numeroSerie: f.numeroSerie,
        contrepartieNom: f.contrepartieNom,
        compteTiersId: f.tiers?.comptesRattaches[0]?.compteId ?? null,
        autresImpotsEtTaxes: f.autresImpotsEtTaxes === null ? null : Number(f.autresImpotsEtTaxes),
        lignes: f.lignes.map((l) => ({
          designation: l.designation,
          montantHT: Number(l.montantHT),
          montantTva: Number(l.montantTva),
          tauxTvaId: l.tauxTvaId,
          compteTvaId: (f.sens === SensFacture.VENTE ? l.tauxTva?.compteCollecteId : l.tauxTva?.compteDeductibleId) ?? null,
          compteGestionId: d.comptesParLigne?.[l.id] ?? null,
        })),
      },
      d.compteGestionId,
    );
    if ('refus' in p) throw new BadRequestException(p.refus);

    const date = f.dateFacture.toISOString().slice(0, 10);
    const exercice = await this.prisma.exercice.findFirst({
      where: { tenantId, dateDebut: { lte: f.dateFacture }, dateFin: { gte: f.dateFacture } },
      select: { id: true },
    });
    if (!exercice) throw new BadRequestException(`Aucun exercice ne couvre le ${date}, date de la facture.`);

    const e = (await this.ecritures.creer(tenantId, userId, {
      exerciceId: exercice.id,
      journalId: d.journalId,
      date,
      libelle: p.libelle,
      reference: f.numeroSerie,
      lignes: p.lignes,
    })) as { id: string };

    // Le lien se pose SUR une facture encore libre · un second clic entre la
    // lecture et ici retire l'écriture qu'il vient de créer.
    const { count } = await this.prisma.facture.updateMany({ where: { id: f.id, tenantId, ecritureId: null }, data: { ecritureId: e.id } });
    if (count === 0) {
      await this.prisma.ecriture.delete({ where: { id: e.id } });
      throw new BadRequestException('Cette facture vient d’être liée à une autre écriture · rien n’a été passé.');
    }
    return { ecritureId: e.id, lignes: p.lignes.length };
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CourrierService, ORIGINE_FACTURE_ABONNEMENT, ORIGINE_LICENCE_SUR_SITE, ResultatMiseEnFile } from '../courrier/courrier.service';
import { totauxFacture } from '../facturation/mentions-facture';
import type { MentionsRecopiees } from '../tenant/mentions-societe';
import { courrielFactureAbonnement, courrielLicenceSurSite } from './courriels-editeur';

export interface Expediteur {
  tenantId: string;
  userId: string;
}

const nombre = (d: { toString(): string } | null) => (d === null ? 0 : Number(d.toString()));
const jour = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * L'ENVOI DES PIÈCES DE L'ÉDITEUR · la facture d'abonnement à son client, la
 * licence sur site à son titulaire. Rien ne part sans passer par la file
 * (`CourrierService`) · une messagerie absente n'annule pas l'envoi décidé,
 * il attend en file et se reprend depuis la fenêtre Courrier.
 */
@Injectable()
export class CourrielsEditeurService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courrier: CourrierService,
  ) {}

  async envoyerLicence(qui: Expediteur, id: string, destinataire: string, destinataireNom: string | null = null): Promise<ResultatMiseEnFile> {
    const l = await this.prisma.licenceSurSiteEmise.findUnique({ where: { id } });
    if (!l) throw new NotFoundException('Licence introuvable.');
    const c = courrielLicenceSurSite(l);
    return this.courrier.mettreEnFile(qui.tenantId, {
      destinataire,
      destinataireNom,
      sujet: c.sujet,
      corps: c.corps,
      pieceJointe: c.pieceJointe,
      origine: ORIGINE_LICENCE_SUR_SITE,
      origineId: l.id,
      createdBy: qui.userId,
    });
  }

  /**
   * L'adresse est celle saisie, sinon celle du tiers facturé · aucune adresse,
   * et rien n'est mis en file plutôt que d'envoyer à personne.
   */
  async envoyerFacture(qui: Expediteur, factureAbonnementId: string, destinataire: string | null = null): Promise<ResultatMiseEnFile> {
    const fa = await this.prisma.factureAbonnement.findUnique({
      where: { id: factureAbonnementId },
      select: {
        id: true,
        periode: true,
        montantUsd: true,
        cours: true,
        abonnement: { select: { cabinet: { select: { licence: { select: { dateExpiration: true } } } } } },
        facture: {
          select: {
            tenantId: true,
            numeroSerie: true,
            dateFacture: true,
            emetteurNom: true,
            mentionsSocieteEmetteur: true,
            contrepartieNom: true,
            tiers: { select: { email: true, nom: true } },
            lignes: { orderBy: { ordre: 'asc' }, select: { designation: true, quantite: true, prixUnitaire: true, montantHT: true, montantTva: true, imposable: true } },
          },
        },
      },
    });
    if (!fa) throw new NotFoundException('Facture d’abonnement introuvable.');
    // Le message vit dans le dossier qui a émis la pièce · la session doit y
    // être, comme pour facturer.
    if (fa.facture.tenantId !== qui.tenantId) {
      throw new BadRequestException('Connectez-vous au dossier de l’éditeur pour envoyer ses factures.');
    }
    const adresse = (destinataire ?? '').trim() || fa.facture.tiers?.email?.trim() || '';
    if (!adresse) {
      throw new BadRequestException(
        `Le client ${fa.facture.contrepartieNom} n’a pas d’adresse de courriel · renseignez-la sur sa fiche dans le plan des tiers, ou saisissez-la.`,
      );
    }
    const lignes = fa.facture.lignes.map((l) => ({
      designation: l.designation,
      quantite: nombre(l.quantite),
      prixUnitaire: nombre(l.prixUnitaire),
      montantHT: nombre(l.montantHT),
      montantTva: nombre(l.montantTva),
      imposable: l.imposable,
    }));
    const c = courrielFactureAbonnement({
      numeroSerie: fa.facture.numeroSerie,
      dateFacture: jour(fa.facture.dateFacture)!,
      periode: fa.periode,
      emetteurNom: fa.facture.emetteurNom,
      mentionsLigne: (fa.facture.mentionsSocieteEmetteur as MentionsRecopiees | null)?.ligne ?? null,
      contrepartieNom: fa.facture.contrepartieNom,
      lignes,
      totaux: totauxFacture({ lignes: lignes.map((l) => ({ ...l, tauxApplique: null })) }),
      montantUsd: nombre(fa.montantUsd),
      cours: nombre(fa.cours),
      echeanceLicence: jour(fa.abonnement.cabinet.licence?.dateExpiration ?? null),
    });
    return this.courrier.mettreEnFile(qui.tenantId, {
      destinataire: adresse,
      destinataireNom: fa.facture.tiers?.nom ?? fa.facture.contrepartieNom,
      sujet: c.sujet,
      corps: c.corps,
      origine: ORIGINE_FACTURE_ABONNEMENT,
      origineId: fa.id,
      createdBy: qui.userId,
    });
  }
}

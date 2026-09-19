import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EtatConsignation, SensConsignation } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  lignesDeLaConsignation,
  lignesDuDenouement,
  type Consignation as ConsignationCalcul,
  type ModeDenouement,
} from './consignation';
import { CreerConsignationDto, DenouerConsignationDto } from './dto/consignation.dto';

const ETAT_PAR_MODE: Record<ModeDenouement, EtatConsignation> = {
  RESTITUTION: EtatConsignation.RESTITUEE,
  CONSERVATION: EtatConsignation.CONSERVEE,
  REPRISE_PRIX_INFERIEUR: EtatConsignation.REPRISE_SOUS_PRIX,
};

/**
 * LE REGISTRE DES CONSIGNATIONS · ce qui est parti, ce qui est revenu, et ce
 * qui attend encore.
 *
 * COMMUN AUX DEUX RÉFÉRENTIELS, et ce n'est pas un oubli du cloisonnement
 * (CLAUDE.md § 6) : les deux textes écrivent la consignation dans les mêmes
 * termes, aux fiches de leurs comptes 40 et 41. Ce qui les sépare est le seul
 * compte de PRODUIT, tranché dans `nomenclature-emballages.ts`.
 *
 * IL PROPOSE, IL NE POSTE PAS. Les lignes sont rendues au comptable, qui les
 * passe · même parti que la variation de stocks et que le boni d'inventaire.
 */
@Injectable()
export class EmballagesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * LES CONSIGNATIONS EN COURS SONT RENDUES À PART, ET C'EST LE CŒUR DU
   * REGISTRE. Un 4194 laissé en l'état à la clôture est une dette envers un
   * client qui, peut-être, ne rendra jamais l'emballage · le total des
   * consignations non dénouées est exactement ce qui reste à qualifier, et
   * aucune balance ne peut le dire, puisqu'elle boucle.
   */
  async lister(tenantId: string) {
    const [consignations, tenant] = await Promise.all([
      this.prisma.consignation.findMany({
        where: { tenantId },
        include: { tiers: { select: { code: true, nom: true } } },
        orderBy: [{ etat: 'asc' }, { dateConsignation: 'desc' }],
      }),
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { referentiel: true },
      }),
    ]);

    const enCours = consignations.filter((c) => c.etat === EtatConsignation.EN_COURS);
    const somme = (sens: SensConsignation) =>
      enCours
        .filter((c) => c.sens === sens)
        .reduce((t, c) => t + Number(c.montant), 0);

    return {
      referentiel: tenant.referentiel,
      consignations: consignations.map((c) => ({
        id: c.id,
        tiers: c.tiers,
        sens: c.sens,
        nature: c.nature,
        designation: c.designation,
        quantite: c.quantite === null ? null : Number(c.quantite),
        dateConsignation: c.dateConsignation.toISOString().slice(0, 10),
        montant: Number(c.montant),
        etat: c.etat,
        dateDenouement: c.dateDenouement?.toISOString().slice(0, 10) ?? null,
        prixDeReprise: c.prixDeReprise === null ? null : Number(c.prixDeReprise),
        ecritureConsignationId: c.ecritureConsignationId,
        ecritureDenouementId: c.ecritureDenouementId,
      })),
      enAttente: {
        nombre: enCours.length,
        // ÉMISES · ce que l'entité DOIT à ses clients (4194). REÇUES · ce
        // qu'elle a en CRÉANCE sur ses fournisseurs (4094). Les additionner
        // ferait un total qui ne veut rien dire : les deux sont de sens
        // opposés au bilan.
        detteEmise: somme(SensConsignation.EMISE),
        creanceRecue: somme(SensConsignation.RECUE),
      },
    };
  }

  async creer(tenantId: string, userId: string, dto: CreerConsignationDto) {
    const tiers = await this.prisma.tiers.findFirst({
      where: { id: dto.tiersId, tenantId },
      select: { id: true },
    });
    if (!tiers) throw new NotFoundException('Tiers introuvable dans ce dossier.');

    const consignation = await this.prisma.consignation.create({
      data: {
        tenantId,
        tiersId: dto.tiersId,
        sens: dto.sens,
        nature: dto.nature,
        designation: dto.designation.trim(),
        quantite: dto.quantite ?? null,
        dateConsignation: new Date(dto.dateConsignation),
        montant: dto.montant,
        createdBy: userId,
      },
    });
    return { consignation, proposition: await this.propositionOuverture(tenantId, consignation.id) };
  }

  /** Les lignes de l'écriture d'ouverture du compte d'attente. */
  async propositionOuverture(tenantId: string, consignationId: string) {
    const { calcul, referentiel } = await this.chargerPourCalcul(tenantId, consignationId);
    return lignesDeLaConsignation(calcul, referentiel);
  }

  /**
   * Les lignes du dénouement, SANS RIEN ENREGISTRER · l'écran les montre
   * avant que le comptable ne décide.
   */
  async propositionDenouement(
    tenantId: string,
    consignationId: string,
    mode: ModeDenouement,
    prixDeReprise?: number | null,
  ) {
    const { calcul, referentiel } = await this.chargerPourCalcul(tenantId, consignationId);
    return lignesDuDenouement(calcul, mode, referentiel, prixDeReprise);
  }

  /**
   * Dénoue la consignation au registre.
   *
   * LE REFUS DU CALCUL EST OPPOSABLE ICI AUSSI · si la règle refuse (un prix
   * de reprise manquant, une cession d'immobilisation), l'état du registre ne
   * bouge pas. Le marquer « conservée » tout en refusant l'écriture laisserait
   * le registre en avance sur les livres, et le 4194 resterait ouvert sans que
   * la liste des consignations en attente le montre encore.
   */
  async denouer(
    tenantId: string,
    consignationId: string,
    dto: DenouerConsignationDto,
  ) {
    const { calcul, referentiel, etat } = await this.chargerPourCalcul(tenantId, consignationId);
    if (etat !== EtatConsignation.EN_COURS) {
      throw new BadRequestException(
        `Cette consignation est déjà dénouée (${etat}). Un dénouement ne se rejoue pas · il ` +
          "faudrait d'abord défaire l'écriture passée, ce qui appartient au journal.",
      );
    }

    const proposition = lignesDuDenouement(calcul, dto.mode, referentiel, dto.prixDeReprise);
    if (proposition.refus) {
      throw new BadRequestException(proposition.refus.explication);
    }

    const consignation = await this.prisma.consignation.update({
      where: { id: consignationId },
      data: {
        etat: ETAT_PAR_MODE[dto.mode],
        dateDenouement: new Date(dto.dateDenouement),
        prixDeReprise: dto.mode === 'REPRISE_PRIX_INFERIEUR' ? (dto.prixDeReprise ?? null) : null,
      },
    });
    return { consignation, proposition };
  }

  /**
   * LE COMPTE DU TIERS VIENT DE SON COMPTE RATTACHÉ PRINCIPAL, jamais d'un
   * numéro écrit en dur. Le plan des tiers du dossier est la seule source qui
   * sache sur quel 401 ou 411 ce tiers est tenu · un littéral ici enverrait
   * toutes les consignations sur le même compte collectif.
   */
  private async chargerPourCalcul(tenantId: string, consignationId: string) {
    const c = await this.prisma.consignation.findFirst({
      where: { id: consignationId, tenantId },
      include: {
        tiers: {
          select: {
            nom: true,
            comptesRattaches: {
              select: { estPrincipal: true, compte: { select: { numero: true, intitule: true } } },
            },
          },
        },
      },
    });
    if (!c) throw new NotFoundException('Consignation introuvable dans ce dossier.');

    const rattaches = c.tiers.comptesRattaches;
    const principal = rattaches.find((r) => r.estPrincipal) ?? rattaches[0];
    if (!principal) {
      throw new BadRequestException(
        `Le tiers « ${c.tiers.nom} » n'a aucun compte rattaché. Une consignation s'ouvre CONTRE ` +
          "un tiers : sans son compte, il n'y a pas d'écriture à proposer. Rattachez-lui un " +
          'compte au plan des tiers.',
      );
    }

    const { referentiel } = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true },
    });

    const calcul: ConsignationCalcul = {
      sens: c.sens === SensConsignation.EMISE ? 'EMISE' : 'RECUE',
      nature: c.nature === 'EMBALLAGE' ? 'EMBALLAGE' : 'MATERIEL',
      compteTiers: principal.compte.numero,
      intituleTiers: principal.compte.intitule,
      montant: Number(c.montant),
      designation: c.designation,
    };
    return { calcul, referentiel, etat: c.etat };
  }
}

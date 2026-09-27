import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EtatConsignation, Referentiel, SensConsignation, StatutEcriture } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  lignesDeLaConsignation,
  lignesDuDenouement,
  type Consignation as ConsignationCalcul,
  type ModeDenouement,
} from './consignation';
import { CreerConsignationDto, DenouerConsignationDto } from './dto/consignation.dto';
import { compteDuRole } from './nomenclature-emballages';
import { decrireLigne, lignesManquantes, type LigneDeLEcriture } from '../comptabilite/rattachement-ecriture';

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
    return {
      calcul,
      referentiel,
      etat: c.etat,
      prixDeReprise: c.prixDeReprise === null ? null : Number(c.prixDeReprise),
      liens: {
        OUVERTURE: c.ecritureConsignationId,
        DENOUEMENT: c.ecritureDenouementId,
      } as Record<RoleEcritureConsignation, string | null>,
    };
  }

  /**
   * Les lignes que l'écriture rattachée doit porter, RECALCULÉES ici et
   * jamais reçues du client · même discipline que la confirmation d'un
   * pré-lettrage. Au dénouement, le mode se relit sur l'état enregistré et le
   * prix de reprise sur le registre : c'est ce dénouement-là, et aucun autre,
   * que l'écriture doit passer.
   */
  private async lignesAttendues(tenantId: string, consignationId: string, role: RoleEcritureConsignation) {
    const charge = await this.chargerPourCalcul(tenantId, consignationId);
    if (role === 'OUVERTURE') {
      return { charge, proposition: lignesDeLaConsignation(charge.calcul, charge.referentiel) };
    }
    if (charge.etat === EtatConsignation.EN_COURS) {
      throw new BadRequestException(
        "Cette consignation n'est pas dénouée au registre · une écriture de dénouement ne se rattache " +
          "qu'à un dénouement enregistré, sans quoi le registre dirait la consignation ouverte pendant " +
          'que son compte d\'attente est déjà soldé.',
      );
    }
    return {
      charge,
      proposition: lignesDuDenouement(
        charge.calcul,
        MODE_PAR_ETAT[charge.etat],
        charge.referentiel,
        charge.prixDeReprise,
      ),
    };
  }

  /**
   * Les écritures du dossier qui portent ce que la proposition demande, pour
   * le sélecteur de l'écran. Le premier filtre est posé en base sur la ligne
   * du compte d'attente (4094 ou 4194), du bon sens et du bon montant · le
   * reste de la proposition est vérifié par la même règle que le rattachement
   * (`lignesManquantes`), si bien que le sélecteur ne propose jamais une
   * écriture que le rattachement refuserait.
   */
  async ecrituresCandidates(tenantId: string, consignationId: string, roleBrut: string) {
    const role = roleEcriture(roleBrut);
    const { charge, proposition } = await this.lignesAttendues(tenantId, consignationId, role);
    if (proposition.refus) return [];
    const attente = proposition.lignes.find(
      (l) => l.compte === compteDAttente(charge.calcul, charge.referentiel),
    );
    if (!attente) return [];
    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        ecriture: { tenantId, estGenereeParCloture: false },
        compte: { numero: { startsWith: attente.compte } },
        ...(attente.sens === 'DEBIT' ? { debit: attente.montant } : { credit: attente.montant }),
      },
      select: { ecritureId: true },
      take: 200,
    });
    const ids = [...new Set(lignes.map((l) => l.ecritureId))];
    if (ids.length === 0) return [];
    const [ecritures, dejaPrises] = await Promise.all([
      this.prisma.ecriture.findMany({
        where: { tenantId, id: { in: ids } },
        orderBy: [{ date: 'desc' }],
        select: {
          id: true,
          date: true,
          numeroPiece: true,
          libelle: true,
          statut: true,
          lignes: { select: { debit: true, credit: true, compte: { select: { numero: true } } } },
        },
      }),
      this.prisma.consignation.findMany({
        where: {
          tenantId,
          OR: [{ ecritureConsignationId: { in: ids } }, { ecritureDenouementId: { in: ids } }],
        },
        select: { ecritureConsignationId: true, ecritureDenouementId: true },
      }),
    ]);
    const prises = new Set(dejaPrises.flatMap((c) => [c.ecritureConsignationId, c.ecritureDenouementId]));
    return ecritures
      .filter((e) => !prises.has(e.id))
      .filter((e) => lignesManquantes(proposition.lignes, lignesDe(e.lignes)).length === 0)
      .map((e) => ({
        id: e.id,
        date: e.date.toISOString().slice(0, 10),
        numeroPiece: e.numeroPiece,
        libelle: e.libelle,
        statut: e.statut,
      }));
  }

  /**
   * LE LIEN NAÎT ICI, ET NULLE PART AILLEURS · audit du serveur de 2026-09,
   * I2. Le module propose et ne poste pas (le comptable passe la pièce au
   * journal, où il peut la compléter d'une TVA que le module ne pose pas) :
   * seul ce geste peut donc désigner l'écriture. Sans lui, les deux colonnes
   * n'étaient jamais écrites, le refus de `verifierAucunModuleNeLaTient` sur
   * la consignation ne pouvait pas se déclencher, et la pièce qui solde le
   * 4194 se supprimait au journal pendant que le registre la disait passée.
   *
   * TROIS REFUS. L'écriture doit être de CE dossier (cherchée par le couple,
   * jamais par l'id seul, qui ferait de la clé étrangère un oracle
   * d'existence chez le voisin, audit F5). Elle doit porter chaque ligne
   * proposée (`lignesManquantes`), le message nommant celles qui manquent.
   * Et elle ne tient pas déjà une autre consignation · une seule ligne au
   * 4194 ne justifie pas deux dettes.
   *
   * LE LIEN SE POSE SUR UNE COLONNE ENCORE LIBRE (`updateMany` conditionné à
   * null, comme les marqueurs posés après `creer`). Aucune compensation à
   * faire au perdant · le geste ne crée aucune écriture, il en désigne une
   * qui existait avant lui et qui reste au journal.
   */
  async rattacherEcriture(tenantId: string, consignationId: string, roleBrut: string, ecritureId: string) {
    const role = roleEcriture(roleBrut);
    const { charge, proposition } = await this.lignesAttendues(tenantId, consignationId, role);
    if (proposition.refus) throw new BadRequestException(proposition.refus.explication);
    if (charge.liens[role] !== null) {
      throw new BadRequestException(
        `Une écriture ${LIBELLE_ROLE[role]} est déjà rattachée à cette consignation · détachez-la d'abord.`,
      );
    }
    const ecriture = await this.prisma.ecriture.findFirst({
      where: { id: ecritureId, tenantId },
      select: {
        id: true,
        estGenereeParCloture: true,
        lignes: { select: { debit: true, credit: true, compte: { select: { numero: true } } } },
      },
    });
    if (!ecriture) throw new NotFoundException("L'écriture indiquée n'existe pas dans ce dossier.");
    if (ecriture.estGenereeParCloture) {
      throw new BadRequestException(
        'Une écriture de clôture ou de report à nouveau ne passe aucune consignation · elle reprend des soldes.',
      );
    }
    const manquantes = lignesManquantes(proposition.lignes, lignesDe(ecriture.lignes));
    if (manquantes.length > 0) {
      throw new BadRequestException(
        `Cette écriture ne passe pas l'écriture ${LIBELLE_ROLE[role]} proposée · il lui manque ` +
          `${manquantes.map(decrireLigne).join(', ')}. Rattachée quand même, le registre se dirait ` +
          'comptabilisé sur une pièce qui passe autre chose.',
      );
    }
    const autre = await this.prisma.consignation.count({
      where: { tenantId, OR: [{ ecritureConsignationId: ecritureId }, { ecritureDenouementId: ecritureId }] },
    });
    if (autre > 0) {
      throw new BadRequestException(
        "Cette écriture est déjà rattachée à une consignation · une même ligne au compte d'attente ne " +
          'justifie pas deux consignations.',
      );
    }
    // Les deux colonnes sont NOMMÉES dans l'appel, jamais calculées · le spec
    // `liaisons-ecriture-ecrites.spec.ts` cherche chaque colonne dans le
    // `data` d'une écriture Prisma, et une clé calculée le rendrait aveugle.
    const { count } = await this.prisma.consignation.updateMany({
      where:
        role === 'OUVERTURE'
          ? { id: consignationId, tenantId, ecritureConsignationId: null }
          : { id: consignationId, tenantId, ecritureDenouementId: null },
      data: role === 'OUVERTURE' ? { ecritureConsignationId: ecritureId } : { ecritureDenouementId: ecritureId },
    });
    if (count === 0) {
      throw new BadRequestException(
        `Une écriture ${LIBELLE_ROLE[role]} vient d'être rattachée à cette consignation par une autre demande.`,
      );
    }
    return { rattache: true, role, ecritureId };
  }

  /**
   * DÉTACHER, TANT QUE L'ÉCRITURE EST AU BROUILLARD, et seulement alors. Le
   * lien retient la pièce au journal (elle ne s'y supprime ni ne s'y modifie
   * plus), si bien qu'une pièce rattachée par erreur resterait bloquée sans
   * ce geste. Validée, elle est entrée au livre-journal (AUDCIF art. 22, 2°)
   * et le lien est la trace de ce qui a passé la consignation · même borne
   * que la passation de la paie, qui ne se défait qu'au brouillard.
   */
  async detacherEcriture(tenantId: string, consignationId: string, roleBrut: string) {
    const role = roleEcriture(roleBrut);
    const c = await this.prisma.consignation.findFirst({
      where: { id: consignationId, tenantId },
      select: { ecritureConsignationId: true, ecritureDenouementId: true },
    });
    if (!c) throw new NotFoundException('Consignation introuvable dans ce dossier.');
    const ecritureId = role === 'OUVERTURE' ? c.ecritureConsignationId : c.ecritureDenouementId;
    if (ecritureId === null) {
      throw new BadRequestException(`Aucune écriture ${LIBELLE_ROLE[role]} n'est rattachée à cette consignation.`);
    }
    const ecriture = await this.prisma.ecriture.findFirst({
      where: { id: ecritureId, tenantId },
      select: { statut: true },
    });
    if (ecriture && ecriture.statut !== StatutEcriture.BROUILLARD) {
      throw new BadRequestException(
        "L'écriture rattachée est validée · elle est entrée au livre-journal (AUDCIF art. 22, 2°), et " +
          'son lien est la trace de ce qui a passé la consignation. Il ne se défait plus.',
      );
    }
    const { count } = await this.prisma.consignation.updateMany({
      where:
        role === 'OUVERTURE'
          ? { id: consignationId, tenantId, ecritureConsignationId: ecritureId }
          : { id: consignationId, tenantId, ecritureDenouementId: ecritureId },
      data: role === 'OUVERTURE' ? { ecritureConsignationId: null } : { ecritureDenouementId: null },
    });
    if (count === 0) {
      throw new BadRequestException('Le lien a changé entre-temps · rechargez le registre.');
    }
    return { detache: true, role };
  }
}

/**
 * Les deux écritures d'une consignation · OUVERTURE va au
 * `ecritureConsignationId`, DENOUEMENT au `ecritureDenouementId`.
 */
export type RoleEcritureConsignation = 'OUVERTURE' | 'DENOUEMENT';

const LIBELLE_ROLE: Record<RoleEcritureConsignation, string> = {
  OUVERTURE: "d'ouverture",
  DENOUEMENT: 'de dénouement',
};

/** Le dénouement enregistré, relu depuis l'état du registre. */
const MODE_PAR_ETAT: Record<Exclude<EtatConsignation, 'EN_COURS'>, ModeDenouement> = {
  RESTITUEE: 'RESTITUTION',
  CONSERVEE: 'CONSERVATION',
  REPRISE_SOUS_PRIX: 'REPRISE_PRIX_INFERIEUR',
};

function roleEcriture(brut: string): RoleEcritureConsignation {
  const role = String(brut).toUpperCase();
  if (role !== 'OUVERTURE' && role !== 'DENOUEMENT') {
    throw new BadRequestException("Le rôle de l'écriture est « ouverture » ou « denouement ».");
  }
  return role;
}

/** Le compte d'attente de la consignation · 4194 émise, 4094 reçue. */
function compteDAttente(c: ConsignationCalcul, referentiel: Referentiel): string {
  return compteDuRole(c.sens === 'EMISE' ? 'DETTE_CONSIGNATION' : 'CREANCE_CONSIGNATION', referentiel).numero;
}

function lignesDe(lignes: { debit: unknown; credit: unknown; compte: { numero: string } }[]): LigneDeLEcriture[] {
  return lignes.map((l) => ({ numero: l.compte.numero, debit: Number(l.debit), credit: Number(l.credit) }));
}

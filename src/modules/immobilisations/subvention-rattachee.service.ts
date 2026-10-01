import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  JeuEtatsFinanciersSycebnl,
  MethodeDepreciationBienSubventionne,
  Prisma,
  StatutImmobilisation,
  TypeCompteDetailTotal,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { fondsDuCompte } from './reprise-subvention';
import { transactionJournalisee } from '../../common/audit/transaction-journalisee';
import { MethodeDepreciationSubventionDto, OctroiSubventionDto, RattacherSubventionDto, ReduireSubventionDto } from './dto/immobilisation.dto';
import {
  COMPTE_PERTES_AUTRES_DEBITEURS,
  COMPTE_REPRISE_SUBVENTION,
  CONTREPARTIES_OCTROI_PROPOSEES,
  motifRefusContrepartieOctroi,
  contrepartieRemboursementProposee,
  lignesReduction,
  motifRefusCompteSubvention,
  motifRefusContrepartieReduction,
  motifRefusReduction,
  motifRefusSansVentilation,
  ventilerAuProrata,
  type Ref,
} from './subvention-rattachee';

const n = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);
const centimes = (x: number) => Math.round(x * 100) / 100;

/** Plafond de la liste des rattachements · dit (`tronque`), jamais muet. */
const PLAFOND_LISTE = 500;

/**
 * LA SUBVENTION EN NUMÉRAIRE RATTACHÉE AU BIEN (lot 5) · le rattachement est
 * une DÉCLARATION, sans écriture (le 14 est déjà crédité à la notification) ;
 * le remboursement et la subvention non versée passent chacun leur écriture,
 * retenue. La reprise au 799 reste celle de `RepriseSubventionService`, qui
 * lit ces rattachements.
 */
@Injectable()
export class SubventionRattacheeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
  ) {}

  async lister(tenantId: string, immobilisationId?: string) {
    const [lignes, tenant] = await Promise.all([
      this.prisma.subventionImmobilisation.findMany({
        where: { tenantId, ...(immobilisationId ? { immobilisationId } : {}) },
        select: {
          id: true,
          montant: true,
          dateOctroi: true,
          reference: true,
          dureeInalienabiliteAns: true,
          motifSansVentilation: true,
          immobilisation: { select: { id: true, numeroInventaire: true, designation: true } },
          compteSubvention: { select: { id: true, numero: true, intitule: true } },
          reductions: { select: { id: true, nature: true, montant: true, motif: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: [{ dateOctroi: 'asc' }, { id: 'asc' }],
        take: PLAFOND_LISTE + 1,
      }),
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { referentiel: true, methodeDepreciationBienSubventionne: true },
      }),
    ]);
    return {
      subventions: lignes.slice(0, PLAFOND_LISTE),
      tronque: lignes.length > PLAFOND_LISTE,
      methodeDepreciation: tenant.methodeDepreciationBienSubventionne,
      contrepartieRemboursementProposee: contrepartieRemboursementProposee(tenant.referentiel as Ref),
    };
  }

  /**
   * § 4.4 · la ventilation proposée d'un montant entre la structure et ses
   * composants en service, au prorata des valeurs d'entrée (décision D-13).
   */
  async ventilation(tenantId: string, immobilisationId: string, montant: number) {
    const bien = await this.prisma.immobilisation.findFirst({
      where: { id: immobilisationId, tenantId },
      select: {
        id: true,
        designation: true,
        valeurOrigine: true,
        immobilisationPrincipaleId: true,
        composants: {
          where: { statut: StatutImmobilisation.EN_SERVICE },
          select: { id: true, designation: true, valeurOrigine: true },
          orderBy: { createdAt: 'asc' },
          take: 50,
        },
      },
    });
    if (!bien) throw new NotFoundException('Immobilisation introuvable');
    if (bien.immobilisationPrincipaleId) {
      throw new BadRequestException("Ce bien est un composant · rattachez la subvention depuis l'immobilisation principale, qui la ventile.");
    }
    const biens = [
      { id: bien.id, designation: bien.designation, valeurOrigine: n(bien.valeurOrigine) },
      ...bien.composants.map((c) => ({ id: c.id, designation: c.designation, valeurOrigine: n(c.valeurOrigine) })),
    ];
    const parts = ventilerAuProrata(montant, biens);
    return {
      lignes: biens.map((b, i) => ({ ...b, montant: parts[i].montant })),
      aDesComposants: bien.composants.length > 0,
    };
  }

  /**
   * LES OCTROIS DU COMPTE 14 CHOISI · ce que le rattachement doit pouvoir
   * reprendre sans le ressaisir. Le rattachement ne lie pas une ligne précise
   * (le contrôle porte sur le compte, crédits contre rattachements) · l'écran
   * propose la ligne choisie pour ses montant, date et référence, plafonnée au
   * reste à rattacher. Crédits hors écritures de clôture, comme `rattacher`.
   */
  async octrois(tenantId: string, compteSubventionId: string) {
    const [compte, tenant] = await Promise.all([
      this.prisma.compte.findFirst({
        where: { id: compteSubventionId, tenantId },
        select: { id: true, numero: true, typeCompte: true },
      }),
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { referentiel: true } }),
    ]);
    if (!compte) throw new BadRequestException('Compte de subvention introuvable pour ce dossier');
    const motifCompte = motifRefusCompteSubvention(compte.numero, compte.typeCompte === TypeCompteDetailTotal.DETAIL);
    if (motifCompte) throw new BadRequestException(motifCompte);
    const filtre = { compteId: compte.id, credit: { gt: 0 }, ecriture: { tenantId, estGenereeParCloture: false } };
    const [lignes, credits, rattache, contreparties] = await Promise.all([
      this.prisma.ligneEcriture.findMany({
        where: filtre,
        select: {
          id: true,
          credit: true,
          libelle: true,
          ecriture: { select: { id: true, date: true, libelle: true, reference: true, numeroPiece: true } },
        },
        orderBy: [{ ecriture: { date: 'desc' } }, { id: 'asc' }],
        take: PLAFOND_LISTE + 1,
      }),
      this.prisma.ligneEcriture.aggregate({ where: filtre, _sum: { credit: true } }),
      this.prisma.subventionImmobilisation.aggregate({ where: { tenantId, compteSubventionId: compte.id }, _sum: { montant: true } }),
      this.prisma.compte.findMany({
        where: { tenantId, numero: { in: [...CONTREPARTIES_OCTROI_PROPOSEES[tenant.referentiel as Ref]] } },
        select: { id: true, numero: true, intitule: true },
        orderBy: { numero: 'asc' },
      }),
    ]);
    const credite = centimes(n(credits._sum.credit));
    const dejaRattache = centimes(n(rattache._sum.montant));
    return {
      octrois: lignes.slice(0, PLAFOND_LISTE).map((l) => ({
        ligneId: l.id,
        ecritureId: l.ecriture.id,
        date: l.ecriture.date,
        numeroPiece: l.ecriture.numeroPiece,
        reference: l.ecriture.reference,
        libelle: l.libelle || l.ecriture.libelle,
        montant: n(l.credit),
      })),
      tronque: lignes.length > PLAFOND_LISTE,
      credite,
      dejaRattache,
      resteARattacher: centimes(Math.max(0, credite - dejaRattache)),
      contrepartiesProposees: contreparties,
      // AUDCIF · « tel que 4494 [...] ou 4582 » ouvre la classe 4 (hors 473) ;
      // SYCEBNL · le 4731 seul.
      autresTiersAdmis: tenant.referentiel === 'SYSCOHADA',
    };
  }

  /**
   * L'OCTROI · D 4731 (SYCEBNL) ou un compte de tiers, 4494 ou 4582 proposés
   * (SYSCOHADA) / C 14 (fiche du compte 14 des deux textes,
   * `motifRefusContrepartieOctroi`). Une écriture ordinaire, au brouillard,
   * que nul module ne retient · le rattachement qui suit la LIT, il ne la tient
   * pas.
   */
  async enregistrerOctroi(tenantId: string, userId: string, dto: OctroiSubventionDto) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, jeuEtatsFinanciersSycebnl: true },
    });
    if (tenant.jeuEtatsFinanciersSycebnl === JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT) {
      throw new BadRequestException(
        'Les biens d’un projet de développement sont financés par les fonds du bailleur (162 à 164, SYCEBNL Partie 3 ch. 3) · aucune subvention d’investissement ne s’y inscrit.',
      );
    }
    const [compte, contrepartie] = await Promise.all([
      this.prisma.compte.findFirst({ where: { id: dto.compteSubventionId, tenantId }, select: { id: true, numero: true, typeCompte: true } }),
      this.prisma.compte.findFirst({ where: { id: dto.compteContrepartieId, tenantId }, select: { id: true, numero: true, typeCompte: true } }),
    ]);
    if (!compte) throw new BadRequestException('Compte de subvention introuvable pour ce dossier');
    if (!contrepartie) throw new BadRequestException('Compte de contrepartie introuvable pour ce dossier');
    const motif =
      motifRefusCompteSubvention(compte.numero, compte.typeCompte === TypeCompteDetailTotal.DETAIL) ??
      motifRefusContrepartieOctroi(tenant.referentiel as Ref, contrepartie.numero) ??
      (contrepartie.typeCompte === TypeCompteDetailTotal.DETAIL ? null : 'Choisissez un compte de détail, pas un compte de regroupement.');
    if (motif) throw new BadRequestException(motif);
    const montant = centimes(dto.montant);
    return this.ecritures.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: dto.date,
      libelle: `Octroi de subvention d'investissement · ${dto.reference.trim()}`,
      reference: dto.reference.trim(),
      lignes: [
        { compteId: contrepartie.id, debit: montant, credit: 0 },
        { compteId: compte.id, debit: 0, credit: montant },
      ],
    });
  }

  async rattacher(tenantId: string, userId: string, dto: RattacherSubventionDto) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, jeuEtatsFinanciersSycebnl: true },
    });
    const referentiel = tenant.referentiel as Ref;
    // Les biens d'un projet de développement sont financés par les fonds du
    // bailleur (162 à 164, SYCEBNL Partie 3 ch. 3) et ne s'amortissent pas
    // (décision D-1) · une subvention au 14 n'y a rien à reprendre.
    if (tenant.jeuEtatsFinanciersSycebnl === JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT) {
      throw new BadRequestException(
        'Les biens d’un projet de développement sont financés par les fonds du bailleur (162 à 164, SYCEBNL Partie 3 ch. 3) · aucune subvention ne s’y rattache.',
      );
    }
    const compte = await this.prisma.compte.findFirst({
      where: { id: dto.compteSubventionId, tenantId },
      select: { id: true, numero: true, typeCompte: true },
    });
    if (!compte) throw new BadRequestException('Compte de subvention introuvable pour ce dossier');
    const motifCompte = motifRefusCompteSubvention(compte.numero, compte.typeCompte === TypeCompteDetailTotal.DETAIL);
    if (motifCompte) throw new BadRequestException(motifCompte);

    const ids = dto.lignes.map((l) => l.immobilisationId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Un même bien figure deux fois dans la ventilation.');
    const biens = await this.prisma.immobilisation.findMany({
      where: { tenantId, id: { in: ids } },
      select: {
        id: true,
        designation: true,
        valeurOrigine: true,
        statut: true,
        immobilisationPrincipaleId: true,
        _count: { select: { composants: { where: { statut: StatutImmobilisation.EN_SERVICE } } } },
        subventions: { select: { montant: true, compteSubventionId: true } },
        ecritureAcquisition: { select: { lignes: { select: { credit: true, compte: { select: { numero: true } } }, take: 50 } } },
      },
    });
    if (biens.length !== ids.length) throw new BadRequestException('Immobilisation introuvable pour ce dossier');

    // Tout se vérifie AVANT la première écriture en base.
    const principaux = biens.filter((b) => !b.immobilisationPrincipaleId);
    const composantsRattaches = biens.filter((b) => b.immobilisationPrincipaleId).length;
    for (const b of biens) {
      const ligne = dto.lignes.find((l) => l.immobilisationId === b.id)!;
      if (b.statut !== StatutImmobilisation.EN_SERVICE) {
        throw new BadRequestException(`« ${b.designation} » a quitté l'actif · aucune subvention ne s'y rattache plus.`);
      }
      if (b.subventions.some((s) => s.compteSubventionId === compte.id)) {
        throw new ConflictException(`« ${b.designation} » porte déjà une subvention sur ce compte.`);
      }
      // DEUX SOURCES, JAMAIS ENSEMBLE · un bien entré par un fonds (14 en
      // nature, 167, 171, 172) en suit déjà la reprise.
      const parFonds = (b.ecritureAcquisition?.lignes ?? []).some((l) => n(l.credit) > 0 && !!fondsDuCompte(referentiel, l.compte.numero));
      if (parFonds) {
        throw new BadRequestException(`« ${b.designation} » est entré par un fonds qui se reprend déjà · la subvention ne s'y rattache pas une seconde fois.`);
      }
      const dejaRattache = b.subventions.reduce((t, s) => t + n(s.montant), 0);
      if (centimes(dejaRattache + ligne.montant) > n(b.valeurOrigine)) {
        throw new BadRequestException(
          `Les subventions de « ${b.designation} » dépasseraient sa valeur d'entrée · la reprise suit « le rapport existant entre le montant de la subvention et la valeur d'entrée » (AUDCIF Titre VIII ch. 17 § 3.2).`,
        );
      }
    }
    for (const p of principaux) {
      const motif = motifRefusSansVentilation({
        principalAvecComposants: p._count.composants > 0,
        composantsRattaches,
        motif: dto.motifSansVentilation,
      });
      if (motif) throw new BadRequestException(motif);
    }

    // Le 14 a-t-il reçu ce qu'on lui rattache ? Crédits du compte hors
    // écritures de clôture (le report à-nouveau recrédite chaque année le
    // solde, et le compterait autant de fois).
    const [credits, rattache] = await Promise.all([
      this.prisma.ligneEcriture.aggregate({
        where: { compteId: compte.id, ecriture: { tenantId, estGenereeParCloture: false } },
        _sum: { credit: true },
      }),
      this.prisma.subventionImmobilisation.aggregate({ where: { tenantId, compteSubventionId: compte.id }, _sum: { montant: true } }),
    ]);
    const total = centimes(n(rattache._sum.montant) + dto.lignes.reduce((t, l) => t + l.montant, 0));
    if (total > centimes(n(credits._sum.credit))) {
      throw new BadRequestException(
        `Le compte ${compte.numero} n'a été crédité que de ${n(credits._sum.credit).toFixed(2)} · on ne rattache pas aux biens plus de subvention que l'octroi passé au 14.`,
      );
    }

    try {
      return await transactionJournalisee(this.prisma, async (tx) => {
        const crees = [];
        for (const l of dto.lignes) {
          crees.push(
            await tx.subventionImmobilisation.create({
              data: {
                tenantId,
                immobilisationId: l.immobilisationId,
                compteSubventionId: compte.id,
                montant: l.montant,
                dateOctroi: new Date(dto.dateOctroi),
                reference: dto.reference.trim(),
                dureeInalienabiliteAns: dto.dureeInalienabiliteAns ?? null,
                motifSansVentilation: composantsRattaches === 0 ? (dto.motifSansVentilation?.trim() || null) : null,
                createdBy: userId,
              },
            }),
          );
        }
        return crees;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Un de ces biens porte déjà une subvention sur ce compte.');
      }
      throw err;
    }
  }

  /** § 4.6 · déclarée une fois, jamais changée ici (décision D-11). */
  async declarerMethode(tenantId: string, dto: MethodeDepreciationSubventionDto) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { methodeDepreciationBienSubventionne: true },
    });
    if (tenant.methodeDepreciationBienSubventionne && tenant.methodeDepreciationBienSubventionne !== dto.methode) {
      throw new ConflictException(
        'La méthode de dépréciation des biens subventionnés est déjà déclarée · elle se tient d’un exercice à l’autre, et un changement de méthode ne se fait pas depuis cette fenêtre.',
      );
    }
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { methodeDepreciationBienSubventionne: dto.methode as MethodeDepreciationBienSubventionne },
      select: { methodeDepreciationBienSubventionne: true },
    });
  }

  async reduire(tenantId: string, userId: string, subventionId: string, dto: ReduireSubventionDto) {
    const sub = await this.prisma.subventionImmobilisation.findFirst({
      where: { id: subventionId, tenantId },
      select: {
        id: true,
        montant: true,
        compteSubventionId: true,
        immobilisation: {
          select: {
            id: true,
            designation: true,
            reprisesSubvention: { select: { montant: true } },
            subventions: { select: { montant: true, reductions: { select: { montant: true } } } },
          },
        },
        reductions: { select: { montant: true } },
      },
    });
    if (!sub) throw new NotFoundException('Subvention rattachée introuvable');
    const [{ referentiel }, contrepartie] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { referentiel: true } }),
      this.prisma.compte.findFirst({ where: { id: dto.compteContrepartieId, tenantId }, select: { id: true, numero: true, typeCompte: true } }),
    ]);
    if (!contrepartie) throw new BadRequestException('Compte de contrepartie introuvable pour ce dossier');
    if (contrepartie.typeCompte !== TypeCompteDetailTotal.DETAIL) throw new BadRequestException('Choisissez un compte de détail.');
    const motifContrepartie = motifRefusContrepartieReduction(referentiel as Ref, dto.nature, contrepartie.numero);
    if (motifContrepartie) throw new BadRequestException(motifContrepartie);

    const immo = sub.immobilisation;
    const resteRattachement = centimes(n(sub.montant) - sub.reductions.reduce((t, r) => t + n(r.montant), 0));
    const soldeNonReprisBien = centimes(
      immo.subventions.reduce((t, s) => t + n(s.montant) - s.reductions.reduce((u, r) => u + n(r.montant), 0), 0) -
        immo.reprisesSubvention.reduce((t, r) => t + n(r.montant), 0),
    );
    const motif = motifRefusReduction({ montant: dto.montant, resteRattachement, soldeNonReprisBien });
    if (motif) throw new BadRequestException(motif);

    let compte6515Id: string | undefined;
    let compte799Id: string | undefined;
    if (dto.nature === 'NON_VERSEE') {
      const [c6515, c799] = await Promise.all([
        this.prisma.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: COMPTE_PERTES_AUTRES_DEBITEURS } }, select: { id: true } }),
        this.prisma.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: COMPTE_REPRISE_SUBVENTION } }, select: { id: true } }),
      ]);
      if (!c6515 || !c799) {
        throw new BadRequestException(
          `Comptes ${COMPTE_PERTES_AUTRES_DEBITEURS} et ${COMPTE_REPRISE_SUBVENTION} requis (AUDCIF Titre VIII ch. 17 § 4.7) · ouvrez-les avant de constater la subvention non versée.`,
        );
      }
      compte6515Id = c6515.id;
      compte799Id = c799.id;
    }
    const ecriture = await this.ecritures.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: dto.date.slice(0, 10),
      libelle: `${dto.nature === 'REMBOURSEMENT' ? 'Subvention remboursable' : 'Subvention non versée'} · ${immo.designation}`.slice(0, 190),
      lignes: lignesReduction({
        nature: dto.nature,
        montant: dto.montant,
        compte14Id: sub.compteSubventionId,
        contrepartieId: contrepartie.id,
        compte6515Id,
        compte799Id,
      }),
    });
    try {
      return await this.prisma.reductionSubventionImmobilisation.create({
        data: {
          tenantId,
          subventionId: sub.id,
          exerciceId: dto.exerciceId,
          nature: dto.nature,
          montant: dto.montant,
          motif: dto.motif.trim(),
          compteContrepartieId: contrepartie.id,
          ecritureId: ecriture.id,
          createdBy: userId,
        },
      });
    } catch (err) {
      await this.ecritures.retirerCompensation(tenantId, ecriture.id);
      throw err;
    }
  }
}

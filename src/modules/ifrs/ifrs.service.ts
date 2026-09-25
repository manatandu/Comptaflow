import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { chargerLignes } from '../etats-financiers/etats-financiers.communs';
import { ActiviteIfrsDto, MouvementCpIfrsDto, RegleIfrsDto, RetraitementIfrsDto } from './dto/ifrs.dto';
import { construireEtatsIfrs, EtatsIfrs, LIBELLES_GROUPES, motifRefusRetraitement, RefusIfrs, RetraitementDeclare } from './etats-ifrs';
import { motifRefusRegle, RUBRIQUES_IFRS } from './rubriques-ifrs';
import { COMPOSANTES_CP, construireVariationCapitauxPropres, motifRefusMouvementCp, VariationCapitauxPropres } from './variation-capitaux-propres-ifrs';

/**
 * ÉTATS IFRS EN SUS DU JEU LÉGAL · item 15, tranche 1. Le grand livre est lu
 * comme par les états légaux (`chargerLignes`, livre-journal seul), et rien
 * n'y est écrit · les règles et les retraitements vivent dans leurs tables.
 *
 * LE COMPARATIF est un second calcul sur l'exercice précédent, avec SES
 * retraitements et les mêmes règles · sans exercice précédent, la colonne est
 * vide et non nulle.
 *
 * LA VARIATION DES CAPITAUX PROPRES (tranche 2) lit TROIS exercices · son bloc
 * N part de la clôture N-1, et son bloc comparatif, que le § 10 f) exige
 * autant que les autres, part de la clôture N-2. Un bloc qui n'a pas son
 * exercice de départ n'est pas rendu, et le jeu le dit non publiable.
 */
@Injectable()
export class IfrsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
  ) {}

  private async exercice(tenantId: string, exerciceId: string) {
    const ex = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId }, select: { id: true, dateDebut: true, dateFin: true } });
    if (!ex) throw new NotFoundException('Exercice introuvable dans ce dossier.');
    return ex;
  }

  private async retraitementsDe(tenantId: string, exerciceId: string) {
    const rs = await this.prisma.retraitementIfrs.findMany({
      where: { tenantId, exerciceId },
      include: { lignes: { orderBy: { ordre: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return rs.map((r) => ({ ...r, lignes: r.lignes.map((l) => ({ ...l, montant: Number(l.montant) })) }));
  }

  private async precedent(tenantId: string, dateDebut: Date) {
    return this.prisma.exercice.findFirst({
      where: { tenantId, dateFin: { lt: dateDebut } },
      orderBy: { dateFin: 'desc' },
      select: { id: true, dateDebut: true },
    });
  }

  private async mouvementsDe(tenantId: string, exerciceId: string) {
    const ms = await this.prisma.mouvementCapitauxPropresIfrs.findMany({ where: { tenantId, exerciceId }, orderBy: { createdAt: 'asc' } });
    return ms.map((m) => ({ ...m, montant: Number(m.montant) }));
  }

  /** Un bloc de la variation des capitaux propres, ou le motif qui l'empêche. */
  private async blocVariation(tenantId: string, exerciceId: string, cloture: EtatsIfrs, ouverture: EtatsIfrs | null) {
    if (!ouverture) return { bloc: null, motif: 'Sans état IFRS de l’exercice précédent, le rapprochement ouverture → clôture du § 107 c ne s’établit pas.' };
    try {
      return { bloc: construireVariationCapitauxPropres(cloture, ouverture, await this.mouvementsDe(tenantId, exerciceId)), motif: null };
    } catch (e) {
      if (e instanceof RefusIfrs) return { bloc: null, motif: e.message };
      throw e;
    }
  }

  private async calculer(
    tenantId: string,
    ex: { id: string; dateDebut: Date },
    regles: { prefixe: string; rubrique: string }[],
    activite: ActiviteIfrsDto['activitePrincipale'],
  ): Promise<EtatsIfrs> {
    const lignes = await chargerLignes(this.ecritures, tenantId, ex.id);
    const retraitements: RetraitementDeclare[] = (await this.retraitementsDe(tenantId, ex.id)).map((r) => ({
      id: r.id,
      libelle: r.libelle,
      fondement: r.fondement,
      lignes: r.lignes.map((l) => ({ rubrique: l.rubrique, montant: l.montant })),
    }));
    try {
      return construireEtatsIfrs(
        { dateDebut: ex.dateDebut },
        lignes.map((l) => ({ numero: l.numero, intitule: l.intitule, solde: Number(l.solde) })),
        regles,
        retraitements,
        activite ?? null,
      );
    } catch (e) {
      if (e instanceof RefusIfrs) throw new BadRequestException(e.message);
      throw e;
    }
  }

  async etat(tenantId: string, exerciceId: string) {
    const ex = await this.exercice(tenantId, exerciceId);
    const [parametres, regles, retraitements] = await Promise.all([
      this.prisma.parametresIfrs.findUnique({ where: { tenantId } }),
      this.prisma.regleCorrespondanceIfrs.findMany({ where: { tenantId }, orderBy: { prefixe: 'asc' } }),
      this.retraitementsDe(tenantId, ex.id),
    ]);
    const activite = parametres?.activitePrincipale ?? null;
    const r = regles.map((x) => ({ prefixe: x.prefixe, rubrique: x.rubrique }));
    const n = await this.calculer(tenantId, ex, r, activite);
    const precedent = await this.precedent(tenantId, ex.dateDebut);
    let n1: EtatsIfrs | null = null;
    let motifN1: string | null = null;
    if (!precedent) motifN1 = 'Aucun exercice précédent dans le dossier · la colonne comparative est vide.';
    else {
      try {
        n1 = await this.calculer(tenantId, precedent, r, activite);
      } catch (e) {
        motifN1 = `Le comparatif ne s’établit pas · ${(e as Error).message}`;
      }
    }

    // ─── Variation des capitaux propres · deux blocs, N et N-1 (§ 10 f, § 107) ─
    let n2: EtatsIfrs | null = null;
    const avantPrecedent = precedent && n1 ? await this.precedent(tenantId, precedent.dateDebut) : null;
    if (avantPrecedent) {
      try {
        n2 = await this.calculer(tenantId, avantPrecedent, r, activite);
      } catch {
        n2 = null;
      }
    }
    const blocN = await this.blocVariation(tenantId, ex.id, n, n1);
    const blocN1 = precedent && n1
      ? await this.blocVariation(tenantId, precedent.id, n1, n2)
      : { bloc: null as VariationCapitauxPropres | null, motif: motifN1 };
    if (blocN.bloc) {
      n.motifsNonPubliable.push(...blocN.bloc.motifsNonPubliable);
      n.mentions.push(...blocN.bloc.mentions);
    } else {
      n.motifsNonPubliable.push(`État des variations des capitaux propres non établi · ${blocN.motif}`);
    }
    if (!blocN1.bloc) {
      n.motifsNonPubliable.push(
        `Bloc comparatif de l’état des variations des capitaux propres non établi (IFRS 18 § 10 f) · ${blocN1.motif ?? 'l’exercice précédent n’a pas d’état IFRS.'}`,
      );
    }

    return {
      activitePrincipale: activite,
      regles,
      retraitements,
      rubriques: RUBRIQUES_IFRS,
      groupes: LIBELLES_GROUPES,
      n,
      n1,
      motifN1,
      variationCapitauxPropres: {
        composantes: COMPOSANTES_CP,
        n: blocN.bloc,
        motifN: blocN.motif,
        n1: blocN1.bloc,
        motifN1: blocN1.motif,
        mouvements: await this.mouvementsDe(tenantId, ex.id),
      },
    };
  }

  async declarerActivite(tenantId: string, dto: ActiviteIfrsDto) {
    const activitePrincipale = dto.activitePrincipale ?? null;
    return this.prisma.parametresIfrs.upsert({ where: { tenantId }, create: { tenantId, activitePrincipale }, update: { activitePrincipale } });
  }

  async ajouterRegle(tenantId: string, dto: RegleIfrsDto) {
    const prefixe = dto.prefixe.trim();
    const motif = motifRefusRegle(prefixe, dto.rubrique);
    if (motif) throw new BadRequestException(motif);
    try {
      return await this.prisma.regleCorrespondanceIfrs.create({ data: { tenantId, prefixe, rubrique: dto.rubrique } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Une règle existe déjà pour le préfixe ${prefixe} · retirez-la avant d’en poser une autre.`);
      }
      throw e;
    }
  }

  async supprimerRegle(tenantId: string, id: string) {
    const r = await this.prisma.regleCorrespondanceIfrs.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!r) throw new NotFoundException('Règle introuvable dans ce dossier.');
    await this.prisma.regleCorrespondanceIfrs.delete({ where: { id } });
    return { supprime: true };
  }

  async ajouterRetraitement(tenantId: string, dto: RetraitementIfrsDto) {
    const ex = await this.exercice(tenantId, dto.exerciceId);
    const motif = motifRefusRetraitement({ libelle: dto.libelle, fondement: dto.fondement, lignes: dto.lignes });
    if (motif) throw new BadRequestException(motif);
    return this.prisma.retraitementIfrs.create({
      data: {
        tenantId,
        exerciceId: ex.id,
        libelle: dto.libelle.trim(),
        fondement: dto.fondement.trim(),
        lignes: { create: dto.lignes.map((l, i) => ({ tenantId, ordre: i + 1, rubrique: l.rubrique, montant: l.montant })) },
      },
      include: { lignes: true },
    });
  }

  async supprimerRetraitement(tenantId: string, id: string) {
    const r = await this.prisma.retraitementIfrs.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!r) throw new NotFoundException('Retraitement introuvable dans ce dossier.');
    await this.prisma.retraitementIfrs.delete({ where: { id } });
    return { supprime: true };
  }

  async ajouterMouvementCp(tenantId: string, dto: MouvementCpIfrsDto) {
    const ex = await this.exercice(tenantId, dto.exerciceId);
    const motif = motifRefusMouvementCp(dto);
    if (motif) throw new BadRequestException(motif);
    return this.prisma.mouvementCapitauxPropresIfrs.create({
      data: {
        tenantId,
        exerciceId: ex.id,
        type: dto.type,
        composante: dto.composante,
        montant: dto.montant,
        libelle: dto.libelle.trim(),
        justification: dto.justification.trim(),
      },
    });
  }

  async supprimerMouvementCp(tenantId: string, id: string) {
    const m = await this.prisma.mouvementCapitauxPropresIfrs.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!m) throw new NotFoundException('Mouvement introuvable dans ce dossier.');
    await this.prisma.mouvementCapitauxPropresIfrs.delete({ where: { id } });
    return { supprime: true };
  }
}

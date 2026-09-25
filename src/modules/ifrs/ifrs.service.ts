import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { chargerLignes, LigneBalancePourEtat } from '../etats-financiers/etats-financiers.communs';
import { EtatsFinanciersSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-syscohada.service';
import { ActiviteIfrsDto, MouvementCpIfrsDto, PremiereApplicationIfrsDto, RegleIfrsDto, RetraitementIfrsDto } from './dto/ifrs.dto';
import { construireEtatsIfrs, EtatsIfrs, LIBELLES_GROUPES, motifRefusRetraitement, RefusIfrs } from './etats-ifrs';
import { construirePremiereApplication, lignesOuverture, motifRefusAjustementTransition, PremiereApplication, RetraitementIfrs1 } from './premiere-application-ifrs';
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
 *
 * LA PREMIÈRE APPLICATION (tranche 4, IFRS 1) se DÉCLARE · le premier
 * exercice IFRS du dossier, ou le fait que l'entité applique déjà les IFRS
 * (§ 4 et 5). Sur le premier exercice, l'exercice comparatif ne part plus de
 * la clôture N-2, qui n'a jamais été IFRS · il part de l'état d'ouverture à
 * la date de transition (§ 6), bâti sur le report à-nouveau de l'exercice
 * comparatif et sur ses AJUSTEMENTS DE TRANSITION (`aLaTransition`), qui ne
 * se mêlent jamais aux retraitements de l'exercice. Les capitaux propres
 * SYSCOHADA des rapprochements du § 24 sont lus par la correspondance du
 * bilan légal (`resoudreBilanSurLignes`), jamais réécrite ici.
 */
type RetraitementLu = { id: string; libelle: string; fondement: string; correctionErreur: boolean; lignes: { rubrique: string; montant: number }[] };

const versMoteur = (r: RetraitementLu): RetraitementIfrs1 => ({
  id: r.id,
  libelle: r.libelle,
  fondement: r.fondement,
  correctionErreur: r.correctionErreur,
  lignes: r.lignes.map((l) => ({ rubrique: l.rubrique, montant: l.montant })),
});

/** Le total CP du bilan légal (« capitaux propres et ressources assimilées »), crédit en positif. */
const REF_CAPITAUX_PROPRES_SYSCOHADA = 'CP';

@Injectable()
export class IfrsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
    private readonly etatsSyscohada: EtatsFinanciersSyscohadaService,
  ) {}

  private async exercice(tenantId: string, exerciceId: string) {
    const ex = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId }, select: { id: true, dateDebut: true, dateFin: true } });
    if (!ex) throw new NotFoundException('Exercice introuvable dans ce dossier.');
    return ex;
  }

  /**
   * `aLaTransition` sépare deux objets qui vivent sur le même exercice · les
   * retraitements de l'exercice et les ajustements de transition datés de son
   * ouverture (IFRS 1 § 11). Les additionner mettrait l'effet de la
   * transition deux fois dans la clôture du comparatif.
   */
  private async retraitementsDe(tenantId: string, exerciceId: string, aLaTransition = false) {
    const rs = await this.prisma.retraitementIfrs.findMany({
      where: { tenantId, exerciceId, aLaTransition },
      include: { lignes: { orderBy: { ordre: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return rs.map((r) => ({ ...r, lignes: r.lignes.map((l) => ({ ...l, montant: Number(l.montant) })) }));
  }

  private async precedent(tenantId: string, dateDebut: Date) {
    return this.prisma.exercice.findFirst({
      where: { tenantId, dateFin: { lt: dateDebut } },
      orderBy: { dateFin: 'desc' },
      select: { id: true, dateDebut: true, dateFin: true },
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
    lignesChargees?: LigneBalancePourEtat[],
  ): Promise<EtatsIfrs> {
    const lignes = lignesChargees ?? (await chargerLignes(this.ecritures, tenantId, ex.id));
    const retraitements = (await this.retraitementsDe(tenantId, ex.id)).map(versMoteur);
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

  private capitauxPropresSyscohada(lignes: LigneBalancePourEtat[]): number {
    return this.etatsSyscohada.resoudreBilanSurLignes(lignes).resolution.parRef.get(REF_CAPITAUX_PROPRES_SYSCOHADA)?.montant ?? 0;
  }

  /**
   * L'état d'ouverture IFRS (IFRS 1 § 6) et les rapprochements du § 24, pour
   * un premier exercice IFRS dont `comparatif` est l'exercice précédent. Le
   * bilan d'ouverture légal est le report à-nouveau des classes 1 à 5 de
   * l'exercice comparatif · lu dans la même balance que ses soldes.
   */
  private async premiereApplication(
    tenantId: string,
    comparatif: { id: string; dateDebut: Date },
    lignesComparatif: LigneBalancePourEtat[],
    etatComparatif: EtatsIfrs,
    regles: { prefixe: string; rubrique: string }[],
    activite: ActiviteIfrsDto['activitePrincipale'],
  ): Promise<PremiereApplication> {
    const ouvertureLegale: LigneBalancePourEtat[] = lignesComparatif
      .filter((l) => /^[1-5]/.test(l.numero))
      .map((l) => {
        const rd = Number(l.reportDebit ?? 0);
        const rc = Number(l.reportCredit ?? 0);
        return { ...l, totalDebit: rd, totalCredit: rc, mouvementDebit: 0, mouvementCredit: 0, solde: rd - rc };
      });
    const ajustements = (await this.retraitementsDe(tenantId, comparatif.id, true)).map(versMoteur);
    const retraitementsComparatif = (await this.retraitementsDe(tenantId, comparatif.id)).map(versMoteur);
    const ouverture = construireEtatsIfrs(
      { dateDebut: comparatif.dateDebut },
      lignesOuverture(ouvertureLegale.map((l) => ({ numero: l.numero, intitule: l.intitule, reportDebit: l.totalDebit, reportCredit: l.totalCredit }))),
      regles,
      ajustements,
      activite ?? null,
    );
    return construirePremiereApplication({
      dateTransition: comparatif.dateDebut,
      ouverture,
      ajustementsTransition: ajustements,
      capitauxPropresSyscohadaTransition: this.capitauxPropresSyscohada(ouvertureLegale),
      comparatif: etatComparatif,
      retraitementsComparatif,
      capitauxPropresSyscohadaComparatif: this.capitauxPropresSyscohada(lignesComparatif),
    });
  }

  async etat(tenantId: string, exerciceId: string) {
    const ex = await this.exercice(tenantId, exerciceId);
    const [parametres, regles, retraitements] = await Promise.all([
      this.prisma.parametresIfrs.findUnique({ where: { tenantId } }),
      this.prisma.regleCorrespondanceIfrs.findMany({ where: { tenantId }, orderBy: { prefixe: 'asc' } }),
      this.retraitementsDe(tenantId, ex.id),
    ]);
    const activite = parametres?.activitePrincipale ?? null;
    const premierId = parametres?.premierExerciceIfrsId ?? null;
    const dejaAdoptant = parametres?.dejaAdoptant ?? false;
    const r = regles.map((x) => ({ prefixe: x.prefixe, rubrique: x.rubrique }));
    const n = await this.calculer(tenantId, ex, r, activite);
    const precedent = await this.precedent(tenantId, ex.dateDebut);
    let n1: EtatsIfrs | null = null;
    let motifN1: string | null = null;
    let lignesN1: LigneBalancePourEtat[] = [];
    if (!precedent) motifN1 = 'Aucun exercice précédent dans le dossier · la colonne comparative est vide.';
    else {
      try {
        lignesN1 = await chargerLignes(this.ecritures, tenantId, precedent.id);
        n1 = await this.calculer(tenantId, precedent, r, activite, lignesN1);
      } catch (e) {
        motifN1 = `Le comparatif ne s’établit pas · ${(e as Error).message}`;
      }
    }

    // ─── Première application · IFRS 1 ────────────────────────────────────────
    let premiereApplication: PremiereApplication | null = null;
    let motifPremiereApplication: string | null = null;
    const estPremier = premierId === ex.id;
    if (!premierId && !dejaAdoptant) {
      n.motifsNonPubliable.push(
        'Première application non déclarée · les premiers états financiers IFRS relèvent d’IFRS 1 (§ 2 et 3). Déclarez le premier exercice IFRS du dossier, ou que l’entité présente déjà des états conformes aux IFRS (§ 4 et 5).',
      );
    }
    if (estPremier) {
      if (!precedent || !n1) {
        motifPremiereApplication = `Le premier exercice IFRS présente au moins un exercice comparatif (IFRS 1 § 21), dont l’ouverture est la date de transition (annexe A) · ${motifN1 ?? 'il manque au dossier.'}`;
      } else {
        try {
          premiereApplication = await this.premiereApplication(tenantId, precedent, lignesN1, n1, r, activite);
        } catch (e) {
          if (!(e instanceof RefusIfrs)) throw e;
          motifPremiereApplication = e.message;
        }
      }
      if (premiereApplication) n.motifsNonPubliable.push(...premiereApplication.motifsNonPubliable);
      else n.motifsNonPubliable.push(`Première application non établie · ${motifPremiereApplication}`);
    } else if (premierId && !dejaAdoptant) {
      const premier = await this.prisma.exercice.findFirst({ where: { id: premierId, tenantId }, select: { id: true, dateDebut: true, dateFin: true } });
      const comparatifDuPremier = premier ? await this.precedent(tenantId, premier.dateDebut) : null;
      const debutTransition = comparatifDuPremier?.dateDebut ?? premier?.dateDebut;
      if (debutTransition && ex.dateFin.getTime() < debutTransition.getTime()) {
        n.motifsNonPubliable.push(
          'Exercice antérieur à la date de transition aux IFRS (IFRS 1, annexe A) · ces états projettent la balance légale sur les rubriques IFRS, ils ne sont pas des états IFRS.',
        );
      }
    }

    // ─── Variation des capitaux propres · deux blocs, N et N-1 (§ 10 f, § 107) ─
    // Sur le premier exercice IFRS, le bloc comparatif part de l'état
    // d'ouverture à la date de transition · la clôture N-2 n'a jamais été IFRS,
    // et la prendre ferait partir le tableau d'un solde que personne n'a publié.
    let n2: EtatsIfrs | null = null;
    const avantPrecedent = !estPremier && precedent && n1 ? await this.precedent(tenantId, precedent.dateDebut) : null;
    if (avantPrecedent) {
      try {
        n2 = await this.calculer(tenantId, avantPrecedent, r, activite);
      } catch {
        n2 = null;
      }
    }
    if (estPremier && premiereApplication) n2 = premiereApplication.ouverture;
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
      premierExerciceIfrsId: premierId,
      dejaAdoptant,
      regles,
      retraitements,
      // L'exercice qui porte les ajustements de transition · celui qui précède
      // le premier exercice IFRS, rendu pour que l'écran les y pose.
      exerciceTransitionId: estPremier ? (precedent?.id ?? null) : null,
      ajustementsTransition: precedent && estPremier ? await this.retraitementsDe(tenantId, precedent.id, true) : [],
      rubriques: RUBRIQUES_IFRS,
      groupes: LIBELLES_GROUPES,
      n,
      n1,
      motifN1,
      premiereApplication,
      motifPremiereApplication,
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

  /**
   * IFRS 1 § 3 à 5 · premier exercice IFRS OU entité déjà adoptante, jamais
   * les deux · un premier exercice désigne une première application, et une
   * entité déjà adoptante n'en a pas.
   */
  async declarerPremiereApplication(tenantId: string, dto: PremiereApplicationIfrsDto) {
    const premierExerciceIfrsId = dto.premierExerciceIfrsId ?? null;
    const dejaAdoptant = dto.dejaAdoptant ?? false;
    if (premierExerciceIfrsId && dejaAdoptant) {
      throw new BadRequestException('Une entité qui applique déjà les IFRS n’a pas de premier exercice IFRS (IFRS 1 § 4 et 5) · déclarez l’un ou l’autre.');
    }
    if (premierExerciceIfrsId) await this.exercice(tenantId, premierExerciceIfrsId);
    return this.prisma.parametresIfrs.upsert({
      where: { tenantId },
      create: { tenantId, premierExerciceIfrsId, dejaAdoptant },
      update: { premierExerciceIfrsId, dejaAdoptant },
    });
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
    const aLaTransition = dto.aLaTransition ?? false;
    if (aLaTransition) {
      const motifTransition = motifRefusAjustementTransition({ libelle: dto.libelle, lignes: dto.lignes });
      if (motifTransition) throw new BadRequestException(motifTransition);
      // L'ajustement se date de la transition, c'est-à-dire de l'ouverture de
      // l'exercice qui PRÉCÈDE le premier exercice IFRS (annexe A) · posé sur
      // un autre exercice, il ne serait lu par aucun rapprochement.
      const parametres = await this.prisma.parametresIfrs.findUnique({ where: { tenantId } });
      const premier = parametres?.premierExerciceIfrsId
        ? await this.prisma.exercice.findFirst({ where: { id: parametres.premierExerciceIfrsId, tenantId }, select: { id: true, dateDebut: true } })
        : null;
      if (!premier) throw new BadRequestException('Un ajustement de transition suppose un premier exercice IFRS déclaré (IFRS 1 § 3).');
      const comparatif = await this.precedent(tenantId, premier.dateDebut);
      if (!comparatif || comparatif.id !== ex.id) {
        throw new BadRequestException(
          'Un ajustement de transition se pose sur l’exercice comparatif, celui qui précède le premier exercice IFRS · la date de transition est son ouverture (IFRS 1, annexe A).',
        );
      }
    }
    return this.prisma.retraitementIfrs.create({
      data: {
        tenantId,
        exerciceId: ex.id,
        libelle: dto.libelle.trim(),
        fondement: dto.fondement.trim(),
        aLaTransition,
        correctionErreur: dto.correctionErreur ?? false,
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

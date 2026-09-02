import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JeuEtatsFinanciersSycebnl, Prisma, Referentiel, SystemeComptableSyscohada } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EtatsFinanciersService } from '../etats-financiers/etats-financiers.service';
import { EtatsFinanciersProjetService } from '../etats-financiers/etats-financiers-projet.service';
import { EtatsFinanciersSmtService } from '../etats-financiers/etats-financiers-smt.service';
import { EtatsFinanciersProjetBudgetService } from '../etats-financiers/etats-financiers-projet-budget.service';
import { CleEtatInventaire, EtatATranscrire, etatsExigesPar } from './correspondance-inventaire';
import { etatsExigesParSysteme } from './correspondance-inventaire-syscohada';
import { EtatsFinanciersSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-syscohada.service';
import { EtatsFinanciersSmtSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-smt-syscohada.service';
import { ResumeInventaireDto, TranscrireInventaireDto } from './dto/documents-obligatoires.dto';

/** Un état exigé par l'art. 14 que la transcription ne porte pas, et pourquoi. */
export interface DocumentManquant {
  cle: CleEtatInventaire;
  libelle: string;
  motif: string;
}

/**
 * LIVRE D'INVENTAIRE · article 14 de l'Acte uniforme SYCEBNL.
 *
 * « Le livre d'inventaire est un document obligatoire sur lequel sont
 * TRANSCRITS [les états financiers] de chaque exercice ainsi que le résumé de
 * l'opération d'inventaire. » L'article 24 en sanctionne pénalement l'absence.
 *
 * Trois conséquences que le texte impose, et que ce service applique :
 *
 * 1. TRANSCRIRE, c'est FIGER. Les états sont sérialisés une fois et relus
 *    tels quels. Un livre qui recalculerait ses états à chaque consultation
 *    ne transcrirait rien : il changerait sans bruit dès qu'une table de
 *    correspondance est corrigée dans une version ultérieure, ou qu'un
 *    exercice est rouvert et retouché · et le livre ne prouverait plus ce qui
 *    a été arrêté à la clôture.
 * 2. L'ARTICLE DÉCIDE DU CONTENU, PAS LE LOGICIEL. La liste des états diffère
 *    selon le jeu (point 1 pour les associations, point 2 pour les projets) et
 *    n'est ni enrichie ni réduite ici. Ce que le logiciel ne sait pas encore
 *    produire est déclaré MANQUANT, avec son motif : l'exposition pénale
 *    devient lisible au lieu d'être masquée par une transcription qui se
 *    présenterait comme complète.
 * 3. LE RÉSUMÉ DE L'OPÉRATION D'INVENTAIRE EST UNE SAISIE. Le texte l'exige
 *    (« ainsi que le résumé de l'opération d'inventaire ») mais n'en définit
 *    NULLE PART le contenu · ni le glossaire, ni le cadre conceptuel, ni la
 *    Partie 2 ch. 2. Le déduire d'un autre référentiel serait inventer une
 *    exigence que le texte ne formule pas (règle §2.6). Il est donc laissé au
 *    dossier, et son absence est signalée, jamais suppléée.
 */
@Injectable()
export class LivreInventaireService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly etatsFinanciers: EtatsFinanciersService,
    private readonly etatsFinanciersProjet: EtatsFinanciersProjetService,
    private readonly etatsFinanciersSmt: EtatsFinanciersSmtService,
    private readonly etatsFinanciersProjetBudget: EtatsFinanciersProjetBudgetService,
    private readonly etatsSyscohada: EtatsFinanciersSyscohadaService,
    private readonly etatsSmtSyscohada: EtatsFinanciersSmtSyscohadaService,
  ) {}

  /**
   * Ce que le dossier doit transcrire, et sous quel article.
   *
   * Les deux référentiels imposent le livre d'inventaire, mais par des textes
   * distincts qui n'énumèrent PAS les mêmes états · SYCEBNL art. 14 (point 1
   * ou 2 selon le jeu), AUDCIF art. 19 pour le SYSCOHADA. Aucun n'est
   * transposé sur l'autre.
   */
  private async regimeInventaire(tenantId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, jeuEtatsFinanciersSycebnl: true, systemeComptableSyscohada: true },
    });
    const syscohada = tenant.referentiel === Referentiel.SYSCOHADA;
    return {
      syscohada,
      jeu: syscohada ? null : tenant.jeuEtatsFinanciersSycebnl,
      systeme: syscohada ? tenant.systemeComptableSyscohada : null,
      exiges: syscohada
        ? etatsExigesParSysteme(tenant.systemeComptableSyscohada)
        : etatsExigesPar(tenant.jeuEtatsFinanciersSycebnl),
      exigence: syscohada
        ? "AUDCIF art. 19 : « le livre d'inventaire, sur lequel sont transcrits le Bilan, le Compte de résultat et le Tableau des flux de trésorerie de chaque exercice, ainsi que le résumé de l'opération d'inventaire. »"
        : "Art. 14 : « Le livre d'inventaire est un document obligatoire sur lequel sont transcrits [les états financiers] de chaque exercice ainsi que le résumé de l'opération d'inventaire. »",
    };
  }

  /** Toutes les versions transcrites d'un exercice, la plus récente en tête. */
  async lister(tenantId: string, exerciceId: string) {
    await this.exercice(tenantId, exerciceId);
    return this.prisma.transcriptionInventaire.findMany({
      where: { tenantId, exerciceId },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * La transcription en vigueur : la dernière version. `null` si l'exercice
   * n'a jamais été transcrit · état que l'article 24 vise directement, donc
   * jamais déguisé en transcription vide.
   */
  async courante(tenantId: string, exerciceId: string) {
    await this.exercice(tenantId, exerciceId);
    return this.prisma.transcriptionInventaire.findFirst({
      where: { tenantId, exerciceId },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * Transcrit les états financiers de l'exercice au livre d'inventaire.
   *
   * Chaque appel crée une VERSION : un exercice rouvert et corrigé se
   * re-transcrit sans effacer ce qui avait été arrêté. Écraser reviendrait à
   * réécrire une page du livre relié.
   */
  async transcrire(tenantId: string, userId: string, dto: TranscrireInventaireDto) {
    const exercice = await this.exercice(tenantId, dto.exerciceId);
    const regime = await this.regimeInventaire(tenantId);

    const etats: Partial<Record<CleEtatInventaire, unknown>> = {};
    const manquants: DocumentManquant[] = [];

    for (const etat of regime.exiges) {
      if (!etat.disponible) {
        manquants.push({ cle: etat.cle, libelle: etat.libelle, motif: etat.motifIndisponibilite! });
        continue;
      }
      etats[etat.cle] = regime.syscohada
        ? await this.produireSyscohada(etat.cle, regime.systeme, tenantId, exercice.id)
        : await this.produire(etat.cle, regime.jeu!, tenantId, exercice.id);
    }

    const dernier = await this.prisma.transcriptionInventaire.findFirst({
      where: { tenantId, exerciceId: exercice.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return this.prisma.transcriptionInventaire.create({
      data: {
        tenantId,
        exerciceId: exercice.id,
        version: (dernier?.version ?? 0) + 1,
        jeu: regime.jeu,
        systemeSyscohada: regime.systeme,
        etats: etats as Prisma.InputJsonValue,
        documentsManquants: manquants as unknown as Prisma.InputJsonValue,
        resumeOperationInventaire: dto.resumeOperationInventaire?.trim() || null,
        transcritPar: userId,
      },
    });
  }

  /**
   * Complète le résumé de l'opération d'inventaire sur une transcription
   * existante. Seul champ modifiable : les états, eux, sont figés · les
   * retoucher viderait la transcription de son sens (voir l'en-tête).
   */
  async renseignerResume(tenantId: string, id: string, dto: ResumeInventaireDto) {
    const transcription = await this.prisma.transcriptionInventaire.findFirst({ where: { id, tenantId } });
    if (!transcription) throw new NotFoundException('Transcription introuvable pour ce dossier.');
    return this.prisma.transcriptionInventaire.update({
      where: { id },
      data: { resumeOperationInventaire: dto.resumeOperationInventaire.trim() },
    });
  }

  /**
   * État de conformité de l'exercice au regard de l'article 14, tel qu'un
   * auditeur le constaterait. Comme pour le registre des donateurs, ce sont
   * des CONSTATATIONS : le service ne conclut pas à la place de qui signe.
   */
  async conformite(tenantId: string, exerciceId: string) {
    const exercice = await this.exercice(tenantId, exerciceId);
    const regime = await this.regimeInventaire(tenantId);
    const courante = await this.courante(tenantId, exerciceId);
    const exiges = regime.exiges;
    const manquants = (courante?.documentsManquants ?? []) as unknown as DocumentManquant[];

    return {
      exercice: { id: exercice.id, dateDebut: exercice.dateDebut, dateFin: exercice.dateFin },
      jeu: regime.jeu,
      systemeSyscohada: regime.systeme,
      exigence: regime.exigence,
      /** L'exercice a-t-il été transcrit, ne serait-ce qu'une fois ? */
      transcrit: courante !== null,
      version: courante?.version ?? null,
      transcritLe: courante?.transcritLe ?? null,
      etatsExiges: exiges.map((e) => ({
        cle: e.cle,
        libelle: e.libelle,
        transcrit: courante ? Object.prototype.hasOwnProperty.call(courante.etats as object, e.cle) : false,
        motifIndisponibilite: e.motifIndisponibilite ?? null,
      })),
      documentsManquants: manquants,
      /**
       * Le résumé est exigé par l'article au même titre que les états : une
       * transcription sans résumé n'est pas complète, et le texte n'en
       * définissant pas le contenu, le logiciel ne peut que le réclamer.
       */
      resume: {
        exigence: regime.syscohada
          ? "AUDCIF art. 19 : « … ainsi que le résumé de l'opération d'inventaire »."
          : "Art. 14 : « … ainsi que le résumé de l'opération d'inventaire ».",
        renseigne: Boolean(courante?.resumeOperationInventaire?.trim()),
        // Les DEUX textes exigent ce résumé sans en définir ni le contenu ni
        // la forme · c'est la même lacune des deux côtés, et elle se comble
        // par la rédaction du dossier, jamais par le logiciel.
        remarque:
          "Le référentiel exige ce résumé mais n'en définit ni le contenu ni la forme. Il relève de la rédaction du dossier.",
      },
      complete:
        courante !== null &&
        manquants.length === 0 &&
        Boolean(courante.resumeOperationInventaire?.trim()),
    };
  }

  /**
   * Appelle l'état correspondant à la clé.
   *
   * Le `jeu` est PASSÉ, jamais rechargé ici : c'est celui que `transcrire` a
   * lu et qu'il fige sur la transcription. Le relire donnerait deux sources
   * de vérité pour une même transcription, et un changement de jeu entre les
   * deux lectures produirait un livre dont les états ne correspondraient plus
   * au point de l'article 14 qu'il déclare appliquer.
   */
  /**
   * Les trois états de l'AUDCIF art. 19, chemin SYSCOHADA.
   *
   * Le système est PASSÉ, jamais rechargé · même raison qu'au jeu du SYCEBNL :
   * deux lectures donneraient deux sources de vérité pour une même
   * transcription.
   */
  private async produireSyscohada(
    cle: CleEtatInventaire,
    systeme: SystemeComptableSyscohada | null,
    tenantId: string,
    exerciceId: string,
  ) {
    const smt = systeme === SystemeComptableSyscohada.MINIMAL_TRESORERIE;
    switch (cle) {
      case 'bilan':
        // Le bilan du SMT n'est pas une présentation abrégée du Système
        // normal · il est bâti sur une comptabilité de trésorerie (Titre X,
        // ch. 2), l'autre sur une comptabilité d'engagement.
        return smt ? this.etatsSmtSyscohada.bilan(tenantId, exerciceId) : this.etatsSyscohada.bilan(tenantId, exerciceId);
      case 'compteDeResultat':
        return smt
          ? this.etatsSmtSyscohada.compteDeResultat(tenantId, exerciceId)
          : this.etatsSyscohada.compteDeResultat(tenantId, exerciceId);
      case 'tableauFluxTresorerie':
        // Jamais atteint au SMT · `etatsExigesParSysteme` ne l'y demande pas
        // (voir correspondance-inventaire-syscohada.ts, et la lecture qui y
        // est écrite pour être discutée).
        return this.etatsSyscohada.tableauFluxTresorerie(tenantId, exerciceId);
      default:
        throw new BadRequestException(
          `L'article 19 de l'AUDCIF n'énumère pas l'état « ${cle} » · il ne se transcrit pas sur ce chemin.`,
        );
    }
  }

  private async produire(
    cle: CleEtatInventaire,
    jeu: JeuEtatsFinanciersSycebnl,
    tenantId: string,
    exerciceId: string,
  ) {
    const projet = jeu === JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT;
    const smt = jeu === JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE;
    switch (cle) {
      case 'bilan':
        // Les trois jeux ont un Bilan mais ce ne sont pas les mêmes postes :
        // Partie 4 ch. 2 pour les associations, ch. 3 pour les projets, ch. 4
        // pour le S.M.T (cinq lignes d'actif, quatre de passif).
        if (projet) return this.etatsFinanciersProjet.bilan(tenantId, exerciceId);
        if (smt) return this.etatsFinanciersSmt.bilan(tenantId, exerciceId);
        return this.etatsFinanciers.bilan(tenantId, exerciceId);
      case 'compteDeResultat':
        // Le compte de résultat du S.M.T est bâti sur les encaissements et
        // décaissements, pas sur les soldes des classes 6 et 7 · c'est un
        // autre état, pas une autre présentation du même.
        return smt
          ? this.etatsFinanciersSmt.compteDeResultat(tenantId, exerciceId)
          : this.etatsFinanciers.compteDeResultat(tenantId, exerciceId);
      case 'tableauFluxTresorerie':
        return this.etatsFinanciers.tableauFluxTresorerie(tenantId, exerciceId);
      case 'compteExploitation':
        return this.etatsFinanciersProjet.compteExploitation(tenantId, exerciceId);
      case 'tableauEmploisRessources':
        return this.etatsFinanciersProjet.tableauEmploisRessources(tenantId, exerciceId);
      case 'tableauExecutionBudgetaire':
        return this.etatsFinanciersProjetBudget.executionBudgetaire(tenantId, exerciceId);
      case 'tableauReconciliationTresorerie':
        // Les paiements en instance (repère H) sont extra-comptables : la
        // transcription au livre d'inventaire les fige à zéro, faute d'une
        // saisie possible à cet instant. L'état imprimé depuis l'écran, lui,
        // les porte. La différence est assumée : le livre d'inventaire fige
        // ce que la comptabilité établit.
        return this.etatsFinanciersProjetBudget.reconciliationTresorerie(tenantId, exerciceId, 0);
      default:
        // Les trois états du point 2 non encore construits ne passent jamais
        // ici : `transcrire` les écarte sur `disponible: false`.
        throw new BadRequestException(`État « ${cle} » non producible par cette version de l'application.`);
    }
  }

  private async exercice(tenantId: string, exerciceId: string) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!exercice) throw new NotFoundException('Exercice introuvable pour ce dossier.');
    return exercice;
  }
}

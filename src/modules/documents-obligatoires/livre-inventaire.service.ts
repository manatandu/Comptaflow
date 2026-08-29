import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JeuEtatsFinanciersSycebnl, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EtatsFinanciersService } from '../etats-financiers/etats-financiers.service';
import { EtatsFinanciersProjetService } from '../etats-financiers/etats-financiers-projet.service';
import { CleEtatInventaire, EtatATranscrire, etatsExigesPar } from './correspondance-inventaire';
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
  ) {}

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
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { jeuEtatsFinanciersSycebnl: true },
    });
    const jeu = tenant.jeuEtatsFinanciersSycebnl;

    const exiges = etatsExigesPar(jeu);
    const etats: Partial<Record<CleEtatInventaire, unknown>> = {};
    const manquants: DocumentManquant[] = [];

    for (const etat of exiges) {
      if (!etat.disponible) {
        manquants.push({ cle: etat.cle, libelle: etat.libelle, motif: etat.motifIndisponibilite! });
        continue;
      }
      etats[etat.cle] = await this.produire(etat.cle, jeu, tenantId, exercice.id);
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
        jeu,
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
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { jeuEtatsFinanciersSycebnl: true },
    });
    const courante = await this.courante(tenantId, exerciceId);
    const exiges = etatsExigesPar(tenant.jeuEtatsFinanciersSycebnl);
    const manquants = (courante?.documentsManquants ?? []) as unknown as DocumentManquant[];

    return {
      exercice: { id: exercice.id, dateDebut: exercice.dateDebut, dateFin: exercice.dateFin },
      jeu: tenant.jeuEtatsFinanciersSycebnl,
      exigence:
        "Art. 14 : « Le livre d'inventaire est un document obligatoire sur lequel sont transcrits [les états financiers] de chaque exercice ainsi que le résumé de l'opération d'inventaire. »",
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
        exigence: "Art. 14 : « … ainsi que le résumé de l'opération d'inventaire ».",
        renseigne: Boolean(courante?.resumeOperationInventaire?.trim()),
        remarque:
          "Le référentiel exige ce résumé mais n'en définit ni le contenu ni la forme (ni le glossaire, ni le cadre conceptuel, ni la Partie 2 ch. 2). Il relève de la rédaction du dossier.",
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
  private async produire(
    cle: CleEtatInventaire,
    jeu: JeuEtatsFinanciersSycebnl,
    tenantId: string,
    exerciceId: string,
  ) {
    const projet = jeu === JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT;
    switch (cle) {
      case 'bilan':
        // Les deux jeux ont un Bilan (art. 14, points 1 et 2) mais ce ne sont
        // pas les mêmes postes : Partie 4 ch. 2 pour l'un, ch. 3 pour l'autre.
        return projet
          ? this.etatsFinanciersProjet.bilan(tenantId, exerciceId)
          : this.etatsFinanciers.bilan(tenantId, exerciceId);
      case 'compteDeResultat':
        return this.etatsFinanciers.compteDeResultat(tenantId, exerciceId);
      case 'tableauFluxTresorerie':
        return this.etatsFinanciers.tableauFluxTresorerie(tenantId, exerciceId);
      case 'compteExploitation':
        return this.etatsFinanciersProjet.compteExploitation(tenantId, exerciceId);
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

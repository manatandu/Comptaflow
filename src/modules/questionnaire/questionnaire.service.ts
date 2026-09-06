import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CycleQuestionnaire, Referentiel, ReponseItem, StatutQuestionnaire } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  ITEMS_QUESTIONNAIRE,
  ITEM_PAR_CODE,
  type ItemQuestionnaire,
} from './catalogue-questionnaire';
import { ClorerQuestionnaireDto, CreerQuestionnaireDto, RepondreDto } from './dto/questionnaire.dto';

/**
 * QUESTIONNAIRE DE RÉVISION PAR CYCLE.
 *
 * Le catalogue porte les vingt-quatre items interrogatifs du CPCC mot pour
 * mot, ses dix-sept impératifs, et vingt-cinq questions de l'éditeur sur les
 * cycles que le séminaire ne couvre pas. Chaque item porte son ORIGINE, et
 * c'est la garantie centrale du module : une question de VMG ne se citera
 * jamais comme une exigence du CPCC.
 *
 * QUATRE REFUS, chacun contre un défaut qui laisse le questionnaire
 * parfaitement rempli :
 *
 *  1. LA POLARITÉ N'EST PAS DEVINÉE. Vingt-trois items font du « Non »
 *     l'exception. UN SEUL fait du « Oui » l'anomalie : « Y a-t-il un
 *     chevauchement avec l'exercice en cours sur le solde d'ouverture ? ». Un
 *     moteur qui compterait les « Non » rendrait un questionnaire vert sur le
 *     seul item du CPCC qui porte sur la correspondance des bilans, et
 *     rouge nulle part ailleurs. `estException()` lit la polarité du
 *     catalogue, jamais la réponse seule.
 *  2. UN ITEM FERMÉ NE SE RÉPOND PAS. « Si oui, une attestation a-t-elle été
 *     établie ? » n'a pas de sens quand le comptage n'a pas eu lieu, et
 *     « Si non, comment a-t-on procédé pour la sélection ? » n'en a pas quand
 *     tout le monde a été circularisé. Répondre quand même produirait une
 *     réponse orpheline, qui compte dans le taux et ne veut rien dire.
 *  3. UNE FORME NE S'ÉCHANGE PAS CONTRE UNE AUTRE. « À quels moments les
 *     biens ont-ils été valorisés ? » appelle une DATE, « Quelles dispositions
 *     assurent le cut-off ? » un TEXTE, « Vérifier les titres de propriété »
 *     un RENVOI de travaux. Un « Oui » à l'une des trois est un
 *     acquiescement qui ne répond pas à la question posée.
 *  4. UNE EXCEPTION SANS COMMENTAIRE NE CLÔT PAS. Une case rouge sans phrase
 *     ne dit rien à celui qui reprendra le dossier l'an prochain · et c'est
 *     précisément lui que CPCC-PRO-6 envoie « faire le suivi des faiblesses
 *     relevées lors de l'audit précédent ».
 *
 * ET LE MODULE NE POSE AUCUN SEUIL. CPCC-CRE-5 demande « Combien de réponses
 * a-t-on reçues ? Si le pourcentage est INSIGNIFIANT, a-t-on relancé ? » sans
 * jamais chiffrer « insignifiant ». En inventer un ferait passer pour une
 * exigence du séminaire un nombre qu'il n'a pas écrit.
 */
@Injectable()
export class QuestionnaireService {
  constructor(private readonly prisma: PrismaService) {}

  static readonly ITEMS = ITEMS_QUESTIONNAIRE;

  /** Les vingt-quatre items interrogatifs du CPCC · ni plus, ni moins. */
  static itemsInterrogatifsCpcc(): ItemQuestionnaire[] {
    return ITEMS_QUESTIONNAIRE.filter((i) => i.origine === 'CPCC' && i.forme !== 'TRAVAIL');
  }

  /**
   * Les items d'un questionnaire · les cycles retenus, et le référentiel du
   * dossier. Un item marqué SYCEBNL ne se pose pas à une société commerciale,
   * et l'inverse serait un contresens plutôt qu'une question de trop.
   */
  static itemsRetenus(cycles: CycleQuestionnaire[], referentiel: Referentiel): ItemQuestionnaire[] {
    const tousLesCycles = cycles.length === 0;
    return ITEMS_QUESTIONNAIRE.filter(
      (i) => (tousLesCycles || cycles.includes(i.cycle)) && (!i.referentiel || i.referentiel === referentiel),
    );
  }

  /**
   * LA POLARITÉ · « Non » ouvre l'exception, sauf là où le catalogue dit le
   * contraire.
   *
   * SANS_OBJET n'en est jamais une · le cycle n'existe pas dans ce dossier, ce
   * n'est pas un manquement. Aucun garde-fou ne l'écarte pour autant : la
   * comparaison est POSITIVE des deux côtés (« est-ce OUI », « est-ce NON »),
   * et SANS_OBJET n'est ni l'un ni l'autre. Écrire le refus en négatif
   * (`!== OUI`) le ferait basculer en exception sans que rien d'autre ne
   * change · c'est cette forme-là qu'un test surveille.
   */
  static estException(item: ItemQuestionnaire, reponse: ReponseItem | null): boolean {
    if (item.forme !== 'OUI_NON' || reponse === null) return false;
    const polarite = item.polariteException ?? 'NON';
    return polarite === 'OUI' ? reponse === ReponseItem.OUI : reponse === ReponseItem.NON;
  }

  /**
   * UN ITEM CHAÎNÉ N'EST OUVERT QUE PAR LA RÉPONSE QUE SON LIBELLÉ ANNONCE.
   * Le parent sans réponse ferme l'enfant · on ne répond pas à « Si oui… »
   * avant d'avoir répondu à la question dont il dépend.
   */
  static estOuvert(item: ItemQuestionnaire, reponses: Map<string, ReponseItem | null>): boolean {
    if (!item.ouvertPar) return true;
    return reponses.get(item.ouvertPar.code) === ReponseItem[item.ouvertPar.reponse];
  }

  /**
   * CE QUI EMPÊCHE DE CLORE · deux motifs seulement, et aucun n'est un seuil.
   */
  static motifsRefusCloture(
    items: ItemQuestionnaire[],
    reponses: { code: string; reponse: ReponseItem | null; valeur: string | null; renvoiTravaux: string | null; estException: boolean; commentaire: string | null }[],
  ): string[] {
    const parCode = new Map(reponses.map((r) => [r.code, r]));
    const reponsesFermees = new Map(reponses.map((r) => [r.code, r.reponse]));
    const motifs: string[] = [];

    const sansReponse = items.filter((i) => {
      if (!QuestionnaireService.estOuvert(i, reponsesFermees)) return false;
      const r = parCode.get(i.code);
      if (!r) return true;
      if (i.forme === 'OUI_NON') return r.reponse === null;
      if (i.forme === 'TRAVAIL') return !r.renvoiTravaux?.trim();
      return !r.valeur?.trim();
    });
    if (sansReponse.length > 0) {
      motifs.push(
        `${sansReponse.length} item(s) ouvert(s) sans réponse (${sansReponse.slice(0, 8).map((i) => i.code).join(', ')}${sansReponse.length > 8 ? '…' : ''}) · ` +
          "un questionnaire à trous ne se distingue pas d'un questionnaire favorable.",
      );
    }

    const exceptionsNues = reponses.filter((r) => r.estException && !r.commentaire?.trim());
    if (exceptionsNues.length > 0) {
      motifs.push(
        `${exceptionsNues.length} exception(s) sans commentaire (${exceptionsNues.map((r) => r.code).join(', ')}) · ` +
          "une case rouge sans phrase ne dit rien à celui qui reprendra le dossier, et c'est lui que le CPCC envoie « faire le suivi des faiblesses relevées lors de l'audit précédent ».",
      );
    }

    return motifs;
  }

  private async questionnaire(tenantId: string, id: string, statutsAdmis?: StatutQuestionnaire[]) {
    const q = await this.prisma.questionnaireRevision.findFirst({ where: { id, tenantId } });
    if (!q) throw new NotFoundException('Questionnaire de révision introuvable.');
    if (statutsAdmis && !statutsAdmis.includes(q.statut)) {
      throw new ForbiddenException(
        `Ce questionnaire est au statut ${q.statut} · l'opération demandée n'est possible qu'en ${statutsAdmis.join(' ou ')}.`,
      );
    }
    return q;
  }

  private async referentielDuDossier(tenantId: string): Promise<Referentiel> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { referentiel: true } });
    return tenant?.referentiel ?? Referentiel.SYCEBNL;
  }

  async creer(tenantId: string, userId: string, dto: CreerQuestionnaireDto) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new NotFoundException('Exercice introuvable.');
    return this.prisma.questionnaireRevision.create({
      data: {
        tenantId,
        exerciceId: dto.exerciceId,
        libelle: dto.libelle.trim(),
        cycles: dto.cycles ?? [],
        createdBy: userId,
      },
    });
  }

  /**
   * RÉPONDRE · c'est ici que les trois premiers refus s'appliquent, et que
   * `estException` est FIGÉ. Le recalculer à l'affichage ferait basculer une
   * ligne du vert au rouge le jour où quelqu'un corrigerait une polarité au
   * catalogue, sans que rien n'ait changé au dossier.
   */
  async repondre(tenantId: string, questionnaireId: string, userId: string, dto: RepondreDto) {
    await this.questionnaire(tenantId, questionnaireId, [StatutQuestionnaire.OUVERT]);
    const item = ITEM_PAR_CODE.get(dto.code);
    if (!item) throw new NotFoundException(`Item ${dto.code} inconnu du catalogue.`);

    const referentiel = await this.referentielDuDossier(tenantId);
    if (item.referentiel && item.referentiel !== referentiel) {
      throw new BadRequestException(
        `L'item ${item.code} ne se pose qu'en ${item.referentiel} · le poser ici serait un contresens, pas une question de plus.`,
      );
    }

    if (item.ouvertPar) {
      const parent = await this.prisma.reponseQuestionnaire.findUnique({
        where: { questionnaireId_code: { questionnaireId, code: item.ouvertPar.code } },
      });
      const attendue = ReponseItem[item.ouvertPar.reponse];
      if (parent?.reponse !== attendue) {
        throw new BadRequestException(
          `L'item ${item.code} n'est ouvert que si ${item.ouvertPar.code} a reçu « ${item.ouvertPar.reponse} » · son libellé le dit lui-même. ` +
            "Répondre quand même produirait une réponse orpheline, qui compterait dans le taux sans rien vouloir dire.",
        );
      }
    }

    if (item.forme === 'OUI_NON') {
      if (!dto.reponse) {
        throw new BadRequestException(`L'item ${item.code} est une question fermée · répondre OUI, NON ou SANS_OBJET.`);
      }
    } else if (dto.reponse) {
      const attendu =
        item.forme === 'DONNEE'
          ? 'une donnée · une date, un nombre'
          : item.forme === 'TEXTE_LIBRE'
            ? 'une description'
            : 'un renvoi au papier de travail';
      throw new BadRequestException(
        `L'item ${item.code} n'est pas une question fermée : il appelle ${attendu}. ` +
          "Un « Oui » y serait un acquiescement qui ne répond pas à la question posée.",
      );
    }

    if (item.forme === 'TRAVAIL' && !dto.renvoiTravaux?.trim()) {
      throw new BadRequestException(
        `L'item ${item.code} est un travail à conduire, pas une question · indiquer le renvoi au papier de travail.`,
      );
    }
    if ((item.forme === 'DONNEE' || item.forme === 'TEXTE_LIBRE') && !dto.valeur?.trim()) {
      throw new BadRequestException(`L'item ${item.code} appelle une réponse écrite, pas une case.`);
    }

    const estException = QuestionnaireService.estException(item, dto.reponse ?? null);
    const donnees = {
      reponse: dto.reponse ?? null,
      valeur: dto.valeur?.trim() || null,
      renvoiTravaux: dto.renvoiTravaux?.trim() || null,
      commentaire: dto.commentaire?.trim() || null,
      estException,
      reponduLe: new Date(),
      reponduPar: userId,
    };

    return this.prisma.reponseQuestionnaire.upsert({
      where: { questionnaireId_code: { questionnaireId, code: item.code } },
      create: { tenantId, questionnaireId, code: item.code, ...donnees },
      update: donnees,
    });
  }

  async clore(tenantId: string, questionnaireId: string, userId: string, dto: ClorerQuestionnaireDto) {
    const q = await this.questionnaire(tenantId, questionnaireId, [StatutQuestionnaire.OUVERT]);
    const referentiel = await this.referentielDuDossier(tenantId);
    const items = QuestionnaireService.itemsRetenus(q.cycles, referentiel);
    const reponses = await this.prisma.reponseQuestionnaire.findMany({ where: { tenantId, questionnaireId } });

    const motifs = QuestionnaireService.motifsRefusCloture(items, reponses);
    if (motifs.length > 0) throw new ForbiddenException(motifs.join(' · '));

    return this.prisma.questionnaireRevision.update({
      where: { id: questionnaireId },
      data: {
        statut: StatutQuestionnaire.CLOS,
        closLe: new Date(),
        closPar: userId,
        motifCloture: dto.motifCloture?.trim() || null,
      },
    });
  }

  async lister(tenantId: string, exerciceId?: string) {
    return this.prisma.questionnaireRevision.findMany({
      where: { tenantId, ...(exerciceId ? { exerciceId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { reponses: true } } },
    });
  }

  /**
   * LA FEUILLE · chaque item, sa réponse, son ouverture, et deux chiffres qui
   * ne se confondent pas. Le taux de réponse ne compte QUE les questions : y
   * mêler les dix-sept impératifs du CPCC ferait monter un pourcentage que
   * personne ne pourrait plus lire.
   */
  async consulter(tenantId: string, questionnaireId: string) {
    const q = await this.prisma.questionnaireRevision.findFirst({
      where: { id: questionnaireId, tenantId },
      include: { reponses: true },
    });
    if (!q) throw new NotFoundException('Questionnaire de révision introuvable.');

    const referentiel = await this.referentielDuDossier(tenantId);
    const items = QuestionnaireService.itemsRetenus(q.cycles, referentiel);
    const parCode = new Map(q.reponses.map((r) => [r.code, r]));
    const reponsesFermees = new Map(q.reponses.map((r) => [r.code, r.reponse]));

    const lignes = items.map((i) => ({
      ...i,
      ouvert: QuestionnaireService.estOuvert(i, reponsesFermees),
      reponse: parCode.get(i.code) ?? null,
    }));

    const questions = lignes.filter((l) => l.forme !== 'TRAVAIL' && l.ouvert);
    const repondues = questions.filter((l) => l.reponse && (l.reponse.reponse !== null || l.reponse.valeur));
    const travaux = lignes.filter((l) => l.forme === 'TRAVAIL' && l.ouvert);
    const travauxFaits = travaux.filter((l) => l.reponse?.renvoiTravaux);
    const exceptions = q.reponses.filter((r) => r.estException);

    return {
      ...q,
      lignes,
      synthese: {
        questions: questions.length,
        repondues: repondues.length,
        tauxReponse: questions.length > 0 ? Number(((repondues.length / questions.length) * 100).toFixed(1)) : 0,
        travaux: travaux.length,
        travauxFaits: travauxFaits.length,
        exceptions: exceptions.length,
        exceptionsSansCommentaire: exceptions.filter((r) => !r.commentaire?.trim()).length,
        itemsCpcc: lignes.filter((l) => l.origine === 'CPCC').length,
        itemsVmg: lignes.filter((l) => l.origine === 'VMG').length,
      },
      motifsRefusCloture: QuestionnaireService.motifsRefusCloture(items, q.reponses),
    };
  }
}

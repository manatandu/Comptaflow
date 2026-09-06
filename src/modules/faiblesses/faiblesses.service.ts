import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  FaiblesseControleInterne,
  OrigineFaiblesse,
  QualificationFaiblesse,
  StatutFaiblesse,
  StatutRegistreFaiblesses,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  AjouterFaiblesseDto,
  ClorerRegistreDto,
  CommuniquerDto,
  CreerRegistreFaiblessesDto,
  EscaladerDto,
  QualifierDto,
  ReponseDirectionDto,
  ReporterDto,
  SuivreDto,
} from './dto/faiblesses.dto';

/**
 * REGISTRE DES FAIBLESSES DU CONTRÔLE INTERNE · ISA 265.
 *
 * Le CPCC pose la phrase et s'arrête là : parmi les travaux de l'inventaire
 * documentaire, « faire le suivi des faiblesses relevées lors de l'audit
 * précédent ». Il ne dit ni ce que ce suivi contient, ni ce qu'il refuse. La
 * matière est dans l'ISA 265, « Communicating Deficiencies in Internal Control
 * to Those Charged with Governance and Management ».
 *
 * ET LE REGISTRE EST OUVERT DEUX FOIS, parce que le cabinet occupe tour à tour
 * deux places qui n'ont pas les mêmes droits :
 *
 *  · REVISION_INTERNE · le cabinet constate sur son propre travail de tenue,
 *    au titre de l'étape « révision (self audit) » du CPCC. Il décrit, il
 *    qualifie, il recommande.
 *  · RECOMMANDATION_EXTERNE · une lettre de recommandations est arrivée d'un
 *    réviseur, d'un commissaire aux comptes ou d'un bailleur. OmegaX est alors
 *    le PORTE-DOCUMENTS de la direction : il range, il suit les échéances, il
 *    ne requalifie rien. La qualification portée dans la lettre est recopiée
 *    telle quelle, et le cabinet n'a pas à en juger.
 *
 * Comme pour la circularisation, la norme est reprise comme référence de
 * MÉTHODE. Un cabinet qui tient les livres n'est pas l'auditeur de ces livres,
 * et aucune opinion ne sort d'ici.
 *
 * CINQ REFUS, chacun contre un défaut qui laisse le registre présentable :
 *
 *  1. RIEN NE SE QUALIFIE TOUT SEUL. § 6 b) : une faiblesse n'est
 *     significative que « in the auditor's PROFESSIONAL JUDGMENT », et § 8
 *     confie la détermination au jugement porté « on the basis of the audit
 *     work performed ». Aucun montant n'y conduit dans ce module, et les
 *     indicateurs du § A7, qui sont donnés « for example », n'y conduisent pas
 *     davantage : les cocher éclaire le jugement, cela ne le remplace pas.
 *  2. UNE SIGNIFICATIVE SANS ÉCRIT NE CLÔT PAS LE REGISTRE. § 9 : « the
 *     auditor SHALL communicate IN WRITING significant deficiencies ». Un
 *     registre où dix faiblesses graves sont décrites, recommandées, suivies,
 *     et où aucune n'est jamais sortie par écrit, se lit exactement comme un
 *     registre tenu.
 *  3. LE REPORT EST À DEUX RÉGIMES, ET C'EST LE CŒUR DU MODULE. Sur une
 *     SIGNIFICATIVE non remédiée, § A17 : « the fact that the auditor
 *     communicated a significant deficiency […] in a previous audit does NOT
 *     eliminate the need to repeat the communication if remedial action has
 *     not yet been taken ». Sur une AUTRE faiblesse, § A24 dit l'inverse :
 *     « the auditor NEED NOT REPEAT the communication in the current period ».
 *     Un module qui traiterait les deux pareil se tromperait dans les deux
 *     sens · silence coupable d'un côté, bruit inutile de l'autre.
 *  4. L'AUTEUR DU CONSTAT N'EST PAS L'AUTEUR DE LA RÉPONSE. § A28 range parmi
 *     le contenu possible de la communication « MANAGEMENT'S actual or
 *     proposed responses » : la réponse appartient à la direction. Le même
 *     utilisateur ne peut pas signer les deux.
 *  5. AUCUN CHIFFRAGE N'EST DEMANDÉ. § A28 : « In explaining the potential
 *     effects of the significant deficiencies, the auditor NEED NOT QUANTIFY
 *     those effects. » Il n'existe donc dans ce module aucun champ de montant
 *     sur une faiblesse · en réclamer un fabriquerait une précision dont la
 *     norme dispense, et ferait passer pour mineure toute faiblesse qu'on ne
 *     sait pas chiffrer.
 */
@Injectable()
export class FaiblessesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * § A7 · « Indicators of significant deficiencies in internal control
   * include, FOR EXAMPLE ». La liste est ouverte et elle est indicative : le
   * module la propose au jugement, il n'en tire aucune conséquence.
   */
  static readonly INDICATEURS_A7 = [
    'ENVIRONNEMENT_DE_CONTROLE_INEFFICACE',
    'FRAUDE_DE_LA_DIRECTION_NON_PREVENUE',
    'REMEDIATION_ANTERIEURE_NON_MISE_EN_OEUVRE',
    'ABSENCE_DE_PROCESSUS_D_EVALUATION_DES_RISQUES',
    'PROCESSUS_D_EVALUATION_DES_RISQUES_INEFFICACE',
    'REPONSE_INEFFICACE_A_UN_RISQUE_SIGNIFICATIF',
    'ANOMALIES_NON_DETECTEES_PAR_LE_CONTROLE_INTERNE',
    'RETRAITEMENT_D_ETATS_FINANCIERS_DEJA_PUBLIES',
    'INCAPACITE_A_SUPERVISER_L_ETABLISSEMENT_DES_ETATS',
  ] as const;

  /**
   * § 11 b) · l'écrit doit porter « sufficient information to enable those
   * charged with governance and management to UNDERSTAND THE CONTEXT of the
   * communication ». La norme écrit ce contexte pour un audit ; ici le travail
   * n'en est pas un, et le dire est précisément ce que le paragraphe demande.
   */
  static readonly MENTIONS_CONTEXTE = [
    "Ce registre est tenu au titre de la révision du dossier. Ce n'est pas un audit et aucune opinion sur les états financiers n'en sort.",
    "L'examen du contrôle interne y est celui qui sert à orienter les travaux, non celui qui permettrait d'exprimer une opinion sur son efficacité (§ 11 b) ii).",
    "Les faiblesses portées ici sont celles qui ont été relevées au cours des travaux et jugées d'une importance suffisante pour être rapportées · le registre ne prétend pas les recenser toutes (§ 11 b) iii).",
  ] as const;

  /**
   * LE RÉGIME DE REPORT · les deux paragraphes qui disent le contraire l'un de
   * l'autre, et ils ont raison tous les deux.
   *
   * REFUS_DU_REPORT_MUET pour une SIGNIFICATIVE non remédiée (§ A17) : la
   * reconduction doit porter soit la description répétée, soit la référence de
   * la communication antérieure · « may repeat the description […] or simply
   * reference the previous communication ».
   *
   * LIBRE pour une AUTRE faiblesse (§ A24) : « need not repeat ». Le module ne
   * réclame rien, et ne fabrique pas d'exception là où la norme en dispense.
   */
  static regimeDeReport(
    qualification: QualificationFaiblesse,
    statut: StatutFaiblesse,
  ): 'REFUS_DU_REPORT_MUET' | 'LIBRE' {
    if (statut === StatutFaiblesse.REMEDIEE || statut === StatutFaiblesse.SANS_OBJET) return 'LIBRE';
    return qualification === QualificationFaiblesse.SIGNIFICATIVE ? 'REFUS_DU_REPORT_MUET' : 'LIBRE';
  }

  /** Ce qui manque pour reporter cette faiblesse-là. Vide = report possible. */
  static manquesDuReport(
    f: Pick<FaiblesseControleInterne, 'qualification' | 'statut'>,
    reconduction: { communicationReconduite?: string | null },
  ): string[] {
    if (FaiblessesService.regimeDeReport(f.qualification, f.statut) === 'LIBRE') return [];
    const manques: string[] = [];
    if (!reconduction.communicationReconduite?.trim()) {
      manques.push(
        "la communication reconduite · § A17 laisse le choix entre RÉPÉTER la description de l'exercice précédent et RÉFÉRENCER la communication antérieure, mais pas celui de ne rien dire",
      );
    }
    return manques;
  }

  /**
   * CE QUI EMPÊCHE DE CLORE LE REGISTRE.
   *
   * Deux motifs, et ils ne valent qu'en REVISION_INTERNE · en mode
   * porte-documents, ni la qualification ni la communication n'appartiennent
   * au cabinet, et les lui réclamer serait lui faire endosser le travail d'un
   * autre.
   */
  static motifsRefusCloture(
    origine: OrigineFaiblesse,
    faiblesses: Pick<FaiblesseControleInterne, 'reference' | 'qualification' | 'communiqueeLe'>[],
  ): string[] {
    if (origine === OrigineFaiblesse.RECOMMANDATION_EXTERNE) return [];
    const motifs: string[] = [];

    const nonQualifiees = faiblesses.filter((f) => f.qualification === QualificationFaiblesse.NON_QUALIFIEE);
    if (nonQualifiees.length > 0) {
      motifs.push(
        `${nonQualifiees.length} faiblesse(s) non qualifiée(s) (${nonQualifiees.map((f) => f.reference).join(', ')}) · ` +
          "ISA 265 § 8 : l'auditeur « SHALL determine […] whether, individually or in combination, they constitute significant deficiencies ». " +
          "Tant que le jugement n'a pas été porté, il ne l'a pas été.",
      );
    }

    const significativesMuettes = faiblesses.filter(
      (f) => f.qualification === QualificationFaiblesse.SIGNIFICATIVE && !f.communiqueeLe,
    );
    if (significativesMuettes.length > 0) {
      motifs.push(
        `${significativesMuettes.length} faiblesse(s) significative(s) jamais communiquée(s) par écrit ` +
          `(${significativesMuettes.map((f) => f.reference).join(', ')}) · ` +
          "ISA 265 § 9 : « the auditor SHALL communicate IN WRITING significant deficiencies in internal control […] on a timely basis ». " +
          "Un registre décrit, recommandé et suivi, mais jamais sorti par écrit, se lit exactement comme un registre tenu.",
      );
    }

    return motifs;
  }

  private async registre(tenantId: string, id: string, statutsAdmis?: StatutRegistreFaiblesses[]) {
    const r = await this.prisma.registreFaiblesses.findFirst({ where: { id, tenantId } });
    if (!r) throw new NotFoundException('Registre des faiblesses introuvable.');
    if (statutsAdmis && !statutsAdmis.includes(r.statut)) {
      throw new ForbiddenException(
        `Ce registre est au statut ${r.statut} · l'opération demandée n'est possible qu'en ${statutsAdmis.join(' ou ')}.`,
      );
    }
    return r;
  }

  private async faiblesse(tenantId: string, id: string) {
    const f = await this.prisma.faiblesseControleInterne.findFirst({
      where: { id, tenantId },
      include: { registre: true },
    });
    if (!f) throw new NotFoundException('Faiblesse introuvable.');
    if (f.registre.statut === StatutRegistreFaiblesses.CLOS) {
      throw new ForbiddenException('Ce registre est clos · rouvrir un exercice clos n’est pas une modification de faiblesse.');
    }
    return f;
  }

  async creer(tenantId: string, userId: string, dto: CreerRegistreFaiblessesDto) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new NotFoundException('Exercice introuvable.');

    if (dto.origine === OrigineFaiblesse.RECOMMANDATION_EXTERNE) {
      if (!dto.emetteur?.trim() || !dto.dateLettre) {
        throw new BadRequestException(
          "Une recommandation reçue vient de quelqu'un, à une date · l'émetteur et la date de la lettre sont exigés. " +
            "Sans eux, le registre ne dit plus si le constat vient d'un réviseur ou du cabinet lui-même, " +
            'et c’est précisément la distinction que ce mode existe pour tenir.',
        );
      }
    } else if (dto.emetteur?.trim() || dto.dateLettre || dto.referenceLettre?.trim()) {
      throw new BadRequestException(
        "Un registre de révision interne n'a pas d'émetteur tiers · le cabinet ne se cite pas lui-même comme auteur d'une lettre reçue.",
      );
    }

    return this.prisma.registreFaiblesses.create({
      data: {
        tenantId,
        exerciceId: dto.exerciceId,
        origine: dto.origine,
        libelle: dto.libelle.trim(),
        emetteur: dto.emetteur?.trim() || null,
        dateLettre: dto.dateLettre ? new Date(dto.dateLettre) : null,
        referenceLettre: dto.referenceLettre?.trim() || null,
        createdBy: userId,
      },
    });
  }

  /**
   * AJOUTER UNE FAIBLESSE.
   *
   * La description et l'effet potentiel sont exigés : § 11 a) demande « a
   * description of the deficiencies and an explanation of their POTENTIAL
   * EFFECTS ». L'effet est textuel et le restera · § A28, « need not quantify ».
   *
   * En mode porte-documents, la qualification portée par la lettre est
   * recopiée à la saisie et ne sera plus touchée · elle appartient à celui qui
   * l'a écrite.
   */
  async ajouter(tenantId: string, registreId: string, userId: string, dto: AjouterFaiblesseDto) {
    const registre = await this.registre(tenantId, registreId, [StatutRegistreFaiblesses.OUVERT]);

    const inconnus = (dto.indicateursA7 ?? []).filter(
      (i) => !(FaiblessesService.INDICATEURS_A7 as readonly string[]).includes(i),
    );
    if (inconnus.length > 0) {
      throw new BadRequestException(
        `Indicateur(s) hors § A7 : ${inconnus.join(', ')}. La liste du § A7 est celle de la norme · l'élargir ici la ferait passer pour plus large qu'elle.`,
      );
    }

    const externe = registre.origine === OrigineFaiblesse.RECOMMANDATION_EXTERNE;
    if (externe && dto.constatePar?.trim()) {
      throw new BadRequestException(
        "En mode « recommandation reçue », le constat n'est pas celui du cabinet · le champ « constaté par » reste vide, et l'auteur du constat est l'émetteur de la lettre.",
      );
    }

    return this.prisma.faiblesseControleInterne.create({
      data: {
        tenantId,
        registreId,
        reference: dto.reference.trim(),
        intitule: dto.intitule.trim(),
        description: dto.description.trim(),
        effetPotentiel: dto.effetPotentiel.trim(),
        recommandation: dto.recommandation?.trim() || null,
        indicateursA7: dto.indicateursA7 ?? [],
        // En interne, la qualification se pose par un acte séparé et daté.
        // En externe, elle vient de la lettre et se recopie telle quelle.
        qualification: externe ? (dto.qualification ?? QualificationFaiblesse.NON_QUALIFIEE) : QualificationFaiblesse.NON_QUALIFIEE,
        constatePar: externe ? null : (dto.constatePar?.trim() || userId),
        constateLe: externe ? null : new Date(),
        echeanceRemediation: dto.echeanceRemediation ? new Date(dto.echeanceRemediation) : null,
      },
    });
  }

  /**
   * QUALIFIER · l'acte que rien d'autre ne pose.
   *
   * § 6 b) fait de la qualification un JUGEMENT, § 8 en fait une obligation.
   * Le module exige donc les deux moitiés : un auteur et une justification.
   * Il n'existe aucun chemin qui qualifie à partir d'un montant, d'un délai ou
   * d'une case cochée.
   */
  async qualifier(tenantId: string, faiblesseId: string, userId: string, dto: QualifierDto) {
    const f = await this.faiblesse(tenantId, faiblesseId);
    if (f.registre.origine === OrigineFaiblesse.RECOMMANDATION_EXTERNE) {
      throw new ForbiddenException(
        "OmegaX est ici le porte-documents de la direction · la qualification appartient à celui qui a écrit la lettre, et le cabinet ne la refait pas. " +
          'Pour porter un jugement propre au cabinet, ouvrir un registre de révision interne.',
      );
    }
    if (dto.qualification === QualificationFaiblesse.NON_QUALIFIEE) {
      throw new BadRequestException(
        "« Non qualifiée » est l'état de départ, pas une décision · on ne dé-qualifie pas une faiblesse déjà jugée.",
      );
    }
    if (!dto.justification?.trim()) {
      throw new BadRequestException(
        'ISA 265 § 8 · la détermination se fait « on the basis of the audit work performed ». La justification écrite est ce qui distingue un jugement d’une case cochée.',
      );
    }
    return this.prisma.faiblesseControleInterne.update({
      where: { id: faiblesseId },
      data: {
        qualification: dto.qualification,
        qualifiePar: userId,
        qualifieLe: new Date(),
        justificationQualification: dto.justification.trim(),
      },
    });
  }

  /**
   * COMMUNIQUER PAR ÉCRIT · § 9 pour une significative (aux organes de
   * gouvernance), § 10 b) pour une autre faiblesse (à la direction). Le
   * destinataire n'est pas le même, et le module le fait écrire plutôt que de
   * le déduire.
   */
  async communiquer(tenantId: string, faiblesseId: string, dto: CommuniquerDto) {
    const f = await this.faiblesse(tenantId, faiblesseId);
    if (f.qualification === QualificationFaiblesse.NON_QUALIFIEE) {
      throw new BadRequestException(
        "Qualifier d'abord · § 9 vise les significatives et § 10 b) les autres faiblesses. Le destinataire de l'écrit dépend de la qualification.",
      );
    }
    return this.prisma.faiblesseControleInterne.update({
      where: { id: faiblesseId },
      data: { communiqueeLe: new Date(dto.communiqueeLe), communiqueeA: dto.communiqueeA.trim() },
    });
  }

  /**
   * LA RÉPONSE DE LA DIRECTION · § A28, « management's actual or proposed
   * responses ». Elle est de la direction ; le module refuse que l'auteur du
   * constat la signe à sa place.
   */
  async reponseDirection(tenantId: string, faiblesseId: string, userId: string, dto: ReponseDirectionDto) {
    const f = await this.faiblesse(tenantId, faiblesseId);
    const auteurReponse = dto.reponseDirectionPar?.trim() || userId;
    if (f.constatePar && f.constatePar === auteurReponse) {
      throw new ForbiddenException(
        "L'auteur du constat ne peut pas signer la réponse de la direction · ISA 265 § A28 range cette réponse du côté de « MANAGEMENT », " +
          "et un registre où le cabinet se répond à lui-même ne porte plus qu'une seule voix.",
      );
    }
    return this.prisma.faiblesseControleInterne.update({
      where: { id: faiblesseId },
      data: {
        reponseDirection: dto.reponseDirection.trim(),
        reponseDirectionPar: auteurReponse,
        reponseDirectionLe: new Date(),
      },
    });
  }

  /**
   * SUIVRE · le statut change, et « remédiée » est le seul qui coûte quelque
   * chose. § A28 : la communication peut porter « a statement as to WHETHER OR
   * NOT the auditor has undertaken any steps to VERIFY whether management's
   * responses have been implemented ». Une remédiation déclarée par la
   * direction et une remédiation vérifiée par le cabinet ne sont pas le même
   * fait : le module fait écrire lequel des deux, y compris « non vérifiée ».
   */
  async suivre(tenantId: string, faiblesseId: string, dto: SuivreDto) {
    await this.faiblesse(tenantId, faiblesseId);
    if (dto.statut === StatutFaiblesse.REMEDIEE && !dto.verificationCabinet?.trim()) {
      throw new BadRequestException(
        "Dire si le cabinet a vérifié, ou non, que la remédiation a bien été mise en œuvre · ISA 265 § A28. " +
          "« Non vérifiée par le cabinet, déclaration de la direction » est une réponse recevable ; le silence n'en est pas une, " +
          "parce qu'il se lit comme une vérification.",
      );
    }
    if (dto.statut === StatutFaiblesse.NON_REMEDIEE_ASSUMEE && !dto.motifNonRemediation?.trim()) {
      throw new BadRequestException(
        "ISA 265 § A24 admet que la direction choisisse de ne pas y remédier « for cost or other reasons » · encore faut-il que la raison soit écrite. " +
          "§ A17 ajoute qu'« a failure to act, in the absence of a rational explanation, may in itself represent a significant deficiency ».",
      );
    }
    return this.prisma.faiblesseControleInterne.update({
      where: { id: faiblesseId },
      data: {
        statut: dto.statut,
        ...(dto.verificationCabinet !== undefined
          ? { verificationCabinet: dto.verificationCabinet?.trim() || null }
          : {}),
        ...(dto.motifNonRemediation !== undefined
          ? { motifNonRemediation: dto.motifNonRemediation?.trim() || null }
          : {}),
        remedieeLe: dto.statut === StatutFaiblesse.REMEDIEE ? new Date() : null,
      },
    });
  }

  /**
   * REPORTER SUR L'EXERCICE SUIVANT · le double régime, appliqué.
   *
   * C'est ici que « faire le suivi des faiblesses relevées lors de l'audit
   * précédent » cesse d'être une phrase. La faiblesse reconduite naît dans le
   * registre de l'exercice suivant, rattachée à celle qu'elle poursuit, et le
   * lien est unique dans les deux sens : une faiblesse ne se reporte pas deux
   * fois.
   */
  async reporter(tenantId: string, faiblesseId: string, dto: ReporterDto) {
    const source = await this.prisma.faiblesseControleInterne.findFirst({
      where: { id: faiblesseId, tenantId },
      include: { registre: true, reconduction: true },
    });
    if (!source) throw new NotFoundException('Faiblesse introuvable.');
    if (source.reconduction) {
      throw new ForbiddenException(
        `Cette faiblesse est déjà reportée sous la référence ${source.reconduction.reference} · une faiblesse ne se suit pas sur deux fils à la fois.`,
      );
    }

    const cible = await this.registre(tenantId, dto.registreCibleId, [StatutRegistreFaiblesses.OUVERT]);
    if (cible.id === source.registreId) {
      throw new BadRequestException("Le registre cible est celui d'origine · un report va vers l'exercice suivant.");
    }

    const manques = FaiblessesService.manquesDuReport(source, dto);
    if (manques.length > 0) {
      throw new ForbiddenException(
        `Report d'une faiblesse SIGNIFICATIVE non remédiée · ISA 265 § A17 : « the fact that the auditor communicated a significant deficiency […] in a previous audit does NOT eliminate the need for the auditor to REPEAT the communication if remedial action has not yet been taken ». ` +
          `Manque : ${manques.join(' ; ')}.`,
      );
    }

    return this.prisma.faiblesseControleInterne.create({
      data: {
        tenantId,
        registreId: cible.id,
        faiblesseAnterieureId: source.id,
        reference: dto.reference?.trim() || source.reference,
        intitule: source.intitule,
        // § A17 · « may REPEAT the description from the previous
        // communication, or simply REFERENCE the previous communication ».
        description: dto.communicationReconduite?.trim() || source.description,
        effetPotentiel: source.effetPotentiel,
        recommandation: source.recommandation,
        indicateursA7: source.indicateursA7,
        // La qualification suit la faiblesse · le report ne rejuge rien, et ne
        // dégrade rien non plus.
        qualification: source.qualification,
        qualifiePar: source.qualifiePar,
        qualifieLe: source.qualifieLe,
        justificationQualification: source.justificationQualification,
        constatePar: source.constatePar,
        constateLe: source.constateLe,
        statut: StatutFaiblesse.OUVERTE,
        motifNonRemediation: dto.motifNonRemediation?.trim() || source.motifNonRemediation,
        echeanceRemediation: dto.echeanceRemediation ? new Date(dto.echeanceRemediation) : null,
      },
    });
  }

  /**
   * ESCALADER · § A24, dernière phrase : « the failure of management to remedy
   * OTHER deficiencies in internal control that were previously communicated
   * MAY BECOME a significant deficiency requiring communication with those
   * charged with governance. Whether this is the case depends on the AUDITOR'S
   * JUDGMENT in the circumstances. »
   *
   * « May », et « depends on judgment ». C'est donc un acte posé, daté et
   * motivé · jamais un effet automatique du temps qui passe sur une échéance.
   */
  async escalader(tenantId: string, faiblesseId: string, userId: string, dto: EscaladerDto) {
    const f = await this.faiblesse(tenantId, faiblesseId);
    if (f.qualification !== QualificationFaiblesse.AUTRE) {
      throw new BadRequestException(
        "L'escalade du § A24 ne concerne que les AUTRES faiblesses non remédiées · une significative l'est déjà, une non qualifiée se qualifie.",
      );
    }
    if (f.statut === StatutFaiblesse.REMEDIEE || f.statut === StatutFaiblesse.SANS_OBJET) {
      throw new BadRequestException(
        "§ A24 vise « the FAILURE of management to remedy » · une faiblesse remédiée ou sans objet n'a rien à escalader.",
      );
    }
    if (!dto.motif?.trim()) {
      throw new BadRequestException(
        "§ A24 : « Whether this is the case depends on the auditor's JUDGMENT in the circumstances. » Le motif est le jugement.",
      );
    }
    return this.prisma.faiblesseControleInterne.update({
      where: { id: faiblesseId },
      data: {
        qualification: QualificationFaiblesse.SIGNIFICATIVE,
        qualifiePar: userId,
        qualifieLe: new Date(),
        justificationQualification: dto.motif.trim(),
        escaladeeLe: new Date(),
        escaladeeMotif: dto.motif.trim(),
        // La qualification vient de changer · l'écrit du § 9 est à refaire,
        // vers un destinataire qui n'est plus le même.
        communiqueeLe: null,
        communiqueeA: null,
      },
    });
  }

  async clore(tenantId: string, registreId: string, userId: string, dto: ClorerRegistreDto) {
    const registre = await this.registre(tenantId, registreId, [StatutRegistreFaiblesses.OUVERT]);
    const faiblesses = await this.prisma.faiblesseControleInterne.findMany({
      where: { tenantId, registreId },
      select: { reference: true, qualification: true, communiqueeLe: true },
    });

    const motifs = FaiblessesService.motifsRefusCloture(registre.origine, faiblesses);
    if (motifs.length > 0) throw new ForbiddenException(motifs.join(' · '));

    return this.prisma.registreFaiblesses.update({
      where: { id: registreId },
      data: {
        statut: StatutRegistreFaiblesses.CLOS,
        closLe: new Date(),
        closPar: userId,
        motifCloture: dto.motifCloture?.trim() || null,
      },
    });
  }

  async lister(tenantId: string, exerciceId?: string) {
    return this.prisma.registreFaiblesses.findMany({
      where: { tenantId, ...(exerciceId ? { exerciceId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { faiblesses: true } } },
    });
  }

  /**
   * LA SYNTHÈSE · et une ligne qu'aucun autre écran ne porte : les
   * significatives non remédiées qui n'ont pas encore été reportées. C'est
   * exactement la population du § A17, celle dont le silence de l'exercice
   * suivant serait une faute.
   */
  async consulter(tenantId: string, registreId: string) {
    const registre = await this.prisma.registreFaiblesses.findFirst({
      where: { id: registreId, tenantId },
      include: {
        faiblesses: {
          orderBy: { reference: 'asc' },
          include: {
            faiblesseAnterieure: { select: { id: true, reference: true, registreId: true } },
            reconduction: { select: { id: true, reference: true, registreId: true } },
          },
        },
      },
    });
    if (!registre) throw new NotFoundException('Registre des faiblesses introuvable.');

    const f = registre.faiblesses;
    const nonSoldees = (x: (typeof f)[number]) =>
      x.statut !== StatutFaiblesse.REMEDIEE && x.statut !== StatutFaiblesse.SANS_OBJET;
    const significativesAReporter = f.filter(
      (x) => x.qualification === QualificationFaiblesse.SIGNIFICATIVE && nonSoldees(x) && !x.reconduction,
    );

    return {
      ...registre,
      mentionsContexte: FaiblessesService.MENTIONS_CONTEXTE,
      synthese: {
        total: f.length,
        significatives: f.filter((x) => x.qualification === QualificationFaiblesse.SIGNIFICATIVE).length,
        autres: f.filter((x) => x.qualification === QualificationFaiblesse.AUTRE).length,
        nonQualifiees: f.filter((x) => x.qualification === QualificationFaiblesse.NON_QUALIFIEE).length,
        remediees: f.filter((x) => x.statut === StatutFaiblesse.REMEDIEE).length,
        nonRemedieesAssumees: f.filter((x) => x.statut === StatutFaiblesse.NON_REMEDIEE_ASSUMEE).length,
        reconduites: f.filter((x) => x.faiblesseAnterieureId).length,
        escaladees: f.filter((x) => x.escaladeeLe).length,
        significativesSansEcrit: f.filter(
          (x) => x.qualification === QualificationFaiblesse.SIGNIFICATIVE && !x.communiqueeLe,
        ).length,
        significativesAReporter: significativesAReporter.length,
        referencesAReporter: significativesAReporter.map((x) => x.reference),
      },
      motifsRefusCloture: FaiblessesService.motifsRefusCloture(
        registre.origine,
        f.map((x) => ({ reference: x.reference, qualification: x.qualification, communiqueeLe: x.communiqueeLe })),
      ),
    };
  }
}

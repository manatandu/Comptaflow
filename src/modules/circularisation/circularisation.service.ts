import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CycleCircularisation,
  FormeConfirmation,
  NatureEcartConfirmation,
  StatutCampagneCircularisation,
  StatutDemandeConfirmation,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import {
  ClorerCampagneDto,
  CreerCampagneCircularisationDto,
  CreerDemandeDto,
  DepouillerDto,
  EnvoyerDto,
  ProceduresAlternativesDto,
} from './dto/circularisation.dto';

/**
 * CIRCULARISATION · l'autre moitié de l'inventaire extra-comptable.
 *
 * Le CPCC scinde l'inventaire en deux : le PHYSIQUE (immobilisations, stocks,
 * caisses) et le DOCUMENTAIRE, qui « concerne les provisions, banques,
 * créances et dettes » et « consiste à assurer la conformité des écritures
 * comptables aux documents justificatifs respectifs ». Sa checklist ouvre
 * chaque cycle par la même question : « A-t-on circularisé toutes les
 * banques ? », « la circularisation a-t-elle eu lieu pour tous les
 * fournisseurs ? », « Combien de réponses a-t-on reçu ? »
 *
 * LA MÉTHODE VIENT DE L'ISA 505, et son vocabulaire avec elle. Ce que ce
 * module n'affirme PAS : qu'un dossier tenu par le cabinet soit un audit. Un
 * cabinet qui tient les livres n'est pas l'auditeur de ces livres, et aucune
 * opinion ne sort d'ici. La norme est reprise comme référence de MÉTHODE, ce
 * qu'elle est aussi pour un réviseur.
 *
 * TROIS REFUS, chacun contre un défaut qui laisse le dossier parfaitement
 * présentable :
 *
 *  1. UNE NON-RÉPONSE N'EST PAS UNE CONFIRMATION. ISA 505 § 12 : « in the case
 *     of EACH non-response, the auditor shall perform ALTERNATIVE audit
 *     procedures to obtain relevant and reliable audit evidence ». Un dossier
 *     où quarante lettres sont parties, six sont revenues, et où les
 *     trente-quatre autres sont comptées comme « pas de désaccord » n'a rien
 *     confirmé du tout · et rien à l'écran ne le dirait.
 *  2. UN ÉCART SE QUALIFIE, il ne se solde pas. § 14 : « the auditor shall
 *     INVESTIGATE exceptions to determine whether or not they are indicative
 *     of misstatements », et § A22 rappelle que certains écarts n'en sont pas
 *     (délai, mesure, erreur matérielle). Le module demande la qualification,
 *     il ne la déduit jamais du montant.
 *  3. LA DEMANDE NÉGATIVE EST ENFERMÉE. § 15 : elle « ne peut être la seule
 *     procédure de substance » que si QUATRE conditions sont réunies. Les
 *     laisser implicites reviendrait à offrir la forme la moins probante comme
 *     un simple réglage de confort.
 *
 * ET LE MODULE N'ENVOIE AUCUNE LETTRE. Le § 7 c) veut la réponse « sent
 * DIRECTLY to the auditor » · un envoi depuis la boîte du dossier ne le
 * garantit pas. Le module tient la campagne, l'échantillon et les réponses,
 * l'acheminement reste au cabinet.
 */
@Injectable()
export class CircularisationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
  ) {}

  /**
   * LES RACINES DE COMPTES PAR CYCLE · celles que le CPCC nomme.
   *
   * Elles ne sont PAS propres à un référentiel : les deux plans logent les
   * fournisseurs en 40, les clients et adhérents en 41, les banques en 52 et
   * les établissements financiers en 53. Ce qui change d'un plan à l'autre est
   * le quatrième chiffre, dont ce module n'a pas besoin.
   */
  static racinesDuCycle(cycle: CycleCircularisation): string[] {
    switch (cycle) {
      case CycleCircularisation.BANQUES:
        return ['52', '53'];
      case CycleCircularisation.FOURNISSEURS:
        return ['40'];
      case CycleCircularisation.CLIENTS_ADHERENTS:
        return ['41'];
      case CycleCircularisation.AUTRES_TIERS:
        // « Existe-t-il une balance auxiliaire des dettes sociales/fiscales/
        // autres ? du compte personnel ? des débiteurs divers ? » (CPCC).
        return ['42', '43', '44', '47'];
      default:
        return [];
    }
  }

  /** Les quatre conditions du § 15, dans l'ordre où la norme les pose. */
  static readonly CONDITIONS_NEGATIVE = [
    'RISQUE_FAIBLE_ET_CONTROLES_TESTES',
    'POPULATION_NOMBREUSE_PETITE_HOMOGENE',
    'TAUX_EXCEPTION_ATTENDU_TRES_FAIBLE',
    'AUCUNE_RAISON_DE_CROIRE_A_UN_REJET',
  ] as const;

  private async campagne(tenantId: string, id: string, statutsAdmis?: StatutCampagneCircularisation[]) {
    const c = await this.prisma.campagneCircularisation.findFirst({ where: { id, tenantId } });
    if (!c) throw new NotFoundException('Campagne de circularisation introuvable.');
    if (statutsAdmis && !statutsAdmis.includes(c.statut)) {
      throw new ForbiddenException(
        `Cette campagne est au statut ${c.statut} · l'opération demandée n'est possible qu'en ${statutsAdmis.join(' ou ')}.`,
      );
    }
    return c;
  }

  async creer(tenantId: string, userId: string, dto: CreerCampagneCircularisationDto) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new NotFoundException('Exercice introuvable.');
    // LA DATE D'ARRÊTÉ EST CELLE DES SOLDES (audit final F72) · elle se lit
    // dans l'exercice de la campagne, et hors de lui la balance de cet
    // exercice ne dit rien du solde à cette date.
    const dateArrete = new Date(dto.dateArrete);
    if (Number.isNaN(dateArrete.getTime()) || dateArrete < exercice.dateDebut || dateArrete > exercice.dateFin) {
      throw new BadRequestException(
        `La date d'arrêté doit tomber dans l'exercice (du ${exercice.dateDebut.toISOString().slice(0, 10)} au ` +
          `${exercice.dateFin.toISOString().slice(0, 10)}) · c'est à cette date que les soldes sont lus et confirmés.`,
      );
    }

    if (dto.forme === FormeConfirmation.NEGATIVE) {
      const declarees = new Set(dto.conditionsNegativeReunies ?? []);
      const manquantes = CircularisationService.CONDITIONS_NEGATIVE.filter((c) => !declarees.has(c));
      if (manquantes.length > 0) {
        throw new BadRequestException(
          "ISA 505 § 15 · une demande NÉGATIVE ne peut être la seule procédure de substance que si les quatre conditions sont réunies, et elles le sont cumulativement. " +
            `Non déclarée(s) : ${manquantes.join(', ')}. ` +
            'À défaut, utiliser la forme positive · « negative confirmations provide less persuasive audit evidence than positive confirmations ».',
        );
      }
    }

    return this.prisma.campagneCircularisation.create({
      data: {
        tenantId,
        exerciceId: dto.exerciceId,
        libelle: dto.libelle.trim(),
        dateArrete,
        cycle: dto.cycle,
        forme: dto.forme ?? FormeConfirmation.POSITIVE,
        methodeSelection: dto.methodeSelection?.trim() || null,
        conditionsNegativeReunies: dto.conditionsNegativeReunies ?? [],
        createdBy: userId,
      },
    });
  }

  /**
   * LES SOLDES DU CYCLE À LA DATE D'ARRÊTÉ · une seule lecture, pour
   * l'échantillon, la lettre et le taux de couverture (audit final F70 et
   * F72). La balance était lue à la fin de l'exercice · une campagne
   * intermédiaire, arrêtée au 30 juin, envoyait le solde de décembre, et le
   * tiers « contestait » un écart que le logiciel avait fabriqué.
   *
   * LE LIVRE-JOURNAL SEUL (audit du serveur du 2026-09-27, F6) · le solde
   * part figé chez un TIERS ; pris brouillard compris, il porterait une
   * écriture que personne n'a validée (AUDCIF art. 22, 2°).
   */
  private async soldesDuCycle(
    tenantId: string,
    campagne: { exerciceId: string; dateArrete: Date; cycle: CycleCircularisation },
  ) {
    const racines = CircularisationService.racinesDuCycle(campagne.cycle);
    const { lignes } = await this.ecritures.balance(tenantId, campagne.exerciceId, false, campagne.dateArrete);
    const duCycle = lignes
      .filter((l) => l.typeCompte !== 'TOTAL' && racines.some((r) => l.numero.startsWith(r)))
      .map((l) => ({ compteId: l.compteId, numero: l.numero, intitule: l.intitule, solde: l.solde }));
    const nonNuls = duCycle.filter((l) => Math.abs(l.solde) > 0.005);
    return {
      racines,
      lignes,
      candidats: nonNuls.sort((a, b) => Math.abs(b.solde) - Math.abs(a.solde)),
      total: nonNuls.reduce((t, c) => t + Math.abs(c.solde), 0),
    };
  }

  /**
   * L'ÉCHANTILLON PROPOSÉ · les soldes du cycle, du plus gros au plus petit.
   *
   * Le module PROPOSE, il ne sélectionne pas : « comment a-t-on procédé pour
   * la sélection des fournisseurs à circulariser ? » est une question posée au
   * cabinet, et ni le CPCC ni l'ISA 505 n'imposent de méthode. Ce qu'il rend
   * est la matière : chaque compte du cycle, son solde, son poids dans le
   * total, et le tiers rattaché s'il existe.
   *
   * Les comptes à SOLDE NUL sont écartés · circulariser un solde nul ne
   * confirme rien qu'une absence, et gonfle le dénominateur du taux de
   * couverture.
   */
  async echantillonPropose(tenantId: string, campagneId: string) {
    const campagne = await this.campagne(tenantId, campagneId);
    const { racines, candidats, total } = await this.soldesDuCycle(tenantId, campagne);
    const deja = await this.prisma.demandeConfirmation.findMany({
      where: { tenantId, campagneId },
      select: { compteId: true },
    });
    const retenus = new Set(deja.map((d) => d.compteId));

    return {
      cycle: campagne.cycle,
      racines,
      totalCycle: Number(total.toFixed(2)),
      candidats: candidats.map((c) => ({
        ...c,
        solde: Number(c.solde.toFixed(2)),
        poids: total > 0 ? Number(((Math.abs(c.solde) / total) * 100).toFixed(2)) : 0,
        dejaRetenu: retenus.has(c.compteId),
      })),
    };
  }

  /**
   * Le solde part figé · c'est le chiffre que la lettre porte.
   *
   * EN PRÉPARATION SEULEMENT (audit final F71) · une demande ajoutée à une
   * campagne déjà envoyée restait « à envoyer » pour toujours · l'envoi
   * suivant est une RELANCE, qui ne touche que les lettres parties, et la
   * clôture ne la voyait pas. Une lettre tardive fait une nouvelle campagne.
   * Et UN COMPTE, UNE LETTRE · deux lettres sur le même solde compteraient
   * deux fois la même confirmation dans le taux de couverture.
   */
  async creerDemande(tenantId: string, campagneId: string, dto: CreerDemandeDto) {
    const campagne = await this.campagne(tenantId, campagneId, [StatutCampagneCircularisation.PREPARATION]);
    const compte = await this.prisma.compte.findFirst({ where: { id: dto.compteId, tenantId } });
    if (!compte) throw new NotFoundException('Compte introuvable.');
    const deja = await this.prisma.demandeConfirmation.findFirst({
      where: { tenantId, campagneId, compteId: dto.compteId },
      select: { destinataire: true },
    });
    if (deja) {
      throw new ConflictException(
        `Le compte ${compte.numero} a déjà sa demande dans cette campagne (${deja.destinataire}) · une seconde lettre ` +
          'sur le même solde compterait deux fois la même confirmation.',
      );
    }

    const { lignes } = await this.soldesDuCycle(tenantId, campagne);
    const ligne = lignes.find((l) => l.compteId === dto.compteId);
    const solde = dto.soldeAConfirmer ?? Number((ligne?.solde ?? 0).toFixed(2));

    return this.prisma.demandeConfirmation.create({
      data: {
        tenantId,
        campagneId,
        compteId: dto.compteId,
        tiersId: dto.tiersId ?? null,
        destinataire: dto.destinataire.trim(),
        adresse: dto.adresse?.trim() || null,
        soldeAConfirmer: solde,
      },
    });
  }

  /**
   * RETIRER UNE DEMANDE QUI N'EST PAS PARTIE (audit final F71) · un compte
   * retenu par erreur en préparation, ou une demande restée « à envoyer »
   * d'avant la règle qui les borne à la préparation. Une lettre partie ne se
   * retire jamais · le tiers l'a reçue, et elle se classe en réponse ou en
   * non-réponse, ce que la clôture exige.
   */
  async retirerDemande(tenantId: string, demandeId: string) {
    const demande = await this.prisma.demandeConfirmation.findFirst({
      where: { id: demandeId, tenantId },
      include: { campagne: { select: { statut: true } } },
    });
    if (!demande) throw new NotFoundException('Demande introuvable.');
    if (demande.campagne.statut === StatutCampagneCircularisation.CLOTUREE) {
      throw new ForbiddenException('La campagne est close · ses demandes ne se retirent plus.');
    }
    if (demande.statut !== StatutDemandeConfirmation.A_ENVOYER) {
      throw new BadRequestException(
        'Cette lettre est partie · elle ne se retire pas, elle se classe (réponse reçue, sans réponse ou non distribuée).',
      );
    }
    await this.prisma.demandeConfirmation.delete({ where: { id: demande.id } });
    return { retiree: true };
  }

  /** Envoi et relance · la campagne suit ses demandes, pas l'inverse. */
  async envoyer(tenantId: string, campagneId: string, dto: EnvoyerDto) {
    const campagne = await this.campagne(tenantId, campagneId, [
      StatutCampagneCircularisation.PREPARATION,
      StatutCampagneCircularisation.ENVOYEE,
    ]);
    const nombre = await this.prisma.demandeConfirmation.count({ where: { tenantId, campagneId } });
    if (nombre === 0) throw new BadRequestException('Aucune demande dans cette campagne.');

    const quand = dto.date ? new Date(dto.date) : new Date();
    const relance = campagne.statut === StatutCampagneCircularisation.ENVOYEE;

    await this.prisma.$transaction([
      this.prisma.demandeConfirmation.updateMany({
        where: {
          tenantId,
          campagneId,
          statut: relance ? StatutDemandeConfirmation.ENVOYEE : StatutDemandeConfirmation.A_ENVOYER,
        },
        data: relance
          ? { statut: StatutDemandeConfirmation.RELANCEE, relanceeLe: quand }
          : { statut: StatutDemandeConfirmation.ENVOYEE, envoyeeLe: quand },
      }),
      this.prisma.campagneCircularisation.update({
        where: { id: campagneId },
        data: relance
          ? { statut: StatutCampagneCircularisation.RELANCEE, relanceeLe: quand }
          : { statut: StatutCampagneCircularisation.ENVOYEE, envoyeeLe: quand },
      }),
    ]);
    return this.consulter(tenantId, campagneId);
  }

  /**
   * LE DÉPOUILLEMENT · une réponse, ou son absence.
   *
   * L'écart est calculé, jamais saisi · c'est la différence entre ce que le
   * tiers dit et ce que la lettre portait, et rien d'autre. Sa QUALIFICATION,
   * elle, est demandée dès qu'il n'est pas nul : ISA 505 § 14 impose
   * d'investiguer, § A22 rappelle qu'un écart peut n'être qu'un délai. Le
   * module ne devine ni l'un ni l'autre.
   */
  async depouiller(tenantId: string, demandeId: string, dto: DepouillerDto) {
    const demande = await this.prisma.demandeConfirmation.findFirst({
      where: { id: demandeId, tenantId },
      include: { campagne: true },
    });
    if (!demande) throw new NotFoundException('Demande introuvable.');
    if (demande.campagne.statut === StatutCampagneCircularisation.CLOTUREE) {
      throw new ForbiddenException('La campagne est close · son dépouillement ne se rouvre pas.');
    }

    if (dto.statut === StatutDemandeConfirmation.REPONSE_RECUE) {
      if (dto.soldeConfirme === undefined || dto.soldeConfirme === null) {
        throw new BadRequestException(
          "Une réponse reçue porte un solde confirmé · zéro EST une réponse (« je ne vous dois rien »), l'absence n'en est pas une.",
        );
      }
      const ecart = Number((dto.soldeConfirme - Number(demande.soldeAConfirmer)).toFixed(2));
      if (Math.abs(ecart) > 0.005 && !dto.natureEcart) {
        throw new BadRequestException(
          `Écart de ${ecart} à qualifier · ISA 505 § 14, « the auditor shall INVESTIGATE exceptions to determine whether or not they are indicative of misstatements ». ` +
            'Le § A22 rappelle que certains écarts n’en sont pas : délai, mesure, erreur matérielle. Choisir la nature, et dire ce que l’investigation a montré.',
        );
      }
      if (Math.abs(ecart) > 0.005 && !dto.investigation?.trim()) {
        throw new BadRequestException("Un écart qualifié porte le résultat de son investigation · sans lui, il est classé, pas investigué.");
      }
      return this.prisma.demandeConfirmation.update({
        where: { id: demandeId },
        data: {
          statut: StatutDemandeConfirmation.REPONSE_RECUE,
          recueLe: dto.date ? new Date(dto.date) : new Date(),
          soldeConfirme: dto.soldeConfirme,
          ecart,
          natureEcart: Math.abs(ecart) > 0.005 ? dto.natureEcart : null,
          investigation: dto.investigation?.trim() || null,
          reponseIndirecte: dto.reponseIndirecte ?? false,
          // ISA 505 § 7 c) veut la réponse revenue DIRECTEMENT. Passée par
          // l'entité, elle n'a pas cette qualité, et le § 10 oblige alors à
          // lever le doute par d'autres éléments · on l'inscrit plutôt que de
          // laisser la réponse passer pour ce qu'elle n'est pas.
          doutefiabilite: dto.reponseIndirecte
            ? (dto.doutefiabilite?.trim() ||
              "Réponse parvenue par l'entité et non directement · ISA 505 § 7 c) et § 10, fiabilité à corroborer.")
            : dto.doutefiabilite?.trim() || null,
        },
      });
    }

    return this.prisma.demandeConfirmation.update({
      where: { id: demandeId },
      data: {
        statut: dto.statut,
        soldeConfirme: null,
        ecart: null,
        natureEcart: null,
      },
    });
  }

  /**
   * LES PROCÉDURES ALTERNATIVES · § 12, et le § A18 en donne les exemples.
   *
   * « For accounts receivable balances : examining specific subsequent cash
   * receipts, shipping documentation, and sales near the period end. For
   * accounts payable balances : examining subsequent cash disbursements or
   * correspondence from third parties, and other records, such as goods
   * received notes. » Texte libre ici · ce que le cabinet a fait, il l'écrit.
   */
  async consignerProceduresAlternatives(tenantId: string, demandeId: string, dto: ProceduresAlternativesDto) {
    const demande = await this.prisma.demandeConfirmation.findFirst({ where: { id: demandeId, tenantId } });
    if (!demande) throw new NotFoundException('Demande introuvable.');
    if (
      demande.statut !== StatutDemandeConfirmation.SANS_REPONSE &&
      demande.statut !== StatutDemandeConfirmation.NON_DISTRIBUEE
    ) {
      throw new BadRequestException(
        "Les procédures alternatives ne se consignent que sur une NON-RÉPONSE · ISA 505 § 6 d), l'absence de réponse ou la lettre revenue non distribuée.",
      );
    }
    return this.prisma.demandeConfirmation.update({
      where: { id: demandeId },
      data: { proceduresAlternatives: dto.proceduresAlternatives.trim() },
    });
  }

  /**
   * CLÔTURE · le refus qui donne sa valeur au module.
   *
   * ISA 505 § 12 : « in the case of EACH non-response, the auditor shall
   * perform alternative audit procedures ». Une campagne dont des lettres
   * n'ont pas trouvé de réponse ET dont personne n'a écrit ce qu'il a fait à
   * la place n'a rien établi. C'est le défaut qui laisse le dossier
   * parfaitement présentable · quarante lettres parties, six revenues, et la
   * ligne de la balance auxiliaire réputée confirmée.
   */
  async clore(tenantId: string, campagneId: string, userId: string, dto: ClorerCampagneDto) {
    await this.campagne(tenantId, campagneId, [
      StatutCampagneCircularisation.ENVOYEE,
      StatutCampagneCircularisation.RELANCEE,
      StatutCampagneCircularisation.DEPOUILLEE,
    ]);
    const demandes = await this.prisma.demandeConfirmation.findMany({ where: { tenantId, campagneId } });

    // Une demande jamais envoyée n'est ni confirmée ni une non-réponse · elle
    // n'a pas eu lieu (audit final F71).
    const jamaisEnvoyees = demandes.filter((d) => d.statut === StatutDemandeConfirmation.A_ENVOYER);
    if (jamaisEnvoyees.length > 0) {
      throw new ForbiddenException(
        `${jamaisEnvoyees.length} demande(s) jamais envoyée(s) · retirez-les de la campagne ou envoyez-les avant de ` +
          'clore. Une lettre qui n’est pas partie n’a rien établi, et ne se classe pas en non-réponse.',
      );
    }
    const enAttente = demandes.filter(
      (d) => d.statut === StatutDemandeConfirmation.ENVOYEE || d.statut === StatutDemandeConfirmation.RELANCEE,
    );
    if (enAttente.length > 0) {
      throw new ForbiddenException(
        `${enAttente.length} demande(s) encore en attente · les classer en réponse reçue ou en non-réponse avant de clore. Une demande laissée « envoyée » n'est ni confirmée ni traitée.`,
      );
    }

    const nonReponsesNues = demandes.filter(
      (d) =>
        (d.statut === StatutDemandeConfirmation.SANS_REPONSE ||
          d.statut === StatutDemandeConfirmation.NON_DISTRIBUEE) &&
        !d.proceduresAlternatives?.trim(),
    );
    if (nonReponsesNues.length > 0) {
      throw new ForbiddenException(
        `${nonReponsesNues.length} non-réponse(s) sans procédure alternative · ISA 505 § 12 : « in the case of EACH non-response, the auditor shall perform alternative audit procedures ». ` +
          'Une non-réponse n’est pas une confirmation : sans procédure alternative, le solde n’est pas établi.',
      );
    }

    return this.prisma.campagneCircularisation.update({
      where: { id: campagneId },
      data: {
        statut: StatutCampagneCircularisation.CLOTUREE,
        clotureeLe: new Date(),
        clotureePar: userId,
        ...(dto.refusDirectionMotif !== undefined
          ? { refusDirectionMotif: dto.refusDirectionMotif?.trim() || null }
          : {}),
      },
    });
  }

  async lister(tenantId: string, exerciceId?: string) {
    return this.prisma.campagneCircularisation.findMany({
      where: { tenantId, ...(exerciceId ? { exerciceId } : {}) },
      orderBy: { dateArrete: 'desc' },
      include: { _count: { select: { demandes: true } } },
    });
  }

  /**
   * LA SYNTHÈSE QUE LE CPCC RÉCLAME · « Combien de réponses a-t-on reçu ? Si
   * le pourcentage est insignifiant, a-t-on procédé à la relance pour insister
   * auprès des créanciers sur l'importance attendue de leurs réponses ? »
   *
   * DEUX TAUX, ET ILS NE DISENT PAS LA MÊME CHOSE. Le taux de réponse compte
   * les lettres ; le taux de couverture pèse les montants. Vingt réponses sur
   * cent lettres peuvent couvrir 80 % du solde, ou 4 % · c'est le second
   * chiffre qui dit si la procédure a établi quelque chose.
   */
  async consulter(tenantId: string, campagneId: string) {
    const campagne = await this.prisma.campagneCircularisation.findFirst({
      where: { id: campagneId, tenantId },
      include: {
        demandes: {
          include: { compte: { select: { numero: true, intitule: true } }, tiers: { select: { code: true, nom: true } } },
          orderBy: { destinataire: 'asc' },
        },
      },
    });
    if (!campagne) throw new NotFoundException('Campagne de circularisation introuvable.');

    const d = campagne.demandes;
    // LE DÉNOMINATEUR EST LE TOTAL DU CYCLE (audit final F70) · pris sur le
    // solde ENVOYÉ, deux petites lettres confirmées affichaient 100 %, quand
    // elles couvraient 3 % des soldes. Le taux dit alors combien de l'argent
    // du cycle est établi, et c'est ce qu'il existe pour dire.
    const { racines, total: totalCycle } = await this.soldesDuCycle(tenantId, campagne);
    const envoyees = d.filter((x) => x.statut !== StatutDemandeConfirmation.A_ENVOYER);
    const recues = d.filter((x) => x.statut === StatutDemandeConfirmation.REPONSE_RECUE);
    const nonReponses = d.filter(
      (x) => x.statut === StatutDemandeConfirmation.SANS_REPONSE || x.statut === StatutDemandeConfirmation.NON_DISTRIBUEE,
    );
    const abs = (v: unknown) => Math.abs(Number(v ?? 0));
    const soldeEnvoye = envoyees.reduce((s, x) => s + abs(x.soldeAConfirmer), 0);
    // Seules les lettres sur un compte du cycle entrent au numérateur · une
    // lettre hors cycle ne couvre rien de ce total.
    const soldeConfirme = recues
      .filter((x) => racines.some((r) => x.compte.numero.startsWith(r)))
      .reduce((s, x) => s + abs(x.soldeAConfirmer), 0);
    const ecarts = recues.filter((x) => Math.abs(Number(x.ecart ?? 0)) > 0.005);

    return {
      ...campagne,
      synthese: {
        demandes: d.length,
        envoyees: envoyees.length,
        reponses: recues.length,
        nonReponses: nonReponses.length,
        nonReponsesSansProcedure: nonReponses.filter((x) => !x.proceduresAlternatives?.trim()).length,
        tauxReponse: envoyees.length > 0 ? Number(((recues.length / envoyees.length) * 100).toFixed(1)) : 0,
        tauxCouverture: totalCycle > 0 ? Number(((soldeConfirme / totalCycle) * 100).toFixed(1)) : 0,
        totalCycle: Number(totalCycle.toFixed(2)),
        soldeEnvoye: Number(soldeEnvoye.toFixed(2)),
        soldeConfirme: Number(soldeConfirme.toFixed(2)),
        ecarts: ecarts.length,
        anomaliesPotentielles: ecarts.filter((x) => x.natureEcart === NatureEcartConfirmation.ANOMALIE_POTENTIELLE).length,
        reponsesIndirectes: recues.filter((x) => x.reponseIndirecte).length,
      },
    };
  }
}

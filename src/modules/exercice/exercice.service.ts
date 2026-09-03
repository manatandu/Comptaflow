import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { GranulariteCloture, ModeReportANouveau, Prisma, Referentiel, StatutEcriture, StatutExercice, TypeJournal } from '@prisma/client';
import { CreerExerciceDto } from './dto/creer-exercice.dto';
import { ClorePartielleDto, CloreTotaleDto, ClorePeriodeDto } from './dto/cloture.dto';
import { ArreterComptesDto } from './dto/arrete-comptes.dto';
import { JournalService } from '../journaux/journal.service';
import { avecRetrySerialisable } from '../../common/prisma-retry.util';
import { DERNIERE_VERIFICATION, dateJalon, jalonsApplicables } from './planning-cloture';

const EPSILON = 0.005;

/**
 * Cycle de vie complet de l'exercice (docs/plan-de-construction.md §3.1) :
 * - 3 granularités de clôture (Partielle/Totale/Période), qui verrouillent la
 *   saisie sans rien générer · voir clorePartielle/cloreTotale/clorePeriode
 *   et verifierEcritureAutorisee (consulté par EcritureService.creer).
 * - la clôture ANNUELLE de l'exercice (cloturer), distincte, qui solde les
 *   classes 6/7 sur le résultat et génère le report à-nouveau réel dans
 *   l'exercice suivant selon le mode de chaque compte (Aucun/Solde/Détail).
 */
/**
 * LE COMPTE 13 PORTE LES MÊMES NUMÉROS DANS LES DEUX PLANS, ET PAS LES MÊMES
 * INTITULÉS · c'est exactement le genre d'écart qui ne casse rien et qui
 * s'imprime au livre-journal.
 *
 *  · SYCEBNL, Partie 2 ch. 2 · 131 Excédent, 139 Déficit ;
 *  · AUDCIF, Titre VII § COMPTE 13 · 131 Résultat net : Bénéfice, 139
 *    Résultat net : Perte ; art. 29 · « le bénéfice net ou la perte nette de
 *    l'exercice ».
 *
 * Le vocabulaire suit le dossier jusque dans le libellé de la ligne de
 * clôture et dans le message d'erreur, qui annonçait « le plan de comptes
 * SYCEBNL de ce dossier » à une entreprise.
 */
export function libellesResultat(referentiel: Referentiel) {
  return referentiel === Referentiel.SYSCOHADA
    ? {
        excedent: 'Résultat net : bénéfice (131)',
        deficit: 'Résultat net : perte (139)',
        ligneExcedent: "Bénéfice net de l'exercice",
        ligneDeficit: "Perte nette de l'exercice",
        plan: 'SYSCOHADA',
      }
    : {
        excedent: "Excédent de l'exercice (131)",
        deficit: "Déficit de l'exercice (139)",
        ligneExcedent: "Excédent de l'exercice",
        ligneDeficit: "Déficit de l'exercice",
        plan: 'SYCEBNL',
      };
}


/**
 * DATES DE L'EXERCICE QUI SUIT CELUI QUI VIENT D'ÊTRE CLOS.
 *
 * Extraite du corps de la clôture pour être éprouvable seule : la version
 * précédente vivait au milieu d'une transaction de plusieurs centaines de
 * lignes, et son erreur d'un jour ne pouvait être vue que par un dossier réel
 * franchissant une année bissextile.
 *
 * L'art. 7 de l'AUDCIF, non exclu par l'art. 3 du SYCEBNL et repris mot pour
 * mot au glossaire de celui-ci, fait coïncider l'exercice avec l'année civile.
 * Le suivant part donc du lendemain de la clôture et va au 31 décembre de son
 * année · jamais d'une durée recopiée, qui dérive dès qu'une année compte
 * 366 jours.
 */
export function exerciceSuivantApres(dateFinClos: Date): { dateDebut: Date; dateFin: Date } {
  const dateDebut = new Date(dateFinClos);
  dateDebut.setUTCDate(dateDebut.getUTCDate() + 1);
  const dateFin = new Date(Date.UTC(dateDebut.getUTCFullYear(), 11, 31));
  return { dateDebut, dateFin };
}

@Injectable()
export class ExerciceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journalService: JournalService,
  ) {}

  /** Crée l'exercice de l'année en cours à l'inscription du tenant (1er janvier → 31 décembre). */
  /**
   * `client` reçoit la transaction de `AuthService.register` quand l'exercice
   * naît avec le dossier · hors de ce cas il vaut `this.prisma`.
   */
  async creerExerciceCourant(tenantId: string, client: Prisma.TransactionClient = this.prisma) {
    const annee = new Date().getFullYear();
    return client.exercice.create({
      data: {
        tenantId,
        dateDebut: new Date(Date.UTC(annee, 0, 1)),
        dateFin: new Date(Date.UTC(annee, 11, 31)),
      },
    });
  }

  async lister(tenantId: string) {
    return this.prisma.exercice.findMany({ where: { tenantId }, orderBy: { dateDebut: 'desc' } });
  }

  /**
   * `client` reçoit la transaction de `AuthService.register` quand l'exercice
   * naît avec le dossier · hors de ce cas il vaut `this.prisma`.
   */
  async creer(tenantId: string, dto: CreerExerciceDto, client: Prisma.TransactionClient = this.prisma) {
    const dateDebut = new Date(dto.dateDebut);
    const dateFin = new Date(dto.dateFin);
    if (dateFin <= dateDebut) {
      throw new BadRequestException("La date de fin doit être postérieure à la date de début");
    }
    await this.validerArticle7(tenantId, dateDebut, dateFin, dto.liquidation === true, client);
    return client.exercice.create({ data: { tenantId, dateDebut, dateFin } });
  }

  /**
   * ARTICLE 7 · « L'EXERCICE COÏNCIDE AVEC L'ANNÉE CIVILE. »
   *
   * Le service acceptait n'importe quel couple de dates pourvu que la fin
   * suive le début. Un exercice du 15 mars au 20 août passait, et rien ensuite
   * ne pouvait le rattraper : l'en-tête obligatoire imprimait « Exercice clos
   * le 20-08 », le planning de clôture calculait ses échéances depuis cette
   * date, et la liasse entière reposait sur une période que le texte
   * n'autorise pas. Un garde-fou absent à la racine ne se voit nulle part en
   * aval, parce que tout en aval est cohérent avec la mauvaise racine.
   *
   * La règle est la même sous les deux référentiels, et ce n'est pas une
   * transposition : l'art. 7 n'est PAS dans la liste d'exclusion de l'art. 3
   * du SYCEBNL (art. 5, 8, 10 à 13, 17 al. 7-8, 18, 19 4e tiret, 21, 25 à 34,
   * 49, 69, 70, 71, 73 à 113), et le glossaire du SYCEBNL, Partie 1 ch. 1,
   * la réécrit mot pour mot à l'entrée EXERCICE.
   *
   * Trois cas, et un seul échappatoire :
   *  · exercice courant · du 1er janvier au 31 décembre, sans exception ;
   *  · PREMIER exercice débutant au premier semestre · il « est
   *    exceptionnellement inférieur à douze mois », donc il finit le
   *    31 décembre de la MÊME année ;
   *  · PREMIER exercice débutant au deuxième semestre · sa durée « PEUT être
   *    supérieure à douze mois », donc le 31 décembre de la même année ou de
   *    la suivante, au choix du cabinet ;
   *  · liquidation (al. 4) · seul cas hors année civile, déclaré explicitement.
   *
   * Dans tous les cas non liquidatifs, l'exercice finit un 31 décembre. C'est
   * l'invariant, et c'est lui que l'en-tête des états publie.
   */
  private async validerArticle7(
    tenantId: string,
    dateDebut: Date,
    dateFin: Date,
    liquidation: boolean,
    client: Prisma.TransactionClient,
  ) {
    if (liquidation) return;

    const finLe31Decembre = dateFin.getUTCMonth() === 11 && dateFin.getUTCDate() === 31;
    if (!finLe31Decembre) {
      throw new BadRequestException(
        "L'exercice coïncide avec l'année civile (AUDCIF art. 7, repris au glossaire SYCEBNL) : il se " +
          'termine un 31 décembre. Seul un exercice de liquidation y échappe, et il doit être déclaré ' +
          'comme tel.',
      );
    }

    // Premier exercice du dossier · c'est le seul qui puisse ne pas couvrir
    // l'année civile entière. Compté dans la transaction appelante, sans quoi
    // l'exercice créé avec le dossier se croirait le second.
    const premier = (await client.exercice.count({ where: { tenantId } })) === 0;
    const debutLe1erJanvier = dateDebut.getUTCMonth() === 0 && dateDebut.getUTCDate() === 1;

    if (!premier) {
      if (!debutLe1erJanvier || dateDebut.getUTCFullYear() !== dateFin.getUTCFullYear()) {
        throw new BadRequestException(
          "Seul le PREMIER exercice d'un dossier peut s'écarter de l'année civile (AUDCIF art. 7). " +
            'Celui-ci doit courir du 1er janvier au 31 décembre de la même année.',
        );
      }
      return;
    }

    const premierSemestre = dateDebut.getUTCMonth() <= 5;
    const anneesEcart = dateFin.getUTCFullYear() - dateDebut.getUTCFullYear();
    if (premierSemestre && anneesEcart !== 0) {
      throw new BadRequestException(
        "Un premier exercice débutant au cours du premier semestre est exceptionnellement INFÉRIEUR à " +
          'douze mois (AUDCIF art. 7) : il se termine le 31 décembre de la même année.',
      );
    }
    if (!premierSemestre && anneesEcart > 1) {
      throw new BadRequestException(
        "Un premier exercice débutant au cours du deuxième semestre se termine le 31 décembre de la " +
          "même année ou de la suivante (AUDCIF art. 7) : sa durée peut dépasser douze mois, pas vingt-quatre.",
      );
    }
  }

  /**
   * Planning de clôture de l'exercice · les seize jalons de
   * planning-cloture.ts, datés à partir de la date de clôture de CET
   * exercice, augmentés de ce qu'OmegaX sait observer tout seul.
   *
   * L'observation est le point : un planning statique est une affiche, un
   * planning qui sait qu'il reste douze écritures au brouillard est un outil.
   * Elle ne couvre que les jalons vérifiables en base ; les autres restent
   * des cases que le comptable coche dans sa tête, et le disent.
   *
   * LES JALONS N'ONT PAS TOUS LE MÊME DEGRÉ DE CERTITUDE, et l'annoncer en
   * bloc comme « antérieur au SYCEBNL et non revérifié » était faux pour la
   * moitié d'entre eux. Trois familles, chacune marquée par sa source dans
   * planning-cloture.ts :
   *
   *  · lus sur texte primaire · AUSCGIE art. 138, 140 et 269 ; AUDCIF art. 19,
   *    23, 24, 66, 69 à 72 ; loi n° 004/2001 ; SYCEBNL art. 14, 17 et 18 ;
   *    loi de procédures fiscales art. 12 à 15 ;
   *  · tirés du cours du CPCC de novembre 2020, antérieur au SYCEBNL, non
   *    revérifiés sur texte primaire · les dépôts congolais au CPCC et au
   *    Ministère de l'Économie nationale, et le calendrier interne du § 2.3 ;
   *  · sans date fixée par le texte · le rapport d'activité des ONG, que la
   *    loi dit « périodiquement ».
   *
   * Le logiciel ne calcule en revanche AUCUNE astreinte, dans aucun cas : les
   * arrêtés de 2010 et 2013 sont nommés, leurs taux ne sont pas repris, et un
   * taux non revérifié n'a rien à faire dans un logiciel de 2026. Voir
   * docs/organisation-comptable-cpcc.md § 6.
   */
  async planningCloture(tenantId: string, exerciceId: string) {
    const exercice = await this.trouverExercice(tenantId, exerciceId);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    const [enBrouillard, transcriptions, rapports, donations] = await Promise.all([
      this.prisma.ecriture.count({ where: { tenantId, exerciceId, statut: StatutEcriture.BROUILLARD } }),
      this.prisma.transcriptionInventaire.count({ where: { tenantId, exerciceId } }),
      this.prisma.rapportActivite.count({ where: { tenantId, exerciceId } }),
      this.prisma.donation.findMany({
        where: {
          tenantId,
          annulee: false,
          dateOperation: { gte: exercice.dateDebut, lte: exercice.dateFin },
        },
        select: { signeeLe: true },
      }),
    ]);
    const donationsNonSignees = donations.filter((d) => d.signeeLe === null).length;

    const observations: Record<string, { libelle: string; satisfait: boolean }> = {
      BROUILLARD: {
        libelle:
          enBrouillard === 0
            ? 'Aucune écriture au brouillard'
            : `${enBrouillard} écriture(s) encore au brouillard, à valider avant la balance`,
        satisfait: enBrouillard === 0,
      },
      INVENTAIRE: {
        libelle:
          transcriptions === 0
            ? 'Aucune transcription au livre d’inventaire'
            : `${transcriptions} transcription(s) au livre d’inventaire`,
        satisfait: transcriptions > 0,
      },
      RAPPORT_ACTIVITE: {
        libelle: rapports === 0 ? 'Aucun rapport d’activité établi' : `${rapports} version(s) du rapport d’activité`,
        satisfait: rapports > 0,
      },
      DONATEURS: {
        libelle:
          donations.length === 0
            ? 'Aucune libéralité enregistrée sur l’exercice'
            : donationsNonSignees === 0
              ? `${donations.length} libéralité(s), toutes signées`
              : `${donations.length} libéralité(s) dont ${donationsNonSignees} non signée(s)`,
        // Un registre vide est un registre en règle : rien n'oblige une
        // association à recevoir des dons. Ce qui n'est pas en règle, c'est
        // une libéralité inscrite et non signée (art. 18).
        satisfait: donationsNonSignees === 0,
      },
      CLOTURE_ANNUELLE: {
        libelle:
          exercice.statut === StatutExercice.CLOTURE ? 'Exercice clôturé' : 'Exercice encore ouvert',
        satisfait: exercice.statut === StatutExercice.CLOTURE,
      },
    };

    const aujourdHui = new Date();
    return {
      exerciceId: exercice.id,
      dateDebut: exercice.dateDebut,
      dateFin: exercice.dateFin,
      statut: exercice.statut,
      derniereVerification: DERNIERE_VERIFICATION,
      // Le planning n'est pas le même pour une ASBL, une ONG et une entreprise
      // commerciale : voir jalonsApplicables et son commentaire.
      formeJuridique: tenant.formeJuridique,
      formeJuridiqueSyscohada: tenant.formeJuridiqueSyscohada,
      droitEtranger: tenant.droitEtranger,
      jalons: jalonsApplicables({
        referentiel: tenant.referentiel,
        formeJuridique: tenant.formeJuridique,
        formeJuridiqueSyscohada: tenant.formeJuridiqueSyscohada,
        droitEtranger: tenant.droitEtranger,
      }).map((j) => {
        const echeance = dateJalon(exercice.dateFin, j.echeance);
        const observation = j.observation ? observations[j.observation] : undefined;
        return {
          etape: j.etape,
          libelle: j.libelle,
          detail: j.detail,
          nature: j.nature,
          source: j.source,
          // Absent sur la plupart des jalons · seuls ceux dont l'OMISSION est
          // pénalement sanctionnée le portent, chacun citant l'article de SON
          // référentiel.
          sanction: j.sanction ?? null,
          debut: dateJalon(exercice.dateFin, j.debut),
          echeance,
          // « En retard » n'a de sens que pour un jalon non satisfait : une
          // étape faite reste faite, même après la date.
          enRetard: echeance < aujourdHui && !(observation?.satisfait ?? false),
          observation,
        };
      }),
    };
  }


  /**
   * ARRÊTÉ DES COMPTES · la quatrième mention obligatoire de chaque page
   * publiée, et la seule que le dossier ne portait nulle part.
   *
   * AUDCIF, Titre IX ch. 1 § 2.4 · les états financiers « doivent comporter
   * obligatoirement » le nom de l'entité, LA DATE D'ARRÊTÉ et la période
   * couverte, et l'unité monétaire, « dans chacune des pages des états
   * financiers publiés ». L'article 23 la réclame en outre « dans toute
   * publication des états financiers », et il n'est PAS dans la liste
   * d'exclusion de l'art. 3 du SYCEBNL : la mention vaut des deux côtés.
   *
   * CE N'EST PAS LA CLÔTURE. Titre VIII ch. 31 § 1.3 · « l'arrêté par les
   * organes dirigeants, légalement responsables, ne peut être que postérieur
   * de plusieurs semaines, voire plusieurs mois, à la date de clôture ». D'où
   * le seul refus posé ici, celui d'une date antérieure à la clôture : arrêter
   * des comptes avant la fin de la période qu'ils couvrent n'a pas de sens.
   *
   * LE DÉLAI DE QUATRE MOIS N'EST PAS UN REFUS. Le § 1.3 le donne comme
   * limite, mais un dossier réel arrête parfois en retard, et bloquer la
   * saisie effacerait le retard au lieu de le montrer · c'est le jalon de
   * clôture et le contrôle qui le signalent, en laissant la date vraie.
   *
   * NULL EFFACE. Le § 1.6 prévoit expressément le nouvel arrêté : « si
   * certaines informations susceptibles de remettre profondément en cause les
   * états financiers n'étaient connues qu'après l'arrêté, il appartiendrait
   * aux dirigeants de procéder à un NOUVEL ARRÊTÉ des comptes modifiés ».
   */
  async arreterComptes(tenantId: string, exerciceId: string, dto: ArreterComptesDto) {
    const exercice = await this.trouverExercice(tenantId, exerciceId);
    const date = dto.dateArreteComptes ? new Date(dto.dateArreteComptes) : null;
    if (date && date < exercice.dateFin) {
      throw new BadRequestException(
        "La date d'arrêté des comptes ne peut pas précéder la clôture de l'exercice : les organes dirigeants " +
          'arrêtent des comptes déjà clos (AUDCIF, Titre VIII ch. 31 § 1.3).',
      );
    }
    return this.prisma.exercice.update({
      where: { id: exerciceId },
      data: { dateArreteComptes: date },
    });
  }

  private async trouverExercice(tenantId: string, exerciceId: string) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!exercice) {
      throw new NotFoundException('Exercice introuvable pour ce tenant');
    }
    return exercice;
  }

  // ---------------------------------------------------------------------
  // Clôtures (Partielle/Totale/Période) · verrouillage de saisie, réversible
  // uniquement pour la Partielle.
  // ---------------------------------------------------------------------

  async clorePartielle(tenantId: string, exerciceId: string, userId: string, dto: ClorePartielleDto) {
    await this.trouverExercice(tenantId, exerciceId);
    const journal = await this.journalService.trouver(tenantId, dto.journalId);
    return this.prisma.cloture.create({
      data: {
        tenantId,
        exerciceId,
        granularite: GranulariteCloture.PARTIELLE,
        journalId: journal.id,
        dateLimite: new Date(dto.dateLimite),
        annulable: true,
        createdBy: userId,
      },
    });
  }

  async cloreTotale(tenantId: string, exerciceId: string, userId: string, dto: CloreTotaleDto) {
    const exercice = await this.trouverExercice(tenantId, exerciceId);
    const journal = await this.journalService.trouver(tenantId, dto.journalId);
    const dejaClos = await this.prisma.cloture.findFirst({
      where: { tenantId, journalId: journal.id, granularite: GranulariteCloture.TOTALE, annuleeAt: null },
    });
    if (dejaClos) {
      throw new ConflictException(`Le journal ${journal.code} est déjà clôturé totalement`);
    }
    return this.prisma.cloture.create({
      data: {
        tenantId,
        exerciceId,
        granularite: GranulariteCloture.TOTALE,
        journalId: journal.id,
        dateLimite: exercice.dateFin,
        annulable: false,
        createdBy: userId,
      },
    });
  }

  async clorePeriode(tenantId: string, exerciceId: string, userId: string, dto: ClorePeriodeDto) {
    await this.trouverExercice(tenantId, exerciceId);
    return this.prisma.cloture.create({
      data: {
        tenantId,
        exerciceId,
        granularite: GranulariteCloture.PERIODE,
        journalId: null,
        dateLimite: new Date(dto.dateLimite),
        annulable: false,
        createdBy: userId,
      },
    });
  }

  async listerClotures(tenantId: string, exerciceId: string) {
    await this.trouverExercice(tenantId, exerciceId);
    return this.prisma.cloture.findMany({
      where: { tenantId, exerciceId },
      include: { journal: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async annulerCloture(tenantId: string, clotureId: string, userId: string) {
    const cloture = await this.prisma.cloture.findFirst({ where: { id: clotureId, tenantId } });
    if (!cloture) {
      throw new NotFoundException('Clôture introuvable pour ce tenant');
    }
    if (!cloture.annulable) {
      throw new ForbiddenException('Cette clôture est définitive et ne peut pas être annulée (Totale/Période)');
    }
    if (cloture.annuleeAt) {
      throw new ForbiddenException('Cette clôture est déjà annulée');
    }
    return this.prisma.cloture.update({
      where: { id: cloture.id },
      data: { annuleeAt: new Date(), annuleeBy: userId },
    });
  }

  /**
   * Appelé par EcritureService.creer() avant toute écriture : lève une
   * ForbiddenException si une clôture active (Partielle/Totale sur ce
   * journal, ou Période tous journaux) verrouille cette date.
   */
  async verifierEcritureAutorisee(tenantId: string, journalId: string, date: Date) {
    const clotures = await this.prisma.cloture.findMany({
      where: { tenantId, annuleeAt: null, OR: [{ journalId }, { journalId: null }] },
    });
    for (const c of clotures) {
      if (c.granularite === GranulariteCloture.TOTALE && c.journalId === journalId) {
        throw new ForbiddenException('Ce journal est clôturé totalement · aucune écriture n\'y est plus possible.');
      }
      if (c.granularite === GranulariteCloture.PARTIELLE && c.journalId === journalId && date <= c.dateLimite) {
        throw new ForbiddenException(
          `Ce journal est clôturé partiellement jusqu'au ${c.dateLimite.toISOString().slice(0, 10)} · aucune écriture ne peut plus y être datée à cette période ou avant.`,
        );
      }
      if (c.granularite === GranulariteCloture.PERIODE && date <= c.dateLimite) {
        throw new ForbiddenException(
          `La période jusqu'au ${c.dateLimite.toISOString().slice(0, 10)} est clôturée pour tous les journaux.`,
        );
      }
    }
  }

  /**
   * Compte 13 réel · "131" (solde créditeur) ou "139" (solde débiteur) · il
   * n'existe PAS de compte 130 générique dans le plan SYCEBNL, et le 130 du
   * plan SYSCOHADA (Résultat en instance d'affectation) n'est qu'une
   * possibilité offerte À LA RÉOUVERTURE, pas le compte de clôture. Le compte
   * est choisi par le signe une fois `deltaResultat` connu.
   *
   * Les deux textes énoncent le MÊME fonctionnement, et c'est pour cela que la
   * logique de clôture est commune : le compte 13 est crédité à la clôture par
   * le débit de la classe 7 et des comptes créditeurs de la classe 8, débité
   * par le crédit de la classe 6 et des comptes débiteurs de la classe 8
   * (SYCEBNL, Partie 2 ch. 3, § COMPTE 13 ; AUDCIF, Titre VII § COMPTE 13,
   * Fonctionnement). Seuls les INTITULÉS diffèrent · voir libellesResultat.
   *
   * ⚠️ Trouvé et corrigé lors de l'audit rétroactif "chaque brique ancrée aux
   * référentiels" (docs/plan-de-construction.md §2.6) : la clôture postait
   * jusqu'ici le résultat sur un compte "13000000" fictif, jamais présent
   * dans le plan de comptes officiel SYCEBNL · les vrais comptes 131/139,
   * pourtant déjà seedés (compte-seed.ts), n'étaient jamais utilisés.
   *
   * Ces comptes doivent exister (seedés à l'inscription) · s'ils manquent,
   * c'est une anomalie de configuration du dossier à signaler clairement,
   * pas à corriger silencieusement en recréant un compte hors nomenclature.
   */
  private async trouverCompteResultat(
    tenantId: string,
    tx: Prisma.TransactionClient,
    deficitaire: boolean,
    referentiel: Referentiel,
  ) {
    const mots = libellesResultat(referentiel);
    const numero = deficitaire ? '13900000' : '13100000';
    const intitule = deficitaire ? mots.deficit : mots.excedent;
    const compte = await tx.compte.findUnique({ where: { tenantId_numero: { tenantId, numero } } });
    if (!compte) {
      throw new BadRequestException(
        `Compte ${numero} (${intitule}) introuvable pour ce dossier · nécessaire pour clôturer l'exercice. Le plan de comptes ${mots.plan} de ce dossier semble incomplet ou avoir été modifié.`,
      );
    }
    return compte;
  }

  /**
   * Clôture ANNUELLE de l'exercice : solde les comptes en mode AUCUN (charges/
   * produits, et comptes créditeurs/débiteurs de la classe 8 · même règle que
   * le fonctionnement officiel du compte 13, skill sycebnl) sur le compte de
   * résultat réel (131 Excédent ou 139 Déficit selon le signe), puis génère
   * le report à-nouveau réel dans l'exercice suivant (créé automatiquement
   * s'il n'existe pas encore) selon le mode de chaque compte restant (Solde =
   * un seul solde net, Détail = chaque mouvement non lettré individuellement).
   * Les deux écritures générées sont, par construction comptable (partie
   * double), toujours équilibrées · un déséquilibre ici signalerait un bug,
   * pas une donnée utilisateur invalide, d'où l'InternalServerErrorException
   * plutôt qu'un simple rejet de saisie.
   *
   * LIMITE CONNUE, NON CORRIGÉE À CE STADE, et la même dans les deux
   * référentiels : le compte 13 doit être soldé par une AFFECTATION décidée
   * par les organes compétents au cours de l'exercice suivant, pas reporté
   * indéfiniment sur lui-même. Faute de cette brique, le solde de 131/139
   * continue à s'accumuler d'exercice en exercice via le report à-nouveau
   * (mode SOLDE, comme tout compte de bilan) au lieu d'être remis à zéro ·
   * signalé ici explicitement plutôt que laissé silencieux (règle §2.6).
   *
   * Les contreparties de cette affectation ne sont pas les mêmes de part et
   * d'autre, ce qui est précisément pourquoi la brique reste à écrire :
   *
   *  · SYCEBNL, Partie 3 ch. 1 · affectation aux fonds propres de l'entité ;
   *  · AUDCIF, Titre VII § COMPTE 13, Commentaires et Fonctionnement · 12
   *    Report à nouveau, 11 Réserves, 101 Capital social, 103 Capital
   *    personnel, ou 465 Associés, dividendes à payer. « Dans les entités
   *    individuelles, le solde du compte 13 est viré au compte 103 (Capital
   *    personnel) », ce qui suppose de connaître la forme juridique OHADA du
   *    dossier · une raison de plus de traiter l'affectation à part.
   *
   * Le compte 130 « Résultat en instance d'affectation » (1301 bénéfice, 1309
   * perte) existe au plan SYSCOHADA et pas au plan SYCEBNL. L'AUDCIF n'en
   * fait qu'une POSSIBILITÉ offerte à la réouverture des comptes, pas une
   * obligation : la clôture ne l'utilise donc pas, et ne doit pas l'utiliser
   * tant que l'affectation n'est pas construite.
   */
  async cloturer(tenantId: string, exerciceId: string, userId: string) {
    const exercice = await this.trouverExercice(tenantId, exerciceId);
    // Le référentiel ne change RIEN à la mécanique de clôture · les deux
    // textes énoncent le même fonctionnement du compte 13. Il commande les
    // seuls intitulés, qui s'impriment au livre-journal.
    const { referentiel } = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true },
    });
    const mots = libellesResultat(referentiel);
    if (exercice.statut === StatutExercice.CLOTURE) {
      throw new ForbiddenException('Cet exercice est déjà clôturé');
    }

    // Rien ne doit rester en brouillard au moment de clôturer : la clôture
    // solde les comptes de gestion et génère le report à-nouveau à partir des
    // soldes du livre-journal. Une écriture restée en brouillard n'y figure
    // pas · elle serait purement et simplement perdue du résultat, et son
    // exercice serait clos avant qu'elle n'ait pu y entrer.
    const enBrouillard = await this.prisma.ecriture.count({
      where: { tenantId, exerciceId, statut: StatutEcriture.BROUILLARD },
    });
    if (enBrouillard > 0) {
      throw new BadRequestException(
        `${enBrouillard} écriture(s) sont encore en brouillard sur cet exercice. Validez-les ou supprimez-les avant ` +
          "de clôturer : la clôture ne lit que le livre-journal, et ce qui reste en brouillard serait perdu du résultat.",
      );
    }

    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const comptes = await tx.compte.findMany({
          where: { tenantId },
          include: { lignesEcriture: { where: { ecriture: { tenantId, exerciceId } }, include: { ecriture: true } } },
        });
        const solde = (c: (typeof comptes)[number]) =>
          c.lignesEcriture.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);

        // Journal support des écritures générées · on réutilise le journal
        // général existant (code OD, "Opérations diverses") plutôt que
        // d'introduire un 6e type de journal pour ce seul usage.
        const journal =
          (await tx.journal.findFirst({ where: { tenantId, code: 'OD' } })) ??
          (await tx.journal.findFirst({ where: { tenantId, type: TypeJournal.GENERAL } }));
        if (!journal) {
          throw new BadRequestException(
            "Aucun journal de type Général disponible pour enregistrer les écritures de clôture (journal 'OD' attendu).",
          );
        }

        // --- 1. Solde des comptes en mode AUCUN (charges/produits) sur le résultat ---
        const comptesAucun = comptes.filter((c) => c.modeReportANouveau === ModeReportANouveau.AUCUN && Math.abs(solde(c)) > EPSILON);
        let totalDebitResultat = 0;
        let totalCreditResultat = 0;
        const lignesCloture: Array<{ compteId: string; debit: number; credit: number; libelle: string }> = [];
        for (const c of comptesAucun) {
          const s = solde(c);
          if (s > 0) {
            lignesCloture.push({ compteId: c.id, debit: 0, credit: s, libelle: `Clôture ${c.numero} · ${c.intitule}` });
            totalDebitResultat += s;
          } else {
            lignesCloture.push({ compteId: c.id, debit: -s, credit: 0, libelle: `Clôture ${c.numero} · ${c.intitule}` });
            totalCreditResultat += -s;
          }
        }

        let deltaResultat = 0;
        let compteResultatId: string | null = null;
        if (lignesCloture.length > 0) {
          // Signe connu AVANT de choisir le compte : débit > crédit sur les
          // comptes de gestion fermés = déficit (compte 139), sinon excédent
          // (compte 131) · voir le commentaire de trouverCompteResultat.
          // Ligne unique nette (pas debit ET credit à la fois sur la même
          // ligne comme l'ancien code le faisait) : plus proche d'une
          // écriture réelle, et évite de gonfler artificiellement les deux
          // colonnes du journal pour ce compte.
          deltaResultat = totalDebitResultat - totalCreditResultat;
          // Résultat exactement nul (produits = charges) : ne rien pousser.
          // Une ligne debit: 0, credit: 0 est un mouvement fantôme · elle
          // apparaîtrait au grand livre mais pas à la balance (qui filtre les
          // comptes sans mouvement), et sa contrepartie serait calculée comme
          // si elle était au crédit. Un compte de résultat sans montant n'a
          // de toute façon rien à enregistrer.
          if (Math.abs(deltaResultat) > EPSILON) {
            const compteResultat = await this.trouverCompteResultat(tenantId, tx, deltaResultat > 0, referentiel);
            compteResultatId = compteResultat.id;
            lignesCloture.push({
              compteId: compteResultat.id,
              debit: deltaResultat > 0 ? deltaResultat : 0,
              credit: deltaResultat < 0 ? -deltaResultat : 0,
              libelle: deltaResultat > 0 ? mots.ligneDeficit : mots.ligneExcedent,
            });
          }

          const totalDebit = lignesCloture.reduce((s, l) => s + l.debit, 0);
          const totalCredit = lignesCloture.reduce((s, l) => s + l.credit, 0);
          if (Math.abs(totalDebit - totalCredit) > EPSILON) {
            throw new InternalServerErrorException("Écriture de clôture déséquilibrée · anomalie interne, clôture annulée.");
          }

          const numeroPiece = await this.journalService.prochainNumeroPiece(tenantId, journal, exerciceId, exercice.dateFin, tx);
          await tx.ecriture.create({
            data: {
              tenantId,
              exerciceId,
              journalId: journal.id,
              numeroPiece,
              date: exercice.dateFin,
              libelle: `Clôture des charges/produits · exercice ${exercice.dateDebut.getUTCFullYear()}`,
              createdBy: userId,
              estGenereeParCloture: true,
              lignes: { create: lignesCloture },
            },
          });
        }

        // --- 2. Report à-nouveau dans l'exercice suivant, selon le mode de chaque compte ---
        let exerciceSuivant = await tx.exercice.findFirst({
          where: { tenantId, dateDebut: { gt: exercice.dateFin } },
          orderBy: { dateDebut: 'asc' },
        });
        if (!exerciceSuivant) {
          /*
            L'EXERCICE SUIVANT EST UNE ANNÉE CIVILE, PAS UNE DURÉE RECOPIÉE.
            La version précédente reportait la durée de l'exercice clos en
            millisecondes : dateFin = (dateFin + 1 jour) + (dateFin - dateDebut).
            Sur deux années de longueur égale le compte tombait juste, et il
            tombait faux dès qu'une année bissextile entrait dans le calcul.
            Clôture de 2023 · l'exercice 2024 se terminait le 30 décembre 2024,
            et une écriture du 31 décembre n'avait plus d'exercice où aller.
            Clôture de 2024 · l'exercice 2025 se terminait le 1er janvier 2026,
            et mordait sur l'exercice suivant. Rien ne le signalait : l'en-tête
            imprime la durée en mois entamés, qui restait douze dans les deux
            cas, et tout l'aval était cohérent avec la mauvaise date.

            L'art. 7 de l'AUDCIF, non exclu par l'art. 3 du SYCEBNL et repris
            mot pour mot au glossaire de celui-ci, ne laisse pas le choix :
            l'exercice coïncide avec l'année civile. Le suivant part donc du
            lendemain de la clôture et va au 31 décembre de son année.
          */
          const { dateDebut, dateFin } = exerciceSuivantApres(exercice.dateFin);
          exerciceSuivant = await tx.exercice.create({ data: { tenantId, dateDebut, dateFin } });
        }

        const lignesRan: Array<{
          compteId: string;
          debit: number;
          credit: number;
          libelle: string;
          dateEcheance?: Date | null;
        }> = [];

        const comptesSolde = comptes.filter((c) => c.modeReportANouveau === ModeReportANouveau.SOLDE);
        for (const c of comptesSolde) {
          const s = solde(c) + (c.id === compteResultatId ? deltaResultat : 0);
          if (Math.abs(s) <= EPSILON) continue;
          lignesRan.push({
            compteId: c.id,
            debit: s > 0 ? s : 0,
            credit: s < 0 ? -s : 0,
            libelle: `Report à-nouveau ${c.numero} · ${c.intitule}`,
          });
        }

        const comptesDetail = comptes.filter((c) => c.modeReportANouveau === ModeReportANouveau.DETAIL);
        for (const c of comptesDetail) {
          for (const l of c.lignesEcriture) {
            if (l.lettre) continue; // seuls les mouvements NON lettrés sont reportés en détail
            lignesRan.push({
              compteId: c.id,
              debit: Number(l.debit),
              credit: Number(l.credit),
              libelle: `RAN détail ${c.numero} · ${l.libelle ?? l.ecriture.libelle}`,
              // L'échéance suit la créance ou la dette qu'elle qualifie : sans
              // ce report, la ventilation par échéance des notes 6, 9, 10, 18A
              // et 19 à 21 se viderait à chaque clôture, et une créance à trois
              // ans deviendrait « non ventilée » l'exercice suivant. Le report
              // à-nouveau en mode SOLDE, lui, agrège en une ligne unique : il
              // ne peut par construction porter aucune échéance · raison de
              // plus pour tenir les comptes de tiers en mode DÉTAIL.
              dateEcheance: l.dateEcheance,
            });
          }
        }

        if (lignesRan.length > 0) {
          const totalDebit = lignesRan.reduce((s, l) => s + l.debit, 0);
          const totalCredit = lignesRan.reduce((s, l) => s + l.credit, 0);
          if (Math.abs(totalDebit - totalCredit) > EPSILON) {
            throw new InternalServerErrorException(
              "Report à-nouveau déséquilibré · anomalie interne (identité partie double violée), clôture annulée.",
            );
          }
          const numeroPieceRan = await this.journalService.prochainNumeroPiece(
            tenantId,
            journal,
            exerciceSuivant.id,
            exerciceSuivant.dateDebut,
            tx,
          );
          await tx.ecriture.create({
            data: {
              tenantId,
              exerciceId: exerciceSuivant.id,
              journalId: journal.id,
              numeroPiece: numeroPieceRan,
              date: exerciceSuivant.dateDebut,
              libelle: `Report à-nouveau · ouverture exercice ${exerciceSuivant.dateDebut.getUTCFullYear()}`,
              createdBy: userId,
              estGenereeParCloture: true,
              lignes: { create: lignesRan },
            },
          });
        }

        return tx.exercice.update({ where: { id: exerciceId }, data: { statut: StatutExercice.CLOTURE } });
      },
      "Trop d'opérations simultanées sur cet exercice · veuillez réessayer.",
    );
  }
}

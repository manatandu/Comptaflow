import { ecartsRealisesNonConstates, motifClotureEcartsNonConstates } from '../reglements/ecarts-non-constates';
import { depreciationsOrphelines } from '../creances-douteuses/depreciations-orphelines';
import { motifClotureDepreciationsOrphelines } from '../creances-douteuses/creances-douteuses';
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
import { filtreBrouillardAValider } from '../comptabilite/centralisation-brouillard';
import { refuserSiExerciceBudgetaireClos } from '../analytique/exercice-budgetaire-clos';
import { echeanceDepassee, jourDeKinshasa } from '../../common/echeance';
import { reporterAuJourOuvrable } from '../retenues/jour-ouvrable';
import { premierJourNonCloture } from './report-periode-close';
import {
  budgetsAReporter,
  CompteRan,
  LigneLueRan,
  lignesReportANouveau,
  resultatDesComptesDeGestion,
  SommesRan,
  soldeDuCompte,
} from './report-a-nouveau';
import { estTenueParUnLettrage } from '../lettrage/ligne-lettree';
import { LOT_LECTURE, lireParLots, pageApres } from '../../common/lecture-par-lots';
import { libelleExercice } from '../../common/libelle-exercice';
import { formeApplicable } from '../tenant/forme-applicable';

/**
 * Ce que le refus dit de la voie que le texte ouvre · AUDCIF art. 22, 4°. Le
 * report n'est jamais fait d'office : c'est le comptable qui le demande.
 */
const AIDE_REPORT_ART_22 =
  "Pour une opération de cette période arrivée après la clôture, l'AUDCIF (art. 22, 4°) veut qu'elle soit " +
  "enregistrée au premier jour de la période non encore clôturée, sa date de valeur étant mentionnée " +
  'distinctement · demandez le report au premier jour ouvert.';

const EPSILON = 0.005;

/**
 * Au centime · les sommes viennent de la base en décimaux exacts, mais leur
 * différence en nombre flottant ne l'est plus (1500,10 moins 1000,20). La
 * colonne est à deux décimales ; l'écriture porte ce que la base gardera.
 */
const auCentime = (x: number) => Math.round(x * 100) / 100;

/**
 * Les écritures que la clôture annuelle engendre entrent au livre-journal
 * VALIDÉES, au nom de celui qui clôture (audit final F4). Elles ne sont
 * saisies par personne : la clôture les calcule sur des soldes déjà validés.
 */
function validationParLaCloture(userId: string) {
  return { statut: StatutEcriture.VALIDEE, valideeAt: new Date(), valideeBy: userId };
}

/** « 2025 » pour un exercice civil, « 01/07/2025 au 31/12/2026 » sinon. */
function periodeLisible(e: { dateDebut: Date; dateFin: Date }): string {
  const d = e.dateDebut.toISOString().slice(0, 10);
  const f = e.dateFin.toISOString().slice(0, 10);
  if (d.slice(5) === '01-01' && f.slice(5) === '12-31' && d.slice(0, 4) === f.slice(0, 4)) return d.slice(0, 4);
  const fr = (x: string) => `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}`;
  return `du ${fr(d)} au ${fr(f)}`;
}

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

/**
 * Cycle de vie de l'exercice (docs/plan-de-construction.md § 3.1), décrit
 * d'après le code (audit final F209) :
 * - trois clôtures (Partielle et Totale sur un journal, Période sur tous)
 *   qui verrouillent la saisie sans engendrer d'écriture · `clorePartielle`,
 *   `cloreTotale`, `clorePeriode`, et le verrou `refuserSiPeriodeClose`, joué
 *   par les contrôles d'entrée des pièces, la réimputation et la correction
 *   en négatif. La Totale et la Période figent en outre le lettrage et la
 *   ventilation (`gel-cloture.ts`), la Partielle non ;
 * - la clôture ANNUELLE (`cloturer`), qui solde les comptes de gestion (mode
 *   AUCUN) sur le 131 ou le 139 et passe le report à-nouveau définitif dans
 *   l'exercice suivant, selon le mode de chaque compte (Aucun, Solde, Détail),
 *   les deux écritures entrant validées ;
 * - le report à-nouveau PROVISOIRE (`genererANouveauxProvisoires`), même
 *   calcul (`report-a-nouveau.ts`), laissé au brouillard et remplacé à chaque
 *   relance comme à la clôture ;
 * - le planning de clôture, la date d'arrêté des comptes et le report des
 *   budgets sur l'exercice suivant.
 */
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
    //
    // LE DRAPEAU DE LIQUIDATION N'EXEMPTE QUE DE LA RÈGLE DU 31 DÉCEMBRE.
    //
    // L'art. 7 al. 4 ouvre UNE exception, et elle porte sur la DURÉE : « en
    // cas de cessation d'activité, pour quelque cause que ce soit, la durée
    // des opérations de liquidation est comptée pour un seul exercice, sous
    // réserve de l'établissement de situations annuelles provisoires ». Rien
    // dans cet alinéa ne permet à DEUX exercices de couvrir la même période,
    // et l'exercice unique ne dispense pas des situations annuelles, que la
    // situation intermédiaire des états permet de produire (passe O1a, D2).
    //
    // Le `return` était posé en tête et court-circuitait donc aussi le
    // contrôle d'unicité posé plus bas · c'est-à-dire l'un des quatre refus du
    // 2026-09-03 (CLAUDE.md § 10 bis), rouvert au moment précis où le dossier
    // est le plus fragile, la liquidation étant le seul cas où un exercice
    // long chevauche mécaniquement une année civile déjà ouverte.
    //
    // LE REFUS NE PORTE QUE SUR UN EXERCICE DÉJÀ CLÔTURÉ, et c'est délibéré.
    // Un exercice clos a sa liasse : un second exercice qui recouvrirait sa
    // période produirait deux jeux d'états sur les mêmes mois, et il n'existe
    // aucune raison légitime de le faire. Un exercice encore OUVERT, lui, est
    // le cas ordinaire de la cessation en cours d'année : l'exercice courant
    // devra être raccourci à la date de cessation, et OmegaX n'a aujourd'hui
    // aucune route pour le faire (aucun `update` sur `dateDebut`/`dateFin`).
    // Refuser là bloquerait la liquidation sans issue · ce cas est signalé au
    // relevé de manques et attend un arbitrage, il n'est pas tranché ici.
    if (liquidation) {
      const closDejaCouvert = await client.exercice.findFirst({
        where: {
          tenantId,
          statut: StatutExercice.CLOTURE,
          dateDebut: { lte: dateFin },
          dateFin: { gte: dateDebut },
        },
        select: { dateDebut: true, dateFin: true },
      });
      if (closDejaCouvert) {
        throw new BadRequestException(
          `Un exercice CLÔTURÉ couvre déjà cette période (${closDejaCouvert.dateDebut.toISOString().slice(0, 10)} ` +
            `au ${closDejaCouvert.dateFin.toISOString().slice(0, 10)}) · un exercice de liquidation échappe à la ` +
            "règle du 31 décembre (AUDCIF art. 7 al. 4), jamais à l'unicité de la période. Faites-le commencer " +
            "après la clôture du dernier exercice arrêté.",
        );
      }
      return;
    }

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

    // DEUX EXERCICES SUR LA MÊME ANNÉE CIVILE · l'art. 7 impose la durée, pas
    // l'unicité, et rien ne l'imposait ailleurs. Les deux passaient donc, et
    // le dossier se retrouvait avec deux exercices 2026 dans son sélecteur.
    // Aucun total n'est faux pour autant : les écritures se répartissent entre
    // les deux, chaque bilan boucle sur SON exercice, et il faut additionner
    // mentalement deux liasses pour voir que l'année est coupée en deux. Le
    // postulat de spécialisation suppose UN exercice par période (SYCEBNL
    // cadre conceptuel § 3.3.1.2.3), et le glossaire du SYCEBNL définit
    // l'exercice comme « la période couverte », au singulier.
    const anneeDejaOuverte = await client.exercice.findFirst({
      where: {
        tenantId,
        dateDebut: { lte: dateFin },
        dateFin: { gte: dateDebut },
      },
      select: { dateDebut: true, dateFin: true },
    });
    if (anneeDejaOuverte) {
      throw new BadRequestException(
        `Un exercice couvre déjà cette période (${anneeDejaOuverte.dateDebut.toISOString().slice(0, 10)} au ` +
          `${anneeDejaOuverte.dateFin.toISOString().slice(0, 10)}) · une période n'est couverte que par un seul ` +
          'exercice, sans quoi les écritures se répartiraient entre deux liasses qui bouclent chacune de son côté.',
      );
    }

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
   * Planning de clôture de l'exercice · les jalons de planning-cloture.ts
   * qui s'appliquent au dossier (`jalonsApplicables`, selon son référentiel,
   * sa forme et son droit ; aucun décompte écrit ici, il se périmait, audit
   * final F209), datés à partir de la date de clôture de CET exercice, les
   * échéances fiscales reportées au premier jour ouvrable, et augmentés de ce
   * qu'OmegaX sait observer tout seul.
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
    // LES JALONS DE LA FORME DE L'EXERCICE, PAS CELLE DU JOUR (AUSCGIE
    // art. 182 et 183, passe O1a, D3) · l'exercice au cours duquel la
    // transformation intervient est arrêté et approuvé selon la nouvelle forme,
    // les précédents gardent l'ancienne.
    const formeDeLExercice = formeApplicable(tenant, exercice.dateFin);

    const [enBrouillard, transcriptions, rapports, donations] = await Promise.all([
      // Le brouillard VALIDABLE · ni le report à-nouveau provisoire ni la
      // clôture d'un exercice clos, que personne ne peut valider (audit final
      // F77, règle de centralisation-brouillard.ts).
      this.prisma.ecriture.count({
        where: { tenantId, exerciceId, statut: StatutEcriture.BROUILLARD, ...filtreBrouillardAValider(exercice.statut) },
      }),
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

    // LE JOUR DE KINSHASA, PAS L'INSTANT (audit final F81) · un jalon n'est en
    // retard qu'au lendemain de son échéance.
    const aujourdHui = jourDeKinshasa(new Date());
    return {
      exerciceId: exercice.id,
      dateDebut: exercice.dateDebut,
      dateFin: exercice.dateFin,
      statut: exercice.statut,
      derniereVerification: DERNIERE_VERIFICATION,
      // Le planning n'est pas le même pour une ASBL, une ONG et une entreprise
      // commerciale : voir jalonsApplicables et son commentaire.
      formeJuridique: tenant.formeJuridique,
      formeJuridiqueSyscohada: formeDeLExercice,
      droitEtranger: tenant.droitEtranger,
      jalons: jalonsApplicables({
        referentiel: tenant.referentiel,
        formeJuridique: tenant.formeJuridique,
        formeJuridiqueSyscohada: formeDeLExercice,
        droitEtranger: tenant.droitEtranger,
        associeUniqueSas: tenant.associeUniqueSas,
      }).map((j) => {
        // Une échéance FISCALE tombant un jour non ouvrable est reportée au
        // premier jour ouvrable qui suit (LPF art. 110 bis, al. 2), comme au
        // registre des retenues · les autres jalons n'ont aucun texte qui les
        // reporte (audit final F81).
        const brute = dateJalon(exercice.dateFin, j.echeance);
        const echeance = j.echeanceFiscale ? reporterAuJourOuvrable(brute) : brute;
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
          enRetard: echeanceDepassee(echeance, aujourdHui) && !(observation?.satisfait ?? false),
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

  /**
   * CLÔTURE TOTALE · un journal jusqu'à une date. Le manuel Sage i7 l'illustre
   * par « Clôturer le journal ventes pour le mois de janvier » et « après la
   * clôture, on ne peut ni ajouter les écritures ni supprimer le journal des
   * ventes POUR LE MOIS DE JANVIER » : elle porte sur une période, pas sur la
   * vie entière du journal. Sans date, elle va jusqu'à la fin de l'exercice.
   */
  async cloreTotale(tenantId: string, exerciceId: string, userId: string, dto: CloreTotaleDto) {
    const exercice = await this.trouverExercice(tenantId, exerciceId);
    const journal = await this.journalService.trouver(tenantId, dto.journalId);
    const dateLimite = dto.dateLimite ? new Date(dto.dateLimite) : exercice.dateFin;
    if (dateLimite < exercice.dateDebut || dateLimite > exercice.dateFin) {
      throw new BadRequestException("La date de la clôture totale tombe hors de l'exercice.");
    }
    const dejaClos = await this.prisma.cloture.findFirst({
      where: {
        tenantId,
        journalId: journal.id,
        granularite: GranulariteCloture.TOTALE,
        annuleeAt: null,
        dateLimite: { gte: dateLimite },
      },
    });
    if (dejaClos) {
      throw new ConflictException(
        `Le journal ${journal.code} est déjà clôturé totalement jusqu'au ${dejaClos.dateLimite.toISOString().slice(0, 10)}`,
      );
    }
    return this.prisma.cloture.create({
      data: {
        tenantId,
        exerciceId,
        granularite: GranulariteCloture.TOTALE,
        journalId: journal.id,
        dateLimite,
        annulable: false,
        createdBy: userId,
      },
    });
  }

  /**
   * CLÔTURE DE PÉRIODE · tous les journaux jusqu'à une date, DÉFINITIVE. Elle
   * n'était bornée à rien (audit final F7) · une faute de frappe sur l'année
   * figeait la saisie, le lettrage et la ventilation du dossier entier, sans
   * retour possible. Même borne que la clôture totale : la date tombe dans
   * l'exercice pour lequel on la pose.
   */
  async clorePeriode(tenantId: string, exerciceId: string, userId: string, dto: ClorePeriodeDto) {
    const exercice = await this.trouverExercice(tenantId, exerciceId);
    const dateLimite = new Date(dto.dateLimite);
    if (dateLimite < exercice.dateDebut || dateLimite > exercice.dateFin) {
      throw new BadRequestException(
        "La date de la clôture de période tombe hors de l'exercice. Elle est définitive et fige tous les journaux · " +
          "posez-la depuis l'exercice qui contient cette date.",
      );
    }
    return this.prisma.cloture.create({
      data: {
        tenantId,
        exerciceId,
        granularite: GranulariteCloture.PERIODE,
        journalId: null,
        dateLimite,
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
   * Premier jour non clôturé pour ce journal (AUDCIF art. 22, 4°) · voir
   * `report-periode-close.ts`. Toujours une date, jamais `null` : une clôture
   * TOTALE est bornée à sa date limite et se franchit comme les autres, et
   * c'est `date` elle-même quand rien ne la bloque. Le premier jour ouvert
   * peut tomber hors de l'exercice · c'est l'appelant qui refuse alors le
   * report (`EcritureService.controlesDEntree`), lui seul connaissant
   * l'exercice (audit final F209).
   */
  async premierJourOuvert(tenantId: string, journalId: string, date: Date): Promise<Date> {
    return premierJourNonCloture(await this.cloturesApplicables(tenantId, journalId), journalId, date);
  }

  /**
   * Lève une ForbiddenException si une clôture active (Partielle ou Totale
   * sur ce journal, Période sur tous) verrouille cette date. Appelé par les
   * contrôles d'entrée d'une pièce (`EcritureService.controlesDEntree`, sauf
   * pour un lot, qui lit `cloturesApplicables` une fois par journal et joue
   * `refuserSiPeriodeClose`), par la réimputation et par la correction en
   * négatif (audit final F209).
   */
  async verifierEcritureAutorisee(tenantId: string, journalId: string, date: Date) {
    refuserSiPeriodeClose(await this.cloturesApplicables(tenantId, journalId), journalId, date);
  }

  /**
   * Les clôtures qui peuvent verrouiller une saisie sur ce journal · les
   * siennes et celles de période, jamais les annulées. Lues UNE fois par
   * journal quand un lot de pièces se contrôle (import, audit final F2).
   */
  cloturesApplicables(tenantId: string, journalId: string) {
    return this.prisma.cloture.findMany({
      where: { tenantId, annuleeAt: null, OR: [{ journalId }, { journalId: null }] },
    });
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
   * Clôture ANNUELLE de l'exercice : solde les comptes en mode AUCUN (charges,
   * produits, et comptes créditeurs ou débiteurs de la classe 8 · même règle
   * que le fonctionnement officiel du compte 13, skill sycebnl) sur le compte
   * de résultat réel (131 Excédent ou 139 Déficit selon le signe), puis passe
   * le report à-nouveau dans l'exercice suivant (créé s'il n'existe pas
   * encore) selon le mode de chaque compte restant · au SOLDE, son solde, une
   * ligne par devise au cours moyen et le reste en francs ; au DÉTAIL, chaque
   * mouvement non lettré (`report-a-nouveau.ts`). Les deux écritures sont,
   * par construction (partie double), toujours équilibrées · un déséquilibre
   * ici signalerait un défaut du calcul, pas une donnée invalide, d'où
   * l'InternalServerErrorException plutôt qu'un simple rejet de saisie.
   *
   * LA CLÔTURE NE SOLDE PAS LE COMPTE 13, et c'est voulu : le résultat passe
   * au report à-nouveau (mode SOLDE, comme tout compte de bilan), et c'est
   * l'AFFECTATION, décidée par les organes compétents au cours de l'exercice
   * suivant, qui le solde dans celui-ci (`affectation/affectation.service.ts`,
   * contreparties de chaque référentiel dans `regles-affectation.ts`). Tant
   * qu'aucune affectation n'est enregistrée, le résultat reste sur le 131 ou
   * le 139 et s'y cumule d'exercice en exercice. Ce commentaire tenait encore
   * l'affectation pour une brique à écrire (audit final F209).
   *
   * Le compte 130 « Résultat en instance d'affectation » (1301 bénéfice, 1309
   * perte) existe au plan SYSCOHADA et pas au plan SYCEBNL. L'AUDCIF n'en
   * fait qu'une POSSIBILITÉ offerte à la réouverture des comptes, pas une
   * obligation : ni la clôture ni l'affectation ne l'utilisent
   * (`cloture-vocabulaire.spec.ts` le tient pour la clôture).
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

    // LES EXERCICES SE CLÔTURENT DANS L'ORDRE (audit final F6). Clore 2026
    // avant 2025 calculait le report vers 2027 sans les soldes de 2025, puis
    // la clôture de 2025 écrivait son report dans un 2026 déjà clos, que plus
    // rien ne rouvrait · correspondance bilan de clôture / bilan d'ouverture
    // rompue (AUDCIF art. 34, SYCEBNL art. 16, 4), balance bouclée partout.
    const [precedentOuvert, suivantClos] = await Promise.all([
      this.prisma.exercice.findFirst({
        where: { tenantId, dateFin: { lt: exercice.dateDebut }, statut: { not: StatutExercice.CLOTURE } },
        orderBy: { dateDebut: 'asc' },
        select: { dateDebut: true, dateFin: true },
      }),
      this.prisma.exercice.findFirst({
        where: { tenantId, dateDebut: { gt: exercice.dateFin }, statut: StatutExercice.CLOTURE },
        select: { dateDebut: true },
      }),
    ]);
    if (precedentOuvert) {
      throw new BadRequestException(
        `L'exercice ${periodeLisible(precedentOuvert)} n'est pas clôturé. Les exercices se clôturent dans l'ordre : ` +
          'son report à-nouveau fait le bilan d’ouverture de celui-ci.',
      );
    }
    if (suivantClos) {
      throw new BadRequestException(
        "Un exercice postérieur est déjà clôturé : le report à-nouveau de celui-ci ne pourrait plus y entrer.",
      );
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

    // L'ÉCART DE CHANGE RÉALISÉ SE CONSTATE DANS SON EXERCICE (décision D3 ·
    // AUDCIF art. 55) · un lettrage dénoué dans sa devise dont l'écart n'est
    // pas passé laisserait le tiers au bilan d'un reste en francs qui n'est
    // plus une créance ni une dette, et le résultat sans sa perte ou son gain.
    // Lu AVANT la transaction, tel que D3 l'a posé · le relire dedans touche
    // à la lecture du report (F185) et sort du périmètre d'A7 (relecture M2).
    const enSouffrance = motifClotureEcartsNonConstates(await ecartsRealisesNonConstates(this.prisma, { tenantId, exerciceId }));
    if (enSouffrance) throw new BadRequestException(enSouffrance);

    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        // LA DÉPRÉCIATION D'UNE CRÉANCE SE REPREND À LA CLÔTURE (ligne A7,
        // relecture adverse B1 · fiche du compte 49) · une créance perdue ou
        // recouvrée sans revue de l'exercice laisserait au 491 une dépréciation
        // orpheline et le résultat minoré de sa reprise. RELUE DANS LA
        // TRANSACTION DE CLÔTURE (relecture « échecs silencieux », M2) · lue
        // avant, un geste passé entre la lecture et la clôture échappait au refus.
        const orphelines = motifClotureDepreciationsOrphelines(await depreciationsOrphelines(tx, { tenantId, exerciceId }));
        if (orphelines) throw new BadRequestException(orphelines);

        // Tout l'exercice · le brouillard vient d'être refusé plus haut. Les
        // comptes au SOLDE et de gestion sont lus en sommes, ceux au DÉTAIL
        // ligne à ligne (audit final F185, `lireComptesDuReport`).
        const comptes = await lireComptesDuReport(tx, tenantId, { tenantId, exerciceId });
        const solde = (c: CompteRan) => auCentime(soldeDuCompte(c));

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
          deltaResultat = auCentime(totalDebitResultat - totalCreditResultat);
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
              libelle: `Clôture des charges/produits · exercice ${libelleExercice(exercice)}`,
              createdBy: userId,
              estGenereeParCloture: true,
              estSoldeDesComptesDeGestion: true,
              // ENTRE VALIDÉE (audit final F4). Calculée sur le seul
              // livre-journal, la clôture ayant refusé tout brouillard, elle
              // ne pouvait plus l'être ensuite : `valider` refuse un exercice
              // clos. Restée au brouillard, elle manquait au livre-journal,
              // et l'affectation, qui ne lit que lui, ne trouvait aucun
              // résultat à affecter.
              ...validationParLaCloture(userId),
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

        // Le calcul vit dans report-a-nouveau.ts, partagé avec le report
        // PROVISOIRE · les deux doivent rendre le même report sur le même livre.
        const lignesRan = lignesReportANouveau(
          comptes,
          compteResultatId ? { compteId: compteResultatId, montant: deltaResultat } : null,
        );
        // Le report provisoire éventuel s'efface devant le définitif, et lui
        // laisse son numéro de pièce · la séquence du journal reste continue.
        const numeroProvisoire = await retirerANouveauProvisoire(tx, tenantId, exerciceSuivant.id);

        if (lignesRan.length > 0) {
          const totalDebit = lignesRan.reduce((s, l) => s + l.debit, 0);
          const totalCredit = lignesRan.reduce((s, l) => s + l.credit, 0);
          if (Math.abs(totalDebit - totalCredit) > EPSILON) {
            throw new InternalServerErrorException(
              "Report à-nouveau déséquilibré · anomalie interne (identité partie double violée), clôture annulée.",
            );
          }
          const numeroPieceRan =
            numeroProvisoire ??
            (await this.journalService.prochainNumeroPiece(tenantId, journal, exerciceSuivant.id, exerciceSuivant.dateDebut, tx));
          await tx.ecriture.create({
            data: {
              tenantId,
              exerciceId: exerciceSuivant.id,
              journalId: journal.id,
              numeroPiece: numeroPieceRan,
              date: exerciceSuivant.dateDebut,
              libelle: `Report à-nouveau · ouverture exercice ${libelleExercice(exerciceSuivant)}`,
              createdBy: userId,
              estGenereeParCloture: true,
              // Validé comme l'écriture de solde, et pour la même raison · il
              // se calcule sur des soldes validés, et resté au brouillard il
              // manquerait au bilan d'ouverture de tous les états légaux.
              ...validationParLaCloture(userId),
              lignes: { create: lignesRan },
            },
          });
        }

        return tx.exercice.update({ where: { id: exerciceId }, data: { statut: StatutExercice.CLOTURE } });
      },
      "Trop d'opérations simultanées sur cet exercice · veuillez réessayer.",
    );
  }

  /**
   * À-NOUVEAUX PROVISOIRES · Sage i7, Traitement / Fin d'exercice / Nouvel
   * exercice « avec génération des reports » : « Le nouvel exercice peut être
   * ouvert dès la fin de l'année courante. Ainsi vous pourrez commencer la
   * saisie des écritures concernant la nouvelle année tout en continuant à
   * saisir sur l'année passée », et « à tout moment, il sera possible de
   * lancer, voir de relancer les reports à nouveaux ».
   *
   * QUATRE RÈGLES. (1) Le calcul est CELUI DE LA CLÔTURE (report-a-nouveau.ts),
   * sur le LIVRE-JOURNAL de l'exercice · ce qui reste au brouillard n'y entre
   * qu'à la relance suivant sa validation, et c'est rendu. (2) Le report reste
   * AU BROUILLARD et ne se valide jamais · relancé, il est remplacé, ce qu'une
   * écriture validée ne permet plus (AUDCIF art. 22, 2°). (3) Une relance est
   * refusée si une ligne du report a été lettrée ou pointée sur le nouvel
   * exercice · « cette correction sera effectuée uniquement sur des écritures
   * non lettrées » (Sage), et le remplacer effacerait ce lettrage sans le dire.
   * (4) La clôture le remplace par le report définitif, même numéro de pièce.
   */
  async genererANouveauxProvisoires(
    tenantId: string,
    exerciceId: string,
    userId: string,
    options: { reporterBudgets?: boolean } = {},
  ) {
    const exercice = await this.trouverExercice(tenantId, exerciceId);
    if (exercice.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException(
        "Cet exercice est clôturé · son report à-nouveau est DÉFINITIF et a été passé par la clôture.",
      );
    }
    const { referentiel } = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true },
    });
    const brouillardNonRepris = await this.prisma.ecriture.count({
      where: { tenantId, exerciceId, statut: StatutEcriture.BROUILLARD },
    });

    const resultat = await avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        // Le livre-journal seul · ce qui reste au brouillard est compté à
        // part (`brouillardNonRepris`), jamais lu. Même lecture que la clôture
        // (audit final F185, `lireComptesDuReport`).
        const ran = await lireComptesDuReport(tx, tenantId, { tenantId, exerciceId, statut: StatutEcriture.VALIDEE });
        const journal =
          (await tx.journal.findFirst({ where: { tenantId, code: 'OD' } })) ??
          (await tx.journal.findFirst({ where: { tenantId, type: TypeJournal.GENERAL } }));
        if (!journal) {
          throw new BadRequestException("Aucun journal de type Général disponible pour le report à-nouveau (journal 'OD' attendu).");
        }

        let exerciceSuivant = await tx.exercice.findFirst({
          where: { tenantId, dateDebut: { gt: exercice.dateFin } },
          orderBy: { dateDebut: 'asc' },
        });
        if (!exerciceSuivant) {
          // Même règle que la clôture · l'exercice suivant est une année civile.
          const { dateDebut, dateFin } = exerciceSuivantApres(exercice.dateFin);
          exerciceSuivant = await tx.exercice.create({ data: { tenantId, dateDebut, dateFin } });
        }
        if (exerciceSuivant.statut === StatutExercice.CLOTURE) {
          throw new BadRequestException("L'exercice suivant est clôturé · il ne reçoit plus de report.");
        }

        const delta = resultatDesComptesDeGestion(ran);
        let resultatCompte: { compteId: string; montant: number } | null = null;
        if (Math.abs(delta) > EPSILON) {
          const compte = await this.trouverCompteResultat(tenantId, tx, delta > 0, referentiel);
          resultatCompte = { compteId: compte.id, montant: delta };
        }
        const lignes = lignesReportANouveau(ran, resultatCompte);
        const debit = lignes.reduce((t, l) => t + l.debit, 0);
        const credit = lignes.reduce((t, l) => t + l.credit, 0);
        if (Math.abs(debit - credit) > EPSILON) {
          throw new InternalServerErrorException('Report à-nouveau provisoire déséquilibré · anomalie interne, rien n’a été passé.');
        }

        const numeroProvisoire = await retirerANouveauProvisoire(tx, tenantId, exerciceSuivant.id);
        if (lignes.length > 0) {
          const numeroPiece =
            numeroProvisoire ??
            (await this.journalService.prochainNumeroPiece(tenantId, journal, exerciceSuivant.id, exerciceSuivant.dateDebut, tx));
          await tx.ecriture.create({
            data: {
              tenantId,
              exerciceId: exerciceSuivant.id,
              journalId: journal.id,
              numeroPiece,
              date: exerciceSuivant.dateDebut,
              libelle: `Report à-nouveau PROVISOIRE · ouverture exercice ${libelleExercice(exerciceSuivant)}`,
              createdBy: userId,
              estGenereeParCloture: true,
              estANouveauProvisoire: true,
              lignes: { create: lignes },
            },
          });
        }
        return { exerciceSuivantId: exerciceSuivant.id, lignes: lignes.length, resultat: delta };
      },
      "Trop d'opérations simultanées sur cet exercice · veuillez réessayer.",
    );

    const budgets = options.reporterBudgets ? await this.reporterBudgets(tenantId, exerciceId) : null;
    return { ...resultat, brouillardNonRepris, budgetsReportes: budgets?.reportes ?? null };
  }

  /**
   * REPORT DES BUDGETS sur l'exercice suivant (Sage i7) · voir
   * `budgetsAReporter` : rien n'est écrasé, aucune convention close n'est
   * dotée. L'exercice suivant doit exister · on ne le crée pas pour un budget.
   */
  async reporterBudgets(tenantId: string, exerciceId: string) {
    const exercice = await this.trouverExercice(tenantId, exerciceId);
    const suivant = await this.prisma.exercice.findFirst({
      where: { tenantId, dateDebut: { gt: exercice.dateFin } },
      orderBy: { dateDebut: 'asc' },
    });
    if (!suivant) throw new BadRequestException("L'exercice suivant n'existe pas encore · ouvrez-le avant d'y reporter les budgets.");
    // Un budget ne se dépose pas sur un exercice clôturé (audit final F143).
    refuserSiExerciceBudgetaireClos(suivant.statut);
    const [budgets, dejaDotes, sections] = await Promise.all([
      this.prisma.budgetSection.findMany({ where: { exerciceId, section: { tenantId } } }),
      this.prisma.budgetSection.findMany({ where: { exerciceId: suivant.id, section: { tenantId } } }),
      this.prisma.sectionAnalytique.findMany({ where: { tenantId }, select: { id: true, dateFin: true } }),
    ]);
    const closes = new Set(sections.filter((x) => x.dateFin && x.dateFin < suivant.dateDebut).map((x) => x.id));
    const aReporter = budgetsAReporter(
      budgets.map((b) => ({ sectionId: b.sectionId, mois: b.mois, montant: Number(b.montant) })),
      dejaDotes,
      closes,
    );
    if (aReporter.length) {
      await this.prisma.budgetSection.createMany({
        data: aReporter.map((b) => ({ sectionId: b.sectionId, exerciceId: suivant.id, mois: b.mois, montant: b.montant })),
      });
    }
    return { reportes: aReporter.length, dejaDotes: dejaDotes.length, sectionsCloses: closes.size };
  }
}

/**
 * CE QUE LE REPORT LIT D'UNE LIGNE AU DÉTAIL, ET RIEN DE PLUS (audit final
 * F185) · la clôture chargeait chaque ligne avec son écriture ENTIÈRE, dans
 * une transaction qui tient déjà tout l'exercice. `versLigneRan` le vérifie
 * au typage.
 */
const SELECT_LIGNE_RAN = {
  debit: true,
  credit: true,
  lettre: true,
  libelle: true,
  dateEcheance: true,
  deviseId: true,
  montantDevise: true,
  coursApplique: true,
  ecriture: { select: { libelle: true } },
} satisfies Prisma.LigneEcritureSelect;

/** Une ligne au DÉTAIL, au format du calcul partagé. */
function versLigneRan(l: {
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  lettre: string | null;
  libelle: string | null;
  dateEcheance: Date | null;
  // Exigés · un report qui oublierait la devise sortirait la position de la
  // réévaluation de l'exercice suivant (audit final F55).
  deviseId: string | null;
  montantDevise: Prisma.Decimal | null;
  coursApplique: Prisma.Decimal | null;
  ecriture: { libelle: string };
}): LigneLueRan {
  return {
    debit: Number(l.debit),
    credit: Number(l.credit),
    lettre: l.lettre,
    libelle: l.libelle ?? l.ecriture.libelle,
    dateEcheance: l.dateEcheance,
    deviseId: l.deviseId,
    montantDevise: l.montantDevise === null ? null : Number(l.montantDevise),
    coursApplique: l.coursApplique === null ? null : Number(l.coursApplique),
  };
}

/**
 * LA LECTURE DU REPORT, UNE FOIS POUR LA CLÔTURE ET LE PROVISOIRE (audit final
 * F185). Les deux lisaient toutes les lignes de l'exercice, compte par compte,
 * y compris celles des comptes au SOLDE et de gestion, dont le calcul ne garde
 * que des sommes · un dossier chargé montait l'exercice entier en mémoire dans
 * une transaction sérialisable.
 *
 *  · AU SOLDE ET EN GESTION, LA BASE REND LES SOMMES. Débit et crédit de
 *    chaque compte ; et ses lignes en devise, par devise et par SENS · le sens
 *    se lit sur CHAQUE ligne (débit supérieur ou égal au crédit), par une
 *    référence de champ, parce que le montant en devise est gardé sans signe
 *    et qu'une ligne inscrite en négatif le retranche. Une ligne n'y est en
 *    devise que si elle nomme sa devise ET porte un montant en devise non nul,
 *    la définition de `sommesDesLignes`.
 *  · AU DÉTAIL, LES LIGNES, par tranches (`lireParLots`) · chaque mouvement
 *    non lettré est reporté un à un. Les lettrées restent en base, puisque le
 *    report les écarte ; une lettre vide n'y vaut pas lettre, comme au calcul.
 *
 * Le report rendu est le même, au centime, que celui de la lecture ligne à
 * ligne (`report-a-nouveau-agrege.spec.ts` confronte les deux sur un même
 * jeu). `ecriture` porte le périmètre de l'appelant · l'exercice entier à la
 * clôture, le livre-journal seul au provisoire.
 */
async function lireComptesDuReport(
  tx: Prisma.TransactionClient,
  tenantId: string,
  ecriture: Prisma.EcritureWhereInput,
): Promise<CompteRan[]> {
  // « Non nul » en deux bornes strictes plutôt qu'un NOT · une comparaison
  // à NULL n'est ni vraie ni fausse en SQL, et c'est ce que `gt` et `lt`
  // écartent sans ambiguïté, comme `!montantDevise` au calcul.
  const enDevise = {
    ecriture,
    deviseId: { not: null },
    OR: [{ montantDevise: { gt: 0 } }, { montantDevise: { lt: 0 } }],
  } satisfies Prisma.LigneEcritureWhereInput;
  const credit = tx.ligneEcriture.fields.credit;
  const [plan, totaux, positifs, negatifs] = await Promise.all([
    tx.compte.findMany({
      where: { tenantId },
      select: { id: true, numero: true, intitule: true, modeReportANouveau: true },
      orderBy: { numero: 'asc' },
    }),
    tx.ligneEcriture.groupBy({ by: ['compteId'], where: { ecriture }, _sum: { debit: true, credit: true } }),
    tx.ligneEcriture.groupBy({
      by: ['compteId', 'deviseId'],
      where: { ...enDevise, debit: { gte: credit } },
      _sum: { debit: true, credit: true, montantDevise: true },
    }),
    tx.ligneEcriture.groupBy({
      by: ['compteId', 'deviseId'],
      where: { ...enDevise, debit: { lt: credit } },
      _sum: { debit: true, credit: true, montantDevise: true },
    }),
  ]);

  const nombre = (x: Prisma.Decimal | null) => (x === null ? 0 : Number(x));
  const sommes = new Map<string, SommesRan>();
  const sommesDe = (compteId: string) => {
    const s = sommes.get(compteId) ?? { debit: 0, credit: 0, enDevise: [] };
    sommes.set(compteId, s);
    return s;
  };
  for (const t of totaux) {
    const s = sommesDe(t.compteId);
    s.debit = nombre(t._sum.debit);
    s.credit = nombre(t._sum.credit);
  }
  for (const [groupes, sens] of [
    [positifs, 1],
    [negatifs, -1],
  ] as const) {
    for (const g of groupes) {
      if (!g.deviseId) continue;
      sommesDe(g.compteId).enDevise.push({
        deviseId: g.deviseId,
        sens,
        debit: nombre(g._sum.debit),
        credit: nombre(g._sum.credit),
        montantDevise: nombre(g._sum.montantDevise),
      });
    }
  }

  const lignes = new Map<string, LigneLueRan[]>();
  await lireParLots(
    (curseur) =>
      tx.ligneEcriture.findMany({
        where: {
          ecriture,
          compte: { modeReportANouveau: ModeReportANouveau.DETAIL },
          OR: [{ lettre: null }, { lettre: '' }],
        },
        select: { id: true, compteId: true, ...SELECT_LIGNE_RAN },
        ...pageApres(curseur, LOT_LECTURE),
      }),
    (l) => {
      const duCompte = lignes.get(l.compteId) ?? [];
      duCompte.push(versLigneRan(l));
      lignes.set(l.compteId, duCompte);
    },
    LOT_LECTURE,
  );

  return plan.map((c) =>
    c.modeReportANouveau === ModeReportANouveau.DETAIL
      ? { ...c, lignes: lignes.get(c.id) ?? [] }
      : { ...c, sommes: sommes.get(c.id) ?? { debit: 0, credit: 0, enDevise: [] } },
  );
}

/**
 * Retire le report PROVISOIRE d'un exercice et rend son numéro de pièce, pour
 * que le report suivant le reprenne. Refuse s'il a été lettré ou pointé : le
 * remplacer effacerait ce travail sans le dire.
 */
async function retirerANouveauProvisoire(
  tx: Prisma.TransactionClient,
  tenantId: string,
  exerciceId: string,
): Promise<number | null> {
  const provisoire = await tx.ecriture.findFirst({
    where: { tenantId, exerciceId, estANouveauProvisoire: true },
    include: { lignes: { select: { lettre: true, lettrageId: true, rapprochementId: true } } },
  });
  if (!provisoire) return null;
  // Soldé OU partiel (audit final F50, lettrage/ligne-lettree.ts).
  if (provisoire.lignes.some((l) => estTenueParUnLettrage(l) || l.rapprochementId)) {
    throw new BadRequestException(
      "Des lignes du report à-nouveau provisoire ont été lettrées ou pointées sur le nouvel exercice · délettrez-les " +
        "(ou dépointez-les) avant de relancer le report. Le remplacer effacerait ce travail sans le dire.",
    );
  }
  await tx.ligneEcriture.deleteMany({ where: { ecritureId: provisoire.id } });
  await tx.ecriture.delete({ where: { id: provisoire.id } });
  return provisoire.numeroPiece;
}

/**
 * LE VERROU DE SAISIE · une écriture datée d'une période close ne passe pas.
 * Règle pure, pour que la saisie à l'unité et le contrôle d'un lot (import,
 * audit final F2) la jouent à l'identique.
 */
export function refuserSiPeriodeClose(
  clotures: Array<{ granularite: GranulariteCloture; journalId: string | null; dateLimite: Date }>,
  journalId: string,
  date: Date,
) {
  for (const c of clotures) {
    // Bornée à sa date limite · une clôture totale de janvier (ou de 2026)
    // ne ferme pas février (ou 2027) du même journal.
    if (c.granularite === GranulariteCloture.TOTALE && c.journalId === journalId && date <= c.dateLimite) {
      throw new ForbiddenException(
        `Ce journal est clôturé totalement jusqu'au ${c.dateLimite.toISOString().slice(0, 10)} · aucune écriture n'y est plus possible à cette date. ` +
          AIDE_REPORT_ART_22,
      );
    }
    if (c.granularite === GranulariteCloture.PARTIELLE && c.journalId === journalId && date <= c.dateLimite) {
      throw new ForbiddenException(
        `Ce journal est clôturé partiellement jusqu'au ${c.dateLimite.toISOString().slice(0, 10)} · aucune écriture ne peut plus y être datée à cette période ou avant. ` +
          AIDE_REPORT_ART_22,
      );
    }
    if (c.granularite === GranulariteCloture.PERIODE && date <= c.dateLimite) {
      throw new ForbiddenException(
        `La période jusqu'au ${c.dateLimite.toISOString().slice(0, 10)} est clôturée pour tous les journaux. ` +
          AIDE_REPORT_ART_22,
      );
    }
  }
}

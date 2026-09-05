import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatutMessage } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { adresseAcceptable, normaliserAdresse } from './adresse-courriel';
import { prochainEssaiApresEchec, statutApresEchec } from './report-tentatives';
import { ManqueTransport, TransportCourriel, texteDErreur } from './transport-courriel';

/**
 * LA FILE DES COURRIELS.
 *
 * Le message est ÉCRIT AVANT toute tentative, et c'est la décision centrale du
 * module (voir la migration 20260914180000_file_des_courriels). Un envoi tenté
 * sans avoir été écrit est perdu quand il échoue ; or la relance a été DÉCIDÉE
 * par le comptable, elle doit survivre à une coupure réseau, à un redémarrage
 * de l'instance, et surtout SE VOIR.
 *
 * Aucun envoi ne fait échouer l'appelant. `mettreEnFile` rend le statut
 * atteint, y compris SANS_TRANSPORT, et ne lève que sur ce qui est
 * IRRÉCUPÉRABLE à la lecture (adresse inutilisable, message vide). Autrement
 * dit : une messagerie non posée n'annule pas une relance décidée.
 */

/**
 * L'ORIGINE · ce qui a produit le message. Colonne libre, ces deux valeurs
 * sont celles que la migration nomme · un module qui en ajoute une la nomme
 * ici, faute de quoi la file devient illisible au bout d'un mois : on voit
 * partir des messages sans savoir quelle décision comptable les a demandés.
 */
export const ORIGINE_RELANCE = 'RELANCE';
export const ORIGINE_MOT_DE_PASSE_TEMPORAIRE = 'MOT_DE_PASSE_TEMPORAIRE';

export interface MessageAMettreEnFile {
  destinataire: string;
  destinataireNom?: string | null;
  sujet: string;
  corps: string;
  /** Voir ORIGINE_RELANCE et ORIGINE_MOT_DE_PASSE_TEMPORAIRE. */
  origine: string;
  /** Clé de la pièce d'origine quand elle en a une · sert à y remonter. */
  origineId?: string | null;
  /** Identifiant de l'utilisateur qui a décidé l'envoi, quand il y en a un. */
  createdBy?: string | null;
}

export interface ResultatMiseEnFile {
  id: string;
  statut: StatutMessage;
  erreur: string | null;
}

export interface BilanReprise {
  transportConfigure: boolean;
  manques: ManqueTransport[];
  examines: number;
  envoyes: number;
  echoues: number;
  abandonnes: number;
  /** Non traités · repris par un autre appel, ou ligne disparue entre-temps. */
  ignores: number;
  /** Encore à reprendre après ce passage · l'écran peut proposer de continuer. */
  restants: number;
}

export type CompteursParStatut = Record<StatutMessage, number> & { aRelancer: number };

/**
 * UN MESSAGE EN_ATTENTE PLUS VIEUX QUE CECI EST UN ORPHELIN.
 *
 * La tentative suit immédiatement l'écriture et se règle en secondes. Un
 * message resté EN_ATTENTE cinq minutes n'est donc pas en cours d'envoi :
 * c'est le processus qui est mort entre les deux (redémarrage d'instance,
 * conteneur recyclé). Sans ce rattrapage, il resterait invisible pour toujours
 * dans un état que rien ne relit · c'est exactement la coupure contre laquelle
 * la file existe. Cinq minutes plutôt qu'une : une poignée de main TLS sur un
 * lien lent, plus un serveur qui met du temps à répondre, ne doivent pas faire
 * passer un envoi RÉEL pour un orphelin, ce qui l'enverrait deux fois.
 */
const DELAI_ORPHELIN_MS = 5 * 60_000;

/**
 * COMBIEN DE MESSAGES PAR APPEL DE REPRISE.
 *
 * La reprise est un appel HTTP synchrone déclenché par l'écran. Une remise
 * SMTP coûte de l'ordre de la seconde : au-delà d'une vingtaine, la requête
 * dépasse la patience du navigateur et celle des relais, le comptable reclique,
 * et le travail se fait deux fois. Le bilan rend `restants` pour que l'écran
 * propose de continuer plutôt que de laisser croire que la file est vide.
 */
export const REPRISE_PAR_APPEL = 25;
const REPRISE_MAXIMUM = 100;

/** Plafond de la liste rendue à l'écran de suivi (voir CLAUDE.md § 8 bis). */
export const LISTE_PAR_DEFAUT = 200;
const LISTE_MAXIMUM = 500;

/**
 * LE CORPS N'EST PAS DANS LA LISTE, ET CE N'EST PAS UNE TRONCATURE.
 *
 * Un rappel fait plusieurs milliers de caractères ; deux cents lignes en
 * porteraient plus que tout le reste de l'écran. Le choix n'est PAS de le
 * couper à trois cents caractères pour l'aperçu · un texte coupé se lit comme
 * le message et n'en est pas un, et c'est précisément la troncature muette
 * qu'on refuse. Il est ABSENT de la liste et ENTIER dans la fiche
 * (`GET /courrier/:id`).
 */
const CHAMPS_LISTE = {
  id: true,
  destinataire: true,
  destinataireNom: true,
  sujet: true,
  origine: true,
  origineId: true,
  statut: true,
  tentatives: true,
  dernierEssaiAt: true,
  prochainEssaiAt: true,
  erreur: true,
  envoyeAt: true,
  createdBy: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;

@Injectable()
export class CourrierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transport: TransportCourriel,
  ) {}

  /** « Le transport est-il configuré ? », et sinon, ce qui manque. */
  etatDuTransport() {
    return this.transport.etat();
  }

  /**
   * ÉCRIT le message, PUIS tente si un transport existe.
   *
   * Ne lève JAMAIS pour un défaut de transport ni pour un échec d'envoi · le
   * statut rendu porte l'information. Lève seulement sur ce qui ne peut pas
   * être réparé par une nouvelle tentative.
   */
  async mettreEnFile(tenantId: string, message: MessageAMettreEnFile): Promise<ResultatMiseEnFile> {
    const destinataire = normaliserAdresse(message.destinataire);
    if (!adresseAcceptable(destinataire)) {
      // REFUSÉ À L'ÉCRITURE · découverte à la troisième tentative, la faute
      // remonterait des heures après le geste qui l'a produite, à quelqu'un
      // qui ne tient plus ni le tiers ni la pièce.
      throw new BadRequestException(
        `Adresse de destinataire inutilisable · « ${destinataire || '(vide)'} ». Le message n'a pas été mis en file.`,
      );
    }
    const sujet = (message.sujet ?? '').trim();
    if (sujet.length === 0) {
      throw new BadRequestException("Message sans objet · le sujet est obligatoire.");
    }
    // Le corps est écrit TEL QUEL, sans découpe ni normalisation · seul son
    // caractère vide est refusé, parce qu'un corps vide signe une composition
    // qui a échoué en amont et qu'il n'y a rien à envoyer.
    if ((message.corps ?? '').trim().length === 0) {
      throw new BadRequestException('Message sans corps · rien à envoyer.');
    }
    const origine = (message.origine ?? '').trim();
    if (origine.length === 0) {
      throw new BadRequestException("Message sans origine · la file serait illisible sans elle.");
    }

    const ligne = await this.prisma.message.create({
      data: {
        tenantId,
        destinataire,
        destinataireNom: message.destinataireNom ?? null,
        sujet,
        corps: message.corps,
        origine,
        origineId: message.origineId ?? null,
        createdBy: message.createdBy ?? null,
      },
    });

    return this.tenter(tenantId, ligne);
  }

  /**
   * LA REPRISE, ET QUI LA DÉCLENCHE.
   *
   * Le produit n'a AUCUN ordonnanceur et le service tourne sur Cloud Run : un
   * `setInterval` posé dans le processus serait perdu au premier redémarrage
   * d'instance, et DOUBLÉ dès qu'une seconde instance monte (le plafond est de
   * quatre, voir CLAUDE.md § 5) · le même message partirait deux fois à un
   * tiers. La reprise est donc une ACTION, appelée depuis l'écran, bornée à un
   * dossier et à un lot.
   */
  async reprendre(tenantId: string, limite = REPRISE_PAR_APPEL): Promise<BilanReprise> {
    const etat = this.transport.etat();
    const maintenant = new Date();

    if (!etat.configure) {
      // Rien n'est tenté, et le bilan le DIT · incrémenter des compteurs de
      // tentatives sans transport consommerait le plafond de messages qui
      // n'ont jamais eu leur chance, et les mènerait à ABANDONNE pour une
      // cause qui n'a rien à voir avec eux.
      return {
        transportConfigure: false,
        manques: etat.manques,
        examines: 0,
        envoyes: 0,
        echoues: 0,
        abandonnes: 0,
        ignores: 0,
        restants: await this.prisma.message.count({ where: this.filtreEligibles(tenantId, maintenant) }),
      };
    }

    const candidats = await this.prisma.message.findMany({
      where: this.filtreEligibles(tenantId, maintenant),
      // Le plus ancien d'abord · une relance de la semaine dernière passe
      // avant celle de ce matin, sinon un lot volumineux repousse indéfiniment
      // les messages qu'il a lui-même fait échouer.
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(1, Math.trunc(limite)), REPRISE_MAXIMUM),
    });

    const bilan: BilanReprise = {
      transportConfigure: true,
      manques: [],
      examines: 0,
      envoyes: 0,
      echoues: 0,
      abandonnes: 0,
      ignores: 0,
      restants: 0,
    };

    for (const candidat of candidats) {
      if (!(await this.revendiquer(tenantId, candidat, new Date()))) {
        bilan.ignores += 1;
        continue;
      }
      bilan.examines += 1;
      try {
        const resultat = await this.tenter(tenantId, candidat);
        if (resultat.statut === StatutMessage.ENVOYE) bilan.envoyes += 1;
        else if (resultat.statut === StatutMessage.ABANDONNE) bilan.abandonnes += 1;
        else bilan.echoues += 1;
      } catch {
        // Une ligne disparue entre la lecture et l'écriture ne doit pas
        // emporter le lot · les vingt-quatre autres relances ont été décidées
        // elles aussi, et un lot qui meurt au troisième message ne rend aucun
        // bilan de ce qu'il a déjà fait.
        bilan.examines -= 1;
        bilan.ignores += 1;
      }
    }

    bilan.restants = await this.prisma.message.count({
      where: this.filtreEligibles(tenantId, new Date()),
    });
    return bilan;
  }

  /** La file du dossier, la plus récente d'abord, éventuellement filtrée par état. */
  async lister(tenantId: string, options: { statut?: StatutMessage; limite?: number } = {}) {
    const plafond = Math.min(Math.max(1, Math.trunc(options.limite ?? LISTE_PAR_DEFAUT)), LISTE_MAXIMUM);
    // Le `tenantId` est écrit DANS chaque appel plutôt que rangé dans une
    // variable commune · le balayage de `cloisonnement.spec.ts` lit le corps
    // de l'appel et ne suit pas les variables, si bien qu'une borne portée par
    // une variable doit être gelée à la main dans une liste d'exceptions.
    // Deux caractères de plus valent mieux qu'une exception de plus.
    const etat: Prisma.MessageWhereInput = options.statut ? { statut: options.statut } : {};
    // Le total est pris sur le PÉRIMÈTRE ENTIER, pas sur la tranche rendue ·
    // un écran de travail peut ne montrer qu'une tranche à condition de le
    // dire (CLAUDE.md § 8 bis).
    const total = await this.prisma.message.count({ where: { tenantId, ...etat } });
    const messages = await this.prisma.message.findMany({
      where: { tenantId, ...etat },
      orderBy: { createdAt: 'desc' },
      take: plafond,
      select: CHAMPS_LISTE,
    });
    return { messages, total, plafond, tronque: total > messages.length };
  }

  /** Un message entier, CORPS COMPRIS · c'est ici qu'on lit ce qui est parti. */
  async lire(tenantId: string, id: string) {
    const message = await this.prisma.message.findFirst({ where: { id, tenantId } });
    if (!message) throw new NotFoundException('Message introuvable dans ce dossier');
    return message;
  }

  /**
   * LE COMPTE PAR ÉTAT, pour la cloche du client.
   *
   * Les cinq états sont rendus MÊME À ZÉRO · une cloche qui reçoit une forme
   * différente selon ce que contient la file affiche « undefined » le jour où
   * un état se vide, et c'est ce jour-là qu'on voudrait la croire.
   */
  async compterParStatut(tenantId: string): Promise<CompteursParStatut> {
    const groupes = await this.prisma.message.groupBy({
      by: ['statut'],
      where: { tenantId },
      _count: { _all: true },
    });
    const compteurs = Object.values(StatutMessage).reduce(
      (acc, statut) => ({ ...acc, [statut]: 0 }),
      {} as Record<StatutMessage, number>,
    );
    for (const groupe of groupes) compteurs[groupe.statut] = groupe._count._all;
    return {
      ...compteurs,
      // Ce que le bouton « Relancer les échecs » traiterait à l'instant · ni
      // les envoyés, ni les abandonnés, ni les échecs dont l'heure n'est pas
      // venue. Une pastille qui compte des messages sur lesquels le bouton ne
      // fera rien apprend à ignorer la pastille.
      aRelancer: await this.prisma.message.count({ where: this.filtreEligibles(tenantId, new Date()) }),
    };
  }

  // ----------------------------------------------------------------------

  /**
   * CE QUI EST REPRENABLE, ET POURQUOI CHAQUE BRANCHE EXISTE.
   *
   * Le filtre porte son `tenantId` en tête · le cloisonnement est posé aux
   * DEUX bouts, la garde de `src/common/cloisonnement/` refusant par ailleurs
   * toute collection non bornée.
   */
  private filtreEligibles(tenantId: string, maintenant: Date): Prisma.MessageWhereInput {
    const seuilOrphelin = new Date(maintenant.getTime() - DELAI_ORPHELIN_MS);
    return {
      tenantId,
      OR: [
        // Écrits sans transport · ils repartent tels quels le jour où les
        // identifiants sont posés, sans avoir été réécrits. C'est tout l'objet
        // de cet état.
        { statut: StatutMessage.SANS_TRANSPORT },
        // Échecs dont l'heure du report est passée.
        { statut: StatutMessage.ECHEC, prochainEssaiAt: { lte: maintenant } },
        // Échec SANS date de prochain essai · ce code en pose toujours une,
        // mais un ECHEC sans report resterait piégé pour toujours dans une
        // file que personne ne relit. On préfère le reprendre.
        { statut: StatutMessage.ECHEC, prochainEssaiAt: null },
        // Orphelins · le processus est mort entre l'écriture et la tentative
        // (jamais essayé), ou entre la revendication et la tentative.
        { statut: StatutMessage.EN_ATTENTE, dernierEssaiAt: null, createdAt: { lte: seuilOrphelin } },
        { statut: StatutMessage.EN_ATTENTE, dernierEssaiAt: { lte: seuilOrphelin } },
      ],
    };
  }

  /**
   * REVENDICATION · comparaison-et-pose sur (statut, tentatives, dernierEssaiAt).
   *
   * Deux appels de reprise peuvent se croiser : le comptable clique deux fois,
   * ou deux instances Cloud Run servent deux onglets. Sans revendication, les
   * deux liraient le même message et l'enverraient DEUX FOIS au même tiers ·
   * un double rappel est une faute commerciale que rien ne rattrape. La ligne
   * passe en EN_ATTENTE avec l'heure de l'essai : le second appel ne retrouve
   * plus son triplet et passe son chemin.
   */
  private async revendiquer(
    tenantId: string,
    ligne: { id: string; statut: StatutMessage; tentatives: number; dernierEssaiAt: Date | null },
    maintenant: Date,
  ): Promise<boolean> {
    const { count } = await this.prisma.message.updateMany({
      where: {
        id: ligne.id,
        tenantId,
        statut: ligne.statut,
        tentatives: ligne.tentatives,
        dernierEssaiAt: ligne.dernierEssaiAt,
      },
      data: { statut: StatutMessage.EN_ATTENTE, dernierEssaiAt: maintenant },
    });
    return count === 1;
  }

  /** Une tentative, et l'état qu'elle laisse derrière elle. */
  private async tenter(
    tenantId: string,
    ligne: {
      id: string;
      destinataire: string;
      destinataireNom: string | null;
      sujet: string;
      corps: string;
      tentatives: number;
    },
  ): Promise<ResultatMiseEnFile> {
    if (!this.transport.etat().configure) {
      // NI MENTIR, NI PERDRE, NI REFUSER · le message est écrit, marqué pour ce
      // qu'il est, et l'appelant le sait. `erreur` reste VIDE : la cause est
      // globale à l'installation, pas propre à ce message, et recopiée sur
      // chaque ligne elle deviendrait fausse le jour où le transport est posé.
      // Elle se lit sur `GET /courrier/transport`, qui relit l'environnement.
      return this.marquer(tenantId, ligne.id, { statut: StatutMessage.SANS_TRANSPORT, erreur: null });
    }

    const maintenant = new Date();
    const tentatives = ligne.tentatives + 1;
    try {
      await this.transport.envoyer({
        destinataire: ligne.destinataire,
        destinataireNom: ligne.destinataireNom,
        sujet: ligne.sujet,
        corps: ligne.corps,
      });
      return this.marquer(tenantId, ligne.id, {
        statut: StatutMessage.ENVOYE,
        tentatives,
        dernierEssaiAt: maintenant,
        envoyeAt: maintenant,
        prochainEssaiAt: null,
        erreur: null,
      });
    } catch (erreur) {
      const statut = statutApresEchec(tentatives);
      return this.marquer(tenantId, ligne.id, {
        statut,
        tentatives,
        dernierEssaiAt: maintenant,
        // Un abandon n'a pas de prochain essai · le laisser daté ferait
        // reparaître la ligne dans la reprise, indéfiniment.
        prochainEssaiAt: prochainEssaiApresEchec(tentatives, maintenant),
        // L'ABANDONNÉ GARDE SA DERNIÈRE ERREUR · c'est elle qui dit, des mois
        // plus tard, pourquoi ce rappel n'est jamais parti.
        erreur: texteDErreur(erreur),
      });
    }
  }

  /**
   * L'écriture est BORNÉE AU DOSSIER (`updateMany` avec `tenantId`) plutôt que
   * désignée par son seul identifiant · le cloisonnement est posé aux deux
   * bouts, et cette forme évite en prime la relecture que la garde imposerait
   * à un `update` non borné.
   */
  private async marquer(
    tenantId: string,
    id: string,
    champs: Prisma.MessageUpdateManyMutationInput & { statut: StatutMessage; erreur: string | null },
  ): Promise<ResultatMiseEnFile> {
    const { count } = await this.prisma.message.updateMany({ where: { id, tenantId }, data: champs });
    if (count !== 1) throw new NotFoundException('Message introuvable dans ce dossier');
    return { id, statut: champs.statut, erreur: champs.erreur };
  }
}

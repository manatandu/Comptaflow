import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Prisma, Referentiel, StatutMessage, TypeRelance } from '@prisma/client';
import { CourrierService, ORIGINE_RELANCE } from '../courrier/courrier.service';
import { CreerNiveauDto, EmettreRelancesDto, ModifierNiveauDto } from './dto/relances.dto';

const JOUR = 86_400_000;

/**
 * QUALITÉ DU TIERS DERRIÈRE UN COMPTE 41, SELON LE RÉFÉRENTIEL.
 *
 *  · SYCEBNL, Partie 2 ch. 3, compte 41 « Adhérents, clients-usagers et
 *    comptes rattachés » · 411 Adhérents, 412 Clients-usagers ;
 *  · AUDCIF, Titre VII ch. 3, compte 41 « Clients et comptes rattachés » ·
 *    411 Clients, 412 Clients, effets à recevoir en portefeuille.
 *
 * Un effet en portefeuille n'est pas un impayé : la liste le nomme pour ce
 * qu'il est plutôt que de le présenter comme un client-usager en retard.
 */
export function qualiteDuCompte(numero: string, referentiel: Referentiel): string {
  if (referentiel === Referentiel.SYSCOHADA) {
    if (numero.startsWith('411')) return 'Client';
    if (numero.startsWith('412')) return 'Effet à recevoir';
    if (numero.startsWith('419')) return 'Client créditeur';
    return 'Tiers';
  }
  if (numero.startsWith('411')) return 'Adhérent';
  if (numero.startsWith('412')) return 'Client-usager';
  return 'Tiers';
}

/**
 * L'ASSIETTE DES RAPPELS · quelles subdivisions du 41 se relancent.
 *
 * Toute la racine 41 était retenue. En SYCEBNL cela passait presque, sa
 * division 41 ne portant guère que des créances à réclamer. En SYSCOHADA
 * l'AUDCIF la subdivise beaucoup plus finement, et trois de ces subdivisions
 * n'ont RIEN à réclamer :
 *
 *  · 412 « Clients, effets à recevoir en portefeuille » · l'effet est accepté
 *    et daté. Il se présente à l'échéance, il ne se rappelle pas · relancer un
 *    client sur un effet qu'il a déjà signé est une faute commerciale ;
 *  · 415 « Clients, effets escomptés non échus » · l'effet est à la banque.
 *    C'est elle qui présentera, et le rappel n'a pas de destinataire ;
 *  · 418 « Clients, produits à recevoir » · factures à établir et intérêts
 *    courus. La facture n'est pas partie · rien n'est encore exigible, et ces
 *    écritures sont contre-passées à l'ouverture (AUDCIF, Titre VII COMPTE 41).
 *
 * Ce qui se relance : 411 les clients (adhérents en SYCEBNL), 413 les chèques
 * et effets IMPAYÉS · les plus urgents de tous, et 416 les créances
 * litigieuses ou douteuses. Le 419 est créditeur par nature (avances reçues) :
 * il ne doit rien. Le 414, créances sur cessions courantes d'immobilisations,
 * n'est pas une créance d'exploitation et suit son propre suivi.
 *
 * Sur-relancer coûte cher : le tiers qui reçoit un rappel injustifié cesse de
 * lire les suivants.
 */
export const RACINES_RELANCABLES: Record<Referentiel, string[]> = {
  // 411 Adhérents, 412 Clients-usagers, 413 impayés, 416 litigieuses ·
  // 418 produits à recevoir et 419 créditeurs sont écartés pour les mêmes
  // raisons qu'au SYSCOHADA (SYCEBNL, Partie 2 ch. 3, COMPTE 41).
  [Referentiel.SYCEBNL]: ['411', '412', '413', '416'],
  [Referentiel.SYSCOHADA]: ['411', '413', '416'],
};

/**
 * TROIS NIVEAUX LIVRÉS PAR DÉFAUT, UN JEU PAR RÉFÉRENTIEL.
 *
 * Ces lettres partent VRAIMENT, à un adhérent ou à un client, sous la
 * signature du dossier · c'est le seul endroit du logiciel dont le texte sort
 * de l'écran. Un jeu unique tenait par un accident de rédaction : à force de
 * chercher des mots qui conviennent aux deux, on écrit une lettre qui ne
 * convient bien à personne. « Votre règlement permet à notre entité de
 * poursuivre ses activités » se dit à un membre, pas à un client d'une SARL,
 * qui attend une référence de facture et une échéance.
 *
 * Le ton monte d'un niveau à l'autre, mais reste celui d'un courrier de
 * gestion et non d'un service contentieux · c'est ce qu'un modèle générique ne
 * saurait pas faire à notre place. Ce ne sont que des modèles : le dossier les
 * réécrit entièrement depuis la fenêtre Rappel et relevé.
 *
 * Aucune mention d'intérêts de retard n'est écrite d'office : ils ne sont dus
 * que si une convention les prévoit, et une lettre type qui les annonce sans
 * base ferait dire au logiciel ce que le contrat ne dit pas.
 */
const NIVEAUX_SYCEBNL: Omit<CreerNiveauDto, never>[] = [
  {
    niveau: 1,
    libelle: 'Invitation à régler',
    type: TypeRelance.PREVENTIVE,
    joursApresEcheance: -7,
    modeleTexte:
      "Cher {tiers},\n\nNous vous rappelons amicalement que votre échéance de {montant} arrive à terme le {date}.\n\n{detail}\n\nNous vous remercions par avance de votre règlement, qui permet à notre entité de poursuivre ses activités.\n\n{entite}",
  },
  {
    niveau: 2,
    libelle: 'Premier rappel',
    type: TypeRelance.RAPPEL,
    joursApresEcheance: 15,
    modeleTexte:
      "Cher {tiers},\n\nSauf erreur de notre part, la somme de {montant} demeure due à ce jour, {date}.\n\n{detail}\n\nSi votre règlement a été effectué entre-temps, nous vous prions de ne pas tenir compte de ce rappel.\n\n{entite}",
  },
  {
    niveau: 3,
    libelle: 'Second rappel',
    type: TypeRelance.RAPPEL,
    joursApresEcheance: 45,
    modeleTexte:
      "Cher {tiers},\n\nMalgré notre précédent courrier, la somme de {montant} reste impayée au {date}.\n\n{detail}\n\nNous vous serions reconnaissants de bien vouloir régulariser votre situation, ou de prendre contact avec nous pour convenir d'un échelonnement.\n\n{entite}",
  },
];

const NIVEAUX_SYSCOHADA: Omit<CreerNiveauDto, never>[] = [
  {
    niveau: 1,
    libelle: 'Avis d’échéance',
    type: TypeRelance.PREVENTIVE,
    joursApresEcheance: -7,
    modeleTexte:
      "Madame, Monsieur,\n\nNous vous informons que la somme de {montant} viendra à échéance le {date}.\n\n{detail}\n\nNous vous remercions de bien vouloir procéder au règlement à cette date.\n\n{entite}",
  },
  {
    niveau: 2,
    libelle: 'Premier rappel',
    type: TypeRelance.RAPPEL,
    joursApresEcheance: 15,
    modeleTexte:
      "Madame, Monsieur,\n\nSauf erreur de notre part, la somme de {montant} demeure impayée à ce jour, {date}.\n\n{detail}\n\nSi votre règlement nous est parvenu entre-temps, ce rappel est sans objet. Dans le cas contraire, nous vous remercions de le régulariser sans délai.\n\n{entite}",
  },
  {
    niveau: 3,
    libelle: 'Mise en demeure préalable',
    type: TypeRelance.RAPPEL,
    joursApresEcheance: 45,
    modeleTexte:
      "Madame, Monsieur,\n\nMalgré notre précédent rappel, la somme de {montant} reste impayée au {date}.\n\n{detail}\n\nNous vous invitons à régulariser sous quinzaine, ou à nous contacter pour convenir d'un échéancier. À défaut, nous serons contraints d'envisager le recouvrement de cette créance par les voies de droit.\n\n{entite}",
  },
];

const NIVEAUX_DEFAUT: Record<Referentiel, Omit<CreerNiveauDto, never>[]> = {
  [Referentiel.SYCEBNL]: NIVEAUX_SYCEBNL,
  [Referentiel.SYSCOHADA]: NIVEAUX_SYSCOHADA,
};

/** Une position à relancer : un compte de tiers, ce qu'il doit, son retard. */
export interface PositionRelance {
  compteId: string;
  numero: string;
  intitule: string;
  tiersId: string | null;
  tiersNom: string | null;
  /**
   * Qualité du tiers derrière le compte · elle DÉPEND DU RÉFÉRENTIEL, et
   * c'est ce que le calcul ignorait : en SYCEBNL le 411 porte les adhérents
   * et le 412 les clients-usagers, en SYSCOHADA le 411 porte les clients et
   * le 412 des effets à recevoir en portefeuille. La liste des positions
   * annonçait donc « Adhérent » à une entreprise.
   */
  qualite: string;
  /**
   * L'ADRESSE OÙ LA LETTRE PEUT PARTIR, ou son absence.
   *
   * Elle est rendue avec la position, et non seulement au moment de
   * l'émission : le comptable qui choisit ses comptes voit alors, AVANT de
   * cliquer, lesquels n'ont pas de destinataire. Découvrir la lacune après
   * coup, c'est la découvrir au recouvrement.
   */
  tiersEmail: string | null;
  montantDu: number;
  /** Retard du plus ancien mouvement non lettré, en jours. */
  retardMaxJours: number;
  echeancePlusAncienne: string | null;
  niveauSuggere: number | null;
  derniereRelance: { niveau: number; date: string } | null;
  lignes: {
    date: string;
    echeance: string | null;
    libelle: string;
    montant: number;
    retardJours: number;
  }[];
}

/**
 * L'OBJET DU COURRIEL · la lettre n'en porte pas, il faut donc l'écrire.
 *
 * Rien du corps n'est touché : le texte enregistré dans l'historique est celui
 * qui part, mot pour mot, et c'est ce qui fait foi. Seul l'objet s'ajoute,
 * parce qu'un courriel en exige un · la file refuse un message sans sujet
 * (CourrierService.mettreEnFile), et une lettre pourtant composée resterait
 * alors à quai.
 *
 * Le libellé vient du NIVEAU, c'est-à-dire de ce que le dossier a lui-même
 * nommé (« Premier rappel », « Avis d'échéance », et ce qu'il a réécrit
 * depuis la fenêtre Rappel et relevé) · le logiciel n'invente pas une
 * formulation à sa place. Le repli sur « Rappel » ne sert qu'au niveau dont le
 * libellé aurait été vidé : mieux vaut un objet générique qu'une lettre qui ne
 * part pas.
 */
export function objetDeLaRelance(libelleNiveau: string, entite: string): string {
  const libelle = (libelleNiveau ?? '').trim() || 'Rappel';
  const nom = (entite ?? '').trim();
  return nom.length > 0 ? `${libelle} · ${nom}` : libelle;
}

/**
 * CE QU'IL EST ADVENU DE LA LETTRE UNE FOIS COMPOSÉE.
 *
 * L'émission ÉCRIT toujours la relance dans l'historique · c'est la décision
 * du comptable, elle ne dépend d'aucune messagerie. Ce compte rendu dit ce qui
 * a suivi, et il est rendu à l'écran AU MOMENT DE L'ÉMISSION : une lettre sans
 * destinataire n'est pas une lettre partie, et l'apprendre au recouvrement,
 * trois mois plus tard, est trop tard pour aller chercher l'adresse.
 *
 * `statut` est celui de la file, SANS_TRANSPORT compris · aucun transport
 * n'est configuré aujourd'hui, et cet état-là n'est ni un envoi ni une perte :
 * le message repartira tel quel le jour où les identifiants seront posés.
 */
export interface RemiseLettre {
  /** L'adresse retenue, ou `null` quand il n'y en avait aucune. */
  destinataire: string | null;
  /** L'état dans la file, ou `null` quand rien n'y a été écrit. */
  statut: StatutMessage | null;
  /** La ligne de file, pour aller la lire · `null` si rien n'a été mis en file. */
  messageId: string | null;
  /** Ce qui a empêché la remise, en toutes lettres · `null` quand elle a eu lieu. */
  motif: string | null;
}

/**
 * RELANCE, RAPPEL ET RELEVÉ · Traitement → Rappel/relevé chez Sage 100 i7.
 *
 * Le manuel distingue trois états, et OmegaX reprend cette structure :
 * la RELANCE PRÉVENTIVE, avant l'échéance ; le RAPPEL, gradué, « sur
 * l'ensemble des écritures non lettrées en retard de paiement » ; et le
 * RELEVÉ, « de toutes les écritures dues », sans gradation.
 *
 * Ce qui change, c'est à qui l'on s'adresse. Une EBNL ne relance pas des
 * clients : elle rappelle à ses ADHÉRENTS (compte 411) une cotisation appelée
 * et non payée, et accessoirement à ses clients-usagers (412) une facture due.
 * La qualité du tiers est donc affichée, et les modèles de lettre livrés par
 * défaut parlent le langage d'une association à ses membres.
 *
 * L'assiette est celle de la balance âgée : les lignes NON LETTRÉES des
 * comptes 41. Une ligne lettrée est soldée, il n'y a rien à réclamer.
 */
@Injectable()
export class RelancesService {
  constructor(
    private readonly prisma: PrismaService,
    /**
     * LA FILE, ET JAMAIS UN ENVOI DIRECT. Les lettres composées ici ne
     * partaient nulle part. Elles passent désormais par `CourrierService`, qui
     * les ÉCRIT avant toute tentative · une relance décidée par le comptable
     * doit survivre à une coupure et se voir, ce qu'un appel SMTP tenté
     * depuis ce service ne donnerait ni l'un ni l'autre.
     */
    private readonly courrier: CourrierService,
  ) {}

  // --- Niveaux -------------------------------------------------------------

  async listerNiveaux(tenantId: string) {
    return this.prisma.niveauRelance.findMany({ where: { tenantId }, orderBy: { niveau: 'asc' } });
  }

  /**
   * `client` reçoit la transaction de `AuthService.register` quand le semis
   * fait partie d'une création de dossier · hors de ce cas il vaut
   * `this.prisma` et rien ne change pour les autres appelants.
   */
  async seedNiveauxDefaut(
    tenantId: string,
    referentiel: Referentiel,
    client: Prisma.TransactionClient = this.prisma,
  ) {
    const existants = await client.niveauRelance.count({ where: { tenantId } });
    if (existants > 0) return;
    await client.niveauRelance.createMany({
      data: NIVEAUX_DEFAUT[referentiel].map((n) => ({ ...n, tenantId })),
    });
  }

  async creerNiveau(tenantId: string, dto: CreerNiveauDto) {
    const existant = await this.prisma.niveauRelance.findFirst({ where: { tenantId, niveau: dto.niveau } });
    if (existant) throw new ConflictException(`Le niveau ${dto.niveau} existe déjà`);
    return this.prisma.niveauRelance.create({ data: { ...dto, tenantId } });
  }

  async modifierNiveau(tenantId: string, niveauId: string, dto: ModifierNiveauDto) {
    const niveau = await this.prisma.niveauRelance.findFirst({ where: { id: niveauId, tenantId } });
    if (!niveau) throw new NotFoundException('Niveau de relance introuvable pour ce dossier');
    return this.prisma.niveauRelance.update({ where: { id: niveauId }, data: dto });
  }

  // --- Positions à relancer ------------------------------------------------

  /**
   * Ce qui reste dû, compte par compte, à une date de référence.
   *
   * `type` commande la sélection : PREVENTIVE ne retient que ce qui n'est PAS
   * encore échu, RAPPEL ce qui l'est, RELEVE tout ce qui est dû. C'est la
   * distinction que le manuel Sage pose entre ses trois états.
   */
  async positions(
    tenantId: string,
    params: { exerciceId: string; dateReference?: string; type?: TypeRelance; racine?: string },
  ): Promise<PositionRelance[]> {
    const ref = params.dateReference ? new Date(params.dateReference) : new Date();
    const type = params.type ?? TypeRelance.RAPPEL;
    const { referentiel } = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true },
    });
    // `racine` explicite : l'appelant sait ce qu'il demande (une racine 40
    // pour un relevé fournisseur, une subdivision précise). À défaut, on
    // retient les seules subdivisions du 41 qui portent une créance à
    // réclamer · voir RACINES_RELANCABLES.
    const racines = params.racine ? [params.racine] : RACINES_RELANCABLES[referentiel];

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        ecriture: { tenantId, exerciceId: params.exerciceId },
        lettre: null,
        OR: racines.map((r) => ({ compte: { numero: { startsWith: r } } })),
      },
      include: {
        compte: {
          select: {
            id: true,
            numero: true,
            intitule: true,
            tiersCompte: { include: { tiers: { select: { id: true, nom: true, type: true, email: true } } } },
          },
        },
        ecriture: { select: { date: true, libelle: true } },
      },
    });

    const niveaux = await this.prisma.niveauRelance.findMany({
      where: { tenantId, estActif: true },
      orderBy: { joursApresEcheance: 'desc' },
    });
    const dernieres = await this.prisma.relance.findMany({
      where: { tenantId },
      orderBy: { dateRelance: 'desc' },
      include: { niveauRelance: { select: { niveau: true } } },
    });

    const parCompte = new Map<string, PositionRelance>();
    for (const l of lignes) {
      const net = Number(l.debit) - Number(l.credit);
      if (Math.abs(net) < 0.005) continue;
      const echeance = l.dateEcheance ?? l.ecriture.date;
      const retard = Math.floor((ref.getTime() - echeance.getTime()) / JOUR);

      // Sélection selon l'état demandé.
      if (type === TypeRelance.PREVENTIVE && retard >= 0) continue;
      if (type === TypeRelance.RAPPEL && retard < 0) continue;

      const tiers = l.compte.tiersCompte?.tiers ?? null;
      const acc =
        parCompte.get(l.compte.id) ??
        ({
          compteId: l.compte.id,
          numero: l.compte.numero,
          intitule: l.compte.intitule,
          tiersId: tiers?.id ?? null,
          tiersNom: tiers?.nom ?? null,
          tiersEmail: tiers?.email ?? null,
          qualite: qualiteDuCompte(l.compte.numero, referentiel),
          montantDu: 0,
          retardMaxJours: 0,
          echeancePlusAncienne: null,
          niveauSuggere: null,
          derniereRelance: null,
          lignes: [],
        } satisfies PositionRelance);

      acc.montantDu += net;
      acc.lignes.push({
        date: l.ecriture.date.toISOString().slice(0, 10),
        echeance: l.dateEcheance?.toISOString().slice(0, 10) ?? null,
        libelle: l.libelle ?? l.ecriture.libelle,
        montant: net,
        retardJours: retard,
      });
      if (retard > acc.retardMaxJours || acc.echeancePlusAncienne === null) {
        acc.retardMaxJours = Math.max(acc.retardMaxJours, retard);
        acc.echeancePlusAncienne = echeance.toISOString().slice(0, 10);
      }
      parCompte.set(l.compte.id, acc);
    }

    const resultat: PositionRelance[] = [];
    for (const p of parCompte.values()) {
      // Un compte de tiers créditeur n'a rien à devoir : c'est une avance ou
      // un règlement mal imputé, que le contrôle de cohérence signale par
      // ailleurs. On ne le relance pas.
      if (p.montantDu <= 0.005) continue;
      p.montantDu = Math.round(p.montantDu * 100) / 100;
      p.lignes.sort((a, b) => b.retardJours - a.retardJours);

      const derniere = dernieres.find((r) => r.compteId === p.compteId);
      if (derniere) {
        p.derniereRelance = {
          niveau: derniere.niveauRelance.niveau,
          date: derniere.dateRelance.toISOString().slice(0, 10),
        };
      }
      // Le niveau suggéré est le plus élevé dont le seuil est atteint, et qui
      // dépasse celui déjà envoyé · on ne renvoie pas deux fois le même
      // courrier, et on ne saute pas un niveau non plus.
      const atteignables = niveaux.filter((n) => p.retardMaxJours >= n.joursApresEcheance);
      const candidat = atteignables[0];
      if (candidat && (!p.derniereRelance || candidat.niveau > p.derniereRelance.niveau)) {
        p.niveauSuggere = candidat.niveau;
      }
      resultat.push(p);
    }

    return resultat.sort((a, b) => b.retardMaxJours - a.retardMaxJours);
  }

  /** Relevé d'un compte : tout ce qui est dû, sans gradation. */
  async releve(tenantId: string, compteId: string, exerciceId: string) {
    const positions = await this.positions(tenantId, { exerciceId, type: TypeRelance.RELEVE });
    const position = positions.find((p) => p.compteId === compteId);
    if (!position) {
      throw new NotFoundException("Ce compte n'a rien de dû sur cet exercice.");
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    return { entite: tenant?.nom ?? '', ...position };
  }

  // --- Émission ------------------------------------------------------------

  /**
   * Compose la lettre à partir du modèle du niveau. Les jetons sont remplacés
   * ici et non côté client : le texte enregistré doit être exactement celui
   * qui a été envoyé, pour que l'historique fasse foi.
   */
  private composer(
    modele: string,
    donnees: { tiers: string; montant: number; date: Date; entite: string; lignes: PositionRelance['lignes'] },
  ): string {
    const detail = donnees.lignes
      .map(
        (l) =>
          `  ${l.echeance ?? l.date}  ${l.libelle}  ${l.montant.toLocaleString('fr-FR', {
            minimumFractionDigits: 2,
          })}${l.retardJours > 0 ? `  (${l.retardJours} j de retard)` : ''}`,
      )
      .join('\n');
    return modele
      .replace(/\{tiers\}/g, donnees.tiers)
      .replace(/\{montant\}/g, donnees.montant.toLocaleString('fr-FR', { minimumFractionDigits: 2 }))
      .replace(/\{date\}/g, donnees.date.toLocaleDateString('fr-FR'))
      .replace(/\{entite\}/g, donnees.entite)
      .replace(/\{detail\}/g, detail);
  }

  /**
   * ÉMETTRE, PUIS REMETTRE · et dire lesquelles ne sont parties à personne.
   *
   * L'ordre n'est pas indifférent. La relance est d'abord ÉCRITE dans
   * l'historique · c'est la décision du comptable, et elle ne dépend d'aucune
   * messagerie. Le message vient ensuite, en file, avec l'identifiant de cette
   * relance en origine, ce qui permet de remonter de la ligne de courrier à la
   * pièce qui l'a demandée.
   *
   * Rien ici ne lève parce qu'une lettre n'a pas trouvé son destinataire · un
   * lot de vingt rappels décidés ne doit pas mourir sur le seul tiers dont
   * l'adresse manque, et les dix-neuf autres sont déjà écrites. Ce qui est dû
   * au comptable, c'est le compte rendu : combien sont en file, et lesquelles
   * ne partiront à personne, tant qu'il tient encore le dossier ouvert.
   */
  async emettre(tenantId: string, createdBy: string, dto: EmettreRelancesDto) {
    const niveau = await this.prisma.niveauRelance.findFirst({ where: { id: dto.niveauId, tenantId } });
    if (!niveau) throw new BadRequestException('Niveau de relance introuvable pour ce dossier');
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const entite = tenant?.nom ?? '';

    const positions = await this.positions(tenantId, {
      exerciceId: dto.exerciceId,
      dateReference: dto.dateReference,
      type: niveau.type,
    });
    const date = dto.dateReference ? new Date(dto.dateReference) : new Date();

    const lettres: {
      compteId: string;
      tiers: string;
      montant: number;
      texte: string;
      remise: RemiseLettre;
    }[] = [];
    for (const compteId of dto.compteIds) {
      const position = positions.find((p) => p.compteId === compteId);
      if (!position) continue;
      // Sans tiers rattaché au compte, on ne prétend pas connaître un nom :
      // le courrier nomme le compte, et la lacune se voit au lieu de
      // produire un « Cher Adhérents, » qui ne s'adresse à personne.
      const tiers = position.tiersNom ?? `titulaire du compte ${position.numero}`;
      const texte = this.composer(niveau.modeleTexte, {
        tiers,
        montant: position.montantDu,
        date,
        entite,
        lignes: position.lignes,
      });
      const relance = await this.prisma.relance.create({
        data: {
          tenantId,
          compteId: position.compteId,
          tiersId: position.tiersId,
          niveauId: niveau.id,
          dateRelance: date,
          montant: new Prisma.Decimal(position.montantDu),
          texte,
          createdBy,
        },
      });
      lettres.push({
        compteId: position.compteId,
        tiers,
        montant: position.montantDu,
        texte,
        remise: await this.remettre(tenantId, createdBy, {
          position,
          texte,
          objet: objetDeLaRelance(niveau.libelle, entite),
          relanceId: relance.id,
        }),
      });
    }

    return {
      emises: lettres.length,
      niveau: niveau.niveau,
      // Les deux nombres que l'écran doit pouvoir dire en une phrase · une
      // émission qui n'annonce que « 20 courriers préparés » laisse croire
      // que vingt tiers ont été touchés.
      misesEnFile: lettres.filter((l) => l.remise.statut !== null).length,
      nonRemises: lettres.filter((l) => l.remise.statut === null).length,
      lettres,
    };
  }

  /**
   * LA MISE EN FILE D'UNE LETTRE, ET LE DIRE QUAND ELLE N'A PAS D'ADRESSE.
   *
   * Le tiers porte un champ `email` depuis peu, et il est FACULTATIF · la
   * plupart des dossiers en tiennent sans. Une lettre composée pour un tiers
   * sans adresse reste une lettre juste : elle s'imprime, elle se remet en
   * main propre. Ce qui serait faux, c'est de laisser croire qu'elle est
   * partie.
   */
  private async remettre(
    tenantId: string,
    createdBy: string,
    lettre: { position: PositionRelance; texte: string; objet: string; relanceId: string },
  ): Promise<RemiseLettre> {
    const { position } = lettre;
    const adresse = (position.tiersEmail ?? '').trim();
    if (adresse.length === 0) {
      return {
        destinataire: null,
        statut: null,
        messageId: null,
        motif: position.tiersId
          ? `Aucune adresse de courriel pour « ${position.tiersNom ?? position.numero} » · la lettre est enregistrée dans l'historique, elle n'est partie à personne. Complétez la fiche du tiers, ou remettez-la autrement.`
          : `Aucun tiers n'est rattaché au compte ${position.numero} · la lettre est enregistrée dans l'historique, elle n'a pas de destinataire.`,
      };
    }

    try {
      const message = await this.courrier.mettreEnFile(tenantId, {
        destinataire: adresse,
        destinataireNom: position.tiersNom,
        sujet: lettre.objet,
        // LE TEXTE ENREGISTRÉ EST LE TEXTE ENVOYÉ · l'historique fait foi, et
        // il ne ferait plus foi si le corps du courriel en différait d'un mot.
        corps: lettre.texte,
        origine: ORIGINE_RELANCE,
        // De la ligne de courrier à la pièce qui l'a demandée · sans quoi la
        // file devient illisible au bout d'un mois.
        origineId: lettre.relanceId,
        createdBy,
      });
      return { destinataire: adresse, statut: message.statut, messageId: message.id, motif: null };
    } catch (erreur) {
      // La file REFUSE À L'ÉCRITURE ce qu'aucune tentative ne réparerait (une
      // adresse inutilisable, deux adresses dans un champ qui n'en attend
      // qu'une). Ce refus vaut pour CETTE lettre : le laisser remonter
      // emporterait le lot entier, dont les relances déjà écrites.
      return {
        destinataire: adresse,
        statut: null,
        messageId: null,
        motif:
          erreur instanceof Error
            ? erreur.message
            : "La file a refusé ce message · la lettre est enregistrée, elle n'est pas partie.",
      };
    }
  }

  async historique(tenantId: string, compteId?: string) {
    return this.prisma.relance.findMany({
      where: { tenantId, ...(compteId ? { compteId } : {}) },
      orderBy: { dateRelance: 'desc' },
      take: 200,
      include: {
        compte: { select: { numero: true, intitule: true } },
        tiers: { select: { nom: true } },
        niveauRelance: { select: { niveau: true, libelle: true } },
      },
    });
  }
}

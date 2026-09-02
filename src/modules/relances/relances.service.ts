import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Prisma, Referentiel, TypeRelance } from '@prisma/client';
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
  constructor(private readonly prisma: PrismaService) {}

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
            tiersCompte: { include: { tiers: { select: { id: true, nom: true, type: true } } } },
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

  async emettre(tenantId: string, createdBy: string, dto: EmettreRelancesDto) {
    const niveau = await this.prisma.niveauRelance.findFirst({ where: { id: dto.niveauId, tenantId } });
    if (!niveau) throw new BadRequestException('Niveau de relance introuvable pour ce dossier');
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });

    const positions = await this.positions(tenantId, {
      exerciceId: dto.exerciceId,
      dateReference: dto.dateReference,
      type: niveau.type,
    });
    const date = dto.dateReference ? new Date(dto.dateReference) : new Date();

    const lettres: { compteId: string; tiers: string; montant: number; texte: string }[] = [];
    for (const compteId of dto.compteIds) {
      const position = positions.find((p) => p.compteId === compteId);
      if (!position) continue;
      const texte = this.composer(niveau.modeleTexte, {
        // Sans tiers rattaché au compte, on ne prétend pas connaître un nom :
        // le courrier nomme le compte, et la lacune se voit au lieu de
        // produire un « Cher Adhérents, » qui ne s'adresse à personne.
        tiers: position.tiersNom ?? `titulaire du compte ${position.numero}`,
        montant: position.montantDu,
        date,
        entite: tenant?.nom ?? '',
        lignes: position.lignes,
      });
      await this.prisma.relance.create({
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
        tiers: position.tiersNom ?? `titulaire du compte ${position.numero}`,
        montant: position.montantDu,
        texte,
      });
    }

    return { emises: lettres.length, niveau: niveau.niveau, lettres };
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

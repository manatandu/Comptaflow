import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { createHash, randomBytes } from 'crypto';
import {
  ClasseCompte,
  JeuEtatsFinanciersSycebnl,
  NumerotationPiece,
  Referentiel,
  StatutEcriture,
  StatutExercice,
  TypeJournal,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { prochainNumeroPiece } from '../journaux/numerotation-piece';
import { EcritureService } from '../comptabilite/ecriture.service';
import { AuthService } from '../auth/auth.service';
import { ClasseurExporte, ExportService } from '../exports/export.service';
import { CreerCelluleDto, ImporterCanevasDto } from './dto/groupe.dto';
import {
  horsCloisonnement,
  perimetreDeGroupe,
} from '../../common/cloisonnement/contexte-cloisonnement';
import {
  DERNIERE_LIGNE_DONNEES,
  MARQUEUR_CANEVAS,
  PREMIERE_LIGNE_DONNEES,
  RUBRIQUES_CANEVAS,
  TRESORERIES_CANEVAS,
} from './canevas-tresorerie';

/**
 * Une ligne RETIRÉE de l'agrégat parce qu'elle est interne au groupe · le
 * dossier qui la portait, le dossier de groupe qu'elle mettait en face, le
 * compte, et à quel titre elle sort. Rendre l'élimination est ce qui la rend
 * vérifiable : sans elle, l'agrégat serait un total qu'on ne peut plus
 * rapprocher des balances qui l'ont formé.
 */
export interface EliminationReciproque {
  dossier: string;
  contrepartie: string;
  numero: string;
  intitule: string;
  motif: string;
  debit: number;
  credit: number;
}

/**
 * Une réciprocité QUI NE SE BOUCLE PAS · la créance chez l'un n'est pas la
 * dette chez l'autre. Le D4C fait de la « procédure de confirmation de solde
 * pour toutes les opérations » (ch. XII-5) le préalable de toute élimination
 * intra-groupe · quand les deux soldes divergent, c'est cette confirmation qui
 * a échoué, et le logiciel n'a pas à trancher lequel des deux dossiers a
 * raison. Il le NOMME, exactement comme il nomme un transfert 58 enregistré
 * d'un seul côté.
 */
export interface EcartReciprocite {
  dossier: string;
  contrepartie: string;
  solde: number;
  soldeContrepartie: number;
  ecart: number;
}

const MOTIF_CREANCE_DETTE = 'Créance ou dette réciproque';
const MOTIF_CHARGE_PRODUIT = 'Charge ou produit réciproque';

/**
 * GROUPE D'ÉTABLISSEMENTS · une même personne morale tenue en plusieurs
 * dossiers : un dossier mère (le siège) et ses cellules. Cas type : une
 * église de plusieurs centaines de cellules, chacune tenant son dossier
 * (petites en SMT, grandes en Système normal), dont les comptabilités
 * s'AGRÈGENT au siège à la clôture. Ce n'est PAS une consolidation au sens
 * juridique (il n'y a qu'une seule entité, et l'Acte uniforme SYCEBNL ne
 * connaît d'ailleurs aucun régime de consolidation) : c'est la réunion des
 * comptabilités d'établissements d'une même entité, seule liasse déposable
 * à la clé · le seuil SMT de l'article 6 s'apprécie par ENTITÉ, une entité
 * de cette taille relève du Système normal pour ses états officiels.
 *
 * SÉCURITÉ · la lecture transversale (le siège lit les balances des
 * cellules) n'est permise QUE dans le sens du lien dossierMereId, posé par
 * la console plateforme et par elle seule. Toute méthode part du tenantId
 * de l'appelant et ne touche que les tenants dont dossierMereId = ce
 * tenantId · une cellule ne voit jamais ses sœurs, ni la mère.
 */
@Injectable()
export class GroupeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritureService: EcritureService,
    private readonly authService: AuthService,
    private readonly exportService: ExportService,
  ) {}

  /** Les cellules rattachées à ce dossier, et ce que le siège peut créer. */
  /**
   * LE PÉRIMÈTRE D'UN SIÈGE · lui, ses cellules, son dossier de combinaison.
   *
   * Toutes les méthodes de ce service lisent et écrivent hors du dossier de la
   * session · c'est leur raison d'être. La garde de cloisonnement les laissait
   * passer parce qu'elle se contentait de constater qu'un `tenantId` figurait
   * au filtre, sans jamais en regarder la valeur. Elle en regarde désormais la
   * valeur, et il faut donc lui dire lesquelles sont légitimes.
   *
   * La liste est construite ICI, à partir du seul dossier de la session · elle
   * n'est jamais reçue d'un appelant. Un client qui demanderait la balance
   * d'une cellule qui n'est pas la sienne se heurte à la garde, et non à un
   * contrôle applicatif qu'on aurait pu oublier d'écrire.
   */
  /**
   * Ouvre le dossier de combinaison du siège s'il n'existe pas encore, et rend
   * son identifiant. Appelé AVANT `dansLeGroupe` · le périmètre se calcule une
   * fois, à l'entrée, et un dossier né après ne s'y ajouterait pas.
   *
   * Ne touche que `Tenant`, qui n'est pas un modèle cloisonné.
   */
  private async assurerDossierCombinaison(tenantId: string): Promise<string> {
    const mere = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { nom: true, dossierCombinaisonId: true },
    });
    if (mere?.dossierCombinaisonId) return mere.dossierCombinaisonId;
    const combinaison = await this.prisma.tenant.create({
      data: {
        nom: `${mere!.nom} · liasse du groupe`,
        referentiel: Referentiel.SYCEBNL,
        // L'entité agrégée relève du Système normal (art. 6 SYCEBNL · le
        // seuil s'apprécie par entité), quel que soit le jeu des cellules.
        jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS,
      },
      select: { id: true },
    });
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { dossierCombinaisonId: combinaison.id },
    });
    return combinaison.id;
  }

  private async dansLeGroupe<T>(tenantId: string, suite: () => Promise<T>): Promise<T> {
    const [cellules, siege] = await Promise.all([
      this.prisma.tenant.findMany({ where: { dossierMereId: tenantId }, select: { id: true } }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { dossierCombinaisonId: true },
      }),
    ]);
    const perimetre = [tenantId, ...cellules.map((c) => c.id)];
    if (siege?.dossierCombinaisonId) perimetre.push(siege.dossierCombinaisonId);
    return perimetreDeGroupe(perimetre, suite);
  }

  async cellules(tenantId: string) {
    const [mere, cellules] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { plafondCellules: true } }),
      this.prisma.tenant.findMany({
        where: { dossierMereId: tenantId },
        orderBy: { nom: 'asc' },
        select: {
          id: true,
          nom: true,
          jeuEtatsFinanciersSycebnl: true,
          ville: true,
          _count: { select: { ecritures: true } },
        },
      }),
    ]);
    return {
      plafondCellules: mere?.plafondCellules ?? null,
      // null = la création par le siège n'est pas activée (console plateforme).
      peutCreerCellule: mere?.plafondCellules !== null && cellules.length < (mere?.plafondCellules ?? 0),
      cellules: cellules.map((c) => ({
        id: c.id,
        nom: c.nom,
        jeuEtatsFinanciersSycebnl: c.jeuEtatsFinanciersSycebnl,
        ville: c.ville,
        nbEcritures: c._count.ecritures,
      })),
    };
  }

  /**
   * Création d'une cellule PAR LE SIÈGE · les trois verrous qui empêchent
   * l'endpoint de devenir une inscription gratuite déguisée :
   *  1. rattachement FORCÉ : dossierMereId = le tenant appelant, jamais un
   *     choix du client · et une cellule ne crée pas de cellules (un niveau) ;
   *  2. licence HÉRITÉE de la mère (type + échéance) · une seule licence
   *     commerciale, celle que la console plateforme gère sur la mère ;
   *  3. PLAFOND fixé par la console plateforme (null = création désactivée).
   * Le dossier naît complet par le même pipeline que l'inscription (plan de
   * comptes, journaux, taxes, exercice), mot de passe généré rendu une fois.
   */
  async creerCellule(tenantId: string, dto: CreerCelluleDto) {
    const mere = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        dossierMereId: true,
        plafondCellules: true,
        referentiel: true,
        licence: { select: { type: true, dateExpiration: true } },
        _count: { select: { cellules: true } },
      },
    });
    if (!mere || mere.dossierMereId !== null) {
      throw new BadRequestException('Seul un dossier mère peut créer des cellules');
    }
    // Tout le circuit du groupe (canevas de trésorerie, rubriques, liasse
    // combinée) est monté sur le plan et les états SYCEBNL · ouvrir des
    // cellules sous une mère SYSCOHADA produirait des agrégats du mauvais
    // référentiel. À reconstruire pour le SYSCOHADA si un groupe commercial
    // en a l'usage un jour, pas à laisser passer en silence.
    if (mere.referentiel !== Referentiel.SYCEBNL) {
      throw new BadRequestException(
        "Le groupe d'établissements n'est construit que pour les dossiers SYCEBNL pour l'instant",
      );
    }
    if (mere.plafondCellules === null) {
      throw new BadRequestException(
        "La création de cellules n'est pas activée pour ce dossier · rapprochez-vous de VMG Consulting",
      );
    }
    if (mere._count.cellules >= mere.plafondCellules) {
      throw new BadRequestException(
        `Plafond de ${mere.plafondCellules} cellules atteint · rapprochez-vous de VMG Consulting pour l'augmenter`,
      );
    }

    const motDePasseTemporaire = randomBytes(12).toString('base64url');
    const resultat = await this.authService.register({
      nomEntite: dto.nom,
      referentiel: Referentiel.SYCEBNL,
      email: dto.emailAdmin,
      motDePasse: motDePasseTemporaire,
      jeuEtatsFinanciersSycebnl: dto.jeuEtatsFinanciersSycebnl,
      typeLicence: mere.licence?.type,
    });
    await this.prisma.tenant.update({
      where: { id: resultat.tenant.id },
      data: { dossierMereId: tenantId },
    });
    // Le mot de passe a transité par le siège · le responsable de la cellule
    // devra le remplacer à sa première connexion (voir schema.prisma, User).
    // SORTIE DE CLOISONNEMENT · le compte visé est celui de la CELLULE qui
    // vient d'être ouverte, pas celui du siège dont la session porte le
    // contexte. Le rattachement au siège a été vérifié juste au-dessus.
    await horsCloisonnement('siège · cellule ouverte à l’instant', () =>
      this.prisma.user.update({
        where: { email: dto.emailAdmin },
        data: { doitChangerMotDePasse: true },
      }),
    );
    // Licence héritée · l'échéance de la mère devient celle de la cellule,
    // et la cascade de la console plateforme (voir PlateformeService.
    // modifierLicence) entretient ensuite l'alignement.
    if (mere.licence?.dateExpiration) {
      // Le périmètre porte la cellule QUI VIENT D'ÊTRE CRÉÉE · aucune liste
      // calculée avant l'appel ne pouvait la contenir. Son rattachement au
      // siège a été vérifié plus haut, c'est ce qui autorise à la nommer ici.
      await perimetreDeGroupe([resultat.tenant.id], () =>
        this.prisma.licence.update({
          where: { tenantId: resultat.tenant.id },
          data: { dateExpiration: mere.licence!.dateExpiration },
        }),
      );
    }
    return {
      tenant: resultat.tenant,
      adminEmail: dto.emailAdmin,
      // Jamais le jeton de session · même règle que la console plateforme.
      motDePasseTemporaire,
    };
  }

  /** Une date d'exercice telle qu'un message la porte · sans heure ni fuseau. */
  private static jour(d: Date) {
    return d.toISOString().slice(0, 10);
  }

  /**
   * L'EXERCICE D'UNE CELLULE POUR LA PÉRIODE DU SIÈGE · deux réponses
   * distinctes, et c'est toute la correction : l'exercice CONCORDANT (mêmes
   * dates de début et de fin, au jour près) est le seul qui puisse entrer
   * dans un agrégat ; un exercice qui ne fait que recouvrir la période est
   * rendu à part, pour être NOMMÉ et refusé.
   *
   * Ce qui se faisait avant · la méthode retenait l'exercice au recouvrement
   * MAXIMAL, avec pour seule condition un recouvrement non nul : un seul jour
   * de chevauchement suffisait. Une cellule clôturant au 30 juin entrait donc
   * dans la liasse d'un siège clôturant au 31 décembre, en silence, et le
   * total obtenu ne correspondait à AUCUNE période réelle. Rien en aval ne
   * pouvait le rattraper : l'agrégat s'équilibre quand même (chaque livre est
   * équilibré séparément), la liasse sort sans réserve, et l'en-tête imprime
   * la période du siège sur des chiffres qui ne sont pas les siens.
   *
   * POURQUOI L'ÉGALITÉ, ET NON UNE TOLÉRANCE · les états financiers
   * « décrivent les événements, opérations et situations DE L'EXERCICE »
   * (SYCEBNL, art. 4), et le postulat de la spécialisation des
   * exercices veut qu'on rattache à chaque exercice « tous les produits et
   * les charges qui le concernent, et ceux-là seulement » (SYCEBNL, cadre
   * conceptuel § 3.3.1.1.4). Additionner deux périodes différentes viole les
   * deux. La tolérance de trois mois de l'AUDCIF art. 97 ne s'invoque pas
   * ici : elle vise la CONSOLIDATION d'entités juridiquement distinctes, or
   * un groupe d'établissements est une entité UNIQUE tenue en plusieurs
   * dossiers (voir l'en-tête de ce service) · pour une entité unique
   * l'exigence est plus stricte encore, ses états couvrent UNE période.
   *
   * La règle vaut sous les deux référentiels, et ce n'est pas une
   * transposition : l'AUDCIF art. 7 (« l'exercice coïncide avec l'année
   * civile ») n'est PAS dans la liste d'exclusion de l'art. 3 du SYCEBNL
   * (art. 5, 8, 10 à 13, 17 al. 7-8, 18, 19 4e tiret, 21, 25 à 34, 49, 69,
   * 70, 71, 73 à 113), et le glossaire du SYCEBNL le réécrit mot pour mot à
   * l'entrée EXERCICE. Conséquence pratique, et c'est ce que dit le refus :
   * un exercice non liquidatif court du 1er janvier au 31 décembre, donc une
   * discordance ne peut venir que d'un PREMIER exercice (art. 7 al. 3, durée
   * exceptionnellement inférieure ou supérieure à douze mois) ou d'un
   * exercice de LIQUIDATION (art. 7 al. 4).
   */
  private exercicePourLaPeriode(
    exercices: Array<{ id: string; dateDebut: Date; dateFin: Date }>,
    debut: Date,
    fin: Date,
  ): {
    concordant: { id: string; dateDebut: Date; dateFin: Date } | null;
    discordant: { id: string; dateDebut: Date; dateFin: Date } | null;
  } {
    let discordant: { id: string; dateDebut: Date; dateFin: Date } | null = null;
    let recouvrementMax = 0;
    for (const e of exercices) {
      if (e.dateDebut.getTime() === debut.getTime() && e.dateFin.getTime() === fin.getTime()) {
        return { concordant: e, discordant: null };
      }
      // Le recouvrement ne sert plus à choisir un exercice à agréger · il
      // sert à désigner CELUI qu'il faudra aligner, dans le message de refus.
      const recouvrement =
        Math.min(e.dateFin.getTime(), fin.getTime()) - Math.max(e.dateDebut.getTime(), debut.getTime());
      if (recouvrement > 0 && recouvrement > recouvrementMax) {
        recouvrementMax = recouvrement;
        discordant = e;
      }
    }
    return { concordant: null, discordant };
  }

  /**
   * Balance agrégée du groupe pour un exercice du dossier mère : les soldes
   * de la mère et de chaque cellule, réunis compte par compte (par NUMÉRO ·
   * les dossiers créés depuis la console partagent le même plan SYCEBNL).
   * Seuls les comptes Détail entrent dans l'agrégat, les comptes Total ne
   * sont que des lignes d'affichage déjà comptées par leurs enfants.
   *
   * Quatre contrôles accompagnent le résultat, car une agrégation sans
   * contrôle est un piège :
   *  · CONCORDANCE DES PÉRIODES · seul un exercice de cellule qui couvre
   *    exactement la période du siège entre dans l'agrégat. Une cellule dont
   *    l'exercice est décalé est écartée ET nommée, avec ses dates : un total
   *    qui mêle deux périodes ne correspond à aucune (voir
   *    `exercicePourLaPeriode` pour la règle et sa source) ;
   *  · équilibre de CHAQUE dossier (une cellule déséquilibrée fausse tout) ;
   *  · neutralisation des comptes 58 Virements internes · dans une entité
   *    unique, un transfert siège vers cellule est un virement interne :
   *    l'émetteur débite 58, le receveur crédite 58, et l'agrégat des 58
   *    doit revenir à zéro. Un écart désigne un transfert enregistré d'un
   *    seul côté ;
   *  · cellules sans exercice sur la période (leurs chiffres MANQUENT).
   *
   * S'y ajoute l'ÉLIMINATION DES OPÉRATIONS RÉCIPROQUES, au-delà des seuls
   * 58 · voir `eliminerOperationsReciproques` pour la règle, sa source et ce
   * qu'elle ne sait pas faire.
   */
  async balanceAgregee(tenantId: string, exerciceId: string) {
    return this.dansLeGroupe(tenantId, () => this.balanceAgregeeDuGroupe(tenantId, exerciceId));
  }

  private async balanceAgregeeDuGroupe(tenantId: string, exerciceId: string) {
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: exerciceId, tenantId },
      select: { id: true, dateDebut: true, dateFin: true },
    });
    if (!exercice) {
      throw new NotFoundException('Exercice introuvable dans ce dossier');
    }
    const mere = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, nom: true } });
    const cellules = await this.prisma.tenant.findMany({
      where: { dossierMereId: tenantId },
      orderBy: { nom: 'asc' },
      select: { id: true, nom: true, exercices: { select: { id: true, dateDebut: true, dateFin: true } } },
    });
    if (cellules.length === 0) {
      throw new BadRequestException("Ce dossier n'a aucune cellule rattachée · le rattachement se fait depuis la console plateforme");
    }

    const dossiers: Array<{
      id: string;
      nom: string;
      estMere: boolean;
      exerciceId: string | null;
      // Renseigné quand la cellule A un exercice sur la période mais qu'il ne
      // la couvre pas exactement · ses chiffres restent DEHORS, et ses dates
      // servent à le dire.
      periodeDiscordante: { dateDebut: Date; dateFin: Date } | null;
    }> = [
      { id: tenantId, nom: mere!.nom, estMere: true, exerciceId: exercice.id, periodeDiscordante: null },
      ...cellules.map((c) => {
        const choix = this.exercicePourLaPeriode(c.exercices, exercice.dateDebut, exercice.dateFin);
        return {
          id: c.id,
          nom: c.nom,
          estMere: false,
          exerciceId: choix.concordant?.id ?? null,
          periodeDiscordante: choix.discordant
            ? { dateDebut: choix.discordant.dateDebut, dateFin: choix.discordant.dateFin }
            : null,
        };
      }),
    ];

    // LES COMPTES OUVERTS AU NOM D'UN AUTRE DOSSIER DU GROUPE · c'est le seul
    // endroit d'où l'information peut venir (`Tiers.celluleGroupeId`), et un
    // groupe dont aucun tiers ne la porte n'a rien à éliminer : la requête
    // rend une liste vide, et l'agrégat reste au centime celui d'avant.
    const idsGroupe = new Set<string>([tenantId, ...cellules.map((c) => c.id)]);
    const rattachements = await this.prisma.tiersCompte.findMany({
      where: { tiers: { tenantId: { in: [...idsGroupe] }, celluleGroupeId: { not: null } } },
      select: {
        compteId: true,
        tiers: { select: { tenantId: true, code: true, nom: true, celluleGroupeId: true } },
      },
    });

    const nomParDossier = new Map<string, string>(dossiers.map((d) => [d.id, d.nom]));
    const nomDuDossier = (id: string) => nomParDossier.get(id) ?? id;

    // UN RATTACHEMENT HORS GROUPE N'ÉLIMINE RIEN, ET IL EST NOMMÉ.
    //
    // La clé étrangère de `Tiers.celluleGroupeId` vise `tenants` sans pouvoir
    // exiger « même dossier mère » · une base de données ne sait pas exprimer
    // cette condition, et le schéma renvoie la vérification ici. Éliminer sur
    // la foi d'un rattachement étranger retirerait de l'agrégat une vente
    // RÉELLE, faite à une entité qui n'est pas l'entité : le contraire de ce
    // que l'élimination cherche. Le refus est donc silencieux sur les
    // chiffres et bruyant sur l'écran.
    const rattachementsRefuses: Array<{ dossier: string; codeTiers: string; nomTiers: string; motif: string }> = [];
    const compteReciproque = new Map<string, { dossierId: string; cibleId: string }>();
    const dejaRefuses = new Set<string>();
    for (const r of rattachements) {
      const cible = r.tiers.celluleGroupeId!;
      const motif =
        cible === r.tiers.tenantId
          ? 'le tiers désigne son propre dossier'
          : idsGroupe.has(cible)
            ? null
            : 'le dossier désigné n’appartient pas à ce groupe';
      if (motif === null) {
        compteReciproque.set(r.compteId, { dossierId: r.tiers.tenantId, cibleId: cible });
        continue;
      }
      // Un tiers porte souvent plusieurs comptes rattachés · il ne doit
      // apparaître qu'une fois dans la liste des refus.
      const cle = `${r.tiers.tenantId}|${r.tiers.code}`;
      if (dejaRefuses.has(cle)) continue;
      dejaRefuses.add(cle);
      rattachementsRefuses.push({
        dossier: nomDuDossier(r.tiers.tenantId),
        codeTiers: r.tiers.code,
        nomTiers: r.tiers.nom,
        motif,
      });
    }
    /** Solde de chaque compte réciproque, pour le contrôle de réciprocité. */
    const soldeReciproqueParCompte = new Map<string, number>();

    interface LigneAgregee {
      numero: string;
      intitule: string;
      totalDebit: number;
      totalCredit: number;
    }
    const parNumero = new Map<string, LigneAgregee>();
    const detailParDossier: Array<{ dossier: string; numero: string; intitule: string; totalDebit: number; totalCredit: number }> = [];
    const equilibres: Array<{ id: string; nom: string; estMere: boolean; totalDebit: number; totalCredit: number; solde58: number; equilibre: boolean }> = [];

    for (const d of dossiers) {
      if (!d.exerciceId) continue;
      const balance = await this.ecritureService.balance(d.id, d.exerciceId);
      let solde58 = 0;
      for (const l of balance.lignes) {
        // Redondant par construction (la balance ne rend que du détail), gardé
        // contre le double comptage · voir EcritureService.balance.
        if (l.typeCompte === 'TOTAL') continue;
        const existante = parNumero.get(l.numero);
        if (existante) {
          existante.totalDebit += l.totalDebit;
          existante.totalCredit += l.totalCredit;
          // L'intitulé de la mère fait foi · celui d'une cellule ne remplace
          // jamais un intitulé déjà retenu.
        } else {
          parNumero.set(l.numero, {
            numero: l.numero,
            intitule: l.intitule,
            totalDebit: l.totalDebit,
            totalCredit: l.totalCredit,
          });
        }
        if (l.numero.startsWith('58')) solde58 += l.solde;
        // La créance (ou la dette) de CE dossier envers un autre dossier du
        // groupe · elle doit trouver son reflet exact en face.
        if (compteReciproque.has(l.compteId)) {
          soldeReciproqueParCompte.set(l.compteId, l.totalDebit - l.totalCredit);
        }
        detailParDossier.push({
          dossier: d.nom,
          numero: l.numero,
          intitule: l.intitule,
          totalDebit: l.totalDebit,
          totalCredit: l.totalCredit,
        });
      }
      equilibres.push({
        id: d.id,
        nom: d.nom,
        estMere: d.estMere,
        totalDebit: balance.totaux.debit,
        totalCredit: balance.totaux.credit,
        solde58,
        equilibre: Math.abs(balance.totaux.debit - balance.totaux.credit) <= 0.005,
      });
    }

    const reciproques = await this.eliminerOperationsReciproques(
      compteReciproque,
      dossiers.filter((d) => d.exerciceId).map((d) => ({ tenantId: d.id, exerciceId: d.exerciceId! })),
      nomParDossier,
      soldeReciproqueParCompte,
    );
    // L'agrégat est le cumul MOINS ce qui a été éliminé · `detailParDossier`
    // reste le cumul BRUT, dossier par dossier, pour que la soustraction se
    // refasse à la main : agrégat = détail par dossier − éliminations. Un
    // détail déjà net ne se rapprocherait plus des balances des dossiers.
    for (const e of reciproques.eliminations) {
      const ligne = parNumero.get(e.numero);
      if (!ligne) continue;
      ligne.totalDebit = Math.round((ligne.totalDebit - e.debit) * 100) / 100;
      ligne.totalCredit = Math.round((ligne.totalCredit - e.credit) * 100) / 100;
    }

    const lignes = [...parNumero.values()]
      .filter((l) => l.totalDebit !== 0 || l.totalCredit !== 0)
      .sort((a, b) => a.numero.localeCompare(b.numero))
      .map((l) => ({ ...l, solde: l.totalDebit - l.totalCredit }));
    const totaux = {
      debit: lignes.reduce((s, l) => s + l.totalDebit, 0),
      credit: lignes.reduce((s, l) => s + l.totalCredit, 0),
    };
    const ecartLiaison = equilibres.reduce((s, e) => s + e.solde58, 0);
    const ecartElimination =
      Math.round((reciproques.totaux.debit - reciproques.totaux.credit) * 100) / 100;

    // CE QUE L'ÉLIMINATION NE SAIT PAS FAIRE, ET QU'ELLE DIT.
    //
    // Le D4C ne s'arrête pas aux comptes réciproques : il veut aussi la
    // « neutralisation des résultats provenant d'opérations entre entités du
    // périmètre » (ch. XIII-4) et que les « résultats inclus dans
    // stocks/immobilisations [soient] totalement éliminés » (ch. XII-5). Ces
    // deux retraitements-là demandent des données que l'agrégat n'a PAS · il
    // travaille sur des soldes, et les registres de stocks comme
    // d'immobilisations vivent dans les dossiers (limite déjà assumée par
    // `liasseGroupe`). Calculer serait inventer ; on avertit.
    const avertissements: string[] = [];
    if (reciproques.comptesHao.length > 0) {
      avertissements.push(
        `Cession interne d'immobilisation NON neutralisée · une écriture interne au groupe porte un compte de la ` +
          `classe 8 (${reciproques.comptesHao.join(', ')}). Le D4C range les cessions internes d'immobilisations parmi les ` +
          `« opérations affectant le résultat consolidé » et impose de « reconstituer valeur brute et amortissements ` +
          `cumulés du cédant » (ch. XII-5) · l'agrégat ne dispose que de soldes, le registre des immobilisations reste ` +
          `dans les dossiers. Le produit de cession et la valeur d'entrée chez le preneur restent donc dans l'agrégat, ` +
          `à retraiter à la main.`,
      );
    }
    const stocksAgreges = lignes.filter((l) => l.numero.startsWith('3')).reduce((s, l) => s + l.solde, 0);
    if (
      Math.abs(stocksAgreges) > 0.005 &&
      reciproques.eliminations.some((e) => e.motif === MOTIF_CHARGE_PRODUIT)
    ) {
      avertissements.push(
        `Marge interne comprise dans les stocks NON neutralisée · des achats et des ventes internes ont été éliminés ` +
          `alors que l'agrégat porte encore ${(Math.round(stocksAgreges * 100) / 100).toFixed(2)} de stocks (classe 3). ` +
          `Le D4C veut la « neutralisation des résultats provenant d'opérations entre entités du périmètre » ` +
          `(ch. XIII-4) et l'élimination totale des « résultats inclus dans stocks/immobilisations » (ch. XII-5) · rien ` +
          `dans les comptes ne dit quelle part du stock de clôture vient d'un achat interne, ni à quelle marge. ` +
          `À retraiter à la main.`,
      );
    }

    return {
      exercice,
      dossiers: equilibres,
      // ABSENCE et DISCORDANCE sont deux manques distincts, et ils appellent
      // deux gestes différents : ouvrir l'exercice, ou l'aligner.
      cellulesSansExercice: dossiers
        .filter((d) => !d.exerciceId && !d.periodeDiscordante)
        .map((d) => ({ id: d.id, nom: d.nom })),
      cellulesPeriodeDiscordante: dossiers
        .filter((d) => d.periodeDiscordante)
        .map((d) => ({
          id: d.id,
          nom: d.nom,
          dateDebut: d.periodeDiscordante!.dateDebut,
          dateFin: d.periodeDiscordante!.dateFin,
        })),
      lignes,
      totaux,
      // CE QUI A ÉTÉ RETIRÉ, ligne à ligne · un agrégat dont on ne voit pas
      // ce qui a été retiré ne se vérifie pas.
      eliminations: reciproques.eliminations,
      totauxEliminations: reciproques.totaux,
      ecartsReciprocite: reciproques.ecarts,
      rattachementsRefuses,
      avertissements,
      controles: {
        // Arrondi au centime · l'agrégat de centaines de dossiers accumule
        // des poussières binaires qui ne sont pas des écarts comptables.
        ecartLiaison: Math.round(ecartLiaison * 100) / 100,
        liaisonNeutralisee: Math.abs(ecartLiaison) <= 0.005,
        tousEquilibres: equilibres.every((e) => e.equilibre),
        // Faux dès qu'une cellule a été écartée pour cause de période · c'est
        // ce drapeau qui bloque la liasse (voir liasseGroupe).
        periodesConcordantes: dossiers.every((d) => !d.periodeDiscordante),
        // La créance chez l'un est la dette chez l'autre · sinon l'écart est
        // nommé, jamais corrigé d'office.
        reciprocitesEquilibrees: reciproques.ecarts.length === 0,
        // Ce qui sort au débit doit égaler ce qui sort au crédit · une
        // élimination boiteuse déséquilibrerait l'agrégat lui-même.
        ecartElimination,
        eliminationsSymetriques: Math.abs(ecartElimination) <= 0.005,
        rattachementsValides: rattachementsRefuses.length === 0,
      },
      detailParDossier,
    };
  }

  /**
   * LES OPÉRATIONS RÉCIPROQUES, AU-DELÀ DU COMPTE 58.
   *
   * Un groupe d'établissements est UNE SEULE personne morale tenue en
   * plusieurs dossiers (voir l'en-tête de ce service). Ses comptes réunis sont
   * donc « les comptes d'un ensemble d'entités liées COMME SI ELLES FORMAIENT
   * UNE SEULE ENTITÉ » (D4C, ch. XIII-4 § 1), et le texte énumère ce que cette
   * réunion suppose : « cumul des comptes des entités du périmètre […] ;
   * ÉLIMINATION DES COMPTES RÉCIPROQUES (actifs/passifs, charges/produits) ;
   * neutralisation des résultats provenant d'opérations entre entités du
   * périmètre » (même paragraphe). Le ch. XII-5 § 4 dit lesquels : « Comptes
   * réciproques (sans effet sur le résultat) : bilan (clients/fournisseurs,
   * effets à recevoir/à payer, prêts/emprunts), charges/produits
   * (achats/ventes, charges/produits financiers) ».
   *
   * CE QUI SE FAISAIT AVANT · l'agrégat ne neutralisait que les comptes 58,
   * donc les seuls transferts de TRÉSORERIE ; le SYCEBNL les réserve d'ailleurs
   * aux « comptes de passage utiles à la comptabilisation d'opérations internes
   * à l'entité » dans les comptabilités à journaux auxiliaires (Partie 2, ch. 3,
   * fiche du COMPTE 58). Tout le reste des opérations réciproques restait dans
   * le total : une vente du siège à une antenne y comptait un chiffre
   * d'affaires que l'entité n'a jamais réalisé avec un tiers, et la créance
   * comme la dette y figuraient des deux côtés. Rien ne pouvait le voir · un
   * compte 411 ne dit pas si son titulaire est un client ou une antenne. C'est
   * `Tiers.celluleGroupeId` qui le dit.
   *
   * CE QUI SORT, ET RIEN D'AUTRE :
   *  · les comptes RATTACHÉS à un tiers-cellule (la créance, la dette) ;
   *  · dans les écritures qui touchent un de ces comptes, les lignes de
   *    CLASSE 6 et 7 · un achat ou une vente n'est réciproque que par
   *    l'écriture qui le porte, aucun numéro de compte ne le dit (un 601 ne
   *    sait pas à qui l'on a acheté).
   * La trésorerie n'est PAS éliminée : la caisse de l'antenne et la banque du
   * siège sont deux avoirs réels de l'entité, et un règlement interne les
   * déplace sans en créer ni en détruire. Les mêmes montants se retrouvent des
   * deux côtés et se compensent d'eux-mêmes dans le cumul.
   *
   * L'ÉLIMINATION EST SYMÉTRIQUE OU ELLE N'EST PAS · ce qui sort au débit chez
   * l'un sort au crédit chez l'autre. Deux contrôles le vérifient, et aucun ne
   * corrige : l'écart de RÉCIPROCITÉ (la créance chez l'un contre la dette chez
   * l'autre, paire par paire) et l'écart d'ÉLIMINATION (total sorti au débit
   * contre total sorti au crédit). Le D4C fait de la « procédure de
   * confirmation de solde pour toutes les opérations » (ch. XII-5 § 2) le
   * préalable de toute élimination intra-groupe : un écart, c'est cette
   * confirmation qui a échoué, et le logiciel n'a pas à choisir lequel des deux
   * dossiers a raison.
   *
   * UN GROUPE SANS AUCUN TIERS-CELLULE NE PERD RIEN · `compteReciproque` est
   * alors vide, aucune écriture n'est lue, rien n'est retranché, et l'agrégat
   * est au centime celui d'avant cette méthode. C'est le cas de tous les
   * dossiers existants, qui n'ont jamais pu saisir ce rattachement.
   */
  private async eliminerOperationsReciproques(
    compteReciproque: Map<string, { dossierId: string; cibleId: string }>,
    dossiersRetenus: Array<{ tenantId: string; exerciceId: string }>,
    nomParDossier: Map<string, string>,
    soldeReciproqueParCompte: Map<string, number>,
  ): Promise<{
    eliminations: EliminationReciproque[];
    totaux: { debit: number; credit: number };
    ecarts: EcartReciprocite[];
    comptesHao: string[];
  }> {
    const arrondi = (x: number) => Math.round(x * 100) / 100;
    const nom = (id: string) => nomParDossier.get(id) ?? id;
    if (compteReciproque.size === 0) {
      return { eliminations: [], totaux: { debit: 0, credit: 0 }, ecarts: [], comptesHao: [] };
    }

    // --- 1 · Ce qui sort de l'agrégat -----------------------------------
    // Toutes les lignes des écritures qui touchent un compte réciproque · la
    // borne est l'EXERCICE retenu de chaque dossier, le même univers que celui
    // des balances cumulées plus haut (brouillard compris, à-nouveaux
    // compris). Lire un univers plus large retrancherait des montants que le
    // cumul ne contient pas.
    const lignesInternes = await this.prisma.ligneEcriture.findMany({
      where: {
        ecriture: {
          tenantId: { in: dossiersRetenus.map((d) => d.tenantId) },
          exerciceId: { in: dossiersRetenus.map((d) => d.exerciceId) },
          lignes: { some: { compteId: { in: [...compteReciproque.keys()] } } },
        },
      },
      select: {
        ecritureId: true,
        compteId: true,
        debit: true,
        credit: true,
        ecriture: { select: { tenantId: true } },
        compte: { select: { numero: true, intitule: true } },
      },
    });

    // Quel dossier du groupe chaque écriture met en face · c'est la seule
    // façon de nommer la contrepartie d'une charge ou d'un produit.
    const contrepartieDeLEcriture = new Map<string, Set<string>>();
    for (const l of lignesInternes) {
      const rec = compteReciproque.get(l.compteId);
      if (!rec) continue;
      const vues = contrepartieDeLEcriture.get(l.ecritureId) ?? new Set<string>();
      vues.add(nom(rec.cibleId));
      contrepartieDeLEcriture.set(l.ecritureId, vues);
    }

    const cumul = new Map<string, EliminationReciproque>();
    const comptesHao = new Set<string>();
    for (const l of lignesInternes) {
      const numero = l.compte.numero;
      // La classe 8 est signalée, jamais éliminée · voir l'avertissement monté
      // par `balanceAgregee`.
      if (numero.startsWith('8')) comptesHao.add(numero);
      const estReciproque = compteReciproque.has(l.compteId);
      const estChargeOuProduit = numero.startsWith('6') || numero.startsWith('7');
      if (!estReciproque && !estChargeOuProduit) continue;
      const motif = estReciproque ? MOTIF_CREANCE_DETTE : MOTIF_CHARGE_PRODUIT;
      const contrepartie = [...(contrepartieDeLEcriture.get(l.ecritureId) ?? [])].sort().join(', ');
      const cle = `${l.ecriture.tenantId}|${contrepartie}|${numero}|${motif}`;
      const ligne = cumul.get(cle) ?? {
        dossier: nom(l.ecriture.tenantId),
        contrepartie,
        numero,
        intitule: l.compte.intitule,
        motif,
        debit: 0,
        credit: 0,
      };
      ligne.debit += Number(l.debit);
      ligne.credit += Number(l.credit);
      cumul.set(cle, ligne);
    }

    const eliminations = [...cumul.values()]
      .map((e) => ({ ...e, debit: arrondi(e.debit), credit: arrondi(e.credit) }))
      .filter((e) => e.debit !== 0 || e.credit !== 0)
      .sort(
        (a, b) =>
          a.dossier.localeCompare(b.dossier) ||
          a.numero.localeCompare(b.numero) ||
          a.motif.localeCompare(b.motif),
      );
    const totaux = {
      debit: arrondi(eliminations.reduce((s, e) => s + e.debit, 0)),
      credit: arrondi(eliminations.reduce((s, e) => s + e.credit, 0)),
    };

    // --- 2 · La réciprocité, paire de dossiers par paire de dossiers -----
    // Le solde des comptes que A tient au nom de B, contre le solde de ceux que
    // B tient au nom de A. Créance d'un côté, dette de l'autre : leur SOMME
    // doit être nulle. Un dossier écarté de l'agrégat (période discordante,
    // exercice absent) ne contribue rien, et c'est justement ce que l'écart
    // rend visible · on ne confirme pas un solde avec un dossier absent.
    const soldeVers = new Map<string, number>();
    for (const [compteId, rec] of compteReciproque) {
      const cle = `${rec.dossierId}|${rec.cibleId}`;
      soldeVers.set(cle, (soldeVers.get(cle) ?? 0) + (soldeReciproqueParCompte.get(compteId) ?? 0));
    }
    // L'ordre des deux dossiers d'une paire suit leurs NOMS · un ordre pris
    // sur les identifiants serait stable mais illisible, et le refus de la
    // liasse nomme les deux dossiers dans cet ordre.
    const paires = new Set<string>();
    for (const cle of soldeVers.keys()) {
      const [x, y] = cle.split('|');
      paires.add(nom(x).localeCompare(nom(y)) <= 0 ? `${x}|${y}` : `${y}|${x}`);
    }
    const ecarts: EcartReciprocite[] = [];
    for (const paire of paires) {
      const [a, b] = paire.split('|');
      const solde = arrondi(soldeVers.get(`${a}|${b}`) ?? 0);
      const soldeContrepartie = arrondi(soldeVers.get(`${b}|${a}`) ?? 0);
      const ecart = arrondi(solde + soldeContrepartie);
      if (Math.abs(ecart) <= 0.005) continue;
      ecarts.push({ dossier: nom(a), contrepartie: nom(b), solde, soldeContrepartie, ecart });
    }
    ecarts.sort((x, y) => x.dossier.localeCompare(y.dossier) || x.contrepartie.localeCompare(y.contrepartie));

    return { eliminations, totaux, ecarts, comptesHao: [...comptesHao].sort() };
  }

  /**
   * Le même agrégat en classeur Excel. La feuille « Balance agrégée » porte
   * EXACTEMENT les quatre colonnes attendues par l'import de balance
   * (Numéro, Intitulé, Débit, Crédit), sans ligne de total : c'est elle qui
   * se réimporte telle quelle dans un dossier de combinaison pour produire
   * la liasse officielle de l'entité avec les moteurs d'états existants.
   * Les totaux et vérifications vivent sur la feuille « Contrôles ».
   */
  async balanceAgregeeExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    return this.dansLeGroupe(tenantId, () => this.balanceAgregeeExcelDuGroupe(tenantId, exerciceId));
  }

  private async balanceAgregeeExcelDuGroupe(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const agregat = await this.balanceAgregee(tenantId, exerciceId);
    const annee = agregat.exercice.dateFin.getFullYear();

    const wb = new Workbook();
    const fmt = '#,##0.00';

    const feuille = wb.addWorksheet('Balance agrégée');
    feuille.columns = [
      { header: 'Numéro', key: 'numero', width: 14 },
      { header: 'Intitulé', key: 'intitule', width: 48 },
      { header: 'Débit', key: 'debit', width: 16, style: { numFmt: fmt } },
      { header: 'Crédit', key: 'credit', width: 16, style: { numFmt: fmt } },
    ];
    feuille.getRow(1).font = { bold: true };
    for (const l of agregat.lignes) {
      feuille.addRow({ numero: l.numero, intitule: l.intitule, debit: l.totalDebit, credit: l.totalCredit });
    }

    const detail = wb.addWorksheet('Par dossier');
    detail.columns = [
      { header: 'Dossier', key: 'dossier', width: 32 },
      { header: 'Numéro', key: 'numero', width: 14 },
      { header: 'Intitulé', key: 'intitule', width: 48 },
      { header: 'Débit', key: 'debit', width: 16, style: { numFmt: fmt } },
      { header: 'Crédit', key: 'credit', width: 16, style: { numFmt: fmt } },
    ];
    detail.getRow(1).font = { bold: true };
    for (const l of agregat.detailParDossier) {
      detail.addRow({ dossier: l.dossier, numero: l.numero, intitule: l.intitule, debit: l.totalDebit, credit: l.totalCredit });
    }

    // CE QUI A ÉTÉ RETIRÉ · la feuille « Par dossier » porte le cumul BRUT,
    // celle-ci ce qui en a été éliminé, et « Balance agrégée » la différence.
    // Sans elle, l'agrégat ne se rapprocherait plus des balances qui l'ont
    // formé, et rien ne dirait qu'une vente interne en est sortie.
    //
    // La feuille N'EST CRÉÉE QUE S'IL Y A QUELQUE CHOSE À MONTRER · un groupe
    // sans tiers-cellule (le cas de tous les dossiers existants) reçoit le
    // classeur d'avant, feuille pour feuille.
    if (agregat.eliminations.length > 0) {
      const elim = wb.addWorksheet('Éliminations');
      elim.columns = [
        { header: 'Dossier', key: 'dossier', width: 32 },
        { header: 'Contrepartie du groupe', key: 'contrepartie', width: 32 },
        { header: 'Numéro', key: 'numero', width: 14 },
        { header: 'Intitulé', key: 'intitule', width: 48 },
        { header: 'À ce titre', key: 'motif', width: 30 },
        { header: 'Débit retiré', key: 'debit', width: 16, style: { numFmt: fmt } },
        { header: 'Crédit retiré', key: 'credit', width: 16, style: { numFmt: fmt } },
      ];
      elim.getRow(1).font = { bold: true };
      for (const e of agregat.eliminations) {
        elim.addRow({
          dossier: e.dossier,
          contrepartie: e.contrepartie,
          numero: e.numero,
          intitule: e.intitule,
          motif: e.motif,
          debit: e.debit,
          credit: e.credit,
        });
      }
      const totalElim = elim.addRow({
        dossier: 'TOTAL ÉLIMINÉ',
        debit: agregat.totauxEliminations.debit,
        credit: agregat.totauxEliminations.credit,
        motif: agregat.controles.eliminationsSymetriques
          ? 'élimination symétrique'
          : `ÉLIMINATION BOITEUSE (écart ${agregat.controles.ecartElimination.toFixed(2)})`,
      });
      totalElim.font = { bold: true };
    }

    const controles = wb.addWorksheet('Contrôles');
    controles.columns = [
      { header: 'Dossier', key: 'nom', width: 32 },
      { header: 'Débit', key: 'debit', width: 16, style: { numFmt: fmt } },
      { header: 'Crédit', key: 'credit', width: 16, style: { numFmt: fmt } },
      { header: 'Solde 58 (virements internes)', key: 'solde58', width: 24, style: { numFmt: fmt } },
      { header: 'Équilibre', key: 'equilibre', width: 14 },
    ];
    controles.getRow(1).font = { bold: true };
    for (const e of agregat.dossiers) {
      controles.addRow({
        nom: e.estMere ? `${e.nom} (siège)` : e.nom,
        debit: e.totalDebit,
        credit: e.totalCredit,
        solde58: e.solde58,
        equilibre: e.equilibre ? 'Oui' : 'DÉSÉQUILIBRÉ',
      });
    }
    controles.addRow({});
    // Les lignes par dossier portent le cumul BRUT, le TOTAL AGRÉGÉ est NET ·
    // sans cette ligne, la colonne ne s'additionnerait plus à l'écran et le
    // lecteur croirait à une erreur de report.
    if (agregat.eliminations.length > 0) {
      controles.addRow({
        nom: 'Éliminations des opérations réciproques',
        debit: -agregat.totauxEliminations.debit,
        credit: -agregat.totauxEliminations.credit,
        equilibre: agregat.controles.eliminationsSymetriques
          ? 'symétrique'
          : `ÉCART D’ÉLIMINATION ${agregat.controles.ecartElimination.toFixed(2)}`,
      });
    }
    const totalRow = controles.addRow({
      nom: 'TOTAL AGRÉGÉ',
      debit: agregat.totaux.debit,
      credit: agregat.totaux.credit,
      solde58: agregat.controles.ecartLiaison,
      equilibre: agregat.controles.liaisonNeutralisee ? '58 neutralisés' : 'ÉCART SUR 58',
    });
    totalRow.font = { bold: true };
    for (const c of agregat.cellulesSansExercice) {
      controles.addRow({ nom: c.nom, equilibre: 'SANS EXERCICE · chiffres absents de l’agrégat' });
    }
    // Le classeur circule seul (il se réimporte dans un dossier de
    // combinaison) · si la feuille de contrôles taisait les cellules écartées
    // pour période, l'absence redeviendrait silencieuse à l'export.
    for (const c of agregat.cellulesPeriodeDiscordante) {
      controles.addRow({
        nom: c.nom,
        equilibre: `PÉRIODE DISCORDANTE (${GroupeService.jour(c.dateDebut)} au ${GroupeService.jour(c.dateFin)}) · chiffres absents de l’agrégat`,
      });
    }
    // Une réciprocité qui ne se boucle pas, un rattachement refusé ou un
    // retraitement que l'agrégat ne sait pas faire ne peuvent pas rester dans
    // la seule réponse de l'écran · le classeur circule seul.
    for (const e of agregat.ecartsReciprocite) {
      controles.addRow({
        nom: e.dossier,
        debit: e.solde,
        credit: e.soldeContrepartie,
        equilibre: `ÉCART DE RÉCIPROCITÉ de ${e.ecart.toFixed(2)} avec ${e.contrepartie} · créance et dette ne se répondent pas`,
      });
    }
    for (const r of agregat.rattachementsRefuses) {
      controles.addRow({
        nom: r.dossier,
        equilibre: `RATTACHEMENT REFUSÉ · tiers ${r.codeTiers} (${r.nomTiers}) : ${r.motif} · rien n’a été éliminé pour lui`,
      });
    }
    for (const a of agregat.avertissements) {
      controles.addRow({ nom: 'AVERTISSEMENT', equilibre: a });
    }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer, nomFichier: `balance-agregee-groupe-${annee}.xlsx` };
  }

  /** La cellule appartient-elle au groupe de l'appelant ? Borne TOUTE lecture transversale. */
  private async celluleDuGroupe(tenantId: string, celluleId: string) {
    const cellule = await this.prisma.tenant.findFirst({
      where: { id: celluleId, dossierMereId: tenantId },
      select: { id: true, nom: true },
    });
    if (!cellule) {
      throw new NotFoundException('Cette cellule n’appartient pas à ce groupe');
    }
    return cellule;
  }

  /** L'exercice ouvert d'une cellule · celui que visent canevas et dépôts. */
  private async exerciceOuvert(celluleId: string) {
    const exercice = await this.prisma.exercice.findFirst({
      where: { tenantId: celluleId, statut: StatutExercice.OUVERT },
      orderBy: { dateDebut: 'desc' },
      select: { id: true, dateDebut: true, dateFin: true },
    });
    if (!exercice) {
      throw new BadRequestException('Cette cellule n’a aucun exercice ouvert');
    }
    return exercice;
  }

  /**
   * SUPERVISION EN LECTURE SEULE · l'état d'avancement de chaque cellule,
   * recalculé à la demande (pas de flux continu : une comptabilité n'évolue
   * pas à la seconde, et 300 dossiers en flux permanent coûteraient cher
   * pour rien). Le siège voit tout, ne touche à rien : les corrections se
   * demandent à la cellule, qui les passe elle-même, tracées.
   */
  async supervision(tenantId: string, exerciceId: string) {
    return this.dansLeGroupe(tenantId, () => this.supervisionDuGroupe(tenantId, exerciceId));
  }

  private async supervisionDuGroupe(tenantId: string, exerciceId: string) {
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: exerciceId, tenantId },
      select: { id: true, dateDebut: true, dateFin: true },
    });
    if (!exercice) {
      throw new NotFoundException('Exercice introuvable dans ce dossier');
    }
    const cellules = await this.prisma.tenant.findMany({
      where: { dossierMereId: tenantId },
      orderBy: { nom: 'asc' },
      select: { id: true, nom: true, jeuEtatsFinanciersSycebnl: true, exercices: { select: { id: true, dateDebut: true, dateFin: true } } },
    });

    const lignes = [];
    for (const c of cellules) {
      // La supervision est un écran de LECTURE : on y montre l'exercice
      // recouvrant s'il n'y a pas de concordant, pour que le siège voie
      // quand même l'activité de la cellule et puisse ouvrir sa balance.
      // Mais une cellule décalée n'est jamais « prête » pour l'agrégat, et
      // ses dates sont rendues pour que l'écart soit dicible.
      const choix = this.exercicePourLaPeriode(c.exercices, exercice.dateDebut, exercice.dateFin);
      const exCellule = choix.concordant ?? choix.discordant;
      if (!exCellule) {
        lignes.push({
          id: c.id,
          nom: c.nom,
          jeuEtatsFinanciersSycebnl: c.jeuEtatsFinanciersSycebnl,
          exerciceId: null,
          periodeDiscordante: null,
          derniereEcriture: null,
          nbEcritures: 0,
          nbBrouillard: 0,
          tresorerie: 0,
          solde58: 0,
          equilibre: true,
          prete: false,
        });
        continue;
      }
      const [balance, derniere, nbEcritures, nbBrouillard] = await Promise.all([
        this.ecritureService.balance(c.id, exCellule.id),
        this.prisma.ecriture.findFirst({
          where: { tenantId: c.id, exerciceId: exCellule.id },
          orderBy: { date: 'desc' },
          select: { date: true },
        }),
        this.prisma.ecriture.count({ where: { tenantId: c.id, exerciceId: exCellule.id } }),
        this.prisma.ecriture.count({
          where: { tenantId: c.id, exerciceId: exCellule.id, statut: StatutEcriture.BROUILLARD },
        }),
      ]);
      const detail = balance.lignes.filter((l) => l.typeCompte !== 'TOTAL');
      const tresorerie = detail
        .filter((l) => l.numero.startsWith('5') && !l.numero.startsWith('58'))
        .reduce((s, l) => s + l.solde, 0);
      const solde58 = detail.filter((l) => l.numero.startsWith('58')).reduce((s, l) => s + l.solde, 0);
      const equilibre = Math.abs(balance.totaux.debit - balance.totaux.credit) <= 0.005;
      lignes.push({
        id: c.id,
        nom: c.nom,
        jeuEtatsFinanciersSycebnl: c.jeuEtatsFinanciersSycebnl,
        exerciceId: exCellule.id,
        periodeDiscordante: choix.concordant
          ? null
          : { dateDebut: exCellule.dateDebut, dateFin: exCellule.dateFin },
        derniereEcriture: derniere?.date ?? null,
        nbEcritures,
        nbBrouillard,
        tresorerie,
        solde58,
        equilibre,
        // « Prête pour l'agrégat » : sur la MÊME période que le siège,
        // équilibrée, plus rien en brouillard, et au moins une écriture (une
        // cellule à zéro n'a rien déposé). La période vient en tête : une
        // cellule décalée a beau être irréprochable, ses chiffres n'entrent
        // pas dans cet agrégat.
        prete: choix.concordant !== null && equilibre && nbBrouillard === 0 && nbEcritures > 0,
      });
    }
    return { exercice, cellules: lignes };
  }

  /**
   * Balance d'UNE cellule, en lecture · le zoom de la supervision quand un
   * voyant est rouge. Bornée deux fois : la cellule doit appartenir au
   * groupe, et l'exercice à la cellule.
   */
  async balanceCellule(tenantId: string, celluleId: string, exerciceId: string) {
    return this.dansLeGroupe(tenantId, () => this.balanceCelluleDuGroupe(tenantId, celluleId, exerciceId));
  }

  private async balanceCelluleDuGroupe(tenantId: string, celluleId: string, exerciceId: string) {
    const cellule = await this.celluleDuGroupe(tenantId, celluleId);
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: exerciceId, tenantId: celluleId },
      select: { id: true },
    });
    if (!exercice) {
      throw new NotFoundException('Exercice introuvable dans cette cellule');
    }
    const balance = await this.ecritureService.balance(celluleId, exerciceId);
    return { cellule, ...balance };
  }

  /**
   * LE CANEVAS DE TRÉSORERIE · le fichier Excel officiel qu'une cellule non
   * autonome remplit. Liste de rubriques FERMÉE (voir canevas-tresorerie.ts),
   * cellules verrouillées hors zone de saisie, marqueur de version : c'est
   * ce triptyque qui rend l'import automatique et fiable. Se remplit très
   * bien sur un téléphone.
   */
  async canevas(tenantId: string, celluleId: string): Promise<ClasseurExporte> {
    return this.dansLeGroupe(tenantId, () => this.canevasDuGroupe(tenantId, celluleId));
  }

  private async canevasDuGroupe(tenantId: string, celluleId: string): Promise<ClasseurExporte> {
    const cellule = await this.celluleDuGroupe(tenantId, celluleId);
    const exercice = await this.exerciceOuvert(celluleId);

    const wb = new Workbook();
    const ws = wb.addWorksheet('Journal de trésorerie');
    ws.getCell('A1').value = MARQUEUR_CANEVAS;
    ws.getCell('A1').font = { size: 8, color: { argb: 'FFBBBBBB' } };
    ws.getCell('A2').value = 'Cellule :';
    ws.getCell('B2').value = cellule.nom;
    ws.getCell('A3').value = 'Exercice :';
    ws.getCell('B3').value = `du ${exercice.dateDebut.toISOString().slice(0, 10)} au ${exercice.dateFin.toISOString().slice(0, 10)}`;
    ws.getRow(2).font = { bold: true };
    ws.getRow(3).font = { bold: true };

    const entetes = ['Date', 'Libellé', 'Rubrique', 'Encaissement', 'Décaissement', 'Caisse ou banque'];
    const ligneEntetes = ws.getRow(PREMIERE_LIGNE_DONNEES - 1);
    entetes.forEach((e, i) => {
      const cellule = ligneEntetes.getCell(i + 1);
      cellule.value = e;
      cellule.font = { bold: true };
      cellule.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
    });
    ws.getColumn(1).width = 12;
    ws.getColumn(2).width = 42;
    ws.getColumn(3).width = 40;
    ws.getColumn(4).width = 16;
    ws.getColumn(5).width = 16;
    ws.getColumn(6).width = 18;
    ws.getColumn(1).numFmt = 'dd/mm/yyyy';
    ws.getColumn(4).numFmt = '#,##0.00';
    ws.getColumn(5).numFmt = '#,##0.00';

    const rubriques = wb.addWorksheet('Rubriques');
    rubriques.columns = [
      { header: 'Rubrique', key: 'libelle', width: 44 },
      { header: 'Sens', key: 'sens', width: 12 },
      { header: 'Compte', key: 'compte', width: 12 },
    ];
    rubriques.getRow(1).font = { bold: true };
    for (const r of RUBRIQUES_CANEVAS) {
      rubriques.addRow({ libelle: r.libelle, sens: r.sens === 'recette' ? 'Recette' : 'Dépense', compte: r.compte });
    }

    // Listes déroulantes fermées · un trésorier CHOISIT, il ne tape jamais
    // un numéro de compte.
    for (let l = PREMIERE_LIGNE_DONNEES; l <= DERNIERE_LIGNE_DONNEES; l++) {
      ws.getCell(`C${l}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Rubriques!$A$2:$A$${RUBRIQUES_CANEVAS.length + 1}`],
        showErrorMessage: true,
        errorTitle: 'Rubrique inconnue',
        error: 'Choisissez une rubrique dans la liste.',
      };
      ws.getCell(`F${l}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Caisse,Banque"'],
        showErrorMessage: true,
        errorTitle: 'Valeur inconnue',
        error: 'Choisissez Caisse ou Banque.',
      };
      // Zone de saisie déverrouillée · tout le reste de la feuille est
      // protégé (cartouche, en-têtes, marqueur).
      for (let col = 1; col <= 6; col++) {
        ws.getRow(l).getCell(col).protection = { locked: false };
      }
    }
    await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true });

    const slug = cellule.nom
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer, nomFichier: `canevas-${slug || 'cellule'}-${exercice.dateFin.getFullYear()}.xlsx` };
  }

  /**
   * DÉPÔT D'UN CANEVAS REMPLI · l'import est TOUT OU RIEN : la moindre ligne
   * fausse (date hors exercice, rubrique inconnue, montant des deux côtés)
   * fait tout refuser avec la liste des anomalies, ligne par ligne · un
   * dépôt à moitié importé serait introuvable après coup. Chaque ligne
   * valide devient une écriture équilibrée du journal de trésorerie de la
   * cellule (statut brouillard : la validation reste un geste distinct,
   * comme pour toute saisie). Le même fichier ne s'importe pas deux fois
   * (empreinte du contenu portée en référence).
   */
  async importerCanevas(tenantId: string, celluleId: string, createdBy: string, dto: ImporterCanevasDto) {
    return this.dansLeGroupe(tenantId, () => this.importerCanevasDuGroupe(tenantId, celluleId, createdBy, dto));
  }

  private async importerCanevasDuGroupe(tenantId: string, celluleId: string, createdBy: string, dto: ImporterCanevasDto) {
    await this.celluleDuGroupe(tenantId, celluleId);
    const exercice = await this.exerciceOuvert(celluleId);

    const contenu = Buffer.from(dto.contenuBase64, 'base64');
    const wb = new Workbook();
    try {
      await wb.xlsx.load(contenu as never);
    } catch {
      throw new BadRequestException('Ce fichier n’est pas un classeur Excel lisible (.xlsx attendu)');
    }
    const ws = wb.getWorksheet('Journal de trésorerie');
    if (!ws || String(ws.getCell('A1').value ?? '') !== MARQUEUR_CANEVAS) {
      throw new BadRequestException(
        'Ce fichier n’est pas un canevas OmegaX · téléchargez le canevas officiel de la cellule et remplissez-le',
      );
    }

    const empreinte = createHash('sha1').update(contenu).digest('hex').slice(0, 10);
    const reference = `CANEVAS ${empreinte}`;
    const dejaImporte = await this.prisma.ecriture.findFirst({
      where: { tenantId: celluleId, reference },
      select: { id: true },
    });
    if (dejaImporte) {
      throw new BadRequestException('Ce fichier a déjà été importé dans cette cellule (contenu identique)');
    }

    const rubriqueParLibelle = new Map(RUBRIQUES_CANEVAS.map((r) => [r.libelle, r]));
    const anomalies: Array<{ ligne: number; message: string }> = [];
    const lignesValides: Array<{
      date: Date;
      libelle: string;
      compteRubrique: string;
      compteTresorerie: string;
      journal: 'CA' | 'BQ';
      sens: 'recette' | 'depense';
      montant: number;
    }> = [];

    const texte = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
    const nombre = (v: unknown): number => {
      if (v === null || v === undefined || v === '') return 0;
      const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : NaN;
    };

    for (let l = PREMIERE_LIGNE_DONNEES; l <= Math.min(ws.rowCount, DERNIERE_LIGNE_DONNEES); l++) {
      const row = ws.getRow(l);
      const brutDate = row.getCell(1).value;
      const libelle = texte(row.getCell(2).value);
      const rubriqueLibelle = texte(row.getCell(3).value);
      const encaissement = nombre(row.getCell(4).value);
      const decaissement = nombre(row.getCell(5).value);
      const tresorerieLibelle = texte(row.getCell(6).value);
      if (!brutDate && !libelle && !rubriqueLibelle && !encaissement && !decaissement) continue; // ligne vide

      const date = brutDate instanceof Date ? brutDate : new Date(texte(brutDate));
      if (Number.isNaN(date.getTime())) {
        anomalies.push({ ligne: l, message: 'Date illisible' });
        continue;
      }
      if (date < exercice.dateDebut || date > exercice.dateFin) {
        anomalies.push({ ligne: l, message: `Date hors de l'exercice ouvert de la cellule` });
        continue;
      }
      const rubrique = rubriqueParLibelle.get(rubriqueLibelle);
      if (!rubrique) {
        anomalies.push({ ligne: l, message: `Rubrique inconnue « ${rubriqueLibelle} »` });
        continue;
      }
      if (Number.isNaN(encaissement) || Number.isNaN(decaissement) || encaissement < 0 || decaissement < 0) {
        anomalies.push({ ligne: l, message: 'Montant illisible ou négatif' });
        continue;
      }
      const montant = rubrique.sens === 'recette' ? encaissement : decaissement;
      const autre = rubrique.sens === 'recette' ? decaissement : encaissement;
      if (montant <= 0 || autre !== 0) {
        anomalies.push({
          ligne: l,
          message:
            rubrique.sens === 'recette'
              ? `« ${rubrique.libelle} » est une recette · montant attendu en Encaissement seulement`
              : `« ${rubrique.libelle} » est une dépense · montant attendu en Décaissement seulement`,
        });
        continue;
      }
      const tresorerie = TRESORERIES_CANEVAS[tresorerieLibelle];
      if (!tresorerie) {
        anomalies.push({ ligne: l, message: 'Colonne « Caisse ou banque » vide ou inconnue' });
        continue;
      }
      lignesValides.push({
        date,
        libelle: libelle || rubrique.libelle,
        compteRubrique: rubrique.compte,
        compteTresorerie: tresorerie.compte,
        journal: tresorerie.journal,
        sens: rubrique.sens,
        montant,
      });
    }

    if (anomalies.length > 0) {
      return { importe: false, lignesImportees: 0, anomalies };
    }
    if (lignesValides.length === 0) {
      throw new BadRequestException('Le canevas ne contient aucune ligne remplie');
    }

    // Référentiels de la cellule · comptes par numéro, journaux CA/BQ.
    const numeros = [...new Set(lignesValides.flatMap((l) => [l.compteRubrique, l.compteTresorerie]))];
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId: celluleId, numero: { in: numeros } },
      select: { id: true, numero: true },
    });
    const compteParNumero = new Map(comptes.map((c) => [c.numero, c.id]));
    const manquants = numeros.filter((n) => !compteParNumero.has(n));
    if (manquants.length > 0) {
      throw new BadRequestException(
        `Comptes absents du plan de la cellule : ${manquants.join(', ')} · le dossier n'a pas le plan SYCEBNL semé`,
      );
    }
    const journaux = await this.prisma.journal.findMany({
      where: { tenantId: celluleId, code: { in: ['CA', 'BQ'] } },
      select: { id: true, code: true, numerotation: true },
    });
    const journalParCode = new Map(journaux.map((j) => [j.code, j]));
    if (!journalParCode.has('CA') || !journalParCode.has('BQ')) {
      throw new BadRequestException('Journaux de trésorerie CA/BQ absents du dossier de la cellule');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const l of lignesValides) {
        // Le canevas alimente les journaux de trésorerie de la cellule · ses
        // pièces se numérotent comme celles saisies à la main dans ces mêmes
        // journaux, sans quoi le livre-journal de la cellule mélange des
        // pièces numérotées et des pièces sans numéro.
        const jal = journalParCode.get(l.journal)!;
        const numeroPiece = await prochainNumeroPiece(tx, celluleId, jal, exercice.id, l.date);
        await tx.ecriture.create({
          data: {
            tenantId: celluleId,
            exerciceId: exercice.id,
            journalId: jal.id,
            numeroPiece,
            date: l.date,
            libelle: l.libelle,
            reference,
            createdBy,
            lignes: {
              create:
                l.sens === 'recette'
                  ? [
                      { compteId: compteParNumero.get(l.compteTresorerie)!, debit: l.montant, credit: 0 },
                      { compteId: compteParNumero.get(l.compteRubrique)!, debit: 0, credit: l.montant },
                    ]
                  : [
                      { compteId: compteParNumero.get(l.compteRubrique)!, debit: l.montant, credit: 0 },
                      { compteId: compteParNumero.get(l.compteTresorerie)!, debit: 0, credit: l.montant },
                    ],
            },
          },
        });
      }
    });

    return {
      importe: true,
      lignesImportees: lignesValides.length,
      reference,
      // Les écritures naissent en brouillard · la validation reste un geste
      // distinct, dans le dossier de la cellule.
      statut: 'BROUILLARD',
      anomalies: [],
    };
  }

  /**
   * LA LIASSE DU GROUPE EN UN CLIC · automatise exactement le chemin manuel
   * documenté (exporter la balance agrégée, la réimporter dans un dossier de
   * combinaison, générer la liasse), sans les étapes manuelles : le serveur
   * reverse la balance agrégée dans un dossier de combinaison TECHNIQUE
   * (créé une fois, lié par Tenant.dossierCombinaisonId, sans utilisateurs,
   * sans dossierMereId · sinon l'agrégat le compterait et doublerait tout),
   * puis fait produire le classeur par les moteurs de liasse existants ·
   * aucun second moteur d'états, donc aucune divergence possible avec ce
   * qu'un dossier ordinaire produirait des mêmes soldes.
   *
   * REFUS si un contrôle est rouge · une liasse produite sur un agrégat
   * déséquilibré, des 58 non neutralisés, des opérations réciproques que les
   * deux dossiers ne confirment pas ou des cellules absentes serait fausse
   * avec l'apparence de l'officiel, le pire des livrables. Le message dit
   * exactement quoi corriger.
   *
   * Limite assumée (identique au chemin manuel) : les états et notes sont
   * calculés des SOLDES agrégés · les registres de détail (immobilisations,
   * tiers) vivent dans les dossiers, pas dans la combinaison.
   */
  async liasseGroupe(tenantId: string, exerciceId: string, createdBy: string): Promise<ClasseurExporte> {
    const combinaisonId = await this.assurerDossierCombinaison(tenantId);
    return this.dansLeGroupe(tenantId, () =>
      this.liasseGroupeDuGroupe(tenantId, exerciceId, createdBy, combinaisonId),
    );
  }

  private async liasseGroupeDuGroupe(
    tenantId: string,
    exerciceId: string,
    createdBy: string,
    combinaisonIdOuvert: string,
  ): Promise<ClasseurExporte> {
    const agregat = await this.balanceAgregee(tenantId, exerciceId);

    const blocages: string[] = [];
    if (!agregat.controles.tousEquilibres) {
      const noms = agregat.dossiers.filter((d) => !d.equilibre).map((d) => d.nom);
      blocages.push(`dossier(s) déséquilibré(s) : ${noms.join(', ')}`);
    }
    if (!agregat.controles.liaisonNeutralisee) {
      blocages.push(
        `virements internes (58) non neutralisés (écart ${agregat.controles.ecartLiaison.toFixed(2)}) · un transfert est enregistré d'un seul côté`,
      );
    }
    // LES OPÉRATIONS RÉCIPROQUES · une élimination qui ne se boucle pas rendrait
    // une liasse aussi fausse qu'un 58 pendant, et de la même façon : le total
    // est cohérent avec lui-même, seule la réalité manque. Le D4C fait de la
    // « procédure de confirmation de solde pour toutes les opérations »
    // (ch. XII-5 § 2) le préalable de l'élimination · tant qu'elle n'a pas
    // abouti, il n'y a rien à déposer.
    if (agregat.rattachementsRefuses.length > 0) {
      const nommes = agregat.rattachementsRefuses
        .map((r) => `${r.codeTiers} (${r.nomTiers}) dans ${r.dossier} : ${r.motif}`)
        .join(' ; ');
      blocages.push(
        `tiers rattaché(s) à un dossier qui n'est pas une cellule de ce groupe · ${nommes} · rien n'a été éliminé pour ` +
          "eux, car retirer une vente faite à une entité extérieure au groupe serait le contraire de l'élimination. " +
          'Corrigez le rattachement du tiers, ou retirez-le',
      );
    }
    if (!agregat.controles.reciprocitesEquilibrees) {
      const nommes = agregat.ecartsReciprocite
        .map((e) => `${e.dossier} porte ${e.solde.toFixed(2)} face à ${e.contrepartie} qui porte ${e.soldeContrepartie.toFixed(2)} (écart ${e.ecart.toFixed(2)})`)
        .join(' ; ');
      blocages.push(
        `opérations réciproques non confirmées · ${nommes} · la créance chez l'un doit être la dette chez l'autre. ` +
          "Le logiciel ne choisit pas lequel des deux dossiers a raison : confirmez le solde entre les deux dossiers, " +
          'passez l’écriture manquante, puis relancez',
      );
    }
    if (!agregat.controles.eliminationsSymetriques) {
      blocages.push(
        `élimination des opérations réciproques non symétrique (écart ${agregat.controles.ecartElimination.toFixed(2)} entre ` +
          `${agregat.totauxEliminations.debit.toFixed(2)} retirés au débit et ${agregat.totauxEliminations.credit.toFixed(2)} ` +
          "au crédit) · une opération interne n'est enregistrée que d'un seul côté, ou sa contrepartie n'est pas une " +
          'charge ni un produit · voir la feuille « Éliminations » du classeur de la balance agrégée',
      );
    }
    if (agregat.cellulesPeriodeDiscordante.length > 0) {
      const nommees = agregat.cellulesPeriodeDiscordante
        .map((c) => `${c.nom} (du ${GroupeService.jour(c.dateDebut)} au ${GroupeService.jour(c.dateFin)})`)
        .join(', ');
      blocages.push(
        `cellule(s) dont l'exercice ne couvre pas la période du siège (du ${GroupeService.jour(agregat.exercice.dateDebut)} au ` +
          `${GroupeService.jour(agregat.exercice.dateFin)}) : ${nommees} · leurs chiffres ont été laissés hors de l'agrégat, ` +
          "car une liasse qui additionne deux périodes ne correspond à aucune. L'exercice coïncide avec l'année civile " +
          "(AUDCIF art. 7, non exclu par l'art. 3 du SYCEBNL et repris à l'entrée EXERCICE de son glossaire) : seuls un " +
          'PREMIER exercice ou un exercice de LIQUIDATION peuvent être décalés · clôturez la cellule sur la période du ' +
          "siège, puis relancez, ou attendez qu'elle soit revenue à l'année civile",
      );
    }
    if (agregat.cellulesSansExercice.length > 0) {
      blocages.push(
        `cellule(s) sans exercice sur la période : ${agregat.cellulesSansExercice.map((c) => c.nom).join(', ')} · leurs chiffres manqueraient`,
      );
    }
    if (blocages.length > 0) {
      throw new BadRequestException(
        `La liasse du groupe ne peut pas être produite tant que l'agrégat n'est pas fiable · ${blocages.join(' ; ')}. Corrigez, puis relancez.`,
      );
    }

    // 1 · Le dossier de combinaison, créé une seule fois par groupe.
    // Le dossier de combinaison est OUVERT AVANT que le périmètre du groupe ne
    // soit calculé (voir la façade `liasseGroupe`) · un dossier créé au milieu
    // de la portée n'y figurerait pas, et toutes les écritures qui suivent
    // seraient refusées par la garde.
    const combinaisonId = combinaisonIdOuvert;

    // 2 · L'exercice miroir de celui de la mère.
    let exercice = await this.prisma.exercice.findFirst({
      where: { tenantId: combinaisonId, dateDebut: agregat.exercice.dateDebut, dateFin: agregat.exercice.dateFin },
      select: { id: true },
    });
    if (!exercice) {
      exercice = await this.prisma.exercice.create({
        data: { tenantId: combinaisonId, dateDebut: agregat.exercice.dateDebut, dateFin: agregat.exercice.dateFin },
        select: { id: true },
      });
    }

    // 3 · Régénération COMPLÈTE : le contenu du dossier de combinaison est
    // dérivé, jamais source · on repart de zéro à chaque génération, aucune
    // trace d'un agrégat précédent ne peut subsister.
    await this.prisma.ligneEcriture.deleteMany({
      where: { ecriture: { tenantId: combinaisonId, exerciceId: exercice.id } },
    });
    await this.prisma.ecriture.deleteMany({ where: { tenantId: combinaisonId, exerciceId: exercice.id } });

    // 4 · Les comptes de l'agrégat (créés au fil des générations · un compte
    // déjà présent est réutilisé, son intitulé n'est pas réécrit).
    await this.prisma.compte.createMany({
      data: agregat.lignes.map((l) => ({
        tenantId: combinaisonId!,
        numero: l.numero,
        intitule: l.intitule,
        classe: `CLASSE_${l.numero[0]}` as ClasseCompte,
      })),
      skipDuplicates: true,
    });
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId: combinaisonId, numero: { in: agregat.lignes.map((l) => l.numero) } },
      select: { id: true, numero: true },
    });
    const compteParNumero = new Map(comptes.map((c) => [c.numero, c.id]));

    let journal = await this.prisma.journal.findFirst({
      where: { tenantId: combinaisonId, code: 'OD' },
      select: { id: true, numerotation: true },
    });
    if (!journal) {
      journal = await this.prisma.journal.create({
        data: {
          tenantId: combinaisonId,
          code: 'OD',
          intitule: 'Combinaison du groupe',
          type: TypeJournal.GENERAL,
          numerotation: NumerotationPiece.CONTINUE_FICHIER,
        },
        select: { id: true, numerotation: true },
      });
    }

    // 5 · UNE écriture, la balance agrégée en brut (débits et crédits
    // conservés, pas seulement les soldes) · équilibrée par construction
    // puisque chaque dossier l'est (contrôlé ci-dessus).
    // Le dossier de combinaison est un dossier comme les autres · son journal
    // OD est déclaré à numérotation continue, et sa pièce doit la porter.
    const numeroPiece = await prochainNumeroPiece(
      this.prisma,
      combinaisonId,
      journal,
      exercice.id,
      agregat.exercice.dateDebut,
    );
    await this.prisma.ecriture.create({
      data: {
        tenantId: combinaisonId,
        exerciceId: exercice.id,
        journalId: journal.id,
        numeroPiece,
        date: agregat.exercice.dateDebut,
        libelle: `Combinaison du groupe · ${agregat.dossiers.length} dossiers`,
        reference: 'GROUPE',
        createdBy,
        // LE DOUBLE REGARD EST SANS OBJET ICI, et l'exclusion est ÉCRITE plutôt
        // qu'omise · une règle posée à un seul endroit se contourne ailleurs
        // sans que personne ne l'ait décidé, et c'est exactement le défaut que
        // le chantier du double regard corrige.
        //
        // Le dossier de combinaison est TECHNIQUE : il est intégralement
        // régénéré à chaque appel (voir la purge plus haut), aucun utilisateur
        // n'y vit et personne n'y saisit. Il n'y a donc pas de saisie à faire
        // relire par un second regard.
        //
        // ET UNE LIMITE À NE PAS ÉTENDRE À TOUT LE MODULE. Le siège fait aussi
        // naître des écritures dans le dossier d'une CELLULE, en portant le
        // `createdBy` d'un utilisateur du siège. Là, le double regard n'est pas
        // sans objet : il est satisfait PAR CONSTRUCTION, puisque le comptable
        // de la cellule qui les valide n'est jamais celui du siège qui les a
        // créées. L'identité diffère, et personne dans la cellule n'a relu.
        // C'est une limite du contrôle d'identité, pas un défaut d'ici.
        statut: StatutEcriture.VALIDEE,
        // LA PISTE MENTAIT PAR SILENCE. L'export du journal résout `valideeBy`
        // en courriel ; nul, il imprimait une colonne « Validée par » VIDE sur
        // une écriture pourtant VALIDÉE. L'AUDCIF art. 22, 1° demande que les
        // données « puissent être restituées sur papier ou sous une forme
        // directement intelligible » · une colonne vide en face d'un statut
        // validé n'est ni l'un ni l'autre.
        //
        // `createdBy` est ici l'utilisateur qui a DÉCLENCHÉ la combinaison, pas
        // un valideur au sens du double regard.
        valideeBy: createdBy,
        valideeAt: new Date(),
        lignes: {
          create: agregat.lignes.map((l) => ({
            compteId: compteParNumero.get(l.numero)!,
            debit: l.totalDebit,
            credit: l.totalCredit,
          })),
        },
      },
    });

    // 6 · Les moteurs existants produisent le classeur.
    const classeur = await this.exportService.liasseCompleteExcel(combinaisonId, exercice.id);
    return { ...classeur, nomFichier: `groupe-${classeur.nomFichier}` };
  }
}

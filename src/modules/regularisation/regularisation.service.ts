import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import {
  ClasseCompte,
  PeriodiciteAbonnement,
  Prisma,
  Referentiel,
  StatutExercice,
  TypeRegularisation,
} from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';
import {
  CreerAbonnementDto,
  CreerRegularisationDto,
  GenererAbonnementDto,
  ModifierAbonnementDto,
} from './dto/regularisation.dto';
import { ajouterMois } from '../../common/ajouter-mois';

/** Un jour, en millisecondes. */
const JOUR = 86_400_000;

/**
 * DATE DE REPRISE DE LA PART DIFFÉRÉE · voir le commentaire de `reprendre`.
 *
 * À L'OUVERTURE DE L'EXERCICE CONCERNÉ, DES DEUX CÔTÉS, SAUF LA SUBVENTION
 * PLURIANNUELLE. Le SYSCOHADA permet les deux dates et RECOMMANDE VIVEMENT
 * l'ouverture (§ 5.5 pour les charges, § 6.5 pour les produits) · une part
 * différée reprise seulement à la clôture reste au bilan douze mois de plus et
 * fausse toutes les situations intermédiaires de l'année.
 *
 * Le SYCEBNL ne fixe « la fin » que pour la subvention pluriannuelle (Partie 3
 * ch. 6, section 1 · « A la fin de chaque exercice ultérieur concerné »). Pour
 * une charge constatée d'avance, son Guide d'application extourne le 476 au
 * 01/01/N+1 (Application 10, « extourné au début de l'exercice suivant »), et
 * sa Partie 3 ch. 4, section 1, écrit que « les écritures de fin d'exercice
 * doivent être extournées au début de l'exercice suivant ». Le produit
 * constaté d'avance suit en miroir · la fiche du compte 47 les constate tous
 * deux « à la clôture de l'exercice », et aucun texte lu ne fixe sa reprise à
 * la fin ; c'est une lecture d'OmegaX, dite ici. Jusqu'au 2026-09-28, la règle
 * de la subvention était servie à tout le 476/477 d'un dossier SYCEBNL, sur un
 * renvoi à la Partie 3 ch. 6 qui ne le disait pas.
 *
 * La subvention pluriannuelle reste à la clôture des deux côtés : c'est le
 * texte SYCEBNL qui la traite nommément, et le § 5.5 du SYSCOHADA tolère
 * expressément « à la fin de n+1 ».
 */
export function dateReprise(
  type: TypeRegularisation,
  cible: { dateDebut: Date; dateFin: Date },
): Date {
  // LE RATTACHEMENT SE CONTRE-PASSE À L'OUVERTURE, DES DEUX CÔTÉS, et le
  // référentiel n'a pas son mot à dire : les deux textes emploient la même
  // phrase dans la fiche de leurs comptes 40 et 41 · « À l'ouverture de
  // l'exercice, ces écritures sont contre-passées pour permettre un meilleur
  // contrôle et une meilleure analyse des flux, ou soldées par le compte
  // fournisseur à la réception de la facture ». Ce n'est pas une reprise de
  // quote-part comme pour un 476/477 : c'est l'extourne de l'estimation, que
  // la facture réelle vient remplacer.
  // Le 476 et le 477 aussi, voir plus haut · seule la subvention
  // pluriannuelle se reprend à la fin, par le texte qui la nomme.
  if (type === TypeRegularisation.SUBVENTION_PLURIANNUELLE) return cible.dateFin;
  return cible.dateDebut;
}

/**
 * NATURE DU TIERS d'une charge à payer ou d'un produit à recevoir. Ce n'est
 * pas une préférence de présentation : le compte de rattachement en dépend
 * entièrement, et les deux plans le rangent chacun dans le compte de tiers
 * concerné, jamais dans un compte fourre-tout.
 */
export type NatureTiersRattachement = 'FOURNISSEURS' | 'CLIENTS' | 'PERSONNEL' | 'ORGANISMES_SOCIAUX' | 'ETAT';

/** Compte de report par défaut selon le type de régularisation. */
const RACINE_DIFFERE: Record<TypeRegularisation, string> = {
  [TypeRegularisation.CHARGE_CONSTATEE_AVANCE]: '476',
  [TypeRegularisation.PRODUIT_CONSTATE_AVANCE]: '477',
  [TypeRegularisation.SUBVENTION_PLURIANNUELLE]: '477',
  // Les deux valeurs de rattachement n'ont PAS de compte de report unique ·
  // leur contrepartie dépend de la nature du tiers, voir
  // `compteRattachement()`. Ces deux entrées ne servent jamais : le chemin de
  // création les écarte avant d'atteindre `trouverCompteDiffere`. Elles
  // existent parce que le Record est exhaustif, et une racine vide serait un
  // compte introuvable plutôt qu'un refus lisible.
  [TypeRegularisation.CHARGE_A_PAYER]: '',
  [TypeRegularisation.PRODUIT_A_RECEVOIR]: '',
};

/**
 * LE COMPTE DE RATTACHEMENT, PAR NATURE DE TIERS ET PAR RÉFÉRENTIEL.
 *
 * Une charge à payer ne se loge pas où l'on veut : chaque compte de tiers
 * porte son propre sous-compte de rattachement, et les deux plans les
 * énumèrent nommément (AUDCIF Titre VII, classe 4 · SYCEBNL Partie 2 ch. 3,
 * section 4). Trois d'entre eux sont identiques des deux côtés (4286/4287
 * personnel, 4386/4387 organismes sociaux, 4486/4487 État), et deux ne le
 * sont pas :
 *
 *  · 408 « Fournisseurs, factures non parvenues » · le SYSCOHADA porte en
 *    plus un 4082 « Fournisseurs groupe » que le SYCEBNL n'a pas. Le
 *    rattachement ordinaire va au 4081 des deux côtés ;
 *
 *  · 418 · ET C'EST LE PIÈGE DE CE MODULE. Le SYSCOHADA écrit « 4181 Clients,
 *    factures à établir ». Le SYCEBNL, lui, réserve le 4181 aux « Adhérents,
 *    APPELS DE FONDS à établir » et met les factures à établir au 4182
 *    (« Clients-usagers, factures à établir »). Un produit à recevoir sur un
 *    client rangé au 4181 dans une association ne serait donc pas une facture
 *    à établir mais un appel de cotisations · le compte existe, la balance
 *    boucle, et la Note annexe publie une créance sur des adhérents qui ne
 *    doivent rien. C'est la même signature de défaut que le 192 du registre
 *    des provisions, au même endroit du plan.
 */
const RATTACHEMENT: Record<
  NatureTiersRattachement,
  { charge: string; produit: string; libelle: string }
> = {
  FOURNISSEURS: { charge: '4081', produit: '', libelle: 'Fournisseurs' },
  CLIENTS: { charge: '', produit: '4181', libelle: 'Clients, adhérents et usagers' },
  PERSONNEL: { charge: '4286', produit: '4287', libelle: 'Personnel' },
  ORGANISMES_SOCIAUX: { charge: '4386', produit: '4387', libelle: 'Organismes sociaux' },
  ETAT: { charge: '4486', produit: '4487', libelle: 'État et collectivités publiques' },
};

/**
 * RÉGULARISATION DES CHARGES ET DES PRODUITS, ET ÉCRITURES D'ABONNEMENT.
 *
 * ## « Abonnement » désigne ici DEUX choses, et ce module n'en fait qu'une
 *
 * Le mot recouvre deux techniques distinctes, et les confondre ferait croire
 * à une conformité qui n'existe pas.
 *
 *  1. L'ÉCRITURE D'ABONNEMENT au sens des progiciels · un MODÈLE d'écriture
 *     récurrente, engendré à chaque échéance d'un contrat (loyer, prime,
 *     forfait). C'est CE module, et c'est un confort de saisie.
 *
 *  2. L'ABONNEMENT DES CHARGES ET DES PRODUITS au sens de l'AUDCIF, Titre
 *     VIII ch. 24 · une technique de RÉPARTITION qui étale une charge ou un
 *     produit annuel connu d'avance « par fractions égales entre les périodes
 *     comptables de l'exercice », pour que les situations intermédiaires
 *     (mensuelles, trimestrielles) soient justes. Elle passe par le compte
 *     474 « Comptes de répartition périodique des charges et des produits »,
 *     subdivisé en 4746 pour les charges et 4747 pour les produits : à la fin
 *     de chaque période, le 4746 est CRÉDITÉ de la fraction abonnée par le
 *     débit du compte de charge ; à réception de la facture réelle, le 4746
 *     est DÉBITÉ par le crédit du tiers. Le 4747 fonctionne symétriquement.
 *
 * CE MODULE NE FAIT PAS LE SECOND. Les comptes 4746 et 4747 sont semés dans
 * les deux plans, mais aucun code ne les mouvemente · qui voudrait la
 * technique du ch. 24 doit passer ses écritures à la main.
 *
 * Ce n'est pas un manquement : le texte écrit que le Système comptable OHADA
 * « préconise LA POSSIBILITÉ » d'y recourir, et la réserve aux entités qui
 * établissent des comptes de résultat périodiques. C'est une option offerte,
 * pas une obligation. Mais le nom partagé est un piège, d'où ce paragraphe.
 * Relevé dans docs/releve-de-manques-referentiels.md, passe 10.
 *
 * ## Ce que le SYCEBNL dit, et qui diffère de la pratique française
 *
 * Le cas de référence pour une EBNL est la subvention pluriannuelle, traitée
 * nommément par la Partie 3 ch. 6, section 1 : « Lorsqu'une convention stipule
 * que la subvention est accordée pour toute la durée du projet qui s'étalera
 * sur plusieurs exercices, à la clôture du premier exercice, il convient
 * d'extourner la part de subvention se rapportant aux exercices ultérieurs au
 * crédit d'un compte 477 Produits constatés d'avance par le débit du compte 71
 * Subventions d'exploitation. A la fin de chaque exercice ultérieur concerné,
 * la quote-part de la subvention d'exploitation y afférant est reprise au
 * débit du compte 477 par le crédit du compte 71. »
 *
 * Deux points comptent, et le second est celui qu'on rate facilement :
 *
 *  - le compte de report est le 477, pas un compte d'attente · le texte
 *    interdit d'ailleurs formellement l'usage d'un compte d'attente
 *    (Partie 2 ch. 3, compte 47) ;
 *  - la reprise se fait À LA FIN de l'exercice concerné. Un progiciel
 *    français contre-passerait à l'OUVERTURE de l'exercice suivant. Ce n'est
 *    pas ce que dit le texte, et le résultat intermédiaire ne serait pas le
 *    même en cours d'année.
 *
 * ## Le prorata
 *
 * La part différée se calcule au prorata des JOURS qui débordent l'exercice,
 * et non des mois : une convention qui court du 15 septembre au 14 septembre
 * suivant ne se découpe pas en mois entiers. L'utilisateur peut imposer un
 * montant s'il a une clé de répartition contractuelle.
 */
@Injectable()
export class RegularisationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritureService: EcritureService,
  ) {}

  // ==========================================================================
  // Régularisation
  // ==========================================================================

  /**
   * Part d'un montant qui appartient aux exercices ultérieurs, au prorata des
   * jours. Retourne 0 si la période ne déborde pas la clôture, et le montant
   * entier si elle commence après.
   */
  static prorataDiffere(
    montantTotal: number,
    periodeDebut: Date,
    periodeFin: Date,
    finExercice: Date,
  ): number {
    const debut = periodeDebut.getTime();
    const fin = periodeFin.getTime();
    if (fin <= debut) return 0;
    const cloture = finExercice.getTime();
    if (cloture >= fin) return 0;
    if (cloture < debut) return Math.round(montantTotal * 100) / 100;
    // Bornes incluses des deux côtés : une période du 1er au 31 décembre
    // couvre 31 jours, pas 30.
    const totalJours = (fin - debut) / JOUR + 1;
    const joursApres = (fin - cloture) / JOUR;
    return Math.round((montantTotal * joursApres) / totalJours * 100) / 100;
  }

  private async trouverCompteDiffere(tenantId: string, type: TypeRegularisation, compteId?: string) {
    if (compteId) {
      const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
      if (!compte) throw new BadRequestException('Compte de report introuvable pour ce dossier');
      return compte;
    }
    const racine = RACINE_DIFFERE[type];
    const compte = await this.prisma.compte.findFirst({
      where: { tenantId, numero: { startsWith: racine }, typeCompte: 'DETAIL', estActif: true },
      orderBy: { numero: 'asc' },
    });
    if (!compte) {
      throw new BadRequestException(
        `Aucun compte ${racine} dans le plan de ce dossier (${
          racine === '476' ? "charges constatées d'avance" : "produits constatés d'avance"
        }). Créez-le, ou indiquez le compte de report.`,
      );
    }
    return compte;
  }

  async lister(tenantId: string, exerciceId: string) {
    return this.prisma.regularisation.findMany({
      where: { tenantId, exerciceId },
      orderBy: { createdAt: 'desc' },
      include: {
        compteChargeProduit: { select: { numero: true, intitule: true } },
        compteDiffere: { select: { numero: true, intitule: true } },
        ecritureConstatation: { select: { id: true, numeroPiece: true, date: true } },
        ecritureReprise: { select: { id: true, numeroPiece: true, date: true } },
      },
    });
  }

  /**
   * Résout le compte de rattachement dans le plan du dossier · le NUMÉRO vient
   * de `compteRattachement`, jamais du client. Laisser choisir le compte
   * rendrait le refus décoratif : il suffirait de désigner un 4487 pour loger
   * une charge à payer parmi les produits à recevoir.
   */
  private async trouverCompteRattachement(
    tenantId: string,
    dto: CreerRegularisationDto,
  ) {
    if (!dto.natureTiers) {
      throw new BadRequestException(
        "La nature du tiers est obligatoire pour une charge à payer ou un produit à recevoir : c'est elle qui " +
          'décide du compte de rattachement. Les deux plans les énumèrent nommément · 408 fournisseurs, 418 ' +
          "clients et adhérents, 4286/4287 personnel, 4386/4387 organismes sociaux, 4486/4487 État. Il n'y a " +
          'aucun compte fourre-tout.',
      );
    }
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { referentiel: true },
    });
    if (!tenant) throw new BadRequestException('Dossier introuvable');

    const { racine } = RegularisationService.compteRattachement(tenant.referentiel, dto.natureTiers, dto.type);
    const compte = await this.prisma.compte.findFirst({
      where: { tenantId, numero: { startsWith: racine } },
      orderBy: { numero: 'asc' },
    });
    if (!compte) {
      throw new BadRequestException(
        `Le compte de rattachement ${racine} n'existe pas dans le plan de ce dossier. Il est prévu par le ` +
          "référentiel : le créer plutôt que d'en choisir un autre.",
      );
    }
    return compte;
  }

  /**
   * LE COMPTE DE RATTACHEMENT, résolu par référentiel · c'est ici que vit le
   * seul écart de nomenclature entre les deux plans sur cette matière.
   *
   * SYSCOHADA · « 418 Clients, produits à recevoir (4181 factures à établir ·
   * 4186 intérêts courus) ».
   * SYCEBNL · « 418 Adhérents, clients, produits à recevoir (4181 Adhérents
   * Appels de fonds à établir, 4182 Clients-usagers, factures à établir,
   * 4186 Adhérents, clients-usagers, intérêts courus) ».
   *
   * Le 4181 ne veut donc PAS dire la même chose des deux côtés, et c'est
   * précisément le compte qu'un produit à recevoir sur un client irait
   * chercher. Dans une association, il inscrirait la facture à établir parmi
   * les appels de cotisations : le compte existe, la balance boucle, et rien
   * ne le dirait.
   */
  static compteRattachement(
    referentiel: Referentiel,
    nature: NatureTiersRattachement,
    type: TypeRegularisation,
  ): { racine: string; sens: 'charge' | 'produit' } {
    const estCharge = type === TypeRegularisation.CHARGE_A_PAYER;
    const table = RATTACHEMENT[nature];
    let racine = estCharge ? table.charge : table.produit;

    // La seule substitution du tableau, et elle ne vaut que dans un sens.
    if (!estCharge && nature === 'CLIENTS' && referentiel === Referentiel.SYCEBNL) racine = '4182';

    if (!racine) {
      throw new BadRequestException(
        estCharge
          ? `Une charge à payer ne se rattache pas au compte « ${table.libelle} » · le plan n'y prévoit aucun ` +
            "sous-compte de charges à payer. Une somme due à un client est une dette envers un client (419, " +
            'avances reçues, ou 4198 avoirs à accorder), pas une charge à payer.'
          : `Un produit à recevoir ne se rattache pas au compte « ${table.libelle} » · le plan n'y prévoit aucun ` +
            "sous-compte de produits à recevoir. Une somme à recevoir d'un fournisseur est une créance sur " +
            'fournisseur (409, avances versées, ou 4098 avoirs à obtenir), pas un produit à recevoir.',
      );
    }
    return { racine, sens: estCharge ? 'charge' : 'produit' };
  }

  /**
   * QUEL CÔTÉ REÇOIT LE COMPTE DE GESTION · rend `true` quand l'écriture de
   * constatation DÉBITE le compte de charge ou de produit.
   *
   * Le sens S'INVERSE entre l'étalement et le rattachement, alors que les deux
   * portent le même mot :
   *
   *  · CHARGE CONSTATÉE D'AVANCE · la charge est déjà au débit du 6x et il
   *    faut l'en RETIRER · débit 476, crédit 6x ;
   *  · CHARGE À PAYER · la charge n'est nulle part et il faut l'INSCRIRE ·
   *    débit 6x, crédit 408 ;
   *  · PRODUIT CONSTATÉ D'AVANCE · le produit est déjà au crédit du 7x et il
   *    faut l'en retirer · débit 7x, crédit 477 ;
   *  · PRODUIT À RECEVOIR · le produit n'est nulle part · débit 418,
   *    crédit 7x.
   *
   * Servir le sens de l'un pour l'autre CRÉDITERAIT le compte de charge d'une
   * charge qui n'y a jamais été portée : le résultat serait amélioré du
   * montant au lieu d'en être grevé, soit deux fois le montant d'erreur. Et
   * l'écriture s'équilibre, et la balance boucle.
   */
  static debiteLeCompteDeGestion(type: TypeRegularisation): boolean {
    return (
      type === TypeRegularisation.CHARGE_A_PAYER ||
      type === TypeRegularisation.PRODUIT_CONSTATE_AVANCE ||
      type === TypeRegularisation.SUBVENTION_PLURIANNUELLE
    );
  }

  /**
   * LE RATTACHEMENT N'EST PAS UN ÉTALEMENT, et c'est tout ce qui sépare ces
   * deux valeurs des trois autres.
   *
   * Une charge constatée d'avance est DÉJÀ enregistrée et déborde sur N+1 :
   * on en retire la part qui déborde, calculée au prorata des jours. Une
   * charge à payer n'est PAS enregistrée et appartient ENTIÈREMENT à N : le
   * service fait, la facture n'est pas venue, et la charge est de cet
   * exercice-là tout entière. Rien ne se proratise.
   *
   * Appliquer le prorata à une charge à payer inscrirait au résultat la seule
   * fraction qui déborde la clôture · c'est-à-dire, le plus souvent, ZÉRO,
   * puisque la période d'une charge à payer se termine avant la clôture.
   * L'écriture s'équilibrerait, la balance boucherait, et la charge aurait
   * disparu du résultat de l'exercice qui la supporte.
   */
  static montantRattache(type: TypeRegularisation, montantTotal: number): number {
    return Math.round(montantTotal * 100) / 100;
  }

  /**
   * Calcule sans rien enregistrer · alimente l'aperçu de l'écran.
   *
   * LE MÊME CALCUL QUE `creer` (audit final F67) · la simulation appliquait le
   * prorata à tout type, rattachement compris. Une charge à payer du dernier
   * trimestre s'y affichait « différée » pour zéro, le bouton restait
   * désactivé, et le rattachement décrit comme livré ne s'accomplissait pas.
   * Le rattachement rend le montant ENTIER, avec le compte de tiers que le
   * serveur retiendra.
   */
  async simuler(tenantId: string, dto: CreerRegularisationDto) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce dossier');
    const periodeDebut = new Date(dto.periodeDebut);
    const periodeFin = new Date(dto.periodeFin);
    if (periodeFin < periodeDebut) {
      throw new BadRequestException('La fin de la période précède son début.');
    }
    const commun = {
      montantTotal: dto.montantTotal,
      finExercice: exercice.dateFin.toISOString().slice(0, 10),
      joursTotal: Math.round((periodeFin.getTime() - periodeDebut.getTime()) / JOUR) + 1,
      joursApresCloture: Math.max(0, Math.round((periodeFin.getTime() - exercice.dateFin.getTime()) / JOUR)),
    };
    if (RegularisationService.estRattachement(dto.type)) {
      const compte = await this.trouverCompteRattachement(tenantId, dto);
      const montant = RegularisationService.montantRattache(dto.type, dto.montantTotal);
      return {
        ...commun,
        rattachement: true,
        // Le montant passé est la charge entière · rien ne déborde, rien
        // n'est différé au sens du 476/477.
        montantDiffere: montant,
        montantExercice: montant,
        compteRattachement: { numero: compte.numero, intitule: compte.intitule },
      };
    }
    const montantDiffere =
      dto.montantDiffere ??
      RegularisationService.prorataDiffere(dto.montantTotal, periodeDebut, periodeFin, exercice.dateFin);
    return {
      ...commun,
      rattachement: false,
      montantDiffere,
      montantExercice: Math.round((dto.montantTotal - montantDiffere) * 100) / 100,
      compteRattachement: null,
    };
  }

  /** Charge à payer ou produit à recevoir · la règle que `simuler` et `creer` lisent. */
  /**
   * LE COMPTE DE LA TVA D'UN RATTACHEMENT · SYSCOHADA seul, et pour deux
   * natures seulement (passe R1, B4).
   *
   * AUDCIF, Titre VII, compte 40 · « utiliser le compte 408 […] en
   * contrepartie des comptes de la classe 6 et du compte 4455 si la TVA est
   * récupérable » ; compte 41 · « utiliser le compte 418 […] en contrepartie
   * des comptes de la classe 7 et du compte 4435 si le bien entre dans le
   * champ d'application de la TVA ». Sans place pour elle, le comptable
   * saisissait un TTC en charge (charge surévaluée de la taxe) ou un HT au 408
   * (dette sous-évaluée), et l'extourne reproduisait le défaut.
   *
   * La TVA est DÉCLARÉE par le comptable, jamais posée d'office · « si la TVA
   * est récupérable », « si le bien entre dans le champ » sont des
   * conditions que seul le dossier connaît. La ligne ne porte aucun taux ·
   * son sort dans la déclaration de TVA relève du module fiscal et n'est pas
   * supposé ici.
   *
   * Le SYCEBNL écrit la même règle à ses fiches 40 et 41, mais son plan
   * n'ouvre ni 4435 ni 4455 (443 et 445 non subdivisés) · rien n'est
   * transposé, un compte absent de son plan serait refusé à la saisie.
   */
  static compteTvaRattachement(
    referentiel: Referentiel,
    nature: NatureTiersRattachement | undefined,
    type: TypeRegularisation,
  ): string | null {
    if (referentiel !== Referentiel.SYSCOHADA) return null;
    if (type === TypeRegularisation.CHARGE_A_PAYER && nature === 'FOURNISSEURS') return '4455';
    if (type === TypeRegularisation.PRODUIT_A_RECEVOIR && nature === 'CLIENTS') return '4435';
    return null;
  }

  static estRattachement(type: TypeRegularisation): boolean {
    return type === TypeRegularisation.CHARGE_A_PAYER || type === TypeRegularisation.PRODUIT_A_RECEVOIR;
  }

  /**
   * Enregistre la régularisation ET passe son écriture de constatation, dans
   * la même opération : une régularisation sans écriture ne régularise rien.
   */
  async creer(tenantId: string, createdBy: string, dto: CreerRegularisationDto) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce dossier');
    if (exercice.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException("L'exercice est clôturé : aucune régularisation ne peut plus y être passée.");
    }

    const compteChargeProduit = await this.prisma.compte.findFirst({
      where: { id: dto.compteChargeProduitId, tenantId },
    });
    if (!compteChargeProduit) throw new BadRequestException('Compte de charge ou de produit introuvable');

    const estRattachement = RegularisationService.estRattachement(dto.type);
    const estCharge =
      dto.type === TypeRegularisation.CHARGE_CONSTATEE_AVANCE || dto.type === TypeRegularisation.CHARGE_A_PAYER;
    const classeAttendue = estCharge ? ClasseCompte.CLASSE_6 : ClasseCompte.CLASSE_7;
    if (compteChargeProduit.classe !== classeAttendue) {
      throw new BadRequestException(
        `Le compte ${compteChargeProduit.numero} est de classe ${compteChargeProduit.classe.replace('CLASSE_', '')} ; ` +
          `une ${estCharge ? 'charge constatée d\'avance' : 'régularisation de produit'} porte sur un compte de classe ` +
          `${estCharge ? '6' : '7'}.`,
      );
    }

    const periodeDebut = new Date(dto.periodeDebut);
    const periodeFin = new Date(dto.periodeFin);

    // DEUX CHEMINS, ET ILS NE SE CROISENT PAS. Le rattachement (charge à
    // payer, produit à recevoir) n'a ni compte 476/477 ni prorata · sa
    // contrepartie est le sous-compte du tiers, et le montant est celui de la
    // charge entière. L'étalement (476/477) garde son calcul au prorata.
    const compteDiffere = estRattachement
      ? await this.trouverCompteRattachement(tenantId, dto)
      : await this.trouverCompteDiffere(tenantId, dto.type, dto.compteDifferId);

    const montantDiffere = estRattachement
      ? RegularisationService.montantRattache(dto.type, dto.montantTotal)
      : dto.montantDiffere ??
        RegularisationService.prorataDiffere(dto.montantTotal, periodeDebut, periodeFin, exercice.dateFin);

    // LE REFUS DU PRORATA · un `montantDiffere` reçu sur un rattachement
    // voudrait dire qu'une part de la charge appartient à un autre exercice.
    // C'est le contraire de ce qu'est une charge à payer : le service est
    // fait, seule la facture manque, et la charge est de CET exercice tout
    // entière. Passée au prorata, elle serait réduite à la fraction qui
    // déborde la clôture · le plus souvent zéro, puisque la période d'une
    // charge à payer se termine AVANT elle. L'écriture s'équilibrerait, la
    // balance boucherait, et la charge aurait disparu du résultat.
    if (estRattachement && dto.montantDiffere !== undefined && Math.abs(dto.montantDiffere - dto.montantTotal) > 0.005) {
      throw new BadRequestException(
        "Une charge à payer ou un produit à recevoir ne se proratise pas · la charge n'est pas encore " +
          "comptabilisée et appartient ENTIÈREMENT à cet exercice, seule la pièce manque. Le montant rattaché " +
          'est le montant total. Si une part de la dépense concerne réellement un autre exercice, ce sont DEUX ' +
          "opérations : la charge à payer de l'exercice, et une charge constatée d'avance (476) pour le reste.",
      );
    }

    if (!estRattachement && montantDiffere <= 0) {
      throw new BadRequestException(
        "La période ne déborde pas la clôture de l'exercice : il n'y a rien à différer.",
      );
    }
    if (montantDiffere > dto.montantTotal + 0.005) {
      throw new BadRequestException('La part différée dépasse le montant total.');
    }

    // LA TVA DU RATTACHEMENT (`compteTvaRattachement`) · refusée là où la
    // fiche ne la prévoit pas, plutôt qu'ignorée, qui passerait une écriture
    // différente de celle que le comptable a saisie.
    const montantTva = dto.montantTva ?? 0;
    let compteTva: { id: string } | null = null;
    if (montantTva > 0) {
      const dossier = await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { referentiel: true } });
      if (!dossier) throw new BadRequestException('Dossier introuvable');
      const racineTva = RegularisationService.compteTvaRattachement(dossier.referentiel, dto.natureTiers, dto.type);
      if (!racineTva) {
        throw new BadRequestException(
          "La TVA ne s'ajoute qu'à une charge à payer sur un fournisseur (4455) ou à un produit à recevoir sur un " +
            'client (4435), au SYSCOHADA · AUDCIF, Titre VII, fiches des comptes 40 et 41.',
        );
      }
      compteTva = await this.prisma.compte.findFirst({
        where: { tenantId, numero: { startsWith: racineTva } },
        orderBy: { numero: 'asc' },
        select: { id: true },
      });
      if (!compteTva) {
        throw new BadRequestException(`Le compte ${racineTva} n'existe pas dans le plan de ce dossier.`);
      }
    }
    const montantTiers = Math.round((montantDiffere + montantTva) * 100) / 100;

    const journal = await this.journalAccueil(tenantId, dto.journalId);

    // SENS DE L'ÉCRITURE · et il S'INVERSE entre l'étalement et le
    // rattachement, alors que les deux portent le mot « charge ».
    //
    //  · CHARGE CONSTATÉE D'AVANCE · la charge est déjà au débit du 6x et il
    //    faut l'en RETIRER : débit 476, crédit 6x ;
    //  · CHARGE À PAYER · la charge n'est nulle part et il faut l'INSCRIRE :
    //    débit 6x, crédit 408/4286/4386/4486.
    //
    // Les servir l'un pour l'autre créditerait le compte de charge d'une
    // charge qui n'y a jamais été portée · le résultat serait amélioré du
    // montant au lieu d'être grevé, l'écriture s'équilibrerait, et la balance
    // boucherait. Deux fois le montant d'erreur, dans le bon sens pour
    // personne.
    const sensEntrant = RegularisationService.debiteLeCompteDeGestion(dto.type);
    // Avec la TVA, le tiers porte le toutes taxes, la taxe sa propre ligne,
    // débits d'abord puis crédits, la taxe après le compte de nature.
    const ligneTva = compteTva ? { compteId: compteTva.id, montant: montantTva } : null;
    const lignes = sensEntrant
      ? [
          { compteId: compteChargeProduit.id, debit: montantDiffere, libelle: dto.libelle },
          ...(ligneTva ? [{ compteId: ligneTva.compteId, debit: ligneTva.montant, libelle: dto.libelle }] : []),
          { compteId: compteDiffere.id, credit: montantTiers, libelle: dto.libelle },
        ]
      : [
          { compteId: compteDiffere.id, debit: montantTiers, libelle: dto.libelle },
          { compteId: compteChargeProduit.id, credit: montantDiffere, libelle: dto.libelle },
          ...(ligneTva ? [{ compteId: ligneTva.compteId, credit: ligneTva.montant, libelle: dto.libelle }] : []),
        ];

    const ecriture = await this.ecritureService.creer(tenantId, createdBy, {
      exerciceId: dto.exerciceId,
      journalId: journal.id,
      date: exercice.dateFin.toISOString().slice(0, 10),
      libelle: `Régularisation · ${dto.libelle}`,
      reference: 'REGUL',
      lignes,
    });

    return this.prisma.regularisation.create({
      data: {
        tenantId,
        exerciceId: dto.exerciceId,
        type: dto.type,
        libelle: dto.libelle,
        compteChargeProduitId: compteChargeProduit.id,
        compteDifferId: compteDiffere.id,
        montantTotal: new Prisma.Decimal(dto.montantTotal),
        periodeDebut,
        periodeFin,
        montantDiffere: new Prisma.Decimal(montantDiffere),
        ecritureConstatationId: ecriture.id,
        createdBy,
      },
      include: {
        compteChargeProduit: { select: { numero: true, intitule: true } },
        compteDiffere: { select: { numero: true, intitule: true } },
      },
    });
  }

  /**
   * L'inverse exact d'une écriture, ligne à ligne · débits et crédits
   * échangés, débits d'abord. Aucun montant n'est recalculé.
   */
  static contrePassation(
    lignes: Array<{ compteId: string; debit: unknown; credit: unknown }>,
    libelle: string,
  ): Array<{ compteId: string; debit?: number; credit?: number; libelle: string }> {
    const inversees = lignes.map((l) => {
      const debit = Number(l.debit ?? 0);
      const credit = Number(l.credit ?? 0);
      return credit > 0
        ? { compteId: l.compteId, debit: credit, libelle }
        : { compteId: l.compteId, credit: debit, libelle };
    });
    return [...inversees.filter((l) => l.debit !== undefined), ...inversees.filter((l) => l.debit === undefined)];
  }

  /** Un exercice commence après celui de la constatation · la règle de la reprise. */
  static exercicePosterieur(cible: { dateDebut: Date }, constatation: { dateDebut: Date }): boolean {
    return cible.dateDebut.getTime() > constatation.dateDebut.getTime();
  }

  /**
   * Reprend la part différée sur l'exercice qu'elle concerne, à l'ouverture
   * de cet exercice, sauf la subvention pluriannuelle, reprise à sa fin
   * (`dateReprise`, où les textes sont cités).
   *
   *  · SYCEBNL, Partie 3 ch. 6, section 1 · « A la fin de chaque exercice
   *    ultérieur concerné, la quote-part de la subvention d'exploitation y
   *    afférant est reprise au débit du compte 477 » · la subvention seule ;
   *    le Guide d'application extourne le 476 au début de l'exercice suivant
   *    (Application 10) ;
   *  · SYSCOHADA, § 5.5 et 6.5 · les deux dates sont permises, « au début
   *    (immédiate) ou à la fin de n+1 », mais la CONTRE-PASSATION À
   *    L'OUVERTURE est « vivement recommandée ». Reprise à la clôture, la part
   *    différée reste au bilan douze mois de plus et fausse toutes les
   *    situations intermédiaires de l'année.
   */
  async reprendre(tenantId: string, createdBy: string, regularisationId: string, exerciceCibleId: string) {
    const regul = await this.prisma.regularisation.findFirst({
      where: { id: regularisationId, tenantId },
      include: { compteChargeProduit: true, compteDiffere: true, ecritureConstatation: true },
    });
    if (!regul) throw new NotFoundException('Régularisation introuvable pour ce dossier');
    if (regul.ecritureRepriseId) {
      throw new ConflictException('Cette régularisation a déjà été reprise.');
    }
    if (!regul.ecritureConstatationId) {
      throw new BadRequestException("La constatation n'a pas été passée : il n'y a rien à reprendre.");
    }

    const cible = await this.prisma.exercice.findFirst({ where: { id: exerciceCibleId, tenantId } });
    if (!cible) throw new BadRequestException('Exercice de reprise introuvable pour ce dossier');
    if (cible.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException("L'exercice de reprise est clôturé.");
    }
    // UN EXERCICE POSTÉRIEUR, jamais seulement « un autre » (audit final F79) ·
    // seul l'exercice de la constatation était refusé, et une reprise sur un
    // exercice ANTÉRIEUR encore ouvert s'y passait · la charge sortait d'un
    // exercice qui ne l'avait jamais portée, chaque écriture équilibrée.
    const constatation = await this.prisma.exercice.findFirst({
      where: { id: regul.exerciceId, tenantId },
      select: { dateDebut: true },
    });
    if (!constatation) throw new NotFoundException('Exercice de la constatation introuvable.');
    if (!RegularisationService.exercicePosterieur(cible, constatation)) {
      throw new BadRequestException(
        "La reprise se fait sur un exercice ULTÉRIEUR à celui de la constatation, jamais sur le même ni sur un antérieur.",
      );
    }

    const journal = await this.journalAccueil(tenantId);
    const montant = Number(regul.montantDiffere);

    // L'INVERSE EXACT DE LA CONSTATATION, lu sur la MÊME règle
    // (`debiteLeCompteDeGestion`), jamais sur un test à part (audit final
    // F66). Le sens se choisissait sur « est-ce une charge constatée
    // d'avance » · le produit à recevoir tombait dans l'autre branche, et sa
    // reprise REPRODUISAIT la constatation (D 418 / C 7x) au lieu de
    // l'extourner. La créance doublait, le produit était compté deux fois sur
    // deux exercices, et chaque écriture s'équilibrait.
    const constatationDebiteLaGestion = RegularisationService.debiteLeCompteDeGestion(regul.type);
    // UN RATTACHEMENT SE CONTRE-PASSE LIGNE À LIGNE, sur l'écriture de
    // constatation elle-même (fiches des comptes 40 et 41 · « À l'ouverture
    // de l'exercice, ces écritures sont contre-passées »). Elle peut porter une
    // ligne de TVA (4455 ou 4435) que la régularisation ne garde pas à part ·
    // la reprendre depuis le seul montant laisserait la taxe et le toutes
    // taxes du tiers au bilan de l'exercice suivant.
    const lignesConstatation = RegularisationService.estRattachement(regul.type)
      ? (
          await this.prisma.ecriture.findFirst({
            where: { id: regul.ecritureConstatationId, tenantId },
            select: { lignes: { select: { compteId: true, debit: true, credit: true } } },
          })
        )?.lignes ?? null
      : null;
    const lignes = lignesConstatation
      ? RegularisationService.contrePassation(lignesConstatation, regul.libelle)
      : constatationDebiteLaGestion
      ? [
          { compteId: regul.compteDifferId, debit: montant, libelle: regul.libelle },
          { compteId: regul.compteChargeProduitId, credit: montant, libelle: regul.libelle },
        ]
      : [
          { compteId: regul.compteChargeProduitId, debit: montant, libelle: regul.libelle },
          { compteId: regul.compteDifferId, credit: montant, libelle: regul.libelle },
        ];

    const ecriture = await this.ecritureService.creer(tenantId, createdBy, {
      exerciceId: cible.id,
      journalId: journal.id,
      date: dateReprise(regul.type, cible).toISOString().slice(0, 10),
      libelle: `Reprise de régularisation · ${regul.libelle}`,
      reference: 'REGUL',
      lignes,
    });

    // LE LIEN SE POSE SUR UNE RÉGULARISATION ENCORE LIBRE (audit du serveur
    // du 2026-09-27, F10) · deux clics simultanés passaient tous deux le
    // test ci-dessus ; le second écrasait le lien et la première reprise
    // restait au journal, orpheline. Le perdant retire l'écriture qu'il
    // vient de créer, lignes puis tête.
    const { count } = await this.prisma.regularisation.updateMany({
      where: { id: regularisationId, tenantId, ecritureRepriseId: null },
      data: { ecritureRepriseId: ecriture.id },
    });
    if (count === 0) {
      await this.ecritureService.retirerCompensation(tenantId, ecriture.id);
      throw new BadRequestException('Cette régularisation vient d’être reprise par une autre demande · rien n’a été passé.');
    }
    return this.prisma.regularisation.findFirstOrThrow({
      where: { id: regularisationId, tenantId },
      include: {
        compteChargeProduit: { select: { numero: true, intitule: true } },
        compteDiffere: { select: { numero: true, intitule: true } },
        ecritureReprise: { select: { id: true, numeroPiece: true, date: true } },
      },
    });
  }

  // ==========================================================================
  // Abonnement
  // ==========================================================================

  /**
   * Échéances d'un contrat, du début à la fin, à la périodicité retenue.
   * CHAQUE ÉCHÉANCE SE CALCULE DEPUIS LE DÉBUT ET SON RANG, jamais depuis la
   * précédente (audit final F8) · le 31 janvier plus un mois tombait au
   * 3 mars, février n'avait pas d'échéance et le décalage se propageait à
   * toute la suite.
   */
  static echeancesDe(dateDebut: Date, dateFin: Date, periodicite: PeriodiciteAbonnement): Date[] {
    const mois = {
      [PeriodiciteAbonnement.MENSUELLE]: 1,
      [PeriodiciteAbonnement.TRIMESTRIELLE]: 3,
      [PeriodiciteAbonnement.SEMESTRIELLE]: 6,
      [PeriodiciteAbonnement.ANNUELLE]: 12,
    }[periodicite];
    const dates: Date[] = [];
    // Garde-fou : un contrat mensuel de vingt ans ferait 240 échéances, ce qui
    // reste raisonnable ; au-delà de 600 c'est une erreur de saisie de dates.
    for (let rang = 0; dates.length < 600; rang++) {
      const echeance = ajouterMois(dateDebut, rang * mois);
      if (echeance > dateFin) break;
      dates.push(echeance);
    }
    return dates;
  }

  async listerAbonnements(tenantId: string) {
    return this.prisma.modeleAbonnement.findMany({
      where: { tenantId },
      orderBy: { code: 'asc' },
      include: {
        journal: { select: { code: true, intitule: true } },
        compteDebit: { select: { numero: true, intitule: true } },
        compteCredit: { select: { numero: true, intitule: true } },
        echeances: { orderBy: { date: 'asc' }, select: { id: true, date: true, montant: true, ecritureId: true } },
      },
    });
  }

  async creerAbonnement(tenantId: string, createdBy: string, dto: CreerAbonnementDto) {
    const existant = await this.prisma.modeleAbonnement.findFirst({ where: { tenantId, code: dto.code } });
    if (existant) throw new ConflictException(`Un abonnement porte déjà le code ${dto.code}`);

    const dateDebut = new Date(dto.dateDebut);
    const dateFin = new Date(dto.dateFin);
    if (dateFin < dateDebut) throw new BadRequestException('La fin du contrat précède son début.');

    const [journal, debit, credit, tenant] = await Promise.all([
      this.prisma.journal.findFirst({ where: { id: dto.journalId, tenantId } }),
      this.prisma.compte.findFirst({ where: { id: dto.compteDebitId, tenantId } }),
      this.prisma.compte.findFirst({ where: { id: dto.compteCreditId, tenantId } }),
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { referentiel: true } }),
    ]);
    if (!journal) throw new BadRequestException('Journal introuvable pour ce dossier');
    if (!debit || !credit) throw new BadRequestException('Compte introuvable pour ce dossier');
    if (debit.id === credit.id) {
      throw new BadRequestException("Le compte débité et le compte crédité ne peuvent pas être le même.");
    }

    /*
     * LE PASSAGE PAR LE TIERS · refusé ici, pas seulement signalé.
     *
     * Ailleurs dans le logiciel, une charge soldée directement en trésorerie
     * n'est qu'un AVERTISSEMENT (ControlesService, contrôle CHARGE_SANS_TIERS)
     * : une dépense de caisse de 2 000 francs contre un reçu reste une
     * écriture qu'un comptable peut vouloir passer, et c'est à lui de
     * trancher. Un abonnement, non.
     *
     * Un abonnement est un CONTRAT RÉCURRENT : un loyer, une prime
     * d'assurance, un forfait internet. Par construction, il a une
     * contrepartie nommée, connue d'avance, qui reviendra à chaque échéance.
     * Enregistrer douze fois dans l'année « 6221 Loyers par le crédit de 5211
     * Banque » sans jamais dire à qui, c'est fabriquer douze écritures dont
     * aucune n'est justifiable, et se priver du relevé du bailleur au moment
     * de la circularisation.
     *
     * Le schéma attendu est celui du référentiel (SYCEBNL, Partie 3, ch. 3) :
     * § 2.2, la charge par le crédit d'un compte de tiers ; § 2.4, le tiers
     * par le crédit de la trésorerie. Le modèle d'abonnement porte la
     * PREMIÈRE écriture · le règlement se saisit ensuite, à sa date réelle,
     * qui n'est presque jamais celle de l'échéance.
     */
    const estCharge = debit.numero.startsWith('6') || debit.numero.startsWith('8');
    const estTresorerie = credit.numero.startsWith('5') && !credit.numero.startsWith('59');
    if (estCharge && estTresorerie) {
      throw new BadRequestException(
        `Un abonnement ne peut pas solder une charge (${debit.numero}) directement sur la trésorerie ` +
          `(${credit.numero}). Une charge se constate d'abord contre le TIERS à qui elle est due : créditez le ` +
          `compte fournisseur (40), personnel (42), organismes sociaux (43) ou État (44) concerné. Le règlement ` +
          `se saisira ensuite, à sa date réelle, en débitant ce tiers par le crédit de la trésorerie. ` +
          (tenant.referentiel === Referentiel.SYSCOHADA
            ? `AUDCIF, art. 17, 3° et 5° (justification et imputation des écritures) · Titre VII, COMPTE 40 ` +
              `« Fournisseurs et comptes rattachés », auquel se rattachent toutes les opérations le concernant.`
            : `SYCEBNL, Partie 3, ch. 3, § 2.2 et 2.4.`),
      );
    }

    const dates = RegularisationService.echeancesDe(dateDebut, dateFin, dto.periodicite);
    if (dates.length === 0) {
      throw new BadRequestException('Le contrat ne produit aucune échéance sur la période indiquée.');
    }

    return this.prisma.modeleAbonnement.create({
      data: {
        tenantId,
        code: dto.code,
        intitule: dto.intitule,
        journalId: journal.id,
        compteDebitId: debit.id,
        compteCreditId: credit.id,
        periodicite: dto.periodicite,
        dateDebut,
        dateFin,
        montant: new Prisma.Decimal(dto.montant),
        createdBy,
        echeances: {
          create: dates.map((d) => ({ date: d, montant: new Prisma.Decimal(dto.montant) })),
        },
      },
      include: { echeances: { orderBy: { date: 'asc' } } },
    });
  }

  async modifierAbonnement(tenantId: string, abonnementId: string, dto: ModifierAbonnementDto) {
    const abonnement = await this.prisma.modeleAbonnement.findFirst({ where: { id: abonnementId, tenantId } });
    if (!abonnement) throw new NotFoundException('Abonnement introuvable pour ce dossier');
    return this.prisma.modeleAbonnement.update({ where: { id: abonnementId }, data: dto });
  }

  async supprimerAbonnement(tenantId: string, abonnementId: string) {
    const abonnement = await this.prisma.modeleAbonnement.findFirst({
      where: { id: abonnementId, tenantId },
      include: { echeances: { where: { ecritureId: { not: null } } } },
    });
    if (!abonnement) throw new NotFoundException('Abonnement introuvable pour ce dossier');
    if (abonnement.echeances.length > 0) {
      throw new BadRequestException(
        `${abonnement.echeances.length} échéance(s) ont déjà produit une écriture : l'abonnement ne peut plus être ` +
          'supprimé. Mettez-le en sommeil.',
      );
    }
    await this.prisma.modeleAbonnement.delete({ where: { id: abonnementId } });
    return { supprime: true };
  }

  /**
   * Génère les écritures des échéances dues jusqu'à une date. L'opération est
   * IDEMPOTENTE : une échéance qui porte déjà une écriture est sautée, si bien
   * que relancer la génération ne produit jamais de doublon.
   */
  async genererEcritures(tenantId: string, createdBy: string, abonnementId: string, dto: GenererAbonnementDto) {
    const abonnement = await this.prisma.modeleAbonnement.findFirst({
      where: { id: abonnementId, tenantId },
      include: { echeances: { where: { ecritureId: null }, orderBy: { date: 'asc' } } },
    });
    if (!abonnement) throw new NotFoundException('Abonnement introuvable pour ce dossier');
    if (!abonnement.estActif) throw new BadRequestException('Cet abonnement est en sommeil.');

    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce dossier');
    if (exercice.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException("L'exercice est clôturé.");
    }

    const jusquA = new Date(dto.jusquA);
    const aGenerer = abonnement.echeances.filter(
      (e) => e.date <= jusquA && e.date >= exercice.dateDebut && e.date <= exercice.dateFin,
    );

    const generees: { echeanceId: string; ecritureId: string; date: string }[] = [];
    for (const echeance of aGenerer) {
      const montant = Number(echeance.montant);
      const ecriture = await this.ecritureService.creer(tenantId, createdBy, {
        exerciceId: exercice.id,
        journalId: abonnement.journalId,
        date: echeance.date.toISOString().slice(0, 10),
        libelle: `${abonnement.intitule} · échéance du ${echeance.date.toISOString().slice(0, 10)}`,
        reference: abonnement.code,
        lignes: [
          { compteId: abonnement.compteDebitId, debit: montant, libelle: abonnement.intitule },
          { compteId: abonnement.compteCreditId, credit: montant, libelle: abonnement.intitule },
        ],
      });
      // Lien posé sur une échéance encore libre (audit F10) · une génération
      // concurrente la prenait entre-temps, et la contrainte d'unicité
      // tombait APRÈS que l'écriture était commise. La génération étant
      // idempotente, le perdant retire son écriture et passe à la suivante.
      const { count } = await this.prisma.echeanceAbonnement.updateMany({
        where: { id: echeance.id, ecritureId: null },
        data: { ecritureId: ecriture.id },
      });
      if (count === 0) {
        await this.ecritureService.retirerCompensation(tenantId, ecriture.id);
        continue;
      }
      generees.push({
        echeanceId: echeance.id,
        ecritureId: ecriture.id,
        date: echeance.date.toISOString().slice(0, 10),
      });
    }

    return {
      generees: generees.length,
      restantes: abonnement.echeances.length - generees.length,
      detail: generees,
    };
  }

  /** Journal d'accueil des écritures automatiques · général (OD) par défaut. */
  private async journalAccueil(tenantId: string, journalId?: string) {
    const journaux = await this.prisma.journal.findMany({ where: { tenantId } });
    const journal = journalId
      ? journaux.find((j) => j.id === journalId)
      : (journaux.find((j) => j.code === 'OD') ?? journaux.find((j) => j.type === 'GENERAL'));
    if (!journal) {
      throw new BadRequestException(
        "Aucun journal d'accueil : créez un journal général (code OD) ou indiquez le journal à utiliser.",
      );
    }
    return journal;
  }
}

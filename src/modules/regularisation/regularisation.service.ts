import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import {
  ClasseCompte,
  PeriodiciteAbonnement,
  Prisma,
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

/** Un jour, en millisecondes. */
const JOUR = 86_400_000;

/** Compte de report par défaut selon le type de régularisation. */
const RACINE_DIFFERE: Record<TypeRegularisation, string> = {
  [TypeRegularisation.CHARGE_CONSTATEE_AVANCE]: '476',
  [TypeRegularisation.PRODUIT_CONSTATE_AVANCE]: '477',
  [TypeRegularisation.SUBVENTION_PLURIANNUELLE]: '477',
};

/**
 * RÉGULARISATION DES CHARGES ET DES PRODUITS, ET ÉCRITURES D'ABONNEMENT.
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

  /** Calcule le prorata sans rien enregistrer · alimente l'aperçu de l'écran. */
  async simuler(tenantId: string, dto: CreerRegularisationDto) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce dossier');
    const periodeDebut = new Date(dto.periodeDebut);
    const periodeFin = new Date(dto.periodeFin);
    if (periodeFin < periodeDebut) {
      throw new BadRequestException('La fin de la période précède son début.');
    }
    const montantDiffere =
      dto.montantDiffere ??
      RegularisationService.prorataDiffere(dto.montantTotal, periodeDebut, periodeFin, exercice.dateFin);
    return {
      montantTotal: dto.montantTotal,
      montantDiffere,
      montantExercice: Math.round((dto.montantTotal - montantDiffere) * 100) / 100,
      finExercice: exercice.dateFin.toISOString().slice(0, 10),
      joursTotal: Math.round((periodeFin.getTime() - periodeDebut.getTime()) / JOUR) + 1,
      joursApresCloture: Math.max(0, Math.round((periodeFin.getTime() - exercice.dateFin.getTime()) / JOUR)),
    };
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

    const estCharge = dto.type === TypeRegularisation.CHARGE_CONSTATEE_AVANCE;
    const classeAttendue = estCharge ? ClasseCompte.CLASSE_6 : ClasseCompte.CLASSE_7;
    if (compteChargeProduit.classe !== classeAttendue) {
      throw new BadRequestException(
        `Le compte ${compteChargeProduit.numero} est de classe ${compteChargeProduit.classe.replace('CLASSE_', '')} ; ` +
          `une ${estCharge ? 'charge constatée d\'avance' : 'régularisation de produit'} porte sur un compte de classe ` +
          `${estCharge ? '6' : '7'}.`,
      );
    }

    const compteDiffere = await this.trouverCompteDiffere(tenantId, dto.type, dto.compteDifferId);
    const periodeDebut = new Date(dto.periodeDebut);
    const periodeFin = new Date(dto.periodeFin);
    const montantDiffere =
      dto.montantDiffere ??
      RegularisationService.prorataDiffere(dto.montantTotal, periodeDebut, periodeFin, exercice.dateFin);
    if (montantDiffere <= 0) {
      throw new BadRequestException(
        "La période ne déborde pas la clôture de l'exercice : il n'y a rien à différer.",
      );
    }
    if (montantDiffere > dto.montantTotal + 0.005) {
      throw new BadRequestException('La part différée dépasse le montant total.');
    }

    const journal = await this.journalAccueil(tenantId, dto.journalId);

    // Sens de l'écriture de constatation :
    //  - CHARGE : on retire la charge de l'exercice · débit 476, crédit 6x ;
    //  - PRODUIT et SUBVENTION : on retire le produit · débit 7x, crédit 477.
    const lignes = estCharge
      ? [
          { compteId: compteDiffere.id, debit: montantDiffere, libelle: dto.libelle },
          { compteId: compteChargeProduit.id, credit: montantDiffere, libelle: dto.libelle },
        ]
      : [
          { compteId: compteChargeProduit.id, debit: montantDiffere, libelle: dto.libelle },
          { compteId: compteDiffere.id, credit: montantDiffere, libelle: dto.libelle },
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
   * Reprend la part différée sur l'exercice qu'elle concerne, À SA FIN, comme
   * le veut la Partie 3 ch. 6 : « A la fin de chaque exercice ultérieur
   * concerné, la quote-part est reprise au débit du compte 477 par le crédit
   * du compte 71. » Ce n'est pas une contre-passation d'ouverture.
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
    if (cible.dateDebut <= regul.periodeDebut && cible.id === regul.exerciceId) {
      throw new BadRequestException(
        "La reprise se fait sur un exercice ULTÉRIEUR à celui de la constatation, pas sur le même.",
      );
    }

    const journal = await this.journalAccueil(tenantId);
    const estCharge = regul.type === TypeRegularisation.CHARGE_CONSTATEE_AVANCE;
    const montant = Number(regul.montantDiffere);

    // Sens inverse de la constatation : la charge ou le produit revient sur
    // l'exercice qu'il concerne.
    const lignes = estCharge
      ? [
          { compteId: regul.compteChargeProduitId, debit: montant, libelle: regul.libelle },
          { compteId: regul.compteDifferId, credit: montant, libelle: regul.libelle },
        ]
      : [
          { compteId: regul.compteDifferId, debit: montant, libelle: regul.libelle },
          { compteId: regul.compteChargeProduitId, credit: montant, libelle: regul.libelle },
        ];

    const ecriture = await this.ecritureService.creer(tenantId, createdBy, {
      exerciceId: cible.id,
      journalId: journal.id,
      // « À la fin de chaque exercice ultérieur concerné » · date de clôture
      // de l'exercice de reprise, et non son ouverture.
      date: cible.dateFin.toISOString().slice(0, 10),
      libelle: `Reprise de régularisation · ${regul.libelle}`,
      reference: 'REGUL',
      lignes,
    });

    return this.prisma.regularisation.update({
      where: { id: regularisationId },
      data: { ecritureRepriseId: ecriture.id },
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

  private static prochaineDate(date: Date, periodicite: PeriodiciteAbonnement): Date {
    const suivante = new Date(date);
    const mois = {
      [PeriodiciteAbonnement.MENSUELLE]: 1,
      [PeriodiciteAbonnement.TRIMESTRIELLE]: 3,
      [PeriodiciteAbonnement.SEMESTRIELLE]: 6,
      [PeriodiciteAbonnement.ANNUELLE]: 12,
    }[periodicite];
    suivante.setUTCMonth(suivante.getUTCMonth() + mois);
    return suivante;
  }

  /** Échéances d'un contrat, du début à la fin, à la périodicité retenue. */
  static echeancesDe(dateDebut: Date, dateFin: Date, periodicite: PeriodiciteAbonnement): Date[] {
    const dates: Date[] = [];
    let curseur = new Date(dateDebut);
    // Garde-fou : un contrat mensuel de vingt ans ferait 240 échéances, ce qui
    // reste raisonnable ; au-delà de 600 c'est une erreur de saisie de dates.
    while (curseur <= dateFin && dates.length < 600) {
      dates.push(new Date(curseur));
      curseur = RegularisationService.prochaineDate(curseur, periodicite);
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

    const [journal, debit, credit] = await Promise.all([
      this.prisma.journal.findFirst({ where: { id: dto.journalId, tenantId } }),
      this.prisma.compte.findFirst({ where: { id: dto.compteDebitId, tenantId } }),
      this.prisma.compte.findFirst({ where: { id: dto.compteCreditId, tenantId } }),
    ]);
    if (!journal) throw new BadRequestException('Journal introuvable pour ce dossier');
    if (!debit || !credit) throw new BadRequestException('Compte introuvable pour ce dossier');
    if (debit.id === credit.id) {
      throw new BadRequestException("Le compte débité et le compte crédité ne peuvent pas être le même.");
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
      await this.prisma.echeanceAbonnement.update({
        where: { id: echeance.id },
        data: { ecritureId: ecriture.id },
      });
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

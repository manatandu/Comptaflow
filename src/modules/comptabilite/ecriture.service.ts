import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Prisma, Referentiel, StatutEcriture, StatutExercice, TypeCompteDetailTotal } from '@prisma/client';
import { CreerEcritureDto } from './dto/creer-ecriture.dto';
import { CorrigerEcritureDto } from './dto/corriger-ecriture.dto';
import { ModifierEcritureDto, ValiderJusquaDto } from './dto/brouillard.dto';
import { JournalService } from '../journaux/journal.service';
import { ExerciceService } from '../exercice/exercice.service';
import { AnalytiqueService } from '../analytique/analytique.service';
import { avecRetrySerialisable } from '../../common/prisma-retry.util';

/**
 * Une ligne est au débit si son montant est porté du côté débit · quel que
 * soit son SIGNE. Une correction par inscription en négatif (art. 20 de
 * l'AUDCIF, voir `corrigerParInscriptionEnNegatif`) porte un débit négatif :
 * c'est toujours une ligne de débit, et la tester par `> 0` la rangerait au
 * crédit, avec la contrepartie du mauvais côté dans le grand livre et dans
 * l'export d'audit.
 */
function estLigneDebit(l: { debit: Prisma.Decimal | number }): boolean {
  return Math.abs(Number(l.debit)) > 0.005;
}

/** Une ligne de la balance âgée : un compte de tiers, ses tranches de retard. */
/**
 * Une tranche d'antériorité · elle porte SES DEUX libellés.
 *
 * Les dossiers de révision réels titrent chaque colonne deux fois : la période
 * calendaire exacte (« Du 01/09/2025 au 30/09/2025 ») et l'âge qu'elle
 * représente à la date de référence (« moins de 120 jours »). Les deux
 * servent · la première pour retrouver la facture, la seconde pour apprécier
 * le retard sans compter les mois sur ses doigts.
 */
export interface TrancheAgee {
  cle: string;
  libellePeriode: string;
  libelleAge: string;
}

/** Une ligne de balance âgée · un TIERS, pas un compte. */
export interface LigneAgee {
  cle: string;
  libelle: string;
  codeTiers: string;
  numero: string;
  /** Un montant par tranche, dans l'ordre de `tranches`. Vide pour un créditeur. */
  montants: number[];
  solde: number;
}

/** Une échéance à venir, ligne à ligne · le détail de l'échéancier. */
export interface EcheanceDetail {
  ligneId: string;
  date: Date;
  tranche: string;
  compteNumero: string;
  compteIntitule: string;
  /** Nom du tiers quand le compte lui est rattaché · l'intitulé du compte sinon. */
  tiers: string | null;
  libelle: string;
  reference: string | null;
  montant: number;
  sens: 'ENCAISSEMENT' | 'DECAISSEMENT';
}

/** Une tranche de l'échéancier · ce qui tombe dans une fenêtre de temps. */
export interface TrancheEcheancier {
  cle: string;
  libelle: string;
  /** Bornes en jours à compter de la date de référence · `null` = sans borne. */
  deJours: number | null;
  aJours: number | null;
  encaissements: number;
  decaissements: number;
  /** Encaissements moins décaissements de la tranche. */
  net: number;
  /** Trésorerie projetée à la fin de la tranche, cumul depuis la trésorerie actuelle. */
  tresorerieProjetee: number;
}

/**
 * Règle non négociable du moteur comptable : une écriture n'existe que si
 * total(débit) === total(crédit), et un exercice clôturé n'accepte plus
 * aucune écriture (piste d'audit + intégrité légale). Ces deux contrôles
 * vivent ici, pas côté client, pour rester valables quel que soit le canal
 * d'entrée (UI web, import CSV, API partenaire...).
 */
@Injectable()
export class EcritureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journalService: JournalService,
    private readonly exerciceService: ExerciceService,
    private readonly analytiqueService: AnalytiqueService,
  ) {}

  async creer(tenantId: string, createdBy: string, dto: CreerEcritureDto) {
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: dto.exerciceId, tenantId },
    });
    if (!exercice) {
      throw new BadRequestException('Exercice introuvable pour ce tenant');
    }
    if (exercice.statut === StatutExercice.CLOTURE) {
      throw new ForbiddenException("Impossible d'enregistrer une écriture sur un exercice clôturé");
    }

    const journal = await this.journalService.trouver(tenantId, dto.journalId);
    if (!journal.estActif) {
      throw new BadRequestException(`Le journal ${journal.code} est en sommeil`);
    }

    const totalDebit = dto.lignes.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = dto.lignes.reduce((s, l) => s + (l.credit ?? 0), 0);
    if (dto.lignes.length < 2 || Math.abs(totalDebit - totalCredit) > 0.005) {
      throw new BadRequestException(
        `Écriture déséquilibrée : débit=${totalDebit} crédit=${totalCredit}`,
      );
    }

    // Les tauxTvaId ne participent pas à l'équilibre (informatifs, posés sur
    // la ligne de TVA par la saisie guidée "Achat/Vente avec TVA") mais
    // doivent rester scopés au tenant · sans ce contrôle, un appel API direct
    // pourrait rattacher une ligne au taux d'un autre tenant (la FK Prisma ne
    // vérifie que l'existence de l'id, pas son tenant).
    const tauxTvaIds = [...new Set(dto.lignes.map((l) => l.tauxTvaId).filter((id): id is string => !!id))];
    if (tauxTvaIds.length > 0) {
      const tauxTrouves = await this.prisma.tauxTva.findMany({ where: { id: { in: tauxTvaIds }, tenantId } });
      if (tauxTrouves.length !== tauxTvaIds.length) {
        throw new BadRequestException('Un ou plusieurs taux de TVA sont introuvables pour ce tenant');
      }
    }

    // Comptes Total (regroupement par racine, §3.1) : jamais mouvementables
    // directement · leur solde n'est qu'une agrégation des comptes Détail de
    // même préfixe numérique (voir balance() plus bas). Un appel API direct
    // pourrait sinon y poster une écriture, brisant l'invariant du moteur de
    // mapping futur (§3.5) qui suppose que seuls les comptes Détail portent
    // des mouvements réels.
    const compteIds = [...new Set(dto.lignes.map((l) => l.compteId))];
    const comptes = await this.prisma.compte.findMany({ where: { id: { in: compteIds }, tenantId } });
    if (comptes.length !== compteIds.length) {
      throw new BadRequestException('Un ou plusieurs comptes sont introuvables pour ce tenant');
    }
    const comptesTotal = comptes.filter((c) => c.typeCompte === TypeCompteDetailTotal.TOTAL);
    if (comptesTotal.length > 0) {
      throw new BadRequestException(
        `Impossible de saisir sur un compte Total (${comptesTotal.map((c) => c.numero).join(', ')}) · ` +
          'ce sont des comptes de regroupement, saisissez sur le compte Détail concerné',
      );
    }

    const date = new Date(dto.date);

    // Clôtures Partielle/Totale (par journal) et Période (tous journaux) :
    // verrouillage de saisie indépendant du statut CLOTURE de l'exercice ·
    // voir ExerciceService.verifierEcritureAutorisee.
    await this.exerciceService.verifierEcritureAutorisee(tenantId, dto.journalId, date);

    // Ventilation analytique · seuls les plans marqués « ventilation
    // obligatoire » bloquent ici. Les autres laissent passer, et l'état de
    // contrôle des cumuls signale les lignes restées sans répartition.
    await this.analytiqueService.verifierVentilationObligatoire(tenantId, dto.lignes);
    const sectionsParId = await this.verifierSectionsVentilees(tenantId, dto);

    // Le calcul du numéro de pièce (lire le max actuel, l'incrémenter) et la
    // création de l'écriture doivent former une seule opération atomique :
    // sans ça, deux écritures créées au même instant sur le même journal
    // pourraient lire le même max et recevoir le même numeroPiece. Voir
    // avecRetrySerialisable pour le détail (transaction Serializable +
    // reprise automatique). Testé jusqu'à 12 écritures envoyées en parfaite
    // simultanéité sur le même journal/mois : aucun doublon de numeroPiece.
    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const numeroPiece = await this.journalService.prochainNumeroPiece(tenantId, journal, dto.exerciceId, date, tx);
        return tx.ecriture.create({
          data: {
            tenantId,
            exerciceId: dto.exerciceId,
            journalId: dto.journalId,
            numeroPiece,
            date,
            libelle: dto.libelle,
            reference: dto.reference,
            createdBy,
            lignes: {
              create: dto.lignes.map((l) => ({
                compteId: l.compteId,
                libelle: l.libelle,
                debit: l.debit ?? 0,
                credit: l.credit ?? 0,
                tauxTvaId: l.tauxTvaId,
                dateEcheance: l.dateEcheance ? new Date(l.dateEcheance) : undefined,
                deviseId: l.deviseId,
                montantDevise: l.montantDevise,
                coursApplique: l.coursApplique,
                ...(l.ventilations && l.ventilations.length > 0
                  ? {
                      ventilations: {
                        create: l.ventilations.map((v) => ({
                          sectionId: v.sectionId,
                          planId: sectionsParId.get(v.sectionId)!.planId,
                          debit: v.debit ?? 0,
                          credit: v.credit ?? 0,
                        })),
                      },
                    }
                  : {}),
              })),
            },
          },
          include: { lignes: true, journal: true },
        });
      },
      `Trop d'écritures enregistrées au même instant sur le journal ${journal.code} · veuillez réessayer.`,
    );
  }



  /**
   * Contrôle des sections ventilées en saisie · scope du dossier, type Détail,
   * section active, et équilibre PAR PLAN de chaque ligne. La contrainte n'est
   * pas « une section par ligne » mais « sur un plan donné, la ventilation
   * d'une ligne couvre son montant en totalité, ou il n'y en a aucune » : une
   * dépense partagée entre deux projets est parfaitement légitime.
   *
   * Retourne les sections indexées par id, pour que la création de l'écriture
   * puisse dénormaliser le planId sur chaque ventilation sans requête de plus.
   */
  private async verifierSectionsVentilees(tenantId: string, dto: CreerEcritureDto) {
    const sectionIds = [
      ...new Set(dto.lignes.flatMap((l) => (l.ventilations ?? []).map((v) => v.sectionId))),
    ];
    const sectionsParId = new Map<string, { planId: string; code: string; planCode: string }>();
    if (sectionIds.length === 0) return sectionsParId;

    const sections = await this.prisma.sectionAnalytique.findMany({
      where: { id: { in: sectionIds }, tenantId },
      include: { plan: { select: { code: true } } },
    });
    if (sections.length !== sectionIds.length) {
      throw new BadRequestException('Une ou plusieurs sections analytiques sont introuvables pour ce dossier');
    }
    const totale = sections.find((s) => s.type === TypeCompteDetailTotal.TOTAL);
    if (totale) {
      throw new BadRequestException(
        `La section ${totale.code} est de type Total : elle regroupe ses sections Détail dans les états et ne reçoit pas de ventilation directe.`,
      );
    }
    const sommeil = sections.find((s) => !s.estActive);
    if (sommeil) {
      throw new BadRequestException(`La section analytique ${sommeil.code} est en sommeil`);
    }
    for (const s of sections) {
      sectionsParId.set(s.id, { planId: s.planId, code: s.code, planCode: s.plan.code });
    }

    for (const [index, ligne] of dto.lignes.entries()) {
      if (!ligne.ventilations || ligne.ventilations.length === 0) continue;
      const parPlan = new Map<string, { debit: number; credit: number; planCode: string }>();
      for (const v of ligne.ventilations) {
        const s = sectionsParId.get(v.sectionId)!;
        const cumul = parPlan.get(s.planId) ?? { debit: 0, credit: 0, planCode: s.planCode };
        cumul.debit += v.debit ?? 0;
        cumul.credit += v.credit ?? 0;
        parPlan.set(s.planId, cumul);
      }
      for (const [, cumul] of parPlan) {
        if (
          Math.abs(cumul.debit - (ligne.debit ?? 0)) > 0.005 ||
          Math.abs(cumul.credit - (ligne.credit ?? 0)) > 0.005
        ) {
          throw new BadRequestException(
            `Ligne ${index + 1} : ventilation incomplète sur le plan ${cumul.planCode} · ` +
              `${cumul.debit.toFixed(2)} au débit et ${cumul.credit.toFixed(2)} au crédit, ` +
              `pour une ligne de ${(ligne.debit ?? 0).toFixed(2)} / ${(ligne.credit ?? 0).toFixed(2)}.`,
          );
        }
      }
    }
    return sectionsParId;
  }


  // ==========================================================================
  // BROUILLARD ET VALIDATION
  //
  // Une écriture naît en BROUILLARD : modifiable et supprimable, elle n'est pas
  // encore au livre-journal. La VALIDER l'y fait entrer, et la rend intangible
  // au sens de l'article 20 · à partir de là, seule l'inscription en négatif
  // corrige.
  //
  // Cette frontière n'existait pas jusqu'ici : toute écriture était définitive
  // dès sa saisie, et une faute de frappe repérée dans la seconde coûtait une
  // contre-écriture. Le brouillard réconcilie l'ergonomie et l'intangibilité,
  // sans rien céder sur la seconde.
  //
  // Les deux référentiels bornent ce séjour, mais PAS AU MÊME DÉLAI, et le
  // logiciel servait le plus court aux deux. Une entreprise voyait donc
  // signalées « en retard de centralisation » des écritures qui ne l'étaient
  // pas, trois semaines avant de l'être :
  //
  //  · SYCEBNL, Partie 2 ch. 2 · « les données des documents auxiliaires sont
  //    centralisées au moins chaque semaine dans le journal ou le grand-livre » ;
  //  · AUDCIF, art. 19 · « les totaux de ces supports sont périodiquement et au
  //    moins une fois par mois centralisés dans le livre-journal et le
  //    grand-livre ».
  //
  // Au-delà, une écriture laissée en brouillard n'est plus un document de
  // travail, c'est un retard de centralisation. L'état du brouillard le
  // signale nommément, et ControlesService applique le même barème.
  // ==========================================================================

  private static readonly JOURS_CENTRALISATION: Record<Referentiel, number> = {
    [Referentiel.SYCEBNL]: 7,
    [Referentiel.SYSCOHADA]: 30,
  };

  private async trouverEnBrouillard(tenantId: string, ecritureId: string) {
    const ecriture = await this.prisma.ecriture.findFirst({
      where: { id: ecritureId, tenantId },
      include: { lignes: true, journal: true, exercice: true },
    });
    if (!ecriture) throw new NotFoundException('Écriture introuvable pour ce dossier.');
    if (ecriture.statut === StatutEcriture.VALIDEE) {
      throw new ForbiddenException(
        `L'écriture n° ${ecriture.numeroPiece ?? ''} est validée : elle est entrée au livre-journal et ne se modifie ` +
          "plus. L'article 20 de l'AUDCIF n'ouvre qu'une voie, la correction par inscription en négatif.",
      );
    }
    if (ecriture.exercice.statut === StatutExercice.CLOTURE) {
      throw new ForbiddenException("L'exercice de cette écriture est clôturé.");
    }
    const lettree = ecriture.lignes.find((l) => l.lettre);
    if (lettree) {
      throw new BadRequestException(
        `Une ligne de cette écriture est lettrée (${lettree.lettre}) : délettrez-la avant de modifier l'écriture.`,
      );
    }
    const pointee = ecriture.lignes.find((l) => l.rapprochementId);
    if (pointee) {
      throw new BadRequestException(
        'Une ligne de cette écriture est pointée dans un rapprochement bancaire : dépointez-la avant de modifier.',
      );
    }
    return ecriture;
  }

  /**
   * Modifie une écriture en brouillard. Les lignes sont remplacées en bloc :
   * une écriture est un tout équilibré, et retoucher une ligne isolément
   * ouvrirait une fenêtre où elle ne l'est plus.
   */
  async modifier(tenantId: string, ecritureId: string, dto: ModifierEcritureDto) {
    const ecriture = await this.trouverEnBrouillard(tenantId, ecritureId);
    const date = dto.date ? new Date(dto.date) : ecriture.date;

    if (date < ecriture.exercice.dateDebut || date > ecriture.exercice.dateFin) {
      throw new BadRequestException("La date sort de l'exercice de l'écriture.");
    }
    await this.exerciceService.verifierEcritureAutorisee(tenantId, ecriture.journalId, date);

    if (dto.lignes) {
      const totalDebit = dto.lignes.reduce((s, l) => s + (l.debit ?? 0), 0);
      const totalCredit = dto.lignes.reduce((s, l) => s + (l.credit ?? 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.005) {
        throw new BadRequestException(`Écriture déséquilibrée : débit=${totalDebit} crédit=${totalCredit}`);
      }
      const compteIds = [...new Set(dto.lignes.map((l) => l.compteId))];
      const comptes = await this.prisma.compte.findMany({ where: { id: { in: compteIds }, tenantId } });
      if (comptes.length !== compteIds.length) {
        throw new BadRequestException('Un ou plusieurs comptes sont introuvables pour ce tenant');
      }
      const comptesTotal = comptes.filter((c) => c.typeCompte === TypeCompteDetailTotal.TOTAL);
      if (comptesTotal.length > 0) {
        throw new BadRequestException(
          `Impossible de saisir sur un compte Total (${comptesTotal.map((c) => c.numero).join(', ')})`,
        );
      }
      await this.analytiqueService.verifierVentilationObligatoire(tenantId, dto.lignes);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.lignes) {
        // Les ventilations analytiques suivent leurs lignes (onDelete: Cascade
        // sur VentilationAnalytique.ligne) : remplacer les lignes remplace
        // aussi la ventilation, ce qui est le comportement attendu · on ne
        // garde pas l'imputation projet d'une ligne qui n'existe plus.
        await tx.ligneEcriture.deleteMany({ where: { ecritureId } });
        await tx.ligneEcriture.createMany({
          data: dto.lignes.map((l) => ({
            ecritureId,
            compteId: l.compteId,
            libelle: l.libelle,
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
            tauxTvaId: l.tauxTvaId,
            dateEcheance: l.dateEcheance ? new Date(l.dateEcheance) : undefined,
          })),
        });
      }
      return tx.ecriture.update({
        where: { id: ecritureId },
        data: {
          date,
          libelle: dto.libelle ?? undefined,
          reference: dto.reference ?? undefined,
        },
        include: { lignes: { include: { compte: true } }, journal: true },
      });
    });
  }

  /** Supprime une écriture en brouillard. Une écriture validée ne se supprime pas. */
  async supprimer(tenantId: string, ecritureId: string) {
    await this.trouverEnBrouillard(tenantId, ecritureId);
    await this.prisma.$transaction(async (tx) => {
      await tx.ligneEcriture.deleteMany({ where: { ecritureId } });
      await tx.ecriture.delete({ where: { id: ecritureId } });
    });
    return { supprime: true };
  }

  /**
   * Valide une sélection d'écritures : elles entrent au livre-journal. Le
   * contrôle d'équilibre est refait ici · une écriture ne devrait jamais être
   * déséquilibrée en base, mais la validation est le dernier point où on peut
   * encore l'empêcher d'entrer dans un document légal.
   */
  async valider(tenantId: string, valideeBy: string, ecritureIds: string[]) {
    const ecritures = await this.prisma.ecriture.findMany({
      where: { id: { in: ecritureIds }, tenantId },
      include: { lignes: true, exercice: { select: { statut: true } }, journal: { select: { code: true } } },
    });
    if (ecritures.length !== ecritureIds.length) {
      throw new NotFoundException('Une ou plusieurs écritures sont introuvables pour ce dossier.');
    }
    const dejaValidees = ecritures.filter((e) => e.statut === StatutEcriture.VALIDEE);
    const aValider = ecritures.filter((e) => e.statut === StatutEcriture.BROUILLARD);

    for (const e of aValider) {
      if (e.exercice.statut === StatutExercice.CLOTURE) {
        throw new ForbiddenException(`L'exercice de l'écriture ${e.journal.code} n° ${e.numeroPiece ?? ''} est clôturé.`);
      }
      const debit = e.lignes.reduce((s, l) => s + Number(l.debit), 0);
      const credit = e.lignes.reduce((s, l) => s + Number(l.credit), 0);
      if (Math.abs(debit - credit) > 0.005) {
        throw new BadRequestException(
          `L'écriture ${e.journal.code} n° ${e.numeroPiece ?? ''} est déséquilibrée (${debit} / ${credit}) : ` +
            'corrigez-la avant de la valider.',
        );
      }
    }

    const valideeAt = new Date();
    await this.prisma.ecriture.updateMany({
      where: { id: { in: aValider.map((e) => e.id) } },
      data: { statut: StatutEcriture.VALIDEE, valideeAt, valideeBy },
    });
    return { validees: aValider.length, dejaValidees: dejaValidees.length };
  }

  /** Valide tout le brouillard jusqu'à une date, éventuellement sur un seul journal. */
  async validerJusqua(tenantId: string, valideeBy: string, dto: ValiderJusquaDto) {
    const ecritures = await this.prisma.ecriture.findMany({
      where: {
        tenantId,
        exerciceId: dto.exerciceId,
        statut: StatutEcriture.BROUILLARD,
        date: { lte: new Date(dto.dateLimite) },
        ...(dto.journalId ? { journalId: dto.journalId } : {}),
      },
      select: { id: true },
    });
    if (ecritures.length === 0) {
      return { validees: 0, dejaValidees: 0 };
    }
    return this.valider(
      tenantId,
      valideeBy,
      ecritures.map((e) => e.id),
    );
  }

  /**
   * État du brouillard · État → Brouillard de Sage, augmenté du retard de
   * centralisation qu'impose le référentiel du dossier. Chaque écriture porte
   * son ancienneté en jours et un drapeau au-delà du délai applicable, sept
   * jours en SYCEBNL et un mois en SYSCOHADA.
   */
  async brouillard(
    tenantId: string,
    params: { exerciceId: string; journalId?: string; dateDebut?: string; dateFin?: string },
  ) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true },
    });
    const joursCentralisation = EcritureService.JOURS_CENTRALISATION[tenant.referentiel];
    const ecritures = await this.prisma.ecriture.findMany({
      where: {
        tenantId,
        exerciceId: params.exerciceId,
        statut: StatutEcriture.BROUILLARD,
        ...(params.journalId ? { journalId: params.journalId } : {}),
        ...(params.dateDebut || params.dateFin
          ? {
              date: {
                ...(params.dateDebut ? { gte: new Date(params.dateDebut) } : {}),
                ...(params.dateFin ? { lte: new Date(params.dateFin) } : {}),
              },
            }
          : {}),
      },
      include: {
        journal: { select: { code: true, intitule: true } },
        lignes: { include: { compte: { select: { numero: true, intitule: true } } } },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    const maintenant = Date.now();
    const lignes = ecritures.map((e) => {
      const ancienneteJours = Math.floor((maintenant - e.createdAt.getTime()) / 86_400_000);
      const debit = e.lignes.reduce((s, l) => s + Number(l.debit), 0);
      const credit = e.lignes.reduce((s, l) => s + Number(l.credit), 0);
      return {
        id: e.id,
        date: e.date.toISOString().slice(0, 10),
        createdAt: e.createdAt.toISOString(),
        journal: e.journal.code,
        journalIntitule: e.journal.intitule,
        numeroPiece: e.numeroPiece,
        libelle: e.libelle,
        reference: e.reference,
        debit,
        credit,
        equilibree: Math.abs(debit - credit) <= 0.005,
        ancienneteJours,
        retardCentralisation: ancienneteJours > joursCentralisation,
        lignes: e.lignes.map((l) => ({
          compteNumero: l.compte.numero,
          compteIntitule: l.compte.intitule,
          libelle: l.libelle,
          debit: Number(l.debit),
          credit: Number(l.credit),
        })),
      };
    });

    return {
      lignes,
      totaux: {
        nombre: lignes.length,
        debit: lignes.reduce((s, l) => s + l.debit, 0),
        credit: lignes.reduce((s, l) => s + l.credit, 0),
        desequilibrees: lignes.filter((l) => !l.equilibree).length,
        enRetard: lignes.filter((l) => l.retardCentralisation).length,
      },
      delaiCentralisationJours: joursCentralisation,
    };
  }

  /**
   * CORRECTION D'ERREUR PAR INSCRIPTION EN NÉGATIF · art. 20 de l'AUDCIF,
   * repris mot pour mot par la Partie 2 ch. 2 du SYCEBNL :
   *
   *   « Les documents comptables doivent être tenus SANS BLANC NI ALTÉRATION
   *   D'AUCUNE SORTE. Toute correction d'erreur commise et découverte sur
   *   l'exercice en cours, s'effectue EXCLUSIVEMENT par l'inscription en
   *   négatif des éléments erronés ; l'enregistrement exact est ensuite
   *   opéré. »
   *
   * ## Pourquoi ce n'est PAS une contre-passation
   *
   * L'adverbe « exclusivement » exclut la contre-passation, qui inverse débit
   * et crédit. Ce n'est pas la même écriture, et la différence est mesurable :
   *
   *  - une erreur de 1 000 au débit du 604, CONTRE-PASSÉE, laisse ce compte
   *    avec 1 000 au débit ET 1 000 au crédit ; INSCRITE EN NÉGATIF, elle le
   *    laisse à zéro des deux côtés. Or la même section de la Partie 2 ch. 2
   *    impose à la balance générale de faire apparaître « le cumul depuis
   *    l'ouverture de l'exercice des mouvements débiteurs et le cumul des
   *    mouvements créditeurs » : la contre-passation gonfle les deux cumuls,
   *    l'inscription en négatif les laisse exacts ;
   *  - l'effet dépasse la présentation. Le tableau des flux lit les
   *    immobilisations en `DEBIT_SEUL` (une acquisition est un débit, une
   *    cession un crédit · voir correspondance-tft.ts) : une acquisition
   *    erronée CONTRE-PASSÉE apparaîtrait comme une acquisition ET une
   *    cession, deux flux de trésorerie qui n'ont jamais eu lieu. En négatif,
   *    l'acquisition se réduit à zéro et rien n'apparaît. Même mécanique pour
   *    les notes annexes qui ventilent augmentations et diminutions.
   *
   * ## Ce que la correction refuse de faire
   *
   * Une écriture n'est pas seule au monde : d'autres objets la référencent et
   * affirment quelque chose à son sujet. La corriger sans le dire laisserait
   * ces affirmations en place, devenues fausses · c'est-à-dire exactement
   * l'« altération » que le texte proscrit. Chaque refus ci-dessous nomme
   * l'objet concerné pour que l'utilisateur sache par où passer.
   */
  async corrigerParInscriptionEnNegatif(
    tenantId: string,
    createdBy: string,
    ecritureId: string,
    dto: CorrigerEcritureDto,
  ) {
    const origine = await this.prisma.ecriture.findFirst({
      where: { id: ecritureId, tenantId },
      include: {
        lignes: true,
        journal: true,
        exercice: true,
        correction: { select: { id: true, numeroPiece: true } },
        immobilisationAcquisition: { select: { id: true, designation: true } },
        immobilisationSortie: { select: { id: true, designation: true } },
        dotationAmortissement: { select: { id: true } },
      },
    });
    if (!origine) throw new NotFoundException('Écriture introuvable pour ce dossier.');

    if (origine.statut === StatutEcriture.BROUILLARD) {
      throw new BadRequestException(
        "Cette écriture est encore en brouillard : elle n'est pas entrée au livre-journal. " +
          "Modifiez-la directement plutôt que d'y ajouter une inscription en négatif, qui laisserait " +
          'deux écritures là où il n\'y a qu\'une saisie à reprendre.',
      );
    }

    this.verifierCorrigeable(origine);

    const date = dto.date ? new Date(dto.date) : new Date();

    // « erreur commise et DÉCOUVERTE SUR L'EXERCICE EN COURS » : la correction
    // par inscription en négatif ne vaut QUE dans ce cas. Une erreur d'un
    // exercice antérieur relève d'un tout autre traitement, que le cadre
    // conceptuel décrit précisément · on le NOMME plutôt que d'appliquer
    // silencieusement le mauvais.
    if (date < origine.exercice.dateDebut || date > origine.exercice.dateFin) {
      throw new BadRequestException(
        `La date de correction (${date.toLocaleDateString('fr-FR')}) sort de l'exercice de l'écriture corrigée ` +
          `(${origine.exercice.dateDebut.toLocaleDateString('fr-FR')} – ${origine.exercice.dateFin.toLocaleDateString('fr-FR')}). ` +
          "L'inscription en négatif ne vaut que pour une erreur « commise et découverte sur l'exercice en cours ». " +
          "Une erreur d'un exercice antérieur suit un autre traitement (cadre conceptuel, § corrections d'erreurs) : " +
          'elle doit faire l’objet d’une information dans les Notes annexes, et, si elle est significative, ' +
          "être corrigée par ajustement du report à nouveau d'ouverture ; si elle ne l'est pas, directement dans les " +
          "comptes de l'exercice en cours.",
      );
    }

    await this.exerciceService.verifierEcritureAutorisee(tenantId, origine.journalId, date);

    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const numeroPiece = await this.journalService.prochainNumeroPiece(
          tenantId,
          origine.journal,
          origine.exerciceId,
          date,
          tx,
        );
        return tx.ecriture.create({
          data: {
            tenantId,
            exerciceId: origine.exerciceId,
            // Même journal que l'erreur : la correction appartient à la même
            // série chronologique que ce qu'elle corrige.
            journalId: origine.journalId,
            numeroPiece,
            date,
            libelle: `Correction (inscription en négatif) · ${origine.libelle}`,
            reference: origine.reference,
            createdBy,
            corrigeEcritureId: origine.id,
            motifCorrection: dto.motifCorrection.trim(),
            lignes: {
              // Les MÊMES comptes, dans les MÊMES sens, au signe près : c'est
              // la définition de l'« inscription en négatif des éléments
              // erronés ». Ni lettre ni pointage ne sont repris · ils
              // appartiennent à la ligne d'origine, pas à sa correction.
              create: origine.lignes.map((l) => ({
                compteId: l.compteId,
                libelle: l.libelle,
                debit: l.debit.negated(),
                credit: l.credit.negated(),
                tauxTvaId: l.tauxTvaId,
                dateEcheance: l.dateEcheance,
              })),
            },
          },
          include: { lignes: true, journal: true },
        });
      },
      `Trop d'écritures enregistrées au même instant sur le journal ${origine.journal.code} · veuillez réessayer.`,
    );
  }

  /**
   * Les cinq états qui interdisent la correction. Chacun correspond à une
   * affirmation qu'un autre objet porte sur cette écriture et que la
   * corriger rendrait fausse sans la corriger elle.
   */
  private verifierCorrigeable(e: {
    estGenereeParCloture: boolean;
    numeroPiece: number | null;
    corrigeEcritureId: string | null;
    correction: { numeroPiece: number | null } | null;
    exercice: { statut: StatutExercice };
    lignes: { lettre: string | null; rapprochementId: string | null }[];
    immobilisationAcquisition: { designation: string } | null;
    immobilisationSortie: { designation: string } | null;
    dotationAmortissement: { id: string } | null;
  }) {
    if (e.exercice.statut === StatutExercice.CLOTURE) {
      throw new ForbiddenException(
        "L'exercice est clôturé. Le texte vise l'erreur « commise et découverte sur l'exercice en cours », et les " +
          'erreurs de cet exercice « doivent être corrigées AVANT l’arrêté des comptes » (cadre conceptuel).',
      );
    }
    if (e.correction) {
      throw new BadRequestException(
        `Cette écriture est déjà corrigée (pièce n° ${e.correction.numeroPiece ?? '·'}). Appliquer une seconde fois ` +
          "l'inscription en négatif inverserait l'erreur au lieu de l'annuler.",
      );
    }
    if (e.corrigeEcritureId) {
      throw new BadRequestException(
        "Cette écriture EST une correction. La corriger à son tour ré-inscrirait l'erreur : passez une nouvelle " +
          "écriture pour l'enregistrement exact (« l'enregistrement exact est ensuite opéré »).",
      );
    }
    if (e.estGenereeParCloture) {
      throw new BadRequestException(
        "Cette écriture a été générée par la clôture (solde des classes 6/7, report à-nouveau). La corriger à la main " +
          "désaccorderait le report à-nouveau du bilan d'ouverture, alors que le bilan d'ouverture d'un exercice doit " +
          "correspondre au bilan de clôture de l'exercice précédent (SYCEBNL art. 16, 4 ; AUDCIF art. 34). Annulez " +
          'la clôture pour la refaire.',
      );
    }
    if (e.immobilisationAcquisition || e.immobilisationSortie) {
      const immo = e.immobilisationAcquisition ?? e.immobilisationSortie!;
      throw new BadRequestException(
        `Cette écriture porte ${e.immobilisationAcquisition ? "l'acquisition" : 'la sortie'} de l'immobilisation ` +
          `« ${immo.designation} ». La corriger seule laisserait la fiche d'immobilisation et son plan ` +
          "d'amortissement en place, désormais sans écriture exacte en face : passez par le module Immobilisations.",
      );
    }
    if (e.dotationAmortissement) {
      throw new BadRequestException(
        "Cette écriture porte une dotation aux amortissements. La corriger seule laisserait la dotation enregistrée " +
          'sur la fiche d’immobilisation sans contrepartie comptable : passez par le module Immobilisations.',
      );
    }
    const lettrees = e.lignes.filter((l) => l.lettre);
    if (lettrees.length > 0) {
      throw new BadRequestException(
        `${lettrees.length} ligne(s) de cette écriture sont lettrées (${[...new Set(lettrees.map((l) => l.lettre))].join(', ')}). ` +
          'Le lettrage affirme que ces lignes sont soldées entre elles ; corriger sans délettrer laisserait cette ' +
          'affirmation en place, devenue fausse. Délettrez-les d’abord.',
      );
    }
    const pointees = e.lignes.filter((l) => l.rapprochementId);
    if (pointees.length > 0) {
      throw new BadRequestException(
        `${pointees.length} ligne(s) de cette écriture sont pointées dans un rapprochement bancaire. Le pointage ` +
          'affirme la concordance avec un relevé ; dépointez-les d’abord (possible tant que le rapprochement est en cours).',
      );
    }
  }

  /** Journal : liste chronologique des écritures, filtrable par exercice/journal/période/recherche. */
  async lister(
    tenantId: string,
    filtres: {
      exerciceId?: string;
      journalId?: string;
      dateDebut?: string;
      dateFin?: string;
      recherche?: string;
      /**
       * Le journal est un état de TRAVAIL : il montre le brouillard par
       * défaut, marqué comme tel, pour que le comptable voie où il en est.
       * `false` donne le livre-journal seul, tel qu'il sera imprimé.
       */
      inclureBrouillard?: boolean;
      /**
       * Nombre maximal d'écritures, les plus récentes d'abord quand il est
       * posé. Le tableau de bord n'affiche que quelques mouvements : lui
       * faire télécharger l'exercice entier était le premier poste de
       * lenteur relevé à l'audit. Absent = comportement historique (tout).
       */
      limite?: number;
    },
  ) {
    const where = {
        tenantId,
        ...(filtres.inclureBrouillard === false ? { statut: StatutEcriture.VALIDEE } : {}),
        ...(filtres.exerciceId ? { exerciceId: filtres.exerciceId } : {}),
        ...(filtres.journalId ? { journalId: filtres.journalId } : {}),
        ...(filtres.dateDebut || filtres.dateFin
          ? {
              date: {
                ...(filtres.dateDebut ? { gte: new Date(filtres.dateDebut) } : {}),
                ...(filtres.dateFin ? { lte: new Date(filtres.dateFin) } : {}),
              },
            }
          : {}),
        ...(filtres.recherche ? { libelle: { contains: filtres.recherche, mode: 'insensitive' as const } } : {}),
    };

    const ecritures = await this.prisma.ecriture.findMany({
      ...(filtres.limite ? { take: filtres.limite } : {}),
      where,
      include: {
        lignes: { include: { compte: true } },
        journal: true,
        // Correction (art. 20 AUDCIF) : le journal doit montrer qu'une
        // écriture a été annulée par inscription en négatif, sinon le lecteur
        // additionne une erreur et son annulation sans savoir laquelle est
        // laquelle. `corrigeEcritureId` et `motifCorrection` sont des scalaires,
        // donc déjà renvoyés · seul le lien inverse doit être demandé.
        correction: { select: { id: true, numeroPiece: true, date: true } },
        corrigeEcriture: { select: { id: true, numeroPiece: true, date: true, libelle: true } },
      },
      // Départage explicite : à date égale, l'ordre de sortie serait sinon
      // laissé au plan d'exécution PostgreSQL et pourrait changer d'un export
      // à l'autre (voir TRI_GRAND_LIVRE).
      orderBy: filtres.limite
        ? [{ date: 'desc' }, { numeroPiece: 'desc' }, { id: 'desc' }]
        : [{ date: 'asc' }, { numeroPiece: 'asc' }, { id: 'asc' }],
    });

    // Avec une limite, les totaux calculés sur les lignes tronquées seraient
    // FAUX (ceux des N dernières écritures, présentés comme ceux du journal) :
    // ils viennent alors d'un agrégat SQL sur le même périmètre complet.
    if (filtres.limite) {
      const agg = await this.prisma.ligneEcriture.aggregate({
        _sum: { debit: true, credit: true },
        where: { ecriture: where },
      });
      return {
        ecritures,
        totaux: { debit: Number(agg._sum.debit ?? 0), credit: Number(agg._sum.credit ?? 0) },
      };
    }
    const totalDebit = ecritures.reduce((s, e) => s + e.lignes.reduce((s2, l) => s2 + Number(l.debit), 0), 0);
    const totalCredit = ecritures.reduce((s, e) => s + e.lignes.reduce((s2, l) => s2 + Number(l.credit), 0), 0);
    return { ecritures, totaux: { debit: totalDebit, credit: totalCredit } };
  }

  /**
   * Tri total et déterministe des lignes de grand livre. La date seule ne
   * suffit pas : deux écritures du même jour (une facture et son règlement,
   * ou toutes les écritures d'une clôture datées de la fin d'exercice)
   * sortiraient dans un ordre laissé au plan d'exécution PostgreSQL, qui
   * peut changer d'un appel à l'autre. La colonne « solde progressif »
   * différerait alors entre deux exports du MÊME exercice · inacceptable
   * pour un dossier d'audit, où l'on recoupe deux tirages ligne à ligne.
   * Le `id` final garantit un ordre total.
   */
  private static readonly TRI_GRAND_LIVRE = [
    { ecriture: { date: 'asc' } },
    { ecriture: { numeroPiece: 'asc' } },
    { id: 'asc' },
  ] satisfies Prisma.LigneEcritureOrderByWithRelationInput[];

  /**
   * Contreparties de TOUTES les écritures d'un périmètre, précalculées en une
   * requête plate : pour chaque écriture, la liste des comptes débités et
   * celle des comptes crédités.
   *
   * Règle (voir docs/plan-de-construction.md, « Export Excel · compte
   * contrepartie ») : la contrepartie d'une ligne, ce sont les comptes
   * DISTINCTS de sens opposé dans la même écriture. Exacte et non ambiguë
   * dans les cas usuels (2 lignes, N débits/1 crédit, 1 débit/M crédits) ;
   * dans le cas rare d'une écriture à débits ET crédits multiples simultanés
   * (N×M), la liste porte plusieurs comptes candidats plutôt qu'un choix
   * arbitraire faussement précis. Retenir le seul sens opposé écarte au
   * passage la ligne elle-même et toute autre ligne portant le même compte du
   * même côté · inutile d'y ajouter un « sauf soi-même » ad hoc.
   *
   * Motif : la contrepartie d'une ligne ne dépend que de son SENS et de son
   * écriture · il n'y a donc que deux réponses possibles par écriture, pas
   * une par ligne. Les charger via `ecriture: { lignes: ... }` imbriqué
   * dupliquait l'écriture entière autant de fois qu'elle a de lignes
   * (amplification en O(k²) : mesuré 2,4 Go de RSS sur 50 000 lignes, et une
   * écriture de ventilation de paie à 100 lignes suffisait à faire tomber le
   * processus · donc tous les tenants avec lui, l'application étant
   * mono-processus).
   */
  private async chargerContreparties(
    where: Prisma.LigneEcritureWhereInput,
  ): Promise<Map<string, { DEBIT: string[]; CREDIT: string[] }>> {
    const brut = await this.prisma.ligneEcriture.findMany({
      where,
      select: { ecritureId: true, debit: true, compte: { select: { numero: true } } },
    });

    // Ensembles pendant l'accumulation (dédoublonnage), figés en tableaux
    // ensuite : la contrepartie d'une ligne au débit est la liste des comptes
    // CRÉDITÉS, et réciproquement · d'où l'inversion à la fin.
    const debits = new Map<string, Set<string>>();
    const credits = new Map<string, Set<string>>();
    for (const l of brut) {
      // Le SENS d'une ligne est le côté où son montant est porté, pas le
      // signe de ce montant : une correction par inscription en négatif
      // (art. 20 AUDCIF) porte un débit NÉGATIF, qui reste un débit. Tester
      // `> 0` la rangeait au crédit et lui donnait la mauvaise contrepartie.
      const cible = estLigneDebit(l) ? debits : credits;
      let ens = cible.get(l.ecritureId);
      if (!ens) {
        ens = new Set();
        cible.set(l.ecritureId, ens);
      }
      ens.add(l.compte.numero);
    }

    const parEcriture = new Map<string, { DEBIT: string[]; CREDIT: string[] }>();
    for (const ecritureId of new Set([...debits.keys(), ...credits.keys()])) {
      parEcriture.set(ecritureId, {
        // Ligne au débit → contrepartie = comptes crédités.
        DEBIT: [...(credits.get(ecritureId) ?? [])],
        // Ligne au crédit → contrepartie = comptes débités.
        CREDIT: [...(debits.get(ecritureId) ?? [])],
      });
    }
    return parEcriture;
  }

  /** Mise en forme d'une ligne de grand livre, solde progressif fourni par l'appelant. */
  private static versLigneGrandLivre(
    l: {
      id: string;
      ecritureId: string;
      libelle: string | null;
      debit: Prisma.Decimal;
      credit: Prisma.Decimal;
      lettre: string | null;
      ecriture: {
        date: Date;
        libelle: string;
        reference: string | null;
        numeroPiece: number | null;
        journal: { code: string };
      };
    },
    soldeProgressif: number,
    contreparties: Map<string, { DEBIT: string[]; CREDIT: string[] }>,
  ) {
    const sens = estLigneDebit(l) ? 'DEBIT' : 'CREDIT';
    return {
      id: l.id,
      date: l.ecriture.date,
      journalCode: l.ecriture.journal.code,
      numeroPiece: l.ecriture.numeroPiece,
      libelle: l.libelle ?? l.ecriture.libelle,
      reference: l.ecriture.reference,
      debit: Number(l.debit),
      credit: Number(l.credit),
      lettre: l.lettre,
      soldeProgressif,
      contrepartie: contreparties.get(l.ecritureId)?.[sens] ?? [],
    };
  }

  /**
   * ÉCHÉANCIER DE TRÉSORERIE · ce qui va tomber, et ce qu'il restera en
   * caisse quand ce sera tombé.
   *
   * ## Pourquoi il ne fait pas double emploi avec la balance âgée
   *
   * La balance âgée regarde EN ARRIÈRE : elle ventile par ancienneté de
   * retard ce qui aurait dû être réglé. L'échéancier regarde EN AVANT : il
   * ventile par date d'exigibilité ce qui va devoir l'être, et le confronte
   * à la trésorerie disponible. Ce sont deux questions différentes, et une
   * association qui vit de tranches de subvention se pose surtout la seconde.
   *
   * Sage les distingue d'ailleurs lui aussi (`sage-i7`,
   * `comptabilite-generale.md` : « Échéancier : état de suivi des échéances à
   * venir, DISTINCT de la balance âgée »).
   *
   * ## Assiette
   *
   * Les lignes non lettrées des comptes de tiers, classes 40 à 44 · pas
   * seulement les fournisseurs et les clients. Une ASBL congolaise doit
   * autant d'argent à son personnel (42), aux organismes sociaux (43) et à
   * l'État (44) qu'à ses fournisseurs, et ces trois-là ont des dates de
   * reversement strictes (voir docs/fiscalite-asbl-rdc.md, section 6). Un
   * échéancier qui les ignorerait manquerait précisément ce qui met une
   * association en défaut.
   *
   * `lettre: null` et non `lettrageId: null` : une ligne d'un groupe de
   * lettrage PARTIEL reste due pour son solde, elle a donc sa place ici.
   *
   * L'échéance retenue est `dateEcheance` ; à défaut, la date de l'écriture,
   * même règle que la balance âgée et que Sage.
   *
   * ## Sens
   *
   * Une ligne de tiers au débit est une créance : son dénouement est un
   * ENCAISSEMENT. Au crédit, c'est une dette : un DÉCAISSEMENT.
   *
   * ## Détail ligne à ligne, totaux compensés
   *
   * Contrairement à la balance âgée, qui agrège par compte, le détail garde
   * une ligne par écriture avec sa pièce : c'est ce qu'on attend d'un état
   * d'en-cours, où l'on veut savoir QUELLE facture tombe quand. Une
   * correction par inscription en négatif (art. 20 AUDCIF) y reste donc
   * visible à côté de la ligne qu'elle corrige · elles se compensent dans le
   * total de la tranche, et c'est la projection qui décide.
   */
  async echeancier(
    tenantId: string,
    params: { exerciceId: string; dateReference?: string },
  ) {
    const ref = params.dateReference ? new Date(params.dateReference) : new Date();
    // Minuit, pour qu'une échéance du jour ne bascule pas en retard selon
    // l'heure d'ouverture de l'écran.
    ref.setHours(0, 0, 0, 0);

    const [lignes, tresorerie] = await Promise.all([
      this.prisma.ligneEcriture.findMany({
        where: {
          ecriture: { tenantId, exerciceId: params.exerciceId },
          lettre: null,
          OR: ['40', '41', '42', '43', '44'].map((r) => ({ compte: { numero: { startsWith: r } } })),
        },
        include: {
          compte: {
            select: {
              id: true,
              numero: true,
              intitule: true,
              tiersCompte: { select: { tiers: { select: { nom: true } } } },
            },
          },
          ecriture: { select: { date: true, libelle: true, reference: true } },
        },
      }),
      // Trésorerie disponible au sens du plan SYCEBNL : classe 5 hors 59
      // (dépréciations, qui ne sont pas des liquidités).
      this.prisma.ligneEcriture.findMany({
        where: {
          ecriture: { tenantId, exerciceId: params.exerciceId },
          compte: { numero: { startsWith: '5' } },
        },
        select: { debit: true, credit: true, compte: { select: { numero: true } } },
      }),
    ]);

    const tresorerieActuelle = tresorerie
      .filter((l) => !l.compte.numero.startsWith('59'))
      .reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);

    const TRANCHES: Array<{ cle: string; libelle: string; deJours: number | null; aJours: number | null }> = [
      { cle: 'echu', libelle: 'Échu, non réglé', deJours: null, aJours: -1 },
      { cle: 'j0a7', libelle: 'À 7 jours', deJours: 0, aJours: 7 },
      { cle: 'j8a30', libelle: 'De 8 à 30 jours', deJours: 8, aJours: 30 },
      { cle: 'j31a60', libelle: 'De 31 à 60 jours', deJours: 31, aJours: 60 },
      { cle: 'j61a90', libelle: 'De 61 à 90 jours', deJours: 61, aJours: 90 },
      { cle: 'plus90', libelle: 'Au-delà de 90 jours', deJours: 91, aJours: null },
    ];

    const trancheDe = (echeance: Date): string => {
      const jours = Math.floor((echeance.getTime() - ref.getTime()) / 86_400_000);
      if (jours < 0) return 'echu';
      if (jours <= 7) return 'j0a7';
      if (jours <= 30) return 'j8a30';
      if (jours <= 60) return 'j31a60';
      if (jours <= 90) return 'j61a90';
      return 'plus90';
    };

    const details: EcheanceDetail[] = [];
    for (const l of lignes) {
      const net = Number(l.debit) - Number(l.credit);
      if (Math.abs(net) < 0.005) continue;
      const date = l.dateEcheance ?? l.ecriture.date;
      details.push({
        ligneId: l.id,
        date,
        tranche: trancheDe(date),
        compteNumero: l.compte.numero,
        compteIntitule: l.compte.intitule,
        tiers: l.compte.tiersCompte?.tiers.nom ?? null,
        libelle: l.libelle ?? l.ecriture.libelle,
        reference: l.ecriture.reference,
        montant: Math.abs(net),
        sens: net > 0 ? 'ENCAISSEMENT' : 'DECAISSEMENT',
      });
    }
    details.sort((a, b) => a.date.getTime() - b.date.getTime());

    let cumul = tresorerieActuelle;
    const tranches: TrancheEcheancier[] = TRANCHES.map((t) => {
      const dedans = details.filter((d) => d.tranche === t.cle);
      const encaissements = dedans.filter((d) => d.sens === 'ENCAISSEMENT').reduce((s, d) => s + d.montant, 0);
      const decaissements = dedans.filter((d) => d.sens === 'DECAISSEMENT').reduce((s, d) => s + d.montant, 0);
      const net = encaissements - decaissements;
      cumul += net;
      return {
        ...t,
        encaissements: Math.round(encaissements * 100) / 100,
        decaissements: Math.round(decaissements * 100) / 100,
        net: Math.round(net * 100) / 100,
        tresorerieProjetee: Math.round(cumul * 100) / 100,
      };
    });

    // La première tranche où la projection passe sous zéro · c'est LA
    // réponse que cherche un trésorier, et elle doit être nommée plutôt que
    // laissée à lire dans une colonne.
    const premiereTrancheNegative = tranches.find((t) => t.tresorerieProjetee < 0) ?? null;

    return {
      dateReference: ref,
      tresorerieActuelle: Math.round(tresorerieActuelle * 100) / 100,
      tranches,
      details,
      alerte: premiereTrancheNegative
        ? {
            tranche: premiereTrancheNegative.cle,
            libelle: premiereTrancheNegative.libelle,
            tresorerieProjetee: premiereTrancheNegative.tresorerieProjetee,
            message:
              `La trésorerie projetée devient négative dans la tranche « ${premiereTrancheNegative.libelle} » ` +
              `(${premiereTrancheNegative.tresorerieProjetee.toFixed(2)}). Les échéances de cette tranche et des ` +
              'suivantes ne pourront pas être honorées sans encaissement supplémentaire.',
          }
        : null,
      // Les échéances non renseignées prennent la date de l'écriture : c'est
      // la règle, mais elle fausse la projection si beaucoup de lignes en
      // relèvent. Le compte est donné pour que le lecteur en juge.
      lignesSansEcheance: lignes.filter((l) => l.dateEcheance === null).length,
    };
  }

  /**
   * BALANCE ÂGÉE · l'antériorité des créances et dettes non lettrées, tiers
   * par tiers, dans la présentation des dossiers de révision réels.
   *
   * ELLE NE VENTILE PLUS PAR TRANCHES GLISSANTES DE TRENTE JOURS, et c'est le
   * cœur de la correction. Un état « 1 à 30 j / 31 à 60 j / 61 à 90 j / + 90 »
   * calculé depuis une date de référence est illisible pour qui doit retrouver
   * la facture : il faut refaire les dates de tête. Le modèle relevé sur un
   * dossier congolais réel (« Balance âgée Client - CARRIGRES au 31-12-2025 »,
   * ouvert cellule par cellule) titre chaque colonne par une PÉRIODE
   * CALENDAIRE, et rappelle l'âge correspondant au-dessus :
   *
   *     |            | 180 j et + | < 150 j | < 120 j | < 90 j | < 60 j | < 30 j |
   *     | avant le   | Du 01/01   | Du 01/08| Du 01/09| Du 01/10|Du 01/11|Du 01/12|
   *     | 01/01/2025 | au 31/07   | au 31/08| au 30/09| au 31/10|au 30/11|au 31/12|
   *
   * Soit sept tranches : les CINQ derniers mois entiers un par un, le reste de
   * l'exercice en un bloc, et tout ce qui précède l'exercice dans une colonne
   * d'ouverture. Un mois est une unité que le comptable manipule ; trente
   * jours glissants n'en sont pas une.
   *
   * DEUXIÈME CORRECTION · la ligne est un TIERS, pas un compte. Un tiers peut
   * porter plusieurs comptes rattachés (un 411 d'exploitation et un 416
   * douteux, typiquement) ; les présenter sur deux lignes éclate son
   * exposition. À défaut de tiers rattaché, la ligne reste le compte, nommé
   * comme tel · c'est encore une anomalie à voir, pas une ligne à masquer.
   *
   * TROISIÈME CORRECTION · les tiers dont le solde est À L'ENVERS ne sont pas
   * ventilés. Un client créditeur n'a pas d'antériorité de créance : le
   * ventiler par âge de retard est un contresens, et il pollue chaque colonne.
   * Ils sont rendus à part, avec leur seul solde et leur propre total. D'où
   * trois totaux, comme chez eux : débiteurs, créditeurs, et le net qui doit
   * RECOUPER la balance auxiliaire des mêmes comptes · c'est le contrôle
   * croisé que le réviseur fait en premier, et il était impossible tant que
   * les deux sens étaient mélangés.
   *
   * Assiette inchangée : les lignes NON LETTRÉES des comptes de tiers, chacune
   * rattachée à son échéance saisie ou, à défaut, à sa date d'écriture (Sage
   * 100 i7 : « reprend la date d'écriture comme échéance si celle-ci n'a pas
   * été saisie »). Chaque ligne pèse son montant NET (débit − crédit) : une
   * correction par inscription en négatif (art. 20 AUDCIF) annule ainsi sa
   * ligne d'origine dans la même tranche au lieu de gonfler deux tranches en
   * sens opposés.
   */
  async balanceAgee(
    tenantId: string,
    params: { exerciceId: string; dateReference?: string; type?: 'CLIENTS_41' | 'FOURNISSEURS' | 'TOUS' },
  ) {
    const exercice = await this.prisma.exercice.findFirstOrThrow({
      where: { id: params.exerciceId, tenantId },
      select: { dateDebut: true, dateFin: true },
    });
    // La date de référence ne peut pas sortir de l'exercice : au-delà, les
    // colonnes mensuelles n'auraient plus d'écriture à recevoir.
    const demande = params.dateReference ? new Date(params.dateReference) : new Date();
    const ref = demande > exercice.dateFin ? exercice.dateFin : demande;
    const type = params.type ?? 'TOUS';
    const racines = type === 'CLIENTS_41' ? ['41'] : type === 'FOURNISSEURS' ? ['40'] : ['40', '41'];

    // --- Les sept tranches ---------------------------------------------
    const jour = (d: Date) => d.toLocaleDateString('fr-FR');
    const MOIS_DETAILLES = 5;
    // Premier jour du mois de la date de référence, puis on remonte.
    const debutsDeMois: Date[] = [];
    for (let i = 0; i < MOIS_DETAILLES; i++) {
      debutsDeMois.unshift(new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - i, 1)));
    }
    const debutFenetre = debutsDeMois[0];
    const tranches: TrancheAgee[] = [];
    const bornes: Array<{ min: Date | null; max: Date | null }> = [];

    tranches.push({
      cle: 'ouverture',
      libellePeriode: `Avant le ${jour(exercice.dateDebut)}`,
      libelleAge: "Antérieur à l'exercice",
    });
    bornes.push({ min: null, max: exercice.dateDebut });

    // Le bloc « reste de l'exercice » n'existe que si l'exercice commence
    // avant la fenêtre mensuelle · sur un exercice de moins de cinq mois, ou
    // une date de référence proche de l'ouverture, il serait vide et faux.
    if (exercice.dateDebut < debutFenetre) {
      const veille = new Date(debutFenetre.getTime() - 86_400_000);
      tranches.push({
        cle: 'ancien',
        libellePeriode: `Du ${jour(exercice.dateDebut)} au ${jour(veille)}`,
        libelleAge: `${MOIS_DETAILLES * 30 + 30} jours et plus`,
      });
      bornes.push({ min: exercice.dateDebut, max: debutFenetre });
    }

    debutsDeMois.forEach((debut, i) => {
      const finMois = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth() + 1, 1));
      const dernierJour = new Date(finMois.getTime() - 86_400_000);
      // Le mois le plus récent est le moins de 30 jours ; on remonte de 30 en
      // 30, comme dans le modèle relevé.
      const age = (MOIS_DETAILLES - i) * 30;
      tranches.push({
        cle: debut.toISOString().slice(0, 7),
        libellePeriode: `Du ${jour(debut)} au ${jour(dernierJour)}`,
        libelleAge: `Moins de ${age} jours`,
      });
      bornes.push({ min: debut, max: finMois });
    });

    const indexTranche = (echeance: Date): number => {
      for (let i = bornes.length - 1; i >= 0; i--) {
        const { min, max } = bornes[i];
        if ((min === null || echeance >= min) && (max === null || echeance < max)) return i;
      }
      // Une échéance postérieure à la fenêtre (saisie en avance) rejoint le
      // mois le plus récent plutôt que de disparaître de l'état.
      return bornes.length - 1;
    };

    // --- Les lignes -----------------------------------------------------
    const [lignes, rattachements] = await Promise.all([
      this.prisma.ligneEcriture.findMany({
        where: {
          ecriture: { tenantId, exerciceId: params.exerciceId },
          lettre: null,
          OR: racines.map((r) => ({ compte: { numero: { startsWith: r } } })),
        },
        include: {
          compte: { select: { id: true, numero: true, intitule: true } },
          ecriture: { select: { date: true } },
        },
      }),
      this.prisma.tiersCompte.findMany({
        where: { tiers: { tenantId } },
        select: { compteId: true, tiers: { select: { id: true, code: true, nom: true } } },
      }),
    ]);
    const tiersDuCompte = new Map(rattachements.map((r) => [r.compteId, r.tiers]));

    const parCle = new Map<string, LigneAgee>();
    for (const l of lignes) {
      const net = Number(l.debit) - Number(l.credit);
      if (Math.abs(net) < 0.005) continue;
      const tiers = tiersDuCompte.get(l.compte.id);
      const cle = tiers ? `tiers:${tiers.id}` : `compte:${l.compte.id}`;
      const entree =
        parCle.get(cle) ??
        ({
          cle,
          // « 410038 - CREC 8 » chez eux · code du tiers, puis son nom.
          libelle: tiers ? `${tiers.code} - ${tiers.nom}` : `${l.compte.numero} - ${l.compte.intitule}`,
          codeTiers: tiers?.code ?? '',
          numero: l.compte.numero,
          montants: tranches.map(() => 0),
          solde: 0,
        } satisfies LigneAgee);
      entree.montants[indexTranche(l.dateEcheance ?? l.ecriture.date)] += net;
      entree.solde += net;
      parCle.set(cle, entree);
    }

    const arrondir = (x: number) => Math.round(x * 100) / 100;
    const toutes = [...parCle.values()]
      .map((c) => ({ ...c, montants: c.montants.map(arrondir), solde: arrondir(c.solde) }))
      .filter((c) => Math.abs(c.solde) >= 0.005 || c.montants.some((m) => Math.abs(m) >= 0.005));

    // Les plus exposés en tête · c'est l'ordre du dossier de révision, et le
    // premier écran doit porter ce qui fait réagir.
    const debiteurs = toutes.filter((c) => c.solde > 0).sort((a, b) => b.solde - a.solde);
    const crediteurs = toutes
      .filter((c) => c.solde <= 0)
      // Un créditeur n'a pas d'antériorité de créance · ses tranches sont
      // vidées plutôt que rendues, pour qu'aucune lecture ne les additionne.
      .map((c) => ({ ...c, montants: [] as number[] }))
      .sort((a, b) => b.solde - a.solde);

    const parTranche = tranches.map((_, i) => arrondir(debiteurs.reduce((t, c) => t + c.montants[i], 0)));
    const totalDebiteurs = arrondir(debiteurs.reduce((t, c) => t + c.solde, 0));
    const totalCrediteurs = arrondir(crediteurs.reduce((t, c) => t + c.solde, 0));

    return {
      dateReference: ref.toISOString().slice(0, 10),
      debutExercice: exercice.dateDebut.toISOString().slice(0, 10),
      type,
      tranches,
      debiteurs,
      crediteurs,
      totaux: {
        parTranche,
        debiteurs: totalDebiteurs,
        crediteurs: totalCrediteurs,
        // Ce net doit recouper le solde de la balance auxiliaire des mêmes
        // comptes · c'est le contrôle croisé du réviseur.
        net: arrondir(totalDebiteurs + totalCrediteurs),
      },
    };
  }

  /**
   * JUSTIFICATIF DE SOLDE · le détail qui compose le solde d'un compte à une
   * date, et son recoupement avec la balance.
   *
   * C'est la pièce maîtresse d'un dossier de révision, et le logiciel n'en
   * produisait aucune. Le dossier ouvert sur le Drive la répète pour une
   * dizaine de comptes (471100 factures à recevoir, 471500 provision fiscale,
   * 472300 charges constatées d'avance, 469150 débiteurs divers, 230000 immos
   * en cours, 270000 immos financières, 360100 stock à l'extérieur, 417000
   * clients douteux…). Sans elle, il faut sortir le grand livre du compte et
   * le retravailler à la main.
   *
   * CE N'EST PAS LE GRAND LIVRE DU COMPTE, et la différence est tout le sujet.
   * Le grand livre est borné à l'exercice ; le justificatif remonte AUSSI LOIN
   * QUE NÉCESSAIRE. Leur détail du compte 469150 arrêté au 31/12/2025 part de
   * 2020 · une créance sur un tiers divers ouverte il y a cinq ans compose
   * encore le solde d'aujourd'hui, et le grand livre de 2025 ne la montre pas.
   *
   * LE PIÈGE DE L'À-NOUVEAU. Remonter tout l'historique et garder les
   * écritures d'à-nouveau double le solde : l'à-nouveau reprend le cumul des
   * exercices antérieurs, qu'on est déjà en train de lister ligne à ligne. Ils
   * sont donc écartés · SAUF ceux du PREMIER exercice du dossier, qui ne
   * reprennent rien mais portent le bilan d'ouverture, c'est-à-dire la
   * position de départ. Les écarter tous ferait disparaître le point de
   * départ d'un dossier repris en cours de vie, silencieusement.
   *
   * LE RECOUPEMENT est calculé par un AUTRE CHEMIN que la liste : report
   * (à-nouveaux) plus mouvements de l'exercice, comme la balance. Recouper la
   * liste contre elle-même ne prouverait rien ; la recouper contre la balance
   * attrape précisément le double comptage ci-dessus.
   */
  async justificatifSolde(
    tenantId: string,
    params: { compteId: string; exerciceId: string; dateArret?: string; masquerLettrees?: boolean },
  ) {
    const [compte, exercice, premierExercice] = await Promise.all([
      this.prisma.compte.findFirstOrThrow({
        where: { id: params.compteId, tenantId },
        select: { id: true, numero: true, intitule: true },
      }),
      this.prisma.exercice.findFirstOrThrow({
        where: { id: params.exerciceId, tenantId },
        select: { id: true, dateDebut: true, dateFin: true },
      }),
      this.prisma.exercice.findFirstOrThrow({
        where: { tenantId },
        orderBy: { dateDebut: 'asc' },
        select: { id: true },
      }),
    ]);
    const demande = params.dateArret ? new Date(params.dateArret) : exercice.dateFin;
    const arret = demande > exercice.dateFin ? exercice.dateFin : demande;

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        compteId: compte.id,
        ...(params.masquerLettrees ? { lettre: null } : {}),
        ecriture: {
          tenantId,
          date: { lte: arret },
          // Les à-nouveaux de clôture sont exclus · voir le piège ci-dessus.
          // Ceux du premier exercice portent le bilan d'ouverture et restent.
          NOT: { AND: [{ estGenereeParCloture: true }, { exerciceId: { not: premierExercice.id } }] },
        },
      },
      include: {
        devise: { select: { code: true } },
        ecriture: {
          select: {
            date: true,
            libelle: true,
            reference: true,
            numeroPiece: true,
            estGenereeParCloture: true,
            journal: { select: { code: true } },
          },
        },
      },
      orderBy: [{ ecriture: { date: 'asc' } }, { id: 'asc' }],
    });

    const arrondir = (x: number) => Math.round(x * 100) / 100;
    const detail = lignes.map((l) => ({
      ligneId: l.id,
      date: l.ecriture.date,
      journal: l.ecriture.journal.code,
      numeroPiece: l.ecriture.numeroPiece,
      reference: l.ecriture.reference ?? '',
      // Le libellé de la ligne prime · c'est lui qui nomme l'opération. À
      // défaut, celui de l'écriture, jamais rien.
      libelle: l.libelle ?? l.ecriture.libelle,
      debit: Number(l.debit),
      credit: Number(l.credit),
      deviseTransaction: l.devise?.code ?? '',
      montantDevise: l.montantDevise === null ? null : Number(l.montantDevise),
      lettre: l.lettre ?? '',
      estANouveau: l.ecriture.estGenereeParCloture,
    }));

    const totalDebit = arrondir(detail.reduce((t, l) => t + l.debit, 0));
    const totalCredit = arrondir(detail.reduce((t, l) => t + l.credit, 0));
    const solde = arrondir(totalDebit - totalCredit);

    // --- Recoupement, par l'autre chemin ---------------------------------
    const agregat = await this.prisma.ligneEcriture.aggregate({
      where: { compteId: compte.id, ecriture: { tenantId, exerciceId: params.exerciceId } },
      _sum: { debit: true, credit: true },
    });
    const soldeBalance = arrondir(Number(agregat._sum.debit ?? 0) - Number(agregat._sum.credit ?? 0));
    const ecart = arrondir(solde - soldeBalance);
    // Le recoupement n'a de sens qu'à la clôture · à une date intermédiaire,
    // la balance de l'exercice porte des mouvements postérieurs à l'arrêté, et
    // annoncer un écart serait une fausse alerte.
    const arreteALaCloture = arret.getTime() === exercice.dateFin.getTime();

    return {
      compte,
      dateArret: arret.toISOString().slice(0, 10),
      masquerLettrees: params.masquerLettrees ?? false,
      lignes: detail,
      totaux: { debit: totalDebit, credit: totalCredit, solde },
      recoupement: {
        applicable: arreteALaCloture && !params.masquerLettrees,
        soldeBalance,
        ecart,
        concordant: Math.abs(ecart) < 0.005,
      },
    };
  }

  /** Grand livre d'un compte : ses lignes avec solde progressif. */
  async grandLivre(tenantId: string, compteId: string, exerciceId?: string) {
    const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
    if (!compte) {
      throw new BadRequestException('Compte introuvable pour ce tenant');
    }

    const perimetreEcriture = { tenantId, ...(exerciceId ? { exerciceId } : {}) };

    const [lignes, contreparties] = await Promise.all([
      this.prisma.ligneEcriture.findMany({
        where: { compteId, ecriture: perimetreEcriture },
        include: { ecriture: { include: { journal: true } } },
        orderBy: EcritureService.TRI_GRAND_LIVRE,
      }),
      // Restreint aux seules écritures qui touchent ce compte.
      this.chargerContreparties({
        ecriture: { ...perimetreEcriture, lignes: { some: { compteId } } },
      }),
    ]);

    let solde = 0;
    const lignesAvecSolde = lignes.map((l) => {
      solde += Number(l.debit) - Number(l.credit);
      return EcritureService.versLigneGrandLivre(l, solde, contreparties);
    });

    return { compte, lignes: lignesAvecSolde, soldeFinal: solde };
  }

  /**
   * Grand livre COMPLET : tous les comptes mouvementés de l'exercice, chacun
   * avec ses lignes et son solde progressif propre. C'est la forme
   * réellement exploitable pour un audit · un auditeur veut le grand livre
   * entier d'un coup, pas compte par compte.
   *
   * Deux requêtes plates (les lignes, puis les contreparties agrégées par
   * écriture) puis regroupement en mémoire : ni N+1, ni duplication
   * quadratique de l'écriture · voir `chargerContreparties`.
   *
   * Les comptes Total (§3.1) n'apparaissent jamais : ils ne portent aucun
   * mouvement propre par construction (imposé par `creer()`), donc aucune
   * ligne ne les référence.
   */
  async grandLivreComplet(tenantId: string, exerciceId?: string) {
    const perimetreEcriture = { tenantId, ...(exerciceId ? { exerciceId } : {}) };

    const [lignes, contreparties] = await Promise.all([
      this.prisma.ligneEcriture.findMany({
        where: { ecriture: perimetreEcriture },
        include: { compte: true, ecriture: { include: { journal: true } } },
        orderBy: [{ compte: { numero: 'asc' } }, ...EcritureService.TRI_GRAND_LIVRE],
      }),
      this.chargerContreparties({ ecriture: perimetreEcriture }),
    ]);

    const parCompte = new Map<
      string,
      {
        compte: { id: string; numero: string; intitule: string };
        lignes: ReturnType<typeof EcritureService.versLigneGrandLivre>[];
        solde: number;
      }
    >();

    for (const l of lignes) {
      let entree = parCompte.get(l.compteId);
      if (!entree) {
        entree = {
          compte: { id: l.compte.id, numero: l.compte.numero, intitule: l.compte.intitule },
          lignes: [],
          solde: 0,
        };
        parCompte.set(l.compteId, entree);
      }
      entree.solde += Number(l.debit) - Number(l.credit);
      entree.lignes.push(EcritureService.versLigneGrandLivre(l, entree.solde, contreparties));
    }

    return (
      [...parCompte.values()]
        .map((e) => ({
          compte: e.compte,
          lignes: e.lignes,
          soldeFinal: e.solde,
          totalDebit: e.lignes.reduce((s, l) => s + l.debit, 0),
          totalCredit: e.lignes.reduce((s, l) => s + l.credit, 0),
        }))
        // Même filtre que `balance()` : un compte dont tous les mouvements
        // sont à 0/0 n'y figure pas non plus. Sans cet alignement, deux états
        // exportés le même jour ne listent pas les mêmes comptes · écart que
        // relèverait immédiatement un auditeur.
        .filter((c) => c.totalDebit !== 0 || c.totalCredit !== 0)
    );
  }

  /**
   * Balance : solde débit/crédit cumulé par compte sur l'exercice.
   *
   * Chaque ligne porte AUSSI la même somme scindée en deux :
   *
   * - `reportDebit` / `reportCredit` · les lignes issues d'écritures générées
   *   par la clôture (`estGenereeParCloture`). Pour un compte de bilan c'est le
   *   report à-nouveau, donc la SITUATION À L'OUVERTURE de l'exercice.
   * - `mouvementDebit` / `mouvementCredit` · tout le reste, c'est-à-dire les
   *   MOUVEMENTS PROPRES de l'exercice.
   *
   * Cette scission n'est pas un raffinement : sans elle, `totalDebit` d'un
   * compte d'immobilisation englobe le report à-nouveau, et un bâtiment détenu
   * depuis 2020 serait présenté comme une acquisition de l'exercice dans les
   * notes 5A à 5F (« AUGMENTATIONS B »). Les tableaux de situations et
   * mouvements du texte officiel (Partie 4, ch. 2, notes 5A-5F et 30) exigent
   * précisément cette distinction.
   *
   * Réserve, à connaître avant de lire `report*` sur un compte de gestion :
   * pour un exercice CLÔTURÉ, l'écriture de solde des classes 6 et 7 porte le
   * même drapeau. Sur une classe 6 ou 7, `report*` est donc la contrepassation
   * de clôture, pas une ouverture · les charges et les produits ne se
   * reportent pas. `mouvement*` reste, lui, juste dans tous les cas.
   */
  /**
   * Balance générale.
   *
   * `inclureBrouillard` vaut vrai pour les états de TRAVAIL : le comptable
   * doit voir où il en est, brouillard compris. Les états LÉGAUX (bilan,
   * compte de résultat, tableau de flux, livre d'inventaire, notes annexes)
   * passent faux et ne lisent que le livre-journal · un état financier bâti
   * sur des écritures non validées n'engagerait personne.
   */
  /**
   * BALANCE GÉNÉRALE · la fonction la plus sollicitée du logiciel. Les états
   * financiers, les exports, l'analytique et le plan comptable en dépendent
   * tous, et sa lenteur se voit donc partout.
   *
   * Deux choses la rendaient lente, l'une et l'autre corrigées ici.
   *
   * 1. ELLE RAPATRIAIT TOUTES LES LIGNES. Un `include: { lignesEcriture }`
   *    transférait chaque ligne d'écriture de l'exercice, plus son écriture
   *    parente, pour n'en faire que six sommes. Un dossier de dix mille
   *    lignes transportait dix mille objets sur le réseau pour produire une
   *    page. Deux `groupBy` font désormais la somme DANS Postgres et ne
   *    ramènent qu'une ligne par compte. Deux et non un, parce que la
   *    distinction report / mouvement tient à `estGenereeParCloture`, porté
   *    par l'écriture et non par la ligne : le groupement se fait donc une
   *    fois de chaque côté du filtre.
   *
   * 2. ELLE AGRÉGEAIT LES COMPTES TOTAL, ET PLUS PERSONNE N'EN VOULAIT.
   *    Chaque compte Total balayait la liste entière des comptes pour trouver
   *    ses enfants par `startsWith` · un travail en N² qui a d'abord été rendu
   *    linéaire, puis retiré.
   *
   * UNE BALANCE GÉNÉRALE LISTE LES COMPTES MOUVEMENTÉS, PAS UNE HIÉRARCHIE.
   *
   * Les lignes de sous-totalisation par compte principal (10, 40, 60…) ont
   * été retirées à la demande du cabinet : une balance se lit compte par
   * compte, dans l'ordre croissant des numéros, et les sous-totaux d'une
   * arborescence y ajoutent des lignes que personne ne pointe. Ils n'étaient
   * d'ailleurs consommés NULLE PART · les six appelants internes (états
   * financiers, fiscalité, groupe, exports) les écartaient tous par le même
   * `filter(l => l.typeCompte !== TOTAL)`, chacun pour la même raison :
   * additionner un agrégat déjà compté dans ses enfants double les montants.
   *
   * CE QUI RESTE DANS LA LISTE, et pourquoi : tout compte de détail qui a un
   * mouvement, y compris ceux dont le solde retombe à zéro (un débit de 100
   * et un crédit de 100). Les exclure casserait l'égalité de la balance
   * elle-même, dont les colonnes de totaux additionnent des MOUVEMENTS et non
   * des soldes · un compte soldé a bougé, et sa ligne le prouve.
   */
  async balance(tenantId: string, exerciceId: string, inclureBrouillard = true) {
    const filtreEcriture = {
      tenantId,
      exerciceId,
      ...(inclureBrouillard ? {} : { statut: StatutEcriture.VALIDEE }),
    };
    const [comptes, reports, mouvements] = await Promise.all([
      this.prisma.compte.findMany({ where: { tenantId }, orderBy: { numero: 'asc' } }),
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        where: { ecriture: { ...filtreEcriture, estGenereeParCloture: true } },
        _sum: { debit: true, credit: true },
      }),
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        where: { ecriture: { ...filtreEcriture, estGenereeParCloture: false } },
        _sum: { debit: true, credit: true },
      }),
    ]);

    /** Les six agrégats d'une ligne, résolus pareillement pour Détail et Total. */
    const CHAMPS = ['totalDebit', 'totalCredit', 'reportDebit', 'reportCredit', 'mouvementDebit', 'mouvementCredit'] as const;
    type Agregats = Record<(typeof CHAMPS)[number], number>;
    const zero = (): Agregats => ({
      totalDebit: 0,
      totalCredit: 0,
      reportDebit: 0,
      reportCredit: 0,
      mouvementDebit: 0,
      mouvementCredit: 0,
    });

    const soldeDirectParCompte = new Map<string, Agregats>();
    const accumuler = (
      groupes: Array<{ compteId: string; _sum: { debit: unknown; credit: unknown } }>,
      champDebit: 'reportDebit' | 'mouvementDebit',
      champCredit: 'reportCredit' | 'mouvementCredit',
    ) => {
      for (const g of groupes) {
        const a = soldeDirectParCompte.get(g.compteId) ?? zero();
        const d = Number(g._sum.debit ?? 0);
        const c = Number(g._sum.credit ?? 0);
        a[champDebit] += d;
        a[champCredit] += c;
        a.totalDebit += d;
        a.totalCredit += c;
        soldeDirectParCompte.set(g.compteId, a);
      }
    };
    accumuler(reports, 'reportDebit', 'reportCredit');
    accumuler(mouvements, 'mouvementDebit', 'mouvementCredit');

    // Les comptes Total sont écartés d'emblée · ils ne reçoivent jamais
    // d'écriture (un numéro à deux ou trois chiffres est structurellement
    // impossible à saisir, CreerCompteDto en exige trois à treize) et ne
    // portaient qu'une sous-totalisation d'affichage dont plus personne ne
    // veut. Le tri croissant vient du `orderBy` de la requête.
    const lignesBalance = comptes
      .filter((c) => c.typeCompte !== TypeCompteDetailTotal.TOTAL)
      .map((c) => {
        const agregats = soldeDirectParCompte.get(c.id) ?? zero();
        return {
          compteId: c.id,
          numero: c.numero,
          intitule: c.intitule,
          classe: c.classe,
          typeCompte: c.typeCompte,
          ...agregats,
          solde: agregats.totalDebit - agregats.totalCredit,
        };
      })
      .filter((l) => l.totalDebit !== 0 || l.totalCredit !== 0);

    return {
      lignes: lignesBalance,
      totaux: {
        debit: lignesBalance.reduce((s, l) => s + l.totalDebit, 0),
        credit: lignesBalance.reduce((s, l) => s + l.totalCredit, 0),
      },
    };
  }

  /**
   * BALANCE AUXILIAIRE · la balance des comptes de tiers, tiers par tiers.
   *
   * Ce n'est pas la balance âgée, et la confusion coûte cher : la balance
   * âgée ventile un solde par tranche de retard, la balance auxiliaire porte
   * les MOUVEMENTS de la période et le solde qui en résulte, tiers par tiers.
   * Un réviseur lit la seconde pour circulariser et rapprocher, la première
   * pour apprécier le risque de non-recouvrement. Le logiciel savait produire
   * la balance âgée et pas la balance auxiliaire.
   *
   * Ce que le SYSCOHADA appelle « comptes rattachés » (AUDCIF, comptes 40 et
   * 41) est ici la table TiersCompte : un compte de détail par tiers, rattaché
   * à un compte collectif par sa racine. La balance auxiliaire est donc la
   * balance générale restreinte à ces racines, augmentée du code et du nom du
   * tiers.
   *
   * UN COMPTE DE TIERS SANS TIERS RATTACHÉ N'EST PAS ÉCARTÉ. C'est même la
   * ligne la plus utile de l'état : un 411 mouvementé que personne ne
   * réclame est soit un tiers non créé, soit une imputation directe sur le
   * compte collectif · dans les deux cas la circularisation passera à côté.
   * Il ressort avec un code et un nom vides, et le drapeau `sansTiers`.
   */
  async balanceAuxiliaire(
    tenantId: string,
    params: { exerciceId: string; type?: 'CLIENTS' | 'FOURNISSEURS' | 'TOUS'; inclureBrouillard?: boolean },
  ) {
    const type = params.type ?? 'TOUS';
    const racines = type === 'CLIENTS' ? ['41'] : type === 'FOURNISSEURS' ? ['40'] : ['40', '41'];

    const [{ lignes }, rattachements] = await Promise.all([
      this.balance(tenantId, params.exerciceId, params.inclureBrouillard ?? true),
      this.prisma.tiersCompte.findMany({
        where: { tiers: { tenantId } },
        select: { compteId: true, tiers: { select: { code: true, nom: true, type: true } } },
      }),
    ]);
    const parCompte = new Map(rattachements.map((r) => [r.compteId, r.tiers]));

    const arrondi = (x: number) => Math.round(x * 100) / 100;
    const comptes = lignes
      .filter((l) => racines.some((r) => l.numero.startsWith(r)))
      .map((l) => {
        const tiers = parCompte.get(l.compteId);
        const solde = arrondi(l.totalDebit - l.totalCredit);
        return {
          compteId: l.compteId,
          numero: l.numero,
          intitule: l.intitule,
          codeTiers: tiers?.code ?? '',
          nomTiers: tiers?.nom ?? '',
          sansTiers: !tiers,
          reportDebit: arrondi(l.reportDebit),
          reportCredit: arrondi(l.reportCredit),
          mouvementDebit: arrondi(l.mouvementDebit),
          mouvementCredit: arrondi(l.mouvementCredit),
          // Les deux colonnes de solde s'excluent · un compte est débiteur OU
          // créditeur, jamais les deux. C'est la présentation des dossiers de
          // révision : « Solde Debit » et « Solde Credit » en regard.
          soldeDebit: solde > 0 ? solde : 0,
          soldeCredit: solde < 0 ? -solde : 0,
          solde,
        };
      })
      .sort((a, b) => a.numero.localeCompare(b.numero) || a.codeTiers.localeCompare(b.codeTiers));

    const somme = (cle: 'reportDebit' | 'reportCredit' | 'mouvementDebit' | 'mouvementCredit' | 'soldeDebit' | 'soldeCredit' | 'solde') =>
      arrondi(comptes.reduce((t, c) => t + c[cle], 0));

    return {
      type,
      comptes,
      totaux: {
        reportDebit: somme('reportDebit'),
        reportCredit: somme('reportCredit'),
        mouvementDebit: somme('mouvementDebit'),
        mouvementCredit: somme('mouvementCredit'),
        soldeDebit: somme('soldeDebit'),
        soldeCredit: somme('soldeCredit'),
        solde: somme('solde'),
      },
    };
  }
}

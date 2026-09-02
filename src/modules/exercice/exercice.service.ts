import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { GranulariteCloture, ModeReportANouveau, Prisma, StatutEcriture, StatutExercice, TypeJournal } from '@prisma/client';
import { CreerExerciceDto } from './dto/creer-exercice.dto';
import { ClorePartielleDto, CloreTotaleDto, ClorePeriodeDto } from './dto/cloture.dto';
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
    return client.exercice.create({ data: { tenantId, dateDebut, dateFin } });
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
   * Les échéances légales sont indicatives et sourcées : elles viennent d'un
   * cours du CPCC de novembre 2020, antérieur au SYCEBNL, et n'ont pas été
   * reverifiées sur texte primaire (les textes congolais ne sont pas
   * accessibles depuis cet environnement). Voir docs/organisation-comptable-cpcc.md
   * § 6. Le logiciel ne calcule aucune astreinte.
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
   * Compte 13 réel (§ COMPTE 13, skill sycebnl `partie2-ch3-classe1-comptes10-19.md`) :
   * "131 Résultat net de l'exercice : Excédent" (solde créditeur) ou "139 ...
   * Déficit" (solde débiteur) · il n'existe PAS de compte 130 générique dans
   * le plan officiel. Choisi par le signe une fois `deltaResultat` connu.
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
  private async trouverCompteResultat(tenantId: string, tx: Prisma.TransactionClient, deficitaire: boolean) {
    const numero = deficitaire ? '13900000' : '13100000';
    const intitule = deficitaire ? "Déficit de l'exercice (139)" : "Excédent de l'exercice (131)";
    const compte = await tx.compte.findUnique({ where: { tenantId_numero: { tenantId, numero } } });
    if (!compte) {
      throw new BadRequestException(
        `Compte ${numero} (${intitule}) introuvable pour ce dossier · nécessaire pour clôturer l'exercice. Le plan de comptes SYCEBNL de ce dossier semble incomplet ou avoir été modifié.`,
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
   * Limite connue, non corrigée à ce stade (à traiter par une future brique
   * "Affectation du résultat", pas construite) : le texte officiel prévoit
   * que le compte 13 soit soldé par virement vers 12/11/10 sur décision des
   * organes compétents, pas reporté indéfiniment sur lui-même. Faute de cette
   * brique, le solde de 131/139 continue aujourd'hui à s'accumuler d'exercice
   * en exercice via le report à-nouveau (mode SOLDE, comme tout compte de
   * bilan) au lieu d'être remis à zéro par une affectation · signalé ici
   * explicitement plutôt que laissé silencieux (règle §2.6).
   */
  async cloturer(tenantId: string, exerciceId: string, userId: string) {
    const exercice = await this.trouverExercice(tenantId, exerciceId);
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
            const compteResultat = await this.trouverCompteResultat(tenantId, tx, deltaResultat > 0);
            compteResultatId = compteResultat.id;
            lignesCloture.push({
              compteId: compteResultat.id,
              debit: deltaResultat > 0 ? deltaResultat : 0,
              credit: deltaResultat < 0 ? -deltaResultat : 0,
              libelle: deltaResultat > 0 ? "Déficit de l'exercice" : "Excédent de l'exercice",
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
          const dateDebut = new Date(exercice.dateFin);
          dateDebut.setUTCDate(dateDebut.getUTCDate() + 1);
          const dureeMs = exercice.dateFin.getTime() - exercice.dateDebut.getTime();
          const dateFin = new Date(dateDebut.getTime() + dureeMs);
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

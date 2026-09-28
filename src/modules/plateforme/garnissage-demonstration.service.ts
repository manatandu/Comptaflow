import { BadRequestException, Injectable } from '@nestjs/common';
import { PeriodiciteRemuneration, StatutBulletinPaie, StatutExercice } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { TiersService } from '../tiers/tiers.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ImmobilisationService } from '../immobilisations/immobilisation.service';
import { PersonnelService } from '../personnel/personnel.service';
import { motifsRefusEmission } from '../personnel/bulletin-paie';
import { RapprochementService } from '../rapprochement/rapprochement.service';
import { QuestionnaireService } from '../questionnaire/questionnaire.service';
import { LigneDemo, ScenarioDemo, scenarioDemonstration } from './scenario-demonstration';

/**
 * GARNIR UN DOSSIER DE DÉMONSTRATION · le scénario de
 * `scenario-demonstration.ts`, joué par les chemins ORDINAIRES du logiciel :
 * les tiers par `TiersService.creer` (qui pose leur compte individuel), les
 * écritures par `EcritureService.creer` (numérotation du journal, date dans
 * l'exercice, équilibre), puis la validation. Aucune ligne n'est écrite à la
 * main en base · une vitrine qui passerait à côté des contrôles montrerait un
 * logiciel qui n'existe pas.
 *
 * Les écritures sont VALIDÉES · les états financiers ne lisent que le
 * livre-journal, et une vitrine au brouillard montrerait un bilan vide.
 *
 * Appelé par la console, dans une sortie de cloisonnement déclarée
 * (`PlateformeService.preparerDossierDemonstration`) · le dossier garni n'est
 * pas celui de la session de l'opérateur.
 *
 * IL SE REPREND (audit final F174) · un garnissage interrompu laissait une
 * vitrine marquée, à moitié garnie, que la console refusait ensuite de
 * refaire (« un seul dossier de démonstration »). Rejoué, il retrouve ce qui
 * existe · le tiers par son code, l'écriture par son journal, sa date et son
 * libellé · et ne crée que le reste. `crees` dit ce qui a été ajouté.
 *
 * LA VITRINE DES INVESTISSEURS (2026-09-28) · au-delà du journal, le dossier
 * reçoit des immobilisations et leur plan, un salarié, son contrat et un
 * bulletin émis, un premier rapprochement bancaire et un questionnaire de
 * révision ouvert, chacun par le service de sa fenêtre. TOUT PASSE AVANT LA
 * VALIDATION, qui reste le dernier geste · c'est elle que la console lit pour
 * savoir si une vitrine est à reprendre (`reprendreGarnissage`), et un
 * élément ajouté après elle ne serait jamais complété. Chaque élément se
 * retrouve à la reprise · le bien par sa désignation, le salarié par son
 * matricule, le contrat par son salarié, le bulletin par son mois, le
 * rapprochement par son compte, le questionnaire par son libellé.
 *
 * CE QUI NE PEUT PAS SE FAIRE SE DIT · un bulletin que la simulation ne sait
 * pas chiffrer (un mois hors du barème de l'art. 118) n'est pas émis, et le
 * motif revient dans `ecartes` au lieu d'arrêter la vitrine ou d'être tu.
 */
@Injectable()
export class GarnissageDemonstrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tiers: TiersService,
    private readonly ecritures: EcritureService,
    private readonly immobilisations: ImmobilisationService,
    private readonly personnel: PersonnelService,
    private readonly rapprochements: RapprochementService,
    private readonly questionnaires: QuestionnaireService,
  ) {}

  async garnir(tenantId: string, auteurId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { referentiel: true } });
    const scenario = scenarioDemonstration(tenant.referentiel);
    const exercice = await this.prisma.exercice.findFirst({
      where: { tenantId, statut: StatutExercice.OUVERT },
      orderBy: { dateDebut: 'desc' },
    });
    if (!exercice) throw new BadRequestException('Le dossier de démonstration n’a pas d’exercice ouvert.');
    const annee = exercice.dateDebut.toISOString().slice(0, 4);

    const journaux = await this.prisma.journal.findMany({ where: { tenantId }, select: { id: true, code: true, compteTresorerieId: true } });
    const journal = (code: string) => {
      const j = journaux.find((x) => x.code === code);
      if (!j) throw new BadRequestException(`Journal ${code} absent du dossier de démonstration.`);
      return j;
    };
    const banque = journal('BQ').compteTresorerieId;
    if (!banque) throw new BadRequestException('Le journal BQ n’a pas de compte de trésorerie.');

    const numeros = [...new Set(scenario.operations.flatMap((o) => o.lignes.flatMap((l) => ('nature' in l ? [l.nature] : []))))];
    const comptes = await this.prisma.compte.findMany({ where: { tenantId, numero: { in: numeros } }, select: { id: true, numero: true } });
    let crees = 0;
    const compteTiers = new Map<string, string>();
    for (const t of scenario.tiers) {
      const deja = await this.prisma.tiers.findUnique({
        where: { tenantId_code: { tenantId, code: t.code } },
        select: { comptesRattaches: { where: { estPrincipal: true }, select: { compteId: true } } },
      });
      if (deja) {
        const principal = deja.comptesRattaches[0]?.compteId;
        if (!principal) throw new BadRequestException(`Le tiers ${t.code} existe sans compte principal · la vitrine ne se complète pas.`);
        compteTiers.set(t.code, principal);
        continue;
      }
      const cree = await this.tiers.creer(tenantId, { code: t.code, nom: t.nom, type: t.type });
      if (!cree.compteIndividuel) throw new BadRequestException(`Le tiers ${t.code} n’a pas reçu de compte individuel.`);
      compteTiers.set(t.code, cree.compteIndividuel.id);
      crees++;
    }
    const compteDe = (l: LigneDemo): string => {
      if ('tresorerie' in l) return banque;
      if ('tiers' in l) return compteTiers.get(l.tiers)!;
      const c = comptes.find((x) => x.numero === l.nature);
      if (!c) throw new BadRequestException(`Le compte ${l.nature} n’existe pas dans le plan de ce dossier.`);
      return c.id;
    };

    const ids: string[] = [];
    for (const op of scenario.operations) {
      const date = `${annee}-${op.jour}`;
      const deja = await this.prisma.ecriture.findFirst({
        where: { tenantId, exerciceId: exercice.id, journalId: journal(op.journal).id, date: new Date(`${date}T00:00:00Z`), libelle: op.libelle },
        select: { id: true },
      });
      if (deja) {
        ids.push(deja.id);
        continue;
      }
      const e = await this.ecritures.creer(tenantId, auteurId, {
        exerciceId: exercice.id,
        journalId: journal(op.journal).id,
        date,
        libelle: op.libelle,
        reference: op.reference,
        lignes: op.lignes.map((l) => ({
          compteId: compteDe(l),
          libelle: op.libelle,
          debit: l.sens === 'DEBIT' ? l.montant : 0,
          credit: l.sens === 'CREDIT' ? l.montant : 0,
        })),
      });
      ids.push(e.id);
      crees++;
    }

    const ouverture = exercice.dateDebut.toISOString().slice(0, 10);
    const ctx: Contexte = { tenantId, auteurId, exerciceId: exercice.id, annee, ouverture, banque, journalBanque: journal('BQ').id };
    const immos = await this.garnirImmobilisations(ctx, scenario);
    ids.push(...immos.ecritures);
    const ecartes: string[] = [];
    const paie = await this.garnirPersonnel(ctx, scenario, ecartes);
    const rapprochement = await this.garnirRapprochement(ctx, scenario, ids);
    const questionnaire = await this.garnirQuestionnaire(ctx, scenario);
    crees += immos.crees + paie.crees + rapprochement.crees + questionnaire.crees;

    // EN DERNIER · voir l'en-tête, c'est ce geste qui dit la vitrine achevée.
    await this.ecritures.valider(tenantId, auteurId, ids);
    return {
      tiers: scenario.tiers.length,
      ecritures: ids.length,
      immobilisations: scenario.immobilisations.length,
      bulletins: paie.bulletins,
      crees,
      ecartes,
    };
  }

  /** Les biens, retrouvés par leur désignation · leur écriture d'acquisition rejoint la validation. */
  private async garnirImmobilisations(ctx: Contexte, scenario: ScenarioDemo) {
    const familles = await this.prisma.familleImmobilisation.findMany({
      where: { tenantId: ctx.tenantId, code: { in: [...new Set(scenario.immobilisations.map((i) => i.famille))] } },
      select: { id: true, code: true },
    });
    const ecritures: string[] = [];
    let crees = 0;
    for (const i of scenario.immobilisations) {
      const deja = await this.prisma.immobilisation.findFirst({
        where: { tenantId: ctx.tenantId, designation: i.designation },
        select: { ecritureAcquisitionId: true },
      });
      if (deja) {
        if (deja.ecritureAcquisitionId) ecritures.push(deja.ecritureAcquisitionId);
        continue;
      }
      const famille = familles.find((f) => f.code === i.famille);
      if (!famille) throw new BadRequestException(`La famille d'immobilisations ${i.famille} n'existe pas dans ce dossier.`);
      const date = `${ctx.annee}-${i.jour}`;
      // Payé comptant par la banque du journal BQ · aucun numéro choisi ici,
      // la famille porte ses comptes et sa durée (arrêté n° 013/2025).
      const bien = await this.immobilisations.creer(ctx.tenantId, ctx.auteurId, {
        familleId: famille.id,
        designation: i.designation,
        numeroInventaire: i.numeroInventaire,
        dateAcquisition: date,
        dateMiseEnService: date,
        valeurOrigine: i.valeur,
        exerciceId: ctx.exerciceId,
        journalId: ctx.journalBanque,
        compteContrepartieId: ctx.banque,
      });
      if (bien.ecritureAcquisitionId) ecritures.push(bien.ecritureAcquisitionId);
      crees++;
    }
    return { ecritures, crees };
  }

  /** Le salarié par son matricule, le contrat par son salarié, le bulletin par son mois. */
  private async garnirPersonnel(ctx: Contexte, scenario: ScenarioDemo, ecartes: string[]) {
    const s = scenario.salarie;
    let crees = 0;
    const existant = await this.prisma.salarie.findFirst({
      where: { tenantId: ctx.tenantId, matricule: s.matricule },
      select: { id: true },
    });
    let salarieId = existant?.id;
    if (!salarieId) {
      const cree = await this.personnel.creerSalarie(ctx.tenantId, ctx.auteurId, {
        matricule: s.matricule,
        nom: s.nom,
        prenoms: s.prenoms,
        sexe: s.sexe,
        nationalite: s.nationalite,
      });
      salarieId = cree.id;
      crees++;
    }

    const contrat = await this.prisma.contratTravail.findFirst({
      where: { tenantId: ctx.tenantId, salarieId },
      select: { id: true },
    });
    if (!contrat) {
      await this.personnel.creerContrat(ctx.tenantId, ctx.auteurId, salarieId, {
        type: s.type,
        dateEntreeEnVigueur: ctx.ouverture,
        natureTravail: s.natureTravail,
        periodiciteRemuneration: PeriodiciteRemuneration.MOIS,
        remunerationBase: s.remunerationMensuelleFc,
        // LA MONNAIE N'EST JAMAIS OMISE · un montant convenu sans elle est
        // refusé (décision du 2026-09-28, `motifMonnaieExigee`).
        deviseRemuneration: 'CDF',
      });
      crees++;
    }

    const moisDePaie = `${ctx.annee}-${s.moisBulletin}`;
    const emis = await this.prisma.bulletinPaie.findFirst({
      where: { tenantId: ctx.tenantId, salarieId, moisDePaie, statut: StatutBulletinPaie.EMIS },
      select: { id: true },
    });
    if (emis) return { crees, bulletins: 1 };
    const saisie = {
      moisDePaie,
      deviseStipulation: 'CDF' as const,
      elements: [{ nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire de base', montantFc: s.remunerationMensuelleFc }],
      // DÉCLARÉS, jamais présumés par le moteur · une association comme une
      // SARL est un employeur PRIVÉ au sens de l'arrêté INPP, l'effectif est
      // celui du registre de la vitrine, le régime celui du barème, et zéro
      // personne à charge est ce que le registre fictif porte.
      natureEmployeurInpp: 'PRIVE',
      effectif: 1,
      regimeSalarial: 'BAREME_ARTICLE_118' as const,
      personnesACharge: 0,
    };
    // LA MÊME RÈGLE QUE L'ÉMISSION · simulée d'abord, pour ne pas lever sur un
    // mois que le moteur ne chiffre pas, ni avaler un refus d'une autre nature.
    const motifs = motifsRefusEmission(await this.personnel.simulerPaie(ctx.tenantId, salarieId, saisie));
    if (motifs.length > 0) {
      ecartes.push(`Bulletin de ${moisDePaie} non émis · ${motifs.join(' ')}`);
      return { crees, bulletins: 0 };
    }
    await this.personnel.emettreBulletin(ctx.tenantId, ctx.auteurId, salarieId, saisie);
    return { crees: crees + 1, bulletins: 1 };
  }

  /**
   * Le premier rapprochement du compte de banque, retrouvé par son compte.
   * Le relevé fictif porte exactement les lignes de banque de la vitrine
   * datées au plus tard du jour du relevé · son solde est leur somme vue du
   * compte, et le départ est DÉCLARÉ à zéro à l'ouverture de l'exercice, le
   * dossier naissant sans banque (règle (6) du relevé bancaire · jamais
   * déduit). Pointer est idempotent · une ligne déjà pointée sur lui se
   * repointe sans effet.
   */
  private async garnirRapprochement(ctx: Contexte, scenario: ScenarioDemo, ecrituresVitrine: string[]) {
    const dateReleve = `${ctx.annee}-${scenario.jourReleve}`;
    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        compteId: ctx.banque,
        ecritureId: { in: ecrituresVitrine },
        ecriture: { tenantId: ctx.tenantId, date: { lte: new Date(`${dateReleve}T00:00:00Z`) } },
      },
      select: { id: true, debit: true, credit: true },
    });
    let crees = 0;
    let r: { id: string; soldeDepartDeclare: unknown } | null = await this.prisma.rapprochementBancaire.findFirst({
      where: { tenantId: ctx.tenantId, compteId: ctx.banque },
      select: { id: true, soldeDepartDeclare: true },
    });
    if (!r) {
      const solde = lignes.reduce((acc, l) => acc + Number(l.debit) - Number(l.credit), 0);
      r = await this.rapprochements.ouvrir(ctx.tenantId, ctx.auteurId, {
        compteId: ctx.banque,
        dateReleve,
        soldeReleve: Math.round(solde * 100) / 100,
      });
      crees++;
    }
    if (r.soldeDepartDeclare === null || r.soldeDepartDeclare === undefined) {
      await this.rapprochements.declarerDepart(ctx.tenantId, r.id, { soldeDepart: 0, dateDepart: ctx.ouverture });
    }
    if (lignes.length > 0) await this.rapprochements.pointer(ctx.tenantId, r.id, lignes.map((l) => l.id));
    return { crees };
  }

  /** Un questionnaire ouvert, retrouvé par son libellé sur l'exercice · aucune réponse, c'est le travail du cabinet. */
  private async garnirQuestionnaire(ctx: Contexte, scenario: ScenarioDemo) {
    const deja = await this.prisma.questionnaireRevision.findFirst({
      where: { tenantId: ctx.tenantId, exerciceId: ctx.exerciceId, libelle: scenario.questionnaire },
      select: { id: true },
    });
    if (deja) return { crees: 0 };
    await this.questionnaires.creer(ctx.tenantId, ctx.auteurId, { exerciceId: ctx.exerciceId, libelle: scenario.questionnaire });
    return { crees: 1 };
  }
}

type Contexte = {
  tenantId: string;
  auteurId: string;
  exerciceId: string;
  annee: string;
  /** Premier jour de l'exercice (AAAA-MM-JJ) · départ du relevé et entrée en vigueur du contrat. */
  ouverture: string;
  banque: string;
  journalBanque: string;
};

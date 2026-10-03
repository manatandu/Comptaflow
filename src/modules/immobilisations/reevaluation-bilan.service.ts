import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  JeuEtatsFinanciersSycebnl,
  MethodeReevaluationLibre,
  ModeAmortissement,
  NatureRevisionPlan,
  Prisma,
  Referentiel,
  SensDepreciation,
  StatutExercice,
  StatutImmobilisation,
  TypeReevaluation,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { transactionJournalisee } from '../../common/audit/transaction-journalisee';
import { exerciceDuDossierOuRefus } from '../../common/exercice-introuvable';
import { ReevaluerImmobilisationsDto, RepriseProvisionReevaluationDto } from './dto/immobilisation.dto';
import { amortissementsHorsDotations } from './partie-remplacee';
import { motifNonAmortissable, motifSansAmortissementProjet } from './comptes-du-bien';
import { compteInscritALaDate } from './immobilisation-en-cours';
import {
  COMPTE_PROVISION_SPECIALE,
  COMPTE_REPRISE_PROVISION_SPECIALE,
  anneesRestantes,
  estBienRecuDestineALaVente,
  estElementMonetaire,
  lignesBien,
  natureReevaluable,
  partsDuSupplement,
  reevaluerBien,
  type BienAReevaluer,
  type ResultatBien,
} from './reevaluation-bilan';

const EPSILON = 0.005;
const n = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);
const centimes = (x: number) => Math.round(x * 100) / 100;

/** Le périmètre se lit d'un bloc · au-delà, l'opération est refusée, jamais tronquée en silence. */
export const PLAFOND_PERIMETRE = 500;

/** Les divisions du périmètre, mêmes numéros aux deux plans (AUDCIF art. 62). */
const DIVISIONS_REEVALUABLES = ['22', '23', '24', '26', '27'];
/**
 * Au SYCEBNL seul, les biens corporels et financiers reçus et destinés à la
 * vente (202 à 205) · lus pour être MONTRÉS, gardés à leur valeur (D-29).
 */
const DIVISIONS_RECUES_A_VENDRE_SYCEBNL = ['202', '203', '204', '205'];

/**
 * LA RÉÉVALUATION DES IMMOBILISATIONS (lot 14) · AUDCIF art. 35, 62 à 65 et
 * Titre VIII ch. 28 ; SYCEBNL Partie 3 ch. 1 § 2.1.1.3 ; loi n° 23/053,
 * art. 129 à 138. Les règles de calcul sont pures (`reevaluation-bilan.ts`) ;
 * ce service lit le périmètre, refuse ce qui ne se porte pas, passe UNE
 * écriture pour l'opération et met les fiches à leur valeur réévaluée.
 */
@Injectable()
export class ReevaluationBilanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
  ) {}

  private async exerciceDuDossier(tenantId: string, exerciceId: string) {
    return exerciceDuDossierOuRefus(await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } }));
  }

  /**
   * LE PÉRIMÈTRE DE L'EXERCICE · toutes les immobilisations corporelles et
   * financières en service au jour de la clôture, chacune avec ce qui
   * l'empêcherait d'entrer dans l'opération ou ce qui la garde à sa valeur
   * nette. Rien n'est écarté en silence.
   */
  async perimetre(tenantId: string, exerciceId: string) {
    const exercice = await this.exerciceDuDossier(tenantId, exerciceId);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, jeuEtatsFinanciersSycebnl: true },
    });
    const ouvertureSuivante = new Date(exercice.dateFin.getTime() + 24 * 3600 * 1000);
    const divisions =
      tenant.referentiel === Referentiel.SYCEBNL ? [...DIVISIONS_REEVALUABLES, ...DIVISIONS_RECUES_A_VENDRE_SYCEBNL] : DIVISIONS_REEVALUABLES;
    const biens = await this.prisma.immobilisation.findMany({
      where: {
        tenantId,
        dateAcquisition: { lte: exercice.dateFin },
        AND: [
          // L'ENSEMBLE À LA CLÔTURE · un bien sorti APRÈS la clôture (cession
          // passée avant que la réévaluation ne soit faite) était à l'actif à
          // la date de l'opération (art. 63). L'oublier ferait une réévaluation
          // partielle en silence · il est lu, et il arrête l'opération.
          { OR: [{ statut: StatutImmobilisation.EN_SERVICE }, { dateSortie: { gt: exercice.dateFin } }] },
          { OR: divisions.map((d) => ({ compteImmobilisation: { numero: { startsWith: d } } })) },
        ],
      },
      include: {
        compteImmobilisation: { select: { numero: true, intitule: true } },
        compteEnCours: { select: { id: true, numero: true, intitule: true } },
        dotations: { select: { montant: true, exerciceId: true, exercice: { select: { dateFin: true } } } },
        depreciations: { select: { sens: true, montant: true } },
        // LES RÉÉVALUATIONS DÉJÀ PORTÉES · leur coefficient retenu est dans
        // la valeur nette inscrite (ch. 28 § 4.2.1.1) · la conversion d'un
        // coefficient déclaré depuis l'origine les lit (`coefficientApplique`).
        lignesReevaluation: {
          where: { reevaluation: { exercice: { dateFin: { lt: exercice.dateFin } } } },
          select: { coefficientRetenu: true, reevaluation: { select: { dateReevaluation: true } } },
        },
      },
      orderBy: [{ compteImmobilisation: { numero: 'asc' } }, { createdAt: 'asc' }, { id: 'asc' }],
      take: PLAFOND_PERIMETRE + 1,
    });
    const lus = biens.slice(0, PLAFOND_PERIMETRE).map((b) => {
      const cumulAmortissements = centimes(b.dotations.reduce((t, d) => t + n(d.montant), 0) + amortissementsHorsDotations(b));
      const cumulDepreciation = centimes(
        b.depreciations.reduce((t, d) => t + (d.sens === SensDepreciation.DOTATION ? n(d.montant) : -n(d.montant)), 0),
      );
      const valeurOrigine = n(b.valeurOrigine);
      const valeurResiduelle = n(b.valeurResiduelle);
      const valeurNette = centimes(valeurOrigine - cumulAmortissements - cumulDepreciation);
      const amortissable =
        !motifSansAmortissementProjet(tenant.jeuEtatsFinanciersSycebnl as JeuEtatsFinanciersSycebnl | null) &&
        !motifNonAmortissable(b.compteImmobilisation.numero, tenant.referentiel) &&
        !b.dureeNonLimitee;
      const planCommence = b.dotations.length > 0 || n(b.amortissementAnterieur) > EPSILON;
      // LE BIEN EN COURS EST DANS L'OPÉRATION (ch. 28 § 1.2, « l'ensemble des
      // immobilisations corporelles et financières » · le 229, le 239 et le 249
      // sont des subdivisions des divisions 22 à 24, fiches des comptes 22 à
      // 24 des deux textes, et aucun texte lu ne l'écarte), À SON COMPTE
      // INSCRIT À LA DATE DE LA RÉÉVALUATION · `compteInscritALaDate`, seul
      // lecteur, qui rend le 2x9 tant que la mise en service n'a pas eu lieu.
      // Sans plan commencé, il se réévalue comme un bien non amorti (§ 4.2.4.1,
      // « le compte d'immobilisation (classe 2) est débité du montant de
      // l'écart »), et sa mise en service vire ensuite la valeur réévaluée.
      const enCoursALaDate = compteInscritALaDate(b, exercice.dateFin) !== b.compteImmobilisationId;
      const compteInscrit = enCoursALaDate && b.compteEnCours ? b.compteEnCours : b.compteImmobilisation;
      // La dotation de l'exercice se passe AVANT la réévaluation · « la date
      // d'effet de la réévaluation doit être la date de clôture » (art. 63),
      // date « à partir de laquelle courent les amortissements sur les
      // montants réévalués » (ch. 28 § 3.2). Passée après, elle doterait
      // l'exercice sur les valeurs réévaluées. ANOMALIE DU TEXTE, SIGNALÉE ·
      // l'art. 64 fait servir la valeur réévaluée « sur la durée d'utilité
      // restant à courir depuis l'ouverture de l'exercice de réévaluation » ·
      // l'art. 63 et le § 3.2, qui règlent la date d'effet, sont suivis
      // (décision D-38, TRANCHÉE par Manasse le 2026-10-02). Le séminaire
      // CPCC sur l'arrêté des comptes 2024 (témoin, pas une source) procède
      // de même · « dotations de l'exercice (avant réévaluation) », la
      // nouvelle dotation calculée sur la valeur réévaluée N-1.
      // Sa pénalité de 100 000 CDF par jour et son échéance « avant le
      // 30 avril » viennent de l'O.-L. n° 89/017, abrogée · non reprises.
      const recuAVendre = estBienRecuDestineALaVente(b.compteImmobilisation.numero, tenant.referentiel === Referentiel.SYSCOHADA ? 'SYSCOHADA' : 'SYCEBNL');
      const dotationManquante =
        !recuAVendre &&
        amortissable &&
        !!b.dateMiseEnService &&
        b.dateMiseEnService <= exercice.dateFin &&
        !b.dotations.some((d) => d.exerciceId === exercice.id) &&
        valeurNette - valeurResiduelle > EPSILON &&
        cumulDepreciation <= EPSILON;
      const dotationPosterieure = b.dotations.some((d) => d.exercice.dateFin > exercice.dateFin);
      const bien: BienAReevaluer = {
        id: b.id,
        designation: b.designation,
        numeroCompte: compteInscrit.numero,
        valeurOrigine,
        valeurResiduelle,
        cumulAmortissements,
        cumulDepreciation,
        amortissable,
        lineaire: b.modeAmortissement === ModeAmortissement.LINEAIRE,
        planCommence,
        coefficientsAnterieurs: [...(b.lignesReevaluation ?? [])]
          .sort((x, y) => x.reevaluation.dateReevaluation.getTime() - y.reevaluation.dateReevaluation.getTime())
          .map((l) => n(l.coefficientRetenu)),
        anneesRestantes: planCommence
          ? anneesRestantes({
              dureeAns: b.dureeAmortissementAns,
              valeurOrigine,
              valeurResiduelle,
              valeurNette,
              revision:
                b.dateEffetRevisionPlan && b.dureeResiduelleRevisee
                  ? { effet: b.dateEffetRevisionPlan, dureeResiduelleAns: b.dureeResiduelleRevisee }
                  : null,
              ouvertureSuivante,
            })
          : null,
      };
      // Ce qui arrête l'opération entière (une réévaluation partielle est
      // interdite) · un bien qu'on ne peut pas porter juste ne s'écarte pas.
      const sortiApres = b.statut !== StatutImmobilisation.EN_SERVICE;
      const bloquant = sortiApres
        ? `Bien sorti le ${b.dateSortie ? b.dateSortie.toISOString().slice(0, 10) : '?'}, après la clôture · il était à ` +
          "l'actif à la date de la réévaluation (AUDCIF art. 62 et 63) et sa sortie a été calculée sur les valeurs " +
          'anciennes. La réévaluation se fait avant la sortie.'
        : b.degressifFiscal
        ? "Bien sous option dégressive fiscale · l'amortissement dérogatoire se calcule sur la valeur d'origine, " +
          'et la loi n° 23/053 (art. 134) ne réévalue que les amortissements « effectivement et définitivement ' +
          'admis en déduction » · OmegaX ne recalcule pas le dérogatoire sur une valeur réévaluée.'
        : dotationPosterieure
          ? "Une dotation d'un exercice postérieur est déjà passée sur la valeur ancienne."
          : dotationManquante
            ? "Dotation de l'exercice non passée · elle se passe avant la réévaluation, sur les valeurs anciennes " +
              '(AUDCIF art. 63 ; ch. 28 § 3.2).'
            : null;
      return {
        ...bien,
        compteIntitule: compteInscrit.intitule,
        enCours: enCoursALaDate,
        nature: natureReevaluable(b.compteImmobilisation.numero, tenant.referentiel === Referentiel.SYSCOHADA ? 'SYSCOHADA' : 'SYCEBNL'),
        valeurNette,
        dureeAmortissementAns: b.dureeAmortissementAns,
        modeAmortissement: b.modeAmortissement,
        bloquant,
        motifGarde: recuAVendre
          ? 'RECU_DESTINE_A_LA_VENTE'
          : estElementMonetaire(compteInscrit.numero)
            ? 'ELEMENT_MONETAIRE'
          : cumulDepreciation > EPSILON
            ? 'DEPRECIE'
            : valeurNette <= EPSILON
              ? 'VALEUR_NETTE_NULLE'
              : null,
      };
    });
    const reevaluation = await this.prisma.reevaluationBilan.findFirst({
      where: { tenantId, exerciceId },
      include: {
        lignes: {
          include: { immobilisation: { select: { id: true, designation: true, numeroInventaire: true } } },
          orderBy: { id: 'asc' },
        },
      },
    });
    return {
      referentiel: tenant.referentiel,
      dateReevaluation: exercice.dateFin,
      exerciceClos: exercice.statut === StatutExercice.CLOTURE,
      biens: lus,
      tronque: biens.length > PLAFOND_PERIMETRE,
      reevaluation,
    };
  }

  /**
   * L'OPÉRATION · une écriture à la date de clôture, une ligne par bien du
   * périmètre, les fiches à leur valeur réévaluée. Tout se vérifie AVANT
   * l'écriture ; si la mise à jour des fiches échoue, l'écriture est retirée.
   */
  async reevaluer(tenantId: string, userId: string, dto: ReevaluerImmobilisationsDto) {
    const exercice = await this.exerciceDuDossier(tenantId, dto.exerciceId);
    if (exercice.statut === StatutExercice.CLOTURE) throw new BadRequestException('Cet exercice est clôturé.');
    const decision = dto.decision?.trim();
    const traitementFiscal = dto.traitementFiscal?.trim();
    const methodeEvaluation = dto.methodeEvaluation?.trim();
    // AUDCIF art. 35, al. 2 · « La décision de réévaluation libre est prise
    // par les organes de gestion de l'entité qui indiquent : la méthode
    // utilisée, la liste des postes des états financiers concernés et les
    // montants correspondants, le traitement fiscal de l'écart de
    // réévaluation. » L'article ne le dit que de la LIBRE ; la décision est
    // exigée aussi pour la LÉGALE par le ch. 28 § 1.2, qui ne distingue pas
    // (« La décision de réévaluation doit être prise par les organes de
    // gestion, qui doivent indiquer [...] »). Art. 35, al. 3 · la réévaluation
    // légale « peut déroger aux dispositions des articles 62 à 65 » · le
    // dispositif légal congolais (loi n° 23/053, art. 129 à 138) ne déroge
    // qu'en fixant les coefficients par arrêté (art. 129) et la neutralité
    // (art. 133) ; il renvoie lui-même aux art. 62 à 65 (art. 129, al. 1er).
    // Une dérogation que l'arrêté porterait n'est pas lue ici, faute de
    // texte · l'opération applique les art. 62 à 65 aux deux natures.
    // Postes et montants sont ceux de l'opération elle-même.
    if (!decision || !traitementFiscal || !methodeEvaluation) {
      throw new BadRequestException(
        'La décision des organes de gestion, la méthode et le traitement fiscal de l’écart sont exigés (AUDCIF art. 35 ; ' +
          'ch. 28 § 1.2 et § 8).',
      );
    }
    if (dto.type === 'LIBRE' && !dto.methodeLibre) {
      throw new BadRequestException(
        'Choisissez la méthode de la réévaluation libre · ajustement du brut et des amortissements, ou élimination ' +
          'des amortissements (ch. 28 § 4.3.1).',
      );
    }
    if (dto.type === 'LEGALE' && dto.methodeLibre) {
      throw new BadRequestException('La réévaluation légale ajuste la valeur brute et les amortissements au coefficient (ch. 28 § 4.2.1.1) · aucune autre méthode.');
    }
    if (dto.neutraliteFiscale && dto.type !== 'LEGALE') {
      throw new BadRequestException(
        "La provision spéciale de réévaluation (154) ne s'écrit que pour une réévaluation légale (ch. 28 § 4.2.4.1) · " +
          'la réévaluation libre crédite le 1062.',
      );
    }
    const categories = dto.type === 'LEGALE' ? (dto.categories ?? []) : [];
    if (dto.type === 'LEGALE') {
      if (categories.length === 0) {
        throw new BadRequestException(
          'Déclarez au moins une catégorie, son coefficient et sa source · le coefficient est fixé par arrêté du Ministre ' +
            'des Finances (loi n° 23/053, art. 129), OmegaX n’en connaît aucun.',
        );
      }
      const cles = new Set<string>();
      for (const c of categories) {
        if (!c.cle.trim() || !c.libelle.trim() || !c.source.trim()) {
          throw new BadRequestException('Chaque catégorie porte un nom, un coefficient et la source du coefficient.');
        }
        if (cles.has(c.cle)) throw new BadRequestException(`La catégorie « ${c.libelle} » est déclarée deux fois.`);
        cles.add(c.cle);
      }
    }

    const existante = await this.prisma.reevaluationBilan.findFirst({ where: { tenantId, exerciceId: exercice.id }, select: { id: true } });
    if (existante) throw new ConflictException('Une réévaluation est déjà enregistrée pour cet exercice.');

    const perimetre = await this.perimetre(tenantId, exercice.id);
    if (perimetre.tronque) {
      throw new BadRequestException(
        `Le périmètre dépasse ${PLAFOND_PERIMETRE} biens · l'opération ne se fait pas en partie (art. 62), et elle ne ` +
          'se fait pas ici au-delà de ce nombre.',
      );
    }
    if (perimetre.biens.length === 0) {
      throw new BadRequestException('Aucune immobilisation corporelle ou financière en service à la clôture · rien à réévaluer.');
    }
    const bloquants = perimetre.biens.filter((b) => b.bloquant);
    if (bloquants.length > 0) {
      throw new BadRequestException(
        'Réévaluation impossible tant que ces biens ne sont pas en ordre · ' +
          bloquants
            .slice(0, 10)
            .map((b) => `« ${b.designation} » · ${b.bloquant}`)
            .join(' ; '),
      );
    }

    // L'ENSEMBLE, NI PLUS NI MOINS · art. 62, « toute réévaluation partielle
    // est interdite » ; loi n° 23/053, art. 130, « Elle doit être globale ».
    const parBien = new Map<string, (typeof dto.lignes)[number]>();
    for (const l of dto.lignes) {
      if (parBien.has(l.immobilisationId)) throw new BadRequestException('Un bien figure deux fois dans la réévaluation.');
      parBien.set(l.immobilisationId, l);
    }
    const idsPerimetre = new Set(perimetre.biens.map((b) => b.id));
    const manquants = perimetre.biens.filter((b) => !parBien.has(b.id));
    if (manquants.length > 0) {
      throw new BadRequestException(
        'Toute réévaluation partielle est interdite (AUDCIF art. 62 ; loi n° 23/053, art. 130) · il manque ' +
          manquants
            .slice(0, 10)
            .map((b) => `« ${b.designation} »`)
            .join(', ') +
          (manquants.length > 10 ? ` et ${manquants.length - 10} autre(s)` : '') +
          '.',
      );
    }
    if (dto.lignes.some((l) => !idsPerimetre.has(l.immobilisationId))) {
      throw new BadRequestException(
        'Un bien de la saisie n’est pas une immobilisation corporelle ou financière de ce dossier en service à la clôture.',
      );
    }

    const referentiel = perimetre.referentiel === Referentiel.SYSCOHADA ? 'SYSCOHADA' : 'SYCEBNL';
    const coefficients = Object.fromEntries(categories.map((c) => [c.cle, c.coefficient]));
    const operation = {
      referentiel,
      type: dto.type,
      methodeLibre: dto.type === 'LIBRE' ? (dto.methodeLibre ?? null) : null,
      neutraliteFiscale: !!dto.neutraliteFiscale,
      coefficients,
      bases: Object.fromEntries(categories.map((c) => [c.cle, c.base ?? null])),
    } as const;
    const resultats: Array<{ bien: (typeof perimetre.biens)[number]; r: ResultatBien; saisie: (typeof dto.lignes)[number] }> = [];
    const refus: string[] = [];
    for (const b of perimetre.biens) {
      const saisie = parBien.get(b.id)!;
      const r = reevaluerBien(b, saisie, operation);
      if ('refus' in r) refus.push(r.refus);
      else resultats.push({ bien: b, r, saisie });
    }
    if (refus.length > 0) throw new BadRequestException(refus.slice(0, 5).join(' '));
    const totalEcart = centimes(resultats.reduce((t, x) => t + x.r.ecart, 0));
    if (totalEcart <= EPSILON) {
      throw new BadRequestException('Aucun écart de réévaluation · les valeurs retenues égalent les valeurs nettes, rien à constater.');
    }

    // Les comptes de l'écart, lus au plan du dossier.
    const numerosEcart = [...new Set(resultats.map((x) => x.r.compteEcart).filter((c): c is string => !!c))];
    const comptesEcart = await this.prisma.compte.findMany({ where: { tenantId, numero: { in: numerosEcart } }, select: { id: true, numero: true } });
    const absents = numerosEcart.filter((num) => !comptesEcart.some((c) => c.numero === num));
    if (absents.length > 0) {
      throw new BadRequestException(`Compte ${absents.join(', ')} absent du plan du dossier · ouvrez-le avant de réévaluer.`);
    }
    const fiches = await this.prisma.immobilisation.findMany({
      where: { tenantId, id: { in: resultats.map((x) => x.bien.id) } },
      select: { id: true, compteImmobilisationId: true, compteEnCoursId: true, dateMiseEnService: true, compteAmortissementId: true },
    });
    const methode = operation.methodeLibre === 'ELIMINATION' ? 'ELIMINATION' : 'AJUSTEMENT';
    const lignes: Array<{ compteId: string; libelle: string; debit: number; credit: number }> = [];
    for (const { bien, r } of resultats) {
      const fiche = fiches.find((f) => f.id === bien.id)!;
      for (const l of lignesBien(r, methode)) {
        // Le compte où le bien est INSCRIT à la date de la réévaluation · le
        // 2x9 d'un bien encore en cours, jamais son compte définitif.
        const compteId =
          l.role === 'BIEN'
            ? compteInscritALaDate(fiche, exercice.dateFin)
            : l.role === 'AMORTISSEMENT'
              ? fiche.compteAmortissementId
              : comptesEcart.find((c) => c.numero === r.compteEcart)!.id;
        lignes.push({ compteId, libelle: `Réévaluation · ${bien.designation}`.slice(0, 200), debit: l.debit, credit: l.credit });
      }
    }

    const ecriture = await this.ecritures.creer(tenantId, userId, {
      exerciceId: exercice.id,
      journalId: dto.journalId,
      date: exercice.dateFin.toISOString().slice(0, 10),
      libelle: dto.type === 'LEGALE' ? 'Réévaluation légale des immobilisations' : 'Réévaluation libre des immobilisations',
      lignes,
    });
    const ouvertureSuivante = new Date(exercice.dateFin.getTime() + 24 * 3600 * 1000);
    try {
      return await transactionJournalisee(this.prisma, async (tx) => {
        const reevaluation = await tx.reevaluationBilan.create({
          data: {
            tenantId,
            exerciceId: exercice.id,
            type: dto.type as TypeReevaluation,
            methodeLibre: (operation.methodeLibre as MethodeReevaluationLibre | null) ?? null,
            neutraliteFiscale: operation.neutraliteFiscale,
            dateReevaluation: exercice.dateFin,
            decision: decision.slice(0, 500),
            traitementFiscal: traitementFiscal.slice(0, 1000),
            methodeEvaluation: methodeEvaluation.slice(0, 2000),
            // Le coefficient DÉCLARÉ et ce qu'il mesure · la ligne porte celui
            // qui a été APPLIQUÉ à la valeur nette inscrite (`coefficientApplique`).
            categories: categories.map((c) => ({
              cle: c.cle,
              libelle: c.libelle.trim(),
              coefficient: c.coefficient,
              base: c.base ?? null,
              source: c.source.trim(),
            })),
            totalEcart,
            ecritureId: ecriture.id,
            createdBy: userId,
          },
        });
        await tx.ligneReevaluationBilan.createMany({
          data: resultats.map(({ bien, r, saisie }) => ({
            tenantId,
            reevaluationId: reevaluation.id,
            immobilisationId: bien.id,
            categorie: dto.type === 'LEGALE' ? (saisie.categorie ?? null) : null,
            coefficient: r.coefficient,
            valeurActuelle: saisie.valeurActuelle ?? null,
            coefficientRetenu: r.coefficientRetenu,
            brutAvant: bien.valeurOrigine,
            amortissementsAvant: bien.cumulAmortissements,
            valeurNetteAvant: r.valeurNetteAvant,
            brutApres: r.brutApres,
            amortissementsApres: r.amortissementsApres,
            valeurReevaluee: r.valeurReevaluee,
            ecart: r.ecart,
            compteEcart: r.compteEcart,
            droitDeReprise: referentiel === 'SYCEBNL' ? (saisie.droitDeReprise ?? null) : null,
            motifNonReevalue: r.motifNonReevalue,
          })),
        });
        for (const { bien, r } of resultats) {
          if (r.ecart <= EPSILON) continue;
          const elimine = methode === 'ELIMINATION' && r.amortissementsApres === 0 && r.deltaAmortissements < -EPSILON;
          await tx.immobilisation.update({
            where: { id: bien.id },
            data: {
              valeurOrigine: r.brutApres,
              valeurResiduelle: r.valeurResiduelleApres,
              amortissementsReevaluation: { increment: r.deltaAmortissements },
              // Méthode 2 · la nouvelle valeur brute s'amortit sur les
              // annuités restantes (§ 4.3.2), par la révision prospective
              // du lot 11, à compter de l'ouverture de l'exercice suivant.
              ...(elimine ? { dateEffetRevisionPlan: ouvertureSuivante, dureeResiduelleRevisee: bien.anneesRestantes } : {}),
            },
          });
          // L'HISTORIQUE DES RÉVISIONS LE DIT (lot 11, « Révisions du plan ») ·
          // sans cette ligne, la fiche porterait une révision prospective que
          // l'historique ne nomme pas, et le cabinet ne saurait pas d'où vient
          // la nouvelle base. Aucune écriture · la méthode 2 a déjà la sienne
          // (celle de la réévaluation), et la révision n'en porte jamais en
          // prospective.
          if (elimine) {
            await tx.revisionPlanAmortissement.create({
              data: {
                tenantId,
                immobilisationId: bien.id,
                exerciceId: exercice.id,
                nature: NatureRevisionPlan.PROSPECTIVE,
                dateDecision: exercice.dateFin,
                dureeAvantAns: bien.dureeAmortissementAns,
                dureeApresAns: bien.anneesRestantes!,
                motif:
                  'Réévaluation libre, méthode 2 (AUDCIF Titre VIII ch. 28 § 4.3.1 et § 4.3.2) · la valeur nette réévaluée ' +
                  'devient la valeur brute, amortie sur les annuités restantes à compter de l’ouverture de l’exercice suivant.',
                createdBy: userId,
              },
            });
          }
        }
        return { id: reevaluation.id, totalEcart, ecritureId: ecriture.id, biens: resultats.map((x) => x.r) };
      });
    } catch (err) {
      await this.prisma.ligneEcriture.deleteMany({ where: { ecritureId: ecriture.id } });
      await this.prisma.ecriture.delete({ where: { id: ecriture.id } });
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Une réévaluation est déjà enregistrée pour cet exercice.');
      }
      throw err;
    }
  }

  /**
   * LA REPRISE PROPOSÉE DE LA PROVISION SPÉCIALE · ch. 28 § 4.2.4.2. Pour
   * chaque bien réévalué au 154 lors d'un exercice ANTÉRIEUR, le supplément
   * de la dotation de cet exercice, chaîné sur les réévaluations du bien
   * (`partsDuSupplement`). Une dotation non
   * passée ne se devine pas · le bien est montré sans montant, avec le motif.
   * Un bien non amortissable ne dégage aucun supplément.
   */
  async propositionRepriseProvision(tenantId: string, exerciceId: string) {
    const exercice = await this.exerciceDuDossier(tenantId, exerciceId);
    const lignes = await this.prisma.ligneReevaluationBilan.findMany({
      where: {
        tenantId,
        compteEcart: { startsWith: '154' },
        reevaluation: { exercice: { dateFin: { lt: exercice.dateFin } } },
      },
      include: {
        immobilisation: {
          select: {
            id: true,
            designation: true,
            statut: true,
            dateSortie: true,
            dotations: { where: { exerciceId: exercice.id }, select: { montant: true } },
            // LA CHAÎNE DU BIEN · toutes ses réévaluations antérieures à
            // l'exercice, 106 compris · la dotation les porte toutes, et la
            // part de chacune se lit sur celles qui la suivent (`partsDuSupplement`).
            lignesReevaluation: {
              where: { reevaluation: { exercice: { dateFin: { lt: exercice.dateFin } } } },
              select: {
                id: true,
                coefficientRetenu: true,
                compteEcart: true,
                ecart: true,
                provisionReprise: true,
                reevaluation: { select: { dateReevaluation: true } },
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: PLAFOND_PERIMETRE + 1,
    });
    const deja = await this.prisma.repriseProvisionReevaluation.findFirst({ where: { tenantId, exerciceId: exercice.id } });
    // UN BIEN SORTI À LA CLÔTURE N'EST PAS PROPOSÉ · le § 4.2.4.2 reprend la
    // provision « à concurrence du supplément de la dotation aux amortissements
    // dégagé annuellement sur les éléments d'actif réévalués », et un bien
    // cédé ou mis hors service n'en est plus un ; le sort de son écart est
    // celui du § 6 (« le solde de l'écart de réévaluation d'un bien cédé ou
    // mis hors service doit faire l'objet d'un transfert à un poste de réserve
    // non distribuable ») et de la loi n° 23/053, art. 133 al. 3, que le
    // module ne passe pas · le bien est NOMMÉ à part, jamais retiré en
    // silence, et sa provision restante dite.
    const sortiALaCloture = (l: (typeof lignes)[number]) =>
      l.immobilisation.statut !== StatutImmobilisation.EN_SERVICE &&
      (!l.immobilisation.dateSortie || l.immobilisation.dateSortie <= exercice.dateFin);
    const lues = lignes.slice(0, PLAFOND_PERIMETRE);
    const sortis = lues.filter(sortiALaCloture).map((l) => ({
      ligneId: l.id,
      immobilisation: { id: l.immobilisation.id, designation: l.immobilisation.designation },
      resteProvision: centimes(n(l.ecart) - n(l.provisionReprise)),
      motif:
        'Bien sorti · la reprise annuelle ne vise que les éléments d’actif réévalués (AUDCIF Titre VIII ch. 28 § 4.2.4.2) ; ' +
        'le sort de l’écart d’un bien cédé (§ 6 ; loi n° 23/053, art. 133 al. 3) n’est pas passé par ce module.',
    }));
    const servies = lues.filter((l) => !sortiALaCloture(l)).map((l) => {
      const reste = centimes(n(l.ecart) - n(l.provisionReprise));
      const dotation = l.immobilisation.dotations[0] ? n(l.immobilisation.dotations[0].montant) : null;
      const chaine = [...l.immobilisation.lignesReevaluation]
        .sort((x, y) => x.reevaluation.dateReevaluation.getTime() - y.reevaluation.dateReevaluation.getTime())
        .map((x) => ({
          id: x.id,
          coefficientRetenu: n(x.coefficientRetenu),
          resteProvision: centimes(n(x.ecart) - n(x.provisionReprise)),
          provisionSpeciale: !!x.compteEcart?.startsWith('154'),
        }));
      // La ligne est toujours dans sa propre chaîne (même filtre) ; la
      // garde ne sert qu'à ne jamais lire une part d'une autre opération.
      const part = partsDuSupplement(dotation ?? 0, chaine).find((p) => p.id === l.id);
      if (!part) throw new Error(`Réévaluation ${l.id} absente de la chaîne de son bien.`);
      const montant = dotation === null ? 0 : part.montant;
      return {
        ligneId: l.id,
        immobilisation: { id: l.immobilisation.id, designation: l.immobilisation.designation },
        coefficientRetenu: n(l.coefficientRetenu),
        /** Le produit des k' des réévaluations postérieures du bien, retranchées de la dotation (1 sans aucune). */
        produitPosterieur: part.produitPosterieur,
        dotation,
        resteProvision: reste,
        montant,
        motif:
          reste <= EPSILON
            ? 'Provision entièrement reprise.'
            : dotation === null
              ? "Dotation de l'exercice non passée · le supplément se lit sur elle."
              : null,
      };
    });
    return {
      lignes: servies,
      sortis,
      total: centimes(servies.reduce((t, l) => t + l.montant, 0)),
      tronque: lignes.length > PLAFOND_PERIMETRE,
      dejaPassee: deja ? { id: deja.id, montant: n(deja.montant), ecritureId: deja.ecritureId } : null,
    };
  }

  /** La reprise de l'exercice · D 154 / C 861, une fois par exercice. */
  async passerRepriseProvision(tenantId: string, userId: string, dto: RepriseProvisionReevaluationDto) {
    const exercice = await this.exerciceDuDossier(tenantId, dto.exerciceId);
    if (exercice.statut === StatutExercice.CLOTURE) throw new BadRequestException('Cet exercice est clôturé.');
    const proposition = await this.propositionRepriseProvision(tenantId, exercice.id);
    if (proposition.dejaPassee) throw new ConflictException('La reprise de la provision spéciale est déjà passée pour cet exercice.');
    if (proposition.tronque) throw new BadRequestException(`Plus de ${PLAFOND_PERIMETRE} biens portent la provision · la reprise ne se fait pas en partie.`);
    const retenues = proposition.lignes.filter((l) => l.montant > EPSILON);
    if (retenues.length === 0) throw new BadRequestException('Aucun supplément de dotation à reprendre sur cet exercice.');
    const [c154, c861] = await Promise.all([
      this.prisma.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: COMPTE_PROVISION_SPECIALE } } }),
      this.prisma.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: COMPTE_REPRISE_PROVISION_SPECIALE } } }),
    ]);
    if (!c154 || !c861) {
      throw new BadRequestException(`Les comptes ${COMPTE_PROVISION_SPECIALE} et ${COMPTE_REPRISE_PROVISION_SPECIALE} sont exigés au plan du dossier.`);
    }
    const total = centimes(retenues.reduce((t, l) => t + l.montant, 0));
    const ecriture = await this.ecritures.creer(tenantId, userId, {
      exerciceId: exercice.id,
      journalId: dto.journalId,
      date: exercice.dateFin.toISOString().slice(0, 10),
      libelle: 'Reprise de la provision spéciale de réévaluation',
      lignes: [
        { compteId: c154.id, debit: total, credit: 0 },
        { compteId: c861.id, debit: 0, credit: total },
      ],
    });
    try {
      return await transactionJournalisee(this.prisma, async (tx) => {
        const reprise = await tx.repriseProvisionReevaluation.create({
          data: {
            tenantId,
            exerciceId: exercice.id,
            montant: total,
            detail: retenues.map((l) => ({
              ligneId: l.ligneId,
              immobilisationId: l.immobilisation.id,
              dotation: l.dotation,
              coefficientRetenu: l.coefficientRetenu,
              produitPosterieur: l.produitPosterieur,
              montant: l.montant,
            })),
            ecritureId: ecriture.id,
            createdBy: userId,
          },
        });
        for (const l of retenues) {
          await tx.ligneReevaluationBilan.update({ where: { id: l.ligneId }, data: { provisionReprise: { increment: l.montant } } });
        }
        return { id: reprise.id, montant: total, ecritureId: ecriture.id };
      });
    } catch (err) {
      await this.prisma.ligneEcriture.deleteMany({ where: { ecritureId: ecriture.id } });
      await this.prisma.ecriture.delete({ where: { id: ecriture.id } });
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('La reprise de la provision spéciale est déjà passée pour cet exercice.');
      }
      throw err;
    }
  }
}

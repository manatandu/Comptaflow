import { Injectable } from '@nestjs/common';
import { ClasseCompte, StatutEcriture } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import {
  CompteDuPoste,
  LigneBalancePourEtat,
  chargerLignes,
  correspond,
  trouverExerciceN1,
} from '../etats-financiers/etats-financiers.communs';
import { trouvePosteCompteResultat } from './correspondance-compte-resultat-syscohada';
import {
  AMORTISSEMENT_SMT,
  CLAUSE_EQUIVALENT_ART13,
  COMPTES_CHIFFRE_AFFAIRES_ART13,
  COMPTES_DEPRECIATION_TRESORERIE_SMT_SYSCOHADA,
  COMPTES_DOTATIONS_SMT_SYSCOHADA,
  COMPTES_RESULTAT_SMT_SYSCOHADA,
  COMPTES_TRESORERIE_SMT_SYSCOHADA,
  CONTREPARTIES_HORS_RESULTAT_SMT_SYSCOHADA,
  CONTREPARTIES_RESULTAT_SMT_SYSCOHADA,
  DEFINITION_VARIATION_SMT_SYSCOHADA,
  DOCUMENTS_SMT_SYSCOHADA,
  INVENTAIRE_EXTRA_COMPTABLE_SMT,
  JOURNAUX_DE_SUIVI_SMT_SYSCOHADA,
  LETTRES_D_E_SMT_SYSCOHADA,
  LIBELLE_RESULTAT_SMT_SYSCOHADA,
  LIGNES_SYNTHESE_NOTE_2_SMT_SYSCOHADA,
  NB_JOURNAL_TRESORERIE_SMT_SYSCOHADA,
  NOTES_SMT_SYSCOHADA,
  ORDRE_BILAN_ACTIF_SMT_SYSCOHADA,
  ORDRE_BILAN_PASSIF_SMT_SYSCOHADA,
  ORDRE_COMPTE_RESULTAT_SMT_SYSCOHADA,
  POSTES_BILAN_ACTIF_SMT_SYSCOHADA,
  POSTES_BILAN_PASSIF_SMT_SYSCOHADA,
  POSTES_DEPENSES_SMT_SYSCOHADA,
  POSTES_RECETTES_SMT_SYSCOHADA,
  PosteBilanSmtSyscohada,
  PosteFluxSmtSyscohada,
  REF_RESULTAT_SMT_SYSCOHADA,
  RENVOI_IMMOBILISATIONS_SMT_SYSCOHADA,
  RETRAITEMENTS_SMT_SYSCOHADA,
  SEUILS_SMT_ART13_FCFA,
  TOTAUX_BILAN_ACTIF_SMT_SYSCOHADA,
  TOTAUX_BILAN_PASSIF_SMT_SYSCOHADA,
  TOTAUX_COMPTE_RESULTAT_SMT_SYSCOHADA,
  VENTILATION_DEPENSES_SMT_SYSCOHADA,
  VENTILATION_RECETTES_SMT_SYSCOHADA,
  calculerResultatSmt,
} from './correspondance-smt-syscohada';

/**
 * ÉTATS FINANCIERS DU SYSTÈME MINIMAL DE TRÉSORERIE · SYSCOHADA RÉVISÉ.
 *
 * Sources, toutes LUES avant d'écrire (CLAUDE.md §1), et re-citées ligne à
 * ligne dans le corps du fichier :
 *  - AUDCIF Titre X, ch. 1 (règles de présentation, inventaire
 *    extra-comptable, amortissement linéaire sans prorata, structure du
 *    jeu), ch. 2 (maquettes du bilan et du compte de résultat, lettres A à
 *    G) et ch. 3 (NOTE 1 à NOTE 4, journaux de suivi) ;
 *  - AUDCIF art. 11 (« Toute entité est, sauf exception liée à sa taille,
 *    soumise au Système normal »), art. 13 (les trois seuils du SMT) et
 *    art. 21 (« tiennent une comptabilité de trésorerie ») ;
 *  - AUDCIF Titre VII, fiches COMPTE 13, 28, 49, 57, 58, 59, 68, 69, 81,
 *    82, 85, 89, pour les arbitrages de lecture rappelés ci-dessous ;
 *  - la table `correspondance-smt-syscohada.ts`, qui porte le rattachement
 *    poste par poste et ses vingt-deux anomalies numérotées · À LIRE EN
 *    ENTIER avant de toucher à ce service, qui s'y adosse sans jamais
 *    redéfinir un périmètre de comptes de son côté.
 *
 * MÊME MÉCANIQUE que `etats-financiers/etats-financiers-smt.service.ts`
 * (jeu S.M.T du SYCEBNL) : postes de bilan lus dans les soldes, recettes et
 * dépenses reconstituées depuis les MOUVEMENTS de trésorerie, retraitements
 * de variation, journal de la NOTE 4 par compte de trésorerie, contrôle de
 * concordance. Aucun compte, aucun poste, aucun libellé, aucun article n'en
 * est repris : les deux référentiels ne partagent que cette mécanique et
 * les aides de `etats-financiers.communs.ts` (CLAUDE.md §6).
 *
 * ## Pourquoi les recettes et les dépenses NE sont PAS lues dans les soldes 6/7
 *
 * Titre X ch. 1 § 1 : le SMT « repose sur l'établissement d'un état des
 * recettes et des dépenses […] dressé à partir d'une comptabilité de
 * trésorerie ». Les lignes A et B sont donc de l'ENCAISSÉ et du DÉCAISSÉ.
 * Les lire dans les soldes des classes 6 et 7 donnerait de l'ENGAGEMENT, et
 * les trois lignes de variation (stocks, créances, dettes) qui suivent
 * corrigeraient une seconde fois un décalage déjà absorbé : une vente à
 * crédit non encaissée compterait en A, puis la variation des créances la
 * rajouterait · le résultat G serait faux du double du décalage.
 *
 * Elles sont donc lues dans les CONTREPARTIES des mouvements de trésorerie,
 * c'est-à-dire dans la matière même du journal de la NOTE 4, poste par
 * poste selon `POSTES_RECETTES_SMT_SYSCOHADA` /
 * `POSTES_DEPENSES_SMT_SYSCOHADA`.
 *
 * ## Comptes de trésorerie retenus
 *
 * `COMPTES_TRESORERIE_SMT_SYSCOHADA` (52 à 58), et rien d'autre. Surtout
 * PAS « la classe 5 hors 59 », qui est la définition du service SYCEBNL
 * écrite pour SON plan : elle ferait entrer 50 « Titres de placement » et
 * 51 « Valeurs à encaisser », que la table rattache à SA3 « Clients et
 * débiteurs divers » (anomalie n° 6). Un encaissement par chèque
 * (Dr 513 / Cr 411) serait alors lu comme une recette dont SA3 n'aurait
 * pourtant pas bougé, et G serait majoré d'autant. Les 592 à 594 sont des
 * dépréciations, pas des avoirs (anomalie n° 14).
 *
 * ## Écritures retenues
 *
 * VALIDÉES seulement · le bilan et le compte de résultat sont des documents
 * légaux et ne lisent que le livre-journal (même règle que `chargerLignes`).
 * Écritures de clôture EXCLUES : le report à-nouveau rouvre les comptes de
 * trésorerie par une écriture qui n'est pas un encaissement, et la compter
 * ferait apparaître le solde d'ouverture comme une recette de l'exercice.
 * Elle a sa place ailleurs, en première ligne du journal de la NOTE 4.
 *
 * ## Le comparatif N-1
 *
 * Les DEUX maquettes du ch. 2 impriment une colonne « Montant Exercice N-1 »
 * (le bilan comme le compte de résultat, à la différence du jeu SYCEBNL dont
 * la maquette de compte de résultat n'en porte pas). Le compte de résultat
 * est donc reconstruit en entier pour l'exercice antérieur, mouvements de
 * trésorerie compris · un simple report de soldes ne l'aurait pas donné.
 * Absent (premier exercice), le comparatif reste `undefined`, jamais un
 * zéro qui laisserait croire à un exercice antérieur réel et vide.
 */
@Injectable()
export class EtatsFinanciersSmtSyscohadaService {
  constructor(
    private readonly ecritureService: EcritureService,
    private readonly exerciceService: ExerciceService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Comptes dont le mouvement EST la recette ou la dépense · la liste vient
   * de la table, jamais d'une définition improvisée ici (voir la note de
   * tête, « Comptes de trésorerie retenus »).
   */
  private estTresorerie(numero: string): boolean {
    return correspond(numero, COMPTES_TRESORERIE_SMT_SYSCOHADA);
  }

  private async chargerLignes(tenantId: string, exerciceId: string | null): Promise<LigneBalancePourEtat[]> {
    return chargerLignes(this.ecritureService, tenantId, exerciceId);
  }

  /**
   * Les mêmes lignes de balance, ramenées à l'OUVERTURE de l'exercice : le
   * report à-nouveau tient lieu de solde, les mouvements de l'exercice sont
   * mis de côté.
   *
   * Sert aux trois lignes de variation du compte de résultat (SV1, SV2,
   * SV3), que la maquette note « N / N-1 » et que la NOTE 3 appelle
   * « Montant au 1er janvier ». Le terme N-1 est bien l'OUVERTURE de
   * l'exercice, pas la clôture de l'exercice précédent telle qu'elle figure
   * dans le logiciel : les deux coïncident quand la clôture a été passée
   * dans OmegaX, mais pas pour un premier exercice (l'ouverture est alors le
   * solde repris de l'ancienne comptabilité) ni pour un dossier repris en
   * cours de vie. L'ouverture, elle, est toujours présente.
   */
  private aLOuverture(lignes: LigneBalancePourEtat[]): LigneBalancePourEtat[] {
    return lignes.map((l) => ({
      ...l,
      totalDebit: l.reportDebit,
      totalCredit: l.reportCredit,
      mouvementDebit: 0,
      mouvementCredit: 0,
      solde: l.reportDebit - l.reportCredit,
    }));
  }

  // -------------------------------------------------------------------------
  // BILAN (Titre X ch. 2 § 1)
  // -------------------------------------------------------------------------

  /**
   * Un poste résolu · même forme que `PosteCalcule` du jeu SYCEBNL, défini
   * ici plutôt qu'importé : les deux référentiels ne partagent aucun état,
   * et un type commun ferait croire à un moteur commun. `comptes` porte le
   * détail pour le drill-down, montant compris, jamais agrégé en silence.
   */
  private calculerPosteBilan(poste: PosteBilanSmtSyscohada, lignes: LigneBalancePourEtat[]): PosteCalculeSmtSyscohada {
    // Le filtre de sens s'apprécie COMPTE PAR COMPTE, jamais sur l'agrégat
    // (Titre VII COMPTE 47 : « aucune compensation n'est en principe
    // admise ») · un client débiteur et un client créditeur ne se
    // compensent pas, l'un va en SA3, l'autre en SP4.
    let base = lignes.filter((l) => correspond(l.numero, poste.comptes, poste.exclusions));
    if (poste.sens_qualificatif === 'DEBITEUR') base = base.filter((l) => l.solde > 0);
    if (poste.sens_qualificatif === 'CREDITEUR') base = base.filter((l) => l.solde < 0);

    const retenues = new Map<string, LigneBalancePourEtat>();
    for (const l of base) retenues.set(l.compteId, l);
    // Branche PROPRE à la table SYSCOHADA, absente du jeu SYCEBNL : les
    // dépréciations (490 à 498, 590, 591, créditrices, en moins d'un poste
    // d'actif), les 50 et 51 (actif quel que soit leur solde) et les
    // provisions à court terme (499, 599, créditrices, au passif) ne
    // passent pas le filtre de sens de leur poste. L'oublier les ferait
    // disparaître du bilan SANS qu'aucune exception ni aucun test
    // structurel ne le signale · voir `comptesSansFiltreDeSens` et les
    // anomalies n° 5 et 6 de la table.
    if (poste.comptesSansFiltreDeSens) {
      for (const l of lignes.filter((x) => correspond(x.numero, poste.comptesSansFiltreDeSens!))) {
        retenues.set(l.compteId, l);
      }
    }

    // Un poste d'actif porte son solde débiteur en positif, un poste de
    // passif son solde créditeur en positif · la maquette n'ayant qu'UNE
    // colonne de montant (pas de Brut / Amort. / Net comme au Système
    // normal), les amortissements et dépréciations réduisent d'eux-mêmes le
    // poste et le montant imprimé est NET.
    const signe = poste.sens === 'ACTIF' ? 1 : -1;
    const comptes: CompteDuPoste[] = [...retenues.values()]
      .sort((a, b) => a.numero.localeCompare(b.numero))
      .map((l) => ({ numero: l.numero, intitule: l.intitule, montant: signe * l.solde }));

    return {
      ref: poste.ref,
      libelle: poste.libelle,
      note: poste.note,
      montant: comptes.reduce((s, c) => s + c.montant, 0),
      comptes,
    };
  }

  /**
   * SP2 « Résultat exercice » · même arbitrage qu'au Système normal (poste
   * CJ) : Titre VII COMPTE 13, le compte 13 n'est mouvementé qu'À LA
   * CLÔTURE, par virement des soldes des classes 6, 7 et 8. Avant clôture
   * le résultat vit donc dans ces classes ; après, il vit au 13, qui les a
   * soldées à zéro. Prendre les deux les additionnerait · c'est pourquoi
   * les deux montants sont exposés séparément et `doubleComptageProbable`
   * signale la balance transmise à un moment ambigu de la clôture.
   */
  private calculerResultatBilan(lignes: LigneBalancePourEtat[]): {
    poste: PosteCalculeSmtSyscohada;
    resultatClasses678: number;
    resultatCompte13: number;
  } {
    const lignes678 = lignes.filter(
      (l) =>
        l.classe === ClasseCompte.CLASSE_6 || l.classe === ClasseCompte.CLASSE_7 || l.classe === ClasseCompte.CLASSE_8,
    );
    const resultatClasses678 = lignes678.reduce((s, l) => s - l.solde, 0);
    const lignes13 = lignes.filter((l) => correspond(l.numero, COMPTES_RESULTAT_SMT_SYSCOHADA));
    const resultatCompte13 = lignes13.reduce((s, l) => s - l.solde, 0);

    const avantCloture = Math.abs(resultatClasses678) > 0.005;
    const source = avantCloture ? lignes678 : lignes13;
    const comptes = source
      .filter((l) => Math.abs(l.solde) > 0.005)
      .sort((a, b) => a.numero.localeCompare(b.numero))
      .map((l) => ({ numero: l.numero, intitule: l.intitule, montant: -l.solde }));

    return {
      poste: {
        ref: REF_RESULTAT_SMT_SYSCOHADA,
        libelle: LIBELLE_RESULTAT_SMT_SYSCOHADA,
        note: null,
        montant: avantCloture ? resultatClasses678 : resultatCompte13,
        comptes,
      },
      resultatClasses678,
      resultatCompte13,
    };
  }

  /**
   * Tous les postes du bilan (détail + totaux) pour UN jeu de lignes ·
   * appelée pour l'exercice N, pour N-1, et pour l'OUVERTURE de N (dont les
   * postes SA2, SA3 et SP4 servent les trois lignes de variation). `lignes:
   * []` résout tout à zéro sans cas particulier : un poste sans compte est
   * légitimement à 0, pas une erreur.
   */
  private resoudreBilan(lignes: LigneBalancePourEtat[]): {
    parRef: Map<string, PosteCalculeSmtSyscohada>;
    resultatClasses678: number;
    resultatCompte13: number;
  } {
    const parRef = new Map<string, PosteCalculeSmtSyscohada>();
    for (const poste of [...POSTES_BILAN_ACTIF_SMT_SYSCOHADA, ...POSTES_BILAN_PASSIF_SMT_SYSCOHADA]) {
      parRef.set(poste.ref, this.calculerPosteBilan(poste, lignes));
    }
    const { poste, resultatClasses678, resultatCompte13 } = this.calculerResultatBilan(lignes);
    parRef.set(poste.ref, poste);

    // Chaque total additionne des refs DÉJÀ résolues · l'ordre des tables
    // le garantit et le spec de la table le revérifie.
    for (const total of [...TOTAUX_BILAN_ACTIF_SMT_SYSCOHADA, ...TOTAUX_BILAN_PASSIF_SMT_SYSCOHADA]) {
      const montant = total.deRefs.reduce((s, ref) => s + (parRef.get(ref)?.montant ?? 0), 0);
      parRef.set(total.ref, {
        ref: total.ref,
        libelle: total.libelle,
        note: null,
        montant,
        comptes: [],
        estTotal: true,
      });
    }
    return { parRef, resultatClasses678, resultatCompte13 };
  }

  async bilan(tenantId: string, exerciceId: string) {
    const exerciceN1Id = await trouverExerciceN1(this.exerciceService, tenantId, exerciceId);
    const [lignesN, lignesN1] = await Promise.all([
      this.chargerLignes(tenantId, exerciceId),
      this.chargerLignes(tenantId, exerciceN1Id),
    ]);
    const { parRef: parRefN, resultatClasses678, resultatCompte13 } = this.resoudreBilan(lignesN);
    const { parRef: parRefN1 } = this.resoudreBilan(lignesN1);

    const fusionner = (ref: string): PosteCalculeSmtSyscohada => {
      const n = parRefN.get(ref)!;
      return { ...n, montantN1: exerciceN1Id ? parRefN1.get(ref)?.montant : undefined };
    };

    /*
      COMPTES DE BILAN QU'AUCUN POSTE NE CAPTE · signalés, jamais absorbés
      en silence (même discipline qu'au Système normal). Avec le plan semé,
      la liste est vide par construction : SA1 à SA5 et SP1 à SP4 couvrent
      les classes 1 à 5 (10 à 19 au passif, classe 2, classe 3, classe 4
      entière répartie entre SA3 et SP4, classe 5 répartie entre SA3, SA5 et
      SP4). Mais un plan personnalisé, ou un compte ajouté à la main hors
      des préfixes officiels, ferait ressortir ses comptes ici plutôt que de
      déséquilibrer le bilan sans explication.

      Le rattachement se juge sur les PRÉFIXES seuls, sans le filtre de
      sens : un compte de tiers au solde nul n'appartient ni à SA3 ni à SP4
      à cet instant, il n'est pas pour autant hors maquette.
    */
    const rattaches = new Set<string>();
    for (const poste of [...POSTES_BILAN_ACTIF_SMT_SYSCOHADA, ...POSTES_BILAN_PASSIF_SMT_SYSCOHADA]) {
      for (const l of lignesN) {
        if (
          correspond(l.numero, poste.comptes, poste.exclusions) ||
          (poste.comptesSansFiltreDeSens && correspond(l.numero, poste.comptesSansFiltreDeSens))
        ) {
          rattaches.add(l.compteId);
        }
      }
    }
    for (const l of lignesN) {
      if (correspond(l.numero, COMPTES_RESULTAT_SMT_SYSCOHADA)) rattaches.add(l.compteId);
    }
    const CLASSES_DE_BILAN = new Set<ClasseCompte>([
      ClasseCompte.CLASSE_1,
      ClasseCompte.CLASSE_2,
      ClasseCompte.CLASSE_3,
      ClasseCompte.CLASSE_4,
      ClasseCompte.CLASSE_5,
    ]);
    const comptesNonRattaches: CompteDuPoste[] = lignesN
      .filter((l) => CLASSES_DE_BILAN.has(l.classe) && !rattaches.has(l.compteId))
      .map((l) => ({ numero: l.numero, intitule: l.intitule, montant: l.solde }));

    const totalActif = parRefN.get('SAZ')!.montant;
    const totalPassif = parRefN.get('SPZ')!.montant;

    return {
      actif: ORDRE_BILAN_ACTIF_SMT_SYSCOHADA.map(fusionner),
      passif: ORDRE_BILAN_PASSIF_SMT_SYSCOHADA.map(fusionner),
      totalActif,
      totalPassif,
      totalActifN1: exerciceN1Id ? parRefN1.get('SAZ')!.montant : undefined,
      totalPassifN1: exerciceN1Id ? parRefN1.get('SPZ')!.montant : undefined,
      exerciceN1Disponible: exerciceN1Id !== null,
      // Tolérance d'arrondi ; un écart réel signale un compte hors maquette
      // (voir `comptesNonRattaches`) ou un défaut du moteur d'écritures, pas
      // un défaut de cette répartition.
      equilibre: Math.abs(totalActif - totalPassif) < 0.01,
      comptesNonRattaches,
      renvoiImmobilisations: RENVOI_IMMOBILISATIONS_SMT_SYSCOHADA,
      controle: {
        resultatClasses678,
        resultatCompte13,
        doubleComptageProbable: Math.abs(resultatClasses678) > 0.005 && Math.abs(resultatCompte13) > 0.005,
      },
    };
  }

  // -------------------------------------------------------------------------
  // MOUVEMENTS DE TRÉSORERIE · matière commune au compte de résultat et à la NOTE 4
  // -------------------------------------------------------------------------

  private async ecrituresDeLExercice(tenantId: string, exerciceId: string) {
    return this.prisma.ecriture.findMany({
      where: { tenantId, exerciceId, statut: StatutEcriture.VALIDEE, estGenereeParCloture: false },
      include: { lignes: { include: { compte: true } } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Partage les écritures de l'exercice en deux :
   *
   *  - `mouvements` · celles qui ont un EFFET NET sur la trésorerie, avec la
   *    ventilation de leur montant sur les comptes de contrepartie. C'est la
   *    matière des lignes A et B. Un virement de la caisse vers la banque
   *    n'y est pas : son flux net est nul, ce n'est ni une recette ni une
   *    dépense (anomalie n° 14). Il n'est PAS écarté du journal de la NOTE
   *    4, qui est un livre de caisse et doit montrer tous les mouvements du
   *    compte pour que son solde à reporter soit juste ;
   *
   *  - `sansEffetTresorerie` · toutes les autres, écritures purement
   *    d'engagement comprises (facture 60/401, dotation 68/28, variation de
   *    stock 603/31) et virements internes. Elles n'entrent dans aucune
   *    ligne du compte de résultat, mais elles sont EXACTEMENT ce qui
   *    explique l'écart entre G et le résultat du bilan · voir
   *    `composantesEcartConcordance`.
   */
  private classerEcritures(ecritures: Awaited<ReturnType<EtatsFinanciersSmtSyscohadaService['ecrituresDeLExercice']>>) {
    const mouvements: MouvementTresorerieSmt[] = [];
    const sansEffetTresorerie: typeof ecritures = [];

    for (const e of ecritures) {
      const tresorerie = e.lignes.filter((l) => this.estTresorerie(l.compte.numero));
      const flux = tresorerie.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
      if (tresorerie.length === 0 || Math.abs(flux) < 0.005) {
        sansEffetTresorerie.push(e);
        continue;
      }
      const sens: 'RECETTE' | 'DEPENSE' = flux > 0 ? 'RECETTE' : 'DEPENSE';
      // Contribution d'une contrepartie : créditrice pour une recette,
      // débitrice pour une dépense · la somme vaut |flux| dans une écriture
      // équilibrée dont toutes les contreparties sont hors trésorerie.
      const contreparties = e.lignes
        .filter((l) => !this.estTresorerie(l.compte.numero))
        .map((l) => ({
          numero: l.compte.numero,
          intitule: l.compte.intitule,
          montant: sens === 'RECETTE' ? Number(l.credit) - Number(l.debit) : Number(l.debit) - Number(l.credit),
        }))
        .filter((c) => Math.abs(c.montant) > 0.005);
      mouvements.push({ ecritureId: e.id, date: e.date, libelle: e.libelle, sens, montant: Math.abs(flux), contreparties });
    }
    return { mouvements, sansEffetTresorerie };
  }

  // -------------------------------------------------------------------------
  // COMPTE DE RÉSULTAT (Titre X ch. 2 § 2)
  // -------------------------------------------------------------------------

  /**
   * Ventile les contreparties d'un sens donné sur les postes de la
   * maquette. Un compte hors du périmètre de A et de B
   * (`CONTREPARTIES_RESULTAT_SMT_SYSCOHADA`) ne tombe dans AUCUN poste :
   * classes 1 et 2, qu'aucune ligne de variation ne corrige et qui feraient
   * entrer un flux de financement ou d'investissement dans le résultat
   * (anomalie n° 13). Il est repris par `fluxHorsResultat`, jamais perdu.
   */
  private ventilerFlux(
    mouvements: MouvementTresorerieSmt[],
    sens: 'RECETTE' | 'DEPENSE',
    postes: PosteFluxSmtSyscohada[],
  ): { postes: PosteCalculeSmtSyscohada[]; total: number } {
    const comptesParRef = new Map<string, Map<string, CompteDuPoste>>();
    for (const poste of postes) comptesParRef.set(poste.ref, new Map());

    for (const m of mouvements) {
      if (m.sens !== sens) continue;
      for (const c of m.contreparties) {
        // `find` : l'ordre des postes de la table est celui de la maquette,
        // et les postes résiduels (SR2, SD6) portent leurs exclusions · le
        // premier qui répond est le bon.
        const poste = postes.find((p) => correspond(c.numero, p.comptes, p.exclusions));
        if (!poste) continue; // hors A et B · voir `fluxHorsResultat`
        const parCompte = comptesParRef.get(poste.ref)!;
        const existant = parCompte.get(c.numero);
        if (existant) existant.montant += c.montant;
        else parCompte.set(c.numero, { numero: c.numero, intitule: c.intitule, montant: c.montant });
      }
    }

    const resultat = postes.map((p) => {
      const comptes = [...comptesParRef.get(p.ref)!.values()]
        .filter((c) => Math.abs(c.montant) > 0.005)
        .sort((a, b) => a.numero.localeCompare(b.numero));
      return {
        ref: p.ref,
        libelle: p.libelle,
        note: p.note,
        montant: comptes.reduce((s, c) => s + c.montant, 0),
        comptes,
      };
    });
    return { postes: resultat, total: resultat.reduce((s, p) => s + p.montant, 0) };
  }

  /**
   * FLUX HORS RÉSULTAT · les encaissements et décaissements que le compte de
   * résultat du SMT n'a AUCUNE ligne pour recevoir : apport ou prélèvement
   * de l'exploitant, emprunt souscrit ou remboursé (classe 1), acquisition
   * ou cession d'immobilisation (classe 2).
   *
   * Ils ne sont PAS un correctif de G, à la différence du jeu SYCEBNL dont
   * les postes captaient les classes 1 à 3 par exclusion et devaient donc
   * les retrancher ensuite. Ici, la table les tient déjà hors de A et de B
   * (`CONTREPARTIES_RESULTAT_SMT_SYSCOHADA`, anomalie n° 13) : G est juste
   * sans eux, et les soustraire une seconde fois le fausserait. Ils sont
   * EXPOSÉS parce que le ch. 1 § 1 range « les immobilisations acquises ou
   * cédées » et « les emprunts souscrits ou remboursés » parmi les quatre
   * éléments de l'inventaire extra-comptable de fin d'exercice : le lecteur
   * doit les avoir sous les yeux, à leur place, hors du résultat.
   *
   * Signe : positif pour un encaissement, négatif pour un décaissement.
   *
   * Une contrepartie qui n'est ni dans le périmètre de A/B ni dans les
   * classes 1 et 2 (classe 9, ou une dépréciation de trésorerie 592 à 594
   * portée par erreur face à un compte de caisse) est signalée à part :
   * jamais rattachée d'office à un poste voisin.
   */
  private fluxHorsResultat(mouvements: MouvementTresorerieSmt[]) {
    const parCle = new Map<string, Map<string, CompteDuPoste>>();
    for (const b of CONTREPARTIES_HORS_RESULTAT_SMT_SYSCOHADA) parCle.set(b.cle, new Map());
    const nonRattachees = new Map<string, CompteDuPoste>();

    const cumuler = (cible: Map<string, CompteDuPoste>, c: CompteDuPoste, montant: number) => {
      const existant = cible.get(c.numero);
      if (existant) existant.montant += montant;
      else cible.set(c.numero, { numero: c.numero, intitule: c.intitule, montant });
    };

    for (const m of mouvements) {
      for (const c of m.contreparties) {
        if (correspond(c.numero, CONTREPARTIES_RESULTAT_SMT_SYSCOHADA)) continue; // déjà en A ou en B
        const montant = m.sens === 'RECETTE' ? c.montant : -c.montant;
        const bucket = CONTREPARTIES_HORS_RESULTAT_SMT_SYSCOHADA.find((b) => correspond(c.numero, b.comptes));
        if (bucket) cumuler(parCle.get(bucket.cle)!, c, montant);
        else cumuler(nonRattachees, c, montant);
      }
    }

    const trier = (m: Map<string, CompteDuPoste>) =>
      [...m.values()].filter((c) => Math.abs(c.montant) > 0.005).sort((a, b) => a.numero.localeCompare(b.numero));

    return {
      rubriques: CONTREPARTIES_HORS_RESULTAT_SMT_SYSCOHADA.map((b) => {
        const comptes = trier(parCle.get(b.cle)!);
        return { cle: b.cle, intitule: b.intitule, montant: comptes.reduce((s, c) => s + c.montant, 0), comptes };
      }),
      contrepartiesNonRattachees: trier(nonRattachees),
    };
  }

  /**
   * COMPOSANTES ATTENDUES DE L'ÉCART entre G (compte de résultat SMT) et le
   * « Résultat exercice » du bilan (SP2, lu dans les classes 6/7/8 ou au
   * compte 13).
   *
   * Les deux chemins ne peuvent pas coïncider en toutes circonstances, et ce
   * n'est pas un défaut du moteur : c'est la limite du modèle officiel, dite
   * aux anomalies n° 16 et 22 de la table. L'identité, vérifiée écriture par
   * écriture, est
   *
   *     G - Résultat bilan = (K1 + K2 + K592-594) - F
   *
   * où K est la somme des (crédit - débit) portés sur ces comptes par les
   * seules écritures SANS effet net sur la trésorerie, et F la ligne
   * DOTATIONS AMORTISSEMENTS. La démonstration tient en une ligne : dans une
   * écriture équilibrée sans flux de trésorerie, la somme des (crédit -
   * débit) est nulle, donc ce que le résultat comptable enregistre sur les
   * classes 6/7/8 est exactement l'opposé de ce qui est porté sur les autres
   * classes ; or G rattrape les classes 3 et 4 par ses lignes de variation
   * (SV1, SV2, SV3) et les dotations par F, mais rien ne rattrape les
   * classes 1 et 2 ni les dépréciations de trésorerie 592 à 594.
   *
   * Les deux cas courants, tous deux voulus par le texte :
   *  - une DOTATION (68/28, 69/19, 85/29) porte son crédit en classe 1 ou 2
   *    et sa charge en classe 6 ou 8 ; F la reprend, l'écart net est nul ;
   *  - une CESSION saisie en deux écritures (Dr 52 / Cr 82 le prix, puis
   *    Dr 81 / Cr 24 la valeur comptable) laisse la valeur comptable sans
   *    aucune ligne d'accueil : G est majoré d'autant (anomalie n° 22). La
   *    même cession saisie en UNE écriture ne produit pas d'écart, la
   *    valeur comptable étant alors une contrepartie du mouvement de
   *    trésorerie.
   *
   * `residuel` est la part que cette identité n'explique pas. Elle doit être
   * nulle : non nulle, elle signale un vrai défaut (compte hors plan,
   * écriture déséquilibrée, contrepartie non rattachée), et elle est
   * exposée telle quelle plutôt qu'absorbée.
   */
  private composantesEcartConcordance(
    sansEffetTresorerie: Awaited<ReturnType<EtatsFinanciersSmtSyscohadaService['ecrituresDeLExercice']>>,
    dotations: number,
  ) {
    let classe1 = 0;
    let classe2 = 0;
    let depreciationsTresorerie = 0;
    let autresComptes = 0;
    for (const e of sansEffetTresorerie) {
      for (const l of e.lignes) {
        const k = Number(l.credit) - Number(l.debit);
        const numero = l.compte.numero;
        if (numero.startsWith('1')) classe1 += k;
        else if (numero.startsWith('2')) classe2 += k;
        else if (correspond(numero, COMPTES_DEPRECIATION_TRESORERIE_SMT_SYSCOHADA)) depreciationsTresorerie += k;
        else if (!correspond(numero, CONTREPARTIES_RESULTAT_SMT_SYSCOHADA) && !this.estTresorerie(numero)) {
          // Ni dans le périmètre de A/B, ni une classe 1 ou 2, ni de la
          // trésorerie : classe 9, ou compte hors plan. Compté à part pour
          // que le résiduel reste nul et que l'anomalie se voie.
          autresComptes += k;
        }
      }
    }
    return {
      // Financement et investissement enregistrés sans passer par la caisse
      // (dotations comprises, que F reprend juste après).
      classe1,
      classe2,
      depreciationsTresorerie,
      autresComptes,
      dotations,
      total: classe1 + classe2 + depreciationsTresorerie + autresComptes - dotations,
    };
  }

  /** Variation d'un poste de bilan compte par compte · pour le drill-down des lignes SV. */
  private variationParCompte(
    cloture: Map<string, PosteCalculeSmtSyscohada>,
    ouverture: Map<string, PosteCalculeSmtSyscohada>,
    ref: string,
  ): CompteDuPoste[] {
    const parNumero = new Map<string, CompteDuPoste>();
    // Convention (N-1) - N · anomalie n° 2 de la table, celle du compte 603
    // (stock initial moins stock final), seule lecture qui rende exacts à
    // la fois les opérateurs imprimés et la formule G = C - D + E - F.
    for (const c of ouverture.get(ref)?.comptes ?? []) {
      parNumero.set(c.numero, { numero: c.numero, intitule: c.intitule, montant: c.montant });
    }
    for (const c of cloture.get(ref)?.comptes ?? []) {
      const existant = parNumero.get(c.numero);
      if (existant) existant.montant -= c.montant;
      else parNumero.set(c.numero, { numero: c.numero, intitule: c.intitule, montant: -c.montant });
    }
    return [...parNumero.values()]
      .filter((c) => Math.abs(c.montant) > 0.005)
      .sort((a, b) => a.numero.localeCompare(b.numero));
  }

  /**
   * Le compte de résultat d'UN exercice · appelé pour N puis pour N-1, dont
   * la maquette imprime la colonne (voir la note de tête).
   */
  private async construireCompteDeResultat(tenantId: string, exerciceId: string) {
    const [ecritures, lignesN] = await Promise.all([
      this.ecrituresDeLExercice(tenantId, exerciceId),
      this.chargerLignes(tenantId, exerciceId),
    ]);
    const { mouvements, sansEffetTresorerie } = this.classerEcritures(ecritures);

    const recettes = this.ventilerFlux(mouvements, 'RECETTE', POSTES_RECETTES_SMT_SYSCOHADA);
    const depenses = this.ventilerFlux(mouvements, 'DEPENSE', POSTES_DEPENSES_SMT_SYSCOHADA);

    const { parRef: cloture } = this.resoudreBilan(lignesN);
    const { parRef: ouverture } = this.resoudreBilan(this.aLOuverture(lignesN));
    const montantDe = (source: Map<string, PosteCalculeSmtSyscohada>, ref: string) => source.get(ref)?.montant ?? 0;

    /*
      LIGNE F · DOTATIONS AMORTISSEMENTS, lue dans les MOUVEMENTS propres de
      l'exercice (report à-nouveau et écritures de clôture exclus), et non
      dans le solde.

      ÉCART ASSUMÉ avec le commentaire de `COMPTES_DOTATIONS_SMT_SYSCOHADA`,
      qui annonce une lecture « en SOLDE » : l'écriture de clôture vire les
      classes 6, 7 et 8 au compte 13 (Titre VII COMPTE 13) et ramène donc le
      solde des comptes 68, 69 et 85 à ZÉRO. Un état demandé après clôture
      aurait imprimé F = 0 et un résultat G faux du montant des
      amortissements, sans qu'aucun contrôle ne le signale · A et B, eux,
      sont reconstitués depuis les écritures et ne souffrent pas de la
      clôture. Les deux lectures coïncident avant clôture (ces comptes n'ont
      pas de report à-nouveau : `AUCUN` au plan semé), la seconde survit à la
      clôture. Le périmètre de comptes, lui, reste exactement celui de la
      table.
    */
    const lignesDotations = lignesN.filter((l) => correspond(l.numero, COMPTES_DOTATIONS_SMT_SYSCOHADA));
    const dotations = lignesDotations.reduce((s, l) => s + (l.mouvementDebit - l.mouvementCredit), 0);

    // Formule officielle G = C - D + E - F · unique implémentation, celle de
    // la table (`calculerResultatSmt`), jamais recomposée ici.
    const calcule = calculerResultatSmt({
      recettes: recettes.total,
      depenses: depenses.total,
      stocks: { n: montantDe(cloture, 'SA2'), n1: montantDe(ouverture, 'SA2') },
      creances: { n: montantDe(cloture, 'SA3'), n1: montantDe(ouverture, 'SA3') },
      dettes: { n: montantDe(cloture, 'SP4'), n1: montantDe(ouverture, 'SP4') },
      dotations,
    });

    const retraitements: PosteCalculeSmtSyscohada[] = RETRAITEMENTS_SMT_SYSCOHADA.map((r) => ({
      ref: r.ref,
      libelle: r.libelle,
      note: r.note,
      montant: calcule.lignes[r.ref as 'SV1' | 'SV2' | 'SV3' | 'SF'],
      signeOfficiel: r.signeOfficiel,
      lettre: r.lettre,
      comptes:
        r.posteBilan !== null
          ? this.variationParCompte(cloture, ouverture, r.posteBilan)
          : lignesDotations
              .filter((l) => Math.abs(l.mouvementDebit - l.mouvementCredit) > 0.005)
              .sort((a, b) => a.numero.localeCompare(b.numero))
              .map((l) => ({
                numero: l.numero,
                intitule: l.intitule,
                montant: l.mouvementDebit - l.mouvementCredit,
              })),
    }));

    const parRef = new Map<string, PosteCalculeSmtSyscohada>();
    for (const p of [...recettes.postes, ...depenses.postes, ...retraitements]) parRef.set(p.ref, p);
    // Les quatre lignes de total et de solde. Leur montant vient de
    // `calculerResultatSmt` et non d'une somme de `deRefs` : A et B sont des
    // sommes, mais C = A - B et G = C - D + E - F sont des formules signées
    // (anomalies n° 1 et 2).
    const montantsTotaux: Record<string, number> = { SRA: calcule.A, SDB: calcule.B, SC: calcule.C, SG: calcule.G };
    for (const t of TOTAUX_COMPTE_RESULTAT_SMT_SYSCOHADA) {
      parRef.set(t.ref, {
        ref: t.ref,
        libelle: t.libelle,
        note: null,
        montant: montantsTotaux[t.ref],
        lettre: t.lettre,
        comptes: [],
        estTotal: true,
      });
    }

    const hors = this.fluxHorsResultat(mouvements);
    const resultatBilan = montantDe(cloture, REF_RESULTAT_SMT_SYSCOHADA);
    const composantes = this.composantesEcartConcordance(sansEffetTresorerie, dotations);
    const ecart = calcule.G - resultatBilan;

    return {
      parRef,
      recettes: recettes.postes,
      depenses: depenses.postes,
      retraitements,
      calcule,
      fluxHorsResultat: hors.rubriques,
      contrepartiesNonRattachees: hors.contrepartiesNonRattachees,
      controle: {
        resultatBilan,
        ecart,
        concordant: Math.abs(ecart) < 0.01,
        composantesEcart: composantes,
        // Ce qui reste inexpliqué après l'identité ci-dessus · doit être nul.
        residuel: ecart - composantes.total,
      },
    };
  }

  async compteDeResultat(tenantId: string, exerciceId: string) {
    const exerciceN1Id = await trouverExerciceN1(this.exerciceService, tenantId, exerciceId);
    const [n, n1] = await Promise.all([
      this.construireCompteDeResultat(tenantId, exerciceId),
      exerciceN1Id ? this.construireCompteDeResultat(tenantId, exerciceN1Id) : Promise.resolve(null),
    ]);

    const lignes = ORDRE_COMPTE_RESULTAT_SMT_SYSCOHADA.map((ref) => {
      const poste = n.parRef.get(ref)!;
      return { ...poste, montantN1: n1 ? (n1.parRef.get(ref)?.montant ?? 0) : undefined };
    });

    return {
      lignes,
      recettes: n.recettes,
      totalRecettes: n.calcule.A,
      depenses: n.depenses,
      totalDepenses: n.calcule.B,
      soldeCaisse: n.calcule.C,
      retraitements: n.retraitements,
      // Lettres D et E, que la maquette invoque dans la formule sans les
      // attribuer à aucune ligne · anomalie n° 1, lecture fixée par la table.
      lettres: { D: n.calcule.D, E: n.calcule.E, F: n.calcule.F },
      lettresDE: LETTRES_D_E_SMT_SYSCOHADA,
      definitionVariation: DEFINITION_VARIATION_SMT_SYSCOHADA,
      resultatExercice: n.calcule.G,
      exerciceN1Disponible: exerciceN1Id !== null,
      fluxHorsResultat: n.fluxHorsResultat,
      contrepartiesNonRattachees: n.contrepartiesNonRattachees,
      controle: n.controle,
    };
  }

  // -------------------------------------------------------------------------
  // NOTE 4 · JOURNAL DE TRÉSORERIE SMT
  // -------------------------------------------------------------------------

  /**
   * NOTE 4 · JOURNAL DE TRÉSORERIE SMT (Titre X ch. 3).
   *
   * « NB : prévoir un journal par banque et un journal pour la caisse. » ·
   * un journal par COMPTE de trésorerie, donc, chacun ouvert sur son
   * « report à nouveau » et clos sur son « solde à reporter », comme la
   * maquette l'imprime.
   *
   * ## Un livre de caisse, pas un extrait du compte de résultat
   *
   * Ce journal balaie les LIGNES portées sur chaque compte de trésorerie, et
   * non les seules opérations qui ont un effet net sur la trésorerie de
   * l'entité. La différence tient au virement interne : un versement de la
   * caisse à la banque n'est ni une recette ni une dépense pour l'entité (il
   * est donc absent des lignes A et B), mais c'est bel et bien une sortie de
   * la caisse et une entrée en banque. L'omettre laisserait un journal dont
   * le solde à reporter ne serait pas celui du compte · un livre de caisse
   * faux. Le NB officiel le dit lui-même en prescrivant un journal par
   * compte.
   *
   * Ces lignes sont marquées `virementInterne` et ne reçoivent aucune
   * ventilation : les colonnes officielles ne classent que des natures de
   * recette et de dépense, et un virement n'en est pas une.
   *
   * ## Deux découpages officiels distincts, tous deux repris tels quels
   *
   * Les colonnes de ventilation du ch. 3 (Ventes · Autres · Matériel et
   * Mobilier ; Achats marchandises · Achats matières et fournitures ·
   * Loyers · Salaires · Impôts et taxes · Autres) ne recouvrent PAS les
   * postes SR/SD du compte de résultat : la colonne « Matériel et Mobilier »
   * accueille une cession d'immobilisation et le NB autorise une colonne
   * « compte exploitant », précisément ce que A et B excluent (anomalies
   * n° 13 et 21). Aucun double compte n'en résulte : la NOTE 4 n'alimente ni
   * A ni B, qui sont calculés depuis les postes de la table.
   *
   * ## Ventilation
   *
   * Attribuée quand l'écriture ne touche qu'UN compte de trésorerie · le cas
   * courant. Quand elle en touche plusieurs (un encaissement partagé entre
   * caisse et banque), répartir la ventilation entre eux supposerait une clé
   * que l'écriture ne porte pas : la ligne est comptée dans les colonnes
   * Recettes, Dépenses et Solde, mais laissée hors ventilation et signalée
   * par `lignesNonVentilees`.
   *
   * ## Contrôle
   *
   * `soldeAReporter` est confronté au solde du compte tel que la balance le
   * donne. L'égalité est la preuve que le journal est complet ; l'écart est
   * exposé, jamais absorbé.
   */
  async journalTresorerie(tenantId: string, exerciceId: string) {
    const [ecritures, lignes] = await Promise.all([
      this.ecrituresDeLExercice(tenantId, exerciceId),
      this.chargerLignes(tenantId, exerciceId),
    ]);

    const comptesTresorerie = lignes
      .filter((l) => this.estTresorerie(l.numero))
      .sort((a, b) => a.numero.localeCompare(b.numero));

    const journaux = comptesTresorerie.map((compte) => {
      // « Report à nouveau » : l'ouverture du compte, telle que la maquette
      // l'imprime en première ligne du journal.
      const reportANouveau = compte.reportDebit - compte.reportCredit;
      let solde = reportANouveau;
      let nonVentilees = 0;

      const operations = ecritures.flatMap((e) => {
        const surCeCompte = e.lignes.filter((l) => l.compteId === compte.compteId);
        if (surCeCompte.length === 0) return [];
        const mouvement = surCeCompte.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
        if (Math.abs(mouvement) < 0.005) return [];

        const tresorerieDeLEcriture = e.lignes.filter((l) => this.estTresorerie(l.compte.numero));
        const contreparties = e.lignes.filter((l) => !this.estTresorerie(l.compte.numero));
        // Aucune contrepartie hors trésorerie : l'écriture ne fait que
        // déplacer de l'argent entre deux comptes de l'entité.
        const virementInterne = contreparties.length === 0;
        // Une seule caisse ou banque touchée : la ventilation est
        // attribuable sans clé de répartition.
        const ventilable = !virementInterne && tresorerieDeLEcriture.length === 1;
        if (!virementInterne && !ventilable) nonVentilees += 1;

        const sens: 'RECETTE' | 'DEPENSE' = mouvement > 0 ? 'RECETTE' : 'DEPENSE';
        const colonnes = sens === 'RECETTE' ? VENTILATION_RECETTES_SMT_SYSCOHADA : VENTILATION_DEPENSES_SMT_SYSCOHADA;
        const ventilation: Record<string, number> = {};
        for (const col of colonnes) ventilation[col.cle] = 0;
        if (ventilable) {
          for (const l of contreparties) {
            const montant =
              sens === 'RECETTE' ? Number(l.credit) - Number(l.debit) : Number(l.debit) - Number(l.credit);
            const col = colonnes.find((k) => correspond(l.compte.numero, k.comptes, k.exclusions));
            if (col) ventilation[col.cle] += montant;
          }
        }

        solde += mouvement;
        return [
          {
            date: e.date,
            libelle: e.libelle,
            reference: e.reference,
            sens,
            recette: mouvement > 0 ? mouvement : 0,
            depense: mouvement < 0 ? -mouvement : 0,
            solde,
            virementInterne,
            ventile: ventilable,
            ventilation,
          },
        ];
      });

      return {
        compteId: compte.compteId,
        numero: compte.numero,
        intitule: compte.intitule,
        reportANouveau,
        operations,
        soldeAReporter: solde,
        totalRecettes: operations.reduce((s, o) => s + o.recette, 0),
        totalDepenses: operations.reduce((s, o) => s + o.depense, 0),
        lignesNonVentilees: nonVentilees,
        // Preuve que le journal est complet : son solde final doit être celui
        // du compte à la balance.
        soldeBalance: compte.solde,
        boucle: Math.abs(solde - compte.solde) < 0.01,
      };
    });

    return {
      journaux,
      colonnesRecettes: VENTILATION_RECETTES_SMT_SYSCOHADA.map((c) => ({
        cle: c.cle,
        libelle: c.libelle,
        rajoutAutorise: c.rajoutAutorise ?? false,
      })),
      colonnesDepenses: VENTILATION_DEPENSES_SMT_SYSCOHADA.map((c) => ({
        cle: c.cle,
        libelle: c.libelle,
        rajoutAutorise: c.rajoutAutorise ?? false,
      })),
      nb: NB_JOURNAL_TRESORERIE_SMT_SYSCOHADA,
    };
  }

  // -------------------------------------------------------------------------
  // NOTES 1, 2 et 3 (Titre X ch. 3)
  // -------------------------------------------------------------------------

  /**
   * NOTE 1 · « Tableau SMT de suivi du matériel, du mobilier et des
   * cautions ». Colonnes officielles : Date, Désignation, Montant, Date de
   * sortie, Prix de cession. C'est le « registre des immobilisations »
   * exigé au ch. 1 § 1.
   *
   * La colonne « Date » n'a pas d'homonyme ici (la maquette du SMT n'ouvre
   * qu'UNE colonne de date en entrée, là où le Système normal en distingue
   * plusieurs) : la date d'acquisition y est servie, qui est la date que le
   * registre d'un bien porte.
   *
   * LES CAUTIONS · le titre officiel vise « le matériel, le mobilier ET LES
   * CAUTIONS ». Un dépôt de garantie n'est pas une immobilisation
   * amortissable et n'entre donc pas au registre `Immobilisation`
   * d'OmegaX : il se comptabilise directement au compte 275 « Dépôts et
   * cautionnements versés » (plan de comptes SYSCOHADA). Ses soldes sont
   * donc ajoutés depuis la BALANCE, marqués `origine: 'BALANCE'`, faute de
   * quoi la note serait incomplète du tiers de son intitulé. Ils n'ont ni
   * date ni prix de cession : les colonnes correspondantes restent nulles
   * plutôt que remplies d'une date inventée.
   *
   * Le ch. 1 § 1 ajoute que « chaque immobilisation doit faire l'objet d'un
   * tableau d'amortissement basé sur le mode linéaire sans prorata temporis »
   * · règle propre au SMT, rappelée dans le retour (`amortissement`) pour
   * que l'état imprimé la porte.
   */
  async note1MaterielMobilierCautions(tenantId: string, exerciceId: string) {
    const exercice = await this.prisma.exercice.findFirstOrThrow({
      where: { id: exerciceId, tenantId },
      select: { dateFin: true },
    });
    const [immobilisations, lignes] = await Promise.all([
      this.prisma.immobilisation.findMany({
        where: { tenantId, dateAcquisition: { lte: exercice.dateFin } },
        orderBy: [{ dateAcquisition: 'asc' }],
      }),
      this.chargerLignes(tenantId, exerciceId),
    ]);

    const lignesRegistre = immobilisations.map((i) => ({
      origine: 'REGISTRE' as const,
      date: i.dateAcquisition,
      designation: i.designation,
      montant: Number(i.valeurOrigine),
      dateSortie: i.dateSortie,
      prixCession: i.prixCession === null ? null : Number(i.prixCession),
    }));

    const lignesCautions = lignes
      .filter((l) => correspond(l.numero, COMPTES_CAUTIONS_NOTE_1) && Math.abs(l.solde) > 0.005)
      .sort((a, b) => a.numero.localeCompare(b.numero))
      .map((l) => ({
        origine: 'BALANCE' as const,
        date: null,
        designation: `${l.numero} ${l.intitule}`,
        montant: l.solde,
        dateSortie: null,
        prixCession: null,
      }));

    const toutes = [...lignesRegistre, ...lignesCautions];
    return {
      lignes: toutes,
      total: toutes.reduce((s, l) => s + l.montant, 0),
      totalRegistre: lignesRegistre.reduce((s, l) => s + l.montant, 0),
      totalCautions: lignesCautions.reduce((s, l) => s + l.montant, 0),
      amortissement: AMORTISSEMENT_SMT,
      motifCautions:
        "Le titre officiel de la NOTE 1 vise « le matériel, le mobilier et les cautions ». Les cautions et dépôts de garantie ne sont pas des biens amortissables et ne figurent pas au registre des immobilisations : ils sont repris ici depuis le solde du compte 275 « Dépôts et cautionnements versés », sans date d'entrée ni prix de cession, que la comptabilité ne porte pas au niveau du compte.",
    };
  }

  /**
   * NOTE 2 · « État des stocks ». Colonnes officielles : Référence,
   * Désignation, Quantité, Prix unitaire, Montant, et deux lignes de
   * synthèse, VALEUR DU STOCK FINAL et VALEUR DU STOCK INITIAL · « c'est de
   * la différence entre ces deux valeurs que se déduit la variation des
   * stocks N / N-1 portée au compte de résultat » (ch. 3), d'où le
   * rapprochement avec la ligne SV1 exposé ici.
   *
   * LACUNE ASSUMÉE : OmegaX ne tient pas d'inventaire physique · il n'a ni
   * quantité ni prix unitaire à porter. Les colonnes correspondantes sont
   * renvoyées à `null` et l'état le déclare, plutôt que d'afficher une
   * quantité de 1 qui laisserait croire à un inventaire tenu. Référence et
   * Désignation sont servies par le numéro et l'intitulé du compte de
   * stock, Montant par son solde.
   *
   * Le périmètre est celui du POSTE SA2 du bilan (classe 3 entière,
   * dépréciations 39 comprises, donc en valeur nette), pas une définition
   * refaite ici : c'est la seule façon que la note et la ligne SV1 portent
   * le même montant.
   */
  async note2Stocks(tenantId: string, exerciceId: string) {
    const lignes = await this.chargerLignes(tenantId, exerciceId);
    const { parRef: cloture } = this.resoudreBilan(lignes);
    const { parRef: ouverture } = this.resoudreBilan(this.aLOuverture(lignes));

    const comptes = cloture.get('SA2')!.comptes.filter((c) => Math.abs(c.montant) > 0.005);
    const valeurStockFinal = cloture.get('SA2')!.montant;
    const valeurStockInitial = ouverture.get('SA2')!.montant;

    return {
      lignes: comptes.map((c) => ({
        reference: c.numero,
        designation: c.intitule,
        quantite: null,
        prixUnitaire: null,
        montant: c.montant,
      })),
      lignesSynthese: LIGNES_SYNTHESE_NOTE_2_SMT_SYSCOHADA,
      valeurStockFinal,
      valeurStockInitial,
      // Sens (N-1) - N, celui de la ligne SV1 et du compte 603 · anomalie
      // n° 2 de la table. Le montant imprimé au compte de résultat est
      // exactement celui-ci.
      variationSv1: valeurStockInitial - valeurStockFinal,
      quantitesTenues: false,
      motifQuantites:
        "OmegaX ne tient pas d'inventaire physique : les colonnes Quantité et Prix unitaire de la maquette officielle ne peuvent pas être servies depuis la comptabilité et doivent être complétées à la main sur l'état imprimé, à partir de l'inventaire extra-comptable que le Titre X ch. 1 § 1 impose au responsable de l'entité.",
    };
  }

  /**
   * VENTILATION PAR ÉCHÉANCE des soldes de tiers, compte par compte.
   *
   * DEUX parts sont MESURÉES, la troisième est un reste. La ligne dont
   * l'échéance est postérieure à la clôture est NON ÉCHUE ; celle dont
   * l'échéance est atteinte à la clôture est ÉCHUE ; celle qui ne porte
   * AUCUNE échéance n'est ni l'une ni l'autre et n'entre dans aucune des
   * deux. Elle n'est surtout pas rangée d'office en non échu : l'état
   * affirmerait alors un terme que personne n'a saisi, et la lacune de tenue
   * se fondrait dans un total au lieu de se voir (même doctrine que
   * `LigneEcriture.dateEcheance` au schéma et que
   * `NoteAnnexeService.chargerEcheances` pour le Système normal, dont les
   * NOTES 4, 7 et 8 portent les colonnes « Créances à un an au plus ·
   * Créances à plus d'un an et à deux ans au plus · Créances à plus de deux
   * ans » et les NOTES 16A, 17, 18 et 19 les mêmes en dettes, Titre IX
   * ch. 6).
   *
   * LA DATE DE RÉFÉRENCE EST LA CLÔTURE, parce que c'est à cette date que
   * l'état est arrêté : le Titre X intitule la note « État des créances et
   * des dettes non échues AU 31 DÉCEMBRE » (ch. 3), et le ch. 1 § 2 la
   * range sous le même intitulé parmi les composantes des Notes annexes.
   *
   * UNE LIGNE LETTRÉE EST SOLDÉE · la créance est encaissée, la dette payée,
   * il n'y a plus d'échéance à porter. Même filtre que les notes du Système
   * normal, pour que les deux jeux d'états ne datent pas la même créance
   * autrement, et même filtre que le report à-nouveau en mode DÉTAIL, qui ne
   * reporte que les mouvements non lettrés ET LEUR ÉCHÉANCE (voir
   * `ExerciceService.cloturer`) : une facture impayée depuis deux exercices
   * reste donc datable. Un compte de tiers tenu en mode SOLDE, lui, est
   * reporté en une ligne agrégée qui ne peut porter aucune échéance · son
   * ouverture tombe en part non ventilée, ce que la note dit.
   *
   * LE PÉRIMÈTRE EST DONNÉ, PAS REDÉFINI ICI · les identifiants des comptes
   * viennent des postes SA3 et SP4 déjà résolus, et c'est ce qui distingue
   * cette lecture de celle du jumeau SYCEBNL. Filtrer sur la classe 4, comme
   * il le fait pour SON bilan, serait faux sous cette maquette : SA3 joint
   * les 50 « Titres de placement » et 51 « Valeurs à encaisser » (anomalie
   * n° 6) et retranche les 590, 591, SP4 ajoute les 599, et les deux postes
   * excluent le 49 de leur filtre principal pour le reprendre hors filtre de
   * sens (anomalie n° 5). La ventilation porterait alors sur d'autres
   * comptes que ceux que la note imprime, et ses parts ne sommeraient plus
   * au solde affiché.
   *
   * PAS DE PAGINATION, à la différence des notes du Système normal : le
   * S.M.T est réservé aux entités dont le chiffre d'affaires reste sous
   * soixante millions de F CFA au plus haut des trois seuils (art. 13), et
   * ce service lit déjà toutes les écritures de l'exercice en une fois
   * (`ecrituresDeLExercice`). Une lecture bornée aux seuls comptes de la
   * note, non lettrés, y est strictement plus légère.
   */
  private async partsParEcheance(
    tenantId: string,
    exerciceId: string,
    compteIds: string[],
  ): Promise<Map<string, PartsEcheanceSmtSyscohada>> {
    const parCompte = new Map<string, PartsEcheanceSmtSyscohada>();
    if (compteIds.length === 0) return parCompte;

    const exercice = await this.prisma.exercice.findFirstOrThrow({
      where: { id: exerciceId, tenantId },
      select: { dateFin: true },
    });
    const lignesTiers = await this.prisma.ligneEcriture.findMany({
      // Même porte que la balance qui sert le reste de la note : les états
      // financiers sont des documents légaux et ne lisent que le
      // livre-journal, jamais le brouillard (voir `chargerLignes`).
      where: {
        ecriture: { tenantId, exerciceId, statut: StatutEcriture.VALIDEE },
        lettre: null,
        compteId: { in: compteIds },
      },
      select: { compteId: true, debit: true, credit: true, dateEcheance: true },
    });

    for (const l of lignesTiers) {
      const montant = Number(l.debit) - Number(l.credit);
      if (montant === 0) continue;
      // Sans échéance, la ligne n'est ni échue ni non échue : elle n'est
      // comptée nulle part et se retrouvera dans le reste, sous son nom.
      if (!l.dateEcheance) continue;
      const parts = parCompte.get(l.compteId) ?? { ...PARTS_ECHEANCE_NULLES_SMT_SYSCOHADA };
      if (l.dateEcheance > exercice.dateFin) parts.nonEchu += montant;
      else parts.echu += montant;
      parCompte.set(l.compteId, parts);
    }
    return parCompte;
  }

  /**
   * NOTE 3 · « État des créances et des dettes non échues au 31 décembre ».
   * DEUX tableaux distincts (anomalie n° 19), chacun avec ses colonnes et sa
   * ligne de total : Créances (« Nom du client ») et Dettes (« Nom du
   * fournisseur »), montants relevés au 31 décembre et au 1er janvier.
   *
   * « Montant au 1er janvier » est l'OUVERTURE de l'exercice, c'est-à-dire
   * le report à-nouveau du compte, pas le solde de l'exercice N-1 rechargé.
   * Les deux coïncident quand la clôture a été passée, mais l'ouverture est
   * ce que la maquette demande et c'est elle qui est servie.
   *
   * ANOMALIE DU TEXTE, signalée et non corrigée : le ch. 3 écrit que c'est
   * « la variation EN POURCENTAGE » qui alimente les lignes « variation des
   * créances » et « variation des dettes d'exploitation » du compte de
   * résultat. Un pourcentage ne s'ajoute pas à des francs, et la formule
   * G = C - D + E - F ne pourrait pas boucler ainsi. Les lignes SV2 et SV3
   * prennent donc la variation EN VALEUR (ouverture moins clôture, anomalie
   * n° 2), et la colonne officielle « Variation % » est servie à part, pour
   * l'impression. `variationValeur` est exposée à côté pour que le lecteur
   * voie ce qui alimente réellement le compte de résultat.
   *
   * La colonne « Date » de la maquette n'a pas d'équivalent au niveau d'un
   * compte de tiers (une créance agrège plusieurs pièces de dates
   * différentes) : elle est laissée vide plutôt que remplie d'une date
   * arbitraire. Le détail par pièce est dans le journal de suivi des
   * créances impayées, pièce distincte du ch. 3.
   *
   * Périmètre : les POSTES SA3 et SP4 du bilan, dépréciations et titres de
   * placement compris · même remarque qu'à la NOTE 2, c'est ce qui fait que
   * la note et les lignes SV2 / SV3 portent le même montant.
   *
   * ## « NON ÉCHUES », ce que l'intitulé commande
   *
   * L'intitulé officiel n'est pas « état des créances et des dettes » : le
   * Titre X écrit « **État des créances et des dettes non échues** (NOTE 3) »
   * au ch. 1 § 2 et « **État des créances et des dettes non échues au 31
   * décembre** » en tête du ch. 3. Prendre les postes SA3 et SP4 entiers sans
   * rien distinguer présente donc comme non échue une créance dont le terme
   * est passé · c'est précisément l'information que la note doit porter.
   * Chaque ligne rend désormais la ventilation de son solde en
   * `montantNonEchu`, `montantEchu` et `montantNonVentile`.
   *
   * LES TROIS PARTS SOMMENT TOUJOURS À `montantCloture`, parce que la
   * troisième est définie comme le RESTE des deux autres et jamais mesurée
   * pour elle-même. C'est ce qui garantit qu'aucun montant n'apparaisse ni ne
   * s'évapore : ce que la lecture des lignes ne sait pas dater reste au
   * bilan, visible, sous le nom de part non ventilée. Une ligne sans échéance
   * y tombe ; un report à-nouveau passé en mode SOLDE aussi (il agrège en une
   * ligne unique et ne peut porter aucune échéance) ; une dépréciation 49 ou
   * 59 et une provision à court terme 499 ou 599 également, n'ayant par
   * nature aucun terme à porter ; et une part non ventilée NÉGATIVE dans le
   * tableau des créances signale un règlement non lettré en face d'une
   * facture datée, qui est aussi une lacune de tenue et doit se voir.
   *
   * `montantCloture` RESTE LE SOLDE ENTIER du compte, et n'est pas ramené à
   * la seule part non échue. Deux raisons. La note justifie les postes SA3 et
   * SP4 du bilan et les lignes SV2 et SV3 du compte de résultat, qui sont
   * pris sur le solde : en retrancher la part échue ferait diverger la note
   * des états qu'elle justifie, et la formule G = C - D + E - F cesserait de
   * boucler. Et sur un dossier où aucune échéance n'est saisie · le cas de
   * tous ceux ouverts avant que ce champ soit servi · filtrer viderait la
   * note entièrement. La ventilation s'AJOUTE donc à la maquette au lieu de
   * l'amputer, et `echeancesTenues` dit si elle est complète.
   *
   * La ventilation ne porte QUE sur la clôture. « Montant au 1er janvier »
   * n'est pas ventilé : une échéance s'apprécie à une date donnée, et dire
   * d'une créance qu'elle était échue au 1er janvier demanderait de rejouer
   * l'exercice précédent à sa propre date d'arrêté. Le calcul serait faux et
   * personne ne le verrait.
   */
  async note3CreancesDettes(tenantId: string, exerciceId: string) {
    const lignes = await this.chargerLignes(tenantId, exerciceId);
    const { parRef: cloture } = this.resoudreBilan(lignes);
    const { parRef: ouverture } = this.resoudreBilan(this.aLOuverture(lignes));

    const nomParCompte = new Map<string, string>();
    const rattachements = await this.prisma.tiersCompte.findMany({
      where: { tiers: { tenantId } },
      include: { tiers: { select: { nom: true } } },
    });
    const compteIdParNumero = new Map(lignes.map((l) => [l.numero, l.compteId]));
    for (const r of rattachements) nomParCompte.set(r.compteId, r.tiers.nom);

    // Les comptes à ventiler sont ceux que les deux postes ont retenus À LA
    // CLÔTURE, et eux seuls : c'est la date à laquelle l'état est arrêté, et
    // un compte soldé au 31 décembre n'a plus de terme à porter.
    const compteIdsVentilables = [
      ...new Set(
        REFS_NOTE_3_SMT_SYSCOHADA.flatMap((ref) =>
          (cloture.get(ref)?.comptes ?? []).map((c) => compteIdParNumero.get(c.numero)),
        ).filter((id): id is string => Boolean(id)),
      ),
    ];
    const parts = await this.partsParEcheance(tenantId, exerciceId, compteIdsVentilables);

    const construire = (ref: string) => {
      // MÊME SIGNE que `calculerPosteBilan`, lu au même endroit : un poste
      // d'actif porte son solde débiteur en positif, un poste de passif son
      // solde créditeur en positif. Le recopier en dur ici ferait qu'une
      // dette non échue se lirait en négatif sous un total de dettes positif.
      const signe = signePosteBilanSmtSyscohada(ref);
      const parNumero = new Map<string, { cloture: number; ouverture: number; intitule: string }>();
      for (const c of ouverture.get(ref)?.comptes ?? []) {
        parNumero.set(c.numero, { cloture: 0, ouverture: c.montant, intitule: c.intitule });
      }
      for (const c of cloture.get(ref)?.comptes ?? []) {
        const existant = parNumero.get(c.numero);
        if (existant) existant.cloture = c.montant;
        else parNumero.set(c.numero, { cloture: c.montant, ouverture: 0, intitule: c.intitule });
      }
      return [...parNumero.entries()]
        .filter(([, v]) => Math.abs(v.cloture) > 0.005 || Math.abs(v.ouverture) > 0.005)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([numero, v]) => {
          const compteId = compteIdParNumero.get(numero);
          const p = (compteId && parts.get(compteId)) || PARTS_ECHEANCE_NULLES_SMT_SYSCOHADA;
          const montantNonEchu = signe * p.nonEchu;
          const montantEchu = signe * p.echu;
          return {
            date: null,
            numero,
            nom: (compteId && nomParCompte.get(compteId)) || v.intitule,
            montantCloture: v.cloture,
            montantOuverture: v.ouverture,
            // Alimente réellement SV2 / SV3 · sens (N-1) - N.
            variationValeur: v.ouverture - v.cloture,
            // Une variation en % n'a pas de sens à partir d'une ouverture
            // nulle (division par zéro) : `null` plutôt qu'un infini affiché.
            variationPourcent:
              Math.abs(v.ouverture) < 0.005 ? null : ((v.cloture - v.ouverture) / Math.abs(v.ouverture)) * 100,
            montantNonEchu,
            montantEchu,
            // LE RESTE, jamais une mesure autonome · voir la note de tête.
            montantNonVentile: v.cloture - montantNonEchu - montantEchu,
          };
        });
    };

    const creances = construire(REFS_NOTE_3_SMT_SYSCOHADA[0]);
    const dettes = construire(REFS_NOTE_3_SMT_SYSCOHADA[1]);
    const totalCreancesNonVentilees = creances.reduce((s, c) => s + c.montantNonVentile, 0);
    const totalDettesNonVentilees = dettes.reduce((s, d) => s + d.montantNonVentile, 0);
    // Une seule part non ventilée suffit à rendre la ventilation incomplète :
    // la note ne peut plus affirmer que ses totaux sont ceux du « non échu ».
    const echeancesTenues = Math.abs(totalCreancesNonVentilees) < 0.005 && Math.abs(totalDettesNonVentilees) < 0.005;
    return {
      creances,
      totalCreances: creances.reduce((s, c) => s + c.montantCloture, 0),
      totalCreancesNonEchues: creances.reduce((s, c) => s + c.montantNonEchu, 0),
      totalCreancesEchues: creances.reduce((s, c) => s + c.montantEchu, 0),
      totalCreancesNonVentilees,
      dettes,
      totalDettes: dettes.reduce((s, d) => s + d.montantCloture, 0),
      totalDettesNonEchues: dettes.reduce((s, d) => s + d.montantNonEchu, 0),
      totalDettesEchues: dettes.reduce((s, d) => s + d.montantEchu, 0),
      totalDettesNonVentilees,
      echeancesTenues,
      motifEcheances: echeancesTenues
        ? null
        : "Le Titre X intitule cette note « État des créances et des dettes non échues au 31 décembre » (ch. 1 § 2 et ch. 3). Une ligne de tiers sans date d'échéance n'est ni échue ni non échue : elle est portée à part, jamais rangée d'office dans le non échu. Renseignez la date d'échéance sur les lignes de tiers, et tenez les comptes de tiers en report à-nouveau mode DÉTAIL, pour que la ventilation soit complète. Les dépréciations 49 et 59 et les provisions 499 et 599, qui n'ont aucun terme à porter, restent par nature en part non ventilée.",
      // Les deux lignes du compte de résultat que cette note justifie.
      variationSv2: creances.reduce((s, c) => s + c.variationValeur, 0),
      variationSv3: dettes.reduce((s, d) => s + d.variationValeur, 0),
      reserveVariationPourcent:
        "Le Titre X ch. 3 écrit que « la variation en pourcentage » alimente les lignes « variation des créances » et « variation des dettes d'exploitation » du compte de résultat. Un pourcentage ne s'additionne pas à des montants : la formule G = C - D + E - F ne boucle qu'avec la variation EN VALEUR, qui est celle portée au compte de résultat. La colonne « Variation % » de la maquette est servie telle quelle pour l'impression. Anomalie du texte officiel, signalée et non corrigée.",
    };
  }

  /**
   * Fiche récapitulative du jeu SMT · les trois documents du ch. 1 § 2, les
   * quatre notes du ch. 3, les deux journaux de suivi (pièces de base, non
   * numérotées comme notes) et les quatre éléments de l'inventaire
   * extra-comptable de fin d'exercice.
   */
  ficheNotes() {
    return {
      documents: DOCUMENTS_SMT_SYSCOHADA,
      notes: NOTES_SMT_SYSCOHADA,
      journauxDeSuivi: JOURNAUX_DE_SUIVI_SMT_SYSCOHADA,
      inventaireExtraComptable: INVENTAIRE_EXTRA_COMPTABLE_SMT,
      amortissement: AMORTISSEMENT_SMT,
    };
  }

  // -------------------------------------------------------------------------
  // CONTRÔLE D'ÉLIGIBILITÉ (AUDCIF art. 11 et 13)
  // -------------------------------------------------------------------------

  /**
   * ÉLIGIBILITÉ AU SYSTÈME MINIMAL DE TRÉSORERIE · art. 13 : « Sont
   * éligibles au Système minimal de trésorerie, les entités dont le chiffre
   * d'affaires hors taxes annuel est inférieur aux seuils suivants :
   * soixante (60) millions de F CFA […] pour les entités de négoce ;
   * quarante (40) millions […] pour les entités artisanales et assimilées ;
   * trente (30) millions […] pour les entités de services », chacun « ou
   * l'équivalent dans l'unité monétaire ayant cours légal dans l'État
   * partie ». Le même article précise que « les petites entités sont
   * assujetties, SAUF OPTION, au Système minimal de trésorerie ».
   *
   * TROIS seuils, et non un : le SMT n'a pas de seuil unique comme le jeu
   * SYCEBNL (art. 6, trente millions par catégorie de ressources). Lequel
   * s'applique dépend de la QUALIFICATION de l'activité · négoce, artisanat,
   * services. OmegaX ne la connaît pas : `Tenant` ne porte pas cette
   * catégorie, et la déduire du plan de comptes ou du libellé de l'activité
   * serait écrire une règle que le texte confie à l'entité. Le contrôle
   * présente donc le chiffre d'affaires FACE AUX TROIS seuils, et laisse
   * l'entité qualifier son activité · l'arbitrage reste humain.
   *
   * Il ne CONVERTIT pas davantage : les seuils sont en F CFA, la RDC tient
   * ses comptes en CDF ou en USD, et le cours de conversion n'appartient pas
   * au texte comptable. Le montant est affiché dans la monnaie de tenue du
   * dossier, les seuils rappelés en F CFA avec leur clause « ou
   * l'équivalent ». Aucun dossier n'est déclaré inéligible sur une
   * conversion que le logiciel aurait inventée.
   *
   * Et il rappelle l'art. 11 : « Toute entité est, SAUF EXCEPTION LIÉE À SA
   * TAILLE, soumise au Système normal de présentation des états financiers
   * et de tenue des comptes. » Le Système normal est la règle, le SMT
   * l'exception · un dossier sous les seuils PEUT rester au Système normal,
   * l'inverse n'est pas vrai.
   *
   * CHIFFRE D'AFFAIRES · compte 70 « Ventes » (701 à 707 au plan semé),
   * c'est-à-dire les postes TA à TD du Système normal, dont le poste XB
   * « CHIFFRE D'AFFAIRES (A + B + C + D) » est la somme (Titre IX ch. 4 et
   * ch. 7). Le Titre X n'en donnant pas d'autre définition, c'est celle-là
   * qui sert. Lu en SOLDE (montant facturé) et non en encaissements :
   * l'art. 13 parle de chiffre d'affaires, pas de recettes · une entité qui
   * facture beaucoup et encaisse peu n'échappe pas au Système normal.
   */
  async eligibilite(tenantId: string, exerciceId: string) {
    const [lignes, tenant] = await Promise.all([
      this.chargerLignes(tenantId, exerciceId),
      // `select` borné : la devise et le système comptable suffisent ici.
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { devise: true, systemeComptableSyscohada: true },
      }),
    ]);
    // findFirst borné au tenant : un id d'exercice d'un AUTRE dossier ne doit
    // rien renvoyer (même une date de début est une fuite).
    const exercice = await this.prisma.exercice.findFirstOrThrow({
      where: { id: exerciceId, tenantId },
      select: { dateDebut: true, dateFin: true },
    });

    const lignesCa = lignes.filter((l) => correspond(l.numero, COMPTES_CHIFFRE_AFFAIRES_ART13));
    // Un produit porte un solde créditeur (négatif en solde algébrique) :
    // la négation le remet dans son sens naturel de lecture.
    const chiffreAffaires = lignesCa.reduce((s, l) => s - l.solde, 0);

    // Ventilation par les quatre postes TA à TD, dont XB est la somme · le
    // détail que le lecteur attend derrière « chiffre d'affaires ».
    const ventilation = ['TA', 'TB', 'TC', 'TD'].map((ref) => {
      const poste = trouvePosteCompteResultat(ref)!;
      const comptes = lignesCa
        .filter((l) => correspond(l.numero, poste.comptes))
        .sort((a, b) => a.numero.localeCompare(b.numero))
        .map((l) => ({ numero: l.numero, intitule: l.intitule, montant: -l.solde }));
      return {
        ref,
        libelle: poste.libelle,
        lettre: poste.lettre,
        montant: comptes.reduce((s, c) => s + c.montant, 0),
        comptes,
      };
    });
    // Un compte du 70 qu'aucun des quatre postes ne réclame · impossible
    // avec le plan semé (70 = 701 à 707 exactement), signalé plutôt que
    // perdu si un plan personnalisé en ajoutait un.
    const refsTaTd = ['TA', 'TB', 'TC', 'TD'].map((r) => trouvePosteCompteResultat(r)!);
    const comptesHorsVentilation: CompteDuPoste[] = lignesCa
      .filter((l) => !refsTaTd.some((p) => correspond(l.numero, p.comptes)))
      .map((l) => ({ numero: l.numero, intitule: l.intitule, montant: -l.solde }));

    return {
      exercice,
      chiffreAffaires,
      ventilation,
      comptesHorsVentilation,
      deviseDossier: tenant.devise,
      systemeActuel: tenant.systemeComptableSyscohada,
      conversionAppliquee: false,
      seuils: SEUILS_SMT_ART13_FCFA.map((s) => ({
        ...s,
        clause: CLAUSE_EQUIVALENT_ART13,
        // Comparaison brute, monnaie de tenue contre F CFA : elle n'a de
        // sens que si le dossier est tenu en F CFA. `conversionAppliquee:
        // false` et l'avertissement disent pourquoi elle n'est pas une
        // conclusion.
        souSeuilSiMemeMonnaie: chiffreAffaires < s.montantFcfa,
      })),
      qualificationParLEntite:
        "L'article 13 fixe trois seuils selon que l'entité relève du négoce, de l'artisanat ou des services. OmegaX ne qualifie pas l'activité du dossier à la place de l'entité : comparez le chiffre d'affaires au seuil de VOTRE catégorie.",
      rappelArticle11:
        "Article 11 : « Toute entité est, sauf exception liée à sa taille, soumise au Système normal de présentation des états financiers et de tenue des comptes. » Le Système minimal de trésorerie est l'exception, et l'article 13 la laisse optionnelle (« sauf option ») : une entité sous les seuils peut choisir de rester au Système normal.",
      avertissementConversion:
        "Les seuils de l'article 13 sont exprimés en F CFA, « ou l'équivalent dans l'unité monétaire ayant cours légal dans l'État partie ». OmegaX ne convertit pas : la RDC n'est pas en zone franc et le cours de conversion n'appartient pas au texte comptable. Comparez le chiffre d'affaires au seuil converti au cours que retient votre entité.",
    };
  }
}

/**
 * Un poste résolu du jeu S.M.T SYSCOHADA. `note` porte le renvoi de note que
 * les maquettes du ch. 2 impriment en colonne « Note » · le jeu SYCEBNL ne
 * le porte qu'au bilan, celui-ci l'a sur les deux états. `lettre` n'existe
 * que sur les lignes que la maquette du compte de résultat étiquette (A, B,
 * C, F, G) ; `signeOfficiel` que sur les trois lignes de variation, dont la
 * maquette imprime l'opérateur.
 */
export interface PosteCalculeSmtSyscohada {
  ref: string;
  libelle: string;
  note: string | null;
  montant: number;
  montantN1?: number;
  comptes: CompteDuPoste[];
  estTotal?: boolean;
  lettre?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  signeOfficiel?: 1 | -1;
}

/**
 * Ce qu'un compte des postes SA3 / SP4 porte de DATABLE : la part de son
 * solde que des lignes ouvertes et datées permettent de qualifier, échue ou
 * non échue · voir `EtatsFinanciersSmtSyscohadaService.partsParEcheance`.
 *
 * DEUX champs, pas trois. La part non ventilée n'est pas mesurée ici : elle
 * est ce qui RESTE du solde du compte une fois ces deux-là retranchées, et
 * c'est la seule définition qui garantisse qu'aucun montant ne s'évapore ·
 * une ligne sans échéance, un report à-nouveau passé en mode SOLDE qui n'a
 * pu porter aucune échéance, un compte dont la lecture des lignes ne
 * recoupe pas le solde, tout tombe dans le même reste, que `note3CreancesDettes`
 * NOMME au lieu de le fondre dans un total.
 */
interface PartsEcheanceSmtSyscohada {
  nonEchu: number;
  echu: number;
}

const PARTS_ECHEANCE_NULLES_SMT_SYSCOHADA: PartsEcheanceSmtSyscohada = { nonEchu: 0, echu: 0 };

/**
 * Les DEUX postes du bilan que la NOTE 3 détaille, dans l'ordre des deux
 * tableaux de la maquette · Créances puis Dettes (ch. 3, anomalie n° 19).
 * Ce sont les seuls postes dont la table porte le renvoi `note: '3'`, et le
 * spec le revérifie contre la table plutôt que de faire confiance à ces deux
 * chaînes : un renvoi qui bougerait là-bas sans bouger ici ferait imprimer
 * une note qui ne justifie plus le bilan qu'elle accompagne.
 */
const REFS_NOTE_3_SMT_SYSCOHADA = ['SA3', 'SP4'] as const;

/**
 * Le signe d'un poste, LU DANS LA TABLE et non recopié · exactement la règle
 * de `calculerPosteBilan` (un poste d'actif porte son solde débiteur en
 * positif, un poste de passif son solde créditeur en positif). Les parts par
 * échéance sont calculées en débit moins crédit, donc dans le sens brut de la
 * balance : sans ce signe, une dette non échue se lirait en négatif sous un
 * total de dettes positif, et les trois parts ne sommeraient plus au solde
 * affiché. Une ref inconnue jette ici, plutôt que de rendre un signe par
 * défaut qui inverserait un tableau en silence.
 */
function signePosteBilanSmtSyscohada(ref: string): 1 | -1 {
  const poste = [...POSTES_BILAN_ACTIF_SMT_SYSCOHADA, ...POSTES_BILAN_PASSIF_SMT_SYSCOHADA].find((p) => p.ref === ref);
  if (!poste) throw new Error(`Poste de bilan S.M.T SYSCOHADA inconnu : ${ref}`);
  return poste.sens === 'ACTIF' ? 1 : -1;
}

/** Une opération de trésorerie et la ventilation de son montant sur les contreparties. */
interface MouvementTresorerieSmt {
  ecritureId: string;
  date: Date;
  libelle: string;
  sens: 'RECETTE' | 'DEPENSE';
  montant: number;
  contreparties: CompteDuPoste[];
}

/**
 * Compte 275 « Dépôts et cautionnements versés » (plan de comptes
 * SYSCOHADA, Titre VII COMPTE 27 « Autres immobilisations financières ») ·
 * les « cautions » du titre de la NOTE 1, que le registre des
 * immobilisations ne porte pas. Défini ici et non dans la table : c'est un
 * choix de SERVICE (où lire les cautions faute de registre), pas un
 * rattachement de poste.
 */
const COMPTES_CAUTIONS_NOTE_1 = ['275'];

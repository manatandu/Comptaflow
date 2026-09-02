import { Injectable } from '@nestjs/common';
import { ClasseCompte } from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import {
  CompteDuPoste,
  LigneBalancePourEtat,
  chargerLignes,
  correspond,
  trouverExerciceN1,
} from '../etats-financiers/etats-financiers.communs';
import {
  COMPTES_RESULTAT_SYSCOHADA,
  COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR_SYSCOHADA,
  LIBELLE_RESULTAT_SYSCOHADA,
  ORDRE_AFFICHAGE_ACTIF_SYSCOHADA,
  ORDRE_AFFICHAGE_PASSIF_SYSCOHADA,
  POSTES_ACTIF_SYSCOHADA,
  POSTES_PASSIF_SYSCOHADA,
  PosteBilanDeBase,
  REF_RESULTAT_SYSCOHADA,
  REF_TRESORERIE_PASSIF_SYSCOHADA,
  TOTAUX_ACTIF_SYSCOHADA,
  TOTAUX_PASSIF_SYSCOHADA,
  TotalBilan,
} from './correspondance-bilan-syscohada';
import {
  ORDRE_AFFICHAGE_COMPTE_RESULTAT,
  POSTES_COMPTE_RESULTAT_SYSCOHADA,
  SOLDES_INTERMEDIAIRES,
  calculerSoldesIntermediaires,
  montantSigne,
  posteDuCompteSyscohada,
  trouvePosteCompteResultat,
  trouveSoldeIntermediaire,
} from './correspondance-compte-resultat-syscohada';
import {
  COMPTES_EXCLUS_SANS_REPRISE,
  COMPTES_SANS_TRESORERIE_SYSCOHADA,
  CONTROLE_ZH_PAR_LE_BILAN,
  ColonneBilan,
  ORDRE_AFFICHAGE_FLUX_SYSCOHADA,
  PosteFluxTresorerieSyscohada,
  SensSolde,
  TOTAUX_FLUX_SYSCOHADA,
  TOUS_LES_POSTES_FLUX_SYSCOHADA,
  TermeComptes,
  TermeFluxTresorerie,
  besoinsDuPoste,
} from './correspondance-tft-syscohada';

/**
 * ÉTATS FINANCIERS DU SYSCOHADA RÉVISÉ · Système normal (AUDCIF art. 11) :
 * bilan, compte de résultat, tableau des flux de trésorerie.
 *
 * Ce service ne porte AUCUNE règle comptable : chaque poste, chaque compte,
 * chaque formule et chaque anomalie du texte officiel vit dans les trois
 * tables voisines, qui citent leur source ligne à ligne
 * (`correspondance-bilan-syscohada.ts`, `correspondance-compte-resultat-
 * syscohada.ts`, `correspondance-tft-syscohada.ts`). Le service les APPLIQUE.
 * Corollaire pratique : une divergence avec l'AUDCIF se corrige dans la
 * table, jamais ici, sinon la source citée cesse de décrire le calcul réel.
 *
 * Il reprend la MÉCANIQUE de `etats-financiers/etats-financiers.service.ts`
 * (SYCEBNL) et rien d'autre : les deux référentiels ne partagent que les
 * aides techniques de `etats-financiers.communs.ts` (CLAUDE.md §6). Aucun
 * poste, aucun numéro de compte, aucun libellé SYCEBNL n'apparaît ici.
 *
 * ## Trois différences de fond avec le moteur SYCEBNL, toutes voulues
 *
 * 1. **Convention de signe du compte de résultat.** Le ch. 4 du Titre IX
 *    écrit « les postes de charges (préfixe R) sont saisis EN NÉGATIF ; les
 *    formules de totalisation sont des SOMMES, jamais des différences ». Tout
 *    poste vaut donc crédit − débit, charge comprise (`montantSigne`), et les
 *    neuf lignes X* s'obtiennent par simple addition
 *    (`calculerSoldesIntermediaires`). Le SYCEBNL porte ses charges en
 *    positif parce que SON texte écrit des différences : on ne transpose pas.
 * 2. **Méthode du tableau de flux.** Le ch. 5 impose la méthode INDIRECTE
 *    (« le point d'entrée est l'EBE, jamais le résultat net »), là où le
 *    SYCEBNL est en méthode directe. Le tableau se calcule donc à partir des
 *    postes DÉJÀ RÉSOLUS du bilan et du compte de résultat, pas des comptes
 *    en vrac · c'est ce que `TermeFluxTresorerie` décrit.
 * 3. **Le résultat au bilan (CJ) prend les soldes intermédiaires 132 à 138**
 *    mais PAS le 130 (résultat N-1 en instance d'affectation) · anomalie n° 7
 *    de la table du bilan. Le 130 ressort donc en `comptesNonRattaches`, ce
 *    qui est le comportement attendu, pas un oubli.
 *
 * ## Garanties communes aux trois états, chacune héritée d'un incident
 *
 * - Un compte qu'aucun poste ne réclame est LISTÉ, jamais absorbé par un
 *   poste voisin ni masqué (`comptesNonRattaches`, `comptesNonVentiles`) :
 *   un plan personnalisé qui s'écarte des préfixes officiels doit se voir.
 * - Le comparatif N-1 vient de `trouverExerciceN1` ; sans exercice antérieur
 *   il reste `undefined`, jamais un zéro qui laisserait croire à un exercice
 *   réel et vide.
 * - Le résultat se lit dans les classes 6/7/8 AVANT clôture ou dans le
 *   compte 13 APRÈS, jamais dans les deux : les deux sources non nulles à la
 *   fois lèvent `controle.doubleComptageProbable`.
 * - Le tableau de flux boucle deux fois (ZH par les flux, ZH par le bilan) et
 *   l'écart est présenté, jamais corrigé : il chiffre exactement ce que la
 *   ventilation FA à FQ ne couvre pas.
 */

// ---------------------------------------------------------------------------
// Structures rendues au client
// ---------------------------------------------------------------------------

/**
 * Ligne du bilan · même forme que `LigneBilan` côté client (`client/src/lib/
 * types.ts`), enrichie du renvoi de note et du renvoi de bas de poste que le
 * modèle du ch. 3 imprime (« 3e » sur CE, « dont Placement en Net » sur AJ et
 * AK). Les deux sont des chaînes d'affichage, jamais des valeurs calculées ·
 * le ch. 7 ne donne aucune correspondance pour le renvoi (anomalie n° 8 de la
 * table du bilan).
 *
 * `brut`/`amortissement` : ACTIF seulement, le modèle exigeant trois colonnes
 * (Brut, Amort. et déprec., Net). `amortissement` est une magnitude POSITIVE,
 * `montant` (net) = `brut` − `amortissement`.
 */
export interface LigneBilanSyscohada {
  ref: string;
  libelle: string;
  montant: number;
  montantN1?: number;
  brut?: number;
  brutN1?: number;
  amortissement?: number;
  amortissementN1?: number;
  estTotal: boolean;
  comptes: CompteDuPoste[];
  note?: string;
  renvoi?: string;
}

export interface BilanSyscohada {
  actif: LigneBilanSyscohada[];
  passif: LigneBilanSyscohada[];
  totalActif: number;
  totalPassif: number;
  totalActifN1?: number;
  totalPassifN1?: number;
  exerciceN1Disponible: boolean;
  equilibre: boolean;
  comptesNonRattaches: CompteDuPoste[];
  controle: {
    resultatClasses678: number;
    resultatCompte13: number;
    doubleComptageProbable: boolean;
  };
}

/**
 * Ligne du compte de résultat · postes de base (TA à RS) et lignes de solde
 * (XA à XI) dans la même liste, comme le modèle du ch. 4 les entrelace.
 * `estSolde` distingue les secondes ; `formuleOfficielle` porte alors la
 * formule telle qu'imprimée (« Somme TA à RB »).
 *
 * `montant` est SIGNÉ selon la convention du modèle : une charge ressort
 * négative. Le client l'imprime tel quel, sans le re-négativer ni le passer
 * en valeur absolue.
 */
export interface LigneCompteResultatSyscohada {
  ref: string;
  libelle: string;
  montant: number;
  montantN1?: number;
  comptes: CompteDuPoste[];
  estSolde?: boolean;
  formuleOfficielle?: string;
  /** Renvois de la colonne NOTE du ch. 4, non développés (« 27 » reste « 27 »). */
  notes: string[];
}

/**
 * Les NEUF lignes X* du modèle, nommées. Huit sont des soldes de gestion,
 * chacun reçu par un sous-compte du 13 à la clôture (Titre VII COMPTE 13 :
 * 132 à 138, puis 131 ou 139) ; `chiffreAffaires` (XB) est le neuvième et
 * n'est PAS un solde de gestion, c'est un agrégat de ventes (A + B + C + D)
 * qu'aucun sous-compte du 13 ne reçoit.
 */
export interface SoldesCompteResultatSyscohada {
  margeCommerciale: number; // XA
  chiffreAffaires: number; // XB
  valeurAjoutee: number; // XC
  excedentBrutExploitation: number; // XD
  resultatExploitation: number; // XE
  resultatFinancier: number; // XF
  resultatActivitesOrdinaires: number; // XG
  resultatHorsActivitesOrdinaires: number; // XH
  resultatNet: number; // XI
}

export interface CompteResultatSyscohada {
  lignes: LigneCompteResultatSyscohada[];
  soldes: SoldesCompteResultatSyscohada;
  soldesN1?: SoldesCompteResultatSyscohada;
  exerciceN1Disponible: boolean;
  comptesNonRattaches: CompteDuPoste[];
  controle: {
    resultatToutesClassesDeGestion: number;
    ecart: number;
    coherent: boolean;
  };
}

/** Ligne chiffrée du tableau de flux · même forme que `LigneFluxTresorerie` côté client. */
export interface LigneFluxSyscohada {
  ref: string;
  libelle: string;
  montant: number;
  montantN1?: number;
  comptes: CompteDuPoste[];
  estTotal?: boolean;
  /** Clé A à H de la colonne de droite du modèle · seulement sur ZA et ZB à ZH. */
  repere?: string;
}

/** Intitulé de rubrique intercalé par le modèle entre deux blocs de postes. */
export interface SectionFluxSyscohada {
  section: string;
}

/**
 * Un poste que la balance ne permet pas de chiffrer, ou pas entièrement.
 * Deux origines, jamais confondues, et le `raison` le dit toujours :
 *  - la donnée MANQUE (aucun exercice antérieur alors que le poste est une
 *    variation de bilan) · le poste vaut 0 et ne doit pas être imprimé ;
 *  - une part est INDÉTERMINABLE par numéro de compte (`nonDeterminables` de
 *    la table) · le poste est chiffré, mais avec la réserve nommée ici.
 * Dans les deux cas rien n'est approximé par une clé inventée.
 */
export interface PosteNonCalculable {
  ref: string;
  raison: string;
}

export interface TableauFluxTresorerieSyscohada {
  lignes: Array<LigneFluxSyscohada | SectionFluxSyscohada>;
  exerciceN1Disponible: boolean;
  comptesNonVentiles: CompteDuPoste[];
  postesNonCalculables: PosteNonCalculable[];
  controle: {
    tresorerieOuverture: number;
    variation: number;
    tresorerieClotureParFlux: number;
    tresorerieClotureParBilan: number;
    ecart: number;
    coherent: boolean;
  };
}

// ---------------------------------------------------------------------------
// Structures internes
// ---------------------------------------------------------------------------

/**
 * Poste de bilan résolu. `comptesBrut` est la colonne « Brut » seule (sans les
 * comptes d'amortissement et de dépréciation) : le tableau de flux la lit sur
 * AD et AI pour reconstituer les acquisitions (anomalie n° 3 de la table du
 * TFT), et elle serait fausse si on la déduisait de `comptes`.
 */
interface PosteBilanCalcule {
  ref: string;
  libelle: string;
  montant: number;
  brut?: number;
  amortissement?: number;
  comptes: CompteDuPoste[];
  comptesBrut: CompteDuPoste[];
}

interface ResolutionBilan {
  parRef: Map<string, PosteBilanCalcule>;
  resultatClasses678: number;
  resultatCompte13: number;
}

interface ResolutionCompteResultat {
  /** Montants signés de TOUS les refs · postes de base ET lignes X*. */
  montantsParRef: Record<string, number>;
  comptesParRef: Map<string, CompteDuPoste[]>;
  comptesNonRattaches: CompteDuPoste[];
  resultatToutesClassesDeGestion: number;
}

/** Tout ce dont un terme de flux a besoin pour être évalué. */
interface ContexteFlux {
  bilanCourant: ResolutionBilan;
  bilanAnterieur: ResolutionBilan;
  crCourant: ResolutionCompteResultat;
  crAnterieur: ResolutionCompteResultat;
  lignesCourant: LigneBalancePourEtat[];
  /**
   * Solde de CLÔTURE N-1 par numéro de compte, avec sa provenance : la balance
   * de l'exercice antérieur quand il existe, sinon le report à-nouveau de
   * l'exercice courant, qui EST cette clôture pour un compte de bilan (modes
   * SOLDE et DETAIL du semis) · même nombre, pas une approximation.
   */
  soldesAnterieurs: Map<string, number>;
  exerciceAnterieurDisponible: boolean;
}

/** Classes qui composent le bilan · la 6, la 7 et la 8 sont le résultat, la 9 est hors états. */
const CLASSES_DE_BILAN = new Set<ClasseCompte>([
  ClasseCompte.CLASSE_1,
  ClasseCompte.CLASSE_2,
  ClasseCompte.CLASSE_3,
  ClasseCompte.CLASSE_4,
  ClasseCompte.CLASSE_5,
]);

const CLASSES_DE_GESTION = new Set<ClasseCompte>([ClasseCompte.CLASSE_6, ClasseCompte.CLASSE_7, ClasseCompte.CLASSE_8]);

/** Tolérance d'arrondi commune · en deçà, un montant est nul et un contrôle boucle. */
const EPSILON = 0.005;

@Injectable()
export class EtatsFinanciersSyscohadaService {
  constructor(
    private readonly ecritureService: EcritureService,
    private readonly exerciceService: ExerciceService,
  ) {}

  private async trouverExerciceN1(tenantId: string, exerciceId: string): Promise<string | null> {
    return trouverExerciceN1(this.exerciceService, tenantId, exerciceId);
  }

  private async chargerLignes(tenantId: string, exerciceId: string | null): Promise<LigneBalancePourEtat[]> {
    return chargerLignes(this.ecritureService, tenantId, exerciceId);
  }

  // =========================================================================
  // BILAN · AUDCIF Titre IX ch. 3 section 2 (modèle, codes AD à DZ) et ch. 7
  // (correspondance postes/comptes). Voir `correspondance-bilan-syscohada.ts`.
  // =========================================================================

  /**
   * Poste d'ACTIF · brut, amortissements et dépréciations (magnitude
   * positive), net. Deux filtres, chacun tiré des clés de lecture du ch. 7 :
   * `sens_qualificatif` restreint un poste de tiers polyvalent au sens de
   * solde que le texte lui donne (BJ « soldes débiteurs ») ;
   * `comptesTransferesSiCrediteur` FAIT SORTIR du poste les comptes qu'un
   * poste de passif réclame alors (52/53 créditeurs, BS vers DR). Sans ce
   * second filtre un découvert bancaire serait compté DEUX FOIS, en négatif à
   * l'actif et en positif au passif, et le bilan serait déséquilibré du double
   * du découvert (anomalie n° 3 de la table).
   */
  private calculerPosteActif(poste: PosteBilanDeBase, lignes: LigneBalancePourEtat[]): PosteBilanCalcule {
    let lignesBrut = lignes.filter((l) => correspond(l.numero, poste.comptes, poste.exclusions));
    if (poste.sens_qualificatif === 'DEBITEUR') {
      lignesBrut = lignesBrut.filter((l) => l.solde > 0);
    }
    if (poste.comptesTransferesSiCrediteur) {
      lignesBrut = lignesBrut.filter((l) => !(correspond(l.numero, poste.comptesTransferesSiCrediteur!) && l.solde < 0));
    }
    const comptesBrut: CompteDuPoste[] = lignesBrut.map((l) => ({
      numero: l.numero,
      intitule: l.intitule,
      montant: l.solde,
    }));
    const brut = comptesBrut.reduce((s, c) => s + c.montant, 0);

    const lignesAmort = poste.comptesAmortissement
      ? lignes.filter((l) => correspond(l.numero, poste.comptesAmortissement!, poste.exclusionsAmortissement))
      : [];
    // PAS de négation sur `montant` ici : un compte d'amortissement bien formé
    // porte déjà un solde (débit − crédit) négatif, ce qui le soustrait
    // naturellement du brut par simple addition. Le signer en positif dans
    // CETTE somme l'ADDITIONNERAIT au brut au lieu de l'en déduire. La colonne
    // officielle « Amort. et déprec. », elle, veut la magnitude POSITIVE :
    // c'est `amortissement`, calculé juste en dessous, et lui seul.
    const comptesAmort: CompteDuPoste[] = lignesAmort.map((l) => ({
      numero: l.numero,
      intitule: l.intitule,
      montant: l.solde,
    }));
    // `|| 0` normalise le -0 que produit la négation d'une somme vide.
    const amortissement = -comptesAmort.reduce((s, c) => s + c.montant, 0) || 0;

    return {
      ref: poste.ref,
      libelle: poste.libelle,
      montant: brut - amortissement,
      brut,
      amortissement,
      comptes: [...comptesBrut, ...comptesAmort],
      comptesBrut,
    };
  }

  /**
   * Poste de PASSIF · solde créditeur net, dans son sens naturel de lecture
   * (pas de colonne Brut/Amort. au passif). Un compte de passif
   * structurellement DÉBITEUR ressort en négatif sans traitement spécial :
   * c'est exactement ce que le modèle attend de CB « Apporteurs capital non
   * appelé (-) », de CH « Report à nouveau (+ ou -) » et de DC, qui présente
   * la provision de retraite nette de l'actif du régime 1962 (anomalie n° 14).
   */
  private calculerPostePassif(poste: PosteBilanDeBase, lignes: LigneBalancePourEtat[]): PosteBilanCalcule {
    let matches = lignes.filter((l) => correspond(l.numero, poste.comptes, poste.exclusions));
    if (poste.sens_qualificatif === 'CREDITEUR') {
      matches = matches.filter((l) => l.solde < 0);
    }
    const comptes: CompteDuPoste[] = matches.map((l) => ({
      numero: l.numero,
      intitule: l.intitule,
      montant: -l.solde,
    }));
    const montant = comptes.reduce((s, c) => s + c.montant, 0);
    return { ref: poste.ref, libelle: poste.libelle, montant, comptes, comptesBrut: comptes };
  }

  /**
   * DR « Banques, établissements financiers et crédits de trésorerie » ·
   * traité à part parce qu'il PARTAGE ses numéros 52 et 53 avec BS, à l'actif,
   * et que seul le sens du solde les départage (ch. 7, clés de lecture : « 52,
   * 53 vont en BS si débiteurs, DR si créditeurs »). Ses comptes propres 561 et
   * 566 ne portent AUCUN qualificatif de sens : sans poste d'accueil débiteur,
   * un 561 débiteur doit rester visible en négatif ici plutôt que de
   * disparaître du bilan (anomalie n° 3, second alinéa).
   */
  private calculerDR(lignes: LigneBalancePourEtat[]): PosteBilanCalcule {
    const posteDR = POSTES_PASSIF_SYSCOHADA.find((p) => p.ref === REF_TRESORERIE_PASSIF_SYSCOHADA)!;
    const base = this.calculerPostePassif(posteDR, lignes);
    const decouverts = lignes.filter(
      (l) => correspond(l.numero, COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR_SYSCOHADA) && l.solde < 0,
    );
    const comptes = [
      ...base.comptes,
      ...decouverts.map((l) => ({ numero: l.numero, intitule: l.intitule, montant: -l.solde })),
    ];
    const montant = comptes.reduce((s, c) => s + c.montant, 0);
    return { ref: base.ref, libelle: base.libelle, montant, comptes, comptesBrut: comptes };
  }

  /**
   * CJ « Résultat net de l'exercice » · n'est PAS dans `POSTES_PASSIF_SYSCOHADA`
   * parce qu'il a deux sources exclusives l'une de l'autre. Titre VII COMPTE
   * 13 : le compte 13 n'est mouvementé qu'À LA CLÔTURE, « par le débit des
   * comptes de la classe 7 et des comptes créditeurs de la classe 8 » et « par
   * le crédit des comptes de la classe 6 […] pour solde ». Avant clôture le
   * résultat vit donc dans les classes 6/7/8, après clôture dans le 13 qui les
   * a soldées. On prend l'une OU l'autre, jamais les deux, et les deux
   * montants sont rendus au contrôle : non nuls ensemble, ils signalent un
   * double comptage (balance transmise à un moment ambigu de la clôture).
   *
   * Les comptes lus après clôture sont `COMPTES_RESULTAT_SYSCOHADA` (131 à
   * 139) et non « 13 » : le 130, résultat de l'exercice PRÉCÉDENT en instance
   * d'affectation, présenterait sinon le résultat N-1 comme résultat N sur
   * toute balance arrêtée avant l'assemblée (anomalie n° 7).
   */
  private calculerCJ(lignes: LigneBalancePourEtat[]): {
    poste: PosteBilanCalcule;
    resultatClasses678: number;
    resultatCompte13: number;
  } {
    const lignes678 = lignes.filter((l) => CLASSES_DE_GESTION.has(l.classe));
    const resultatClasses678 = lignes678.reduce((s, l) => s + montantSigne(l.totalDebit, l.totalCredit), 0);

    const lignes13 = lignes.filter((l) => correspond(l.numero, COMPTES_RESULTAT_SYSCOHADA));
    const resultatCompte13 = lignes13.reduce((s, l) => s + montantSigne(l.totalDebit, l.totalCredit), 0);

    const avantCloture = Math.abs(resultatClasses678) > EPSILON;
    const montant = avantCloture ? resultatClasses678 : resultatCompte13;
    const source = avantCloture ? lignes678 : lignes13;
    const comptes = source
      .filter((l) => Math.abs(l.solde) > EPSILON)
      .map((l) => ({ numero: l.numero, intitule: l.intitule, montant: montantSigne(l.totalDebit, l.totalCredit) }));

    return {
      poste: {
        ref: REF_RESULTAT_SYSCOHADA,
        libelle: LIBELLE_RESULTAT_SYSCOHADA,
        montant,
        comptes,
        comptesBrut: comptes,
      },
      resultatClasses678,
      resultatCompte13,
    };
  }

  /**
   * Résout tous les postes du bilan (détail, CJ, puis totaux) pour UN jeu de
   * lignes · appelée une fois par exercice utile (N, N-1, et N-2 pour la
   * colonne N-1 du tableau de flux). `lignes: []` résout tout à zéro sans cas
   * particulier : un poste sans compte mouvementé vaut légitimement 0.
   *
   * Les totaux agrègent aussi les `comptes` de leurs composantes, ce que le
   * bilan n'imprime pas (une rubrique de totalisation n'a pas de drill-down)
   * mais dont le tableau de flux a besoin : FD lit BG, FE lit DP, ZA lit
   * BT et DT, et il faut pouvoir dire QUELS comptes portent ces variations.
   */
  private resoudreTousLesPostesBilan(lignes: LigneBalancePourEtat[]): ResolutionBilan {
    const parRef = new Map<string, PosteBilanCalcule>();
    for (const poste of POSTES_ACTIF_SYSCOHADA) {
      parRef.set(poste.ref, this.calculerPosteActif(poste, lignes));
    }
    for (const poste of POSTES_PASSIF_SYSCOHADA) {
      if (poste.ref === REF_TRESORERIE_PASSIF_SYSCOHADA) continue; // traité par calculerDR
      parRef.set(poste.ref, this.calculerPostePassif(poste, lignes));
    }
    parRef.set(REF_TRESORERIE_PASSIF_SYSCOHADA, this.calculerDR(lignes));

    const { poste: posteCJ, resultatClasses678, resultatCompte13 } = this.calculerCJ(lignes);
    parRef.set(REF_RESULTAT_SYSCOHADA, posteCJ);

    // L'ORDRE des deux tableaux de totaux garantit qu'une ref n'est jamais
    // utilisée avant d'avoir été calculée (propriété figée par le spec de la
    // table). Les colonnes Brut et Amort. ne sont additionnées que côté ACTIF :
    // le modèle du ch. 3 ne les imprime pas au passif.
    for (const total of TOTAUX_ACTIF_SYSCOHADA) {
      parRef.set(total.ref, this.calculerTotalActif(total, parRef));
    }
    for (const total of TOTAUX_PASSIF_SYSCOHADA) {
      parRef.set(total.ref, this.calculerTotalPassif(total, parRef));
    }

    return { parRef, resultatClasses678, resultatCompte13 };
  }

  private calculerTotalActif(total: TotalBilan, parRef: Map<string, PosteBilanCalcule>): PosteBilanCalcule {
    const composantes = total.deRefs.map((ref) => parRef.get(ref));
    return {
      ref: total.ref,
      libelle: total.libelle,
      montant: composantes.reduce((s, p) => s + (p?.montant ?? 0), 0),
      // `p.brut ?? p.montant` : BU (Écart de conversion-Actif) n'a pas de
      // comptes d'amortissement et n'expose donc pas de colonne Brut distincte,
      // alors qu'il entre dans BZ · son net EST son brut.
      brut: composantes.reduce((s, p) => s + (p?.brut ?? p?.montant ?? 0), 0),
      amortissement: composantes.reduce((s, p) => s + (p?.amortissement ?? 0), 0),
      comptes: composantes.flatMap((p) => p?.comptes ?? []),
      comptesBrut: composantes.flatMap((p) => p?.comptesBrut ?? []),
    };
  }

  private calculerTotalPassif(total: TotalBilan, parRef: Map<string, PosteBilanCalcule>): PosteBilanCalcule {
    const composantes = total.deRefs.map((ref) => parRef.get(ref));
    const comptes = composantes.flatMap((p) => p?.comptes ?? []);
    return {
      ref: total.ref,
      libelle: total.libelle,
      montant: composantes.reduce((s, p) => s + (p?.montant ?? 0), 0),
      comptes,
      comptesBrut: comptes,
    };
  }

  /**
   * Comptes de bilan (classes 1 à 5) qu'AUCUN poste ne capte. Ils sont
   * SIGNALÉS, jamais rattachés d'office à un poste voisin : une non-conformité
   * se déclare, elle ne se devine pas. Ce sont eux qui expliquent un bilan
   * déséquilibré, et la liste `COMPTES_BILAN_SANS_POSTE_JUSTIFIES` de la table
   * dit lesquels sont là par construction du texte (130, 186 à 188, 585, 588 ·
   * anomalies n° 4, 5 et 7).
   *
   * Calculé sur N seulement : N-1 n'est qu'un comparatif d'affichage, pas un
   * état audité par cet appel.
   */
  private comptesNonRattachesDuBilan(lignes: LigneBalancePourEtat[]): CompteDuPoste[] {
    const rattaches = new Set<string>();
    for (const poste of [...POSTES_ACTIF_SYSCOHADA, ...POSTES_PASSIF_SYSCOHADA]) {
      for (const l of lignes) {
        if (
          correspond(l.numero, poste.comptes, poste.exclusions) ||
          (poste.comptesAmortissement &&
            correspond(l.numero, poste.comptesAmortissement, poste.exclusionsAmortissement))
        ) {
          rattaches.add(l.compteId);
        }
      }
    }
    for (const l of lignes) {
      // Les découverts (52/53 créditeurs) sont déjà couverts par BS, et le
      // résultat par CJ · ni l'un ni l'autre n'est un compte orphelin.
      if (
        correspond(l.numero, COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR_SYSCOHADA) ||
        correspond(l.numero, COMPTES_RESULTAT_SYSCOHADA)
      ) {
        rattaches.add(l.compteId);
      }
    }
    return lignes
      .filter((l) => CLASSES_DE_BILAN.has(l.classe) && !rattaches.has(l.compteId))
      .map((l) => ({ numero: l.numero, intitule: l.intitule, montant: l.solde }));
  }

  async bilan(tenantId: string, exerciceId: string): Promise<BilanSyscohada> {
    const exerciceN1Id = await this.trouverExerciceN1(tenantId, exerciceId);
    const [lignesN, lignesN1] = await Promise.all([
      this.chargerLignes(tenantId, exerciceId),
      this.chargerLignes(tenantId, exerciceN1Id),
    ]);

    const resolutionN = this.resoudreTousLesPostesBilan(lignesN);
    const resolutionN1 = this.resoudreTousLesPostesBilan(lignesN1);

    const refsTotaux = new Set([...TOTAUX_ACTIF_SYSCOHADA, ...TOTAUX_PASSIF_SYSCOHADA].map((t) => t.ref));
    const metadonnees = new Map<string, { note?: string; renvoi?: string }>();
    for (const p of [...POSTES_ACTIF_SYSCOHADA, ...POSTES_PASSIF_SYSCOHADA]) {
      metadonnees.set(p.ref, { note: p.note, renvoi: p.renvoi });
    }
    for (const t of [...TOTAUX_ACTIF_SYSCOHADA, ...TOTAUX_PASSIF_SYSCOHADA]) {
      metadonnees.set(t.ref, { note: t.note });
    }

    const enLigne = (ref: string): LigneBilanSyscohada => {
      const n = resolutionN.parRef.get(ref)!;
      const n1 = exerciceN1Id ? resolutionN1.parRef.get(ref) : undefined;
      const estTotal = refsTotaux.has(ref);
      const meta = metadonnees.get(ref) ?? {};
      return {
        ref,
        libelle: n.libelle,
        montant: n.montant,
        montantN1: n1?.montant,
        brut: n.brut,
        brutN1: n.brut !== undefined ? (n1?.brut ?? 0) : undefined,
        amortissement: n.amortissement,
        amortissementN1: n.amortissement !== undefined ? (n1?.amortissement ?? 0) : undefined,
        estTotal,
        // Une rubrique de totalisation n'a pas de drill-down : ses comptes sont
        // déjà présentés sous les postes qu'elle additionne, les répéter ici
        // ferait croire à un double compte.
        comptes: estTotal ? [] : n.comptes,
        note: meta.note,
        renvoi: meta.renvoi,
      };
    };

    const actif = ORDRE_AFFICHAGE_ACTIF_SYSCOHADA.map(enLigne);
    const passif = ORDRE_AFFICHAGE_PASSIF_SYSCOHADA.map(enLigne);

    const totalActif = resolutionN.parRef.get('BZ')!.montant;
    const totalPassif = resolutionN.parRef.get('DZ')!.montant;

    return {
      actif,
      passif,
      totalActif,
      totalPassif,
      totalActifN1: exerciceN1Id ? resolutionN1.parRef.get('BZ')!.montant : undefined,
      totalPassifN1: exerciceN1Id ? resolutionN1.parRef.get('DZ')!.montant : undefined,
      exerciceN1Disponible: exerciceN1Id !== null,
      // Tolérance d'arrondi ; un écart réel signale un compte non rattaché ou
      // un défaut du moteur d'écritures, pas un défaut de cette répartition.
      equilibre: Math.abs(totalActif - totalPassif) < 0.01,
      comptesNonRattaches: this.comptesNonRattachesDuBilan(lignesN),
      controle: {
        resultatClasses678: resolutionN.resultatClasses678,
        resultatCompte13: resolutionN.resultatCompte13,
        doubleComptageProbable:
          Math.abs(resolutionN.resultatClasses678) > EPSILON && Math.abs(resolutionN.resultatCompte13) > EPSILON,
      },
    };
  }

  // =========================================================================
  // COMPTE DE RÉSULTAT · AUDCIF Titre IX ch. 4 section 2 (modèle TA à XI,
  // colonne SIGNE, formules) et ch. 7 (correspondance postes/comptes).
  // Voir `correspondance-compte-resultat-syscohada.ts`.
  // =========================================================================

  /**
   * Résout les 33 postes de base PUIS les neuf lignes X* pour UN jeu de
   * lignes. Tous les montants suivent la convention du modèle
   * (`montantSigne` = crédit − débit, charge comprise), sans quoi les formules
   * de soldes, qui sont des SOMMES pures, seraient fausses de deux fois le
   * montant des charges.
   *
   * Les comptes d'une ligne de solde sont ceux de ses composantes, concaténés :
   * les `deRefs` du modèle sont disjoints à chaque niveau (XC lit XB, pas
   * TA à TD directement), donc aucun compte n'est compté deux fois.
   */
  private resoudreTousLesPostesCR(lignes: LigneBalancePourEtat[]): ResolutionCompteResultat {
    const comptesParRef = new Map<string, CompteDuPoste[]>();
    const comptesNonRattaches: CompteDuPoste[] = [];
    // Résultat « brut » de tous les comptes de gestion, indépendamment des
    // postes : c'est exactement la base sur laquelle le bilan calcule CJ, donc
    // le contrôle croisé entre les deux états.
    let resultatToutesClassesDeGestion = 0;

    for (const l of lignes) {
      const montant = montantSigne(l.totalDebit, l.totalCredit);
      const estCompteDeGestion = CLASSES_DE_GESTION.has(l.classe);
      if (estCompteDeGestion) resultatToutesClassesDeGestion += montant;

      const poste = posteDuCompteSyscohada(l.numero);
      if (!poste) {
        // Classes 1 à 5 (bilan) et classe 9 (« hors états de synthèse » selon
        // le ch. 7) : exclusion normale, aucun signalement. Un compte de
        // gestion sans poste, en revanche, est une non-conformité : listé.
        if (estCompteDeGestion) {
          comptesNonRattaches.push({ numero: l.numero, intitule: l.intitule, montant });
        }
        continue;
      }
      const existants = comptesParRef.get(poste.ref) ?? [];
      existants.push({ numero: l.numero, intitule: l.intitule, montant });
      comptesParRef.set(poste.ref, existants);
    }

    const montantsParRef: Record<string, number> = {};
    for (const poste of POSTES_COMPTE_RESULTAT_SYSCOHADA) {
      montantsParRef[poste.ref] = (comptesParRef.get(poste.ref) ?? []).reduce((s, c) => s + c.montant, 0);
    }
    // `calculerSoldesIntermediaires` résout XA à XI dans l'ordre du modèle,
    // chaque solde ne lisant que ce qui le précède.
    const montantsAvecSoldes = calculerSoldesIntermediaires(montantsParRef);
    for (const solde of SOLDES_INTERMEDIAIRES) {
      comptesParRef.set(
        solde.ref,
        solde.deRefs.flatMap((ref) => comptesParRef.get(ref) ?? []),
      );
    }

    return {
      montantsParRef: montantsAvecSoldes,
      comptesParRef,
      comptesNonRattaches,
      resultatToutesClassesDeGestion,
    };
  }

  private soldesNommes(montantsParRef: Record<string, number>): SoldesCompteResultatSyscohada {
    return {
      margeCommerciale: montantsParRef.XA ?? 0,
      chiffreAffaires: montantsParRef.XB ?? 0,
      valeurAjoutee: montantsParRef.XC ?? 0,
      excedentBrutExploitation: montantsParRef.XD ?? 0,
      resultatExploitation: montantsParRef.XE ?? 0,
      resultatFinancier: montantsParRef.XF ?? 0,
      resultatActivitesOrdinaires: montantsParRef.XG ?? 0,
      resultatHorsActivitesOrdinaires: montantsParRef.XH ?? 0,
      resultatNet: montantsParRef.XI ?? 0,
    };
  }

  async compteDeResultat(tenantId: string, exerciceId: string): Promise<CompteResultatSyscohada> {
    const exerciceN1Id = await this.trouverExerciceN1(tenantId, exerciceId);
    const [lignesN, lignesN1] = await Promise.all([
      this.chargerLignes(tenantId, exerciceId),
      this.chargerLignes(tenantId, exerciceN1Id),
    ]);

    const resN = this.resoudreTousLesPostesCR(lignesN);
    const resN1 = this.resoudreTousLesPostesCR(lignesN1);

    const lignes: LigneCompteResultatSyscohada[] = ORDRE_AFFICHAGE_COMPTE_RESULTAT.map((ref) => {
      const solde = trouveSoldeIntermediaire(ref);
      const poste = solde ? undefined : trouvePosteCompteResultat(ref);
      return {
        ref,
        libelle: solde?.libelle ?? poste!.libelle,
        montant: resN.montantsParRef[ref] ?? 0,
        // Jamais un faux zéro : sans exercice antérieur la colonne N-1 du
        // modèle reste vide, elle ne vaut pas 0.
        montantN1: exerciceN1Id ? (resN1.montantsParRef[ref] ?? 0) : undefined,
        comptes: resN.comptesParRef.get(ref) ?? [],
        estSolde: solde ? true : undefined,
        formuleOfficielle: solde?.formuleOfficielle,
        notes: solde?.notes ?? poste!.notes,
      };
    });

    // Contrôle croisé : le résultat net obtenu en additionnant les postes du
    // modèle (XI) doit être identique au résultat obtenu en soldant TOUS les
    // comptes de gestion, celui que le bilan loge en CJ. L'écart vaut
    // exactement la somme des comptes non rattachés : un compte de gestion
    // hors poste disparaît des totaux de l'état, et le compte de résultat
    // cesse alors de boucler avec le bilan. Exposé plutôt que masqué.
    const resultatNet = resN.montantsParRef.XI ?? 0;
    const ecart = resN.resultatToutesClassesDeGestion - resultatNet;

    return {
      lignes,
      soldes: this.soldesNommes(resN.montantsParRef),
      soldesN1: exerciceN1Id ? this.soldesNommes(resN1.montantsParRef) : undefined,
      exerciceN1Disponible: exerciceN1Id !== null,
      comptesNonRattaches: resN.comptesNonRattaches,
      controle: {
        resultatToutesClassesDeGestion: resN.resultatToutesClassesDeGestion,
        ecart,
        coherent: Math.abs(ecart) < 0.01,
      },
    };
  }

  // =========================================================================
  // TABLEAU DES FLUX DE TRÉSORERIE · AUDCIF Titre IX ch. 5, MÉTHODE INDIRECTE
  // (§ 1.2.1 « le point d'entrée est l'EBE, jamais le résultat net »).
  // Voir `correspondance-tft-syscohada.ts` pour le rattachement terme à terme
  // et les 24 anomalies relevées.
  //
  // Le tableau ne relit pas la balance en vrac : chaque terme désigne soit un
  // POSTE déjà résolu du bilan ou du compte de résultat (par REF, lu sur N,
  // sur N-1 ou en variation), soit un ENSEMBLE DE COMPTES que le ch. 5
  // retraite nommément. C'est ce qui garantit que le tableau et les deux
  // autres états ne peuvent pas diverger : la trésorerie de ZA et du contrôle
  // de ZH est celle du bilan, découverts bancaires déjà transférés en DR.
  // =========================================================================

  /** Solde d'une ligne pris dans un sens donné · l'autre sens compte 0, aucune compensation. */
  private soldeDansLeSens(solde: number, sens: SensSolde): number {
    return sens === 'DEBITEUR' ? Math.max(solde, 0) : Math.max(-solde, 0);
  }

  /**
   * Un poste de bilan lu par un terme, avec ses comptes. `colonne: 'BRUT'`
   * rend la colonne Brut seule (FF et FG reconstituent les acquisitions sur le
   * brut, anomalie n° 3) ; un poste de passif n'ayant pas de colonne Brut, la
   * demande y retombe sur le net, ce qui est sa seule valeur.
   */
  private lirePosteBilan(
    resolution: ResolutionBilan,
    ref: string,
    colonne?: ColonneBilan,
  ): { montant: number; comptes: CompteDuPoste[] } {
    const p = resolution.parRef.get(ref);
    if (!p) return { montant: 0, comptes: [] };
    if (colonne === 'BRUT' && p.brut !== undefined) return { montant: p.brut, comptes: p.comptesBrut };
    return { montant: p.montant, comptes: p.comptes };
  }

  /** Différence compte à compte entre deux listes · sert aux lectures en VARIATION. */
  private differenceComptes(courant: CompteDuPoste[], anterieur: CompteDuPoste[]): CompteDuPoste[] {
    const parNumero = new Map<string, CompteDuPoste>();
    for (const c of courant) {
      const existant = parNumero.get(c.numero);
      parNumero.set(c.numero, {
        numero: c.numero,
        intitule: c.intitule,
        montant: (existant?.montant ?? 0) + c.montant,
      });
    }
    for (const c of anterieur) {
      const existant = parNumero.get(c.numero);
      parNumero.set(c.numero, {
        numero: c.numero,
        intitule: existant?.intitule ?? c.intitule,
        montant: (existant?.montant ?? 0) - c.montant,
      });
    }
    return [...parNumero.values()];
  }

  /** Lecture d'un ensemble de comptes · les quatre natures de `LectureCompte`. */
  private lireComptes(terme: TermeComptes, ctx: ContexteFlux): CompteDuPoste[] {
    const retenues = ctx.lignesCourant.filter((l) => correspond(l.numero, terme.prefixes, terme.exclusions));
    if (terme.lecture !== 'VARIATION_SOLDE') {
      return retenues.map((l) => {
        let montant: number;
        switch (terme.lecture) {
          case 'SOLDE_GESTION':
            montant = montantSigne(l.totalDebit, l.totalCredit);
            break;
          case 'MOUVEMENT_DEBIT':
            // Mouvements PROPRES de l'exercice, report à-nouveau exclu : sans
            // cette exclusion le report d'un compte d'immobilisation serait lu
            // comme une acquisition de l'exercice, et tout le tableau serait
            // faux dès le deuxième exercice (voir EcritureService.balance).
            montant = l.mouvementDebit;
            break;
          default:
            montant = l.mouvementCredit;
            break;
        }
        return { numero: l.numero, intitule: l.intitule, montant };
      });
    }

    // VARIATION_SOLDE · solde N moins solde N-1, chacun pris dans le sens
    // demandé. Le solde N-1 vient de la balance de l'exercice antérieur quand
    // il existe, sinon du report à-nouveau de N, qui EST cette clôture pour un
    // compte de bilan · voir `ContexteFlux.soldesAnterieurs`.
    const sens = terme.sensSolde ?? 'DEBITEUR';
    return retenues.map((l) => {
      const soldeN = this.soldeDansLeSens(l.solde, sens);
      const soldeN1 = this.soldeDansLeSens(ctx.soldesAnterieurs.get(l.numero) ?? 0, sens);
      return { numero: l.numero, intitule: l.intitule, montant: soldeN - soldeN1 };
    });
  }

  private evaluerTerme(terme: TermeFluxTresorerie, ctx: ContexteFlux): CompteDuPoste[] {
    if (terme.comptes) {
      return this.lireComptes(terme.comptes, ctx).map((c) => ({ ...c, montant: terme.signe * c.montant }));
    }
    const ref = terme.poste!;
    const lire = (bilan: ResolutionBilan, cr: ResolutionCompteResultat) =>
      ref.etat === 'BILAN'
        ? this.lirePosteBilan(bilan, ref.ref, ref.colonne)
        : { montant: cr.montantsParRef[ref.ref] ?? 0, comptes: cr.comptesParRef.get(ref.ref) ?? [] };

    const courant = lire(ctx.bilanCourant, ctx.crCourant);
    if (ref.lecture === 'N') {
      return courant.comptes.map((c) => ({ ...c, montant: terme.signe * c.montant }));
    }
    const anterieur = lire(ctx.bilanAnterieur, ctx.crAnterieur);
    const comptes =
      ref.lecture === 'N1' ? anterieur.comptes : this.differenceComptes(courant.comptes, anterieur.comptes);
    return comptes.map((c) => ({ ...c, montant: terme.signe * c.montant }));
  }

  /**
   * Un poste exige-t-il un exercice antérieur ? `besoinsDuPoste` (la table) ne
   * regarde que les postes de BILAN lus sur N-1 ou en variation, parce
   * qu'aucun terme du modèle ne lit le compte de résultat autrement que sur N.
   * On élargit ici au compte de résultat pour qu'un terme ajouté demain à la
   * table produise un signalement plutôt qu'un faux zéro silencieux.
   */
  private exigeExerciceAnterieur(poste: PosteFluxTresorerieSyscohada): boolean {
    return (
      besoinsDuPoste(poste).exerciceN1 ||
      poste.termes.some((t) => t.poste?.etat === 'COMPTE_RESULTAT' && t.poste.lecture !== 'N')
    );
  }

  /**
   * Un poste de flux, tous ses termes appliqués. Les comptes sont agrégés par
   * numéro : un même compte peut entrer plusieurs fois dans un poste avec des
   * signes opposés (FA lit XD, qui contient le 654 par RJ, puis retire ce même
   * 654 comme le § 1.2.1.1 l'ordonne), et le drill-down doit montrer la
   * contribution NETTE, pas deux lignes qui s'annulent.
   */
  private calculerPosteFlux(
    poste: PosteFluxTresorerieSyscohada,
    ctx: ContexteFlux,
  ): { montant: number; comptes: CompteDuPoste[] } {
    const parNumero = new Map<string, CompteDuPoste>();
    for (const terme of poste.termes) {
      for (const c of this.evaluerTerme(terme, ctx)) {
        const existant = parNumero.get(c.numero);
        parNumero.set(c.numero, {
          numero: c.numero,
          intitule: existant?.intitule ?? c.intitule,
          montant: (existant?.montant ?? 0) + c.montant,
        });
      }
    }
    const comptes = [...parNumero.values()]
      .filter((c) => Math.abs(c.montant) > EPSILON)
      .sort((a, b) => a.numero.localeCompare(b.numero));
    // `|| 0` normalise le -0 d'une somme de termes qui s'annulent.
    const montant = [...parNumero.values()].reduce((s, c) => s + c.montant, 0) || 0;
    return { montant, comptes };
  }

  /**
   * Refs de POSTES DE BASE du bilan couvertes par une ref, en développant les
   * rubriques de totalisation (BG donne BH, BI, BJ ; BT donne BQ, BR, BS).
   * Sert à savoir quels comptes un terme lisant un poste par REF a déjà
   * ventilés, donc lesquels restent orphelins.
   */
  private refsDeBaseDuBilan(ref: string): string[] {
    const total = [...TOTAUX_ACTIF_SYSCOHADA, ...TOTAUX_PASSIF_SYSCOHADA].find((t) => t.ref === ref);
    if (!total) return [ref];
    return total.deRefs.flatMap((r) => this.refsDeBaseDuBilan(r));
  }

  /**
   * Comptes de bilan MOUVEMENTÉS que le tableau ne ventile nulle part · même
   * discipline qu'au bilan et au compte de résultat. Ce sont eux qui
   * expliquent un écart de bouclage : les lister à côté de l'écart donne la
   * cause avec le montant, plutôt qu'un chiffre orphelin.
   *
   * Restreint aux classes 1 à 5. Un compte de gestion ne déplace jamais la
   * trésorerie par lui-même, c'est sa contrepartie de bilan qui le fait ; et
   * les deux listes de la table qui nomment les causes connues d'écart
   * (`COMPTES_TFT_NON_VENTILES_JUSTIFIES`, `COMPTES_EXCLUS_SANS_REPRISE`) sont
   * intégralement des comptes de bilan.
   *
   * Deux retraits, chacun pour ne pas apprendre au lecteur à ignorer le bloc :
   * les comptes SANS TRÉSORERIE par construction (dépréciations, provisions
   * réglementées, soldes intermédiaires 132 à 138), couverts autrement, et
   * les comptes non mouvementés de l'exercice. Un ajout, en revanche :
   * `COMPTES_EXCLUS_SANS_REPRISE` (4726, 4751, 4752) est bien CITÉ par un
   * terme, donc « ventilé » au sens mécanique, mais retiré de FD ou FE sans
   * être repris ailleurs · la table demande explicitement de le nommer à côté
   * de l'écart, et le 4726 EST cet écart (anomalie n° 7).
   */
  private comptesNonVentiles(lignes: LigneBalancePourEtat[]): CompteDuPoste[] {
    const ventiles = new Set<string>();
    const refsBilanLues = new Set<string>();

    for (const poste of TOUS_LES_POSTES_FLUX_SYSCOHADA) {
      for (const terme of poste.termes) {
        if (terme.comptes) {
          for (const l of lignes) {
            if (correspond(l.numero, terme.comptes.prefixes, terme.comptes.exclusions)) ventiles.add(l.compteId);
          }
        } else if (terme.poste?.etat === 'BILAN') {
          refsBilanLues.add(terme.poste.ref);
        }
      }
    }
    // Le contrôle de ZH lit BT et DT : ce qu'il couvre est ventilé lui aussi.
    for (const terme of CONTROLE_ZH_PAR_LE_BILAN) {
      if (terme.poste?.etat === 'BILAN') refsBilanLues.add(terme.poste.ref);
    }

    const refsDeBase = new Set([...refsBilanLues].flatMap((ref) => this.refsDeBaseDuBilan(ref)));
    for (const poste of [...POSTES_ACTIF_SYSCOHADA, ...POSTES_PASSIF_SYSCOHADA]) {
      if (!refsDeBase.has(poste.ref)) continue;
      for (const l of lignes) {
        if (
          correspond(l.numero, poste.comptes, poste.exclusions) ||
          (poste.comptesAmortissement &&
            correspond(l.numero, poste.comptesAmortissement, poste.exclusionsAmortissement))
        ) {
          ventiles.add(l.compteId);
        }
      }
    }
    // DR reçoit les 52/53 créditeurs, qui portent les mêmes numéros que BS :
    // déjà couverts par BS, rien à ajouter, mais la symétrie est notée pour
    // qu'un lecteur ne les croie pas oubliés.

    const mouvemente = (l: LigneBalancePourEtat) =>
      Math.abs(l.mouvementDebit) > EPSILON || Math.abs(l.mouvementCredit) > EPSILON;

    const nonVentiles = lignes
      .filter((l) => CLASSES_DE_BILAN.has(l.classe))
      .filter((l) => !ventiles.has(l.compteId))
      .filter((l) => !COMPTES_SANS_TRESORERIE_SYSCOHADA.some((c) => l.numero.startsWith(c.prefixe)))
      .filter(mouvemente);

    const dejaListes = new Set(nonVentiles.map((l) => l.compteId));
    const exclusSansReprise = lignes
      .filter((l) => !dejaListes.has(l.compteId))
      .filter((l) => COMPTES_EXCLUS_SANS_REPRISE.some((c) => l.numero.startsWith(c.prefixe)))
      .filter(mouvemente);

    return [...nonVentiles, ...exclusSansReprise]
      .map((l) => ({ numero: l.numero, intitule: l.intitule, montant: l.solde }))
      .sort((a, b) => a.numero.localeCompare(b.numero));
  }

  /**
   * Résout tout le tableau pour UN exercice, à partir de ses propres lignes et
   * de celles de l'exercice qui le précède. Isolé pour être appelé DEUX FOIS :
   * une fois pour l'exercice demandé (colonne N), une fois pour son propre
   * exercice antérieur (colonne N-1 du modèle) · chaque ligne du tableau étant
   * elle-même une comparaison entre deux exercices, la colonne N-1 exige un
   * TROISIÈME exercice en arrière-plan, exactement comme la colonne N exige
   * N-1.
   */
  private resoudreFluxPourExercice(
    lignesCourant: LigneBalancePourEtat[],
    lignesAnterieur: LigneBalancePourEtat[],
    exerciceAnterieurDisponible: boolean,
  ): {
    parRef: Map<string, { libelle: string; montant: number; comptes: CompteDuPoste[] }>;
    postesNonCalculables: PosteNonCalculable[];
    ctx: ContexteFlux;
  } {
    const soldesAnterieurs = new Map<string, number>();
    if (exerciceAnterieurDisponible) {
      for (const l of lignesAnterieur) soldesAnterieurs.set(l.numero, l.solde);
    } else {
      for (const l of lignesCourant) soldesAnterieurs.set(l.numero, l.reportDebit - l.reportCredit);
    }

    const ctx: ContexteFlux = {
      bilanCourant: this.resoudreTousLesPostesBilan(lignesCourant),
      bilanAnterieur: this.resoudreTousLesPostesBilan(lignesAnterieur),
      crCourant: this.resoudreTousLesPostesCR(lignesCourant),
      crAnterieur: this.resoudreTousLesPostesCR(lignesAnterieur),
      lignesCourant,
      soldesAnterieurs,
      exerciceAnterieurDisponible,
    };

    const parRef = new Map<string, { libelle: string; montant: number; comptes: CompteDuPoste[] }>();
    const postesNonCalculables: PosteNonCalculable[] = [];

    for (const poste of TOUS_LES_POSTES_FLUX_SYSCOHADA) {
      if (!exerciceAnterieurDisponible && this.exigeExerciceAnterieur(poste)) {
        // Poste laissé VIDE, et dit vide. Le chiffrer sur un exercice
        // antérieur inexistant reviendrait à présenter la situation de
        // clôture comme une variation de l'exercice · le modèle demande une
        // variation, la balance ne la porte pas, on ne l'invente pas. Un
        // dossier repris en cours de vie peut porter son ouverture en report
        // à-nouveau sans exercice N-1 saisi : la table a tranché que le report
        // n'est un équivalent que pour une variation de COMPTES, pas pour une
        // variation de POSTE (voir `besoinsDuPoste`).
        parRef.set(poste.ref, { libelle: poste.libelle, montant: 0, comptes: [] });
        postesNonCalculables.push({
          ref: poste.ref,
          raison:
            "Aucun exercice antérieur dans le dossier : ce poste est une variation ou une lecture de l'exercice " +
            'N-1, que la balance ne permet pas de reconstituer. Poste laissé vide, non chiffré à zéro.',
        });
        continue;
      }
      const { montant, comptes } = this.calculerPosteFlux(poste, ctx);
      parRef.set(poste.ref, { libelle: poste.libelle, montant, comptes });

      // Réserves permanentes de la table (`nonDeterminables`) : signalées
      // SEULEMENT quand les comptes visés sont effectivement mouvementés, sinon
      // le bloc se remplirait de réserves sans objet à chaque exercice et
      // cesserait d'être lu.
      for (const nd of poste.nonDeterminables ?? []) {
        const concerne = lignesCourant.some(
          (l) =>
            correspond(l.numero, nd.comptes) &&
            (Math.abs(l.mouvementDebit) > EPSILON || Math.abs(l.mouvementCredit) > EPSILON),
        );
        if (concerne) postesNonCalculables.push({ ref: poste.ref, raison: nd.motif });
      }
    }

    // Totaux : toutes des SOMMES de refs déjà résolues (« somme FA à FE »,
    // « D + E », « G + A »), dans un ordre que le spec de la table verrouille.
    for (const total of TOTAUX_FLUX_SYSCOHADA) {
      parRef.set(total.ref, {
        libelle: total.libelle,
        montant: total.deRefs.reduce((s, ref) => s + (parRef.get(ref)?.montant ?? 0), 0),
        comptes: [],
      });
    }

    return { parRef, postesNonCalculables, ctx };
  }

  async tableauFluxTresorerie(tenantId: string, exerciceId: string): Promise<TableauFluxTresorerieSyscohada> {
    const exerciceN1Id = await this.trouverExerciceN1(tenantId, exerciceId);
    const exerciceN2Id = exerciceN1Id ? await this.trouverExerciceN1(tenantId, exerciceN1Id) : null;
    const [lignesN, lignesN1, lignesN2] = await Promise.all([
      this.chargerLignes(tenantId, exerciceId),
      this.chargerLignes(tenantId, exerciceN1Id),
      this.chargerLignes(tenantId, exerciceN2Id),
    ]);

    const resN = this.resoudreFluxPourExercice(lignesN, lignesN1, exerciceN1Id !== null);
    // Colonne N-1 seulement si l'exercice existe · jamais un faux zéro pour un
    // dossier à son premier exercice (même discipline que partout ailleurs).
    const resN1 = exerciceN1Id ? this.resoudreFluxPourExercice(lignesN1, lignesN2, exerciceN2Id !== null) : null;

    const refsTotaux = new Map(TOTAUX_FLUX_SYSCOHADA.map((t) => [t.ref, t]));
    const lignes: Array<LigneFluxSyscohada | SectionFluxSyscohada> = ORDRE_AFFICHAGE_FLUX_SYSCOHADA.map((entree) => {
      if ('section' in entree) return { section: entree.section };
      const ligne = resN.parRef.get(entree.ref)!;
      const total = refsTotaux.get(entree.ref);
      return {
        ref: entree.ref,
        libelle: ligne.libelle,
        montant: ligne.montant,
        montantN1: resN1?.parRef.get(entree.ref)?.montant,
        comptes: ligne.comptes,
        estTotal: total !== undefined,
        // ZA porte la clé A sans être un total : elle est portée par le poste
        // d'ouverture lui-même dans le modèle. Elle est rendue ici pour que la
        // colonne de droite du modèle soit complète.
        repere: entree.ref === 'ZA' ? 'A' : total?.cle,
      };
    });

    // ZH calculé DEUX FOIS, comme le modèle l'exige (« ZH Trésorerie nette au
    // 31 Décembre (G + A) · Contrôle : Trésorerie actif N – Trésorerie passif
    // N »). Le montant présenté est celui du CUMUL DES FLUX, qui est ce que le
    // tableau démontre ; la lecture directe du bilan (BT − DT) est un contrôle
    // indépendant. Un écart n'est PAS corrigé : il chiffre exactement ce que la
    // ventilation FA à FQ ne couvre pas, et `comptesNonVentiles` en nomme la
    // cause avec son montant.
    const tresorerieClotureParFlux = resN.parRef.get('ZH')!.montant;
    const tresorerieClotureParBilan = CONTROLE_ZH_PAR_LE_BILAN.reduce(
      (s, terme) => s + this.evaluerTerme(terme, resN.ctx).reduce((t, c) => t + c.montant, 0),
      0,
    );
    const ecart = tresorerieClotureParFlux - tresorerieClotureParBilan;

    return {
      lignes,
      exerciceN1Disponible: exerciceN1Id !== null,
      // Calculés sur N seulement : N-1 n'est qu'un comparatif d'affichage, pas
      // un état audité par cet appel (même convention que `bilan()`).
      comptesNonVentiles: this.comptesNonVentiles(lignesN),
      postesNonCalculables: resN.postesNonCalculables,
      controle: {
        tresorerieOuverture: resN.parRef.get('ZA')!.montant,
        variation: resN.parRef.get('ZG')!.montant,
        tresorerieClotureParFlux,
        tresorerieClotureParBilan,
        ecart,
        coherent: Math.abs(ecart) < 0.01,
      },
    };
  }
}

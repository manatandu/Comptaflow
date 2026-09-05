export type Referentiel = 'SYCEBNL' | 'SYSCOHADA';
/**
 * N'a de sens que si `Referentiel` = 'SYCEBNL' · son pendant SYSCOHADA est
 * `SystemeComptableSyscohada`, plus bas dans ce fichier : l'AUDCIF admet lui
 * aussi deux présentations (art. 11 · Système normal, Système minimal de
 * trésorerie), et raisonner comme si le SYSCOHADA n'en avait qu'une avait
 * fait sauter l'étape « système » du nouveau fichier comptable. SYCEBNL en
 * prévoit 3 (Partie 4, ch. 2 à 4 du texte officiel), et les
 * trois sont désormais construits. Le Système Minimal de Trésorerie n'est
 * toutefois pas un choix libre : l'article 6 le réserve aux entités dont
 * chacune des cinq catégories de ressources annuelles reste sous 30 000 000
 * FCFA, l'article 5 posant que le Système normal est la règle.
 */
export type JeuEtatsFinanciersSycebnl =
  | 'ASSOCIATIONS_ORDRES_PROFESSIONNELS'
  | 'PROJETS_DEVELOPPEMENT'
  | 'SYSTEME_MINIMAL_TRESORERIE';
/**
 * Pendant SYSCOHADA du type ci-dessus. L'AUDCIF n'admet que DEUX
 * présentations (art. 11 : Système normal et Système minimal de trésorerie) ·
 * l'ancien Système allégé de l'art. 12 est abrogé depuis la révision de 2017.
 * Le SMT est réservé par l'art. 13 aux entités sous seuil de chiffre
 * d'affaires hors taxes annuel, seuil qui DÉPEND DE L'ACTIVITÉ : 60 millions
 * de FCFA pour le négoce, 40 pour l'artisanat et assimilés, 30 pour les
 * services.
 *
 * `null` (ou absent) = dossier SYCEBNL, pour lequel la notion est sans objet.
 */
export type SystemeComptableSyscohada = 'NORMAL' | 'MINIMAL_TRESORERIE';

/**
 * Jeu de notes annexes visé par un RATTACHEMENT de sous-compte (pendant de
 * l'enum Prisma `JeuNotesAnnexes`). À ne pas confondre avec
 * `JeuEtatsFinanciersSycebnl`, qui décrit le jeu d'états d'un dossier :
 *
 *  · aucun Système minimal de trésorerie ici · ni celui du SYCEBNL ni celui
 *    du SYSCOHADA (AUDCIF Titre X) n'a de rubrique que le plan normalisé ne
 *    détermine pas, donc rien à y rattacher ;
 *  · le SYSCOHADA en a un, et un seul : les 36 notes du Système normal
 *    (AUDCIF Titre IX ch. 6).
 *
 * Le serveur refuse un jeu étranger au référentiel du dossier.
 */
export type JeuNotesAnnexes =
  | 'ASSOCIATIONS_ORDRES_PROFESSIONNELS'
  | 'PROJETS_DEVELOPPEMENT'
  | 'SYSCOHADA_SYSTEME_NORMAL';

/**
 * Forme juridique d'un dossier SYSCOHADA · AUSCGIE art. 6 pour les cinq
 * sociétés commerciales par la forme, art. 869 pour le GIE, AUSCOOP pour la
 * coopérative, AUDCG art. 2 et 30 pour le commerçant et l'entreprenant,
 * AUSCGIE art. 116 pour la succursale, AUDCIF art. 2 pour le public.
 * Sans rapport avec FormeJuridiqueEbnl, qui vient de la loi n° 004/2001.
 */
export type FormeJuridiqueSyscohada =
  | 'SOCIETE_ANONYME'
  | 'SOCIETE_PAR_ACTIONS_SIMPLIFIEE'
  | 'SOCIETE_RESPONSABILITE_LIMITEE'
  | 'SOCIETE_NOM_COLLECTIF'
  | 'SOCIETE_COMMANDITE_SIMPLE'
  | 'GROUPEMENT_INTERET_ECONOMIQUE'
  | 'SOCIETE_COOPERATIVE'
  | 'ENTREPRISE_INDIVIDUELLE'
  | 'ENTREPRENANT'
  | 'SUCCURSALE'
  | 'ENTITE_PUBLIQUE'
  | 'AUTRE';
export type RoleUtilisateur = 'ADMIN_CABINET' | 'COMPTABLE' | 'LECTURE_SEULE';

export interface Utilisateur {
  id: string;
  email: string;
  role: RoleUtilisateur;
  estActif: boolean;
  /** Mot de passe encore provisoire · le titulaire ne l'a pas remplacé. */
  doitChangerMotDePasse: boolean;
  /** Verrou de force brute en cours, ou null · voir auth/verrouillage.ts. */
  verrouilleJusqua: string | null;
  createdAt: string;
}
export type ClasseCompte =
  | 'CLASSE_1' | 'CLASSE_2' | 'CLASSE_3' | 'CLASSE_4'
  | 'CLASSE_5' | 'CLASSE_6' | 'CLASSE_7' | 'CLASSE_8' | 'CLASSE_9';
export type StatutExercice = 'OUVERT' | 'CLOTURE';

export type TypeCompteDetailTotal = 'DETAIL' | 'TOTAL';

export type ModeReportANouveau = 'AUCUN' | 'SOLDE' | 'DETAIL';

export interface Compte {
  id: string;
  tenantId: string;
  numero: string;
  intitule: string;
  classe: ClasseCompte;
  typeCompte: TypeCompteDetailTotal;
  estActif: boolean;
  /** Report à-nouveau en fin d'exercice · Aucun (charges/produits), Solde, ou Détail (lignes non lettrées). */
  modeReportANouveau: ModeReportANouveau;
  /** Rattachement à un Bailleur (comptabilité analytique par projet/bailleur) · voir Bailleur. */
  bailleurId: string | null;
  /** Compte ouvert au lettrage · « liberté de définir la liste des comptes auxquels s'applique le lettrage » (CPCC, ch. 6). */
  lettrable: boolean;
  /** Taux de TVA proposé automatiquement en saisie quand ce compte est choisi. */
  tauxTvaDefautId: string | null;
  /**
   * Code du catalogue des retraitements fiscaux, déclaré par le cabinet · le
   * résultat fiscal le repropose chaque exercice, il ne l'inscrit jamais
   * d'office.
   */
  codeRetraitementFiscal?: string | null;
}

/**
 * Bailleur (ou sous-projet) · regroupe les sous-comptes 162-164/462-464 qui
 * lui sont propres (docs/plan-de-construction.md item 14, jeu « projets de
 * développement »).
 */
export interface Bailleur {
  id: string;
  tenantId: string;
  code: string;
  nom: string;
  estActif: boolean;
  createdAt: string;
}

/** Une ligne (par bailleur) de la NOTE 9 · Fonds du bailleur. */
export interface LigneNoteBailleur {
  bailleur: { id: string; code: string; nom: string };
  decaisse: number;
  consomme: number;
  soldeRestant: number;
}

export interface TotalNoteBailleur {
  decaisse: number;
  consomme: number;
  soldeRestant: number;
}

/** NOTE 9 : FONDS DU BAILLEUR (jeu « projets de développement », Partie 4 ch. 3). */
export interface NoteBailleur {
  investissement: LigneNoteBailleur[];
  investissementNonAffecte: TotalNoteBailleur;
  totalInvestissement: TotalNoteBailleur;
  administration: LigneNoteBailleur[];
  administrationNonAffecte: TotalNoteBailleur;
  totalAdministration: TotalNoteBailleur;
  totalFondsDuBailleur: TotalNoteBailleur;
}

export interface Exercice {
  id: string;
  tenantId: string;
  dateDebut: string;
  dateFin: string;
  statut: StatutExercice;
  /**
   * Date à laquelle les organes dirigeants ont ARRÊTÉ les comptes · quatrième
   * mention obligatoire de chaque page publiée (AUDCIF Titre IX ch. 1 § 2.4),
   * exigée dans toute publication par l'art. 23, non exclu par l'art. 3 du
   * SYCEBNL. Ce n'est pas la clôture : elle lui est postérieure de plusieurs
   * semaines, dans la limite de quatre mois. Null tant qu'aucun arrêté n'a eu
   * lieu · la déduire de la clôture ferait imprimer une date que personne n'a
   * décidée.
   */
  dateArreteComptes: string | null;
}

export type GranulariteCloture = 'PARTIELLE' | 'TOTALE' | 'PERIODE';

export interface Cloture {
  id: string;
  exerciceId: string;
  granularite: GranulariteCloture;
  journalId: string | null;
  journal?: Journal | null;
  dateLimite: string;
  annulable: boolean;
  createdAt: string;
  annuleeAt: string | null;
}

export type TypeJournal = 'ACHATS' | 'VENTES' | 'TRESORERIE' | 'GENERAL' | 'SITUATION';
export type NumerotationPiece = 'MANUELLE' | 'CONTINUE_JOURNAL' | 'CONTINUE_FICHIER' | 'MENSUELLE';

export interface Journal {
  id: string;
  code: string;
  intitule: string;
  type: TypeJournal;
  compteTresorerieId: string | null;
  compteTresorerie?: Compte | null;
  numerotation: NumerotationPiece;
  estActif: boolean;
}

export interface LigneEcriture {
  id: string;
  compteId: string;
  libelle: string | null;
  debit: string;
  credit: string;
  compte?: Compte;
}

export interface Ecriture {
  id: string;
  exerciceId: string;
  journalId: string;
  journal?: Journal;
  numeroPiece: number | null;
  date: string;
  libelle: string;
  reference: string | null;
  createdAt: string;
  createdBy: string;
  /** BROUILLARD tant que l'écriture n'est pas entrée au livre-journal. */
  statut: StatutEcriture;
  valideeAt: string | null;
  valideeBy: string | null;
  lignes: LigneEcriture[];

  /**
   * Correction d'erreur par inscription en négatif · art. 20 de l'AUDCIF,
   * repris par la Partie 2 ch. 2 du SYCEBNL. `correction` est posé sur
   * l'écriture ERRONÉE (elle a été annulée par celle-ci) ; `corrigeEcriture`
   * et `motifCorrection` sur l'écriture de CORRECTION.
   */
  /** Écriture de solde des classes 6/7 ou de report à-nouveau : non corrigeable à la main. */
  estGenereeParCloture?: boolean;
  corrigeEcritureId: string | null;
  motifCorrection: string | null;
  correction?: { id: string; numeroPiece: number | null; date: string } | null;
  corrigeEcriture?: { id: string; numeroPiece: number | null; date: string; libelle: string } | null;
}

export type StatutLettrage = 'PARTIEL' | 'SOLDE';
export type OrigineLettrage = 'MANUEL' | 'AUTOMATIQUE_PIECE' | 'AUTOMATIQUE_MONTANT';

export interface LigneLettrage {
  id: string;
  date: string;
  journalCode: string;
  libelle: string;
  reference: string | null;
  debit: number;
  credit: number;
  /** Servie uniquement quand le groupe est SOLDÉ · voir GroupeLettrage. */
  lettre: string | null;
  lettrageId: string | null;
  /** Code tel qu'il doit s'afficher : minuscule si partiel, majuscule si soldé. */
  codeLettrage: string | null;
  devise: string | null;
  montantDevise: number | null;
}

/**
 * Un groupe de lettrage vu depuis le DOSSIER, tous comptes confondus · c'est
 * ce que sert /lettrage, et ce qu'affiche la fenêtre Lettrage à l'ouverture.
 */
export interface GroupeLettrageDossier {
  id: string;
  compteId: string;
  compteNumero: string;
  compteIntitule: string;
  code: string;
  statut: StatutLettrage;
  solde: number;
  origine: OrigineLettrage;
  verrouille: boolean;
  ecartChange: number | null;
  nombreLignes: number;
  createdAt: string;
  createdBy: string;
  soldeAt: string | null;
}

export interface GroupeLettrage {
  id: string;
  code: string;
  statut: StatutLettrage;
  solde: number;
  origine: OrigineLettrage;
  verrouille: boolean;
  ecartChange: number | null;
  createdAt: string;
  createdBy: string;
  soldeAt: string | null;
}

export interface EtatLettrage {
  compte: { id: string; numero: string; intitule: string; lettrable: boolean };
  lignes: LigneLettrage[];
  lettrages: GroupeLettrage[];
}

export type StatutRapprochement = 'EN_COURS' | 'CLOTURE';

export interface RapprochementBancaire {
  id: string;
  tenantId: string;
  compteId: string;
  compte?: Compte;
  dateReleve: string;
  soldeReleve: number;
  statut: StatutRapprochement;
  createdAt: string;
  createdBy: string;
  clotureAt: string | null;
}

export interface LignePointage {
  id: string;
  date: string;
  journalCode: string;
  libelle: string;
  reference: string | null;
  debit: number;
  credit: number;
  pointee: boolean;
}

export interface DetailRapprochement {
  rapprochement: RapprochementBancaire;
  soldeDepart: number;
  soldePointe: number;
  ecart: number;
  equilibre: boolean;
  lignes: LignePointage[];
}

export interface LigneBalance {
  compteId: string;
  numero: string;
  intitule: string;
  classe: ClasseCompte;
  typeCompte: TypeCompteDetailTotal;
  /**
   * BALANCE À SIX COLONNES · trois couples débit/crédit, dans l'ordre où le
   * SYCEBNL (Partie 2, ch. 2) et le SYSCOHADA les présentent :
   *
   *   solde d'OUVERTURE (report / à-nouveaux) · MOUVEMENTS de l'exercice ·
   *   solde de CLÔTURE
   *
   * `reportDebit`/`reportCredit` viennent des écritures d'à-nouveau (celles
   * générées par la clôture précédente), `mouvementDebit`/`mouvementCredit`
   * de toutes les autres, et `totalDebit`/`totalCredit` de leur somme · d'où
   * le solde de clôture. Le serveur les calcule séparément depuis toujours
   * (EcritureService.balance) ; l'écran n'en montrait que quatre.
   */
  reportDebit: number;
  reportCredit: number;
  mouvementDebit: number;
  mouvementCredit: number;
  totalDebit: number;
  totalCredit: number;
  solde: number;
}

export interface LigneGrandLivre {
  id: string;
  date: string;
  journalCode: string;
  numeroPiece: number | null;
  libelle: string;
  reference: string | null;
  debit: number;
  credit: number;
  lettre: string | null;
  soldeProgressif: number;
  /** Comptes de sens opposé dans la même écriture · voir ExportService.grandLivreExcel. */
  contrepartie: string[];
}

/** Un poste ACTIF ou PASSIF du bilan officiel SYCEBNL (REF à deux lettres, ex. "BW", "CA"). */
/**
 * `brut`/`amortissement` : ACTIF seulement (le texte officiel exige Brut /
 * Amort. et dépréc. / Net côté actif, rien que Net côté passif).
 * `*N1` : comparatif N-1, exigé sur le bilan ET le compte de résultat ·
 * `undefined` (jamais 0) quand il n'y a pas d'exercice antérieur.
 */
export interface LigneBilan {
  ref: string;
  libelle: string;
  montant: number;
  montantN1?: number;
  brut?: number;
  brutN1?: number;
  amortissement?: number;
  amortissementN1?: number;
  /** Ligne de sous-total ou de total (ex. AZ, BT, DZ) · pas un poste de détail. */
  estTotal: boolean;
  comptes: CompteDuPoste[];
}

export interface Bilan {
  actif: LigneBilan[];
  passif: LigneBilan[];
  totalActif: number;
  totalPassif: number;
  totalActifN1?: number;
  totalPassifN1?: number;
  /** false = premier exercice du dossier, aucun N-1 à afficher. */
  exerciceN1Disponible: boolean;
  equilibre: boolean;
  /** Comptes de bilan (classes 1-5) qu'aucun poste officiel ne réclame · jamais masqués. */
  comptesNonRattaches: CompteDuPoste[];
  controle: {
    resultatClasses678: number;
    resultatCompte13: number;
    doubleComptageProbable: boolean;
  };
}

export interface CompteDuPoste {
  numero: string;
  intitule: string;
  montant: number;
}

/**
 * BILAN et COMPTE D'EXPLOITATION du jeu « projets de développement et
 * assimilés » (Partie 4, ch. 3) · structure volontairement proche de
 * `Bilan`/`CompteDeResultat` (mêmes conventions Brut/Amort/Net et
 * comparatif N-1), mais PAS interchangeable : REF, libellés et comptes
 * rattachés sont propres à ce jeu (voir `correspondance-projet-*.ts` côté
 * serveur). `controle` diffère aussi : pas de double source à arbitrer côté
 * bilan (`equilibre` seulement), et `boucleAZero` (pas `coherent`) côté
 * compte d'exploitation · ce jeu vise XC = 0, pas un résultat net.
 */
export interface BilanProjet {
  actif: LigneBilan[];
  passif: LigneBilan[];
  totalActif: number;
  totalPassif: number;
  totalActifN1?: number;
  totalPassifN1?: number;
  exerciceN1Disponible: boolean;
  equilibre: boolean;
  comptesNonRattaches: CompteDuPoste[];
}

export interface CompteExploitationProjet {
  revenus: PosteCalcule[];
  totalRevenus: number; // XA
  totalRevenusN1?: number;
  charges: PosteCalcule[]; // TJ et TK peuvent apparaître deux fois · doublon officiel, voir correspondance-projet-compte-exploitation.ts
  totalCharges: number; // XB
  totalChargesN1?: number;
  solde: number; // XC · attendu à 0 en régime normal, PAS un résultat net
  soldeN1?: number;
  exerciceN1Disponible: boolean;
  comptesNonRattaches: CompteDuPoste[];
  controle: {
    boucleAZero: boolean;
  };
}

/** Poste du compte de résultat SYCEBNL (code REF officiel : RA, TA, TM…). */
export interface PosteCalcule {
  ref: string;
  libelle: string;
  montant: number;
  /** Comparatif N-1 · undefined quand il n'y a pas d'exercice antérieur. */
  montantN1?: number;
  comptes: CompteDuPoste[];
}

// --------------------------------------------------------------------------
// Tableau de flux de trésorerie (associations et ordres professionnels
// seulement · Partie 4, ch. 1 § 4). Méthode directe, double bouclage.
// --------------------------------------------------------------------------

export interface LigneFluxTresorerie {
  ref: string;
  libelle: string;
  montant: number;
  /** Comparatif N-1 · undefined quand il n'y a pas d'exercice antérieur. */
  montantN1?: number;
  comptes: CompteDuPoste[];
  estTotal?: boolean;
  /** Repère A à H du modèle officiel · seulement sur les sous-totaux (ZB à ZG). */
  repere?: string;
}

export interface SectionFlux {
  section: string;
}

export interface ControleFluxTresorerie {
  tresorerieOuverture: number;
  variation: number;
  tresorerieClotureParFlux: number;
  tresorerieClotureParBilan: number;
  ecart: number;
  coherent: boolean;
}

export interface TableauFluxTresorerie {
  lignes: Array<LigneFluxTresorerie | SectionFlux>;
  exerciceN1Disponible: boolean;
  comptesNonVentiles: CompteDuPoste[];
  controle: ControleFluxTresorerie;
}

export interface CompteDeResultat {
  produits: PosteCalcule[];
  totalProduits: number; // XA
  totalProduitsN1?: number;
  charges: PosteCalcule[];
  totalCharges: number; // XB
  totalChargesN1?: number;
  resultatActivitesOrdinaires: number; // XC
  resultatActivitesOrdinairesN1?: number;
  produitsHao: PosteCalcule; // TM
  chargesHao: PosteCalcule; // TN
  resultatHao: number; // XD
  resultatHaoN1?: number;
  resultatNet: number; // XE
  resultatNetN1?: number;
  /** false = premier exercice du dossier, aucun N-1 à afficher. */
  exerciceN1Disponible: boolean;
  /** Comptes de gestion qu'aucun poste officiel ne réclame · jamais masqués. */
  comptesNonRattaches: CompteDuPoste[];
  controle: {
    resultatToutesClassesDeGestion: number;
    ecart: number;
    coherent: boolean;
  };
}

export interface AuthResponse {
  tenant?: {
    id: string;
    nom: string;
    referentiel: Referentiel;
    jeuEtatsFinanciersSycebnl?: JeuEtatsFinanciersSycebnl;
  };
  exercice?: Exercice;
  /**
   * Le jeton de session, lui, arrive en COOKIE httpOnly (jamais lisible par
   * ce code · c'est le but). Le corps ne porte que le jeton CSRF apparié, à
   * rejouer en en-tête X-CSRF-Token sur chaque requête (voir lib/api.ts).
   */
  csrfToken: string;
}

// Types de tiers HÉRITÉS DU SYCEBNL, dont le compte 41 « Adhérents,
// clients-usagers et comptes rattachés » couvre deux populations que le texte
// officiel subdivise (411 Adhérents, 412 Clients-usagers).
//
// En SYSCOHADA la division 41 est « Clients et comptes rattachés » : le 411
// y est « Clients » et le 412 « Clients, effets à recevoir en portefeuille ».
// ADHERENT n'y existe donc pas · le serveur refuse d'en créer un
// (TiersService) et TiersPage ne propose pas le type. Les numéros coïncident,
// les notions non. Voir prisma/schema.prisma.
export type TypeTiers = 'ADHERENT' | 'CLIENT' | 'FOURNISSEUR' | 'SALARIE' | 'AUTRE';
export type ConditionEcheance = 'NET' | 'FIN_DE_MOIS';
export type TypeEcheance = 'POURCENTAGE' | 'MONTANT' | 'EQUILIBRE';

export interface EcheanceReglement {
  id: string;
  ordre: number;
  type: TypeEcheance;
  valeur: string | null;
  delaiJours: number;
  echeance: ConditionEcheance;
}

export interface EcheanceCalculee {
  ordre: number;
  type: TypeEcheance | null;
  montant: number;
  dateEcheance: string;
}

export interface ModeleReglement {
  id: string;
  intitule: string;
  delaiJours: number;
  echeance: ConditionEcheance;
  estActif: boolean;
  echeances: EcheanceReglement[];
}

export interface TiersCompte {
  id: string;
  tiersId: string;
  compteId: string;
  estPrincipal: boolean;
  compte: Compte;
}

export interface TauxTva {
  id: string;
  code: string;
  intitule: string;
  taux: string;
  compteCollecteId: string | null;
  compteCollecte?: Compte | null;
  compteDeductibleId: string | null;
  compteDeductible?: Compte | null;
  estActif: boolean;
}

export interface LigneDeclarationTva {
  /** Part facturée sur la période et non encore encaissée (régime de l'encaissement). */
  enAttente: number;
  tauxId: string;
  code: string;
  intitule: string;
  taux: number;
  totalCollecte: number;
  totalDeductible: number;
  net: number;
}

export interface ProrataTva {
  numerateur: number;
  denominateur: number;
  pourcentage: number;
  /** Toute la classe 7 de la période, avant les exclusions de l'art. 43. */
  recettesClasse7: number;
  /** Ce que l'art. 43 retire du dénominateur · rendu pour être vérifiable. */
  recettesExclues: number;
  /**
   * Recettes de classe 7 dont l'écriture ne porte AUCUNE ligne de TVA. Elles
   * pèsent au dénominateur sans entrer au numérateur. Une exportation, taxée
   * au taux zéro, en fait partie tant que sa ligne de TVA à 0 % n'est pas
   * posée · c'est le seul moyen de la distinguer d'une recette exonérée.
   */
  recettesNonQualifiees: number;
  /** Les racines de comptes effectivement exclues, par référentiel. */
  racinesExclues: string[];
  /** Phrase qui rend le dénominateur vérifiable poste par poste. */
  mentionDenominateur: string;
}

export type RegimeExigibiliteTva = 'LIVRAISONS' | 'ENCAISSEMENTS' | 'DEBITS';

export interface DeclarationTva {
  dateDebut: string;
  dateFin: string;
  regimeExigibilite: RegimeExigibiliteTva;
  mentionExigibilite: string;
  /** TVA facturée sur la période mais pas encore encaissée, donc pas due. */
  tvaEnAttenteEncaissement: number;
  lignes: LigneDeclarationTva[];
  prorata: ProrataTva;
  totalCollecte: number;
  totalDeductible: number;
  totalDeductibleAdmise: number;
  /**
   * Net de la SEULE période, avant report du crédit antérieur. C'est le
   * chiffre qu'un contrôleur rapproche des comptes de la période ; `net` en
   * diffère dès qu'un crédit s'impute.
   */
  /** Avoirs sur ventes constatés sur la période · reportés (décret art. 126). */
  avoirsCollecteConstates: number;
  /** Avoirs antérieurs inscrits en déduction sur cette période (art. 52). */
  recuperationArt52: number;
  /** Avoirs antérieurs qu'aucune liquidation ne permet de situer. */
  avoirsCollecteNonImputes: number;
  /** TVA d'amont écartée par l'article 41 · jamais déductible. */
  tvaExclueArt41: number;
  /** TVA d'amont sur des postes que l'article 41 vise SOUS CONDITION. */
  tvaAVerifierArt41: number;
  /** TVA d'amont dont l'écriture ne porte aucune charge lisible. */
  tvaNatureDepenseIllisible: number;
  /** TVA d'amont dont le délai de déduction est expiré (art. 37 al. 2). */
  tvaDeductibleDechue: number;
  netAvantImputation: number;
  /**
   * Crédit de TVA venu de la dernière liquidation · art. 63 O.-L. 10/001 :
   * « l'excédent constitue un crédit d'impôt imputable sur la taxe exigible
   * du ou des mois suivants jusqu'à l'épuisement ». Il ne se rembourse pas
   * et ne se cède pas.
   */
  creditAnterieur: number;
  /** La liquidation d'où vient ce crédit, `null` quand il n'y en a pas. */
  creditAnterieurOrigine: { id: string; dateDebut: string; dateFin: string; ecritureId: string } | null;
  /** Part de ce crédit qui éteint la taxe de la période, jamais au-delà. */
  creditImpute: number;
  net: number;
  sens: 'A_PAYER' | 'CREDIT';
  /**
   * État de liquidation de la période · rendu AVEC la déclaration pour que
   * l'écran sache avant de proposer le bouton. Un verrou qui ne se manifeste
   * qu'au clic fait travailler l'utilisateur pour rien, puis le contredit.
   */
  liquidation: EtatLiquidationTva;
}

export type EtatLiquidationTva =
  | { faite: false }
  | {
      faite: true;
      id: string;
      dateDebut: string;
      dateFin: string;
      ecritureId: string;
      libelleEcriture: string;
      /** Faux quand la liquidation RECOUVRE la période sans lui correspondre. */
      memePeriode: boolean;
    };

/** Prorata définitif d'une année civile et régularisation qui en découle (art. 45). */
export interface ProrataDefinitifTva {
  annee: number;
  definitif: ProrataTva;
  pourcentageApplique: number;
  /** Assiette régularisable · la seule sur laquelle on a effectivement déduit. */
  tvaDeductibleBrute: number;
  /** Toute la TVA d'amont de l'année, liquidée ou non, en solde. */
  tvaDeductibleBruteAnnee: number;
  /**
   * Part de l'année qu'aucune liquidation ne couvre. Aucune déduction n'y a
   * été opérée, donc rien n'y est régularisé · l'écran doit le dire au lieu
   * de laisser croire à une régularisation nulle.
   */
  tvaDeductibleNonLiquidee: number;
  /** Le prorata RÉELLEMENT appliqué, liquidation par liquidation. */
  periodes: {
    dateDebut: string;
    dateFin: string;
    pourcentageApplique: number;
    tvaDeductibleBrute: number;
    deduite: number;
  }[];
  admiseDefinitive: number;
  admiseAppliquee: number;
  regularisation: number;
  sens: 'AUCUNE' | 'DEDUCTION_COMPLEMENTAIRE' | 'REVERSEMENT';
  echeance: string;
}

export interface Tiers {
  id: string;
  type: TypeTiers;
  code: string;
  nom: string;
  estActif: boolean;
  modeleReglementId: string | null;
  modeleReglement?: ModeleReglement | null;
  comptesRattaches: TiersCompte[];
  /**
   * Coordonnées · sans elles, les lettres de relance que le logiciel compose
   * déjà ne partaient nulle part. Le Numéro Impôt est en outre exigé par la
   * liste annuelle des fournisseurs (loi de procédures fiscales, art. 47 ter).
   */
  adresse: string | null;
  boitePostale: string | null;
  ville: string | null;
  pays: string | null;
  telephone: string | null;
  email: string | null;
  numeroImpot: string | null;
  contact: string | null;
  /**
   * CE TIERS EST UNE AUTRE CELLULE DU MÊME GROUPE D'ÉTABLISSEMENTS · un groupe
   * est UNE SEULE personne morale tenue en plusieurs dossiers, et une vente du
   * siège à une antenne est un mouvement interne. AUDCIF art. 107 : les comptes
   * combinés supposent l'« élimination des comptes réciproques : actifs et
   * passifs, charges et produits ». null pour l'immense majorité des tiers.
   */
  celluleGroupeId: string | null;
  /**
   * CE FOURNISSEUR ACQUITTE LA TVA D'APRÈS LES DÉBITS · mention que le décret
   * n° 011/42, art. 60, impose « sur toutes les factures du prestataire ou
   * entrepreneur autorisé ». Elle se lit sur la facture et nulle part ailleurs.
   * Faux par défaut : l'autorisation de l'art. 26 de l'O.-L. n° 10/001 est
   * l'exception.
   */
  autoriseTvaDebits: boolean;
  referenceAutorisationDebits: string | null;
}

/**
 * Un dossier du même groupe d'établissements, servi par
 * `GET /tiers/dossiers-du-groupe` · identité seule, aucune donnée comptable.
 * C'est la liste exacte que le serveur accepte sur `celluleGroupeId`.
 */
export interface DossierDuGroupe {
  id: string;
  nom: string;
  estDossierMere: boolean;
}

export type ModeAmortissement = 'LINEAIRE';
export type StatutImmobilisation = 'EN_SERVICE' | 'CEDEE' | 'MISE_HORS_SERVICE';

export interface FamilleImmobilisation {
  id: string;
  code: string;
  intitule: string;
  compteImmobilisationId: string;
  compteImmobilisation?: Compte;
  compteAmortissementId: string;
  compteAmortissement?: Compte;
  compteDotationId: string;
  compteDotation?: Compte;
  dureeAmortissementAns: number;
  modeAmortissement: ModeAmortissement;
  estActif: boolean;
}

export interface DotationAmortissement {
  id: string;
  exerciceId: string;
  montant: number;
  createdAt: string;
}

export interface Immobilisation {
  id: string;
  familleId: string;
  famille?: FamilleImmobilisation;
  designation: string;
  numeroInventaire: string | null;
  compteImmobilisationId: string;
  compteImmobilisation?: Compte;
  compteAmortissementId: string;
  compteAmortissement?: Compte;
  dateAcquisition: string;
  dateMiseEnService: string;
  valeurOrigine: number;
  valeurResiduelle: number;
  dureeAmortissementAns: number;
  modeAmortissement: ModeAmortissement;
  statut: StatutImmobilisation;
  dateSortie: string | null;
  prixCession: number | null;
  dotations: DotationAmortissement[];
  /**
   * Dépréciations · AUDCIF art. 46 et Titre VIII ch. 12 ; SYCEBNL, fiche du
   * COMPTE 29. Elles viennent EN DIMINUTION DE LA VALEUR BRUTE : la valeur
   * nette affichée doit les retrancher, sans quoi la fiche du bien et la
   * balance se contrediraient sans qu'on sache laquelle a tort.
   */
  depreciations: DepreciationImmobilisation[];
  /**
   * APPROCHE PAR COMPOSANTS · AUDCIF Titre VIII ch. 4 ; SYCEBNL, Partie 2
   * ch. 3, classe 2. Null pour une STRUCTURE, c'est-à-dire « les parties de
   * l'immobilisation qui n'ont pas été comptabilisées distinctement ».
   */
  immobilisationPrincipaleId: string | null;
  typeComposant: TypeComposant | null;
  justificationDecomposition: string | null;
  /** Le composant que celui-ci remplace · chaîne des renouvellements (§ 4.1). */
  composantRemplaceId: string | null;
}

export type TypeComposant =
  | 'COMPOSANT'
  | 'DEMANTELEMENT'
  | 'REVISION_MAJEURE'
  | 'PIECE_DE_RECHANGE'
  | 'PIECE_DE_SECURITE';

export interface DepreciationImmobilisation {
  id: string;
  sens: 'DOTATION' | 'REPRISE';
  montant: number;
  exerciceId: string;
  /** L'indice de perte de valeur retenu · sans indice, aucun test n'est requis. */
  indice: string;
}

// --------------------------------------------------------------------------
// Notes annexes · voir src/modules/notes-annexes/note-annexe.types.ts pour
// le contrat complet côté serveur ; miroir strict, pas de type simplifié.
// --------------------------------------------------------------------------

export type TypeColonneNote =
  | 'EXERCICE_N'
  | 'EXERCICE_N1'
  | 'VARIATION_VALEUR'
  | 'VARIATION_POURCENT'
  | 'VARIATION_VALEUR_ABSOLUE'
  | 'OUVERTURE'
  | 'AUGMENTATIONS'
  | 'DIMINUTIONS'
  | 'CLOTURE'
  | 'AUGMENTATION_EXPLOITATION'
  | 'AUGMENTATION_FINANCIERE'
  | 'AUGMENTATION_HAO'
  | 'DIMINUTION_EXPLOITATION'
  | 'DIMINUTION_FINANCIERE'
  | 'DIMINUTION_HAO'
  | 'ECHEANCE_1AN'
  | 'ECHEANCE_2ANS'
  | 'ECHEANCE_PLUS_2ANS'
  | 'LIBRE';

export interface ColonneNote {
  type: TypeColonneNote;
  libelle: string;
}

export interface CompteDeRubrique {
  numero: string;
  intitule: string;
  montant: number;
}

export interface LigneNoteCalculee {
  cle?: string;
  libelle: string;
  montantN: number;
  montantN1?: number;
  variationValeur?: number;
  variationPourcent?: number;
  estTotal: boolean;
  enAttenteDeRattachement?: string;
  rattachementDuDossier?: boolean;
  valeurs?: Partial<Record<TypeColonneNote, number>>;
  ecartCloture?: number;
  echeanceNonVentilee?: number;
  natureNonVentilee?: { augmentation: number; diminution: number };
  comptes: CompteDeRubrique[];
  renvoi?: string;
  /**
   * Rubrique renseignée HORS comptabilité · une case par colonne, dans
   * l'ordre de `NoteCalculee.colonnes`. `null` = jamais renseignée, ce qui
   * n'est pas un zéro. Absent sur une rubrique chiffrée par la balance.
   */
  saisie?: (string | number | null)[];
  /** Cellules calculées par le logiciel · présentées, jamais modifiables. */
  saisieVerrouillee?: boolean;
}

export interface RubriqueEnAttente {
  cle: string;
  libelle: string;
  /** Le texte de `subdivisionAttendue` : ce que le dossier doit avoir créé. */
  attendu: string;
}

export interface NoteCalculee {
  code: string;
  sousTableau?: string;
  titre: string;
  colonnes: ColonneNote[];
  lignes: LigneNoteCalculee[];
  commentaire?: string;
  renvoiOfficiel?: string;
  renvoyeeDepuis?: string[];
  horsBalance: boolean;
  exerciceN1Disponible: boolean;
  applicable: boolean;
  rubriquesEnAttente: RubriqueEnAttente[];
}

export interface LigneFicheRecapitulative {
  code: string;
  titre: string;
  applicable: boolean;
  rubriquesEnAttente: RubriqueEnAttente[];
}

export interface ResultatNotesJeu {
  notes: NoteCalculee[];
  exerciceN1Disponible: boolean;
  ficheRecapitulative: LigneFicheRecapitulative[];
  couverture: { transcrites: number; attendues: number };
}

// ---------------------------------------------------------------------------
// Registre des donateurs · articles 17, 18 et 24 de l'Acte uniforme SYCEBNL
// ---------------------------------------------------------------------------

export type TypeDonateur = 'PERSONNE_PHYSIQUE' | 'PERSONNE_MORALE';
export type ModeLiberation = 'ESPECES' | 'CHEQUE' | 'VIREMENT' | 'NATURE';
export type NatureLiberalite = 'DON' | 'DONATION' | 'LEGS';

export interface Donation {
  id: string;
  /** Numéro d'ordre continu (art. 17) · attribué par le serveur, jamais saisi. */
  numero: number;
  dateOperation: string;
  nature: NatureLiberalite;
  typeDonateur: TypeDonateur;
  nom: string | null;
  prenoms: string | null;
  domicile: string | null;
  denomination: string | null;
  numeroImmatriculation: string | null;
  numeroIdentificationFiscale: string | null;
  adresseSiegeSocial: string | null;
  adresseElectronique: string | null;
  montant: number;
  modeLiberation: ModeLiberation;
  designationNature: string | null;
  signeePar: string | null;
  signeeLe: string | null;
  ecritureId: string | null;
  ecriture: { id: string; date: string; libelle: string; numeroPiece: number | null } | null;
  annulee: boolean;
  motifAnnulation: string | null;
  annuleeLe: string | null;
}

export interface ManquementArticle17 {
  champ: string;
  exigence: string;
}

export interface CompteRegistre {
  numero: string;
  intitule: string;
  lecture: 'NET_CREDIT' | 'CREDIT_SEUL';
  fondement: string;
  montant: number;
  comptes: { numero: string; intitule: string; montant: number }[];
}

/** Constatations de l'article 18 · jamais un avis, voir DonationService. */
export interface RapportConformiteRegistre {
  exercice: { id: string; dateDebut: string; dateFin: string };
  existence: {
    registreOuvert: boolean;
    lignesTotalRegistre: number;
    lignesSurExercice: number;
    lignesAnnuleesSurExercice: number;
  };
  numerotation: {
    exigence: string;
    premier: number | null;
    dernier: number | null;
    trous: number[];
    doublons: number[];
    continue: boolean;
  };
  signature: {
    exigence: string;
    lignesNonSignees: { id: string; numero: number; dateOperation: string; montant: number }[];
  };
  completude: {
    lignesIncompletes: { id: string; numero: number; dateOperation: string; manquements: ManquementArticle17[] }[];
  };
  rapprochement: {
    totalRegistre: number;
    totalComptable: number;
    ecart: number;
    rapproche: boolean;
    lecture: string;
    comptesLiberalite: CompteRegistre[];
    comptesFrontiere: CompteRegistre[];
    comptesHorsPerimetre: CompteRegistre[];
    avertissement: string;
  };
}

// ---------------------------------------------------------------------------
// Documents obligatoires de clôture · livre d'inventaire (art. 14) et rapport
// d'activité (art. 16-3), tous deux pénalement sanctionnés (art. 24).
// ---------------------------------------------------------------------------

export interface DocumentManquantInventaire {
  cle: string;
  libelle: string;
  motif: string;
}

export interface TranscriptionInventaire {
  id: string;
  version: number;
  jeu: JeuEtatsFinanciersSycebnl;
  /** États FIGÉS à la date de transcription · jamais recalculés (art. 14). */
  etats: Record<string, unknown>;
  documentsManquants: DocumentManquantInventaire[];
  resumeOperationInventaire: string | null;
  transcritLe: string;
  transcritPar: string;
}

export interface ConformiteInventaire {
  exercice: { id: string; dateDebut: string; dateFin: string };
  jeu: JeuEtatsFinanciersSycebnl;
  exigence: string;
  transcrit: boolean;
  version: number | null;
  transcritLe: string | null;
  etatsExiges: { cle: string; libelle: string; transcrit: boolean; motifIndisponibilite: string | null }[];
  documentsManquants: DocumentManquantInventaire[];
  resume: { exigence: string; renseigne: boolean; remarque: string };
  complete: boolean;
}

export interface TresorerieDuRapport {
  ouverture: number;
  variation: number;
  cloture: number;
  boucle: boolean;
}

export interface RapportActivite {
  id: string;
  version: number;
  etabliLe: string;
  etabliPar: string;
  situationExerciceEcoule: string | null;
  perspectivesDeveloppement: string | null;
  evolutionTresorerie: string | null;
  evenementsPosterieurs: string | null;
  entiteAvecAuditeur: boolean;
  declarationDirigeants: string | null;
  tresorerie: TresorerieDuRapport | null;
}

/**
 * MANUEL DES PROCÉDURES ET DE L'ORGANISATION COMPTABLES · AUDCIF art. 16 al. 1.
 *
 * Une section porte un titre et un texte LIBRES · le CPCC rappelle que « la
 * législation OHADA ne définit ni la forme ni le contenu du manuel » (§ 0.1.4).
 * La `cle` est l'ancre stable : c'est elle, et non le titre, qui permet de
 * retrouver la section du classement à laquelle l'art. 17, 3° renvoie.
 */
export interface SectionManuel {
  cle: string;
  titre: string;
  texte: string;
}

export interface ManuelProcedures {
  id: string;
  /** Une par mise à jour · les précédentes ne sont jamais effacées. */
  version: number;
  dateApplication: string;
  sections: SectionManuel[];
  createdAt: string;
  createdBy: string;
}

export interface ConformiteManuel {
  /** Le chemin par lequel l'obligation atteint CE référentiel · voir sourceManuel. */
  source: string;
  existe: boolean;
  versionEnVigueur: number | null;
  dateApplication: string | null;
  nombreVersions: number;
  sectionsVides: string[];
  /** Art. 17, 3° · les pièces sont classées « dans un ordre défini dans le manuel ». */
  classementRenseigne: boolean;
}

export interface ConformiteRapportActivite {
  exercice: { id: string; dateDebut: string; dateFin: string };
  exigence: string;
  etabli: boolean;
  version: number | null;
  etabliLe: string | null;
  sections: { cle: string; titre: string; exigence: string; renseignee: boolean }[];
  /** Définie par la clôture et la date d'établissement · voir art. 16-3. */
  fenetreEvenementsPosterieurs: { du: string; au: string } | null;
  tresorerie: TresorerieDuRapport | null;
  declarationRegistreDonateurs: {
    exigence: string;
    remarque: string;
    entiteAvecAuditeur: boolean;
    attendue: boolean;
    renseignee: boolean;
    registreConforme: boolean;
  };
  complet: boolean;
}

// ---------------------------------------------------------------------------
// Écritures-types des opérations spécifiques aux EBNL (Partie 3 · Guide)
// ---------------------------------------------------------------------------

export interface ParametreModele {
  nom: string;
  libelle: string;
  type: 'MONTANT' | 'TAUX' | 'DUREE_ANNEES' | 'MOIS';
  defaut?: number;
  aide?: string;
}

export interface LigneModele {
  compte: string;
  exclusions?: string[];
  libelle: string;
  sens: 'DEBIT' | 'CREDIT';
  auChoix?: boolean;
  note?: string;
}

export interface ModeleEcriture {
  code: string;
  libelle: string;
  objet: string;
  source: string;
  applicationGuide?: string;
  parametres: ParametreModele[];
  lignes: LigneModele[];
  anomalie?: string;
  /** Écriture d'inventaire à extourner à l'ouverture de l'exercice suivant. */
  aExtourner?: boolean;
  /**
   * Modèle qui débite le 411 Adhérents dès l'appel · réservé au dossier qui
   * justifie d'un droit d'agir en recouvrement (§ 5.4.2.1). Le serveur le
   * refuse à un dossier qui constate à l'encaissement.
   */
  exigeDroitDAgir?: boolean;
}

export interface OperationSpecifique {
  code: string;
  libelle: string;
  source: string;
  portee: 'ASSOCIATIONS' | 'PROJETS' | 'TOUS';
  modeles: ModeleEcriture[];
  /** Choix que le TEXTE laisse ouvert · exposé, jamais tranché par le logiciel. */
  politiqueADecider?: string;
}

export interface CatalogueOperations {
  jeu: 'ASSOCIATIONS' | 'PROJETS';
  /**
   * Fait générateur retenu par le dossier pour les cotisations et le droit
   * d'entrée (cadre conceptuel § 5.4.2.1), ou `null` s'il n'a pas été
   * tranché. Les modèles d'APPEL en dépendent · voir `exigeDroitDAgir`.
   */
  methodeCotisations: 'APPEL' | 'ENCAISSEMENT' | null;
  operations: OperationSpecifique[];
  operationsAutreJeu: OperationSpecifique[];
}

export interface LigneProposee {
  compteId: string | null;
  numero: string;
  intitule: string;
  libelle: string;
  debit: number;
  credit: number;
  note?: string;
  choixRequis?: { racine: string; candidats: { id: string; numero: string; intitule: string }[] };
}

export interface EcritureProposee {
  modele: string;
  libelle: string;
  objet: string;
  source: string;
  applicationGuide?: string;
  anomalie?: string;
  aExtourner?: boolean;
  lignes: LigneProposee[];
  totalDebit: number;
  totalCredit: number;
  equilibree: boolean;
  comptesIntrouvables: { compte: string; libelle: string }[];
}

/** Structure > Paramètres du dossier (GET /dossier/parametres). */
export interface ParametresDossier {
  id: string;
  nom: string;
  referentiel: Referentiel;
  /**
   * Jeu d'états financiers · `null` hors SYCEBNL. La colonne porte une valeur
   * par défaut en base (ASSOCIATIONS_ORDRES_PROFESSIONNELS) que l'API ne sert
   * plus à un dossier SYSCOHADA : voir `src/common/reponse-referentiel.ts`.
   */
  jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl | null;
  /** Pendant SYSCOHADA · null pour un dossier SYCEBNL. */
  systemeComptableSyscohada: SystemeComptableSyscohada | null;
  activite: string | null;
  adresse: string | null;
  ville: string | null;
  pays: string | null;
  telephone: string | null;
  devise: string | null;
  /** Identifiants légaux congolais · CPCC, § 7.4 règle 7-a. */
  numeroImpot: string | null;
  idNat: string | null;
  /**
   * Le RCCM ne concerne qu'un dossier SYSCOHADA · l'AUDCG (art. 2) n'assujettit
   * au registre que les commerçants et les sociétés. Une entité SYCEBNL
   * (association, ONG, EUP, projet) n'en a pas · voir
   * docs/identifiants-legaux-ebnl-rdc.md.
   */
  rccm: string | null;
  /** Arrêté (ou décret pour une ONG étrangère) accordant la personnalité juridique · loi n° 004/2001. */
  actePersonnaliteJuridique: string | null;
  dateActePersonnalite: string | null;
  /** Enregistrement auprès du ministère sectoriel de tutelle (ONG). */
  numeroEnregistrementSecteur: string | null;
  /** Certificat d'enregistrement du Ministère du Plan · note circulaire n° 003/2013. */
  certificatEnregistrementPlan: string | null;
  /** Attestation d'exemption d'impôt sur les sociétés · arrêté n° 007/2025. */
  attestationExemptionIs: string | null;
  dateAttestationExemptionIs: string | null;
  /**
   * NON nullable, à la différence de `methodeCotisations` et `formeJuridique`
   * juste au-dessus · l'obligation de se donner des procédures comptables
   * atteint LES DEUX référentiels, par deux chemins (AUDCIF art. 69 · SYCEBNL
   * art. 16, 2), l'art. 69 lui étant exclu par l'art. 3). Servir `null` à un
   * dossier SYSCOHADA ferait disparaître de son écran une option qui le
   * concerne.
   */
  doubleRegardValidation: boolean;
  /** Forme juridique de la loi n° 004/2001 · `null` hors SYCEBNL. */
  formeJuridique: FormeJuridiqueEbnl | null;
  formeJuridiqueSyscohada: FormeJuridiqueSyscohada | null;
  /** Entité de droit étranger (loi n° 004/2001, art. 29 à 34) · `null` hors SYCEBNL. */
  droitEtranger: boolean | null;
  longueurCompte: number;
  /**
   * Assujettissement à la TVA · une ASBL ne l'est PAS de plein droit
   * (ordonnance-loi n° 10/001, art. 14 : seuil de 80 000 000 FC de chiffre
   * d'affaires annuel hors taxes ; exonérations des art. 15, 2° et 17, 8°).
   */
  assujettiTva: boolean;
  dateOptionTva: string | null;
  /**
   * Régime d'exigibilité de la TVA · O.-L. n° 10/001, art. 25 et 26. Il
   * décide de la PÉRIODE dans laquelle une TVA facturée se déclare, ce qui
   * n'est pas la même question que celle de son montant.
   */
  regimeExigibiliteTva: RegimeExigibiliteTva;
  dateAutorisationDebitsTva: string | null;
  /**
   * Effectif permanent · troisième critère de désignation d'un auditeur
   * (SYCEBNL, art. 19) et tranche de cotisation INPP.
   */
  effectifPermanent: number;
  /**
   * Fait générateur des cotisations et du droit d'entrée · cadre conceptuel
   * SYCEBNL § 5.4.2.1. `null` = pas encore tranché pour une association, sans
   * objet pour un projet de développement ou un dossier SYSCOHADA.
   */
  methodeCotisations: 'APPEL' | 'ENCAISSEMENT' | null;
  /** Au-delà de zéro, le jeu d'états financiers est verrouillé. */
  nombreEcritures: number;
  /**
   * MONNAIE FONCTIONNELLE · celle dans laquelle l'entité vit réellement
   * (USD, EUR...). Elle ne déplace PAS la tenue, qui reste en francs
   * congolais · loi n° 23/053 art. 141, 1° et AUDCIF art. 17, 1°. Elle nomme
   * le second jeu de documents, sans valeur légale. `null` = pas de second jeu.
   */
  deviseFonctionnelle: string | null;
}

// ---------------------------------------------------------------------------
// Comptabilité analytique et budgétaire · voir docs/analytique-et-budget.md
// ---------------------------------------------------------------------------

export interface PlanAnalytique {
  id: string;
  code: string;
  intitule: string;
  /** Chiffres de classe SYCEBNL ventilés, ex. "2,6,7,9". */
  classesVentilees: string;
  ventilationObligatoire: boolean;
  gererBudgets: boolean;
  ordre: number;
  estActif: boolean;
  _count?: { sections: number };
}

export interface SectionAnalytique {
  id: string;
  planId: string;
  code: string;
  intitule: string;
  type: TypeCompteDetailTotal;
  bailleurId: string | null;
  bailleur: { id: string; code: string; nom: string } | null;
  dateDebut: string | null;
  dateFin: string | null;
  estActive: boolean;
}

export interface BudgetSection {
  annuel: number;
  mensuel: { mois: number; montant: number }[];
}

export interface LigneBalanceAnalytique {
  sectionId: string;
  code: string;
  intitule: string;
  type: TypeCompteDetailTotal;
  debit: number;
  credit: number;
  solde: number;
}

export interface BalanceAnalytique {
  lignes: LigneBalanceAnalytique[];
  totaux: { debit: number; credit: number; solde: number };
}

export interface LigneGrandLivreAnalytique {
  date: string;
  journal: string;
  numeroPiece: number | null;
  compteNumero: string;
  compteIntitule: string;
  libelle: string;
  debit: number;
  credit: number;
  soldeProgressif: number;
}

export interface GrandLivreAnalytique {
  section: {
    id: string;
    code: string;
    intitule: string;
    plan: { code: string; intitule: string };
    dateDebut: string | null;
    dateFin: string | null;
  };
  lignes: LigneGrandLivreAnalytique[];
  totaux: { debit: number; credit: number; solde: number };
}

export interface ControleCumuls {
  planId: string;
  planCode: string;
  planIntitule: string;
  mouvementsGenerauxDebit: number;
  mouvementsGenerauxCredit: number;
  mouvementsAnalytiquesDebit: number;
  mouvementsAnalytiquesCredit: number;
  ecartDebit: number;
  ecartCredit: number;
  lignesSansRepartition: {
    ecritureId: string;
    date: string;
    journal: string;
    compteNumero: string;
    compteIntitule: string;
    libelle: string;
    debit: number;
    credit: number;
  }[];
}

export interface LigneEtatBudgetaire {
  sectionId: string | null;
  code: string;
  intitule: string;
  budget: number;
  realise: number;
  ecart: number;
  tauxConsommation: number | null;
  horsBudget: boolean;
}

export interface EtatBudgetaire {
  lignes: LigneEtatBudgetaire[];
  totaux: LigneEtatBudgetaire;
}

// ---------------------------------------------------------------------------
// Brouillard et validation · voir StatutEcriture dans prisma/schema.prisma
// ---------------------------------------------------------------------------

export type StatutEcriture = 'BROUILLARD' | 'VALIDEE';

export interface LigneBrouillard {
  id: string;
  date: string;
  createdAt: string;
  journal: string;
  journalIntitule: string;
  numeroPiece: number | null;
  libelle: string;
  reference: string | null;
  debit: number;
  credit: number;
  equilibree: boolean;
  ancienneteJours: number;
  /** Au-delà du délai de centralisation hebdomadaire du SYCEBNL. */
  retardCentralisation: boolean;
  lignes: {
    compteNumero: string;
    compteIntitule: string;
    libelle: string | null;
    debit: number;
    credit: number;
  }[];
}

export interface EtatBrouillard {
  lignes: LigneBrouillard[];
  totaux: {
    nombre: number;
    debit: number;
    credit: number;
    desequilibrees: number;
    enRetard: number;
  };
  delaiCentralisationJours: number;
}

// ---------------------------------------------------------------------------
// Import de plan de comptes, de balance et d'écritures
// ---------------------------------------------------------------------------

export type TypeImport = 'PLAN_COMPTES' | 'BALANCE' | 'ECRITURES';

export interface AnalyseImport {
  colonnes: string[];
  separateur: string | null;
  nombreLignes: number;
  apercu: string[][];
  champs: { cle: string; libelle: string; obligatoire: boolean }[];
  mappingPropose: Record<string, string | null>;
  manquants: string[];
}

export interface RapportImport {
  type: TypeImport;
  simulation: boolean;
  lignesLues: number;
  comptesCrees: number;
  comptesReconnus: number;
  ecrituresCreees: number;
  lignesEcritureCreees: number;
  totalDebit: number;
  totalCredit: number;
  anomalies: { ligne: number; message: string }[];
}

// ---------------------------------------------------------------------------
// Analyse et contrôles · État → Analyse et contrôles, État → Contrôle de caisse
// ---------------------------------------------------------------------------

export type GraviteControle = 'BLOQUANT' | 'AVERTISSEMENT' | 'INFORMATION';

export interface AnomalieControle {
  code: string;
  gravite: GraviteControle;
  libelle: string;
  consequence: string;
  action: string;
  occurrences: { reference: string; detail: string; montant?: number; date?: string }[];
}

export interface RapportControles {
  exerciceId: string;
  genereLe: string;
  anomalies: AnomalieControle[];
  totaux: { bloquants: number; avertissements: number; informations: number };
}

export interface JourneeCaisse {
  date: string;
  mouvementDebit: number;
  mouvementCredit: number;
  soldeFinJournee: number;
  negatif: boolean;
}

export interface ControleCaisse {
  compteId: string;
  numero: string;
  intitule: string;
  journal: string | null;
  soldeFinal: number;
  premierJourNegatif: string | null;
  nombreJoursNegatifs: number;
  journees: JourneeCaisse[];
}

// ---------------------------------------------------------------------------
// Régularisation des charges et produits, écritures d'abonnement
// ---------------------------------------------------------------------------

export type TypeRegularisation =
  | 'CHARGE_CONSTATEE_AVANCE'
  | 'PRODUIT_CONSTATE_AVANCE'
  | 'SUBVENTION_PLURIANNUELLE';

export type PeriodiciteAbonnement = 'MENSUELLE' | 'TRIMESTRIELLE' | 'SEMESTRIELLE' | 'ANNUELLE';

export interface Regularisation {
  id: string;
  exerciceId: string;
  type: TypeRegularisation;
  libelle: string;
  compteChargeProduit: { numero: string; intitule: string };
  compteDiffere: { numero: string; intitule: string };
  montantTotal: string;
  periodeDebut: string;
  periodeFin: string;
  montantDiffere: string;
  ecritureConstatation: { id: string; numeroPiece: number | null; date: string } | null;
  ecritureReprise: { id: string; numeroPiece: number | null; date: string } | null;
  createdAt: string;
}

export interface SimulationRegularisation {
  montantTotal: number;
  montantDiffere: number;
  montantExercice: number;
  finExercice: string;
  joursTotal: number;
  joursApresCloture: number;
}

export interface EcheanceAbonnement {
  id: string;
  date: string;
  montant: string;
  ecritureId: string | null;
}

export interface ModeleAbonnement {
  id: string;
  code: string;
  intitule: string;
  periodicite: PeriodiciteAbonnement;
  dateDebut: string;
  dateFin: string;
  montant: string;
  estActif: boolean;
  journal: { code: string; intitule: string };
  compteDebit: { numero: string; intitule: string };
  compteCredit: { numero: string; intitule: string };
  echeances: EcheanceAbonnement[];
}

// ---------------------------------------------------------------------------
// Multidevise et réévaluation
// ---------------------------------------------------------------------------

export interface CoursDevise {
  id: string;
  date: string;
  cours: string;
  source: string | null;
}

export interface Devise {
  id: string;
  code: string;
  intitule: string;
  estActive: boolean;
  cours: CoursDevise[];
}

export interface PositionDevise {
  compteId: string;
  numero: string;
  intitule: string;
  deviseCode: string;
  deviseId: string;
  montantDevise: number;
  valeurComptable: number;
  coursCloture: number;
  valeurReevaluee: number;
  ecart: number;
  /** Compte de classe 5 : l'écart y est réalisé, non latent. */
  estTresorerie: boolean;
}

export interface RapportReevaluation {
  dateReevaluation: string;
  positions: PositionDevise[];
  perteLatente: number;
  gainLatent: number;
  perteRealisee: number;
  gainRealise: number;
  provision: number;
  /** Dotation avant limitation par la position globale de change (AUDCIF art. 58). */
  provisionSansPositionGlobale: number;
  positionGlobaleRetenue: boolean;
  /** Étalement de l'art. 56 · ce que le logiciel ne peut pas calculer seul. */
  avertissements: string[];
  coursManquants: string[];
}

export interface Reevaluation {
  id: string;
  dateReevaluation: string;
  ecritureEcarts: { id: string; numeroPiece: number | null; date: string } | null;
  ecritureProvision: { id: string; numeroPiece: number | null } | null;
  ecritureExtourne: { id: string; numeroPiece: number | null; date: string } | null;
}

// ---------------------------------------------------------------------------
// Relance, rappel et relevé
// ---------------------------------------------------------------------------

export type TypeRelance = 'PREVENTIVE' | 'RAPPEL' | 'RELEVE';

export interface NiveauRelance {
  id: string;
  niveau: number;
  libelle: string;
  type: TypeRelance;
  joursApresEcheance: number;
  modeleTexte: string;
  estActif: boolean;
}

export interface PositionRelance {
  compteId: string;
  numero: string;
  intitule: string;
  tiersId: string | null;
  tiersNom: string | null;
  /** Adhérent (411) ou client-usager (412) · vocabulaire du SYCEBNL. */
  qualite: string;
  montantDu: number;
  retardMaxJours: number;
  echeancePlusAncienne: string | null;
  niveauSuggere: number | null;
  derniereRelance: { niveau: number; date: string } | null;
  /**
   * L'adresse du tiers, ou `null` · elle est FACULTATIVE sur la fiche, et la
   * lacune doit se voir AVANT le clic, pas seulement au compte rendu.
   */
  tiersEmail: string | null;
  lignes: { date: string; echeance: string | null; libelle: string; montant: number; retardJours: number }[];
}

/**
 * Ce qu'il est advenu de la remise d'un courriel · forme rendue par le
 * serveur (`RemiseLettre` dans relances.service.ts). `statut === null`
 * signifie que RIEN n'est entré dans la file et que `motif` dit pourquoi ;
 * `SANS_TRANSPORT` signifie que le message est écrit et repartira tel quel.
 */
export interface RemiseCourriel {
  destinataire: string | null;
  statut: StatutMessage | null;
  motif: string | null;
}

/** L'avis d'accès rendu par POST /utilisateurs et la réinitialisation. */
export interface AvisAcces {
  avise: boolean;
  destinataire: string;
  statut: StatutMessage | null;
  motif: string | null;
}

export interface LettreRelance {
  compteId: string;
  tiers: string;
  montant: number;
  texte: string;
  /** Ce qu'il est advenu de la remise · voir `RemiseLettre` (relances.service.ts). */
  remise: RemiseCourriel;
}

/**
 * Le compte rendu de POST /relances/emettre · `emises` compte les lettres
 * ÉCRITES, `misesEnFile` celles qui sont parties vers un destinataire. Les
 * deux ne sont pas le même nombre dès qu'un tiers n'a pas d'adresse.
 */
export interface BilanEmissionRelances {
  emises: number;
  niveau: number;
  misesEnFile: number;
  nonRemises: number;
  lettres: LettreRelance[];
}

// --------------------------------------------------------------------------
// Système Minimal de Trésorerie (SYCEBNL, Partie 4 ch. 4)
// --------------------------------------------------------------------------

/** Poste du bilan S.M.T · la maquette imprime un renvoi de note par ligne. */
export interface PosteBilanSmt extends PosteCalcule {
  note: string | null;
  estTotal?: boolean;
}

export interface BilanSmt {
  actif: PosteBilanSmt[];
  passif: PosteBilanSmt[];
  totalActif: number;
  totalPassif: number;
  totalActifN1?: number;
  totalPassifN1?: number;
  exerciceN1Disponible: boolean;
  equilibre: boolean;
  renvoiImmobilisations: string;
}

/** VA, VB, VC et JG · les quatre lignes qui mènent du solde de caisse au résultat net. */
export interface RetraitementSmt extends PosteCalcule {
  signe: 1 | -1;
}

export interface CompteDeResultatSmt {
  recettes: PosteCalcule[];
  totalRecettes: number;
  depenses: PosteCalcule[];
  totalDepenses: number;
  soldeCaisse: number;
  retraitements: RetraitementSmt[];
  resultatNet: number;
  controle: {
    resultatBilan: number;
    /**
     * Encaissements et décaissements qui ne sont ni produit ni charge
     * (dotation, emprunt, immobilisation). La maquette du S.M.T n'ouvre aucune
     * ligne pour les reprendre : ils font diverger KZC du résultat du bilan,
     * et c'est ce montant qui explique l'écart.
     */
    fluxHorsExploitation: number;
    comptesHorsExploitation: CompteDuPoste[];
    ecart: number;
    concordant: boolean;
  };
}

export interface OperationTresorerieSmt {
  date: string;
  libelle: string;
  reference: string | null;
  sens: 'RECETTE' | 'DEPENSE';
  recette: number;
  depense: number;
  solde: number;
  /** Déplacement entre deux comptes de l'entité : ni recette ni dépense, mais bien un mouvement du compte. */
  virementInterne: boolean;
  ventile: boolean;
  ventilation: Record<string, number>;
}

export interface JournalTresorerieSmt {
  compteId: string;
  numero: string;
  intitule: string;
  reportANouveau: number;
  operations: OperationTresorerieSmt[];
  soldeAReporter: number;
  totalRecettes: number;
  totalDepenses: number;
  lignesNonVentilees: number;
  /** Solde du compte à la balance · le journal boucle quand il l'égale. */
  soldeBalance: number;
  boucle: boolean;
}

export interface Note4Smt {
  journaux: JournalTresorerieSmt[];
  colonnesRecettes: { cle: string; libelle: string }[];
  colonnesDepenses: { cle: string; libelle: string }[];
  nb: string;
}

export interface NotesSmt {
  fiche: { numero: number; intitule: string; partie: 'BILAN' | 'COMPTE_DE_RESULTAT' }[];
  note1: {
    lignes: {
      dateMiseEnService: string;
      designation: string;
      montant: number;
      dateAcquisition: string;
      dureeUtiliteAns: number;
      dateSortie: string | null;
      prixCession: number | null;
    }[];
    total: number;
  };
  note2: {
    lignes: { reference: string; designation: string; quantite: null; prixUnitaire: null; montant: number }[];
    valeurStockFinal: number;
    valeurStockInitial: number;
    quantitesTenues: boolean;
    motifQuantites: string;
  };
  /**
   * NOTE 3 · la maquette officielle intitule cette note « Etat des créances
   * et des dettes non échues » (SYCEBNL, Partie 4, ch. 4, section 3) · un
   * total qui mêle l'échu et le non échu sous ce titre dit autre chose que
   * ce qu'il annonce, d'où la ventilation servie ligne à ligne.
   */
  note3: {
    creances: LigneCreanceDetteSmt[];
    totalCreances: number;
    totalCreancesNonEchues: number;
    totalCreancesEchues: number;
    totalCreancesNonVentilees: number;
    dettes: LigneCreanceDetteSmt[];
    totalDettes: number;
    totalDettesNonEchues: number;
    totalDettesEchues: number;
    totalDettesNonVentilees: number;
    /** Faux dès qu'un centime échappe à la ventilation · voir `montantNonVentile`. */
    echeancesTenues: boolean;
    /** Servi par le serveur quand la ventilation est incomplète, null sinon. */
    motifEcheances: string | null;
  };
  note5: {
    rubriques: { cle: string; libelle: string; montant: number; comptes: CompteDuPoste[] }[];
    total: number;
    membres: { nom: string; nationalite: null; montant: number; numero: string }[];
    nationaliteTenue: boolean;
    motifNationalite: string;
  };
}

export interface LigneCreanceDetteSmt {
  numero: string;
  nom: string;
  /** Solde ENTIER du compte · la ventilation s'y ajoute, elle ne l'ampute pas. */
  montantCloture: number;
  montantOuverture: number;
  variationValeur: number;
  variationPourcent: number | null;
  /** Échéance postérieure à la clôture · la seule part que le titre de la note annonce. */
  montantNonEchu: number;
  /** Échéance atteinte à la clôture · présente au bilan, mais pas « non échue ». */
  montantEchu: number;
  /**
   * LE RESTE, jamais une mesure autonome · `montantCloture` moins les deux
   * parts datées. Une ligne sans date d'échéance y tombe, et le reste peut
   * être NÉGATIF (un règlement non lettré en face d'une facture datée). Ce
   * n'est pas une troisième catégorie de créance : c'est une lacune de tenue,
   * et l'art. 15 al. 3 de l'Acte uniforme SYCEBNL veut que les Notes annexes
   * comportent « tous les éléments à caractère significatif qui ne sont pas
   * mis en évidence dans les autres états financiers ».
   */
  montantNonVentile: number;
}

export interface EligibiliteSmt {
  categories: { cle: string; libelle: string; montant: number; comptes: CompteDuPoste[] }[];
  totalRessources: number;
  seuilParCategorieFcfa: number;
  deviseDossier: string | null;
  conversionAppliquee: boolean;
  avertissement: string;
}

// --------------------------------------------------------------------------
// Jeu « projets de développement » · les trois tableaux du point 2 de
// l'article 14, dont la correspondance vient du Guide d'application (ch. 7).
// --------------------------------------------------------------------------

export interface PosteEmploisRessources extends PosteCalcule {
  estTotal?: boolean;
  /** Mouvement avant correction des dettes · absent des lignes de ressources et des totaux. */
  brut?: number;
  /** Correction des renvois du guide, signée · positive quand la dette a diminué. */
  correction?: number;
}

export interface TableauEmploisRessources {
  lignes: PosteEmploisRessources[];
  totalRessources: number;
  totalEmplois: number;
  excedent: number;
  encaisseDisponible: number;
  fondsFinExercice: number;
  controle: { ecart: number; boucle: boolean };
  /** Postes dont la correction de dettes dépasse le mouvement · répartition faussée. */
  anomalies: {
    ref: string;
    libelle: string;
    brut: number;
    correction: number;
    montant: number;
    diagnostic: string;
  }[];
  avertissements: string[];
}

export interface LigneExecutionBudgetaire {
  code: string;
  libelle: string;
  budget: number;
  decaissement: number;
  /**
   * Les deux moitiés de la colonne Engagement (3), rendues séparément parce
   * qu'un réviseur recoupe l'une avec la balance et l'autre avec le registre
   * des engagements. Un total fondu ne serait justifiable par aucun des deux.
   */
  engagementComptable: number;
  engagementHorsComptabilite: number;
  engagement: number;
  realisation: number;
  creditDisponible: number;
  executionPourcent: number | null;
}

export interface TableauExecutionBudgetaire {
  plan: { id: string; code: string; intitule: string };
  lignes: LigneExecutionBudgetaire[];
  total: Omit<LigneExecutionBudgetaire, 'code' | 'libelle'>;
  engagementsHorsComptabilite: string;
}

export interface TableauReconciliationTresorerie {
  lignes: { rep: string; libelle: string; montant: number }[];
  controle: { tresorerieBalance: number; ecart: number; boucle: boolean };
  avertissements: string[];
}

// --------------------------------------------------------------------------
// Échéancier de trésorerie · ce qui va tomber, et ce qu'il restera.
// Distinct de la balance âgée, qui regarde en arrière.
// --------------------------------------------------------------------------

export interface TrancheEcheancier {
  cle: string;
  libelle: string;
  deJours: number | null;
  aJours: number | null;
  encaissements: number;
  decaissements: number;
  net: number;
  tresorerieProjetee: number;
}

export interface EcheanceDetail {
  ligneId: string;
  date: string;
  tranche: string;
  compteNumero: string;
  compteIntitule: string;
  tiers: string | null;
  libelle: string;
  reference: string | null;
  montant: number;
  sens: 'ENCAISSEMENT' | 'DECAISSEMENT';
}

export interface Echeancier {
  dateReference: string;
  tresorerieActuelle: number;
  tranches: TrancheEcheancier[];
  details: EcheanceDetail[];
  alerte: { tranche: string; libelle: string; tresorerieProjetee: number; message: string } | null;
  lignesSansEcheance: number;
}

// --------------------------------------------------------------------------
// Registre des retenues à la source et échéancier fiscal · voir
// docs/fiscalite-asbl-rdc.md. Aucun calcul d'impôt : l'état recense ce que la
// comptabilité porte déjà, en regard de l'échéance légale.
// --------------------------------------------------------------------------

export interface MoisRetenue {
  mois: string;
  retenu: number;
  /**
   * Reversé AU TITRE de ce mois · le reversement s'impute désormais du mois le
   * plus ancien au plus récent, et non sur le mois de sa propre écriture. Une
   * retenue de mars reversée le 14 avril, donc dans les temps, éteint mars.
   */
  reverse: number;
  /**
   * Débité PENDANT ce mois, quel que soit le mois de la retenue éteinte. Ce
   * n'est pas le même chiffre que `reverse` et c'est volontaire : celui-ci est
   * la piste de l'écriture, celui-là l'imputation qui décide du retard.
   */
  reverseEcritures: number;
  solde: number;
  echeance: string;
  enRetard: boolean;
}

export interface NatureRetenueCalculee {
  cle: string;
  libelle: string;
  beneficiaire: 'ETAT' | 'ORGANISME_SOCIAL';
  echeance: string;
  baseLegale: string;
  reserve: string | null;
  comptes: { numero: string; intitule: string; retenu: number; reverse: number }[];
  mois: MoisRetenue[];
  retenu: number;
  reverse: number;
  solde: number;
  moisEnRetard: number;
  /**
   * Reversements qu'aucune retenue de l'exercice n'absorbe · un reversement
   * de la retenue de décembre passé en janvier suivant, par exemple. Le
   * registre ne lit que les écritures de l'exercice.
   */
  reverseNonImpute: number;
  /**
   * Retenue ÉCHUE qui reste non reversée · assiette du signalement de
   * l'article 20, distincte du solde, qui compte aussi les mois non échus.
   */
  retenuEchuNonReverse: number;
  /** Dernière échéance de reversement déjà passée, ou null. */
  derniereEcheanceEchue: string | null;
  /**
   * Condition de déductibilité que l'art. 20, dernier alinéa, attache à cette
   * retenue, ou null quand aucune ne s'y attache (TVA, cotisations sociales).
   */
  chargeSousConditionArticle20: string | null;
  prochaineEcheance: string;
}

export interface RegistreRetenues {
  dateReference: string;
  derniereVerificationEcheances: string;
  natures: NatureRetenueCalculee[];
  totalRetenu: number;
  totalReverse: number;
  totalDu: number;
  comptesNonRattaches: { numero: string; intitule: string }[];
  /**
   * Charges dont la déduction est exposée faute de reversement (loi n° 23/053,
   * art. 20, dernier alinéa). Le logiciel AVERTIT et ne chiffre pas : c'est la
   * CHARGE qui se réintègre, et son montant n'est ni dans le registre, ni
   * déductible d'un taux.
   */
  signalementsDeductibilite: {
    cle: string;
    libelle: string;
    charge: string;
    montantEchuNonReverse: number;
    derniereEcheanceEchue: string;
  }[];
  avertissements: string[];
}

export interface EcheancierFiscal {
  dateReference: string;
  derniereVerificationEcheances: string;
  echeances: {
    cle: string;
    libelle: string;
    /**
     * REVERSEMENT · une somme retenue sur un compte, qu'il faut verser.
     * DECLARATION · une obligation qui ne porte AUCUN montant, et que le
     * registre ne voyait donc pas : les trois déclarations créées par la loi
     * de finances n° 25/060 sont de ce genre, et sanctionnées comme telles.
     */
    genre: 'REVERSEMENT' | 'DECLARATION';
    periodicite: 'MENSUELLE' | 'TRIMESTRIELLE' | 'ANNUELLE';
    beneficiaire: 'ETAT' | 'ORGANISME_SOCIAL';
    date: string;
    echeance: string;
    baseLegale: string;
    reserve: string | null;
    montantDu: number;
    moisEnRetard: number;
    /** Ce qu'il faut produire · une échéance sans contenu ne sert à rien. */
    contenu: string | null;
    sanction: string | null;
    sourceDonnees: string | null;
  }[];
  totalDu: number;
  avertissements: string[];
}


// ---------------------------------------------------------------------------
// Planning de clôture · CPCC, notes de cours d'organisation comptable, § 2.3
// et § 7.1. Voir docs/organisation-comptable-cpcc.md.
// ---------------------------------------------------------------------------

export type NatureJalon = 'INTERNE' | 'LEGALE';

/** Loi n° 004/2001, art. 2 et Titre II. Voir docs/obligations-annuelles-ebnl-rdc.md. */
export type FormeJuridiqueEbnl =
  | 'ASSOCIATION'
  | 'ORGANISATION_NON_GOUVERNEMENTALE'
  | 'ASSOCIATION_CONFESSIONNELLE'
  | 'ETABLISSEMENT_UTILITE_PUBLIQUE'
  | 'UNITE_GESTION_PROJET'
  | 'AUTRE';

export interface JalonCloture {
  etape: number;
  libelle: string;
  detail: string;
  nature: NatureJalon;
  source: string;
  debut: string;
  echeance: string;
  enRetard: boolean;
  /**
   * Ce que les dirigeants encourent si le travail du jalon n'est pas fait du
   * tout · null sur la plupart. À ne pas confondre avec `nature`, qui qualifie
   * l'échéance : ici c'est l'OMISSION qui est punie, pas le retard.
   */
  sanction: string | null;
  /** Ce qu'OmegaX sait vérifier seul sur ce jalon · absent sinon. */
  observation?: { libelle: string; satisfait: boolean };
}

export interface PlanningCloture {
  exerciceId: string;
  dateDebut: string;
  dateFin: string;
  statut: StatutExercice;
  /** Date de dernière vérification des échéances légales contre leur source. */
  derniereVerification: string;
  /** La forme juridique décide des jalons affichés · voir jalonsApplicables. */
  formeJuridique: FormeJuridiqueEbnl;
  formeJuridiqueSyscohada: FormeJuridiqueSyscohada | null;
  droitEtranger: boolean;
  jalons: JalonCloture[];
}


// ---------------------------------------------------------------------------
// Analyse et contrôles · vues tirées d'un dossier de révision réel
// (CARRIGRES, Drive). Voir ControlesService.
// ---------------------------------------------------------------------------

export interface CompteEvolution {
  compteId: string;
  numero: string;
  intitule: string;
  classe: ClasseCompte;
  /** Report à-nouveau, tenu à part pour ne pas écraser janvier. */
  report: number;
  /** Net signé du mois, un par colonne, dans l'ordre de `mois`. */
  valeurs: number[];
  cumul: number;
  soldeFinal: number;
  /** Clé du mois le plus éloigné de la moyenne, ou null. */
  moisAberrant: string | null;
}

export interface EvolutionMensuelle {
  exerciceId: string;
  mois: { cle: string; libelle: string }[];
  comptes: CompteEvolution[];
  classe: ClasseCompte | null;
  /** Nul hors filtre de classe : en partie double, la somme vaudrait zéro. */
  totaux: number[] | null;
}

export interface CompteDormant {
  compteId: string;
  numero: string;
  intitule: string;
  classe: ClasseCompte;
  estActif: boolean;
  dernierMouvement: string | null;
  nombreEcritures: number;
  solde: number;
  jamaisMouvemente: boolean;
}

// ---------------------------------------------------------------------------
// Exonérations douanières et fiscales · facilités de l'article 39 de la loi
// n° 004/2001, constatées par arrêté interministériel du Plan et des Finances.
// ---------------------------------------------------------------------------

export type TypeDemandeExoneration = 'PONCTUEL' | 'PREVISIONNEL' | 'RENOUVELLEMENT';
export type StatutExoneration = 'EN_PREPARATION' | 'DEPOSE' | 'ACCORDE' | 'REJETE' | 'EXPIRE';

export interface PieceExoneration {
  cle: string;
  libelle: string;
  /** Renseignée quand la pièce n'est exigée que dans un cas particulier. */
  conditionnelle?: string;
  fournie: boolean;
}

export interface DossierExoneration {
  id: string;
  type: TypeDemandeExoneration;
  statut: StatutExoneration;
  objet: string;
  referenceArrete: string | null;
  dateArrete: string | null;
  dateDebutValidite: string | null;
  dateFinValidite: string | null;
  lettreTransport: string | null;
  valeurBiens: number | null;
  franchiseDouaniere: string | null;
  observations: string | null;
  piecesFournies: string[];
  modele: { libelle: string; objet: string; baseLegale: string; validiteMois: number | null };
  pieces: PieceExoneration[];
  nombrePiecesFournies: number;
  nombrePiecesRequises: number;
  piecesManquantes: string[];
  conditionnellesAVerifier: Array<{ libelle: string; condition: string }>;
  complet: boolean;
  /** Null tant que le dossier n'est pas ACCORDÉ · il n'y a alors aucun titre. */
  joursAvantExpiration: number | null;
  alerte: 'EXPIRE' | 'A_RENOUVELER' | null;
}

export interface RegistreExonerations {
  dateReference: string;
  dossiers: DossierExoneration[];
  aRenouveler: number;
  expires: number;
  incomplets: number;
  avertissement: string;
}

export interface ReferentielExonerations {
  modeles: Array<{
    type: TypeDemandeExoneration;
    libelle: string;
    objet: string;
    baseLegale: string;
    validiteMois: number | null;
    pieces: Array<{ cle: string; libelle: string; conditionnelle?: string }>;
  }>;
  franchisesDouanieres: ReadonlyArray<{ lettre: string; libelle: string; texte: string }>;
  joursAlerteRenouvellement: number;
  avertissement: string;
}

// ---------------------------------------------------------------------------
// RÉSULTAT FISCAL ET IMPÔT SUR LES BÉNÉFICES · dossiers SYSCOHADA (loi
// n° 23/053 du 30 novembre 2023). Voir src/modules/fiscalite.
// ---------------------------------------------------------------------------

export type SensRetraitementFiscal = 'REINTEGRATION' | 'DEDUCTION';
export type NatureActiviteFiscale = 'VENTE' | 'PRESTATIONS';
export type RegimeImposition =
  | 'IMPOT_SOCIETES'
  | 'IRPP_MICRO_ENTREPRISE'
  | 'IRPP_PETITE_ENTREPRISE'
  | 'IRPP_REGIME_REEL';

export interface DefinitionRetraitementFiscal {
  code: string;
  sens: SensRetraitementFiscal;
  libelle: string;
  aide: string;
  source: string;
  plafond?: { part: number; assiette: 'CHIFFRE_AFFAIRES' | 'CHARGE'; enonce: string };
}

export interface CatalogueRetraitements {
  retraitements: DefinitionRetraitementFiscal[];
  derniereVerification: string;
}

export interface RetraitementFiscal {
  id: string;
  code: string;
  sens: SensRetraitementFiscal;
  libelle: string;
  montant: number;
  commentaire: string | null;
  source: string | null;
}

export interface ResultatFiscal {
  exerciceId: string;
  dateDebut: string;
  dateFin: string;
  derniereVerification: string;
  formeJuridiqueSyscohada: FormeJuridiqueSyscohada | null;
  devise: string;
  regime: RegimeImposition;
  observations: string[];
  natureActivite: NatureActiviteFiscale | null;
  resultatComptable: number;
  sourceResultat: 'CLASSES_6_7_8' | 'COMPTE_13';
  chiffreAffaires: number;
  retraitements: RetraitementFiscal[];
  totalReintegrations: number;
  totalDeductions: number;
  resultatFiscalBrut: number;
  deficitAnterieur: { montant: number; saisi: boolean; detail: { exerciceId: string; dateFin: string; montant: number }[] };
  deficitImpute: number;
  resultatFiscal: number;
  plafonds: { code: string; enonce: string; assiette: 'CHIFFRE_AFFAIRES' | 'CHARGE'; part: number; montantAdmis: number | null }[];
  impotTheorique: number | null;
  impotMinimum: number | null;
  impotDu: number | null;
  baseImpot: string;
  minimumApplique: boolean;
  explication: string;
  acomptesVerses: number;
  soldeAPayer: number | null;
  /** Suppléments établis par l'Administration · entrent dans la base des acomptes (art. 57 bis LPF). */
  supplementsAdministration: number;
  /** Impôt dû + suppléments · la base sur laquelle les trois acomptes sont assis. */
  baseAcomptes: number | null;
  acomptesProchainExercice: { quotite: number; echeance: string; montant: number }[];
  /**
   * ART. 57, AL. 3 ET 57 QUATER LPF · les deux quotités de 60 % et 40 % par
   * lesquelles une PETITE ENTREPRISE acquitte l'impôt DE CET EXERCICE. Ce
   * n'est pas un acompte sur l'exercice suivant, et le tableau ci-dessus
   * reste vide pour elle : les acomptes de l'art. 57 bis ne visent que
   * l'alinéa 2, c'est-à-dire l'IS et l'IRPP au régime réel. Liste vide pour
   * tout autre régime, ou quand l'impôt n'a pas pu être calculé.
   *
   * `reserve` porte le doute du texte lui-même sur la seconde échéance et
   * doit être affichée avec elle : l'art. 57 quater, al. 3 écrit une seconde
   * fois « La 1ère quotité », faute de rédaction du législateur reprise telle
   * quelle par la compilation DGI.
   */
  quotitesPetiteEntreprise: {
    rang: number;
    quotite: number;
    echeance: string;
    source: string;
    reserve: string | null;
    montant: number;
  }[];
}

// ---------------------------------------------------------------------------
// ÉTATS FINANCIERS DU SYSCOHADA RÉVISÉ · Système normal (AUDCIF Titre IX,
// chapitres 3 à 5). Formes de retour de
// `src/modules/etats-financiers-syscohada/etats-financiers-syscohada.service.ts`,
// recopiées à l'identique : toute divergence se corrige EN FACE du serveur,
// jamais ici, sinon le client afficherait un champ que la route ne sert pas.
//
// Le SUFFIXE `Syscohada` porte à lui seul le cloisonnement des deux
// référentiels (CLAUDE.md §6) maintenant que tous les types du client vivent
// dans ce fichier : les deux ne partagent ni postes, ni comptes, ni colonnes,
// et un type nommé `LigneBilan` qui servirait aux deux finirait par recevoir
// les champs de l'un dans l'écran de l'autre. Ne jamais fusionner un type
// SYCEBNL et son homonyme SYSCOHADA, même s'ils se ressemblent un exercice
// durant. Aucune règle comptable ne vit ici · seulement des formes.
// ---------------------------------------------------------------------------

/** Compte qui alimente un poste · sert le drill-down poste par poste. */
export interface CompteDuPosteSyscohada {
  numero: string;
  intitule: string;
  montant: number;
}

/**
 * Ligne de bilan. `brut` et `amortissement` ne sont servis QUE côté actif :
 * le modèle du Titre IX ch. 3 section 2 donne à l'actif les colonnes
 * « BRUT · AMORT. et DÉPREC. · NET » et au passif la seule colonne « NET ».
 * `amortissement` est une magnitude positive, `montant` (net) = brut −
 * amortissement · l'écran l'imprime entre parenthèses, il ne le re-négative
 * pas.
 *
 * `note` est le renvoi de la colonne NOTE du modèle (« 3e » sur CE) et
 * `renvoi` le renvoi de bas de poste (« dont Placement en Net » sur AJ et
 * AK) : deux chaînes d'affichage, aucune valeur calculée.
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
  comptes: CompteDuPosteSyscohada[];
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
  comptesNonRattaches: CompteDuPosteSyscohada[];
  controle: {
    resultatClasses678: number;
    resultatCompte13: number;
    doubleComptageProbable: boolean;
  };
}

/**
 * Ligne du compte de résultat en liste. Les postes de base (TA à RS) et les
 * neuf lignes X* sont dans la MÊME liste, comme le modèle du ch. 4 les
 * entrelace ; `estSolde` distingue les secondes et `formuleOfficielle` porte
 * alors la formule telle qu'imprimée (« Somme TA à RB »).
 *
 * `montant` est SIGNÉ selon la logique de signe du ch. 4 section 2 : « les
 * postes de charges (préfixe R) sont saisis en négatif ; les formules de
 * totalisation sont des sommes, jamais des différences ». Une charge arrive
 * donc négative et s'affiche telle quelle.
 */
export interface LigneCompteResultatSyscohada {
  ref: string;
  libelle: string;
  montant: number;
  montantN1?: number;
  comptes: CompteDuPosteSyscohada[];
  estSolde?: boolean;
  formuleOfficielle?: string;
  /** Renvois de la colonne NOTE du ch. 4, non développés (« 27 » reste « 27 »). */
  notes: string[];
}

/** Les neuf lignes X* du modèle, nommées · huit soldes de gestion plus XB. */
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
  comptesNonRattaches: CompteDuPosteSyscohada[];
  controle: {
    resultatToutesClassesDeGestion: number;
    ecart: number;
    coherent: boolean;
  };
}

/** Ligne chiffrée du tableau des flux · `repere` porte la clé A à H du modèle. */
export interface LigneFluxSyscohada {
  ref: string;
  libelle: string;
  montant: number;
  montantN1?: number;
  comptes: CompteDuPosteSyscohada[];
  estTotal?: boolean;
  repere?: string;
}

/** Intitulé de rubrique intercalé par le modèle entre deux blocs de postes. */
export interface SectionFluxSyscohada {
  section: string;
}

/**
 * Poste que la balance ne permet pas de chiffrer, ou pas entièrement, avec
 * la raison telle que le serveur la formule. Affichée mot pour mot : c'est
 * elle qui dit au comptable si la donnée MANQUE (pas d'exercice antérieur)
 * ou si une part est INDÉTERMINABLE par numéro de compte.
 */
export interface PosteNonCalculableSyscohada {
  ref: string;
  raison: string;
}

export interface TableauFluxTresorerieSyscohada {
  lignes: Array<LigneFluxSyscohada | SectionFluxSyscohada>;
  exerciceN1Disponible: boolean;
  comptesNonVentiles: CompteDuPosteSyscohada[];
  postesNonCalculables: PosteNonCalculableSyscohada[];
  controle: {
    tresorerieOuverture: number;
    variation: number;
    tresorerieClotureParFlux: number;
    tresorerieClotureParBilan: number;
    ecart: number;
    coherent: boolean;
  };
}

/** Distingue une rubrique intercalée d'une ligne chiffrée du tableau des flux. */
export function estSectionFlux(
  ligne: LigneFluxSyscohada | SectionFluxSyscohada,
): ligne is SectionFluxSyscohada {
  return 'section' in ligne;
}

// ---------------------------------------------------------------------------
// SYSTÈME MINIMAL DE TRÉSORERIE DU SYSCOHADA RÉVISÉ · routes
// `/etats-financiers-syscohada/smt/...`, servies par
// `EtatsFinanciersSmtSyscohadaService` (AUDCIF Titre X, ch. 1 à 3).
//
// Même règle de nommage que ci-dessus, et pour une raison qui se voit ici
// mieux qu'ailleurs : les types SMT du SYCEBNL (`BilanSmt`,
// `CompteDeResultatSmt`, `NotesSmt`…) décrivent d'AUTRES postes, d'AUTRES
// notes et d'AUTRES seuils · cinq catégories de ressources plafonnées à
// trente millions chacune d'un côté (SYCEBNL art. 6), trois seuils de
// chiffre d'affaires de l'autre (AUDCIF art. 13). Le suffixe `SmtSyscohada`
// est ce qui empêche un écran d'appeler l'un pour l'autre.
//
// SEUL emprunt aux types SYCEBNL : `CompteDuPoste`, qui n'est pas une notion
// comptable mais la forme technique d'un compte cité sous un poste (numéro,
// intitulé, montant) · exactement ce que le serveur partage entre les deux
// référentiels dans `etats-financiers.communs.ts`. Aucun poste, aucun
// libellé, aucun seuil n'est repris du SYCEBNL.
//
// Les dates sont des chaînes ISO : elles ont traversé JSON.
// ---------------------------------------------------------------------------

/**
 * Un poste résolu du jeu SMT, bilan comme compte de résultat.
 *
 * `note` porte le renvoi que les DEUX maquettes du ch. 2 impriment en
 * colonne « Note » (le jeu SMT du SYCEBNL ne l'a qu'au bilan).
 * `lettre` n'existe que sur les lignes que la maquette du compte de résultat
 * étiquette (A, B, C, F, G) ; `signeOfficiel` que sur les trois lignes de
 * variation, dont la maquette imprime l'opérateur devant le libellé.
 */
export interface PosteSmtSyscohada {
  ref: string;
  libelle: string;
  note: string | null;
  montant: number;
  /** Colonne « Montant Exercice N-1 » · undefined quand il n'y a pas d'exercice antérieur. */
  montantN1?: number;
  comptes: CompteDuPoste[];
  estTotal?: boolean;
  lettre?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  signeOfficiel?: 1 | -1;
}

/**
 * BILAN SMT au 31 décembre N (Titre X ch. 2 § 1), postes SA1 à SAZ et SP1
 * à SPZ.
 *
 * `comptesNonRattaches` porte les comptes de bilan qu'aucun poste ne capte.
 * Il n'est jamais masqué à l'écran : c'est lui qui explique un déséquilibre
 * plutôt que de le laisser sans cause.
 */
export interface BilanSmtSyscohada {
  actif: PosteSmtSyscohada[];
  passif: PosteSmtSyscohada[];
  totalActif: number;
  totalPassif: number;
  totalActifN1?: number;
  totalPassifN1?: number;
  exerciceN1Disponible: boolean;
  equilibre: boolean;
  comptesNonRattaches: CompteDuPoste[];
  /** Renvoi (1) imprimé sous l'actif de la maquette officielle. */
  renvoiImmobilisations: string;
  controle: {
    /** Résultat lu dans les classes 6, 7 et 8 · avant écriture de clôture. */
    resultatClasses678: number;
    /** Résultat lu au compte 13 · après écriture de clôture. */
    resultatCompte13: number;
    /** Les deux sources sont servies en même temps : le résultat serait compté deux fois. */
    doubleComptageProbable: boolean;
  };
}

/**
 * Un encaissement ou un décaissement que le compte de résultat SMT n'a
 * aucune ligne pour recevoir : financement (classe 1) ou investissement
 * (classe 2). Le Titre X ch. 1 § 1 les range parmi les quatre éléments de
 * l'inventaire extra-comptable de fin d'exercice, d'où leur affichage à
 * part · ils ne corrigent PAS le résultat, qui est juste sans eux.
 */
export interface RubriqueHorsResultatSmtSyscohada {
  cle: string;
  intitule: string;
  montant: number;
  comptes: CompteDuPoste[];
}

/**
 * COMPTE DE RÉSULTAT SMT au 31 décembre N (Titre X ch. 2 § 2).
 *
 * `lignes` est la maquette dans son ordre d'impression, totaux compris ;
 * les autres champs servent les encadrés de contrôle sous le tableau.
 */
export interface CompteDeResultatSmtSyscohada {
  lignes: PosteSmtSyscohada[];
  recettes: PosteSmtSyscohada[];
  totalRecettes: number;
  depenses: PosteSmtSyscohada[];
  totalDepenses: number;
  /** C = A - B · solde de trésorerie, excédent ou insuffisance de recettes. */
  soldeCaisse: number;
  /** Les trois variations d'inventaire et la ligne F. */
  retraitements: PosteSmtSyscohada[];
  /** Lettres de la formule G = C - D + E - F, que la maquette invoque sans les attribuer. */
  lettres: { D: number; E: number; F: number };
  /** Quelles lignes de variation composent D et E · lecture fixée par la table de correspondance. */
  lettresDE: { D: readonly string[]; E: readonly string[] };
  /** Sens retenu pour « Variation N / N-1 » · 'N1_MOINS_N', convention du compte 603. */
  definitionVariation: string;
  /** G · reporté au poste « Résultat exercice » du passif du bilan. */
  resultatExercice: number;
  exerciceN1Disponible: boolean;
  fluxHorsResultat: RubriqueHorsResultatSmtSyscohada[];
  /** Contrepartie ni en A/B, ni en classe 1 ou 2 · signalée, jamais rattachée d'office. */
  contrepartiesNonRattachees: CompteDuPoste[];
  controle: {
    /** Poste « Résultat exercice » du bilan, l'autre chemin vers le même nombre. */
    resultatBilan: number;
    ecart: number;
    concordant: boolean;
    /** Décomposition attendue de l'écart · voir le service, qui en donne la démonstration. */
    composantesEcart: {
      classe1: number;
      classe2: number;
      depreciationsTresorerie: number;
      autresComptes: number;
      dotations: number;
      total: number;
    };
    /** Part que la décomposition n'explique pas · doit être nulle. */
    residuel: number;
  };
}

/** Une colonne de ventilation de la NOTE 4 · le NB officiel autorise des rajouts. */
export interface ColonneVentilationSmtSyscohada {
  cle: string;
  libelle: string;
  rajoutAutorise: boolean;
}

export interface OperationTresorerieSmtSyscohada {
  date: string;
  libelle: string;
  reference: string | null;
  sens: 'RECETTE' | 'DEPENSE';
  recette: number;
  depense: number;
  solde: number;
  /** Déplacement entre deux comptes de l'entité : ni recette ni dépense, mais bien un mouvement du compte. */
  virementInterne: boolean;
  /** Une seule caisse ou banque touchée : la ventilation est attribuable sans clé de répartition. */
  ventile: boolean;
  ventilation: Record<string, number>;
}

/** Un journal par banque et un journal pour la caisse · NB officiel de la NOTE 4. */
export interface JournalTresorerieSmtSyscohada {
  compteId: string;
  numero: string;
  intitule: string;
  reportANouveau: number;
  operations: OperationTresorerieSmtSyscohada[];
  soldeAReporter: number;
  totalRecettes: number;
  totalDepenses: number;
  lignesNonVentilees: number;
  /** Solde du compte à la balance · le journal boucle quand il l'égale. */
  soldeBalance: number;
  boucle: boolean;
}

export interface Note4SmtSyscohada {
  journaux: JournalTresorerieSmtSyscohada[];
  colonnesRecettes: ColonneVentilationSmtSyscohada[];
  colonnesDepenses: ColonneVentilationSmtSyscohada[];
  /** NB officiel imprimé sous le journal. */
  nb: string;
}

/** Sous-tableau d'une note qui en compte plusieurs · la NOTE 3 en a deux. */
export interface SousTableauNoteSmtSyscohada {
  cle: string;
  intitule: string;
  colonnes: string[];
  ligneTotal: string;
}

export interface NoteSmtSyscohadaDeclaree {
  numero: number;
  intitule: string;
  partie: 'BILAN' | 'COMPTE_DE_RESULTAT';
  /** null quand la note est faite de plusieurs tableaux, qui portent alors chacun les leurs. */
  colonnes: string[] | null;
  sousTableaux?: SousTableauNoteSmtSyscohada[];
}

/**
 * Structure officielle du jeu · les trois documents du ch. 1 § 2, les
 * quatre notes du ch. 3, les deux journaux de suivi (pièces de base, non
 * numérotées comme notes) et les quatre éléments de l'inventaire
 * extra-comptable de fin d'exercice.
 */
export interface FicheSmtSyscohada {
  documents: readonly string[];
  notes: NoteSmtSyscohadaDeclaree[];
  journauxDeSuivi: readonly { cle: string; intitule: string; colonnes: readonly string[] }[];
  inventaireExtraComptable: readonly string[];
  /** « Mode linéaire sans prorata temporis » · règle propre au SMT (ch. 1 § 1). */
  amortissement: { mode: string; prorataTemporis: boolean };
}

/**
 * Une ligne de la NOTE 1. `origine` distingue les biens tenus au registre
 * des immobilisations de ce que le titre officiel appelle « les cautions »,
 * repris depuis le solde du compte de dépôts et cautionnements versés : ces
 * dernières n'ont ni date d'entrée ni prix de cession.
 */
export interface LigneNote1SmtSyscohada {
  origine: 'REGISTRE' | 'BALANCE';
  date: string | null;
  designation: string;
  montant: number;
  dateSortie: string | null;
  prixCession: number | null;
}

export interface LigneNote2SmtSyscohada {
  reference: string;
  designation: string;
  /** Colonnes de la maquette qu'aucune donnée comptable ne sert · inventaire extra-comptable. */
  quantite: number | null;
  prixUnitaire: number | null;
  montant: number;
}

export interface LigneNote3SmtSyscohada {
  /** Colonne « Date » de la maquette · sans équivalent au niveau d'un compte de tiers. */
  date: string | null;
  numero: string;
  nom: string;
  /**
   * Colonne officielle · le solde ENTIER du compte. La ventilation ci-dessous
   * s'AJOUTE à la maquette, elle ne l'ampute pas : ce montant justifie les
   * postes SA3 et SP4 du bilan et les lignes SV2 et SV3 du compte de résultat,
   * et l'amputer les ferait diverger.
   */
  montantCloture: number;
  /** Part dont le terme n'est pas atteint à la clôture · ce que le titre vise. */
  montantNonEchu: number;
  /** Part dont le terme est passé, que la note ne devrait pas couvrir. */
  montantEchu: number;
  /**
   * Ni l'un ni l'autre · une ligne sans date d'échéance n'est pas « échue »,
   * et pas « non échue » non plus : on ne sait pas. Elle n'est donc rangée
   * d'office nulle part, et cette part est le RESTE des deux autres, seule
   * définition qui garantisse qu'aucun montant ne s'évapore. S'y ajoutent par
   * nature les dépréciations et provisions, qui n'ont aucun terme à porter.
   * Peut être négative · c'est alors un signal de tenue, pas un montant à
   * additionner.
   */
  montantNonVentile: number;
  montantOuverture: number;
  /** Ce qui alimente réellement les lignes de variation du compte de résultat. */
  variationValeur: number;
  /** Colonne officielle « Variation % » · null quand l'ouverture est nulle. */
  variationPourcent: number | null;
}

export interface NotesSmtSyscohada {
  fiche: FicheSmtSyscohada;
  note1: {
    lignes: LigneNote1SmtSyscohada[];
    total: number;
    totalRegistre: number;
    totalCautions: number;
    amortissement: { mode: string; prorataTemporis: boolean };
    motifCautions: string;
  };
  note2: {
    lignes: LigneNote2SmtSyscohada[];
    /** Les deux lignes de synthèse du bas de tableau, transcrites. */
    lignesSynthese: readonly string[];
    valeurStockFinal: number;
    valeurStockInitial: number;
    /** Ce que la note verse à la ligne de variation des stocks du compte de résultat. */
    variationSv1: number;
    quantitesTenues: boolean;
    motifQuantites: string;
  };
  note3: {
    creances: LigneNote3SmtSyscohada[];
    totalCreances: number;
    totalCreancesNonEchues: number;
    totalCreancesEchues: number;
    totalCreancesNonVentilees: number;
    dettes: LigneNote3SmtSyscohada[];
    totalDettes: number;
    totalDettesNonEchues: number;
    totalDettesEchues: number;
    totalDettesNonVentilees: number;
    /** Faux dès qu'UNE part reste non ventilée · l'état ne peut alors pas tenir son titre. */
    echeancesTenues: boolean;
    /** Ce qu'il faut saisir pour que la note dise ce que son intitulé annonce. */
    motifEcheances: string;
    variationSv2: number;
    variationSv3: number;
    /** Anomalie du texte officiel : « la variation en pourcentage » alimenterait le compte de résultat. */
    reserveVariationPourcent: string;
  };
}

/** Un des trois seuils de l'art. 13, avec sa clause d'équivalence monétaire. */
export interface SeuilSmtSyscohada {
  cle: 'negoce' | 'artisanat' | 'services';
  categorie: string;
  montantFcfa: number;
  clause: string;
  /** Comparaison brute, monnaie de tenue contre F CFA · n'est une conclusion que si le dossier est tenu en F CFA. */
  souSeuilSiMemeMonnaie: boolean;
}

/**
 * CONTRÔLE D'ÉLIGIBILITÉ AU SMT · AUDCIF art. 11 et 13. Le retour ne
 * TRANCHE pas : la qualification de l'activité (négoce, artisanat,
 * services) appartient à l'entité, et les seuils sont en F CFA quand le
 * dossier tient ses comptes dans une autre monnaie.
 */
export interface EligibiliteSmtSyscohada {
  exercice: { dateDebut: string; dateFin: string };
  /** Chiffre d'affaires hors taxes, lu en solde (montant facturé), pas en encaissements. */
  chiffreAffaires: number;
  /** Détail par les quatre postes du Système normal dont le chiffre d'affaires est la somme. */
  ventilation: { ref: string; libelle: string; lettre?: string; montant: number; comptes: CompteDuPoste[] }[];
  comptesHorsVentilation: CompteDuPoste[];
  deviseDossier: string | null;
  systemeActuel: 'NORMAL' | 'MINIMAL_TRESORERIE' | null;
  /** Toujours faux · le cours de conversion n'appartient pas au texte comptable. */
  conversionAppliquee: boolean;
  seuils: SeuilSmtSyscohada[];
  qualificationParLEntite: string;
  rappelArticle11: string;
  avertissementConversion: string;
}

/**
 * AFFECTATION DU RÉSULTAT · ce que devient le résultat une fois l'exercice
 * clos. Commun aux deux référentiels : les deux imposent de solder le
 * compte 13. Ce sont les DESTINATIONS qui diffèrent, et le serveur les sert
 * déjà filtrées dans `destinations`.
 */
export interface DotationReserveLegale {
  /** `null` = aucune dotation obligatoire · le motif dit toujours pourquoi. */
  dotation: number | null;
  motif: string;
}

export interface LigneAffectation {
  id: string;
  compteId: string;
  montant: string | number;
  libelle: string | null;
  compte: { numero: string; intitule: string };
}

export interface AffectationResultat {
  id: string;
  exerciceId: string;
  dateDecision: string;
  organe: string;
  reference: string | null;
  montant: string | number;
  estBenefice: boolean;
  lignes: LigneAffectation[];
  ecriture: { id: string; numeroPiece: number | null; date: string; statut: StatutEcriture } | null;
  exercice?: { id: string; dateDebut: string; dateFin: string };
}

export interface PreparationAffectation {
  exercice: { id: string; dateDebut: string; dateFin: string };
  referentiel: Referentiel;
  /** Résultat PROPRE de l'exercice · le mouvement du compte 13, pas son solde. */
  montant: number;
  estBenefice: boolean;
  pertesAnterieures: number;
  capitalSocial: number;
  reserveLegaleExistante: number;
  reserveLegale: DotationReserveLegale;
  destinations: { id: string; numero: string; intitule: string }[];
  existante: AffectationResultat | null;
}

// ---------------------------------------------------------------------------
// GROUPE D'ÉTABLISSEMENTS · forme de retour de
// `GroupeService.balanceAgregee` (GET /groupe/balance-agregee), qui fait foi.
// Une même personne morale tenue en plusieurs dossiers : l'agrégat n'est donc
// pas une simple addition, il ÉLIMINE les opérations réciproques. L'AUDCIF
// art. 22, 1° exige que les données « puissent être restituées sur papier ou
// sous une forme directement intelligible » · un agrégat dont on ne voit pas
// ce qui a été retiré, ni ce qui n'a pas été confirmé, n'est pas restitué.
// ---------------------------------------------------------------------------

/**
 * Une ligne SORTIE de l'agrégat. Le D4C énumère ce que la réunion des comptes
 * suppose : « élimination des comptes réciproques (actifs/passifs,
 * charges/produits) ; neutralisation des résultats provenant d'opérations
 * entre entités du périmètre » (AUDCIF, ch. XIII-4, section 1).
 */
export interface EliminationReciproqueGroupe {
  dossier: string;
  /** Le ou les dossiers du groupe mis en face par l'écriture. */
  contrepartie: string;
  numero: string;
  intitule: string;
  /** « Créance ou dette réciproque » ou « Charge ou produit réciproque ». */
  motif: string;
  debit: number;
  credit: number;
}

/**
 * Une réciprocité QUI NE SE BOUCLE PAS · la créance chez l'un ne répond pas à
 * la dette chez l'autre. Le D4C fait de la « procédure de
 * confirmation de solde pour toutes les opérations » (AUDCIF, ch. XII-5,
 * section 2) le préalable de toute élimination intra-groupe : l'écart dit
 * que cette confirmation a échoué. Il est nommé, jamais corrigé d'office.
 */
export interface EcartReciprociteGroupe {
  dossier: string;
  contrepartie: string;
  solde: number;
  soldeContrepartie: number;
  ecart: number;
}

/**
 * Un tiers rattaché à un dossier qui n'appartient PAS à ce groupe · rien n'a
 * été éliminé sur sa foi. Éliminer aurait retiré de l'agrégat une opération
 * réellement externe.
 */
export interface RattachementRefuseGroupe {
  dossier: string;
  codeTiers: string;
  nomTiers: string;
  motif: string;
}

/** Les huit contrôles qui accompagnent l'agrégat · une agrégation sans contrôle est un piège. */
export interface ControlesAgregatGroupe {
  ecartLiaison: number;
  liaisonNeutralisee: boolean;
  tousEquilibres: boolean;
  periodesConcordantes: boolean;
  reciprocitesEquilibrees: boolean;
  ecartElimination: number;
  eliminationsSymetriques: boolean;
  rattachementsValides: boolean;
}

export interface BalanceAgregeeGroupe {
  exercice: { id: string; dateDebut: string; dateFin: string };
  dossiers: Array<{
    id: string;
    nom: string;
    estMere: boolean;
    totalDebit: number;
    totalCredit: number;
    solde58: number;
    equilibre: boolean;
  }>;
  /** Cellule dont l'exercice MANQUE sur la période · ses chiffres sont absents. */
  cellulesSansExercice: Array<{ id: string; nom: string }>;
  /** Cellule dont l'exercice existe mais ne couvre pas la période · écartée elle aussi. */
  cellulesPeriodeDiscordante: Array<{ id: string; nom: string; dateDebut: string; dateFin: string }>;
  /** Le cumul NET des éliminations · c'est lui qui se réimporte en dossier de combinaison. */
  lignes: Array<{ numero: string; intitule: string; totalDebit: number; totalCredit: number; solde: number }>;
  totaux: { debit: number; credit: number };
  eliminations: EliminationReciproqueGroupe[];
  totauxEliminations: { debit: number; credit: number };
  ecartsReciprocite: EcartReciprociteGroupe[];
  rattachementsRefuses: RattachementRefuseGroupe[];
  /** Ce que l'agrégat ne SAIT pas faire et refuse d'inventer (cession interne, marge en stock). */
  avertissements: string[];
  controles: ControlesAgregatGroupe;
  /** Le cumul BRUT dossier par dossier · agrégat = détail par dossier moins éliminations. */
  detailParDossier: Array<{ dossier: string; numero: string; intitule: string; totalDebit: number; totalCredit: number }>;
}

// --------------------------------------------------------------------------
// File des courriels · module `courrier` du serveur
// --------------------------------------------------------------------------

/**
 * Les cinq états de l'énumération Prisma `StatutMessage` (migration
 * 20260914180000_file_des_courriels). Recopiés ici parce que le client ne
 * dépend pas de `@prisma/client` · toute valeur ajoutée côté serveur doit
 * l'être ici, faute de quoi l'écran de suivi afficherait un état muet.
 */
export type StatutMessage = 'EN_ATTENTE' | 'SANS_TRANSPORT' | 'ENVOYE' | 'ECHEC' | 'ABANDONNE';

/**
 * Une ligne de la file, telle que `GET /courrier` la rend · SANS son corps.
 * Ce n'est pas une troncature : un rappel fait plusieurs milliers de
 * caractères, et le serveur le garde ENTIER pour `GET /courrier/:id`
 * (CHAMPS_LISTE, courrier.service.ts). Les dates arrivent en ISO.
 */
export interface MessageEnFile {
  id: string;
  destinataire: string;
  destinataireNom: string | null;
  sujet: string;
  /** « RELANCE », « MOT_DE_PASSE_TEMPORAIRE »… · ce qui a demandé ce message. */
  origine: string;
  /** Clé de la pièce d'origine quand elle en a une. */
  origineId: string | null;
  statut: StatutMessage;
  tentatives: number;
  dernierEssaiAt: string | null;
  prochainEssaiAt: string | null;
  /** Dernière erreur rendue par le transport, telle quelle. */
  erreur: string | null;
  envoyeAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** `GET /courrier/:id` · la ligne entière, corps compris. */
export interface MessageComplet extends MessageEnFile {
  tenantId: string;
  corps: string;
}

/** `GET /courrier` · une tranche, qui DIT qu'elle en est une (CLAUDE.md § 8 bis). */
export interface FileMessages {
  messages: MessageEnFile[];
  total: number;
  plafond: number;
  tronque: boolean;
}

/**
 * Une variable d'environnement nécessaire qui manque. Le serveur ne rend
 * jamais de VALEUR, seulement des noms · voir transport-courriel.ts.
 */
export interface ManqueTransport {
  variable: string;
  raison: string;
}

/** `GET /courrier/transport` · « la messagerie est-elle posée ? », et sinon quoi. */
export interface EtatTransportCourriel {
  configure: boolean;
  manques: ManqueTransport[];
  /** Adresse sous laquelle le courrier partira · `null` tant que rien n'est posé. */
  expediteur: string | null;
}

/**
 * `GET /courrier/compteurs` · les cinq états sont TOUJOURS présents, même à
 * zéro. `aRelancer` est ce que le bouton de reprise traiterait à l'instant.
 */
export type CompteursCourrier = Record<StatutMessage, number> & { aRelancer: number };

/** `POST /courrier/reprendre` · ce que le passage a fait, et ce qu'il laisse. */
export interface BilanRepriseCourrier {
  transportConfigure: boolean;
  manques: ManqueTransport[];
  examines: number;
  envoyes: number;
  echoues: number;
  abandonnes: number;
  /** Non traités · repris par un autre appel, ou ligne disparue entre-temps. */
  ignores: number;
  /** Encore à reprendre après ce passage · l'écran propose de continuer. */
  restants: number;
}

// ---------------------------------------------------------------------------
// ENGAGEMENTS DE DÉPENSE · les deux termes NON COMPTABLES de la colonne
// Engagement du tableau d'exécution budgétaire (SYCEBNL, Guide d'application,
// ch. 7, APPLICATION 22, règle (d)).
// ---------------------------------------------------------------------------

export type NatureEngagement = 'BON_DE_COMMANDE' | 'CONTRAT';
export type StatutEngagement = 'OUVERT' | 'CLOS';

export interface ExecutionEngagement {
  id: string;
  montant: number;
  ecriture: {
    id: string;
    date: string;
    numeroPiece: number | null;
    libelle: string;
    statut: StatutEcriture;
  };
}

export interface EngagementDepense {
  id: string;
  nature: NatureEngagement;
  reference: string;
  objet: string;
  beneficiaire: string;
  date: string;
  montant: number;
  statut: StatutEngagement;
  motifCloture: string | null;
  section: { id: string; code: string; intitule: string };
  montantExecute: number;
  /** Ce qui pèse ENCORE sur le budget · jamais le montant entier. */
  resteAExecuter: number;
  executions: ExecutionEngagement[];
}

export interface EcritureRattachable {
  id: string;
  date: string;
  numeroPiece: number | null;
  libelle: string;
  reference: string | null;
}

// ---------------------------------------------------------------------------
// CONVENTIONS DE FINANCEMENT · le dossier de subvention.
//
// SYCEBNL, cadre conceptuel § 5.4.2.4 : le caractère de l'engagement commande
// le traitement · créance à recevoir d'un côté, mention de Notes annexes de
// l'autre.
// ---------------------------------------------------------------------------

export type CaractereEngagement = 'FERME_INCONDITIONNEL' | 'CONDITIONNEL';
export type StatutConvention = 'EN_COURS' | 'CLOTUREE' | 'RESILIEE';
export type NatureRapportBailleur = 'FINANCIER' | 'NARRATIF' | 'AUDIT';
export type TraitementEngagement = 'CREANCE_A_RECEVOIR' | 'MENTION_NOTES_ANNEXES';

export interface TrancheFinancement {
  id: string;
  numero: number;
  libelle: string;
  montant: number;
  datePrevue: string;
  dateEncaissement: string | null;
  montantEncaisse: number | null;
  enRetard: boolean;
}

export interface RapportBailleur {
  id: string;
  intitule: string;
  nature: NatureRapportBailleur;
  dateEcheance: string;
  dateTransmission: string | null;
  observation: string | null;
  enRetard: boolean;
}

export interface ConventionFinancement {
  id: string;
  bailleur: { id: string; code: string; nom: string };
  reference: string;
  objet: string;
  ecritSigne: boolean;
  signataire: string | null;
  dateSignature: string | null;
  dateDebut: string;
  dateFin: string;
  montantAccorde: number;
  caractere: CaractereEngagement;
  conditions: string | null;
  statut: StatutConvention;
  motifCloture: string | null;
  /** Ce que le § 5.4.2.4 autorise · créance, ou simple mention. */
  traitement: TraitementEngagement;
  montantEncaisse: number;
  resteARecevoir: number;
  /** Validité dépassée · ce que le jalon 11 du planning demande de vérifier. */
  expiree: boolean;
  tranches: TrancheFinancement[];
  rapports: RapportBailleur[];
}

/**
 * Ce que `GET /fiscalite/exemption-is` rend · la qualification du FONDEMENT de
 * l'exemption d'impôt sur les sociétés d'une entité à but non lucratif, telle
 * que le serveur la pose (src/modules/fiscalite/exemption-is-ebnl.ts).
 *
 * Elle vivait depuis sa création dans une charge utile que AUCUN ÉCRAN
 * n'appelait : la route existait, cloisonnée au SYCEBNL, et les avertissements
 * qu'elle produit n'atteignaient personne. Une correction qui n'atteint pas un
 * écran n'est pas livrée.
 */
export type QualificationExemptionIs = {
  fondement:
    | 'ART_5_POINT_3'
    | 'ART_5_POINT_5'
    | 'ART_5_POINT_3_OU_POINT_5'
    | 'HORS_LOI_004_2001'
    | 'INDETERMINE';
  enonce: string;
  /** NULL n'est pas « non » · le fondement n'est simplement pas qualifiable. */
  attestationRequise: boolean | null;
  attestationConnue: boolean;
  dateAttestationConnue: boolean;
  /** FAUX ne veut pas dire « imposable » · voir l'énoncé. */
  exemptionAffirmable: boolean;
  avertissements: string[];
};

/**
 * Ce que rendent `/ecritures/valider` et `/ecritures/valider-jusqua`.
 *
 * NOMMÉ plutôt qu'écrit en anonyme à chaque appel : les deux appelants
 * doivent lire les MÊMES compteurs, et l'un d'eux qui oublierait
 * `refuseesSecondRegard` annoncerait une période centralisée alors qu'elle
 * ne l'est pas.
 */
export type ResultatValidation = {
  validees: number;
  dejaValidees: number;
  /** Écartées parce que leur auteur est celui qui valide · double regard. */
  refuseesSecondRegard: number;
  /** Validées sous le visa nominatif d'un second regard exercé hors logiciel. */
  sousDerogation: number;
  /** La phrase sourcée à servir, aiguillée sur le référentiel du dossier. */
  motifRefus: string | null;
};

/**
 * INVENTAIRE PHYSIQUE · AUDCIF art. 42, non écarté par l'art. 3 du SYCEBNL.
 * Les montants arrivent en chaîne (Decimal Prisma) · les convertir à
 * l'affichage, jamais les additionner tels quels.
 */
export interface FicheInventaire {
  id: string;
  designation: string;
  emplacement: string | null;
  uniteMesure: string | null;
  quantiteComptee: string | null;
  valeurInventaire: string | null;
  referencePiece: string | null;
  compte: { numero: string; intitule: string };
}

export interface EcartInventaire {
  id: string;
  valeurInventaire: string;
  soldeComptable: string;
  ecart: string;
  nombreFiches: number;
  decision: 'A_REDRESSER' | 'EXPLIQUE' | 'EXCEDENT_NON_COMPTABILISE' | 'RENVOYE_COMMISSION_PRINCIPALE' | null;
  responsable: string | null;
  explication: string | null;
  compte: { numero: string; intitule: string };
}

export interface CampagneInventaire {
  id: string;
  exerciceId: string;
  libelle: string;
  dateInventaire: string;
  instructions: string | null;
  statut: 'PREPARATION' | 'RECENSEMENT' | 'ARBITRAGE' | 'CLOTUREE';
  procesVerbalEtabliLe: string | null;
  clotureeLe: string | null;
  fiches?: FicheInventaire[];
  ecarts?: EcartInventaire[];
  /** Le texte que le dossier encourt · AUDCIF art. 111 ou SYCEBNL art. 24. */
  sanction?: { texte: string; article: string };
}

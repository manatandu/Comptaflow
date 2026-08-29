export type Referentiel = 'SYCEBNL' | 'SYSCOHADA';
/**
 * N'a de sens que si `Referentiel` = 'SYCEBNL' (le SYSCOHADA n'a qu'un seul
 * jeu). SYCEBNL en prévoit 3 (Partie 4, ch. 2 à 4 du texte officiel), et les
 * trois sont désormais construits. Le Système Minimal de Trésorerie n'est
 * toutefois pas un choix libre : l'article 6 le réserve aux entités dont
 * chacune des cinq catégories de ressources annuelles reste sous 30 000 000
 * FCFA, l'article 5 posant que le Système normal est la règle.
 */
export type JeuEtatsFinanciersSycebnl =
  | 'ASSOCIATIONS_ORDRES_PROFESSIONNELS'
  | 'PROJETS_DEVELOPPEMENT'
  | 'SYSTEME_MINIMAL_TRESORERIE';
export type RoleUtilisateur = 'ADMIN_CABINET' | 'COMPTABLE' | 'LECTURE_SEULE';

export interface Utilisateur {
  id: string;
  email: string;
  role: RoleUtilisateur;
  estActif: boolean;
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
  accessToken: string;
}

// Types de tiers du SYCEBNL : le compte 41 « Adhérents, clients-usagers et
// comptes rattachés » couvre deux populations que le texte officiel
// subdivise (411 Adhérents, 412 Clients-usagers). Voir prisma/schema.prisma.
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
  net: number;
  sens: 'A_PAYER' | 'CREDIT';
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
  jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl;
  activite: string | null;
  adresse: string | null;
  ville: string | null;
  pays: string | null;
  telephone: string | null;
  devise: string | null;
  /** Identifiants légaux congolais · CPCC, § 7.4 règle 7-a. */
  numeroImpot: string | null;
  idNat: string | null;
  rccm: string | null;
  formeJuridique: FormeJuridiqueEbnl;
  droitEtranger: boolean;
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
  /** Au-delà de zéro, le jeu d'états financiers est verrouillé. */
  nombreEcritures: number;
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

export interface VentilationAnalytique {
  id: string;
  sectionId: string;
  planId: string;
  debit: number;
  credit: number;
  section: { id: string; code: string; intitule: string; planId: string };
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
  lignes: { date: string; echeance: string | null; libelle: string; montant: number; retardJours: number }[];
}

export interface LettreRelance {
  compteId: string;
  tiers: string;
  montant: number;
  texte: string;
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
  note3: {
    creances: LigneCreanceDetteSmt[];
    totalCreances: number;
    dettes: LigneCreanceDetteSmt[];
    totalDettes: number;
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
  montantCloture: number;
  montantOuverture: number;
  variationValeur: number;
  variationPourcent: number | null;
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
  reverse: number;
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

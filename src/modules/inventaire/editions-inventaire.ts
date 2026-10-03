import { DecisionEcartInventaire, ModeComparaisonCaisse, RoleMembreInventaire, StatutCampagneInventaire } from '@prisma/client';

/**
 * LES ÉDITIONS DE L'INVENTAIRE (ligne A19, relevé CPCC C16) · fiches de
 * comptage vierges, procès-verbal d'inventaire physique, procès-verbal de
 * comptage d'une caisse.
 *
 * CE QUE LES TEXTES DEMANDENT, ET RIEN DE PLUS.
 *
 *  - AUDCIF art. 16, al. 6 (non écarté par l'art. 3 du SYCEBNL, dont la liste
 *    d'exclusion passe de « 10 à 13 » à « 17 alinéas 7 et 8 » · il vaut aux
 *    deux) · « L'entité procède à l'opération
 *    d'inventaire par le relevé physique de tous les éléments de son
 *    patrimoine avec la mention de la NATURE, de la QUANTITÉ et de la VALEUR
 *    de chacun d'eux à la date de l'inventaire. » D'où les trois colonnes à
 *    remplir de la fiche vierge et du relevé du procès-verbal.
 *  - AUDCIF art. 16, al. 7 · « Les données d'inventaire sont organisées et
 *    conservées de manière à justifier le contenu de chacun des éléments
 *    recensés du patrimoine. » D'où la pièce de référence et le lieu.
 *  - Séminaire du CPCC (Organisation et exécution des travaux de fin
 *    d'exercice, témoin et non source) · « inscription sur des fiches
 *    appropriées PRÉPARÉES D'AVANCE » (§ IV), « préparer les fiches par
 *    catégorie de biens » (étape 1), « Si les fiches n'existent pas, les
 *    préparer avant que l'inventaire ne débute » et « L'établissement d'un PV
 *    d'inventaire physique, signé par ceux qui ont inventorié et assisté, est
 *    nécessaire » (étape 2), « par référence à la pièce justificative
 *    d'acquisition » (étape 3), « Les procès-verbaux de comptage ont-ils été
 *    analysés ? » (§ VI, Caisses).
 *
 * CE QU'AUCUN TEXTE NE FIXE · la mise en page, l'ordre des lignes, le
 * regroupement par sous-commission puis par lieu. Ce sont des DÉFINITIONS
 * D'OMEGAX, dites dans la bulle d'aide de l'écran. Le contenu, lui, n'est que
 * ce que la campagne porte déjà · rien n'est recalculé ici qui ne soit un
 * total de ce qui est enregistré, et ce qui n'est pas renseigné se DIT (null,
 * jamais zéro ni chaîne vide).
 *
 * LES SIGNATURES RESTENT BLANCHES · le PV « signé par ceux qui ont inventorié
 * et assisté » se signe à la main. L'édition nomme les signataires (les
 * membres enregistrés de la sous-commission, chacun dans son rôle) et laisse
 * la place de la signature vide · un logiciel qui la préremplirait ferait
 * signer quelqu'un d'autre (même parti que `BlocCertification`).
 *
 * LE PV DE CAISSE N'EST PAS RECALCULÉ · solde figé, reconstitution, unité et
 * MENTIONS viennent de `InventaireService.presenterPvCaisse` (ligne A10), la
 * même lecture que l'écran. L'ATTESTATION reste un fait (date, signataire) ·
 * aucune source lue n'en définit le contenu (voir le schéma), l'édition n'en
 * invente pas le texte.
 */

export const TITRE_FICHES_DE_COMPTAGE = 'Fiches de comptage';
export const TITRE_PV_INVENTAIRE = "Procès-verbal d'inventaire physique";
export const TITRE_PV_CAISSE = 'Procès-verbal de comptage de caisse';

/** Les colonnes que la commission remplit · art. 16, al. 6 et étape 3 du CPCC. */
export const COLONNES_A_REMPLIR = ["Quantité comptée", "Valeur d'inventaire", 'Pièce de référence'] as const;

const LIEU_NON_RENSEIGNE = 'Lieu non renseigné';

export interface MembreEdition {
  nom: string;
  fonction: string | null;
}

export interface SousCommissionEdition {
  id: string;
  nom: string;
  perimetre: string | null;
  /** « ceux qui ont inventorié » (CPCC, étape 2). */
  inventoriants: MembreEdition[];
  /** « et assisté » (CPCC, étape 2). */
  temoins: MembreEdition[];
}

export interface CampagneEdition {
  id: string;
  libelle: string;
  dateInventaire: Date;
  statut: StatutCampagneInventaire;
  instructions: string | null;
  exercice: { dateDebut: Date; dateFin: Date; dateArreteComptes: Date | null };
}

// --- Entrées ----------------------------------------------------------------

export interface MembreLu {
  nom: string;
  fonction: string | null;
  role: RoleMembreInventaire;
}

export interface SousCommissionLue {
  id: string;
  nom: string;
  perimetre: string | null;
  membres: MembreLu[];
}

export interface FicheLue {
  id: string;
  designation: string;
  emplacement: string | null;
  uniteMesure: string | null;
  quantiteComptee: unknown;
  valeurInventaire: unknown;
  referencePiece: string | null;
  sousCommissionId: string | null;
  compte: { numero: string; intitule: string };
}

export interface EcartLu {
  compte: { numero: string; intitule: string };
  valeurInventaire: unknown;
  soldeComptable: unknown;
  ecart: unknown;
  nombreFiches: number;
  rapprocheLe: Date;
  decision: DecisionEcartInventaire | null;
  responsable: string | null;
  explication: string | null;
  arbitreLe: Date | null;
}

// --- Aides --------------------------------------------------------------------

/** Un Decimal, un nombre ou null · null reste null, jamais zéro. */
const nombreOuNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Somme au centime · des valeurs monétaires additionnées en flottant dérivent. */
const sommeAuCentime = (valeurs: number[]): number => Math.round(valeurs.reduce((t, v) => t + Math.round(v * 100), 0)) / 100;

const libelleCompte = (c: { numero: string; intitule: string }) => `${c.numero} · ${c.intitule}`;

/** Les membres d'une sous-commission, rangés par rôle, dans l'ordre d'enregistrement. */
export function sousCommissionPourEdition(sc: SousCommissionLue): SousCommissionEdition {
  const membre = (m: MembreLu): MembreEdition => ({ nom: m.nom, fonction: m.fonction });
  return {
    id: sc.id,
    nom: sc.nom,
    perimetre: sc.perimetre,
    inventoriants: sc.membres.filter((m) => m.role === RoleMembreInventaire.INVENTORIANT).map(membre),
    temoins: sc.membres.filter((m) => m.role === RoleMembreInventaire.TEMOIN).map(membre),
  };
}

/**
 * L'ORDRE DES LIGNES · lieu, puis compte, puis désignation (définition
 * d'OmegaX). On compte sur place, lieu après lieu · « ranger adéquatement les
 * biens à compter » (CPCC, étape 1) ; un lieu non renseigné passe en dernier,
 * sous son nom, et ne se confond avec aucun autre.
 */
function comparerFiches(a: FicheLue, b: FicheLue): number {
  const la = a.emplacement?.trim() || null;
  const lb = b.emplacement?.trim() || null;
  if (la !== lb) {
    if (la === null) return 1;
    if (lb === null) return -1;
    const c = la.localeCompare(lb, 'fr');
    if (c !== 0) return c;
  }
  return a.compte.numero.localeCompare(b.compte.numero) || a.designation.localeCompare(b.designation, 'fr');
}

// --- 1. Fiches de comptage vierges ----------------------------------------

export interface LigneFicheVierge {
  ficheId: string;
  designation: string;
  compte: string;
  lieu: string;
  unite: string | null;
}

export interface SectionFichesVierges {
  /** Null · les fiches que la campagne n'a confiées à aucune sous-commission. */
  sousCommission: SousCommissionEdition | null;
  lignes: LigneFicheVierge[];
}

export interface EditionFichesVierges {
  nature: 'FICHES_DE_COMPTAGE';
  titre: string;
  campagne: CampagneEdition;
  /** Le périmètre se DIT · une édition partielle ne se lit jamais comme le tout. */
  perimetre: string;
  colonnesARemplir: readonly string[];
  sections: SectionFichesVierges[];
  nombreFiches: number;
  /** Fiches déjà comptées ou valorisées · la feuille reste vierge, le nombre le dit. */
  dejaComptees: number;
}

/**
 * LES FICHES PRÉPARÉES D'AVANCE · une section par sous-commission (celle qui
 * va compter), les lignes rangées par lieu. Les trois colonnes de l'art. 16,
 * al. 6 que la commission remplit (quantité, valeur, pièce) restent VIDES,
 * même sur une fiche déjà saisie · c'est une feuille de comptage, pas un
 * relevé, et le nombre de fiches déjà comptées est dit en tête pour qu'une
 * feuille de recomptage ne passe pas pour un premier comptage.
 *
 * `sousCommissionId` restreint l'édition à une sous-commission · inconnue de
 * la campagne, l'appelant la refuse avant (jamais une feuille vide qui se
 * lirait « rien à compter »).
 */
export function editionFichesVierges(entree: {
  campagne: CampagneEdition;
  sousCommissions: SousCommissionLue[];
  fiches: FicheLue[];
  sousCommissionId?: string | null;
}): EditionFichesVierges {
  const restreinte = entree.sousCommissionId
    ? entree.sousCommissions.filter((sc) => sc.id === entree.sousCommissionId)
    : [...entree.sousCommissions].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const fiches = entree.sousCommissionId
    ? entree.fiches.filter((f) => f.sousCommissionId === entree.sousCommissionId)
    : entree.fiches;

  const ligne = (f: FicheLue): LigneFicheVierge => ({
    ficheId: f.id,
    designation: f.designation,
    compte: libelleCompte(f.compte),
    lieu: f.emplacement?.trim() || LIEU_NON_RENSEIGNE,
    unite: f.uniteMesure,
  });
  const sections: SectionFichesVierges[] = restreinte.map((sc) => ({
    sousCommission: sousCommissionPourEdition(sc),
    lignes: fiches.filter((f) => f.sousCommissionId === sc.id).sort(comparerFiches).map(ligne),
  }));
  // Une fiche confiée à une sous-commission qui n'est pas listée (autre
  // campagne, retirée) tombe avec celles qui n'en ont pas · elle n'est jamais
  // perdue en silence.
  const connues = new Set(restreinte.map((sc) => sc.id));
  const orphelines = entree.sousCommissionId
    ? []
    : fiches.filter((f) => !f.sousCommissionId || !connues.has(f.sousCommissionId));
  if (orphelines.length > 0) {
    sections.push({ sousCommission: null, lignes: orphelines.sort(comparerFiches).map(ligne) });
  }

  const nombreFiches = sections.reduce((t, s) => t + s.lignes.length, 0);
  const dejaComptees = fiches.filter((f) => f.quantiteComptee != null || f.valeurInventaire != null).length;
  const quoi = entree.sousCommissionId
    ? `Sous-commission « ${restreinte[0]?.nom ?? ''} »`
    : 'Toutes les sous-commissions';
  const perimetre =
    `${quoi} · ${nombreFiches} fiche${nombreFiches > 1 ? 's' : ''}` +
    (dejaComptees > 0 ? ` · dont ${dejaComptees} déjà comptée${dejaComptees > 1 ? 's' : ''} (feuille de recomptage)` : '');

  return {
    nature: 'FICHES_DE_COMPTAGE',
    titre: TITRE_FICHES_DE_COMPTAGE,
    campagne: entree.campagne,
    perimetre,
    colonnesARemplir: COLONNES_A_REMPLIR,
    sections,
    nombreFiches,
    dejaComptees,
  };
}

// --- 2. Procès-verbal d'inventaire physique -------------------------------

export interface LigneReleve {
  designation: string;
  compte: string;
  lieu: string;
  unite: string | null;
  /** Null · pas encore compté, jamais zéro. */
  quantite: number | null;
  /** Null · pas encore valorisé, jamais zéro. */
  valeur: number | null;
  piece: string | null;
  sousCommission: string | null;
}

export interface TotalCompte {
  compte: string;
  nombreFiches: number;
  /** Null dès qu'une fiche du compte n'est pas valorisée · un total partiel n'est pas un total. */
  valeurInventaire: number | null;
  nonValorisees: number;
}

export interface EcartEdition {
  compte: string;
  valeurInventaire: number;
  soldeComptable: number;
  ecart: number;
  sens: 'MANQUANT' | 'EXCEDENT' | 'SANS_ECART';
  nombreFiches: number;
  rapprocheLe: Date;
  decision: DecisionEcartInventaire | null;
  responsable: string | null;
  explication: string | null;
  arbitreLe: Date | null;
}

export interface CaisseCompteeEdition {
  pvId: string;
  caisse: string;
  dateComptage: Date;
  heureComptage: string | null;
  sousCommission: string;
  unite: string | null;
  especesComptees: number;
  soldeComptable: number;
  ecart: number;
}

export interface Signataire extends MembreEdition {
  sousCommission: string;
}

export interface EditionPvInventaire {
  nature: 'PROCES_VERBAL_INVENTAIRE';
  titre: string;
  campagne: CampagneEdition;
  /** Null · le PV n'est pas établi dans OmegaX, et l'édition le dit en tête. */
  etabli: { le: Date; par: string } | null;
  sousCommissions: SousCommissionEdition[];
  releve: LigneReleve[];
  totauxParCompte: TotalCompte[];
  /** Vide tant que la campagne n'est pas rapprochée · `rapprochee` le dit. */
  rapprochee: boolean;
  ecarts: EcartEdition[];
  caisses: CaisseCompteeEdition[];
  /** « signé par ceux qui ont inventorié et assisté » · signatures laissées blanches. */
  signataires: { inventoriants: Signataire[]; temoins: Signataire[] };
  /** Ce qui manque au document, dit sur le document (§ 9 ter, null n'est pas vide). */
  mentions: string[];
}

export interface PvCaisseLuPourResume {
  id: string;
  dateComptage: Date;
  heureComptage: string | null;
  especesComptees: unknown;
  soldeComptableFige: unknown;
  ecart: unknown;
  compte: { numero: string; intitule: string };
  sousCommission: { nom: string };
  unite: string | null;
}

/**
 * LE PROCÈS-VERBAL D'INVENTAIRE PHYSIQUE d'une campagne, tiré de ce qu'elle
 * porte · le relevé (nature, quantité, valeur de chaque élément, art. 16,
 * al. 6), les totaux par compte, les écarts FIGÉS au rapprochement et leur
 * décision (CPCC, étapes 4 et 5), les caisses comptées (chacune a SON PV,
 * l'édition y renvoie), et les signataires.
 */
export function editionPvInventaire(entree: {
  campagne: CampagneEdition;
  etabli: { le: Date; par: string } | null;
  sousCommissions: SousCommissionLue[];
  fiches: FicheLue[];
  ecarts: EcartLu[];
  pvCaisses: PvCaisseLuPourResume[];
}): EditionPvInventaire {
  const sousCommissions = [...entree.sousCommissions]
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    .map(sousCommissionPourEdition);
  const nomSc = new Map(entree.sousCommissions.map((sc) => [sc.id, sc.nom]));

  const fiches = [...entree.fiches].sort(comparerFiches);
  const releve: LigneReleve[] = fiches.map((f) => ({
    designation: f.designation,
    compte: libelleCompte(f.compte),
    lieu: f.emplacement?.trim() || LIEU_NON_RENSEIGNE,
    unite: f.uniteMesure,
    quantite: nombreOuNull(f.quantiteComptee),
    valeur: nombreOuNull(f.valeurInventaire),
    piece: f.referencePiece,
    sousCommission: f.sousCommissionId ? (nomSc.get(f.sousCommissionId) ?? null) : null,
  }));

  const parCompte = new Map<string, { compte: string; valeurs: (number | null)[] }>();
  for (const f of fiches) {
    const acc = parCompte.get(f.compte.numero) ?? { compte: libelleCompte(f.compte), valeurs: [] };
    acc.valeurs.push(nombreOuNull(f.valeurInventaire));
    parCompte.set(f.compte.numero, acc);
  }
  const totauxParCompte: TotalCompte[] = [...parCompte.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => {
      const nonValorisees = v.valeurs.filter((x) => x === null).length;
      return {
        compte: v.compte,
        nombreFiches: v.valeurs.length,
        valeurInventaire: nonValorisees > 0 ? null : sommeAuCentime(v.valeurs as number[]),
        nonValorisees,
      };
    });

  const ecarts: EcartEdition[] = [...entree.ecarts]
    .sort((a, b) => a.compte.numero.localeCompare(b.compte.numero))
    .map((e) => {
      const ecart = Number(e.ecart);
      return {
        compte: libelleCompte(e.compte),
        valeurInventaire: Number(e.valeurInventaire),
        soldeComptable: Number(e.soldeComptable),
        ecart,
        sens: ecart < 0 ? 'MANQUANT' : ecart > 0 ? 'EXCEDENT' : 'SANS_ECART',
        nombreFiches: e.nombreFiches,
        rapprocheLe: e.rapprocheLe,
        decision: e.decision,
        responsable: e.responsable,
        explication: e.explication,
        arbitreLe: e.arbitreLe,
      };
    });
  const rapprochee =
    entree.campagne.statut === StatutCampagneInventaire.ARBITRAGE ||
    entree.campagne.statut === StatutCampagneInventaire.CLOTUREE;

  const caisses: CaisseCompteeEdition[] = [...entree.pvCaisses]
    .sort((a, b) => a.compte.numero.localeCompare(b.compte.numero))
    .map((p) => ({
      pvId: p.id,
      caisse: libelleCompte(p.compte),
      dateComptage: p.dateComptage,
      heureComptage: p.heureComptage,
      sousCommission: p.sousCommission.nom,
      unite: p.unite,
      especesComptees: Number(p.especesComptees),
      soldeComptable: Number(p.soldeComptableFige),
      ecart: Number(p.ecart),
    }));

  const signataires = { inventoriants: [] as Signataire[], temoins: [] as Signataire[] };
  for (const sc of sousCommissions) {
    for (const m of sc.inventoriants) signataires.inventoriants.push({ ...m, sousCommission: sc.nom });
    for (const m of sc.temoins) signataires.temoins.push({ ...m, sousCommission: sc.nom });
  }

  const mentions: string[] = [];
  if (!entree.etabli) mentions.push('Procès-verbal non établi dans OmegaX · document de travail.');
  if (signataires.inventoriants.length === 0) mentions.push('Aucun inventoriant enregistré.');
  if (signataires.temoins.length === 0) mentions.push('Aucun témoin enregistré.');
  const nonComptees = releve.filter((l) => l.quantite === null).length;
  if (nonComptees > 0) mentions.push(`${nonComptees} fiche${nonComptees > 1 ? 's' : ''} sans quantité comptée.`);
  const nonValorisees = releve.filter((l) => l.valeur === null).length;
  if (nonValorisees > 0) mentions.push(`${nonValorisees} fiche${nonValorisees > 1 ? 's' : ''} sans valeur d'inventaire.`);
  if (!rapprochee) mentions.push('Écarts non encore rapprochés de la balance.');
  const sansDecision = ecarts.filter((e) => e.decision === null).length;
  if (sansDecision > 0) mentions.push(`${sansDecision} écart${sansDecision > 1 ? 's' : ''} sans décision.`);

  return {
    nature: 'PROCES_VERBAL_INVENTAIRE',
    titre: TITRE_PV_INVENTAIRE,
    campagne: entree.campagne,
    etabli: entree.etabli,
    sousCommissions,
    releve,
    totauxParCompte,
    rapprochee,
    ecarts,
    caisses,
    signataires,
    mentions,
  };
}

// --- 3. Procès-verbal de comptage d'une caisse ----------------------------

/** Ce que `InventaireService.presenterPvCaisse` rend, et que l'édition reprend tel quel. */
export interface PvCaissePresente {
  id: string;
  dateComptage: Date;
  heureComptage: string | null;
  especesComptees: unknown;
  soldeComptableFige: unknown;
  ecart: unknown;
  soldeALaCloture: unknown;
  mouvementsValeurAvantCloture: unknown;
  encaissementsPosterieurs: unknown;
  decaissementsPosterieurs: unknown;
  mouvementsPosterieurs: number | null;
  modeComparaison: ModeComparaisonCaisse;
  attestationEtablieLe: Date | null;
  attestationPar: string | null;
  observations: string | null;
  etabliLe: Date;
  coupures: { valeurUnitaire: unknown; nombre: number }[];
  compte: { numero: string; intitule: string };
  dateCloture: Date;
  unite: string | null;
  compteApresLaCloture: boolean;
  reconstitutionManquante: boolean;
  especesReconstitueesALaCloture: number | null;
  mentions: string[];
}

export interface EditionPvCaisse {
  nature: 'PROCES_VERBAL_CAISSE';
  titre: string;
  campagne: CampagneEdition;
  pvId: string;
  caisse: string;
  sousCommission: SousCommissionEdition;
  dateComptage: Date;
  heureComptage: string | null;
  /** Code de la devise quand la caisse se compare dans sa devise, sinon null (francs). */
  unite: string | null;
  modeComparaison: ModeComparaisonCaisse;
  especesComptees: number;
  soldeComptable: number;
  ecart: number;
  /** Comptée après la clôture · la reconstitution FIGÉE au PV, sinon null. */
  reconstitution: {
    dateCloture: Date;
    soldeALaCloture: number;
    mouvementsValeurAvantCloture: number | null;
    encaissementsPosterieurs: number;
    decaissementsPosterieurs: number;
    mouvementsPosterieurs: number | null;
    especesReconstitueesALaCloture: number | null;
  } | null;
  compteApresLaCloture: boolean;
  reconstitutionManquante: boolean;
  coupures: { valeurUnitaire: number; nombre: number; total: number }[];
  /** Null sans ventilation · jamais zéro. */
  totalCoupures: number | null;
  attestation: { le: Date; par: string | null } | null;
  observations: string | null;
  etabli: { le: Date; par: string };
  /** Les mentions écrites par le serveur (ligne A10), jamais recomposées. */
  mentions: string[];
}

/**
 * LE PROCÈS-VERBAL D'UNE CAISSE, tel qu'il a été figé · les chiffres et les
 * mentions sont ceux de `presenterPvCaisse`, la reconstitution n'est rendue
 * que si elle a été figée (sinon `reconstitutionManquante` le dit), les
 * signataires sont ceux de SA sous-commission.
 */
export function editionPvCaisse(entree: {
  campagne: CampagneEdition;
  pv: PvCaissePresente;
  sousCommission: SousCommissionLue;
  etabliPar: string;
}): EditionPvCaisse {
  const pv = entree.pv;
  const reconstitution =
    pv.compteApresLaCloture && pv.soldeALaCloture != null && pv.encaissementsPosterieurs != null && pv.decaissementsPosterieurs != null
      ? {
          dateCloture: pv.dateCloture,
          soldeALaCloture: Number(pv.soldeALaCloture),
          mouvementsValeurAvantCloture: nombreOuNull(pv.mouvementsValeurAvantCloture),
          encaissementsPosterieurs: Number(pv.encaissementsPosterieurs),
          decaissementsPosterieurs: Number(pv.decaissementsPosterieurs),
          mouvementsPosterieurs: pv.mouvementsPosterieurs,
          especesReconstitueesALaCloture: pv.especesReconstitueesALaCloture,
        }
      : null;
  const coupures = [...pv.coupures]
    .map((c) => {
      const valeurUnitaire = Number(c.valeurUnitaire);
      return { valeurUnitaire, nombre: c.nombre, total: Math.round(valeurUnitaire * 100 * c.nombre) / 100 };
    })
    .sort((a, b) => b.valeurUnitaire - a.valeurUnitaire);
  return {
    nature: 'PROCES_VERBAL_CAISSE',
    titre: TITRE_PV_CAISSE,
    campagne: entree.campagne,
    pvId: pv.id,
    caisse: libelleCompte(pv.compte),
    sousCommission: sousCommissionPourEdition(entree.sousCommission),
    dateComptage: pv.dateComptage,
    heureComptage: pv.heureComptage,
    unite: pv.unite,
    modeComparaison: pv.modeComparaison,
    especesComptees: Number(pv.especesComptees),
    soldeComptable: Number(pv.soldeComptableFige),
    ecart: Number(pv.ecart),
    reconstitution,
    compteApresLaCloture: pv.compteApresLaCloture,
    reconstitutionManquante: pv.reconstitutionManquante,
    coupures,
    totalCoupures: coupures.length > 0 ? sommeAuCentime(coupures.map((c) => c.total)) : null,
    attestation: pv.attestationEtablieLe ? { le: pv.attestationEtablieLe, par: pv.attestationPar } : null,
    observations: pv.observations,
    etabli: { le: pv.etabliLe, par: entree.etabliPar },
    mentions: pv.mentions,
  };
}

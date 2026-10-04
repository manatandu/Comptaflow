import { TableauxImmobilisationsPage } from './TableauxImmobilisationsPage';
import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { sousFonctionServie } from '../lib/profil-dossier';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import { PlanFiscalDegressif } from '../components/PlanFiscalDegressif';
import { ChampsLocationAcquisition } from '../components/ChampsLocationAcquisition';
import { ClotureLocationAcquisition } from '../components/ClotureLocationAcquisition';
import { RepriseSubventionImmobilisations } from '../components/RepriseSubventionImmobilisations';
import { LegsImmobilisations } from '../components/LegsImmobilisations';
import { PrixGlobalImmobilisations } from '../components/PrixGlobalImmobilisations';
import { RemplacementImprevu } from '../components/RemplacementImprevu';
import { ChampReglePar } from '../components/ChampReglePar';
import { BasculeDureeLimitee } from '../components/BasculeDureeLimitee';
import { RevisionPlanAmortissement } from '../components/RevisionPlanAmortissement';
import { CoutsEmpruntIncorpores } from '../components/CoutsEmpruntIncorpores';
import { AcquisitionPrixAleatoire, SoldeDetteAleatoire } from '../components/AcquisitionPrixAleatoire';
import { ReserveProprieteBien, BiensSousReserveDePropriete } from '../components/ReserveProprieteImmobilisations';
import { ChampsMaterielRecupere } from '../components/MaterielRecupere';
import { CriteresFraisDeveloppement } from '../components/CriteresFraisDeveloppement';
import { corpsCriteres, criteresVides } from '../lib/criteres-frais-developpement';
import { ParametresDemantelement, ProvisionDemantelement } from '../components/Demantelement';
import { ReevaluationImmobilisations } from '../components/ReevaluationImmobilisations';
import { PlafondRepriseDepreciation } from '../components/PlafondRepriseDepreciation';
import { EchangeImmobilisation } from '../components/EchangeImmobilisation';
import { EcartReevaluationSortie } from '../components/EcartReevaluationSortie';
import { DeclarationSpecialeImprimee } from '../components/DeclarationSpeciale';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import type { DeclarationSpeciale } from '../lib/reevaluation-suites';
import { corpsCreation, saisieInitiale } from '../lib/location-acquisition';
import type { Compte, FamilleImmobilisation, Immobilisation, Journal, LieuBien, TypeComposant } from '../lib/types';
import { montant } from '../lib/montants';
import { fondsPreselectionne, messageFondsProjet, type ReponseFondsProjet } from '../lib/fonds-projet-sortie';
import { LIBELLES_NATURE_SORTIE, naturesSortieOffertes, type NatureSortie } from '../lib/nature-sortie';
import {
  avertissementPetitMateriel,
  compteEnCoursInitial,
  comptesDefinitifs,
  comptesParDivision,
  contrepartiesSelonEnCours,
  modesPresents,
  type CompteDuBien,
  type ContrepartieAdmise,
  type SeuilPetitMateriel,
} from '../lib/compte-du-bien';
import { libelleExercice } from '../lib/libelle-exercice';
import {
  avertissementEcartBareme,
  avertissementPlancherLocationAcquisition,
  sectionsDuBareme,
  SOURCE_AIDE_SEUIL_IMMOBILISATION,
  texteAideSeuilImmobilisation,
  type NatureBaremeFiscal,
  naturesProposees,
  compteSelonNature,
  numerosNonProposesPourNature,
} from '../lib/bareme-fiscal';
import { contrepartieCessionProposee } from '../lib/contrepartie-cession';
import { compteUnique, motifAucunCompteRetenu, RETENUS } from '../lib/comptes-proposes';
import { usePreselectionUnique } from '../lib/preselection-unique';
import {
  lireOngletMemorise,
  memoriserOnglet,
  ongletAOuvrir,
  ongletPermis,
  type OngletImmobilisations,
  type TableauImmobilisations,
} from '../lib/onglets-immobilisations';

/**
 * Immobilisations (§3.3) : familles (gabarits, comptes + durée par défaut ·
 * voir famille-immobilisation-seed.ts pour les 6 familles seedées, ancrées
 * à l'arrêté RDC n° 013/2025), instances, dotation périodique (linéaire,
 * prorata temporis) et sortie (cession/mise hors service). Pas de gestion
 * de composants ni d'amortissement dégressif dans ce MVP (skill sycebnl :
 * la décomposition n'est de toute façon autorisée que pour des catégories
 * de biens limitées).
 */
/**
 * LA CONTREPARTIE D'UNE DÉPRÉCIATION · la liste que le serveur admet
 * (`immobilisations/comptes-du-bien.ts`). SYSCOHADA, fiche du compte 29 :
 * dotation au 691, 697 ou 853, reprise au 791, 797 ou 863 · la voie H.A.O.,
 * que le serveur sait reprendre, était inatteignable depuis l'écran (passe
 * R1, A5). Le SYCEBNL garde les 69 et 79, sa fiche n'étant pas transposée.
 */
/**
 * LES 29 DU BIEN · « les comptes 28 et 29 ont été développés selon la
 * structure des comptes de la classe 2 » (AUDCIF Titre VII ch. 2 ; même
 * découpage au SYCEBNL, 290 à 297 sous les divisions 20 à 27). La liste
 * servait les quarante comptes 29 du plan, et le serveur refusait au
 * SYSCOHADA tout autre que celui de la division du bien
 * (`motifRefusCompteDepreciation`). Sans compte de la division, tout le 29.
 */
function comptes29DuBien<C extends { numero: string }>(comptes: C[], numeroBien: string | undefined): C[] {
  const tous = comptes.filter((c) => c.numero.startsWith('29'));
  if (!numeroBien) return tous;
  const division = tous.filter((c) => c.numero.startsWith(`29${numeroBien.charAt(1)}`));
  return division.length > 0 ? division : tous;
}

function racinesContrepartieDepreciation(syscohada: boolean, sens: string): string[] {
  if (syscohada) return sens === 'DOTATION' ? ['691', '697', '853'] : ['791', '797', '863'];
  return sens === 'DOTATION' ? ['69'] : ['79'];
}

/** Les contreparties de dépréciation proposées · une seule lecture pour la liste, son message et la présélection. */
function contrepartiesDepreciation<C extends { numero: string }>(comptes: C[], syscohada: boolean, sens: string): C[] {
  const racines = racinesContrepartieDepreciation(syscohada, sens);
  return comptes.filter((c) => racines.some((r) => c.numero.startsWith(r)));
}

type VueImmobilisations = 'biens' | TableauImmobilisations;

/**
 * LES ONGLETS DE LA FENÊTRE · `const ONGLETS…` est relu par les specs des
 * titres formels. « Lieux » n'est servi qu'à l'administrateur, comme le
 * bouton qu'il remplace (`lib/onglets-immobilisations.ts`).
 */
const ONGLETS_IMMOBILISATIONS: readonly { cle: OngletImmobilisations; libelle: string }[] = [
  { cle: 'biens', libelle: 'Biens' },
  { cle: 'tableaux', libelle: 'Tableaux' },
  { cle: 'financements', libelle: 'Financements' },
  { cle: 'operations', libelle: 'Opérations' },
  { cle: 'lieux', libelle: 'Lieux' },
];

const ONGLETS_TABLEAUX: readonly { cle: TableauImmobilisations; libelle: string }[] = [
  { cle: 'immobilisations', libelle: 'Tableau des immobilisations' },
  { cle: 'amortissements', libelle: 'Tableau des amortissements' },
];

/**
 * Une seule fenêtre, rangée en onglets · les biens et ce qui porte sur l'un
 * d'eux, les deux tableaux qui les récapitulent, les financements, les
 * opérations qui ne portent pas sur un seul bien, et les lieux.
 */
export function ImmobilisationsPage({ vueInitiale = 'biens' }: { vueInitiale?: VueImmobilisations } = {}) {
  const { estAdmin, peutEcrire, utilisateur } = useAuth();
  // La mémoire est lue telle quelle · le droit se tranche à l'affichage, une
  // fois l'utilisateur connu.
  const [ongletChoisi, setOngletChoisi] = useState<OngletImmobilisations>(() => ongletAOuvrir(lireOngletMemorise(), vueInitiale, true));
  // Un onglet réservé ne s'affiche jamais à qui n'y a pas droit, même mémorisé.
  const onglet = ongletPermis(ongletChoisi, estAdmin);
  const [tableau, setTableau] = useState<TableauImmobilisations>(vueInitiale === 'biens' ? 'immobilisations' : vueInitiale);
  // UNE SAISIE NE SE PERD PAS EN CHANGEANT D'ONGLET · un panneau visité reste
  // monté, caché (`hidden`), avec ses formulaires ouverts. Seuls les tableaux
  // se relisent à chaque visite, comme avant, pour suivre une dotation passée
  // entre-temps.
  const [visites, setVisites] = useState<ReadonlySet<OngletImmobilisations>>(() => new Set<OngletImmobilisations>(['biens', onglet]));
  const choisirOnglet = (o: OngletImmobilisations) => {
    setOngletChoisi(o);
    setVisites((v) => (v.has(o) ? v : new Set([...v, o])));
    memoriserOnglet(o);
  };
  // Au SMT, la Note 1 ne connaît que le bien · ni composant ni révision
  // majeure reconstituée (lib/profil-dossier.ts). Un composant déjà porté
  // garde son bouton Renouveler.
  const composantsServis = sousFonctionServie('composants', utilisateur?.tenant);
  const revisionServie = sousFonctionServie('revision-majeure', utilisateur?.tenant);
  // Le dégressif est une option de l'impôt sur les sociétés · SYSCOHADA seul.
  const syscohada = utilisateur?.tenant.referentiel === 'SYSCOHADA';
  // Un projet de développement sort ses biens par le fonds affecté qui les a
  // financés (SYCEBNL Partie 3 ch. 3 § 2.5) · le serveur l'exige et le refuse ailleurs.
  const projetDeveloppement = utilisateur?.tenant.jeuEtatsFinanciersSycebnl === 'PROJETS_DEVELOPPEMENT';
  const [fiscalOuvertPour, setFiscalOuvertPour] = useState<string | null>(null);
  const { exerciceCourant } = useExercice();
  const [familles, setFamilles] = useState<FamilleImmobilisation[] | null>(null);
  const [immobilisations, setImmobilisations] = useState<Immobilisation[] | null>(null);
  // LISTES DE CHOIX · comptes retenus ou utilisés (`lib/comptes-proposes.ts`),
  // null tant qu'elles ne sont pas lues · une liste vide ne se dit « aucun »
  // qu'une fois lue.
  const [comptesClasse2, setComptesClasse2] = useState<Compte[] | null>(null);
  const [comptesFinancement, setComptesFinancement] = useState<Compte[] | null>(null);
  /*
    LES 29 SE LISENT DANS TOUT LE PLAN · le serveur n'admet que le 29 de la
    division du bien (`motifRefusCompteDepreciation`, « les comptes 28 et 29
    ont été développés selon la structure des comptes de la classe 2 »), et
    la première dépréciation d'un dossier est le premier mouvement de ce 29 ·
    la règle des comptes retenus viderait la liste au moment où le texte
    impose le compte. Même lecture que le 28, que `comptesDuBien` sert déjà
    dans tout le plan (critère écrit dans `listes-de-comptes.ts`).
  */
  const [comptes29, setComptes29] = useState<Compte[] | null>(null);
  const [journaux, setJournaux] = useState<Journal[]>([]);

  // Lieux des biens · référentiel du dossier (Sage Immobilisations).
  const [lieux, setLieux] = useState<LieuBien[]>([]);
  const [iLieuId, setILieuId] = useState('');
  const [afficherFormImmo, setAfficherFormImmo] = useState(false);

  const [sortieOuvertePour, setSortieOuvertePour] = useState<string | null>(null);
  const [echangeOuvertPour, setEchangeOuvertPour] = useState<string | null>(null);

  const [erreur, setErreur] = useState<string | null>(null);
  const [reconstitution, setReconstitution] = useState<{
    immobilisation: string;
    possible: boolean;
    motif?: string;
    valeurNetteEstimee?: number;
    amortissementEstime?: number;
    suite: string;
  } | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // --- formulaire immobilisation ---
  // LE COMPTE DU BIEN (compte-du-bien.ts, serveur) · il donne le 28, le 68,
  // les catégories du barème proposées et les contreparties admises.
  const [comptesBien, setComptesBien] = useState<CompteDuBien[] | null>(null);
  const [iCompteBienId, setICompteBienId] = useState('');
  const [toutesCategories, setToutesCategories] = useState(false);
  const [iModeAcquisition, setIModeAcquisition] = useState('');
  const [seuilPetit, setSeuilPetit] = useState<SeuilPetitMateriel | null>(null);
  const [iDesignation, setIDesignation] = useState('');
  const [iNumeroInventaire, setINumeroInventaire] = useState('');
  const [iDateAcquisition, setIDateAcquisition] = useState(() => new Date().toISOString().slice(0, 10));
  // Vide, le bien est acquis et pas encore en état de fonctionner (AUDCIF
  // art. 45) · aucune dotation tant que la mise en service n'est pas posée.
  const [iDateMiseEnService, setIDateMiseEnService] = useState(() => new Date().toISOString().slice(0, 10));
  // IMMOBILISATION EN COURS · décochée par défaut (décision de Manasse). Cochée,
  // le bien s'inscrit au 2x9 de sa division (serveur, immobilisation-en-cours.ts),
  // la date de mise en service reste vide et se pose à l'achèvement.
  const [iPasEncoreEnService, setIPasEncoreEnService] = useState(false);
  const [iCompteEnCoursId, setICompteEnCoursId] = useState('');
  // Mise en service · la date toujours, le journal pour un bien inscrit en cours,
  // dont la mise en service passe l'écriture qui le vire au compte définitif.
  const [miseEnServiceOuvertePour, setMiseEnServiceOuvertePour] = useState<string | null>(null);
  const [msDate, setMsDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [msJournalId, setMsJournalId] = useState('');
  // Nature du barème fiscal (arrêté n° 013/2025, art. 2) · elle PROPOSE la
  // durée, ne l'impose jamais, et l'écart se signale sans refuser.
  const [iNatureFiscale, setINatureFiscale] = useState('');
  const [bareme, setBareme] = useState<NatureBaremeFiscal[]>([]);
  // Le cadre « composant » se replie derrière sa case · un bien sur dix en
  // est un, et les champs ouverts d'office se lisaient comme obligatoires.
  const [estComposant, setEstComposant] = useState(false);
  const [iValeurOrigine, setIValeurOrigine] = useState('');
  const [iValeurResiduelle, setIValeurResiduelle] = useState('0');
  // Bien REPRIS · ce qui a été amorti avant l'entrée dans le logiciel. Zéro
  // pour un bien acquis ici, ce qui est le cas courant · d'où le champ en
  // dernier et non en évidence.
  const [iAmortissementAnterieur, setIAmortissementAnterieur] = useState('0');
  // Bien déjà au bilan d'ouverture (audit final F32) · sa fiche naît sans
  // écriture d'acquisition, le report à-nouveau portant déjà son 2x et son 28.
  const [iRepris, setIRepris] = useState(false);
  // Durée propre du bien (audit final F33) · vide, celle de la famille. Une
  // révision majeure s'amortit sur l'intervalle entre deux révisions, et
  // l'écran n'avait aucun moyen de le dire.
  const [iDuree, setIDuree] = useState('');
  // Lot 10 · incorporel à durée non limitée (AUDCIF Titre VIII ch. 2 § 4.2.2), SYSCOHADA seul.
  const [iNonLimitee, setINonLimitee] = useState(false);
  const [iJustifNonLimitee, setIJustifNonLimitee] = useState('');
  const [iNomDeDomaine, setINomDeDomaine] = useState(false);
  const [iDixAns, setIDixAns] = useState<'' | 'NON_ESTIMABLE' | 'SIMPLIFICATION_SMT'>('');
  const [basculeOuvertePour, setBasculeOuvertePour] = useState<string | null>(null);
  const [revisionPlanOuvertePour, setRevisionPlanOuvertePour] = useState<string | null>(null);
  const [coutsEmpruntOuvertsPour, setCoutsEmpruntOuvertsPour] = useState<string | null>(null);
  // Lot 15 · solde d'une dette aléatoire, réserve de propriété, matériel récupéré.
  const [soldeDetteOuvertPour, setSoldeDetteOuvertPour] = useState<string | null>(null);
  const [reserveOuvertePour, setReserveOuvertePour] = useState<string | null>(null);
  const [iReserve, setIReserve] = useState(false);
  const [sValeurRecuperee, setSValeurRecuperee] = useState('');
  const [sCompteStock, setSCompteStock] = useState('');
  const [sSourceRecuperee, setSSourceRecuperee] = useState('');
  // Lot 15 · six critères des frais de développement (211, SYSCOHADA) et
  // provision pour démantèlement d'un composant (AUDCIF Titre VIII ch. 1 et 6).
  const [iCriteresRd, setICriteresRd] = useState(criteresVides);
  const [iDateCriteresRd, setIDateCriteresRd] = useState('');
  const [iCoutFuturDem, setICoutFuturDem] = useState('');
  const [iTauxDem, setITauxDem] = useState('');
  const [provisionDemOuvertePour, setProvisionDemOuvertePour] = useState<string | null>(null);
  // MODE ET UNITÉS D'ŒUVRE (audit final F128) · vide, le bien prend le mode
  // de sa famille. Le SMT SYSCOHADA ne connaît que le linéaire (Titre X) · le
  // choix n'y est pas proposé, et le serveur le refuse aussi.
  const [iMode, setIMode] = useState<'LINEAIRE' | 'UNITES_DOEUVRE' | 'DEGRESSIF'>('LINEAIRE');
  const [iUnites, setIUnites] = useState('');
  const [iUniteLibelle, setIUniteLibelle] = useState('');
  const [iCompteContrepartie, setICompteContrepartie] = useState('');
  const [iJournalId, setIJournalId] = useState('');
  // Le contrat d'un bien pris en location-acquisition · servi quand le compte
  // du bien est un sous-compte « location-acquisition ».
  const [contratLA, setContratLA] = useState(() => saisieInitiale(new Date().toISOString().slice(0, 10)));

  // --- formulaire sortie (par immobilisation) ---
  const [sDateSortie, setSDateSortie] = useState(() => new Date().toISOString().slice(0, 10));
  const [sType, setSType] = useState<'CESSION' | 'MISE_HORS_SERVICE'>('MISE_HORS_SERVICE');
  const [sPrixCession, setSPrixCession] = useState('');
  const [sCompteContrepartie, setSCompteContrepartie] = useState('');
  // AUDCIF, Titre VII, compte 81, Exclusions · une cession « fréquente et
  // récurrente » est courante (654 / 754), une qualification de fait que le
  // logiciel demande. SYSCOHADA seul, comme au serveur.
  const [sCessionCourante, setSCessionCourante] = useState(false);
  const [sCompteFonds, setSCompteFonds] = useState('');
  // Ligne A15 · la réserve non distribuable qui reçoit l'écart (106) d'un bien
  // réévalué qui sort, demandée seulement quand le serveur l'exige.
  const [sCompteReserve, setSCompteReserve] = useState('');
  // Ligne A15 · L'ÉDITION DE LA DÉCLARATION SPÉCIALE, lue au serveur puis seule
  // imprimée (la fenêtre porte `avec-edition` tant qu'elle existe), retirée
  // après la boîte d'impression · une lecture refusée se dit, rien n'est imprimé.
  const [declaration, setDeclaration] = useState<DeclarationSpeciale | null>(null);
  const [preparationDeclaration, setPreparationDeclaration] = useState(false);
  useEffect(() => {
    const retirer = () => setDeclaration(null);
    window.addEventListener('afterprint', retirer);
    return () => window.removeEventListener('afterprint', retirer);
  }, []);
  // Fin de projet (SYCEBNL Partie 3 ch. 3 § 2.5) · la liste des fonds 162 à
  // 164 est SERVIE, lue à l'ouverture de la sortie ; null tant qu'elle n'est
  // pas lue, jamais confondu avec une liste vide.
  const [fondsProjet, setFondsProjet] = useState<ReponseFondsProjet | null>(null);
  const [erreurFondsProjet, setErreurFondsProjet] = useState<string | null>(null);
  const [sJournalId, setSJournalId] = useState('');
  // Ligne A14 · nature de la sortie et pièce qui la justifie (AUDCIF art. 17,
  // 3° et 5°), exigées par le serveur. Rien n'est présélectionné sauf un
  // choix unique (la vente d'une cession).
  const [sNature, setSNature] = useState<NatureSortie | ''>('');
  const [sRefPiece, setSRefPiece] = useState('');
  const [sDatePiece, setSDatePiece] = useState('');

  // Dépréciation · AUDCIF art. 46 et Titre VIII ch. 12 ; SYCEBNL, fiche du
  // COMPTE 29. Rien n'est prérempli : ni le montant, qui suppose une valeur
  // actuelle estimée hors du logiciel, ni l'indice, sans lequel aucun test
  // n'est requis et donc aucune dotation n'est justifiable (ch. 12 § 2.1).
  const [depreciationOuvertePour, setDepreciationOuvertePour] = useState<string | null>(null);
  const [dSens, setDSens] = useState<'DOTATION' | 'REPRISE'>('DOTATION');
  const [dMontant, setDMontant] = useState('');
  const [dCompte29, setDCompte29] = useState('');
  const [dContrepartie, setDContrepartie] = useState('');
  const [dIndice, setDIndice] = useState('');

  // Approche par composants · AUDCIF Titre VIII ch. 4 ; SYCEBNL, Partie 2
  // ch. 3, classe 2. Tout est facultatif : sans principal désigné, le bien
  // créé est une structure ordinaire, exactement comme avant.
  const [iPrincipal, setIPrincipal] = useState('');
  const [iTypeComposant, setITypeComposant] = useState<TypeComposant>('COMPOSANT');
  const [iJustification, setIJustification] = useState('');
  // Reclassement · AUDCIF Titre VIII ch. 10 § 2.4. Rien n'est prérempli et
  // aucun montant n'est demandé : le transfert « n'a pas d'incidence sur la
  // valeur comptable du bien immobilier transféré », le serveur vire ce que le
  // bien porte déjà. Le motif, lui, est exigé · le § 1.2 qualifie un immeuble
  // de placement par l'USAGE, que nul solde ne porte.
  const [reclassementOuvertPour, setReclassementOuvertPour] = useState<string | null>(null);
  const [rcFamille, setRcFamille] = useState('');
  const [rcDate, setRcDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rcMotif, setRcMotif] = useState('');
  const [rcCompte29, setRcCompte29] = useState('');
  // Lot 15 · un virement vers le 211 (SYSCOHADA) exige les six critères,
  // comme la création · le serveur le refuse sinon.
  const [rcCriteresRd, setRcCriteresRd] = useState(criteresVides);
  const [rcDateCriteresRd, setRcDateCriteresRd] = useState('');

  const [renouvellementOuvertPour, setRenouvellementOuvertPour] = useState<string | null>(null);
  const [remplacementOuvertPour, setRemplacementOuvertPour] = useState<string | null>(null);
  const [rDesignation, setRDesignation] = useState('');
  const [rCout, setRCout] = useState('');
  const [rDuree, setRDuree] = useState('');
  const [rDate, setRDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rContrepartie, setRContrepartie] = useState('');

  const charger = async () => {
    // Un échec de lecture se dit (§ 9 ter) · sans ce rattrapage, la fenêtre
    // restait vide et les listes de comptes muettes.
    let lus;
    try {
      lus = await Promise.all([
        api.get<FamilleImmobilisation[]>('/immobilisations/familles'),
        api.get<Immobilisation[]>('/immobilisations'),
        api.get<Compte[]>(`/comptes?classe=CLASSE_2&typeCompte=DETAIL&${RETENUS}`),
        api.get<Compte[]>(`/comptes?typeCompte=DETAIL&${RETENUS}`),
        api.get<Compte[]>('/comptes?classe=CLASSE_2&typeCompte=DETAIL'),
        api.get<Journal[]>('/journaux'),
        api.get<LieuBien[]>('/immobilisations/lieux'),
        api.get<CompteDuBien[]>(`/immobilisations/comptes-du-bien?${RETENUS}`),
        // Le barème ne conditionne rien · illisible, le choix de nature
        // disparaît et la saisie reste entière.
        api.get<NatureBaremeFiscal[]>('/immobilisations/bareme-fiscal').catch(() => [] as NatureBaremeFiscal[]),
      ]);
    } catch (err) {
      setErreur(`Lecture des immobilisations impossible · ${err instanceof ApiError ? err.message : 'serveur injoignable'}`);
      return;
    }
    const [f, i, c2, ctrésorerie, planClasse2, jrn, lx, cb, bf] = lus;
    setComptes29(planClasse2.filter((c) => c.numero.startsWith('29')));
    setBareme(bf);
    setLieux(lx);
    setComptesBien(cb);
    setFamilles(f);
    setImmobilisations(i);
    setComptesClasse2(c2);
    setComptesFinancement(ctrésorerie);
    setJournaux(jrn);
    const od = jrn.find((j) => j.code === 'OD');
    if (od) {
      setIJournalId((v) => v || od.id);
      setSJournalId((v) => v || od.id);
      setMsJournalId((v) => v || od.id);
    }
  };

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!projetDeveloppement || !sortieOuvertePour) return;
    let annule = false;
    setFondsProjet(null);
    setErreurFondsProjet(null);
    setSCompteFonds('');
    api
      .get<ReponseFondsProjet>(`/immobilisations/comptes-fonds-projet?${RETENUS}`)
      .then((r) => {
        if (annule) return;
        setFondsProjet(r);
        setSCompteFonds(fondsPreselectionne(r.comptes) ?? '');
      })
      .catch((err) => {
        if (!annule) setErreurFondsProjet(err instanceof ApiError ? err.message : 'lecture impossible');
      });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetDeveloppement, sortieOuvertePour]);

  const messageFonds = messageFondsProjet(fondsProjet, erreurFondsProjet);

  // LE PRIX D'UNE CESSION · la liste admise (fiches 41 et 48), retenus ou
  // utilisés ; un seul compte proposé se présélectionne (§ 9 ter).
  const comptesEncaissement =
    sortieOuvertePour && sType === 'CESSION' && comptesFinancement
      ? comptesFinancement.filter((c) => contrepartieCessionProposee(utilisateur?.tenant.referentiel, sCessionCourante, c.numero))
      : null;
  usePreselectionUnique(comptesEncaissement, sCompteContrepartie, setSCompteContrepartie);

  // UN SEUL COMPTE DE BIEN RETENU OU UTILISÉ · il se présélectionne à
  // l'ouverture du formulaire, modifiable ; jamais par-dessus un choix fait.
  useEffect(() => {
    if (afficherFormImmo && !iCompteBienId && comptesBien && comptesBien.length === 1) setICompteBienId(comptesBien[0].id);
  }, [afficherFormImmo, comptesBien, iCompteBienId]);

  const compteBien = (comptesBien ?? []).find((c) => c.id === iCompteBienId) ?? null;
  const incorporelSyscohada = syscohada && !!compteBien?.numero.startsWith('21');
  const fondsCommercial = incorporelSyscohada && !!compteBien?.numero.startsWith('215');
  // Le 211 du SYSCOHADA, seul soumis aux six critères · le SYCEBNL n'en ouvre pas.
  const fraisDeveloppement = syscohada && !!compteBien?.numero.startsWith('211');
  // UN SOUS-COMPTE « LOCATION-ACQUISITION » NE S'OUVRE QUE PAR UN CONTRAT
  // (AUDCIF Titre VIII ch. 8 § 2.1.7) · ni achat, ni reprise, ni composant ;
  // la valeur du bien est la dette que le serveur calcule.
  const enLA = !!compteBien?.locationAcquisition;

  // LA CONTREPARTIE SE LIT DANS LA FICHE DES COMPTES 21 À 24 · liste fermée,
  // servie par le serveur pour le compte du bien choisi
  // (`immobilisations/contrepartie-acquisition.ts`), la même règle que son refus.
  // Le type d'un composant ouvre sa propre contrepartie (1984 pour un
  // démantèlement, AUDCIF Titre VII, classe 2) · la même règle que le serveur.
  const typeComposantServi = estComposant && iPrincipal ? iTypeComposant : '';
  const [contrepartiesAdmises, setContrepartiesAdmises] = useState<ContrepartieAdmise[] | null>(null);
  useEffect(() => {
    setContrepartiesAdmises(null);
    if (!iCompteBienId) return;
    let vivant = true;
    const type = typeComposantServi ? `&typeComposant=${typeComposantServi}` : '';
    api
      .get<ContrepartieAdmise[]>(`/immobilisations/contreparties-acquisition?compteImmobilisationId=${iCompteBienId}${type}&${RETENUS}`)
      .then((c) => vivant && setContrepartiesAdmises(c))
      .catch((err) => {
        if (!vivant) return;
        // Un échec de lecture se dit · la liste vide laissait « Mode
        // d'acquisition » sans option et sans motif.
        setContrepartiesAdmises([]);
        setErreur(err instanceof ApiError ? err.message : 'Contreparties admises illisibles');
      });
    return () => {
      vivant = false;
    };
  }, [iCompteBienId, typeComposantServi]);
  const modeRetenu = iMode;
  // Les modes d'acquisition présents dans la liste fermée, dans l'ordre servi.
  const contrepartiesOffertes = contrepartiesSelonEnCours(contrepartiesAdmises ?? [], iPasEncoreEnService);
  const modesAcquisition = modesPresents(contrepartiesOffertes);
  const contrepartiesDuMode = contrepartiesOffertes.filter((c) => !iModeAcquisition || c.mode === iModeAcquisition);
  // UN SEUL CHOIX POSSIBLE EST PROPOSÉ · un mode unique, ou une contrepartie
  // unique pour le mode retenu, se présélectionne (modifiable) au lieu d'un
  // champ vide à rouvrir.
  useEffect(() => {
    if (modesAcquisition.length === 1 && !iModeAcquisition) setIModeAcquisition(modesAcquisition[0].mode);
  }, [modesAcquisition, iModeAcquisition]);
  useEffect(() => {
    if (iModeAcquisition && contrepartiesDuMode.length === 1 && !iCompteContrepartie) setICompteContrepartie(contrepartiesDuMode[0].id);
  }, [iModeAcquisition, contrepartiesDuMode, iCompteContrepartie]);

  // SEUIL DU PETIT MATÉRIEL (arrêté n° 014/2025, art. 2) · règle FISCALE de
  // l'IS et de l'IRPP, donc des seuls dossiers SYSCOHADA (une EBNL est
  // exemptée d'IS, loi n° 23/053, art. 5). Le seuil en francs vient du serveur,
  // au cours de l'USD en vigueur à la date d'acquisition, jamais supposé.
  useEffect(() => {
    setSeuilPetit(null);
    if (!syscohada || !/^\d{4}-\d{2}-\d{2}$/.test(iDateAcquisition)) return;
    let vivant = true;
    api
      .get<SeuilPetitMateriel>(`/immobilisations/seuil-petit-materiel?date=${iDateAcquisition}`)
      .then((s) => vivant && setSeuilPetit(s))
      .catch(() => vivant && setSeuilPetit(null));
    return () => {
      vivant = false;
    };
  }, [syscohada, iDateAcquisition]);
  const unitesServies = !(utilisateur?.tenant?.referentiel === 'SYSCOHADA' && utilisateur?.tenant?.systemeComptableSyscohada === 'MINIMAL_TRESORERIE');

  const onCreerImmo = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      if (enLA) {
        const corps = corpsCreation(iCompteBienId, contratLA, {
          designation: iDesignation,
          numeroInventaire: iNumeroInventaire || undefined,
          lieuId: iLieuId || undefined,
          natureFiscaleCle: iNatureFiscale || undefined,
          dureeAmortissementAns: Number(iDuree),
          exerciceId: exerciceCourant?.id ?? '',
          journalId: iJournalId,
        });
        if (!corps) throw new ApiError(400, 'Complétez le contrat · durée, loyer, et taux ou valeur du bien.');
        await api.post('/immobilisations/location-acquisition', corps);
        setContratLA(saisieInitiale(new Date().toISOString().slice(0, 10)));
      } else await api.post('/immobilisations', {
        compteImmobilisationId: iCompteBienId,
        designation: iDesignation,
        numeroInventaire: iNumeroInventaire || undefined,
        lieuId: iLieuId || undefined,
        dateAcquisition: iDateAcquisition,
        // Vide · bien non encore mis en service, la date se pose plus tard.
        // Inscrit en cours, jamais de date · le serveur la refuserait.
        dateMiseEnService: iPasEncoreEnService ? undefined : iDateMiseEnService || undefined,
        compteEnCoursId: iPasEncoreEnService ? iCompteEnCoursId || undefined : undefined,
        natureFiscaleCle: iNatureFiscale || undefined,
        valeurOrigine: Number(iValeurOrigine),
        valeurResiduelle: Number(iValeurResiduelle || 0),
        dureeAmortissementAns: iNonLimitee ? undefined : iDixAns ? 10 : iDuree ? Number(iDuree) : undefined,
        ...(incorporelSyscohada && iNonLimitee
          ? {
              dureeNonLimitee: true,
              justificationDureeNonLimitee: iJustifNonLimitee || undefined,
              ...(compteBien?.numero.startsWith('2132') ? { nomDeDomaine: iNomDeDomaine } : {}),
            }
          : {}),
        ...(fondsCommercial && !iNonLimitee && iDixAns ? { fondementDureeDixAns: iDixAns } : {}),
        ...(iMode ? { modeAmortissement: iMode } : {}),
        ...(modeRetenu === 'UNITES_DOEUVRE' ? { unitesOeuvrePrevues: Number(iUnites), uniteOeuvreLibelle: iUniteLibelle } : {}),
        amortissementAnterieur: iRepris ? Number(iAmortissementAnterieur || 0) : 0,
        repris: iRepris || undefined,
        compteContrepartieId: iRepris ? undefined : iCompteContrepartie,
        // Cochée, la clause est déclarée ; décochée, le serveur la déduit d'une dette au 4816.
        ...(iReserve ? { reserveDePropriete: true } : {}),
        exerciceId: exerciceCourant?.id,
        journalId: iRepris ? undefined : iJournalId,
        immobilisationPrincipaleId: estComposant && iPrincipal ? iPrincipal : undefined,
        typeComposant: estComposant && iPrincipal ? iTypeComposant : undefined,
        justificationDecomposition: estComposant && iPrincipal ? iJustification : undefined,
        ...(fraisDeveloppement && !iRepris ? corpsCriteres(iCriteresRd, iDateCriteresRd) : {}),
        ...(estComposant && iPrincipal && iTypeComposant === 'DEMANTELEMENT'
          ? {
              ...(iCoutFuturDem ? { coutFuturDemantelement: Number(iCoutFuturDem) } : {}),
              ...(iTauxDem ? { tauxActualisationDemantelementPourcent: Number(iTauxDem) } : {}),
            }
          : {}),
      });
      setIDesignation('');
      setIPrincipal('');
      setIJustification('');
      setINumeroInventaire('');
      setILieuId('');
      setIValeurOrigine('');
      setIValeurResiduelle('0');
      setIRepris(false);
      setIReserve(false);
      setIAmortissementAnterieur('0');
      setIDuree('');
      setIMode('LINEAIRE');
      setIModeAcquisition('');
      setINatureFiscale('');
      setIPasEncoreEnService(false);
      setICompteEnCoursId('');
      setEstComposant(false);
      setIUnites('');
      setIUniteLibelle('');
      setICriteresRd(criteresVides());
      setIDateCriteresRd('');
      setICoutFuturDem('');
      setITauxDem('');
      setAfficherFormImmo(false);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Impossible de créer cette immobilisation");
    } finally {
      setEnvoi(false);
    }
  };

  const passerDotation = async (immoId: string) => {
    if (!exerciceCourant) return;
    setErreur(null);
    setInfo(null);
    try {
      const od = journaux.find((j) => j.code === 'OD');
      const resultat = await api.post<{ montant: number }>(`/immobilisations/${immoId}/dotation`, {
        exerciceId: exerciceCourant.id,
        journalId: od?.id ?? journaux[0]?.id,
      });
      setInfo(`Dotation de ${montant(resultat.montant)} passée pour l'exercice ${libelleExercice(exerciceCourant)}.`);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de passer la dotation');
    }
  };

  /**
   * Mise en service d'un bien acquis et pas encore en état de fonctionner
   * (AUDCIF art. 45) · la date se pose une fois, jamais avant l'acquisition,
   * et c'est le serveur qui le refuse. Un bien porté à son compte définitif ne
   * passe aucune écriture ; un bien inscrit en cours passe D compte définitif
   * / C compte en cours, dans l'exercice courant et le journal choisi.
   */
  const onMettreEnService = async (e: FormEvent, immo: Immobilisation) => {
    e.preventDefault();
    setErreur(null);
    setInfo(null);
    setEnvoi(true);
    try {
      await api.patch(`/immobilisations/${immo.id}/mise-en-service`, {
        date: msDate,
        ...(immo.compteEnCoursId ? { exerciceId: exerciceCourant?.id, journalId: msJournalId } : {}),
      });
      setMiseEnServiceOuvertePour(null);
      setInfo(`${immo.designation} mis en service au ${msDate.split('-').reverse().join('/')}.`);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de poser la mise en service');
    } finally {
      setEnvoi(false);
    }
  };

  const onSortir = async (e: FormEvent, immoId: string, natureSortie: NatureSortie | '') => {
    e.preventDefault();
    if (!exerciceCourant) return;
    setErreur(null);
    setEnvoi(true);
    try {
      const resultat = await api.post<{
        ecartReevaluation?: { transfereReserve: number; repris861: number; nonPasses: Array<{ compteEcart: string; montant: number; motif: string | null }> } | null;
      }>(`/immobilisations/${immoId}/sortie`, {
        dateSortie: sDateSortie,
        type: sType,
        natureSortie,
        referencePieceSortie: sRefPiece,
        datePieceSortie: sDatePiece,
        exerciceId: exerciceCourant.id,
        journalId: sJournalId,
        prixCession: sType === 'CESSION' ? Number(sPrixCession) : undefined,
        compteContrepartieId: sType === 'CESSION' ? sCompteContrepartie : undefined,
        ...(sType === 'CESSION' && syscohada ? { cessionCourante: sCessionCourante } : {}),
        ...(projetDeveloppement ? { compteFondsProjetId: sCompteFonds } : {}),
        ...(sType === 'MISE_HORS_SERVICE' && Number(sValeurRecuperee) > 0
          ? { valeurMaterielRecupere: Number(sValeurRecuperee), compteStockRecupereId: sCompteStock, sourceMaterielRecupere: sSourceRecuperee }
          : {}),
        ...(sCompteReserve ? { compteReserveEcartId: sCompteReserve } : {}),
      });
      setSortieOuvertePour(null);
      setSCompteReserve('');
      setSPrixCession('');
      setSValeurRecuperee('');
      setSSourceRecuperee('');
      setSNature('');
      setSRefPiece('');
      setSDatePiece('');
      // Un écart laissé au 106 ou au 154 se DIT après la sortie, jamais en silence.
      const nonPasses = resultat?.ecartReevaluation?.nonPasses ?? [];
      setInfo(
        nonPasses.length > 0
          ? `Sortie enregistrée · écart de réévaluation non passé : ${nonPasses.map((x) => `${x.compteEcart} ${montant(x.montant)}`).join(', ')}.`
          : 'Sortie enregistrée.',
      );
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de sortir cette immobilisation');
    } finally {
      setEnvoi(false);
    }
  };

  const onDeprecier = async (e: FormEvent, immoId: string) => {
    e.preventDefault();
    if (!exerciceCourant) return;
    setErreur(null);
    setEnvoi(true);
    try {
      const od = journaux.find((j) => j.code === 'OD');
      await api.post(`/immobilisations/${immoId}/depreciation`, {
        exerciceId: exerciceCourant.id,
        journalId: od?.id ?? journaux[0]?.id,
        sens: dSens,
        montant: Number(dMontant),
        compteDepreciationId: dCompte29,
        compteContrepartieId: dContrepartie,
        indice: dIndice,
      });
      setDepreciationOuvertePour(null);
      setDMontant('');
      setDIndice('');
      setInfo(
        dSens === 'DOTATION'
          ? 'Dépréciation enregistrée · le plan d’amortissement se ré-étale sur la durée restant à courir.'
          : 'Reprise enregistrée.',
      );
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible d’enregistrer cette dépréciation');
    } finally {
      setEnvoi(false);
    }
  };

  /** Le virement fait entrer le bien au 211 du SYSCOHADA · il n'y était pas. */
  const versFraisDeveloppement = (immoId: string) => {
    const destination = (familles ?? []).find((f) => f.id === rcFamille)?.compteImmobilisation?.numero ?? '';
    const avant = (immobilisations ?? []).find((i) => i.id === immoId)?.compteImmobilisation?.numero ?? '';
    return syscohada && destination.startsWith('211') && !avant.startsWith('211');
  };

  const onReclasser = async (e: FormEvent, immoId: string) => {
    e.preventDefault();
    if (!exerciceCourant) return;
    setErreur(null);
    setEnvoi(true);
    try {
      const od = journaux.find((j) => j.code === 'OD');
      await api.post(`/immobilisations/${immoId}/reclassement`, {
        nouvelleFamilleId: rcFamille,
        dateReclassement: rcDate,
        exerciceId: exerciceCourant.id,
        journalId: od?.id ?? journaux[0]?.id,
        motif: rcMotif,
        ...(rcCompte29 ? { nouveauCompteDepreciationId: rcCompte29 } : {}),
        ...(versFraisDeveloppement(immoId) ? corpsCriteres(rcCriteresRd, rcDateCriteresRd) : {}),
      });
      setReclassementOuvertPour(null);
      setRcMotif('');
      setRcCompte29('');
      setRcCriteresRd(criteresVides());
      setRcDateCriteresRd('');
      setInfo(
        'Bien reclassé · la valeur d’origine, l’amortissement cumulé et la dépréciation ont été virés tels ' +
          'quels. Aucun montant n’a été recalculé, la valeur comptable nette est inchangée.',
      );
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de reclasser ce bien');
    } finally {
      setEnvoi(false);
    }
  };

  const onRenouveler = async (e: FormEvent, composantId: string) => {
    e.preventDefault();
    if (!exerciceCourant) return;
    setErreur(null);
    setEnvoi(true);
    try {
      const od = journaux.find((j) => j.code === 'OD');
      await api.post(`/immobilisations/${composantId}/renouvellement`, {
        dateRenouvellement: rDate,
        exerciceId: exerciceCourant.id,
        journalId: od?.id ?? journaux[0]?.id,
        designation: rDesignation,
        coutRenouvellement: Number(rCout),
        dureeAmortissementAns: Number(rDuree),
        compteContrepartieId: rContrepartie,
        ...(sCompteReserve ? { compteReserveEcartId: sCompteReserve } : {}),
      });
      setRenouvellementOuvertPour(null);
      setSCompteReserve('');
      setRDesignation('');
      setRCout('');
      setInfo('Composant renouvelé · l’ancien est sorti de l’actif et le nouveau porté au même principal.');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de renouveler ce composant');
    } finally {
      setEnvoi(false);
    }
  };

  const principaux = (immobilisations ?? []).filter(
    (i) => !i.immobilisationPrincipaleId && i.statut === 'EN_SERVICE',
  );
  const nomPrincipal = (id: string | null) =>
    (immobilisations ?? []).find((i) => i.id === id)?.designation ?? null;

  /**
   * RECONSTITUER UN COMPOSANT « RÉVISIONS MAJEURES » JAMAIS IDENTIFIÉ · AUDCIF
   * Titre VIII ch. 5 § 1. Le calcul est rendu, rien n'est posté : la
   * ventilation de la valeur brute entre la structure et le composant est une
   * décision du cabinet, et le texte n'écrit qu'une possibilité.
   */
  const reconstituerRevision = async (immo: Immobilisation) => {
    const cout = window.prompt(
      `${immo.designation} · coût de révision ACTUEL, celui d’aujourd’hui et non celui de l’acquisition.\n\n` +
        'AUDCIF ch. 5 § 1 : la valeur nette du composant jamais identifié « peut être estimée par référence au ' +
        'coût de révision actuel amorti ».',
    );
    if (!cout?.trim()) return;
    const intervalle = window.prompt('Intervalle entre deux révisions, en années.');
    if (!intervalle?.trim()) return;
    const derniere = window.prompt(
      'Date de la dernière révision RÉELLEMENT réalisée, au format AAAA-MM-JJ.\n\n' +
        'Laisser vide si aucune révision n’a encore eu lieu · l’estimation se place alors à la date d’acquisition, ' +
        'comme le texte le prévoit.',
    );
    setErreur(null);
    try {
      const params = new URLSearchParams({
        coutRevisionActuel: cout.trim(),
        intervalleRevisionsAns: intervalle.trim(),
        dateReconstitution: new Date().toISOString().slice(0, 10),
        ...(derniere?.trim() ? { derniereRevisionRealiseeLe: derniere.trim() } : {}),
      });
      const r = await api.get<{
        possible: boolean;
        motif?: string;
        valeurNetteEstimee?: number;
        amortissementEstime?: number;
        suite: string;
      }>(`/immobilisations/${immo.id}/reconstitution-revision-majeure?${params}`);
      setReconstitution({ immobilisation: immo.designation, ...r });
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Estimation impossible');
    }
  };

  /**
   * LE RELEVÉ D'UNITÉS D'ŒUVRE · le seul chiffre du plan d'amortissement
   * qu'aucune comptabilité ne porte. Il se saisit avec sa source · c'est la
   * source que le réviseur demandera, pas le nombre.
   */
  const saisirConsommation = async (immo: Immobilisation) => {
    const unites = window.prompt(
      `${immo.designation} · unités d’œuvre consommées sur cet exercice (${immo.uniteOeuvreLibelle ?? 'unités'}).\n\n` +
        'Celles de l’exercice, jamais un cumul.',
    );
    if (!unites?.trim()) return;
    const source = window.prompt(
      'D’où vient ce chiffre ? Relevé de compteur, carnet de bord, fiche de production.\n\n' +
        'La provenance est exigée : c’est elle que le réviseur demandera, pas le nombre.',
    );
    if (!source?.trim()) return;
    setErreur(null);
    try {
      await api.post(`/immobilisations/${immo.id}/consommation`, {
        exerciceId: exerciceCourant?.id,
        unitesConsommees: Number(unites),
        source: source.trim(),
      });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible d’enregistrer le relevé');
    }
  };

  const cumulAmorti = (immo: Immobilisation) => immo.dotations.reduce((s, d) => s + d.montant, 0);
  // Les deux textes inscrivent la dépréciation EN DIMINUTION DE LA VALEUR
  // BRUTE · l'omettre ici afficherait une valeur nette que le bilan ne porte
  // pas (SYCEBNL, fiche du COMPTE 29 · AUDCIF art. 46).
  const cumulDeprecie = (immo: Immobilisation) =>
    immo.depreciations.reduce((s, d) => s + (d.sens === 'DOTATION' ? d.montant : -d.montant), 0);
  const vcn = (immo: Immobilisation) => immo.valeurOrigine - cumulAmorti(immo) - cumulDeprecie(immo);
  const dejaDoteeCetExercice = (immo: Immobilisation) =>
    !!exerciceCourant && immo.dotations.some((d) => d.exerciceId === exerciceCourant.id);

  const LIBELLE_STATUT: Record<Immobilisation['statut'], string> = {
    EN_SERVICE: 'En service',
    CEDEE: 'Cédée',
    MISE_HORS_SERVICE: 'Hors service',
  };

  const creerLieu = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const donnees = new FormData(form);
    setErreur(null);
    try {
      await api.post('/immobilisations/lieux', { code: String(donnees.get('code') ?? ''), intitule: String(donnees.get('intitule') ?? '') });
      form.reset();
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible d’ajouter ce lieu');
    }
  };

  const supprimerLieu = async (l: LieuBien) => {
    if (!window.confirm(`Supprimer le lieu ${l.code} ?`)) return;
    setErreur(null);
    try {
      await api.delete(`/immobilisations/lieux/${l.id}`);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de supprimer ce lieu');
    }
  };

  const deplacer = async (immo: Immobilisation, lieuId: string) => {
    setErreur(null);
    try {
      await api.patch(`/immobilisations/${immo.id}/lieu`, { lieuId: lieuId || null });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de déplacer ce bien');
    }
  };

  const barreOnglets = (
    <div role="tablist" className="flex gap-1 mb-2 border-b border-border">
      {ONGLETS_IMMOBILISATIONS.filter((o) => o.cle !== 'lieux' || estAdmin).map((o) => (
        <button
          key={o.cle}
          type="button"
          role="tab"
          aria-selected={onglet === o.cle}
          onClick={() => choisirOnglet(o.cle)}
          className={`onglet ${onglet === o.cle ? 'onglet-actif' : ''}`}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  );

  const imprimerDeclaration = () => {
    if (!exerciceCourant) return;
    setErreur(null);
    setPreparationDeclaration(true);
    api
      .get<DeclarationSpeciale>(`/immobilisations/reevaluation-bilan/declaration-speciale?exerciceId=${encodeURIComponent(exerciceCourant.id)}`)
      .then(
        (d) => {
          if (!d.reevaluation) {
            setErreur('Aucune réévaluation enregistrée sur cet exercice · rien à déclarer.');
            return;
          }
          setDeclaration(d);
          window.setTimeout(() => window.print(), 50);
        },
        (e: Error) => setErreur(e instanceof ApiError ? e.message : 'L’édition n’a pas pu être préparée.'),
      )
      .finally(() => setPreparationDeclaration(false));
  };

  return (
    <div className={`p-2 ${declaration ? 'avec-edition' : ''}`}>
      {declaration && (
        <>
          <EnteteImpression titre="Déclaration spéciale de réévaluation" sousTitre="Éléments par catégorie d’immobilisations" />
          <DeclarationSpecialeImprimee d={declaration} />
        </>
      )}
      {barreOnglets}
      {erreur && <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-3 max-w-[1100px]">{erreur}</div>}

      {info && <div className="text-[11.5px] text-positive bg-positive-soft border border-positive/30 px-3 py-2 mb-3 max-w-[1100px]">{info}</div>}

      <div role="tabpanel" hidden={onglet !== 'biens'}>
        {peutEcrire && (
          <div className="flex items-center justify-end mb-1.5 max-w-[1100px]">
            {/* Les immobilisations s'ouvrent aussi au comptable ; les lieux,
                réservés à l'administrateur, ont leur onglet. La famille n'est
                plus saisie · elle suit le compte du bien (compte-du-bien.ts,
                serveur). */}
            {!afficherFormImmo && (
              <button type="button" onClick={() => setAfficherFormImmo(true)} className="bg-sel text-white rounded-[3px] px-3 py-[3px] text-[11.5px] font-semibold hover:opacity-90">
                Nouvelle immobilisation
              </button>
            )}
          </div>
        )}
        {reconstitution && (
          <div className="border border-border bg-surface px-3.5 py-2.5 mb-3 max-w-[1100px] text-[11.5px]">
            <div className="flex items-start justify-between gap-3">
              <div className="font-semibold">
                Composant « révisions majeures » · {reconstitution.immobilisation}
              </div>
              <button
                type="button"
                onClick={() => setReconstitution(null)}
                className="text-[11px] text-text-dim hover:underline"
              >
                Fermer
              </button>
            </div>
            {reconstitution.possible ? (
              <div className="mt-1">
                Valeur nette estimée{' '}
                <span className="font-mono font-semibold">
                  {montant(reconstitution.valeurNetteEstimee)}
                </span>{' '}
                · amortissement fictif déjà couru{' '}
                <span className="font-mono">{montant(reconstitution.amortissementEstime)}</span>
              </div>
            ) : (
              <div className="mt-1 text-warning">{reconstitution.motif}</div>
            )}
            <div className="mt-1.5 text-[11px] text-text-dim">{reconstitution.suite}</div>
          </div>
        )}
        {peutEcrire && afficherFormImmo && (
          <form onSubmit={onCreerImmo} className="bg-surface border border-border p-4 mb-4 max-w-[900px]">
            <div className="font-mono text-[11.5px] font-semibold text-text-dim mb-3 flex items-center gap-1.5">
              Nouvelle immobilisation
              <Aide
                titre="Seuil d'immobilisation"
                texte={texteAideSeuilImmobilisation(exerciceCourant?.dateFin)}
                source={SOURCE_AIDE_SEUIL_IMMOBILISATION}
              />
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
                Désignation
                <input required value={iDesignation} onChange={(e) => setIDesignation(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal" />
              </label>
              <label className="text-[11.5px] font-semibold text-text-dim">
                N° inventaire
                <input value={iNumeroInventaire} onChange={(e) => setINumeroInventaire(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
              </label>
              <label className="text-[11.5px] font-semibold text-text-dim">
                <span className="flex items-center gap-1">
                  Lieu
                  <Aide
                    titre="Lieu du bien"
                    texte="Emplacement physique du bien, pris dans le référentiel des lieux du dossier. Il sert à retrouver le bien lors de l'inventaire physique. Sans aucun effet comptable : déplacer un bien ne passe aucune écriture."
                    source="Référentiel des lieux du dossier"
                  />
                </span>
                <select value={iLieuId} onChange={(e) => setILieuId(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                  <option value="">Non placé</option>
                  {lieux.map((l) => (
                    <option key={l.id} value={l.id}>{l.code} · {l.intitule}</option>
                  ))}
                </select>
              </label>
              <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
                <span className="flex items-center gap-1">
                  Compte du bien
                  <Aide
                    titre="Compte du bien"
                    texte="Le compte de classe 2 où le bien est porté à l'actif. Le compte d'amortissement (28) et le compte de dotation (68) s'en déduisent, lus dans le plan du dossier : le 28 suit la division du bien, la dotation sa nature (incorporelle ou corporelle)."
                    source="AUDCIF, Titre VII ch. 2 · SYCEBNL, Partie 2 ch. 2"
                  />
                </span>
                <select
                  required
                  value={iCompteBienId}
                  onChange={(e) => {
                    setICompteBienId(e.target.value);
                    setINatureFiscale('');
                    setIModeAcquisition('');
                    setICompteContrepartie('');
                    setICompteEnCoursId(compteEnCoursInitial((comptesBien ?? []).find((c) => c.id === e.target.value) ?? null));
                  }}
                  className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal"
                >
                  <option value="" />
                  {comptesParDivision(comptesDefinitifs(comptesBien ?? [], iPasEncoreEnService)).map((g) => (
                    <optgroup key={g.numero} label={`${g.numero} · ${g.intitule}`}>
                      {g.comptes.map((c) => (
                        <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {comptesBien && comptesBien.length === 0 && (
                  <span className="block mt-1 text-[11px] font-normal text-warning">
                    {motifAucunCompteRetenu(comptesBien, `d'immobilisation (${syscohada ? '21 à 24' : '20 à 24'})`)}
                  </span>
                )}
                {compteBien && (
                  <span className="block mt-1 text-[11px] font-normal">
                    {compteBien.motifComptes ? (
                      <span className="text-danger">{compteBien.motifComptes}</span>
                    ) : compteBien.motifNonAmortissable ? (
                      <span className="text-warning">Bien non amortissable · seule la dépréciation (29) s'y applique.</span>
                    ) : (
                      <>
                        Amortissement {compteBien.compteAmortissement?.numero} · {compteBien.compteAmortissement?.intitule}
                        <br />
                        Dotation {compteBien.compteDotation?.numero} · {compteBien.compteDotation?.intitule}
                      </>
                    )}
                  </span>
                )}
              </label>
              {!enLA && (
              <>
              <label className="text-[11.5px] font-semibold text-text-dim">
                Date d'acquisition
                <input required type="date" value={iDateAcquisition} onChange={(e) => setIDateAcquisition(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
              </label>
              <div className="flex flex-col gap-1">
                <label className="text-[11.5px] font-semibold text-text-dim flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={iPasEncoreEnService}
                    onChange={(e) => {
                      setIPasEncoreEnService(e.target.checked);
                      // Un 2x9 choisi comme compte définitif ne l'est plus une fois la case cochée.
                      if (e.target.checked && compteBien?.estCompteEnCours) setICompteBienId('');
                      // « Travaux en cours achevés » sort de la liste · un choix fait avant ne survit pas.
                      if (e.target.checked && iModeAcquisition === 'EN_COURS_ACHEVE') {
                        setIModeAcquisition('');
                        setICompteContrepartie('');
                      }
                      setICompteEnCoursId(e.target.checked ? compteEnCoursInitial(compteBien?.estCompteEnCours ? null : compteBien) : '');
                    }}
                  />
                  Pas encore mis en service
                  <Aide
                    titre="Immobilisation en cours"
                    texte="Le bien n'est pas achevé : il s'inscrit au compte en cours de sa division (219, 229, 239, 249), le compte définitif gardant sa nature et sa durée. Rien n'est amorti. À l'achèvement, « Mettre en service » le porte au débit de son compte définitif par le crédit du compte en cours. Au SYCEBNL, les fiches des comptes 21 et 22 ouvrent le 219 et le 229 sans écrire ce virement, que les fiches 23 et 24 écrivent : il est offert aux quatre divisions (décision du cabinet éditeur)."
                    source="AUDCIF Titre VII, fiches des comptes 21 à 24 · SYCEBNL Partie 2 ch. 3, fiches des comptes 21 à 24"
                  />
                </label>
                {iPasEncoreEnService ? (
                  <label className="text-[11.5px] font-semibold text-text-dim">
                    Compte en cours
                    <select
                      required
                      disabled={!compteBien || !!compteBien.motifSansEnCours}
                      value={iCompteEnCoursId}
                      onChange={(e) => setICompteEnCoursId(e.target.value)}
                      className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal"
                    >
                      <option value="">{compteBien ? '' : 'Choisissez d’abord le compte du bien'}</option>
                      {(compteBien?.comptesEnCours ?? []).map((c) => (
                        <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                      ))}
                    </select>
                    {compteBien?.motifSansEnCours && (
                      <span className="block mt-1 text-[11px] font-normal text-warning">{compteBien.motifSansEnCours}</span>
                    )}
                  </label>
                ) : (
                  <label className="text-[11.5px] font-semibold text-text-dim">
                    <span className="flex items-center gap-1">
                      Date de mise en service
                      <Aide
                        titre="Mise en service"
                        texte="Vide, le bien est acquis mais pas encore en état de fonctionner : aucune dotation n'est passée. La date se pose ensuite depuis la liste (« Mettre en service »), une fois, et jamais avant l'acquisition."
                        source="AUDCIF art. 45"
                      />
                    </span>
                    <input type="date" value={iDateMiseEnService} onChange={(e) => setIDateMiseEnService(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
                  </label>
                )}
              </div>
              <label className="text-[11.5px] font-semibold text-text-dim">
                Valeur d'origine
                <input required type="number" step="0.01" min={0} value={iValeurOrigine} onChange={(e) => setIValeurOrigine(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
                {(() => {
                  const a = avertissementPetitMateriel(iValeurOrigine ? Number(iValeurOrigine) : null, seuilPetit);
                  return a ? <span className="block mt-1 text-[11px] font-normal text-warning">{a}</span> : null;
                })()}
              </label>
              <label className="text-[11.5px] font-semibold text-text-dim">
                Valeur résiduelle
                <input type="number" step="0.01" min={0} value={iValeurResiduelle} onChange={(e) => setIValeurResiduelle(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
              </label>
              </>
              )}
              {bareme.length > 0 && (
                <label className="text-[11.5px] font-semibold text-text-dim">
                  <span className="flex items-center gap-1">
                    Nature du bien (barème fiscal)
                    <Aide
                      titre="Barème fiscal"
                      texte="Choisir la nature propose sa durée d'amortissement. La durée saisie reste libre : un écart au barème est signalé, jamais refusé. Un taux supérieur au barème n'est admis que si l'entreprise en justifie les circonstances lors du contrôle, sous peine de rejet. Un bien en location-acquisition a une durée plancher : 7 ans pour les constructions, 4 ans pour les équipements, 3 ans pour le matériel de transport. Barème en vigueur depuis le 1er janvier 2026."
                      source="Arrêté n° 013/CAB/MIN/FINANCES/2025, art. 2, 4, 5 et 6 · loi n° 23/053, art. 28"
                    />
                  </span>
                  <select
                    value={iNatureFiscale}
                    onChange={(e) => {
                      setINatureFiscale(e.target.value);
                      const n = bareme.find((x) => x.cle === e.target.value);
                      if (n) setIDuree(String(n.dureeAns));
                      // Le compte unique de la nature est POSÉ, modifiable ensuite ;
                      // le compte déjà choisi parmi les proposés est gardé ; plusieurs
                      // restent proposés (lib/bareme-fiscal.ts, compteSelonNature).
                      const { aPoser } = compteSelonNature(n, comptesDefinitifs(comptesBien ?? [], iPasEncoreEnService), compteBien);
                      if (aPoser) {
                        setICompteBienId(aPoser.id);
                        setIModeAcquisition('');
                        setICompteContrepartie('');
                        setICompteEnCoursId(compteEnCoursInitial(aPoser));
                      }
                    }}
                    className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal"
                  >
                    <option value="">Non précisée</option>
                    {sectionsDuBareme(naturesProposees(bareme, compteBien, toutesCategories))
                      .map((g) => (
                      <optgroup key={g.section} label={`${g.section} · ${g.intitule}`}>
                        {g.lignes.map((n) => (
                          <option key={n.cle} value={n.cle}>{n.designation} · {n.dureeAns} ans</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {/* Les catégories proposées pour le compte sont une lecture de
                      l'éditeur (compte-du-bien.ts) · jamais un refus. */}
                  <span className="flex items-center gap-1 mt-1 text-[11px] font-normal">
                    <input type="checkbox" checked={toutesCategories} onChange={(e) => setToutesCategories(e.target.checked)} />
                    Toutes les catégories
                  </span>
                  {/* La nature propose ses comptes quand ils sont plusieurs (lot 6,
                      D-4) · un clic en pose un, sans toucher à la nature ; un
                      compte unique est déjà posé au choix de la nature. */}
                  {(() => {
                    const nature = bareme.find((n) => n.cle === iNatureFiscale);
                    const { proposes } = compteSelonNature(nature, comptesDefinitifs(comptesBien ?? [], iPasEncoreEnService), compteBien);
                    // Le compte de la nature que la liste des comptes retenus ne
                    // porte pas se dit · jamais une proposition qui disparaît.
                    const absents = comptesBien ? numerosNonProposesPourNature(nature, comptesBien, compteBien) : [];
                    if (proposes.length === 0) {
                      return absents.length > 0 ? (
                        <span className="block mt-1 text-[11px] font-normal text-warning">
                          Le compte que cette catégorie propose ({absents.join(', ')}) n'est ni retenu ni utilisé · retenez-le dans
                          Plan comptable (ou ouvrez-le s'il manque au plan).
                        </span>
                      ) : null;
                    }
                    return (
                      <span className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] font-normal">
                        Compte proposé
                        {proposes.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setICompteBienId(c.id);
                              setIModeAcquisition('');
                              setICompteContrepartie('');
                              setICompteEnCoursId(compteEnCoursInitial(c));
                            }}
                            className="border border-border-dark px-1.5 py-0.5 hover:bg-sel/10"
                          >
                            {c.numero} · {c.intitule}
                          </button>
                        ))}
                        {nature?.remarque && <Aide titre="Compte proposé" texte={nature.remarque} source="Proposition de l'éditeur · aucun texte ne relie une nature du barème à un compte du plan" />}
                      </span>
                    );
                  })()}
                </label>
              )}
              <label className="text-[11.5px] font-semibold text-text-dim">
                <span className="flex items-center gap-1">
                  Durée d'amortissement (années)
                  <Aide
                    titre="Durée propre"
                    texte="La durée d'utilité du bien. Choisir la catégorie du barème la propose ; elle reste libre. Une révision majeure s'amortit sur l'intervalle qui sépare deux révisions, plus court que la durée du bien principal."
                    source="AUDCIF Titre VIII ch. 5 § 1"
                  />
                </span>
                <input
                  type="number"
                  min={1}
                  value={iDuree}
                  onChange={(e) => setIDuree(e.target.value)}
                  // Un fonds commercial sans durée est présumé non limité (§ 7.2.2.1).
                  required={!compteBien?.motifNonAmortissable && !iNonLimitee && !fondsCommercial}
                  disabled={iNonLimitee || !!iDixAns}
                  className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono"
                />
                {/* Écart au barème fiscal · signalé, jamais refusé (arrêté
                    n° 013/2025, art. 4). Le plancher de la location-acquisition
                    (art. 5) se lit sur le compte du bien, indépendamment de la
                    nature choisie. */}
                {(() => {
                  const duree = iDuree ? Number(iDuree) : null;
                  const alertes = [
                    avertissementEcartBareme(
                      duree,
                      bareme.find((n) => n.cle === iNatureFiscale),
                      exerciceCourant?.dateFin,
                    ),
                    avertissementPlancherLocationAcquisition(
                      duree,
                      utilisateur?.tenant?.referentiel,
                      compteBien?.numero,
                      exerciceCourant?.dateFin,
                    ),
                  ].filter((a): a is string => !!a);
                  return alertes.map((a) => (
                    <span key={a} className="block mt-1 text-[11px] font-normal text-warning">{a}</span>
                  ));
                })()}
              </label>
              {incorporelSyscohada && !enLA && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11.5px] font-semibold text-text-dim flex items-center gap-1.5">
                    <input type="checkbox" checked={iNonLimitee} onChange={(e) => setINonLimitee(e.target.checked)} />
                    Durée d'utilité non limitée
                    <Aide
                      titre="Durée d'utilité non limitée"
                      texte="Un incorporel sans fin prévisible n'est pas amorti · marque protégée, droit à durée indéterminable, nom de domaine. Il faut le démontrer. Un fonds commercial saisi sans durée est présumé non limité. Frais de développement, brevets, licences, logiciels, sites internet, droit au bail et coûts d'obtention du contrat s'amortissent toujours. La dépréciation reste ouverte, et la durée devenue limitée se déclare sur la fiche."
                      source="AUDCIF Titre VIII ch. 2 § 1.3.3, § 3.2.2, § 4.2.2, § 7.2.2.1"
                    />
                  </label>
                  {iNonLimitee && !fondsCommercial && (
                    <input
                      required
                      placeholder="Ce qui démontre l'absence de fin prévisible"
                      value={iJustifNonLimitee}
                      onChange={(e) => setIJustifNonLimitee(e.target.value)}
                      className="w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal"
                    />
                  )}
                  {iNonLimitee && compteBien?.numero.startsWith('2132') && (
                    <label className="text-[11.5px] font-normal flex items-center gap-1.5">
                      <input type="checkbox" checked={iNomDeDomaine} onChange={(e) => setINomDeDomaine(e.target.checked)} />
                      Nom de domaine
                    </label>
                  )}
                  {fondsCommercial && !iNonLimitee && (
                    <select value={iDixAns} onChange={(e) => setIDixAns(e.target.value as typeof iDixAns)} className="w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                      <option value="">Durée déclarée, ou présumée non limitée sans durée</option>
                      <option value="NON_ESTIMABLE">Dix ans · durée limitée non estimable</option>
                      {utilisateur?.tenant?.systemeComptableSyscohada === 'MINIMAL_TRESORERIE' && (
                        <option value="SIMPLIFICATION_SMT">Dix ans · simplification du Système minimal</option>
                      )}
                    </select>
                  )}
                </div>
              )}
              {fraisDeveloppement && !enLA && !iRepris && (
                <CriteresFraisDeveloppement
                  saisie={iCriteresRd}
                  dateReunion={iDateCriteresRd}
                  onChange={(saisie, date) => {
                    setICriteresRd(saisie);
                    setIDateCriteresRd(date);
                  }}
                />
              )}
              {!enLA && (
              <>
              {unitesServies && (
                <label className="text-[11.5px] font-semibold text-text-dim">
                  <span className="flex items-center gap-1">
                    Mode d'amortissement
                    <Aide
                      titre="Mode d'amortissement"
                      texte="Linéaire par défaut. Aux unités d'œuvre, la dotation suit l'usage : base amortissable × unités consommées / total d'unités prévues, sans prorata temporis. En dégressif (associations seulement), le taux est celui de la loi n° 23/053 : taux linéaire × 1,5 (4 ans), 2 (5 et 6 ans) ou 2,5 (au-delà), appliqué à la valeur restant à amortir, première annuité au prorata du mois de mise en service, puis bascule au linéaire quand celui-ci devient plus fort ; durée de 4 à 20 ans, incorporels exclus."
                      source="AUDCIF art. 45 et Titre VI ; SYCEBNL fiche du compte 28 ; loi n° 23/053 art. 32 à 35"
                    />
                  </span>
                  <select value={iMode} onChange={(e) => setIMode(e.target.value as typeof iMode)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                    <option value="LINEAIRE">Linéaire</option>
                    <option value="UNITES_DOEUVRE">Unités d'œuvre</option>
                    {!syscohada && <option value="DEGRESSIF">Dégressif</option>}
                  </select>
                </label>
              )}
              {unitesServies && modeRetenu === 'UNITES_DOEUVRE' && (
                <>
                  <label className="text-[11.5px] font-semibold text-text-dim">
                    Total d'unités prévues
                    <input required type="number" min={1} value={iUnites} onChange={(e) => setIUnites(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
                  </label>
                  <label className="text-[11.5px] font-semibold text-text-dim">
                    Unité (km, heures, pièces…)
                    <input required value={iUniteLibelle} onChange={(e) => setIUniteLibelle(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal" />
                  </label>
                </>
              )}
              <label className="text-[11.5px] font-semibold text-text-dim flex items-center gap-1.5 self-end pb-1.5">
                <input type="checkbox" checked={iReserve} onChange={(e) => setIReserve(e.target.checked)} />
                Réserve de propriété
                <Aide
                  titre="Réserve de propriété"
                  texte="Le bien acheté sous clause de réserve de propriété entre à l'actif comme si l'entité en était propriétaire, et s'amortit comme tel. La clause est une information · son montant est indiqué aux Notes annexes jusqu'au règlement final. Une dette au compte Réserve de propriété (4816) la pose d'office."
                  source={syscohada ? 'AUDCIF, Titre VIII ch. 9' : 'SYCEBNL, cadre conceptuel § 3.3.1.1.6'}
                />
              </label>
              </>
              )}
              {!enLA && (
              <>
              <label className="text-[11.5px] font-semibold text-text-dim flex items-center gap-1.5 self-end pb-1.5">
                <input type="checkbox" checked={iRepris} onChange={(e) => setIRepris(e.target.checked)} />
                Bien repris (déjà au bilan d'ouverture)
                <Aide
                  titre="Bien repris"
                  texte="Un bien acquis avant l'ouverture de l'exercice est déjà porté au bilan d'ouverture, compte 2x et compte 28 compris. Sa fiche est créée sans écriture d'acquisition, qui doublerait sa valeur brute. Un bien acquis dans l'exercice n'est pas repris : son écriture d'acquisition est passée à la création."
                  source="Immobilisations"
                />
              </label>
              {iRepris ? (
                <label className="text-[11.5px] font-semibold text-text-dim">
                  <span className="flex items-center gap-1">
                    Amortissement déjà pratiqué
                    <Aide
                      titre="Amortissement déjà pratiqué"
                      texte="Le cumul déjà porté au compte 28 pour ce bien à l'ouverture de l'exercice. Sans lui, le bien s'amortirait sa durée entière une seconde fois."
                      source="Immobilisations"
                    />
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={iAmortissementAnterieur}
                    onChange={(e) => setIAmortissementAnterieur(e.target.value)}
                    className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono"
                  />
                </label>
              ) : (
                <>
                  <label className="text-[11.5px] font-semibold text-text-dim">
                    <span className="flex items-center gap-1">
                      Mode d'acquisition
                      <Aide
                        titre="Mode d'acquisition"
                        texte="Comment le bien arrive : achat à crédit ou au comptant, apport, don ou subvention en nature, production propre, travaux en cours achevés. Il range les contreparties que la fiche du compte du bien admet ; la liste reste fermée."
                        source="Fiches des comptes 21 à 24"
                      />
                    </span>
                    <select
                      required
                      disabled={!iCompteBienId}
                      value={iModeAcquisition}
                      onChange={(e) => {
                        setIModeAcquisition(e.target.value);
                        setICompteContrepartie('');
                      }}
                      className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal"
                    >
                      <option value="">{iCompteBienId ? '' : 'Choisissez d’abord le compte du bien'}</option>
                      {modesAcquisition.map((m) => (
                        <option key={m.mode} value={m.mode}>{m.libelle}</option>
                      ))}
                    </select>
                    {iCompteBienId && contrepartiesAdmises !== null && modesAcquisition.length === 0 && (
                      <span className="block text-warning font-normal">
                        Aucune contrepartie que la fiche de ce compte admet n'est retenue ni utilisée · retenez dans Plan comptable
                        le compte de trésorerie, de fournisseur d'investissements ou d'apport qui règle le bien (ou ouvrez-le s'il
                        manque au plan).
                      </span>
                    )}
                  </label>
                  <label className="text-[11.5px] font-semibold text-text-dim">
                    Contrepartie
                    <select required disabled={!iModeAcquisition} value={iCompteContrepartie} onChange={(e) => setICompteContrepartie(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                      <option value="" />
                      {contrepartiesDuMode.map((c) => (
                        <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              </>
              )}
              {enLA && (
                <ChampsLocationAcquisition
                  compteImmobilisationId={iCompteBienId}
                  saisie={contratLA}
                  onChange={setContratLA}
                  contreparties={contrepartiesAdmises}
                />
              )}
            </div>
            {/* APPROCHE PAR COMPOSANTS · facultative. Laisser le principal vide crée
                une immobilisation ordinaire, c'est-à-dire une STRUCTURE au sens du
                ch. 4 § 1. Le renseigner rattache le bien et lui garde son PROPRE
                plan d'amortissement, ce qui est tout l'objet du chapitre. */}
  {!enLA && (
  <>
  {composantsServis && (
            <div className="border-t border-border pt-3 mb-3">
              <label className="text-[11.5px] font-semibold text-text-dim mb-2 flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={estComposant}
                  onChange={(e) => {
                    setEstComposant(e.target.checked);
                    if (!e.target.checked) setIPrincipal('');
                  }}
                />
                Ce bien est un composant d’un autre bien
                <Aide
                  titre="Approche par composants"
                  texte="Un composant est une immobilisation à part entière, rattachée à son bien principal, avec son propre plan d’amortissement. Une pièce de SÉCURITÉ s’amortit dès l’acquisition du bien principal, qu’elle serve ou non ; une pièce de RECHANGE seulement à partir du jour où elle y est intégrée. Un composant ne porte pas de valeur résiduelle, sauf s’il s’agit du dernier renouvellement avant la fin d’utilisation du bien."
                  source="AUDCIF Titre VIII ch. 4 § 1, § 3.3 et § 4.3"
                />
              </label>
              {estComposant && (
              <>
              <div className="grid grid-cols-3 gap-3">
                <label className="text-[11.5px] font-semibold text-text-dim">
                  Immobilisation principale
                  <select value={iPrincipal} onChange={(e) => setIPrincipal(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                    <option value="">Aucune · bien autonome</option>
                    {principaux.map((i) => (
                      <option key={i.id} value={i.id}>{i.designation}</option>
                    ))}
                  </select>
                </label>
                {iPrincipal && (
                  <label className="text-[11.5px] font-semibold text-text-dim">
                    Nature
                    <select value={iTypeComposant} onChange={(e) => setITypeComposant(e.target.value as TypeComposant)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                      <option value="COMPOSANT">Composant</option>
                      <option value="DEMANTELEMENT">Démantèlement et remise en état du site</option>
                      <option value="REVISION_MAJEURE">Révision majeure</option>
                      <option value="PIECE_DE_RECHANGE">Pièce de rechange</option>
                      <option value="PIECE_DE_SECURITE">Pièce de sécurité</option>
                    </select>
                  </label>
                )}
              </div>
              {iPrincipal && (
                <>
                  <label className="block text-[11.5px] font-semibold text-text-dim mt-3">
                    Pourquoi ce bien est décomposable
                    <input
                      maxLength={500}
                      value={iJustification}
                      onChange={(e) => setIJustification(e.target.value)}
                      placeholder="Durées d’utilité distinctes, coût significatif, informations disponibles sur chaque élément…"
                      className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal"
                    />
                  </label>
                  {iTypeComposant === 'DEMANTELEMENT' && (
                    <ParametresDemantelement
                      coutFutur={iCoutFuturDem}
                      tauxPourcent={iTauxDem}
                      annees={iDuree}
                      onChange={(cout, taux) => {
                        setICoutFuturDem(cout);
                        setITauxDem(taux);
                      }}
                      onValeurProposee={(v) => setIValeurOrigine(String(v))}
                    />
                  )}
                </>
              )}
              </>
              )}
            </div>
            )}
  </>
  )}
            <div className="flex gap-2">
              <button type="submit" disabled={envoi || !exerciceCourant} className="bg-sel text-white text-[11.5px] font-semibold px-4 py-1.5 disabled:opacity-50">{envoi ? 'Création…' : 'Ajouter'}</button>
              <button type="button" onClick={() => setAfficherFormImmo(false)} className="text-[11.5px] font-semibold text-text-dim px-4 py-1.5">Annuler</button>
            </div>
          </form>
        )}

        {!immobilisations && <div className="text-[11.5px] text-text-dim">Chargement…</div>}

        {immobilisations && (
          <div
            // `overflow-x-auto` ici, `min-w` sur les lignes · les 868 px de colonnes
            // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
            // fenêtre à 360 px, et sans conteneur le débordement remontait à la fenêtre,
            // qui emportait alors titre, onglets et boutons hors de l'écran.
            className="border border-border bg-surface shadow-posee max-w-[1180px] overflow-x-auto"
          >
            <div className="grid grid-cols-[1.4fr_110px_100px_100px_100px_100px_90px_170px] min-w-[1020px] gap-2.5 px-3.5 py-1.5 bg-chrome border-b border-border text-[11px] font-bold text-text-dim">
              <span>Désignation</span>
              <span>Mise en service</span>
              <span className="text-right">v. origine</span>
              <span className="text-right">Cumul amorti</span>
              <span className="text-right">V.N.C.</span>
              <span>Durée</span>
              <span>STATUT</span>
              <span />
            </div>
            {immobilisations.map((immo, i) => (
              <div key={immo.id}>
                <div
                  className={`grid grid-cols-[1.4fr_110px_100px_100px_100px_100px_90px_170px] min-w-[1020px] gap-2.5 px-3.5 py-1.5 items-center border-b border-border text-[11.5px] ${
                    i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
                  }`}
                >
                  <span className="truncate">
                    {immo.designation}{immo.numeroInventaire ? ` (${immo.numeroInventaire})` : ''}
                    {/* Le rattachement est ce qui manquait · le montrer sur la ligne
                        évite qu'un composant se lise comme un bien autonome. */}
                    {immo.immobilisationPrincipaleId && (
                      <span className="block text-[11px] text-text-dim">
                        composant de {nomPrincipal(immo.immobilisationPrincipaleId) ?? '…'}
                      </span>
                    )}
                    {/* Le lieu se change ici · un déplacement n'a aucun effet comptable. */}
                    {peutEcrire && lieux.length > 0 && immo.statut === 'EN_SERVICE' ? (
                      <select
                        aria-label={`Lieu de ${immo.designation}`}
                        value={immo.lieuId ?? ''}
                        onChange={(e) => void deplacer(immo, e.target.value)}
                        className="block mt-0.5 text-[11px] text-text-dim bg-transparent border-0 p-0"
                      >
                        <option value="">Non placé</option>
                        {lieux.map((l) => (
                          <option key={l.id} value={l.id}>{l.code} · {l.intitule}</option>
                        ))}
                      </select>
                    ) : (
                      immo.lieu && <span className="block text-[11px] text-text-dim">{immo.lieu.code} · {immo.lieu.intitule}</span>
                    )}
                  </span>
                  {/* Sans date, le bien est acquis et pas encore en service
                      (AUDCIF art. 45) · jamais new Date(null), qui rendrait 1970. */}
                  <span className="font-mono text-[11px] text-text-dim">
                    {immo.dateMiseEnService ? new Date(immo.dateMiseEnService).toLocaleDateString('fr-FR') : 'Non mis en service'}
                    {immo.compteEnCours && !immo.dateMiseEnService && (
                      <span className="block" title="Compte en cours où le bien est inscrit jusqu’à sa mise en service">
                        En cours · {immo.compteEnCours.numero}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-right">{montant(immo.valeurOrigine)}</span>
                  <span className="font-mono text-right">{montant(cumulAmorti(immo))}</span>
                  <span className="font-mono text-right font-semibold">{montant(vcn(immo))}</span>
                  <span className="font-mono text-[11px] text-text-dim">
                    {immo.modeAmortissement === 'UNITES_DOEUVRE'
                      ? `${(immo.unitesOeuvrePrevues ?? 0).toLocaleString('fr-FR')} ${immo.uniteOeuvreLibelle ?? ''}`
                      : immo.dureeNonLimitee
                        ? 'Non limitée'
                        : `${immo.dureeAmortissementAns} ans${immo.modeAmortissement === 'DEGRESSIF' ? ' · dégressif' : ''}`}
                  </span>
                  <span
                    className={`font-mono text-[11px] font-bold px-1.5 py-0.5 w-fit ${
                      immo.statut === 'EN_SERVICE' ? 'text-positive bg-positive-soft' : 'text-text-dim bg-surface-alt'
                    }`}
                  >
                    {LIBELLE_STATUT[immo.statut]}
                  </span>
                  <span className="flex gap-2">
                    {immo.statut === 'EN_SERVICE' && (
                      <>
                        {/* L'estimation est un GET qui n'écrit rien · elle reste
                            offerte à la lecture seule. */}
                        {revisionServie && !immo.immobilisationPrincipaleId && (
                          <button
                            onClick={() => reconstituerRevision(immo)}
                            title="Estimer un composant « révisions majeures » jamais identifié (AUDCIF ch. 5 § 1)"
                            className="text-[11px] text-sel hover:underline"
                          >
                            Révision
                          </button>
                        )}
                      </>
                    )}
                    {peutEcrire && immo.statut === 'EN_SERVICE' && (
                      <>
                        {immo.modeAmortissement === 'UNITES_DOEUVRE' && (
                          <button
                            onClick={() => saisirConsommation(immo)}
                            title="Saisir les unités d’œuvre consommées sur cet exercice"
                            className="text-[11px] text-sel hover:underline"
                          >
                            Relevé
                          </button>
                        )}
                        {!immo.dateMiseEnService && (
                          <button
                            onClick={() => {
                              setMsDate(new Date().toISOString().slice(0, 10));
                              setMiseEnServiceOuvertePour(miseEnServiceOuvertePour === immo.id ? null : immo.id);
                            }}
                            title="Poser la date de mise en service · une fois, jamais avant l'acquisition (AUDCIF art. 45)"
                            className="text-[11px] text-sel hover:underline"
                          >
                            Mettre en service
                          </button>
                        )}
                        <button
                          onClick={() => passerDotation(immo.id)}
                          disabled={!immo.dateMiseEnService || dejaDoteeCetExercice(immo)}
                          title={
                            !immo.dateMiseEnService
                              ? 'Aucune dotation avant la mise en service (AUDCIF art. 45)'
                              : dejaDoteeCetExercice(immo)
                                ? 'Déjà dotée pour cet exercice'
                                : 'Passer la dotation de cet exercice'
                          }
                          className="text-[11px] text-sel hover:underline disabled:opacity-40 disabled:no-underline"
                        >
                          Doter
                        </button>
                        {immo.immobilisationPrincipaleId && (
                          <button
                            onClick={() =>
                              setRenouvellementOuvertPour(renouvellementOuvertPour === immo.id ? null : immo.id)
                            }
                            title="Sortir ce composant de l’actif et porter son remplaçant"
                            className="text-[11px] text-sel hover:underline"
                          >
                            Renouveler
                          </button>
                        )}
                        {peutEcrire && immo.dureeNonLimitee && immo.statut === 'EN_SERVICE' && (
                          <button
                            onClick={() => setBasculeOuvertePour(basculeOuvertePour === immo.id ? null : immo.id)}
                            title="La durée d'utilité devient limitée · l'incorporel s'amortit à compter de la décision"
                            className="text-[11px] text-sel hover:underline"
                          >
                            Durée limitée
                          </button>
                        )}
                        {peutEcrire && !immo.dureeNonLimitee && immo.dateMiseEnService && immo.modeAmortissement !== 'UNITES_DOEUVRE' && (
                          <button
                            onClick={() => setRevisionPlanOuvertePour(revisionPlanOuvertePour === immo.id ? null : immo.id)}
                            title="Réviser la durée du plan d'amortissement · prospective, ou rétroactive avec reprise au 798"
                            className="text-[11px] text-sel hover:underline"
                          >
                            Réviser le plan
                          </button>
                        )}
                        {peutEcrire && immo.statut === 'EN_SERVICE' && /^2[1-4]/.test(immo.compteImmobilisation?.numero ?? '') && (
                          <button
                            onClick={() => setCoutsEmpruntOuvertsPour(coutsEmpruntOuvertsPour === immo.id ? null : immo.id)}
                            title="Incorporer au coût du bien les intérêts d'emprunt de sa période de préparation"
                            className="text-[11px] text-sel hover:underline"
                          >
                            Coûts d'emprunt
                          </button>
                        )}
                        {peutEcrire && immo.typeComposant === 'DEMANTELEMENT' && (
                          <button
                            onClick={() => setProvisionDemOuvertePour(provisionDemOuvertePour === immo.id ? null : immo.id)}
                            title="Désactualiser ou reprendre la provision pour démantèlement"
                            className="text-[11px] text-sel hover:underline"
                          >
                            Provision
                          </button>
                        )}
                        {peutEcrire && syscohada && immo.natureAcquisitionAleatoire && !immo.ecritureSoldeDetteAleatoireId && (
                          <button
                            onClick={() => setSoldeDetteOuvertPour(soldeDetteOuvertPour === immo.id ? null : immo.id)}
                            title={immo.natureAcquisitionAleatoire === 'RENTE_VIAGERE' ? 'Éteindre la rente au décès du crédirentier' : "Constater l'écart entre les redevances versées et le montant estimé"}
                            className="text-[11px] text-sel hover:underline"
                          >
                            Solder la dette
                          </button>
                        )}
                        {peutEcrire && immo.statut === 'EN_SERVICE' && (
                          <button
                            onClick={() => setReserveOuvertePour(reserveOuvertePour === immo.id ? null : immo.id)}
                            title="Déclarer la clause de réserve de propriété, ou la date du règlement final"
                            className="text-[11px] text-sel hover:underline"
                          >
                            Réserve de propriété
                          </button>
                        )}
                        {peutEcrire && !immo.immobilisationPrincipaleId && immo.statut === 'EN_SERVICE' && (
                          <button
                            onClick={() => setRemplacementOuvertPour(remplacementOuvertPour === immo.id ? null : immo.id)}
                            title="Remplacer une partie qui n'avait pas été identifiée comme composant"
                            className="text-[11px] text-sel hover:underline"
                          >
                            Remplacement imprévu
                          </button>
                        )}
                        {syscohada && (
                          <button
                            onClick={() => setFiscalOuvertPour(fiscalOuvertPour === immo.id ? null : immo.id)}
                            title="Dégressif fiscal et amortissement dérogatoire"
                            className="text-[11px] text-sel hover:underline"
                          >
                            Fiscal
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setReclassementOuvertPour(reclassementOuvertPour === immo.id ? null : immo.id);
                            // Un seul 29 retenu ou utilisé · proposé, modifiable (§ 9 ter).
                            setRcCompte29(compteUnique((comptesClasse2 ?? []).filter((c) => c.numero.startsWith('29'))));
                          }}
                          title="Changer la catégorie du bien sans toucher à sa valeur comptable"
                          className="text-[11px] text-sel hover:underline"
                        >
                          Reclasser
                        </button>
                        <button
                          onClick={() => {
                            setDepreciationOuvertePour(depreciationOuvertePour === immo.id ? null : immo.id);
                            // Un seul 29 pour la division du bien · proposé.
                            const c29 = comptes29DuBien(comptes29 ?? [], immo.compteImmobilisation?.numero);
                            setDCompte29(compteUnique(c29));
                            // La contrepartie unique se présélectionne aussi (§ 9 ter).
                            setDContrepartie(compteUnique(contrepartiesDepreciation(comptesFinancement ?? [], syscohada, dSens)));
                          }}
                          title="Constater une perte de valeur, ou en reprendre une"
                          className="text-[11px] text-sel hover:underline"
                        >
                          Déprécier
                        </button>
                        <button
                          onClick={() => setSortieOuvertePour(sortieOuvertePour === immo.id ? null : immo.id)}
                          className="text-[11px] text-sel hover:underline"
                        >
                          Sortir
                        </button>
                        <button
                          onClick={() => setEchangeOuvertPour(echangeOuvertPour === immo.id ? null : immo.id)}
                          title="Céder le bien en échange d'un autre"
                          className="text-[11px] text-sel hover:underline"
                        >
                          Échanger
                        </button>
                      </>
                    )}
                  </span>
                </div>
                {fiscalOuvertPour === immo.id && (
                  <PlanFiscalDegressif
                    immoId={immo.id}
                    journalId={(journaux.find((j) => j.code === 'OD') ?? journaux[0])?.id}
                    exerciceId={exerciceCourant?.id}
                    peutEcrire={peutEcrire}
                  />
                )}
                {reclassementOuvertPour === immo.id && (
                  <form onSubmit={(e) => onReclasser(e, immo.id)} className="bg-chrome border-b border-border px-4 py-3">
                    {/* Ch. 10 § 2.4 · « Étant donné que les immeubles de placement sont
                        évalués selon le modèle du coût historique, les transferts […]
                        n'ont pas d'incidence sur la valeur comptable du bien immobilier
                        transféré. » D'où l'absence de tout champ de montant : le laisser
                        saisir inviterait à recalculer ce que le texte veut inchangé. */}
                    <p className="text-[11px] text-text-dim leading-[1.55] mb-2">
                      Le bien prend les comptes de sa nouvelle famille. Sa valeur d’origine, son amortissement cumulé
                      et sa dépréciation sont VIRÉS tels quels, sans être recalculés : la valeur comptable nette ne
                      bouge pas et aucune ligne de résultat n’est touchée. Un reclassement n’est ni une cession, ni une
                      dépréciation.
                    </p>
                    <p className="text-[11px] text-text-dim leading-[1.55] mb-2">
                      Le transfert vers les STOCKS, que le texte nomme aussi, ne passe pas par ici : un bien qui passe
                      en stock quitte le module · sortez-le, puis composez l’écriture de stock.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-text-dim">Nouvelle famille</span>
                        <select
                          value={rcFamille}
                          onChange={(e) => setRcFamille(e.target.value)}
                          required
                          className="border border-border rounded-[3px] bg-surface px-2 py-1 text-[11.5px]"
                        >
                          <option value="">Choisir…</option>
                          {(familles ?? [])
                            .filter((f) => f.id !== immo.familleId)
                            .map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.code} · {f.intitule}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-text-dim">DATE</span>
                        <input
                          type="date"
                          value={rcDate}
                          onChange={(e) => setRcDate(e.target.value)}
                          required
                          className="border border-border rounded-[3px] bg-surface px-2 py-1 text-[11.5px]"
                        />
                      </label>
                      {cumulDeprecie(immo) > 0 && (
                        <label className="flex flex-col gap-1 sm:col-span-2">
                          <span className="text-[11px] font-bold text-text-dim">
                            Compte 29 de destination
                          </span>
                          <select
                            value={rcCompte29}
                            onChange={(e) => setRcCompte29(e.target.value)}
                            required
                            className="border border-border rounded-[3px] bg-surface px-2 py-1 text-[11.5px]"
                          >
                            <option value="">Choisir…</option>
                            {(comptesClasse2 ?? [])
                              .filter((c) => c.numero.startsWith('29'))
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.numero} · {c.intitule}
                                </option>
                              ))}
                          </select>
                          {comptesClasse2 && (
                            <span className="text-[11px] text-warning">
                              {motifAucunCompteRetenu(comptesClasse2.filter((c) => c.numero.startsWith('29')), 'de dépréciation (29)')}
                            </span>
                          )}
                          <span className="text-[11px] text-text-dim leading-[1.5]">
                            Ce bien porte une dépréciation. Le compte n’est pas déduit du nouveau compte
                            d’immobilisation : le logiciel ne connaît pas la subdivision que votre dossier a ouverte,
                            et un 29 deviné serait un compte faux dans une balance juste.
                          </span>
                        </label>
                      )}
                      {versFraisDeveloppement(immo.id) && (
                        <div className="sm:col-span-2 grid grid-cols-3 gap-3">
                          <CriteresFraisDeveloppement
                            saisie={rcCriteresRd}
                            dateReunion={rcDateCriteresRd}
                            onChange={(saisie, date) => {
                              setRcCriteresRd(saisie);
                              setRcDateCriteresRd(date);
                            }}
                          />
                        </div>
                      )}
                      {/* Le libellé reste un intitulé métier · la raison de
                          l'obligation, avec ses paragraphes, est une aide posée
                          sous le champ, hors du libellé (titres formels). */}
                      <div className="flex flex-col gap-1 sm:col-span-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-bold text-text-dim">Motif du changement d’utilisation</span>
                          <input
                            value={rcMotif}
                            onChange={(e) => setRcMotif(e.target.value)}
                            required
                            placeholder="Ce que le bien sert désormais, et depuis quand"
                            className="border border-border rounded-[3px] bg-surface px-2 py-1 text-[11.5px]"
                          />
                        </label>
                        <span className="text-[11px] text-text-dim leading-[1.5]">
                          Obligatoire · le § 1.2 qualifie un immeuble de placement par l’USAGE, que nul solde ne
                          porte, et le § 4.2 en fait une information de Notes annexes.
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="submit"
                        disabled={envoi}
                        className="bg-sel text-white text-[11.5px] font-bold px-3.5 py-1.5 rounded-[3px] disabled:opacity-50"
                      >
                        Reclasser
                      </button>
                      <button
                        type="button"
                        onClick={() => setReclassementOuvertPour(null)}
                        className="border border-border rounded-[3px] bg-surface px-3 py-1.5 text-[11.5px]"
                      >
                        Annuler
                      </button>
                    </div>
                  </form>
                )}

                {revisionPlanOuvertePour === immo.id && (
                  <RevisionPlanAmortissement
                    bien={immo}
                    journaux={journaux}
                    onFermer={() => setRevisionPlanOuvertePour(null)}
                    onFait={(message) => {
                      setRevisionPlanOuvertePour(null);
                      setInfo(message);
                      void charger();
                    }}
                  />
                )}
                {soldeDetteOuvertPour === immo.id && (
                  <SoldeDetteAleatoire
                    bien={immo}
                    exerciceId={exerciceCourant?.id ?? null}
                    journaux={journaux}
                    onFermer={() => setSoldeDetteOuvertPour(null)}
                    onFait={(message) => {
                      setSoldeDetteOuvertPour(null);
                      setInfo(message);
                      void charger();
                    }}
                  />
                )}
                {reserveOuvertePour === immo.id && (
                  <ReserveProprieteBien
                    bien={immo}
                    syscohada={syscohada}
                    onFermer={() => setReserveOuvertePour(null)}
                    onFait={(message) => {
                      setReserveOuvertePour(null);
                      setInfo(message);
                      void charger();
                    }}
                  />
                )}
                {coutsEmpruntOuvertsPour === immo.id && (
                  <CoutsEmpruntIncorpores
                    bien={immo}
                    exerciceId={exerciceCourant?.id ?? null}
                    referentiel={syscohada ? 'SYSCOHADA' : 'SYCEBNL'}
                    journaux={journaux}
                    onFermer={() => setCoutsEmpruntOuvertsPour(null)}
                    onFait={(message) => {
                      setCoutsEmpruntOuvertsPour(null);
                      setInfo(message);
                      void charger();
                    }}
                  />
                )}
                {provisionDemOuvertePour === immo.id && (
                  <ProvisionDemantelement
                    bien={immo}
                    exerciceId={exerciceCourant?.id ?? null}
                    journaux={journaux}
                    onFermer={() => setProvisionDemOuvertePour(null)}
                    onFait={(message) => {
                      setProvisionDemOuvertePour(null);
                      setInfo(message);
                      void charger();
                    }}
                  />
                )}
                {basculeOuvertePour === immo.id && (
                  <BasculeDureeLimitee
                    bien={immo}
                    fondsCommercial={!!immo.compteImmobilisation?.numero.startsWith('215')}
                    onFermer={() => setBasculeOuvertePour(null)}
                    onFait={(message) => {
                      setBasculeOuvertePour(null);
                      setInfo(message);
                      void charger();
                    }}
                  />
                )}
                {remplacementOuvertPour === immo.id && (
                  <RemplacementImprevu
                    structure={immo}
                    exerciceId={exerciceCourant?.id}
                    journaux={journaux}
                    onFermer={() => setRemplacementOuvertPour(null)}
                    onFait={(message) => {
                      setRemplacementOuvertPour(null);
                      setInfo(message);
                      void charger();
                    }}
                  />
                )}
                {renouvellementOuvertPour === immo.id && (
                  <form onSubmit={(e) => onRenouveler(e, immo.id)} className="bg-chrome border-b border-border px-4 py-3">
                    {/* Les deux mouvements vont ensemble · AUDCIF ch. 4 § 4.1. Porter le
                        nouveau sans sortir l'ancien laisse deux ascenseurs au bilan pour
                        une seule cage, et l'écriture reste pourtant équilibrée. */}
                    <div className="grid grid-cols-4 gap-3 items-end">
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        <span className="flex items-center gap-1">
                          Désignation du remplaçant
                          <Aide
                            titre="Renouvellement"
                            texte={`La valeur nette comptable de « ${immo.designation} » sort de l’actif, et le remplaçant est porté au même bien principal avec son propre plan. La durée est saisie : elle court jusqu’au prochain remplacement, ou jusqu’à la fin d’utilisation de la structure si celui-ci est le dernier.`}
                            source="AUDCIF Titre VIII ch. 4 § 4.1"
                          />
                        </span>
                        <input required value={rDesignation} onChange={(e) => setRDesignation(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]" />
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Coût
                        <input required type="number" step="0.01" min={0.01} value={rCout} onChange={(e) => setRCout(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px] font-mono" />
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Durée (ans)
                        <input required type="number" min={1} value={rDuree} onChange={(e) => setRDuree(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px] font-mono" />
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Date
                        <input required type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px] font-mono" />
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
                        Contrepartie
                        {/* Le remplaçant naît par `creer`, sur la famille et le type
                            du composant remplacé · la liste fermée de la fiche du
                            compte du bien, jamais tout le plan (`lib/regle-par.ts`). */}
                        <ChampReglePar
                          cibles={[{ familleId: immo.familleId, typeComposant: immo.typeComposant ?? 'COMPOSANT' }]}
                          value={rContrepartie}
                          onChange={setRContrepartie}
                          className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]"
                        />
                      </label>
                      {/* L'ancien composant sort en mise hors service, avec son écart. */}
                      <EcartReevaluationSortie
                        immobilisationId={immo.id}
                        type="MISE_HORS_SERVICE"
                        compteReserve={sCompteReserve}
                        setCompteReserve={setSCompteReserve}
                      />
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button type="submit" disabled={envoi} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50">{envoi ? '…' : 'Renouveler'}</button>
                      <button type="button" onClick={() => setRenouvellementOuvertPour(null)} className="text-[11.5px] font-semibold text-text-dim px-3 py-1.5">Annuler</button>
                    </div>
                  </form>
                )}
                {depreciationOuvertePour === immo.id && (
                  <form onSubmit={(e) => onDeprecier(e, immo.id)} className="bg-chrome border-b border-border px-4 py-3">
                    <div className="grid grid-cols-4 gap-3 items-end">
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        <span className="flex items-center gap-1">
                          Sens
                          <Aide
                            titre="Dépréciation"
                            texte="L’actif se déprécie lorsque sa valeur nette comptable dépasse sa valeur actuelle. Le montant et l’indice sont saisis : le logiciel ne connaît ni le marché, ni l’usage du bien. Une dotation ré-étale le plan d’amortissement sur la durée restant à courir."
                            source="AUDCIF art. 46 et Titre VIII ch. 12"
                          />
                        </span>
                        <select
                          value={dSens}
                          onChange={(e) => {
                            const sens = e.target.value as 'DOTATION' | 'REPRISE';
                            setDSens(sens);
                            // La contrepartie dépend du sens · celle de l'autre sens se retire, une seule se propose.
                            setDContrepartie(compteUnique(contrepartiesDepreciation(comptesFinancement ?? [], syscohada, sens)));
                          }}
                          className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]"
                        >
                          <option value="DOTATION">Dotation</option>
                          <option value="REPRISE">Reprise</option>
                        </select>
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Montant
                        <input required type="number" step="0.01" min={0.01} value={dMontant} onChange={(e) => setDMontant(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px] font-mono" />
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Compte de dépréciation (29)
                        <select required value={dCompte29} onChange={(e) => setDCompte29(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]">
                          <option value="" />
                          {comptes29DuBien(comptes29 ?? [], immo.compteImmobilisation?.numero).map((c) => (
                            <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                          ))}
                        </select>
                        {comptes29 && comptes29DuBien(comptes29, immo.compteImmobilisation?.numero).length === 0 && (
                          <span className="block text-[11px] font-normal text-warning">
                            Aucun compte 29 au plan du dossier · ouvrez celui de la division du bien dans Plan comptable.
                          </span>
                        )}
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Contrepartie ({racinesContrepartieDepreciation(syscohada, dSens).join(', ')})
                        <select required value={dContrepartie} onChange={(e) => setDContrepartie(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]">
                          <option value="" />
                          {contrepartiesDepreciation(comptesFinancement ?? [], syscohada, dSens).map((c) => (
                            <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                          ))}
                        </select>
                        {comptesFinancement && (
                          <span className="block text-[11px] font-normal text-warning">
                            {motifAucunCompteRetenu(
                              contrepartiesDepreciation(comptesFinancement, syscohada, dSens),
                              `de ${dSens === 'DOTATION' ? 'dotation' : 'reprise'} (${racinesContrepartieDepreciation(syscohada, dSens).join(', ')})`,
                            )}
                          </span>
                        )}
                      </label>
                    </div>
                    {dSens === 'REPRISE' && exerciceCourant && (
                      <PlafondRepriseDepreciation immobilisationId={immo.id} exerciceId={exerciceCourant.id} />
                    )}
                    <label className="block text-[11.5px] font-semibold text-text-dim mt-3">
                      Indice de perte de valeur
                      <input
                        required
                        maxLength={500}
                        value={dIndice}
                        onChange={(e) => setDIndice(e.target.value)}
                        placeholder="Baisse du prix du marché, obsolescence, dégradation physique, mise hors service prévue…"
                        className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]"
                      />
                    </label>
                    <div className="flex gap-2 mt-3">
                      <button type="submit" disabled={envoi} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50">{envoi ? '…' : 'Enregistrer'}</button>
                      <button type="button" onClick={() => setDepreciationOuvertePour(null)} className="text-[11.5px] font-semibold text-text-dim px-3 py-1.5">Annuler</button>
                    </div>
                  </form>
                )}
                {echangeOuvertPour === immo.id && (
                  <EchangeImmobilisation
                    immobilisationId={immo.id}
                    designationAncien={immo.designation}
                    comptesBien={comptesBien}
                    comptesDetail={comptesFinancement}
                    exerciceId={exerciceCourant?.id}
                    journal={journaux.find((j) => j.code === 'OD') ?? journaux[0]}
                    syscohada={syscohada}
                    onFait={() => {
                      setEchangeOuvertPour(null);
                      void charger();
                    }}
                    onAnnuler={() => setEchangeOuvertPour(null)}
                  />
                )}
                {miseEnServiceOuvertePour === immo.id && (
                  <form onSubmit={(e) => onMettreEnService(e, immo)} className="bg-chrome border-b border-border px-4 py-3">
                    <div className="grid grid-cols-4 gap-3 items-end">
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Date de mise en service
                        <input required type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px] font-mono" />
                      </label>
                      {immo.compteEnCoursId && (
                        <>
                          <label className="text-[11.5px] font-semibold text-text-dim">
                            Journal
                            <select required value={msJournalId} onChange={(e) => setMsJournalId(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]">
                              <option value="" />
                              {journaux.map((j) => (
                                <option key={j.id} value={j.id}>{j.code} · {j.intitule}</option>
                              ))}
                            </select>
                          </label>
                          <span className="text-[11px] text-text-dim">
                            {immo.compteImmobilisation?.numero ?? 'Compte définitif'} au débit, {immo.compteEnCours?.numero ?? 'compte en cours'} au crédit · {montant(immo.valeurOrigine)}
                          </span>
                        </>
                      )}
                      <span className="flex gap-2">
                        <button type="submit" disabled={envoi || (!!immo.compteEnCoursId && !exerciceCourant)} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50">
                          {envoi ? '…' : 'Mettre en service'}
                        </button>
                        <button type="button" onClick={() => setMiseEnServiceOuvertePour(null)} className="text-[11.5px] font-semibold text-text-dim px-3 py-1.5">
                          Annuler
                        </button>
                      </span>
                    </div>
                  </form>
                )}
                {sortieOuvertePour === immo.id && (() => {
                  const naturesOffertes = naturesSortieOffertes({
                    type: sType,
                    projetDeveloppement,
                    usufruit: !syscohada && (immo.compteImmobilisation?.numero ?? '').startsWith('2011'),
                  });
                  const natureRetenue: NatureSortie | '' =
                    sNature && naturesOffertes.includes(sNature) ? sNature : naturesOffertes.length === 1 ? naturesOffertes[0] : '';
                  return (
                  <form onSubmit={(e) => onSortir(e, immo.id, natureRetenue)} className="bg-chrome border-b border-border px-4 py-3">
                    <div className="grid grid-cols-4 gap-3 items-end">
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Type
                        <select value={sType} onChange={(e) => setSType(e.target.value as 'CESSION' | 'MISE_HORS_SERVICE')} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]">
                          <option value="MISE_HORS_SERVICE">Mise hors service</option>
                          <option value="CESSION">Cession</option>
                        </select>
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Date
                        <input required type="date" value={sDateSortie} onChange={(e) => setSDateSortie(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px] font-mono" />
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        <span className="flex items-center gap-1.5">
                          Nature
                          <Aide
                            titre="Nature de la sortie"
                            texte="Par cession, il faut entendre vente, échange, mise au rebut ou destruction ; un bien volé ou disparu sort aussi du patrimoine. Un pillage se déclare en vol, la pièce le décrit. L'échange a son propre geste, qui fait entrer le bien reçu. La nature est recopiée dans le libellé de l'écriture de sortie."
                            source="AUDCIF et SYCEBNL, fiche du compte 81 · AUDCIF Titre V § 5.8 · SYCEBNL cadre conceptuel § 5.5 et Partie 3 ch. 3 § 2.5"
                          />
                        </span>
                        <select required value={natureRetenue} onChange={(e) => setSNature(e.target.value as NatureSortie)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]">
                          <option value="" />
                          {naturesOffertes.map((n) => (
                            <option key={n} value={n}>{LIBELLES_NATURE_SORTIE[n]}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        <span className="flex items-center gap-1.5">
                          Pièce justificative
                          <Aide
                            titre="Pièce de la sortie"
                            texte="Référence du document qui justifie la sortie · procès-verbal de mise au rebut ou de destruction, facture de vente, procès-verbal de constat d'un vol, décision de l'organe compétent. Elle est portée en référence des écritures de sortie."
                            source="AUDCIF art. 17, 3° et 5° · fiche du compte 81, éléments de contrôle"
                          />
                        </span>
                        <input required maxLength={120} value={sRefPiece} onChange={(e) => setSRefPiece(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]" />
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Date de la pièce
                        <input required type="date" value={sDatePiece} onChange={(e) => setSDatePiece(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]" />
                      </label>
                      {projetDeveloppement && (
                        <label className="text-[11.5px] font-semibold text-text-dim">
                          <span className="flex items-center gap-1.5">
                            Fonds affecté repris
                            <Aide
                              titre="Fin de projet"
                              texte="À la fin d'un projet, le bien sort par le fonds affecté aux investissements qui l'a financé, au débit, le bien au crédit. Il n'y a ni amortissement ni valeur comptable au 81. Cession en accord avec le bailleur, remise gratuite à l'entité, restitution au bailleur, vol, destruction ou mise au rebut passent la même écriture ; seule la cession ajoute son prix au 82. Une remise gratuite, une restitution ou une perte se saisit en mise hors service."
                              source="SYCEBNL, Partie 3 ch. 3 § 2.5.1 à 2.5.3 · Acte uniforme, art. 7 et 9"
                            />
                          </span>
                          <select required value={sCompteFonds} onChange={(e) => setSCompteFonds(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]">
                            <option value="" />
                            {(fondsProjet?.comptes ?? []).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.numero} · {c.intitule}
                              </option>
                            ))}
                          </select>
                          {messageFonds && (
                            <span className={`block mt-1 font-normal ${erreurFondsProjet || (fondsProjet && fondsProjet.comptes.length === 0) ? 'text-danger' : 'text-text-dim'}`}>{messageFonds}</span>
                          )}
                        </label>
                      )}
                      {/* La division (22 à 24) est celle du compte INSCRIT comme du
                          définitif · le 2x9 d'un bien en cours est rangé dans la
                          division de son compte définitif ; le serveur relit le
                          compte inscrit à la date de sortie. */}
                      {sType === 'MISE_HORS_SERVICE' && !projetDeveloppement && /^2[2-4]/.test(immo.compteImmobilisation?.numero ?? '') && (
                        <ChampsMaterielRecupere
                          valeur={sValeurRecuperee}
                          setValeur={setSValeurRecuperee}
                          compte={sCompteStock}
                          setCompte={setSCompteStock}
                          source={sSourceRecuperee}
                          setSource={setSSourceRecuperee}
                        />
                      )}
                      {sType === 'CESSION' && (
                        <>
                          <label className="text-[11.5px] font-semibold text-text-dim">
                            Prix de cession
                            <input required type="number" step="0.01" min={0} value={sPrixCession} onChange={(e) => setSPrixCession(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px] font-mono" />
                          </label>
                          <label className="text-[11.5px] font-semibold text-text-dim">
                            Encaissé sur
                            <select required value={sCompteContrepartie} onChange={(e) => setSCompteContrepartie(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]">
                              <option value="" />
                              {(comptesFinancement ?? [])
                                .filter((c) =>
                                  contrepartieCessionProposee(utilisateur?.tenant.referentiel, sCessionCourante, c.numero),
                                )
                                .map((c) => (
                                  <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                                ))}
                            </select>
                            {comptesFinancement && (
                              <span className="block text-[11px] font-normal text-warning">
                                {motifAucunCompteRetenu(
                                  comptesFinancement.filter((c) => contrepartieCessionProposee(utilisateur?.tenant.referentiel, sCessionCourante, c.numero)),
                                  'de trésorerie ou de créance',
                                )}
                              </span>
                            )}
                          </label>
                          {syscohada && (
                            <label
                              className="flex items-center gap-1.5 text-[11.5px] font-semibold text-text-dim"
                              title="AUDCIF, Titre VII, compte 81, Exclusions · cession fréquente et récurrente, imputée en exploitation (654 / 754) ; sa créance va au 414, jamais au 485 (fiche du compte 48). Hors activités ordinaires, la créance va au 485, jamais sur un client (fiche du compte 41)."
                            >
                              <input
                                type="checkbox"
                                checked={sCessionCourante}
                                onChange={(e) => {
                                  setSCessionCourante(e.target.checked);
                                  setSCompteContrepartie('');
                                }}
                              />
                              Cession courante
                            </label>
                          )}
                        </>
                      )}
                      <EcartReevaluationSortie
                        immobilisationId={immo.id}
                        type={sType}
                        compteReserve={sCompteReserve}
                        setCompteReserve={setSCompteReserve}
                      />
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button type="submit" disabled={envoi} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50">{envoi ? '…' : 'Confirmer la sortie'}</button>
                      <button type="button" onClick={() => setSortieOuvertePour(null)} className="text-[11.5px] font-semibold text-text-dim px-3 py-1.5">Annuler</button>
                    </div>
                  </form>
                  );
                })()}
              </div>
            ))}
            {immobilisations.length === 0 && <div className="p-3 text-[11.5px] text-text-dim">Aucune immobilisation.</div>}
          </div>
        )}
      </div>

      {onglet === 'tableaux' && (
        <div role="tabpanel">
          <div role="tablist" className="flex gap-1 mb-2 border-b border-border">
            {ONGLETS_TABLEAUX.map((t) => (
              <button
                key={t.cle}
                type="button"
                role="tab"
                aria-selected={tableau === t.cle}
                onClick={() => setTableau(t.cle)}
                className={`onglet ${tableau === t.cle ? 'onglet-actif' : ''}`}
              >
                {t.libelle}
              </button>
            ))}
          </div>
          <TableauxImmobilisationsPage ongletPilote={tableau} />
        </div>
      )}

      {/* EN LECTURE SEULE, un panneau peut rester vide (les saisies sont
          masquées, et un registre vide ne s'affiche pas) · il le dit
          (`peer-empty`), jamais une page blanche. La phrase reste vraie
          pendant la lecture, où le composant ne rend encore rien. */}
      {visites.has('financements') && (
        <div role="tabpanel" hidden={onglet !== 'financements'}>
          <div className="peer">
            <RepriseSubventionImmobilisations exerciceId={exerciceCourant?.id} journaux={journaux} biens={immobilisations ?? []} comptes={comptesFinancement} />
            {utilisateur?.tenant?.referentiel === 'SYCEBNL' && (
              <LegsImmobilisations
                exerciceId={exerciceCourant?.id}
                journaux={journaux}
                comptesBien={comptesBien}
                onCree={() => void charger()}
              />
            )}
          </div>
          {!peutEcrire && (
            <div className="hidden peer-empty:block text-[11.5px] text-text-dim px-1 py-2">
              Subventions, fonds et legs se saisissent avec un profil qui écrit.
            </div>
          )}
        </div>
      )}

      {visites.has('operations') && (
        <div role="tabpanel" hidden={onglet !== 'operations'}>
          <div className="peer">
            <PrixGlobalImmobilisations
              exerciceId={exerciceCourant?.id}
              journaux={journaux}
              comptesBien={comptesBien}
              comptes={comptesFinancement}
              syscohada={utilisateur?.tenant?.referentiel === 'SYSCOHADA'}
              onCree={() => void charger()}
            />
            <ClotureLocationAcquisition exerciceId={exerciceCourant?.id} journaux={journaux} onSortie={() => void charger()} />
            {/* Lot 15 · l'acquisition à prix aléatoire CRÉE un bien (comme le prix
                global), et la liste des biens sous réserve de propriété porte sur
                tout le parc · ni l'une ni l'autre ne vise un bien de la liste. */}
            {syscohada && (
              <AcquisitionPrixAleatoire
                exerciceId={exerciceCourant?.id}
                journaux={journaux}
                comptesBien={comptesBien}
                comptes={comptesFinancement}
                onCree={() => void charger()}
              />
            )}
            <BiensSousReserveDePropriete exerciceId={exerciceCourant?.id} syscohada={syscohada} />
            {/* Lot 14 · la réévaluation porte sur TOUT le parc (art. 62), jamais sur un bien · rangée parmi les opérations. */}
            <ReevaluationImmobilisations
              exerciceId={exerciceCourant?.id}
              journaux={journaux}
              onFait={() => void charger()}
              onImprimerDeclaration={imprimerDeclaration}
              preparationDeclaration={preparationDeclaration}
            />
          </div>
          {!peutEcrire && (
            <div className="hidden peer-empty:block text-[11.5px] text-text-dim px-1 py-2">
              L'acquisition à prix global et la clôture des contrats de location-acquisition se saisissent avec un profil qui écrit.
            </div>
          )}
        </div>
      )}

      {estAdmin && visites.has('lieux') && (
        <div role="tabpanel" hidden={onglet !== 'lieux'}>
          <div className="border border-border bg-surface p-3 mb-4 max-w-[640px] text-[11.5px]">
            <div className="flex items-center gap-1.5 font-semibold mb-2">
              Lieux des biens
              <Aide
                titre="Lieux des biens"
                texte="Où se trouve physiquement chaque bien · pour le retrouver le jour de l’inventaire. Sans effet comptable. Un lieu qui porte des biens ne se supprime pas : déplacez-les d’abord. Définition d’OmegaX."
                source="Sage Immobilisations, « Lieux des biens » (nommés, non décrits)"
              />
            </div>
            <table className="w-full mb-2">
              <tbody>
                {lieux.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="py-1 font-semibold w-24">{l.code}</td>
                    <td className="py-1">{l.intitule}</td>
                    <td className="py-1 text-right text-text-dim">{l._count.immobilisations} bien(s)</td>
                    <td className="py-1 text-right w-20">
                      <button type="button" onClick={() => void supprimerLieu(l)} className="text-danger hover:underline">
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
                {/* « Aucun » ne se dit que sur une liste lue · `charger` pose les
                    lieux avec les biens, `immobilisations` dit la lecture faite. */}
                {immobilisations && lieux.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-1 text-text-dim">Aucun lieu · ajoutez-le ci-dessous.</td>
                  </tr>
                )}
              </tbody>
            </table>
            <form onSubmit={(e) => void creerLieu(e)} className="flex items-end gap-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-text-dim">Code</span>
                <input name="code" required maxLength={20} className="border border-border-dark px-2 py-[3px] w-28" />
              </label>
              <label className="flex flex-col gap-0.5 flex-1">
                <span className="text-text-dim">Intitulé</span>
                <input name="intitule" required maxLength={120} className="border border-border-dark px-2 py-[3px]" />
              </label>
              <button type="submit" className="bg-sel text-white px-3 py-[4px] font-semibold">Ajouter</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

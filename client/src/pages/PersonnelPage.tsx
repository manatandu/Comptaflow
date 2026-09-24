import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import { OngletBulletins } from './BulletinsPaie';
import { TITRE_BLOC_PAIE } from './PaieDuMois';
import { BaremeMensuelIrpp, type DetailMensuelIrpp } from './BaremeMensuelIrpp';

/**
 * LE REGISTRE DU PERSONNEL · l'état civil, les engagements, et ce que
 * l'article 212 du Code du travail réclame de chaque contrat.
 *
 * CE QUE CET ÉCRAN NE FAIT PAS, ET LE DIT : aucun bulletin, aucune assiette,
 * aucun montant de paie. P0 a établi que le moteur bute sur des textes qui ne
 * sont pas au corpus, et l'écran ne promet pas ce qui n'est pas là.
 *
 * LA CONFRONTATION EST L'OBJET DE LA FENÊTRE, pas un accessoire. Un registre
 * qui liste sans confronter se lit comme « tout va bien » ; c'est le manque
 * de la quatorzième énonciation, ou la requalification de plein droit d'un
 * CDD en CDI, qu'un inspecteur du travail viendra chercher.
 *
 * DONNÉES PERSONNELLES · c'est la première fenêtre du logiciel à en afficher.
 * Le journal d'audit, lui, en masque la valeur · l'écran la montre à qui
 * tient le dossier, le journal ne la recopie pas pour tout le monde.
 */

type Sexe = 'MASCULIN' | 'FEMININ';
type TypeContrat = 'DUREE_DETERMINEE' | 'DUREE_INDETERMINEE' | 'JOUR_LE_JOUR' | 'APPRENTISSAGE';

const LIBELLE_TYPE: Record<TypeContrat, string> = {
  DUREE_INDETERMINEE: 'Durée indéterminée',
  DUREE_DETERMINEE: 'Durée déterminée',
  JOUR_LE_JOUR: 'Engagement au jour le jour',
  APPRENTISSAGE: "Contrat d'apprentissage (Titre III)",
};

interface Enfant {
  id?: string;
  nom: string;
  postNom: string | null;
  prenoms: string | null;
  dateNaissance: string | null;
}

interface Contrat {
  id: string;
  type: TypeContrat;
  dateEntreeEnVigueur: string;
  dateFinPrevue: string | null;
  dateFin: string | null;
  motifFin: string | null;
  emploiPermanent: boolean;
  constateParEcrit: boolean;
  viseParOnem: boolean;
  remunerationBase: string | number | null;
  categorieProfessionnelle: string | null;
  classeProfessionnelle: number | null;
  periodiciteRemuneration: 'JOUR' | 'SEMAINE' | 'MOIS' | 'ANNEE' | null;
}

interface Salarie {
  id: string;
  matricule: string | null;
  nom: string;
  postNom: string | null;
  prenoms: string | null;
  sexe: Sexe;
  numeroAffiliationCnss: string | null;
  dateNaissance: string | null;
  millesimeNaissance: number | null;
  lieuNaissance: string | null;
  nationalite: string | null;
  nomConjoint: string | null;
  aptitudeConstateeLe: string | null;
  aptitudeConstateePar: string | null;
  aptitudeProvisoire: boolean;
  declarationEngagementLe: string | null;
  declarationDepartLe: string | null;
  actif: boolean;
  enfants: Enfant[];
  contrats: Contrat[];
  contratEnCours: Contrat | null;
  nombreContrats: number;
}

interface Mention {
  numero: number;
  texte: string;
  ou: string;
  motif: string;
}

interface Requal {
  motif: string;
  article: string;
  formule: string;
  explication: string;
}

interface Declaration {
  objet: 'ENGAGEMENT' | 'DEPART';
  echeance: string;
  faite: boolean;
  enRetard: boolean;
  destinataires: string;
  article: string;
}

interface RemunerationMinimale {
  conforme: boolean | null;
  minimumFc: number | null;
  convenueFc: number | null;
  manqueFc: number | null;
  abstention: string | null;
  explication: string;
}

interface FicheConfrontee {
  salarieId: string;
  salarie: string;
  contratId: string;
  type: TypeContrat;
  dateEntreeEnVigueur: string;
  dateFin: string | null;
  mentionsManquantes: Mention[];
  requalifications: Requal[];
  essai: {
    dureeOpposableJours: number | null;
    plafondJours: number;
    reduiteDePleinDroit: boolean;
    ecritManquant: boolean;
    reserve: string | null;
  };
  declarations: Declaration[];
  aptitudeProvisoirePerimee: boolean;
  visaOnemManquant: boolean;
  moisDeReference: string;
  remunerationMinimale: RemunerationMinimale;
}

interface Confrontation {
  employeur: { nom: string; numeroAffiliationCnssEmployeur: string | null };
  manqueEmployeur: boolean;
  fiches: FicheConfrontee[];
  totalSignalements: number;
}

interface Simulation {
  moisDePaie: string;
  baremeApplicable: boolean;
  motifBaremeInapplicable: string | null;
  assiettes: {
    assietteSocialeFc: number;
    horsRemuneration: { libelle: string; montantFc: number; motif: string }[];
    assietteFiscaleBruteFc: number | null;
    sortsFiscaux: {
      libelle: string;
      montantFc: number;
      imposableFc: number | null;
      motif: string;
    }[];
    retenuesArticle71Fc: number;
    assietteFiscaleNetteFc: number | null;
    abstentions: { motif: string; libelle: string; montantFc: number; explication: string }[];
    reserves: string[];
  };
  cotisations: {
    lignes: {
      cle: string;
      libelle: string;
      organisme: string;
      charge: 'EMPLOYEUR' | 'TRAVAILLEUR';
      tauxPourCent: number;
      assietteFc: number;
      montantFc: number;
      source: string;
      reserve: string | null;
    }[];
    totalEmployeurFc: number;
    totalTravailleurFc: number;
    abstentions: string[];
  };
  net: {
    totalVerseFc: number;
    quotePartOuvriereFc: number;
    irppFc: number | null;
    netAPayerFc: number | null;
    reserves: string[];
  };
  referentiel: string;
  passation: {
    referentiel: string;
    lignes: {
      bloc: 'BRUT' | 'RETENUES' | 'PATRONALES';
      compte: string;
      intitule: string;
      sens: 'DEBIT' | 'CREDIT';
      montantFc: number;
      reserve: string | null;
    }[];
    totalDebitFc: number;
    totalCreditFc: number;
    equilibree: boolean;
    refus: { motif: string; explication: string }[];
    reserves: string[];
  };
  tauxLegalAllocationsFamilialesFc: number | null;
  retenuesAutorisees: {
    liste: { littera: string; libelle: string; equivalentActuel: string | null }[];
    sanction: string;
    cotisationSyndicale: string;
    cessionSyndicale: string;
    litteraeDatees: string;
  };
  quotite: {
    baseFc: number | null;
    seuilFc: number | null;
    mensuelMinimumFc: number | null;
    quotiteOrdinaireFc: number | null;
    quotiteAlimentaireFc: number | null;
    quotiteCumuleeFc: number | null;
    partInsaisissableFc: number | null;
    abstentions: { motif: string; explication: string }[];
    reserves: string[];
  };
  personnesAChargeRetenues: number;
  propositionPersonnesACharge: number | null;
  sourceProposition: string | null;
  retenue: {
    revenuAnnualiseFc: number;
    retenueFc: number;
    reserves: string[];
    annuel: {
      assietteArrondieFc: number;
      impotDuBaremeFc: number;
      plafondFc: number;
      plafondApplique: boolean;
      impotArticle118Fc: number;
      quotitePourCent: number;
      reductionFc: number;
      impotDuFc: number;
      parTranche: { tauxPourCent: number; baseFc: number; impotFc: number }[];
    };
    mensuel: DetailMensuelIrpp;
  } | null;
  avertissement: string;
}

interface LivreDePaie {
  livreDu: boolean;
  remplacementAutorise: boolean;
  livreInspireAdmis: boolean;
  enonciationsCompletes: boolean;
  mentionsPorteesCount: number;
  mentionsManquantes: { rang: number; libelle: string }[];
  conformiteAuModeleCertifiee: boolean;
  refus: { motif: string; explication: string }[];
  reserves: string[];
  mentions: { rang: number; libelle: string }[];
  formules: Record<string, { rang: number; composantes: number[] }>;
  destinationDesDoubles: { premier: string; second: string };
  arreteDuModele: {
    reference: string;
    objet: string;
    publie: string;
    signataire: string;
    viseParLeCodeDuTravail: string[];
    abroge: string;
    lu: boolean;
    pourquoi: string;
  };
  doublesDetachablesMinimum: number;
  sanctionArticle103: string;
  reserveArticle104: string;
}

interface Decompte {
  preavis: { joursOuvrables: number | null; motifAucunPreavis: string | null };
  conge: { joursOuvrables: number; joursDeBase: number; joursDAnciennete: number };
  rubriques: {
    cle: string;
    libelle: string;
    montantFc: number | null;
    fondement: string;
    reserve: string | null;
  }[];
  totalBrutFc: number | null;
  echeancePaiement: string;
  reserves: string[];
}

interface Effectif {
  effectif: number;
  hommes: number;
  femmes: number;
  permanents: number;
  nationaux: number;
  sansNationalite: number;
  partMainOeuvreNationale: number | null;
  source: string;
  reserve: string | null;
}

const NOUVEAU_SALARIE = {
  matricule: '',
  nom: '',
  postNom: '',
  prenoms: '',
  sexe: '' as '' | Sexe,
  numeroAffiliationCnss: '',
  dateNaissance: '',
  millesimeNaissance: '',
  lieuNaissance: '',
  nationalite: '',
  nomConjoint: '',
  aptitudeConstateeLe: '',
  aptitudeConstateePar: '',
  aptitudeProvisoire: false,
  declarationEngagementLe: '',
  declarationDepartLe: '',
};

const NOUVEAU_CONTRAT = {
  type: 'DUREE_INDETERMINEE' as TypeContrat,
  constateParEcrit: true,
  dateEntreeEnVigueur: '',
  dateConclusion: '',
  lieuConclusion: '',
  dateFinPrevue: '',
  separeDeSaFamille: false,
  ouvrageDetermine: '',
  motifRemplacement: '',
  emploiPermanent: false,
  natureTravail: '',
  lieuExecution: '',
  categorieProfessionnelle: '',
  classeProfessionnelle: '',
  periodiciteRemuneration: '' as '' | 'JOUR' | 'SEMAINE' | 'MOIS' | 'ANNEE',
  manoeuvreSansSpecialite: false,
  remunerationBase: '',
  avantagesConvenus: '',
  clauseEssai: false,
  essaiConstateParEcrit: false,
  essaiDureeJours: '',
  dureePreavisJours: '',
  viseParOnem: false,
  dateVisaOnem: '',
};

/**
 * LES DIX-SEPT CLASSES DE LA TENSION SALARIALE, décret n° 25/22, annexes.
 *
 * Recopiées ici pour l'affichage seul · le MINIMUM associé à chacune vient
 * toujours du serveur, qui seul lit le barème avec son mois d'effet. Un
 * montant calculé côté client se périmerait au prochain ajustement de
 * janvier sans que personne ne le voie.
 */
const CLASSES: { classe: number; libelle: string }[] = [
  { classe: 1, libelle: 'Manœuvre ordinaire' },
  { classe: 2, libelle: 'Manœuvre lourd' },
  { classe: 3, libelle: 'Travailleur spécialisé' },
  { classe: 4, libelle: 'Travailleur semi qualifié, échelon 1' },
  { classe: 5, libelle: 'Travailleur semi qualifié, échelon 2' },
  { classe: 6, libelle: 'Travailleur semi qualifié, échelon 3' },
  { classe: 7, libelle: 'Travailleur qualifié, échelon 1' },
  { classe: 8, libelle: 'Travailleur qualifié, échelon 2' },
  { classe: 9, libelle: 'Travailleur hautement qualifié' },
  { classe: 10, libelle: 'Maîtrise, échelon 1' },
  { classe: 11, libelle: 'Maîtrise, échelon 2' },
  { classe: 12, libelle: 'Maîtrise, échelon 3' },
  { classe: 13, libelle: 'Maîtrise, échelon 4' },
  { classe: 14, libelle: 'Cadre de collaboration, échelon 1' },
  { classe: 15, libelle: 'Cadre de collaboration, échelon 2' },
  { classe: 16, libelle: 'Cadre de collaboration, échelon 3' },
  { classe: 17, libelle: 'Cadre de collaboration, échelon 4' },
];

/**
 * LES QUINZE NATURES D'ÉLÉMENT DE PAIE. Les dix premières sont dans la
 * rémunération de l'article 7, point 8 du Code du travail ; les cinq
 * dernières en sortent. LE LIBELLÉ LE DIT, parce que c'est exactement la
 * distinction que le bulletin doit rendre visible.
 *
 * Aucun calcul n'est fait ici · l'écran ENVOIE les éléments et AFFICHE ce que
 * le serveur rend. Refaire les deux assiettes côté client produirait deux
 * chiffres plausibles et différents pour la même paie, ce que le lettrage et
 * la TVA ont déjà appris au dépôt.
 */
const NATURES_PAIE: { valeur: string; libelle: string; dansLaRemuneration: boolean }[] = [
  { valeur: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire ou traitement', dansLaRemuneration: true },
  { valeur: 'COMMISSION', libelle: 'Commission', dansLaRemuneration: true },
  { valeur: 'INDEMNITE_DE_VIE_CHERE', libelle: 'Indemnité de vie chère', dansLaRemuneration: true },
  { valeur: 'PRIME', libelle: 'Prime', dansLaRemuneration: true },
  {
    valeur: 'PARTICIPATION_AUX_BENEFICES',
    libelle: 'Participation aux bénéfices',
    dansLaRemuneration: true,
  },
  {
    valeur: 'GRATIFICATION_OU_MOIS_COMPLEMENTAIRE',
    libelle: 'Gratification ou mois complémentaire',
    dansLaRemuneration: true,
  },
  {
    valeur: 'PRESTATION_SUPPLEMENTAIRE',
    libelle: 'Prestation supplémentaire',
    dansLaRemuneration: true,
  },
  { valeur: 'AVANTAGE_EN_NATURE', libelle: 'Avantage en nature', dansLaRemuneration: true },
  {
    valeur: 'ALLOCATION_OU_INDEMNITE_COMPENSATOIRE_DE_CONGE',
    libelle: 'Allocation ou indemnité compensatoire de congé',
    dansLaRemuneration: true,
  },
  {
    valeur: 'INDEMNITE_INCAPACITE_OU_ACCOUCHEMENT',
    libelle: 'Indemnité d’incapacité ou d’accouchement',
    dansLaRemuneration: true,
  },
  { valeur: 'SOINS_DE_SANTE', libelle: 'Soins de santé', dansLaRemuneration: false },
  {
    valeur: 'LOGEMENT_OU_SON_INDEMNITE',
    libelle: 'Logement ou son indemnité',
    dansLaRemuneration: false,
  },
  {
    valeur: 'ALLOCATIONS_FAMILIALES_LEGALES',
    libelle: 'Allocations familiales légales',
    dansLaRemuneration: false,
  },
  {
    valeur: 'INDEMNITE_DE_TRANSPORT',
    libelle: 'Indemnité de transport',
    dansLaRemuneration: false,
  },
  {
    valeur: 'FRAIS_DE_VOYAGE_OU_AVANTAGE_DE_FONCTION',
    libelle: 'Frais de voyage ou avantage de fonction',
    dansLaRemuneration: false,
  },
];

type LignePaie = {
  nature: string;
  libelle: string;
  montantFc: string;
  attestee: '' | 'oui' | 'non';
  remboursement: boolean;
};

const LIGNE_VIERGE: LignePaie = {
  nature: 'SALAIRE_OU_TRAITEMENT',
  libelle: '',
  montantFc: '',
  attestee: '',
  remboursement: false,
};

const fc = (n: number | null | undefined) =>
  n === null || n === undefined
    ? '' 
    : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const nomComplet = (s: Salarie) => [s.nom, s.postNom, s.prenoms].filter(Boolean).join(' ');
const jour = (d: string | null) => (d ? d.slice(0, 10) : '');

export function PersonnelPage() {
  // Inscrire un salarié, le mettre à jour, lui ouvrir un contrat : réservé
  // (`@Roles` ADMIN_CABINET, COMPTABLE). Simulation, décompte final et livre
  // de paie restent ouverts à la lecture seule · le serveur les lui ouvre,
  // ils calculent sans rien conserver.
  const { peutEcrire } = useAuth();
  const [salaries, setSalaries] = useState<Salarie[]>([]);
  const [confrontation, setConfrontation] = useState<Confrontation | null>(null);
  const [effectif, setEffectif] = useState<Effectif | null>(null);
  const [onglet, setOnglet] = useState<
    'registre' | 'confrontation' | 'effectif' | 'simulation' | 'bulletins' | 'decompte' | 'livre'
  >('registre');
  const [tous, setTous] = useState(false);
  const [selection, setSelection] = useState<string>('');
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [salarie, setSalarie] = useState({ ...NOUVEAU_SALARIE });
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [contrat, setContrat] = useState({ ...NOUVEAU_CONTRAT });
  const [aLa, setALa] = useState('');
  const [moisDePaie, setMoisDePaie] = useState('');
  const [lignes, setLignes] = useState<LignePaie[]>([{ ...LIGNE_VIERGE }]);
  const [retenues71, setRetenues71] = useState('');
  const [tauxAllocations, setTauxAllocations] = useState('');
  const [personnesACharge, setPersonnesACharge] = useState('');
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [decompte, setDecompte] = useState<Decompte | null>(null);
  const [dec, setDec] = useState({
    anneesAnciennete: '',
    moisEntiersDeService: '',
    moinsDeDixHuitAns: false,
    initiative: 'EMPLOYEUR' as 'EMPLOYEUR' | 'TRAVAILLEUR',
    motif: 'LICENCIEMENT',
    delegueSyndical: false,
    remunerationJournaliereFc: '',
    arrieresFc: '',
    moyenneDouzeMoisFc: '',
    gratificationFc: '',
  });
  const [enfantsAllocations, setEnfantsAllocations] = useState('');
  const [classePro, setClassePro] = useState('');
  const [logementNature, setLogementNature] = useState(false);
  const [obligationAlimentaire, setObligationAlimentaire] = useState(false);
  const [livre, setLivre] = useState<LivreDePaie | null>(null);
  const [livreSaisie, setLivreSaisie] = useState({
    siegeDExploitation: '',
    forme: '' as '' | 'LIVRE_PAPIER' | 'FICHIER_INFORMATISE' | 'AUTRE_DOCUMENT',
    autorisation: '' as '' | 'oui' | 'non',
    effectifHabituel: '',
    domestique: false,
  });
  const [mentionsPortees, setMentionsPortees] = useState<number[]>([]);
  const [natureInpp, setNatureInpp] = useState<'' | 'PUBLIC' | 'PRIVE'>('');
  const [effectifInpp, setEffectifInpp] = useState('');
  const [majorationRp, setMajorationRp] = useState(false);

  const charger = useCallback(() => {
    api.get<Salarie[]>(`/personnel/salaries${tous ? '?tous=true' : ''}`).then(
      setSalaries,
      (e: ApiError) => setErreur(e.message),
    );
  }, [tous]);

  useEffect(charger, [charger]);

  useEffect(() => {
    if (onglet === 'confrontation') {
      api.get<Confrontation>('/personnel/confrontation').then(setConfrontation, (e: ApiError) =>
        setErreur(e.message),
      );
    }
    if (onglet === 'effectif') {
      api
        .get<Effectif>(`/personnel/effectif${aLa ? `?ala=${aLa}` : ''}`)
        .then(setEffectif, (e: ApiError) => setErreur(e.message));
    }
  }, [onglet, aLa]);

/**
   * LA SIMULATION EST DEMANDÉE AU SERVEUR, jamais refaite ici. Deux calculs
   * écrits séparément auraient divergé au premier correctif, et l'écart
   * n'aurait sauté aux yeux de personne · les deux assiettes sont plausibles
   * séparément. C'est la leçon de `calculerPropositions` et de
   * `construireLigneTva`.
   *
   * ET L'ATTESTATION DE L'ARTICLE 69, 8 N'EST ENVOYÉE QUE LORSQU'ELLE A ÉTÉ
   * DONNÉE · « non renseigné » laisse le champ ABSENT, ce qui vaut abstention
   * au serveur. L'envoyer à `false` transformerait un silence en refus, et
   * imposerait une indemnité que personne n'a examinée.
   */
  // UN SEUL CORPS POUR SIMULER ET POUR ÉMETTRE · le bulletin est la
  // simulation rejouée par le serveur. Deux constructions finiraient par
  // diverger, et le bulletin émis ne serait plus ce que l'écran a montré.
  const corpsSimulation = () => {
    const nombre = (v: string) => {
      const n = Number(v.replace(/\s/g, '').replace(',', '.'));
      return v.trim() === '' || Number.isNaN(n) ? undefined : n;
    };
    const corps = {
      moisDePaie,
      elements: lignes
        .filter((l) => nombre(l.montantFc) !== undefined)
        .map((l) => ({
          nature: l.nature,
          libelle:
            l.libelle.trim() ||
            (NATURES_PAIE.find((n) => n.valeur === l.nature)?.libelle ?? l.nature),
          montantFc: nombre(l.montantFc) as number,
          ...(l.remboursement ? { remboursementDeDepenseProfessionnelleEffective: true } : {}),
          ...(l.attestee === '' ? {} : { conditionArticle69Attestee: l.attestee === 'oui' }),
        })),
      retenuesArticle71Fc: nombre(retenues71),
      tauxLegalAllocationsFamilialesFc: nombre(tauxAllocations),
      personnesACharge: nombre(personnesACharge),
      // LE TAUX INPP NE SE DEVINE PAS · il dépend de la nature de l'employeur,
      // puis de la tranche d'effectif pour le privé seulement. Champ vide =
      // champ ABSENT, ce qui vaut abstention au serveur.
      ...(natureInpp === '' ? {} : { natureEmployeurInpp: natureInpp }),
      effectif: nombre(effectifInpp),
      ...(majorationRp ? { majorationRisquesProfessionnels: true } : {}),
      // ARTICLE 69, 1 · le nombre d'enfants BÉNÉFICIAIRES, dont le serveur
      // tire le taux légal. Absent, il s'abstient · il ne suppose pas un.
      enfantsBeneficiairesAllocations: nombre(enfantsAllocations),
      // ARTICLE 114 · la classe place le seuil. Vide = quotité non chiffrée.
      classeProfessionnelle: nombre(classePro),
      ...(logementNature ? { logementFourniEnNature: true } : {}),
      ...(obligationAlimentaire ? { obligationAlimentaireLegale: true } : {}),
    };
    return corps;
  };

  const simuler = () => {
    setErreur('');
    setSucces('');
    setEnCours(true);
    const corps = corpsSimulation();
    api
      .post<Simulation>(
        `/personnel/simulation${selection ? `?salarieId=${selection}` : ''}`,
        corps,
      )
      .then(
        (r) => {
          setSimulation(r);
          setEnCours(false);
        },
        (e: ApiError) => {
          setErreur(e.message);
          setEnCours(false);
        },
      );
  };

/**
   * ÉMETTRE LE BULLETIN · le serveur rejoue la simulation avec le MÊME corps
   * et fige ce qu'il rend. Il refuse tant qu'un montant n'est pas calculé
   * (impôt, cotisation, net) : sur un décompte remis au travailleur, un
   * chiffre provisoire devient opposable (art. 103).
   */
  const emettreBulletin = () => {
    if (!selection) return;
    setErreur('');
    setSucces('');
    setEnCours(true);
    api
      .post<{ numero: number; moisDePaie: string }>(`/personnel/salaries/${selection}/bulletins`, corpsSimulation())
      .then(
        (b) => {
          setSucces(`Bulletin n° ${b.numero} émis pour ${b.moisDePaie}. Il ne se modifie plus : une erreur se corrige en l’annulant.`);
          setEnCours(false);
        },
        (e: ApiError) => {
          setErreur(e.message);
          setEnCours(false);
        },
      );
  };

  /**
   * LE LIVRE DE PAIE EST DEMANDÉ AU SERVEUR, et les trente mentions en
   * REVIENNENT · les recopier ici en ferait une deuxième liste, qui aurait
   * divergé au premier correctif de l'arrêté n° 146/2018.
   */
  const verifierLivre = () => {
    setErreur('');
    setEnCours(true);
    const nombre = (v: string) => {
      const n = Number(v.replace(/\s/g, ''));
      return v.trim() === '' || Number.isNaN(n) ? undefined : n;
    };
    api
      .post<LivreDePaie>('/personnel/livre-de-paie', {
        siegeDExploitation: livreSaisie.siegeDExploitation.trim() || undefined,
        // FORME NON DÉCLARÉE = CHAMP ABSENT · le serveur retient alors le cas
        // le plus exigeant. La supposer informatisée dispenserait d'une
        // autorisation qui est due.
        ...(livreSaisie.forme === '' ? {} : { formeDuDocument: livreSaisie.forme }),
        // « NON RENSEIGNÉ » RESTE ABSENT · l'envoyer à false ferait d'un
        // silence un refus, et d'une absence de réponse une réponse.
        ...(livreSaisie.autorisation === ''
          ? {}
          : { autorisationInspecteurDuTravail: livreSaisie.autorisation === 'oui' }),
        effectifHabituel: nombre(livreSaisie.effectifHabituel),
        ...(livreSaisie.domestique ? { exclusivementPersonnelDomestique: true } : {}),
        mentionsPortees,
      })
      .then(
        (r) => {
          setLivre(r);
          setEnCours(false);
        },
        (e: ApiError) => {
          setErreur(e.message);
          setEnCours(false);
        },
      );
  };

  /**
   * LE DÉCOMPTE EST DEMANDÉ AU SERVEUR · les durées du Code du travail et les
   * réserves sur le séminaire CPCC vivent dans `decompte-final.ts`. Les
   * recopier ici produirait un second décompte, plausible et différent.
   */
  const calculerDecompte = () => {
    setErreur('');
    setEnCours(true);
    const nombre = (v: string) => {
      const n = Number(v.replace(/\s/g, '').replace(',', '.'));
      return v.trim() === '' || Number.isNaN(n) ? undefined : n;
    };
    api
      .post<Decompte>('/personnel/decompte-final', {
        anneesAnciennete: nombre(dec.anneesAnciennete) ?? 0,
        moisEntiersDeService: nombre(dec.moisEntiersDeService) ?? 0,
        moinsDeDixHuitAns: dec.moinsDeDixHuitAns,
        initiative: dec.initiative,
        motif: dec.motif,
        delegueSyndical: dec.delegueSyndical,
        remunerationJournaliereFc: nombre(dec.remunerationJournaliereFc),
        arrieresFc: nombre(dec.arrieresFc),
        moyenneDouzeMoisFc: nombre(dec.moyenneDouzeMoisFc),
        gratificationFc: nombre(dec.gratificationFc),
      })
      .then(
        (r) => {
          setDecompte(r);
          setEnCours(false);
        },
        (e: ApiError) => {
          setErreur(e.message);
          setEnCours(false);
        },
      );
  };

  const corpsSalarie = () => ({
    matricule: salarie.matricule.trim() || undefined,
    nom: salarie.nom.trim(),
    postNom: salarie.postNom.trim() || undefined,
    prenoms: salarie.prenoms.trim() || undefined,
    sexe: salarie.sexe,
    numeroAffiliationCnss: salarie.numeroAffiliationCnss.trim() || undefined,
    dateNaissance: salarie.dateNaissance || undefined,
    millesimeNaissance: salarie.millesimeNaissance ? Number(salarie.millesimeNaissance) : undefined,
    lieuNaissance: salarie.lieuNaissance.trim() || undefined,
    nationalite: salarie.nationalite.trim() || undefined,
    nomConjoint: salarie.nomConjoint.trim() || undefined,
    aptitudeConstateeLe: salarie.aptitudeConstateeLe || undefined,
    aptitudeConstateePar: salarie.aptitudeConstateePar.trim() || undefined,
    aptitudeProvisoire: salarie.aptitudeProvisoire,
    declarationEngagementLe: salarie.declarationEngagementLe || undefined,
    declarationDepartLe: salarie.declarationDepartLe || undefined,
    enfants: enfants
      .filter((e) => e.nom.trim() !== '')
      .map((e) => ({
        nom: e.nom.trim(),
        postNom: e.postNom?.trim() || undefined,
        prenoms: e.prenoms?.trim() || undefined,
        dateNaissance: e.dateNaissance || undefined,
      })),
  });

  const enregistrerSalarie = async () => {
    setErreur('');
    setSucces('');
    setEnCours(true);
    try {
      if (selection) {
        await api.put(`/personnel/salaries/${selection}`, corpsSalarie());
        setSucces(`${salarie.nom} mis à jour.`);
      } else {
        const cree = await api.post<{ id: string }>('/personnel/salaries', corpsSalarie());
        setSucces(`${salarie.nom} inscrit au registre.`);
        setSelection(cree.id);
      }
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    } finally {
      setEnCours(false);
    }
  };

  const choisir = (s: Salarie) => {
    setSelection(s.id);
    setSalarie({
      matricule: s.matricule ?? '',
      nom: s.nom,
      postNom: s.postNom ?? '',
      prenoms: s.prenoms ?? '',
      sexe: s.sexe,
      numeroAffiliationCnss: s.numeroAffiliationCnss ?? '',
      dateNaissance: jour(s.dateNaissance),
      millesimeNaissance: s.millesimeNaissance ? String(s.millesimeNaissance) : '',
      lieuNaissance: s.lieuNaissance ?? '',
      nationalite: s.nationalite ?? '',
      nomConjoint: s.nomConjoint ?? '',
      aptitudeConstateeLe: jour(s.aptitudeConstateeLe),
      aptitudeConstateePar: s.aptitudeConstateePar ?? '',
      aptitudeProvisoire: s.aptitudeProvisoire,
      declarationEngagementLe: jour(s.declarationEngagementLe),
      declarationDepartLe: jour(s.declarationDepartLe),
    });
    setEnfants(s.enfants.map((e) => ({ ...e, dateNaissance: jour(e.dateNaissance) })));
  };

  const nouveau = () => {
    setSelection('');
    setSalarie({ ...NOUVEAU_SALARIE });
    setEnfants([]);
  };

  const creerContrat = async () => {
    if (!selection) return;
    setErreur('');
    setSucces('');
    setEnCours(true);
    try {
      await api.post(`/personnel/salaries/${selection}/contrats`, {
        type: contrat.type,
        constateParEcrit: contrat.constateParEcrit,
        dateEntreeEnVigueur: contrat.dateEntreeEnVigueur,
        dateConclusion: contrat.dateConclusion || undefined,
        lieuConclusion: contrat.lieuConclusion.trim() || undefined,
        dateFinPrevue: contrat.dateFinPrevue || undefined,
        separeDeSaFamille: contrat.separeDeSaFamille,
        ouvrageDetermine: contrat.ouvrageDetermine.trim() || undefined,
        motifRemplacement: contrat.motifRemplacement.trim() || undefined,
        emploiPermanent: contrat.emploiPermanent,
        natureTravail: contrat.natureTravail.trim() || undefined,
        lieuExecution: contrat.lieuExecution.trim() || undefined,
        categorieProfessionnelle: contrat.categorieProfessionnelle.trim() || undefined,
        classeProfessionnelle: contrat.classeProfessionnelle ? Number(contrat.classeProfessionnelle) : undefined,
        periodiciteRemuneration: contrat.periodiciteRemuneration || undefined,
        manoeuvreSansSpecialite: contrat.manoeuvreSansSpecialite,
        remunerationBase: contrat.remunerationBase ? Number(contrat.remunerationBase) : undefined,
        avantagesConvenus: contrat.avantagesConvenus.trim() || undefined,
        clauseEssai: contrat.clauseEssai,
        essaiConstateParEcrit: contrat.essaiConstateParEcrit,
        essaiDureeJours: contrat.essaiDureeJours ? Number(contrat.essaiDureeJours) : undefined,
        dureePreavisJours: contrat.dureePreavisJours ? Number(contrat.dureePreavisJours) : undefined,
        viseParOnem: contrat.viseParOnem,
        dateVisaOnem: contrat.dateVisaOnem || undefined,
      });
      setSucces('Contrat enregistré.');
      setContrat({ ...NOUVEAU_CONTRAT });
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    } finally {
      setEnCours(false);
    }
  };

  const champ =
    'border border-border bg-surface px-1.5 py-1 text-[12px] w-full focus:outline-none focus:border-accent';
  const cell = 'px-2 py-1 border border-border';
  const etiquette = 'text-[10.5px] text-text-dim uppercase tracking-wide';
  const choisi = salaries.find((s) => s.id === selection) ?? null;

  return (
    <div className="p-2">
      <EnteteImpression titre="Registre du personnel" />
      <div className="ecran-seul mb-1.5 max-w-[1240px]">
        <div className="text-[11px] font-mono text-text-dim leading-none">
          CODE DU TRAVAIL · LOI N° 015/2002, ARTICLE 212
        </div>
        <h1 className="text-[13px] font-bold leading-tight">Registre du personnel</h1>
        <div className="text-[11px] text-text-dim mt-0.5">
          Le registre tient l’état civil et les engagements, et confronte chaque contrat aux quinze
          énonciations obligatoires de l’article 212 ainsi qu’aux requalifications de plein droit des
          articles 40 à 45. L’onglet Simulation rend les deux assiettes d’un mois, les cotisations,
          la retenue de l’article 119 et l’écriture de passation <strong>proposée</strong>,
          sans rien conserver ni poster. L’onglet <strong>Bulletins</strong> tient les bulletins émis,
          numérotés et figés : le décompte écrit de l’article 103.
        </div>
      </div>

      {erreur && (
        <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[12px] max-w-[1240px]">
          {erreur}
        </div>
      )}
      {succes && (
        <div className="border border-ok/30 bg-ok-soft px-3.5 py-2 mb-2.5 text-[12px] max-w-[1240px]">
          {succes}
        </div>
      )}

      <div className="ecran-seul flex gap-1 mb-2 text-[12px]">
        {(
          ['registre', 'confrontation', 'effectif', 'simulation', 'bulletins', 'decompte', 'livre'] as const
        ).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOnglet(o)}
            className={`px-3 py-1 border ${
              onglet === o ? 'border-accent text-accent' : 'border-border text-text-dim'
            }`}
          >
            {o === 'registre'
              ? 'Registre'
              : o === 'confrontation'
                ? 'Article 212'
                : o === 'effectif'
                  ? 'Effectif'
                  : o === 'simulation'
                    ? 'Simulation'
                    : o === 'bulletins'
                      ? 'Bulletins'
                      : o === 'decompte'
                      ? 'Décompte final'
                      : 'Livre de paie'}
          </button>
        ))}
      </div>

      {onglet === 'registre' && (
        // LE CONTENEUR QUI DÉFILE, et il n'est pas décoratif · la grille
        // ci-dessous fait 748 px au minimum, et sur un écran de 360 px elle
        // pousserait la fenêtre entière, emportant l'en-tête et les onglets
        // hors de vue. Le défilement reste dans la grille.
        <div className="overflow-x-auto max-w-[1240px]">
        <div className="grid grid-cols-[minmax(320px,1fr)_minmax(420px,1.4fr)] gap-2">
          <div className="border border-border">
            <div className="flex items-center justify-between px-2 py-1 border-b border-border">
              <div className="text-[12px] font-bold">Salariés ({salaries.length})</div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] flex items-center gap-1">
                  <input type="checkbox" checked={tous} onChange={(e) => setTous(e.target.checked)} />
                  Inclure les inactifs
                </label>
                {peutEcrire && (
                  <button type="button" onClick={nouveau} className="text-[11px] text-accent">
                    Nouveau
                  </button>
                )}
              </div>
            </div>
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="text-text-dim">
                  <th className={`${cell} text-left`}>Matricule</th>
                  <th className={`${cell} text-left`}>Nom</th>
                  <th className={`${cell} text-left`}>Contrat en cours</th>
                </tr>
              </thead>
              <tbody>
                {salaries.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => choisir(s)}
                    className={`cursor-pointer ${s.id === selection ? 'bg-accent/10' : ''}`}
                  >
                    <td className={cell}>{s.matricule ?? ''}</td>
                    <td className={cell}>
                      {nomComplet(s)}
                      {!s.actif && <span className="text-text-dim"> (inactif)</span>}
                    </td>
                    <td className={cell}>
                      {s.contratEnCours ? LIBELLE_TYPE[s.contratEnCours.type] : 'aucun'}
                    </td>
                  </tr>
                ))}
                {salaries.length === 0 && (
                  <tr>
                    <td className={cell} colSpan={3}>
                      Aucun salarié au registre. Un dossier sans salarié est le cas le plus fréquent ·
                      ce n’est pas une anomalie.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border border-border p-2">
            <div className="text-[12px] font-bold mb-1.5">
              {selection
                ? `Fiche · ${salarie.nom}`
                : peutEcrire
                  ? 'Nouvelle fiche'
                  : 'Fiche · choisir un salarié'}
            </div>
            {/* La fiche reste LISIBLE en lecture seule : ses champs sont
                la seule vue de l'état civil d'un salarié. Le fieldset les
                éteint d'un coup plutôt que champ par champ. */}
            <fieldset disabled={!peutEcrire} className="min-w-0">
              <div className="grid grid-cols-3 gap-1.5">
                <label>
                  <span className={etiquette}>Matricule (point 4, éventuel)</span>
                  <input
                    className={champ}
                    value={salarie.matricule}
                    onChange={(e) => setSalarie({ ...salarie, matricule: e.target.value })}
                  />
                </label>
                <label>
                  <span className={etiquette}>Nom (point 3)</span>
                  <input
                    className={champ}
                    value={salarie.nom}
                    onChange={(e) => setSalarie({ ...salarie, nom: e.target.value })}
                  />
                </label>
                <label>
                  <span className={etiquette}>Post-nom</span>
                  <input
                    className={champ}
                    value={salarie.postNom}
                    onChange={(e) => setSalarie({ ...salarie, postNom: e.target.value })}
                  />
                </label>
                <label>
                  <span className={etiquette}>Prénoms</span>
                  <input
                    className={champ}
                    value={salarie.prenoms}
                    onChange={(e) => setSalarie({ ...salarie, prenoms: e.target.value })}
                  />
                </label>
                <label>
                  <span className={etiquette}>Sexe (point 3)</span>
                  <select
                    className={champ}
                    value={salarie.sexe}
                    onChange={(e) => setSalarie({ ...salarie, sexe: e.target.value as Sexe })}
                  >
                    <option value="">choisir…</option>
                    <option value="MASCULIN">Masculin</option>
                    <option value="FEMININ">Féminin</option>
                  </select>
                </label>
                <label>
                  <span className={etiquette}>N° CNSS du travailleur (point 4)</span>
                  <input
                    className={champ}
                    value={salarie.numeroAffiliationCnss}
                    onChange={(e) =>
                      setSalarie({ ...salarie, numeroAffiliationCnss: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span className={etiquette}>Date de naissance (point 5)</span>
                  <input
                    type="date"
                    className={champ}
                    value={salarie.dateNaissance}
                    onChange={(e) => setSalarie({ ...salarie, dateNaissance: e.target.value })}
                  />
                </label>
                <label>
                  <span className={etiquette}>ou millésime présumé</span>
                  <input
                    className={champ}
                    value={salarie.millesimeNaissance}
                    onChange={(e) => setSalarie({ ...salarie, millesimeNaissance: e.target.value })}
                    placeholder="1990"
                  />
                </label>
                <label>
                  <span className={etiquette}>Lieu de naissance (point 6)</span>
                  <input
                    className={champ}
                    value={salarie.lieuNaissance}
                    onChange={(e) => setSalarie({ ...salarie, lieuNaissance: e.target.value })}
                  />
                </label>
                <label>
                  <span className={etiquette}>Nationalité (point 6)</span>
                  <input
                    className={champ}
                    value={salarie.nationalite}
                    onChange={(e) => setSalarie({ ...salarie, nationalite: e.target.value })}
                  />
                </label>
                <label>
                  <span className={etiquette}>Conjoint (point 7)</span>
                  <input
                    className={champ}
                    value={salarie.nomConjoint}
                    onChange={(e) => setSalarie({ ...salarie, nomConjoint: e.target.value })}
                  />
                </label>
                <label>
                  <span className={etiquette}>Aptitude constatée le (point 15)</span>
                  <input
                    type="date"
                    className={champ}
                    value={salarie.aptitudeConstateeLe}
                    onChange={(e) => setSalarie({ ...salarie, aptitudeConstateeLe: e.target.value })}
                  />
                </label>
                <label>
                  <span className={etiquette}>par</span>
                  <input
                    className={champ}
                    value={salarie.aptitudeConstateePar}
                    onChange={(e) => setSalarie({ ...salarie, aptitudeConstateePar: e.target.value })}
                  />
                </label>
                <label className="text-[11px] flex items-end gap-1 pb-1">
                  <input
                    type="checkbox"
                    checked={salarie.aptitudeProvisoire}
                    onChange={(e) => setSalarie({ ...salarie, aptitudeProvisoire: e.target.checked })}
                  />
                  Certificat provisoire (art. 38 · à confirmer sous trois mois)
                </label>
                <label>
                  <span className={etiquette}>Déclaration d’engagement (art. 217)</span>
                  <input
                    type="date"
                    className={champ}
                    value={salarie.declarationEngagementLe}
                    onChange={(e) =>
                      setSalarie({ ...salarie, declarationEngagementLe: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span className={etiquette}>Déclaration de départ (art. 217)</span>
                  <input
                    type="date"
                    className={champ}
                    value={salarie.declarationDepartLe}
                    onChange={(e) => setSalarie({ ...salarie, declarationDepartLe: e.target.value })}
                  />
                </label>
              </div>

              <div className="mt-2">
                <div className="flex items-center justify-between">
                  <div className={etiquette}>
                    Enfants à charge (point 7 · la date de naissance de chacun est exigée)
                  </div>
                  {peutEcrire && (
                    <button
                      type="button"
                      className="text-[11px] text-accent"
                      onClick={() =>
                        setEnfants([...enfants, { nom: '', postNom: '', prenoms: '', dateNaissance: '' }])
                      }
                    >
                      Ajouter
                    </button>
                  )}
                </div>
                {enfants.map((e, i) => (
                  <div key={i} className="grid grid-cols-4 gap-1 mt-1">
                    <input
                      className={champ}
                      placeholder="Nom"
                      value={e.nom}
                      onChange={(ev) =>
                        setEnfants(enfants.map((x, j) => (j === i ? { ...x, nom: ev.target.value } : x)))
                      }
                    />
                    <input
                      className={champ}
                      placeholder="Post-nom"
                      value={e.postNom ?? ''}
                      onChange={(ev) =>
                        setEnfants(
                          enfants.map((x, j) => (j === i ? { ...x, postNom: ev.target.value } : x)),
                        )
                      }
                    />
                    <input
                      className={champ}
                      placeholder="Prénoms"
                      value={e.prenoms ?? ''}
                      onChange={(ev) =>
                        setEnfants(
                          enfants.map((x, j) => (j === i ? { ...x, prenoms: ev.target.value } : x)),
                        )
                      }
                    />
                    <input
                      type="date"
                      className={champ}
                      value={e.dateNaissance ?? ''}
                      onChange={(ev) =>
                        setEnfants(
                          enfants.map((x, j) =>
                            j === i ? { ...x, dateNaissance: ev.target.value } : x,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </fieldset>

            {peutEcrire && (
              <button
                type="button"
                disabled={enCours || !salarie.nom.trim() || !salarie.sexe}
                onClick={enregistrerSalarie}
                className="mt-2 px-3 py-1 border border-accent text-accent text-[12px] disabled:opacity-40"
              >
                {selection ? 'Mettre à jour' : 'Inscrire au registre'}
              </button>
            )}

            {choisi && (
              <div className="mt-3 border-t border-border pt-2">
                <div className="text-[12px] font-bold mb-1">
                  Contrats de {nomComplet(choisi)} ({choisi.nombreContrats})
                </div>
                <table className="w-full text-[12px] border-collapse mb-2">
                  <thead>
                    <tr className="text-text-dim">
                      <th className={`${cell} text-left`}>Type</th>
                      <th className={`${cell} text-left`}>Entrée en vigueur</th>
                      <th className={`${cell} text-left`}>Terme prévu</th>
                      <th className={`${cell} text-left`}>Fin réelle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {choisi.contrats.map((c) => (
                      <tr key={c.id}>
                        <td className={cell}>{LIBELLE_TYPE[c.type]}</td>
                        <td className={cell}>{jour(c.dateEntreeEnVigueur)}</td>
                        <td className={cell}>{jour(c.dateFinPrevue)}</td>
                        <td className={cell}>{jour(c.dateFin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {peutEcrire && (
                  <>
                    <div className={etiquette}>Nouveau contrat</div>
                    <div className="grid grid-cols-3 gap-1.5 mt-1">
                      <label>
                        <span className={etiquette}>Type (art. 39)</span>
                        <select
                          className={champ}
                          value={contrat.type}
                          onChange={(e) =>
                            setContrat({ ...contrat, type: e.target.value as TypeContrat })
                          }
                        >
                          {(Object.keys(LIBELLE_TYPE) as TypeContrat[]).map((t) => (
                            <option key={t} value={t}>
                              {LIBELLE_TYPE[t]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className={etiquette}>Entrée en vigueur (point 13)</span>
                        <input
                          type="date"
                          className={champ}
                          value={contrat.dateEntreeEnVigueur}
                          onChange={(e) =>
                            setContrat({ ...contrat, dateEntreeEnVigueur: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        <span className={etiquette}>Terme prévu (art. 41)</span>
                        <input
                          type="date"
                          className={champ}
                          value={contrat.dateFinPrevue}
                          onChange={(e) => setContrat({ ...contrat, dateFinPrevue: e.target.value })}
                        />
                      </label>
                      <label>
                        <span className={etiquette}>Conclu le (point 14)</span>
                        <input
                          type="date"
                          className={champ}
                          value={contrat.dateConclusion}
                          onChange={(e) => setContrat({ ...contrat, dateConclusion: e.target.value })}
                        />
                      </label>
                      <label>
                        <span className={etiquette}>à (point 14)</span>
                        <input
                          className={champ}
                          value={contrat.lieuConclusion}
                          onChange={(e) => setContrat({ ...contrat, lieuConclusion: e.target.value })}
                        />
                      </label>
                      <label>
                        <span className={etiquette}>Nature du travail (point 8)</span>
                        <input
                          className={champ}
                          value={contrat.natureTravail}
                          onChange={(e) => setContrat({ ...contrat, natureTravail: e.target.value })}
                        />
                      </label>
                      <label>
                        <span className={etiquette}>Lieu d’exécution (point 10)</span>
                        <input
                          className={champ}
                          value={contrat.lieuExecution}
                          onChange={(e) => setContrat({ ...contrat, lieuExecution: e.target.value })}
                        />
                      </label>
                      <label>
                        <span className={etiquette}>Rémunération convenue (point 9)</span>
                        <input
                          className={champ}
                          value={contrat.remunerationBase}
                          onChange={(e) => setContrat({ ...contrat, remunerationBase: e.target.value })}
                        />
                      </label>
                      <label>
                        <span className={etiquette}>Préavis stipulé, en jours (point 12)</span>
                        <input
                          className={champ}
                          value={contrat.dureePreavisJours}
                          onChange={(e) => setContrat({ ...contrat, dureePreavisJours: e.target.value })}
                        />
                      </label>
                      <label>
                        <span className={etiquette}>Catégorie (convention collective)</span>
                        <input
                          className={champ}
                          value={contrat.categorieProfessionnelle}
                          onChange={(e) =>
                            setContrat({ ...contrat, categorieProfessionnelle: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        <span className={etiquette}>Classe de la tension salariale (1 à 17)</span>
                        <select
                          className={champ}
                          value={contrat.classeProfessionnelle}
                          onChange={(e) =>
                            setContrat({ ...contrat, classeProfessionnelle: e.target.value })
                          }
                        >
                          <option value="">non tranchée</option>
                          {CLASSES.map((c) => (
                            <option key={c.classe} value={c.classe}>
                              {c.classe} · {c.libelle}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className={etiquette}>Périodicité de la rémunération</span>
                        <select
                          className={champ}
                          value={contrat.periodiciteRemuneration}
                          onChange={(e) =>
                            setContrat({
                              ...contrat,
                              periodiciteRemuneration: e.target.value as typeof contrat.periodiciteRemuneration,
                            })
                          }
                        >
                          <option value="">non renseignée</option>
                          <option value="JOUR">par jour</option>
                          <option value="SEMAINE">par semaine</option>
                          <option value="MOIS">par mois</option>
                          <option value="ANNEE">par an</option>
                        </select>
                      </label>
                      <label>
                        <span className={etiquette}>Ouvrage déterminé (art. 40)</span>
                        <input
                          className={champ}
                          value={contrat.ouvrageDetermine}
                          onChange={(e) => setContrat({ ...contrat, ouvrageDetermine: e.target.value })}
                        />
                      </label>
                      <label>
                        <span className={etiquette}>Motif de remplacement (art. 45)</span>
                        <input
                          className={champ}
                          value={contrat.motifRemplacement}
                          onChange={(e) => setContrat({ ...contrat, motifRemplacement: e.target.value })}
                        />
                      </label>
                      <label>
                        <span className={etiquette}>Essai, en jours (art. 43)</span>
                        <input
                          className={champ}
                          value={contrat.essaiDureeJours}
                          onChange={(e) => setContrat({ ...contrat, essaiDureeJours: e.target.value })}
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-1 mt-1.5 text-[11px]">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={contrat.constateParEcrit}
                          onChange={(e) =>
                            setContrat({ ...contrat, constateParEcrit: e.target.checked })
                          }
                        />
                        Constaté par écrit (art. 44)
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={contrat.emploiPermanent}
                          onChange={(e) => setContrat({ ...contrat, emploiPermanent: e.target.checked })}
                        />
                        Emploi permanent (art. 42)
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={contrat.separeDeSaFamille}
                          onChange={(e) =>
                            setContrat({ ...contrat, separeDeSaFamille: e.target.checked })
                          }
                        />
                        Travailleur séparé de sa famille (art. 41 · plafond ramené à un an)
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={contrat.manoeuvreSansSpecialite}
                          onChange={(e) =>
                            setContrat({ ...contrat, manoeuvreSansSpecialite: e.target.checked })
                          }
                        />
                        Manœuvre sans spécialité (art. 43 · essai plafonné à un mois)
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={contrat.clauseEssai}
                          onChange={(e) => setContrat({ ...contrat, clauseEssai: e.target.checked })}
                        />
                        Clause d’essai
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={contrat.essaiConstateParEcrit}
                          onChange={(e) =>
                            setContrat({ ...contrat, essaiConstateParEcrit: e.target.checked })
                          }
                        />
                        Clause d’essai constatée par écrit (art. 43)
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={contrat.viseParOnem}
                          onChange={(e) => setContrat({ ...contrat, viseParOnem: e.target.checked })}
                        />
                        Visé par l’Office national de l’emploi (art. 47)
                      </label>
                    </div>
                    <button
                      type="button"
                      disabled={enCours || !contrat.dateEntreeEnVigueur}
                      onClick={creerContrat}
                      className="mt-2 px-3 py-1 border border-accent text-accent text-[12px] disabled:opacity-40"
                    >
                      Enregistrer le contrat
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      {onglet === 'confrontation' && confrontation && (
        <div className="max-w-[1240px]">
          {confrontation.manqueEmployeur && (
            <div className="border border-warning/40 bg-warning/5 px-3.5 py-2.5 mb-2.5 text-[12px]">
              <strong>Le numéro d’immatriculation de l’employeur à la CNSS n’est pas renseigné.</strong>{' '}
              C’est la deuxième des quinze énonciations de l’article 212, et elle est du côté de
              l’employeur : tant qu’elle manque, <em>aucun</em> contrat de ce dossier n’est complet,
              quel que soit le soin mis aux fiches. Renseignez-la dans Structure &gt; Paramètres du
              dossier.
            </div>
          )}
          <div className="text-[12px] mb-1.5">
            {confrontation.totalSignalements === 0
              ? 'Aucun signalement. Chaque contrat porte les quinze énonciations, et aucune requalification de plein droit ne s’applique.'
              : `${confrontation.totalSignalements} signalement(s) sur ${confrontation.fiches.length} contrat(s).`}
          </div>
          {confrontation.fiches.map((f) => (
            <div key={f.contratId} className="border border-border mb-2 p-2 text-[12px]">
              <div className="font-bold">
                {f.salarie} · {LIBELLE_TYPE[f.type]} du {jour(f.dateEntreeEnVigueur)}
                {f.dateFin ? ` au ${jour(f.dateFin)}` : ''}
              </div>
              {f.requalifications.map((r) => (
                <div key={r.motif} className="mt-1 border-l-2 border-danger pl-2">
                  <div className="font-bold text-danger">
                    Requalifié en contrat à durée indéterminée · {r.article}
                  </div>
                  <div className="italic text-text-dim">« {r.formule} »</div>
                  <div>{r.explication}</div>
                </div>
              ))}
              {f.mentionsManquantes.length > 0 && (
                <div className="mt-1">
                  <div className="font-bold">
                    Énonciations manquantes de l’article 212 ({f.mentionsManquantes.length})
                  </div>
                  <ul className="list-disc ml-4">
                    {f.mentionsManquantes.map((m) => (
                      <li key={m.numero}>
                        <strong>Point {m.numero}</strong> · {m.motif}{' '}
                        <span className="text-text-dim">({m.ou})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {f.remunerationMinimale.conforme === false && (
                <div className="mt-1 border-l-2 border-danger pl-2">
                  <div className="font-bold text-danger">
                    Rémunération convenue en deçà du minimum légal
                  </div>
                  <div>{f.remunerationMinimale.explication}</div>
                  {f.remunerationMinimale.manqueFc !== null && (
                    <div>
                      Manque : <strong>{f.remunerationMinimale.manqueFc.toLocaleString('fr-FR')} FC</strong>.
                    </div>
                  )}
                </div>
              )}
              {f.remunerationMinimale.abstention !== null && (
                <div className="mt-1 text-text-dim">
                  Minimum légal non contrôlé · {f.remunerationMinimale.explication}
                </div>
              )}
              {f.essai.reduiteDePleinDroit && (
                <div className="mt-1">
                  Clause d’essai <strong>réduite de plein droit</strong> à {f.essai.plafondJours}{' '}
                  jours (art. 43). <span className="text-text-dim">{f.essai.reserve}</span>
                </div>
              )}
              {f.essai.ecritManquant && (
                <div className="mt-1">
                  La clause d’essai n’est pas constatée par écrit, que l’article 43 exige.
                </div>
              )}
              {f.visaOnemManquant && (
                <div className="mt-1">
                  Contrat écrit non visé par l’Office national de l’emploi (art. 47) · le défaut
                  ouvre au travailleur la résiliation sans préavis.
                </div>
              )}
              {f.aptitudeProvisoirePerimee && (
                <div className="mt-1">
                  Certificat d’aptitude <strong>provisoire</strong> non confirmé au-delà des trois
                  mois de l’article 38.
                </div>
              )}
              {f.declarations
                .filter((d) => d.enRetard)
                .map((d) => (
                  <div key={d.objet} className="mt-1">
                    Déclaration d’{d.objet === 'ENGAGEMENT' ? 'engagement' : 'un départ'} en retard ·
                    elle était due le {jour(d.echeance)} {d.destinataires} ({d.article}).
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}

      {onglet === 'effectif' && (
        <div className="max-w-[1240px] text-[12px]">
          <label className="block mb-2">
            <span className={etiquette}>Effectif à la date du</span>
            <input
              type="date"
              className={`${champ} max-w-[180px]`}
              value={aLa}
              onChange={(e) => setALa(e.target.value)}
            />
          </label>
          {effectif && (
            <table className="border-collapse">
              <tbody>
                <tr>
                  <td className={cell}>Effectif</td>
                  <td className={cell}>{effectif.effectif}</td>
                </tr>
                <tr>
                  <td className={cell}>Hommes / Femmes</td>
                  <td className={cell}>
                    {effectif.hommes} / {effectif.femmes}
                  </td>
                </tr>
                <tr>
                  <td className={cell}>Permanents (contrats à durée indéterminée)</td>
                  <td className={cell}>{effectif.permanents}</td>
                </tr>
                <tr>
                  <td className={cell}>Main-d’œuvre nationale</td>
                  <td className={cell}>
                    {effectif.partMainOeuvreNationale === null
                      ? 'non calculée'
                      : `${effectif.nationaux} / ${effectif.effectif} · ${effectif.partMainOeuvreNationale.toFixed(1)} %`}
                  </td>
                </tr>
                <tr>
                  <td className={cell}>Source</td>
                  <td className={cell}>{effectif.source}</td>
                </tr>
              </tbody>
            </table>
          )}
          {effectif?.reserve && (
            <div className="border border-warning/40 bg-warning/5 px-3.5 py-2.5 mt-2">
              {effectif.reserve}
            </div>
          )}
          <div className="text-text-dim mt-2">
            Ces nombres sont une <strong>proposition</strong>. L’effectif des notes annexes (27B en
            SYSCOHADA, 29B en SYCEBNL) et la part de main-d’œuvre locale de l’accord-cadre restent
            des valeurs <strong>saisies</strong>, avec leur source et leur date : un registre
            incomplet produirait un pourcentage faux sous une apparence de calcul, sur un engagement
            dont le manquement se sanctionne.
          </div>
        </div>
      )}

      {onglet === 'simulation' && (
        <div className="ecran-seul max-w-[1240px] text-[12px]">
          {/*
            CE QUE LA FENÊTRE DIT AVANT TOUT CHIFFRE. Un écran qui montre un
            brut, des retenues et un net EST lu comme un bulletin, quoi qu'il
            annonce ensuite. La réserve est donc en tête, et le serveur la
            renvoie avec chaque simulation plutôt que de la laisser ici seule.
          */}
          <div className="border border-warning/40 bg-warning/5 px-3.5 py-2.5 mb-2.5">
            <strong>Ceci n’est pas un bulletin de paie</strong>, et cela ne tient pas lieu de{' '}
            <strong>livre de paie</strong> des articles 213 à 215. OmegaX rend ici les{' '}
            <strong>deux assiettes</strong> d’un mois, les cotisations des deux côtés, la retenue de
            l’article 119 de la loi n° 23/053, le net, la quotité saisissable de l’article 114 et
            une <strong>proposition</strong> d’écriture. Il ne conserve rien, ne poste rien et ne
            remet aucun décompte écrit au sens de l’article 103. La retenue rendue est un{' '}
            <strong>acompte</strong> sur l’impôt annuel de l’article 116, jamais un solde. Le
            décompte écrit s’obtient en <strong>émettant le bulletin</strong>, en bas de la
            simulation, qui fige ce calcul et lui donne un numéro.
          </div>

          <div className="border border-border px-3.5 py-2.5 mb-2.5">
            <div className="text-[11px] text-text-dim mb-2">
              Les deux assiettes ne coïncident pas, et c’est l’erreur la plus coûteuse du domaine.
              Le <strong>Code du travail</strong>, article 7, point 8, sort cinq natures de la
              rémunération <strong>sans aucune condition</strong>. La <strong>loi fiscale</strong>{' '}
              les fait d’abord entrer dans l’imposable (article 68) puis les immunise{' '}
              <strong>sous condition</strong> (article 69). Une indemnité de logement de 40 % du
              salaire sort de l’assiette sociale de plein droit et reste entièrement imposable.
            </div>

            <div className="flex flex-wrap gap-3 items-end mb-2.5">
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Mois de paie</span>
                <input
                  type="month"
                  value={moisDePaie}
                  onChange={(e) => setMoisDePaie(e.target.value)}
                  className="border border-border bg-transparent px-2 py-1 w-[140px]"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Salarié (facultatif)</span>
                <select
                  value={selection}
                  onChange={(e) => setSelection(e.target.value)}
                  className="border border-border bg-transparent px-2 py-1 w-[220px]"
                >
                  <option value="">Aucun</option>
                  {salaries.map((s) => (
                    <option key={s.id} value={s.id}>
                      {nomComplet(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Retenues art. 71 (FC)</span>
                <input
                  value={retenues71}
                  onChange={(e) => setRetenues71(e.target.value)}
                  className="border border-border bg-transparent px-2 py-1 w-[140px] text-right"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Enfants bénéficiaires alloc.</span>
                <input
                  value={enfantsAllocations}
                  onChange={(e) => setEnfantsAllocations(e.target.value)}
                  className="border border-border bg-transparent px-2 py-1 w-[150px] text-right"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Taux légal alloc. fam. (FC)</span>
                <input
                  value={tauxAllocations}
                  onChange={(e) => setTauxAllocations(e.target.value)}
                  className="border border-border bg-transparent px-2 py-1 w-[160px] text-right"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Classe (art. 114)</span>
                <input
                  value={classePro}
                  onChange={(e) => setClassePro(e.target.value)}
                  className="border border-border bg-transparent px-2 py-1 w-[120px] text-right"
                />
              </label>
              <label className="flex items-center gap-1 pb-1">
                <input
                  type="checkbox"
                  checked={logementNature}
                  onChange={(e) => setLogementNature(e.target.checked)}
                />
                <span className="text-[11px]">Logement fourni en nature</span>
              </label>
              <label className="flex items-center gap-1 pb-1">
                <input
                  type="checkbox"
                  checked={obligationAlimentaire}
                  onChange={(e) => setObligationAlimentaire(e.target.checked)}
                />
                <span className="text-[11px]">Créance alimentaire légale</span>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Employeur INPP</span>
                <select
                  value={natureInpp}
                  onChange={(e) => setNatureInpp(e.target.value as '' | 'PUBLIC' | 'PRIVE')}
                  className="border border-border bg-transparent px-2 py-1 w-[130px]"
                >
                  <option value="">Non renseigné</option>
                  <option value="PRIVE">Privé</option>
                  <option value="PUBLIC">Public</option>
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Effectif (privé)</span>
                <input
                  value={effectifInpp}
                  onChange={(e) => setEffectifInpp(e.target.value)}
                  className="border border-border bg-transparent px-2 py-1 w-[110px] text-right"
                />
              </label>
              <label className="flex items-center gap-1 pb-1">
                <input
                  type="checkbox"
                  checked={majorationRp}
                  onChange={(e) => setMajorationRp(e.target.checked)}
                />
                <span className="text-[11px]">Risques prof. majorés</span>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Personnes à charge</span>
                <input
                  value={personnesACharge}
                  onChange={(e) => setPersonnesACharge(e.target.value)}
                  className="border border-border bg-transparent px-2 py-1 w-[120px] text-right"
                />
              </label>
            </div>

            <div className="text-[11px] text-text-dim mb-2">
              Les <strong>retenues de l’article 71</strong> sont saisies, quote-part ouvrière de la
              CNSS en tête : leurs taux vivent au registre des retenues avec leur date d’effet, et
              ce module ne les recopie pas. Le{' '}
              <strong>taux légal des allocations familiales</strong>, lui, est désormais{' '}
              <strong>calculé</strong> à partir du nombre d’enfants bénéficiaires : c’est la colonne
              19 du décret n° 25/22, mensualisée. Ce n’est <strong>pas</strong> le montant de
              8 100 FC de l’arrêté ministériel n° 137/2018, qui est une prestation{' '}
              <strong>servie directement par la Caisse</strong> et que l’employeur n’accorde pas.
              Le champ de saisie ne sert plus qu’au mois qu’aucune annexe ne couvre. La{' '}
              <strong>classe</strong> place le seuil de l’article 114 ; sans elle, ou dès qu’un
              logement est <strong>fourni en nature</strong>, la quotité n’est pas chiffrée.
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className={`${etiquette} py-1`}>Nature</th>
                  <th className={`${etiquette} py-1`}>Libellé</th>
                  <th className={`${etiquette} py-1 text-right`}>Montant FC</th>
                  <th className={`${etiquette} py-1`}>Art. 69, 8 attesté</th>
                  <th className={`${etiquette} py-1`}>Art. 68, 1</th>
                  <th className={`${etiquette} py-1`} />
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => {
                  const nature = NATURES_PAIE.find((n) => n.valeur === l.nature);
                  const attestable =
                    l.nature === 'INDEMNITE_DE_TRANSPORT' || l.nature === 'SOINS_DE_SANTE';
                  return (
                    <tr key={i} className="border-b border-border/40">
                      <td className="py-1 pr-2">
                        <select
                          value={l.nature}
                          onChange={(e) =>
                            setLignes(
                              lignes.map((x, j) =>
                                j === i ? { ...x, nature: e.target.value } : x,
                              ),
                            )
                          }
                          className="border border-border bg-transparent px-1.5 py-0.5 w-[260px]"
                        >
                          <optgroup label="Dans la rémunération (art. 7, point 8)">
                            {NATURES_PAIE.filter((n) => n.dansLaRemuneration).map((n) => (
                              <option key={n.valeur} value={n.valeur}>
                                {n.libelle}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Hors rémunération (art. 7, point 8)">
                            {NATURES_PAIE.filter((n) => !n.dansLaRemuneration).map((n) => (
                              <option key={n.valeur} value={n.valeur}>
                                {n.libelle}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          value={l.libelle}
                          onChange={(e) =>
                            setLignes(
                              lignes.map((x, j) =>
                                j === i ? { ...x, libelle: e.target.value } : x,
                              ),
                            )
                          }
                          placeholder={nature?.libelle ?? ''}
                          className="border border-border bg-transparent px-1.5 py-0.5 w-[200px]"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          value={l.montantFc}
                          onChange={(e) =>
                            setLignes(
                              lignes.map((x, j) =>
                                j === i ? { ...x, montantFc: e.target.value } : x,
                              ),
                            )
                          }
                          className="border border-border bg-transparent px-1.5 py-0.5 w-[120px] text-right"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        {/*
                          LE CHAMP N'EXISTE QUE LÀ OÙ LE TEXTE POSE UNE
                          CONDITION QU'AUCUN LIVRE NE PORTE · transport
                          (art. 69, 8, b) et frais médicaux (art. 69, 8, c).
                          L'offrir partout ferait croire que le cabinet peut
                          attester le plafond de 30 % du logement, que le
                          serveur calcule lui-même.
                        */}
                        {attestable ? (
                          <select
                            value={l.attestee}
                            onChange={(e) =>
                              setLignes(
                                lignes.map((x, j) =>
                                  j === i
                                    ? { ...x, attestee: e.target.value as LignePaie['attestee'] }
                                    : x,
                                ),
                              )
                            }
                            className="border border-border bg-transparent px-1.5 py-0.5 w-[120px]"
                          >
                            <option value="">Non renseigné</option>
                            <option value="oui">Condition remplie</option>
                            <option value="non">Condition non remplie</option>
                          </select>
                        ) : (
                          <span className="text-text-dim">sans objet</span>
                        )}
                      </td>
                      <td className="py-1 pr-2">
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={l.remboursement}
                            onChange={(e) =>
                              setLignes(
                                lignes.map((x, j) =>
                                  j === i ? { ...x, remboursement: e.target.checked } : x,
                                ),
                              )
                            }
                          />
                          <span className="text-[10.5px] text-text-dim">dépense effective</span>
                        </label>
                      </td>
                      <td className="py-1 text-right">
                        <button
                          type="button"
                          onClick={() => setLignes(lignes.filter((_, j) => j !== i))}
                          className="border border-border px-2 py-0.5 text-text-dim"
                        >
                          Retirer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => setLignes([...lignes, { ...LIGNE_VIERGE }])}
              className="border border-border px-3 py-1"
            >
              Ajouter un élément
            </button>
            <button
              type="button"
              disabled={enCours || !moisDePaie}
              onClick={simuler}
              className="border border-accent text-accent px-3 py-1 disabled:opacity-40"
            >
              Simuler
            </button>
          </div>

          {simulation && (
            <div className="mt-3">
              {!simulation.baremeApplicable && simulation.motifBaremeInapplicable && (
                <div className="border border-warning/40 bg-warning/5 px-3.5 py-2.5 mb-2.5">
                  {simulation.motifBaremeInapplicable}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="border border-border px-3.5 py-2.5">
                  <div className={etiquette}>Assiette sociale</div>
                  <div className="text-[14px] font-bold">
                    {fc(simulation.assiettes.assietteSocialeFc)} FC
                  </div>
                  <div className="text-[11px] text-text-dim mt-1">
                    Rémunération au sens de l’article 7, point 8 du Code du travail, reprise par
                    l’article 17 de l’arrêté ministériel n° 146/2018. C’est elle que les cotisations
                    frappent.
                  </div>
                  {simulation.assiettes.horsRemuneration.length > 0 && (
                    <ul className="mt-1.5 text-[11px]">
                      {simulation.assiettes.horsRemuneration.map((h, i) => (
                        <li key={i} className="py-0.5 border-t border-border/40">
                          <span className="text-text-dim">Écarté</span> · {h.libelle} ·{' '}
                          {fc(h.montantFc)} FC
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="border border-border px-3.5 py-2.5">
                  <div className={etiquette}>Assiette fiscale nette (art. 70)</div>
                  <div className="text-[14px] font-bold">
                    {simulation.assiettes.assietteFiscaleNetteFc === null
                      ? 'Indéterminée'
                      : `${fc(simulation.assiettes.assietteFiscaleNetteFc)} FC`}
                  </div>
                  <div className="text-[11px] text-text-dim mt-1">
                    Brut imposable des articles 68 et 69
                    {simulation.assiettes.assietteFiscaleBruteFc !== null &&
                      ` (${fc(simulation.assiettes.assietteFiscaleBruteFc)} FC)`}
                    , diminué des retenues de l’article 71 (
                    {fc(simulation.assiettes.retenuesArticle71Fc)} FC).
                  </div>
                </div>
              </div>

              {simulation.assiettes.abstentions.length > 0 && (
                <div className="border border-warning/40 bg-warning/5 px-3.5 py-2.5 mt-2.5">
                  <div className="font-bold mb-1">
                    La simulation s’abstient plutôt que de supposer
                  </div>
                  <ul>
                    {simulation.assiettes.abstentions.map((a, i) => (
                      <li key={i} className="py-1 border-t border-border/40">
                        <strong>{a.libelle}</strong> · {fc(a.montantFc)} FC
                        <div className="text-[11px] mt-0.5">{a.explication}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="overflow-x-auto mt-2.5">
                <table className="w-full min-w-[620px] border-collapse">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className={`${etiquette} py-1`}>Élément</th>
                      <th className={`${etiquette} py-1 text-right`}>Montant</th>
                      <th className={`${etiquette} py-1 text-right`}>Imposable</th>
                      <th className={`${etiquette} py-1`}>Article qui décide</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulation.assiettes.sortsFiscaux.map((s, i) => (
                      <tr key={i} className="border-b border-border/40 align-top">
                        <td className="py-1 pr-2">{s.libelle}</td>
                        <td className="py-1 pr-2 text-right font-mono">{fc(s.montantFc)}</td>
                        <td className="py-1 pr-2 text-right font-mono">
                          {s.imposableFc === null ? 'indéterminé' : fc(s.imposableFc)}
                        </td>
                        <td className="py-1 text-[11px] text-text-dim">{s.motif}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {simulation.retenue && (
                <div className="border border-border px-3.5 py-2.5 mt-2.5">
                  <div className={etiquette}>Retenue du mois (art. 119)</div>
                  <div className="text-[16px] font-bold">
                    {fc(simulation.retenue.retenueFc)} FC
                  </div>
                  <BaremeMensuelIrpp
                    mensuel={simulation.retenue.mensuel}
                    revenuAnnualiseFc={simulation.retenue.revenuAnnualiseFc}
                  />
                </div>
              )}

              {simulation.sourceProposition && (
                <div className="border border-border px-3.5 py-2.5 mt-2.5 text-[11px]">
                  <strong>
                    Personnes à charge · le registre en propose{' '}
                    {simulation.propositionPersonnesACharge}, la simulation en retient{' '}
                    {simulation.personnesAChargeRetenues}.
                  </strong>
                  <div className="text-text-dim mt-0.5">{simulation.sourceProposition}</div>
                </div>
              )}

              <div className="overflow-x-auto mt-2.5">
                <table className="w-full min-w-[620px] border-collapse">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className={`${etiquette} py-1`}>Cotisation</th>
                      <th className={`${etiquette} py-1`}>Charge</th>
                      <th className={`${etiquette} py-1 text-right`}>Taux</th>
                      <th className={`${etiquette} py-1 text-right`}>Assiette</th>
                      <th className={`${etiquette} py-1 text-right`}>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulation.cotisations.lignes.map((c) => (
                      <tr key={c.cle} className="border-b border-border/40">
                        <td className="py-1 pr-2">
                          {c.libelle}
                          {c.reserve && (
                            <div className="text-[10.5px] text-text-dim">{c.reserve}</div>
                          )}
                        </td>
                        <td className="py-1 pr-2 text-[11px]">
                          {c.charge === 'TRAVAILLEUR' ? 'Travailleur' : 'Employeur'}
                        </td>
                        <td className="py-1 pr-2 text-right font-mono">{c.tauxPourCent} %</td>
                        <td className="py-1 pr-2 text-right font-mono">{fc(c.assietteFc)}</td>
                        <td className="py-1 text-right font-mono">{fc(c.montantFc)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-border font-bold">
                      <td className="py-1" colSpan={4}>
                        Total employeur
                      </td>
                      <td className="py-1 text-right font-mono">
                        {fc(simulation.cotisations.totalEmployeurFc)}
                      </td>
                    </tr>
                    <tr className="font-bold">
                      <td className="py-1" colSpan={4}>
                        Total retenu sur la paie
                      </td>
                      <td className="py-1 text-right font-mono">
                        {fc(simulation.cotisations.totalTravailleurFc)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {simulation.cotisations.abstentions.length > 0 && (
                <div className="border border-warning/40 bg-warning/5 px-3.5 py-2.5 mt-2.5">
                  <ul>
                    {simulation.cotisations.abstentions.map((a, i) => (
                      <li key={i} className="py-0.5">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border border-border px-3.5 py-2.5 mt-2.5">
                <div className={etiquette}>Net à payer</div>
                <div className="text-[16px] font-bold">
                  {simulation.net.netAPayerFc === null
                    ? 'Indéterminé'
                    : `${fc(simulation.net.netAPayerFc)} FC`}
                </div>
                <div className="text-[11px] text-text-dim mt-1">
                  Total versé {fc(simulation.net.totalVerseFc)} FC, moins la quote-part ouvrière
                  de {fc(simulation.net.quotePartOuvriereFc)} FC et l’impôt de{' '}
                  {simulation.net.irppFc === null
                    ? 'montant indéterminé'
                    : `${fc(simulation.net.irppFc)} FC`}
                  .{' '}
                  <strong>
                    Le net part du total VERSÉ, pas de l’assiette : le logement et le transport
                    sortent de la rémunération, pas de ce que l’employeur paie.
                  </strong>
                </div>
                <ul className="mt-1.5 text-[11px] text-text-dim">
                  {simulation.net.reserves.map((r, i) => (
                    <li key={i} className="py-0.5 border-t border-border/40">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border border-border px-3.5 py-2.5 mt-2.5">
                <div className="flex items-baseline justify-between mb-1.5">
                  <div className={etiquette}>
                    Passation comptable · plan {simulation.passation.referentiel}
                  </div>
                  {simulation.passation.equilibree && (
                    <div className="text-[11px] text-text-dim">
                      Débit {fc(simulation.passation.totalDebitFc)} = Crédit{' '}
                      {fc(simulation.passation.totalCreditFc)}
                    </div>
                  )}
                </div>

                {simulation.passation.refus.length > 0 ? (
                  <div className="border border-warning/40 bg-warning/5 px-3 py-2">
                    <div className="font-bold mb-1">Aucune écriture n’est proposée</div>
                    <ul>
                      {simulation.passation.refus.map((r, i) => (
                        <li key={i} className="py-1 border-t border-border/40 text-[11px]">
                          <strong>{r.motif}</strong> · {r.explication}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] border-collapse">
                        <thead>
                          <tr className="border-b border-border text-left">
                            <th className={`${etiquette} py-1`}>Compte</th>
                            <th className={`${etiquette} py-1`}>Intitulé</th>
                            <th className={`${etiquette} py-1 text-right`}>Débit</th>
                            <th className={`${etiquette} py-1 text-right`}>Crédit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {simulation.passation.lignes.map((l, i, tout) => (
                            <Fragment key={i}>
                              {(i === 0 || tout[i - 1].bloc !== l.bloc) && (
                                <tr className="border-b border-border/40">
                                  <td colSpan={4} className="pt-2 pb-1 font-semibold">
                                    {TITRE_BLOC_PAIE[l.bloc]}
                                  </td>
                                </tr>
                              )}
                              <tr className="border-b border-border/40 align-top">
                                <td className="py-1 pr-2 font-mono">{l.compte}</td>
                                <td className="py-1 pr-2">
                                  {l.intitule}
                                  {l.reserve && (
                                    <div className="text-[10.5px] text-text-dim">{l.reserve}</div>
                                  )}
                                </td>
                                <td className="py-1 pr-2 text-right font-mono">
                                  {l.sens === 'DEBIT' ? fc(l.montantFc) : ''}
                                </td>
                                <td className="py-1 text-right font-mono">
                                  {l.sens === 'CREDIT' ? fc(l.montantFc) : ''}
                                </td>
                              </tr>
                            </Fragment>
                          ))}
                          <tr className="border-t border-border font-bold">
                            <td className="py-1" colSpan={2}>
                              Totaux
                            </td>
                            <td className="py-1 pr-2 text-right font-mono">
                              {fc(simulation.passation.totalDebitFc)}
                            </td>
                            <td className="py-1 text-right font-mono">
                              {fc(simulation.passation.totalCreditFc)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <ul className="mt-1.5 text-[11px] text-text-dim">
                      {simulation.passation.reserves.map((r, i) => (
                        <li key={i} className="py-0.5 border-t border-border/40">
                          {r}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              {/*
                ARTICLE 114 · LA QUOTITÉ SAISISSABLE. Elle ne s'assied ni sur
                le total versé ni sur l'assiette fiscale · sur la RÉMUNÉRATION
                au sens de l'article 7, moins les retenues fiscales et
                sociales. Tous les montants viennent du serveur.
              */}
              <div className="border border-border px-3.5 py-2.5 mt-2.5">
                <div className={`${etiquette} mb-1.5`}>
                  Article 114 · quotité cessible et saisissable
                </div>
                {simulation.quotite.abstentions.length > 0 ? (
                  <ul className="text-[11px]">
                    {simulation.quotite.abstentions.map((a, i) => (
                      <li key={i} className="py-1 border-t border-border/40">
                        <span className="text-warning">{a.motif}</span>
                        <div className="text-text-dim">{a.explication}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-[11px]">
                      <tbody>
                        <tr className="border-t border-border/40">
                          <td className="py-1">Base de l’alinéa 4</td>
                          <td className="py-1 text-right">{fc(simulation.quotite.baseFc)}</td>
                        </tr>
                        <tr className="border-t border-border/40">
                          <td className="py-1">
                            Mensuel minimum de la classe (décret n° 25/22)
                          </td>
                          <td className="py-1 text-right">
                            {fc(simulation.quotite.mensuelMinimumFc)}
                          </td>
                        </tr>
                        <tr className="border-t border-border/40">
                          <td className="py-1">Seuil · cinq fois ce minimum</td>
                          <td className="py-1 text-right">{fc(simulation.quotite.seuilFc)}</td>
                        </tr>
                        <tr className="border-t border-border/40">
                          <td className="py-1">
                            Quotité ordinaire · un cinquième puis un tiers
                          </td>
                          <td className="py-1 text-right">
                            {fc(simulation.quotite.quotiteOrdinaireFc)}
                          </td>
                        </tr>
                        <tr className="border-t border-border/40">
                          <td className="py-1">
                            Quotité alimentaire · deux cinquièmes (alinéa 2)
                          </td>
                          <td className="py-1 text-right">
                            {fc(simulation.quotite.quotiteAlimentaireFc)}
                          </td>
                        </tr>
                        <tr className="border-t border-border">
                          <td className="py-1">
                            <strong>Cumul (alinéa 3)</strong>
                          </td>
                          <td className="py-1 text-right">
                            <strong>{fc(simulation.quotite.quotiteCumuleeFc)}</strong>
                          </td>
                        </tr>
                        <tr className="border-t border-border/40">
                          <td className="py-1 text-ok">Part insaisissable</td>
                          <td className="py-1 text-right text-ok">
                            {fc(simulation.quotite.partInsaisissableFc)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                <ul className="text-[11px] text-text-dim mt-1.5">
                  {simulation.quotite.reserves.map((r, i) => (
                    <li key={i} className="py-1 border-t border-border/40">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              {/*
                ARTICLE 112 · LA LISTE FERMÉE. Elle est ici et pas ailleurs
                parce qu'une retenue illicite ressemble trait pour trait à une
                retenue licite sur un bulletin · c'est au moment de la saisir
                qu'on peut encore l'éviter, jamais au contrôle.
              */}
              <div className="border border-border px-3.5 py-2.5 mt-2.5">
                <div className={`${etiquette} mb-1.5`}>
                  Article 112 · les sept seules retenues autorisées
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-[11px]">
                    <tbody>
                      {simulation.retenuesAutorisees.liste.map((r) => (
                        <tr key={r.littera} className="border-t border-border/40">
                          <td className="py-1 w-[28px] text-text-dim">{r.littera})</td>
                          <td className="py-1">
                            {r.libelle}
                            {r.equivalentActuel && (
                              <div className="text-text-dim">
                                Aujourd’hui : {r.equivalentActuel}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border border-danger/30 bg-danger-soft px-3 py-2 mt-2 text-[11px]">
                  {simulation.retenuesAutorisees.sanction}
                </div>
                <ul className="text-[11px] text-text-dim mt-1.5">
                  {[
                    simulation.retenuesAutorisees.cotisationSyndicale,
                    simulation.retenuesAutorisees.cessionSyndicale,
                    simulation.retenuesAutorisees.litteraeDatees,
                  ].map((r, i) => (
                    <li key={i} className="py-1 border-t border-border/40">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              {(simulation.assiettes.reserves.length > 0 ||
                (simulation.retenue?.reserves.length ?? 0) > 0) && (
                <div className="border border-border px-3.5 py-2.5 mt-2.5 text-[11px]">
                  <div className={`${etiquette} mb-1`}>Réserves de lecture</div>
                  <ul>
                    {[
                      ...simulation.assiettes.reserves,
                      ...(simulation.retenue?.reserves ?? []),
                    ].map((r, i) => (
                      <li key={i} className="py-1 border-t border-border/40 text-text-dim">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {onglet === 'simulation' && simulation && peutEcrire && (
        <div className="ecran-seul max-w-[1240px] text-[12px] border border-border bg-surface px-3.5 py-2.5 mb-2.5 flex flex-wrap items-center gap-3">
          {selection ? (
            <>
              <button
                type="button"
                disabled={enCours}
                onClick={emettreBulletin}
                className="px-3 py-1.5 bg-sel text-white font-semibold disabled:opacity-50"
              >
                Émettre le bulletin de {moisDePaie}
              </button>
              <span className="text-text-dim">
                Numéroté à la suite (art. 214), figé tel que calculé ci-dessus, jamais modifiable
                ensuite : une erreur se corrige en l’annulant, avec son motif.
              </span>
            </>
          ) : (
            <span className="text-text-dim">
              Choisissez un salarié au registre pour émettre son bulletin · la simulation seule ne
              désigne personne.
            </span>
          )}
        </div>
      )}

      {onglet === 'bulletins' && (
        <OngletBulletins moisInitial={moisDePaie} peutEcrire={peutEcrire} />
      )}

      {onglet === 'decompte' && (
        <div className="ecran-seul max-w-[1240px] text-[12px]">
          <div className="border border-warning/40 bg-warning/5 px-3.5 py-2.5 mb-2.5">
            <strong>Le Code du travail ne définit pas le « décompte final ».</strong> C’est un
            usage professionnel, dont le fondement est l’<strong>article 100</strong> : toute somme
            restant due doit être payée au plus tard dans les <strong>deux jours ouvrables</strong>{' '}
            qui suivent la cessation des services. OmegaX calcule les durées que le Code fixe, et
            laisse saisir ce qu’aucun livre ne porte.
          </div>

          <div className="border border-border px-3.5 py-2.5 mb-2.5">
            <div className="flex flex-wrap gap-3 items-end">
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Ancienneté (années)</span>
                <input
                  value={dec.anneesAnciennete}
                  onChange={(e) => setDec({ ...dec, anneesAnciennete: e.target.value })}
                  className="border border-border bg-transparent px-2 py-1 w-[110px] text-right"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Mois entiers de service</span>
                <input
                  value={dec.moisEntiersDeService}
                  onChange={(e) => setDec({ ...dec, moisEntiersDeService: e.target.value })}
                  className="border border-border bg-transparent px-2 py-1 w-[140px] text-right"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Initiative</span>
                <select
                  value={dec.initiative}
                  onChange={(e) =>
                    setDec({ ...dec, initiative: e.target.value as 'EMPLOYEUR' | 'TRAVAILLEUR' })
                  }
                  className="border border-border bg-transparent px-2 py-1 w-[130px]"
                >
                  <option value="EMPLOYEUR">Employeur</option>
                  <option value="TRAVAILLEUR">Travailleur</option>
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Motif</span>
                <select
                  value={dec.motif}
                  onChange={(e) => setDec({ ...dec, motif: e.target.value })}
                  className="border border-border bg-transparent px-2 py-1 w-[160px]"
                >
                  <option value="LICENCIEMENT">Licenciement</option>
                  <option value="DEMISSION">Démission</option>
                  <option value="FAUTE_LOURDE">Faute lourde</option>
                  <option value="FORCE_MAJEURE">Force majeure</option>
                  <option value="TERME_DU_CDD">Terme du CDD</option>
                  <option value="COMMUN_ACCORD">Commun accord</option>
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Taux journalier (FC)</span>
                <input
                  value={dec.remunerationJournaliereFc}
                  onChange={(e) => setDec({ ...dec, remunerationJournaliereFc: e.target.value })}
                  className="border border-border bg-transparent px-2 py-1 w-[140px] text-right"
                />
              </label>
              <label className="flex items-center gap-1 pb-1">
                <input
                  type="checkbox"
                  checked={dec.moinsDeDixHuitAns}
                  onChange={(e) => setDec({ ...dec, moinsDeDixHuitAns: e.target.checked })}
                />
                <span className="text-[11px]">Moins de 18 ans</span>
              </label>
              <label className="flex items-center gap-1 pb-1">
                <input
                  type="checkbox"
                  checked={dec.delegueSyndical}
                  onChange={(e) => setDec({ ...dec, delegueSyndical: e.target.checked })}
                />
                <span className="text-[11px]">Délégué syndical</span>
              </label>
            </div>

            <div className="flex flex-wrap gap-3 items-end mt-2">
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Arriérés (FC)</span>
                <input
                  value={dec.arrieresFc}
                  onChange={(e) => setDec({ ...dec, arrieresFc: e.target.value })}
                  className="border border-border bg-transparent px-2 py-1 w-[130px] text-right"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Moyenne 12 mois (FC)</span>
                <input
                  value={dec.moyenneDouzeMoisFc}
                  onChange={(e) => setDec({ ...dec, moyenneDouzeMoisFc: e.target.value })}
                  className="border border-border bg-transparent px-2 py-1 w-[150px] text-right"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Gratification (FC)</span>
                <input
                  value={dec.gratificationFc}
                  onChange={(e) => setDec({ ...dec, gratificationFc: e.target.value })}
                  className="border border-border bg-transparent px-2 py-1 w-[150px] text-right"
                />
              </label>
              <button
                type="button"
                disabled={enCours}
                onClick={calculerDecompte}
                className="border border-accent text-accent px-3 py-1 disabled:opacity-40"
              >
                Calculer
              </button>
            </div>
            <div className="text-[11px] text-text-dim mt-2">
              Les <strong>mois entiers de service</strong> sont saisis : l’article 141, alinéa 2, y
              fait entrer les jours de repos, de congé payé, les jours fériés et l’incapacité
              jusqu’à six mois par année. Les reconstituer depuis les dates du contrat donnerait un
              chiffre plausible et faux.
            </div>
          </div>

          {decompte && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-2.5">
                <div className="border border-border px-3.5 py-2.5">
                  <div className={etiquette}>Préavis (article 64)</div>
                  <div className="text-[14px] font-bold">
                    {decompte.preavis.joursOuvrables === null
                      ? 'Aucun'
                      : `${decompte.preavis.joursOuvrables} jours ouvrables`}
                  </div>
                  {decompte.preavis.motifAucunPreavis && (
                    <div className="text-[11px] text-text-dim mt-1">
                      {decompte.preavis.motifAucunPreavis}
                    </div>
                  )}
                </div>
                <div className="border border-border px-3.5 py-2.5">
                  <div className={etiquette}>Congé (article 141)</div>
                  <div className="text-[14px] font-bold">
                    {decompte.conge.joursOuvrables} jours ouvrables
                  </div>
                  <div className="text-[11px] text-text-dim mt-1">
                    dont {decompte.conge.joursDeBase} de base et {decompte.conge.joursDAnciennete}{' '}
                    d’ancienneté.
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className={`${etiquette} py-1`}>Rubrique</th>
                      <th className={`${etiquette} py-1 text-right`}>Montant FC</th>
                      <th className={`${etiquette} py-1`}>Fondement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decompte.rubriques.map((r) => (
                      <tr key={r.cle} className="border-b border-border/40 align-top">
                        <td className="py-1 pr-2">{r.libelle}</td>
                        <td className="py-1 pr-2 text-right font-mono">
                          {r.montantFc === null ? 'indéterminé' : fc(r.montantFc)}
                        </td>
                        <td className="py-1 text-[11px] text-text-dim">
                          {r.fondement}
                          {r.reserve && <div className="mt-0.5">{r.reserve}</div>}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-border font-bold">
                      <td className="py-1">Total brut</td>
                      <td className="py-1 pr-2 text-right font-mono">
                        {decompte.totalBrutFc === null
                          ? 'Indéterminé'
                          : fc(decompte.totalBrutFc)}
                      </td>
                      <td className="py-1 text-[11px] text-text-dim font-normal">
                        {decompte.echeancePaiement}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="border border-border px-3.5 py-2.5 mt-2.5 text-[11px]">
                <div className={`${etiquette} mb-1`}>Réserves de lecture</div>
                <ul>
                  {decompte.reserves.map((r, i) => (
                    <li key={i} className="py-1 border-t border-border/40 text-text-dim">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}

      {onglet === 'livre' && (
        <div className="ecran-seul max-w-[1240px] text-[12px]">
          {/*
            CE QUE CETTE FENÊTRE NE FAIT PAS, ET ELLE LE DIT AVANT TOUT LE
            RESTE. OmegaX ne tient pas le livre de paie et ne certifie aucune
            conformité au modèle · l'arrêté de 2008 qui le fixe est identifié
            mais pas lu. Ce qui est rendu est une COUVERTURE des mentions.
          */}
          <div className="border border-warning/40 bg-warning/5 px-3.5 py-2.5 mb-2.5">
            <strong>OmegaX ne tient pas votre livre de paie.</strong> Le modèle est fixé par
            l’<strong>arrêté ministériel n° 12/CAB.MIN/ETPS/042 du 8 août 2008</strong>, qui est au
            corpus : ce sont ses <strong>trente-trois énonciations</strong> qui sont vérifiées
            ci-dessous, et non plus celles de la sécurité sociale. Mais son article 1er exige aussi
            la conformité <strong>au modèle annexé</strong>, qui est une mise en forme : une liste
            de mentions ne la prouve pas, et <strong>rien ici ne certifie cette conformité</strong>.
          </div>

          <div className="border border-border px-3.5 py-2.5 mb-2.5">
            <div className="flex flex-wrap gap-3 items-end mb-2">
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Siège d’exploitation</span>
                <input
                  value={livreSaisie.siegeDExploitation}
                  onChange={(e) =>
                    setLivreSaisie({ ...livreSaisie, siegeDExploitation: e.target.value })
                  }
                  className="border border-border bg-transparent px-2 py-1 w-[220px]"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Forme du document (art. 1er)</span>
                <select
                  value={livreSaisie.forme}
                  onChange={(e) =>
                    setLivreSaisie({
                      ...livreSaisie,
                      forme: e.target.value as '' | 'LIVRE_PAPIER' | 'FICHIER_INFORMATISE' | 'AUTRE_DOCUMENT',
                    })
                  }
                  className="border border-border bg-transparent px-2 py-1 w-[190px]"
                >
                  <option value="">Non déclarée</option>
                  <option value="FICHIER_INFORMATISE">Fichier informatisé</option>
                  <option value="LIVRE_PAPIER">Livre papier</option>
                  <option value="AUTRE_DOCUMENT">Tout autre document</option>
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Autorisation Inspecteur (art. 215, al. 2)</span>
                <select
                  value={livreSaisie.autorisation}
                  onChange={(e) =>
                    setLivreSaisie({
                      ...livreSaisie,
                      autorisation: e.target.value as '' | 'oui' | 'non',
                    })
                  }
                  className="border border-border bg-transparent px-2 py-1 w-[170px]"
                >
                  <option value="">Non renseignée</option>
                  <option value="oui">Obtenue</option>
                  <option value="non">Non obtenue</option>
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiquette}>Effectif habituel</span>
                <input
                  value={livreSaisie.effectifHabituel}
                  onChange={(e) =>
                    setLivreSaisie({ ...livreSaisie, effectifHabituel: e.target.value })
                  }
                  className="border border-border bg-transparent px-2 py-1 w-[120px] text-right"
                />
              </label>
              <label className="flex items-center gap-1 pb-1">
                <input
                  type="checkbox"
                  checked={livreSaisie.domestique}
                  onChange={(e) =>
                    setLivreSaisie({ ...livreSaisie, domestique: e.target.checked })
                  }
                />
                <span className="text-[11px]">Personnel exclusivement domestique</span>
              </label>
              <button
                type="button"
                onClick={verifierLivre}
                disabled={enCours}
                className="border border-accent text-accent px-3 py-1"
              >
                Vérifier
              </button>
            </div>
            <div className="text-[11px] text-text-dim">
              L’article 213 impose un livre <strong>dans chacun des sièges d’exploitation</strong>,
              consignant à chaque paie <strong>toute somme quelconque</strong> attribuée à titre de
              rémunération. L’article 1er de l’arrêté vise « le livre de paie{' '}
              <strong>ou fichier informatisé</strong> » : un fichier informatisé est donc une forme
              du livre, et ne demande <strong>aucune autorisation</strong>. Seul{' '}
              <strong>tout autre document</strong> tombe sous l’alinéa 2 de l’article 215, où
              l’autorisation de l’Inspecteur du Travail est un <strong>acte</strong> à obtenir.
              Forme non déclarée : OmegaX retient le cas le plus exigeant.
            </div>
          </div>

          {livre && (
            <>
              <div className="border border-border px-3.5 py-2.5 mb-2.5">
                <div className={`${etiquette} mb-1`}>Verdict</div>
                <div className="text-[11px]">
                  Livre dû : <strong>{livre.livreDu ? 'oui' : 'non'}</strong> · remplacement
                  autorisé : <strong>{livre.remplacementAutorise ? 'oui' : 'non'}</strong> · livre
                  « inspiré du modèle » (art. 215 al. 3, moins de 25 travailleurs) :{' '}
                  <strong>{livre.livreInspireAdmis ? 'oui' : 'non'}</strong> · mentions couvertes :{' '}
                  <strong>
                    {livre.mentionsPorteesCount} / {livre.mentions.length}
                  </strong>{' '}
                  · conformité au modèle certifiée :{' '}
                  <strong className="text-warning">
                    {livre.conformiteAuModeleCertifiee ? 'oui' : 'non'}
                  </strong>
                </div>
                <ul className="text-[11px] mt-1.5">
                  {livre.refus.map((r, i) => (
                    <li key={i} className="py-1 border-t border-border/40">
                      <span className="text-warning">{r.motif}</span>
                      <div className="text-text-dim">{r.explication}</div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border border-border px-3.5 py-2.5 mb-2.5 overflow-x-auto">
                <div className={`${etiquette} mb-1`}>
                  Les trente-trois énonciations de l’article 1er de l’arrêté du 8 août 2008
                </div>
                <table className="w-full min-w-[520px] text-[11px]">
                  <tbody>
                    {livre.mentions.map((m) => {
                      const portee = mentionsPortees.includes(m.rang);
                      return (
                        <tr key={m.rang} className="border-t border-border/40">
                          <td className="py-1 w-[36px] text-right text-text-dim">{m.rang}</td>
                          <td className="py-1">{m.libelle}</td>
                          <td className="py-1 w-[90px] text-right">
                            <label className="flex items-center gap-1 justify-end">
                              <input
                                type="checkbox"
                                checked={portee}
                                onChange={(e) =>
                                  setMentionsPortees(
                                    e.target.checked
                                      ? [...mentionsPortees, m.rang]
                                      : mentionsPortees.filter((r) => r !== m.rang),
                                  )
                                }
                              />
                              <span className={portee ? 'text-ok' : 'text-text-dim'}>
                                {portee ? 'portée' : 'absente'}
                              </span>
                            </label>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="border border-danger/30 bg-danger-soft px-3.5 py-2.5 mb-2.5 text-[11px]">
                {livre.sanctionArticle103}
              </div>

              <div className="border border-border px-3.5 py-2.5 text-[11px]">
                <div className={`${etiquette} mb-1`}>Réserves de lecture</div>
                <ul>
                  {[...livre.reserves, livre.reserveArticle104].map((r, i) => (
                    <li key={i} className="py-1 border-t border-border/40 text-text-dim">
                      {r}
                    </li>
                  ))}
                </ul>
                <div className="py-1 border-t border-border/40 text-text-dim">
                  {livre.arreteDuModele.reference} {livre.arreteDuModele.objet} ·{' '}
                  {livre.arreteDuModele.publie} · visé par le Code du travail aux{' '}
                  {livre.arreteDuModele.viseParLeCodeDuTravail.join(', ')}.{' '}
                  {livre.arreteDuModele.pourquoi}
                </div>
                <div className="py-1 border-t border-border/40 text-text-dim">
                  Article 214 · le livre se compose de feuilles numérotées de manière continue,
                  chacune comportant au moins {livre.doublesDetachablesMinimum} doubles détachables.
                  Article 2 de l’arrêté · le premier va {livre.destinationDesDoubles.premier} ; le
                  second {livre.destinationDesDoubles.second}.
                </div>
                <div className="py-1 border-t border-border/40 text-text-dim">
                  Article 1er de l’arrêté · trois mentions sont des <strong>formules de somme</strong>{' '}
                  : la {livre.formules.brut.rang} (brut) vaut la somme des mentions{' '}
                  {livre.formules.brut.composantes.join(', ')} · les allocations familiales n’y sont
                  pas, ce qui confirme l’exclusion de l’article 7 litera h du Code du travail.
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

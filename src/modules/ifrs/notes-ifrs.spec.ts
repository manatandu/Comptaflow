import { construireEtatsIfrs, LigneLegale, RegleCorrespondance, RetraitementDeclare } from './etats-ifrs';
import { construireNotesIfrs, DeclarationsNotesIfrs, EntreesNotesIfrs, ENONCE_MESURES_PERFORMANCE, motifsRefusDeclarationsNotes, normaliserDeclarationsNotes } from './notes-ifrs';

/**
 * NOTES IFRS · le jeu d'essai est celui de la tranche 1 (`etats-ifrs.spec.ts`),
 * chiffré à la main · corporelles 1 040 (1 000 − 200 + 240 de retraitements),
 * dette financière 850 (600 + 250), résultat opérationnel 310 (300 + 10).
 */
const b = (xs: [string, number][]): LigneLegale[] => xs.map(([numero, solde]) => ({ numero, intitule: `Compte ${numero}`, solde }));
const BALANCE = b([
  ['24100000', 1000], ['28410000', -200], ['31100000', 300], ['41100000', 750], ['52100000', 500],
  ['10100000', -1000], ['11800000', -300], ['16200000', -600], ['40100000', -250],
  ['70100000', -2070], ['60100000', 1200], ['66100000', 400], ['68100000', 100], ['62200000', 70], ['67100000', 50], ['89100000', 50],
]);
const R = (prefixe: string, rubrique: string): RegleCorrespondance => ({ prefixe, rubrique });
const REGLES = [
  R('24', 'SF_IMMOBILISATIONS_CORPORELLES'), R('284', 'SF_IMMOBILISATIONS_CORPORELLES'), R('31', 'SF_STOCKS'), R('41', 'SF_CREANCES_CLIENTS'),
  R('52', 'SF_TRESORERIE'), R('101', 'SF_CAPITAL'), R('11', 'SF_RESERVES'), R('16', 'SF_PASSIFS_FINANCIERS_NC'), R('40', 'SF_FOURNISSEURS'),
  R('70', 'PL_PRODUITS'), R('60', 'PL_ACHATS_CONSOMMES'), R('66', 'PL_CHARGES_PERSONNEL'), R('68', 'PL_AMORTISSEMENTS'),
  R('62', 'PL_AUTRES_CHARGES_OPERATIONNELLES'), R('67', 'PL_CHARGES_FINANCEMENT'), R('89', 'PL_IMPOT_RESULTAT'),
];
const LOCATION: RetraitementDeclare[] = [
  { id: 'a', libelle: 'Droit d’utilisation', fondement: 'IFRS 16 § 22 et § 26', lignes: [{ rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: 300 }, { rubrique: 'SF_PASSIFS_FINANCIERS_NC', montant: -300 }] },
  {
    id: 'b',
    libelle: 'Amortissement, intérêt et loyer de l’exercice',
    fondement: 'IFRS 16 § 31 et § 36',
    lignes: [
      { rubrique: 'PL_AMORTISSEMENTS', montant: 60 }, { rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: -60 },
      { rubrique: 'PL_CHARGES_FINANCEMENT', montant: 20 }, { rubrique: 'SF_PASSIFS_FINANCIERS_NC', montant: -20 },
      { rubrique: 'PL_AUTRES_CHARGES_OPERATIONNELLES', montant: -70 }, { rubrique: 'SF_PASSIFS_FINANCIERS_NC', montant: 70 },
    ],
  },
];
const EX26 = { dateDebut: new Date('2026-01-01') };
const N = construireEtatsIfrs(EX26, BALANCE, REGLES, LOCATION, 'AUCUNE');
// N-1 · la même balance sans retraitement · résultat opérationnel 300.
const N1 = construireEtatsIfrs({ dateDebut: new Date('2025-01-01') }, BALANCE, REGLES, [], 'AUCUNE');

/** Une déclaration à laquelle rien ne manque, pour ce jeu d'essai. */
const COMPLETE: DeclarationsNotesIfrs = normaliserDeclarationsNotes({
  entite: {
    domicile: 'République démocratique du Congo',
    formeJuridique: 'Société anonyme',
    paysConstitution: 'République démocratique du Congo',
    adresseSiege: '12 avenue du Port, Kinshasa',
    natureOperations: 'Négoce de matériaux',
    sansSocieteMere: true,
    dureeVieLimitee: false,
  },
  conformiteDeclaree: true,
  continuite: { retenue: true, incertitudesSignificatives: false },
  methodes: [{ intitule: 'Contrats de location', texte: 'Le preneur comptabilise un droit d’utilisation et une dette dès la prise d’effet.' }],
  aucunJugement: true,
  aucuneEstimation: true,
  aucuneMesurePerformance: true,
  capital: {
    description: 'Les capitaux propres et la dette financière.',
    commentObjectifsAtteints: 'Par l’autofinancement.',
    soumisExigencesExternes: false,
    changements: 'Aucun changement par rapport à l’exercice précédent.',
    quantitatif: [{ libelle: 'Capitaux propres et dette financière', montantN: 2340, montantN1: 2100 }],
  },
  sansCapitalSocial: false,
  categoriesActions: [
    {
      intitule: 'Actions ordinaires',
      autorisees: 100,
      emisesLiberees: 100,
      emisesNonLiberees: 0,
      valeurNominale: 10,
      enCirculationOuverture: 100,
      enCirculationCloture: 100,
      droitsRestrictions: 'Une voix par action.',
      autoDetenues: 0,
      reserveesOptions: 'Aucune.',
    },
  ],
  reserves: { SF_RESERVES: 'Réserve légale · dotée à 10 % du résultat jusqu’au dixième du capital, non distribuable.' },
  dividendes: { proposesNonComptabilises: 0, preferentielsCumulesNonComptabilises: 0 },
});

const entrees = (x: Partial<EntreesNotesIfrs> = {}): EntreesNotesIfrs => ({
  declarations: COMPLETE,
  declarationsN1: null,
  ficheDossier: { nom: 'Société Alpha', formeJuridique: null, pays: 'RD Congo', adresse: '12 avenue du Port, Kinshasa', activite: 'Négoce' },
  n: N,
  n1: N1,
  retraitements: LOCATION,
  premiereApplication: null,
  distributionsDeclarees: false,
  applicationAnticipee: true,
  motifsJeu: [],
  ...x,
});
const note = (j: ReturnType<typeof construireNotesIfrs>, cle: string) => j.notes.find((x) => x.cle === cle)!;
const textes = (j: ReturnType<typeof construireNotesIfrs>, cle: string) => note(j, cle).blocs.map((x) => ('texte' in x ? x.texte : '')).join(' ');
const tableau = (j: ReturnType<typeof construireNotesIfrs>, cle: string, titre: RegExp) =>
  note(j, cle).blocs.find((x): x is Extract<typeof x, { type: 'tableau' }> => x.type === 'tableau' && titre.test(x.titre ?? ''))!;

describe('notes IFRS · une déclaration complète ne laisse aucun motif', () => {
  const j = construireNotesIfrs(entrees());

  it('aucun motif, et la déclaration de conformité du § 6B est imprimée en tête de la base d’établissement', () => {
    expect(j.motifsNonPubliable).toEqual([]);
    expect(note(j, 'BASE').blocs[0]).toEqual({ type: 'texte', texte: 'Les états financiers sont conformes aux normes IFRS de comptabilité.', source: 'DECLARE' });
  });

  it('l’ordre du § B112 c · entité, base, méthodes, jugements, estimations, postes, puis les autres notes', () => {
    expect(j.notes.map((x) => `${x.numero}:${x.cle}`)).toEqual([
      '1:ENTITE', '2:BASE', '3:METHODES', '4:JUGEMENTS', '5:ESTIMATIONS', '6:POSTES', '7:CAPITAL', '8:CAPITAL_SOCIAL', '9:DIVIDENDES', '10:NON_SERVI',
    ]);
  });

  it('§ 114 · un poste touché par un retraitement renvoie aux méthodes et à sa composition', () => {
    expect(j.renvois.SF_IMMOBILISATIONS_CORPORELLES).toEqual([3, 6]);
    expect(j.renvois.PL_PRODUITS).toEqual([6]);
    expect(j.renvois.SF_RESERVES).toEqual([6, 8, 9]);
    expect(j.renvois.SF_CAPITAL).toEqual([6, 8]);
  });

  it('la composition des postes · les comptes dans le sens de l’état, les retraitements, le montant du poste, N et N-1', () => {
    // Actif · 1 000 et − 200 au débit, 240 de retraitements, 1 040.
    expect(tableau(j, 'POSTES', /^Immobilisations corporelles/).lignes).toEqual([
      { libelle: '24100000 · Compte 24100000', valeurs: [1000, 1000] },
      { libelle: '28410000 · Compte 28410000', valeurs: [-200, -200] },
      { libelle: 'Retraitements IFRS', valeurs: [240, 0] },
      { libelle: 'Montant du poste', valeurs: [1040, 800], total: true },
    ]);
    // Passif · 600 au crédit se lit 600 ; les retraitements 300 + 20 − 70 = 250.
    expect(tableau(j, 'POSTES', /^Passifs financiers non courants/).lignes.at(-1)).toEqual({ libelle: 'Montant du poste', valeurs: [850, 600], total: true });
    expect(tableau(j, 'POSTES', /^Passifs financiers non courants/).lignes[0].valeurs).toEqual([600, 600]);
    // Charge · 100 au débit se lit − 100, comme au compte de résultat ; 60 de retraitement, − 160.
    expect(tableau(j, 'POSTES', /^Dotations aux amortissements/).lignes).toEqual([
      { libelle: '68100000 · Compte 68100000', valeurs: [-100, -100] },
      { libelle: 'Retraitements IFRS', valeurs: [-60, 0] },
      { libelle: 'Montant du poste', valeurs: [-160, -100], total: true },
    ]);
  });

  it('un poste nul en N mais porté en N-1 reste dans la composition, avec son comparatif', () => {
    const sansStock = construireEtatsIfrs(EX26, BALANCE.filter((l) => l.numero !== '31100000'), REGLES, LOCATION, 'AUCUNE');
    const k = construireNotesIfrs(entrees({ n: sansStock }));
    expect(tableau(k, 'POSTES', /^Stocks/).lignes).toEqual([
      { libelle: '31100000 · Compte 31100000', valeurs: [0, 300] },
      { libelle: 'Retraitements IFRS', valeurs: [0, 0] },
      { libelle: 'Montant du poste', valeurs: [0, 300], total: true },
    ]);
    expect(k.renvois.SF_STOCKS).toEqual([6]);
  });

  it('les retraitements sont présentés avec leur fondement à la note des méthodes', () => {
    const t = tableau(j, 'METHODES', /retraitements de l’exercice/);
    expect(t.lignes.map((l) => [l.libelle, l.valeurs[0]])).toEqual([
      ['Droit d’utilisation', 'IFRS 16 § 22 et § 26'],
      ['Amortissement, intérêt et loyer de l’exercice', 'IFRS 16 § 31 et § 36'],
    ]);
  });

  it('le capital · les données déclarées, et les capitaux propres IFRS pour rapprochement', () => {
    // Capitaux propres IFRS · 1 000 + 300 + 190 = 1 490 ; N-1 · 1 000 + 300 + 200 = 1 500.
    expect(tableau(j, 'CAPITAL', /§ 127 b/).lignes).toEqual([
      { libelle: 'Capitaux propres et dette financière', valeurs: [2340, 2100] },
      { libelle: 'Pour rapprochement · total des capitaux propres IFRS de l’état de la situation financière', valeurs: [1490, 1500] },
    ]);
  });

  it('les informations des autres normes sont nommées non servies (§ 113 b)', () => {
    expect(note(j, 'NON_SERVI').ref).toBe('IFRS 18 § 113 b');
  });
});

describe('notes IFRS · la déclaration de conformité (IAS 8 § 6B)', () => {
  it('déclarée sur un jeu non publiable · suspendue, jamais imprimée', () => {
    const j = construireNotesIfrs(entrees({ motifsJeu: ['Jeu incomplet · § 113 b'] }));
    expect(note(j, 'BASE').blocs[0].type).toBe('manque');
    expect(textes(j, 'BASE')).toMatch(/NON IMPRIMÉE/);
    expect(textes(j, 'BASE')).not.toMatch(/^Les états financiers sont conformes/);
    expect(j.motifsNonPubliable).toEqual([]);
  });

  it('suspendue aussi quand c’est une note qui manque, même si le reste du jeu est complet', () => {
    const j = construireNotesIfrs(entrees({ declarations: { ...COMPLETE, aucunJugement: null } }));
    expect(note(j, 'BASE').blocs[0].type).toBe('manque');
    expect(j.motifsNonPubliable).toEqual(['Notes · jugements de la direction non déclarés (IAS 8 § 27G).']);
  });

  it('non répondue, ou refusée, rend le jeu non publiable', () => {
    expect(construireNotesIfrs(entrees({ declarations: { ...COMPLETE, conformiteDeclaree: null } })).motifsNonPubliable).toEqual([
      'Notes · déclaration de conformité aux normes IFRS non répondue (IAS 8 § 6B).',
    ]);
    expect(construireNotesIfrs(entrees({ declarations: { ...COMPLETE, conformiteDeclaree: false } })).motifsNonPubliable).toEqual([
      'Notes · la conformité aux normes IFRS n’est pas déclarée par l’entité (IAS 8 § 6B).',
    ]);
  });
});

describe('notes IFRS · ce qui manque est dit, un à un', () => {
  it('l’entité · la fiche du dossier sert à défaut, la forme juridique et la société mère se déclarent', () => {
    const vide = normaliserDeclarationsNotes({});
    const j = construireNotesIfrs(entrees({ declarations: vide }));
    const e = note(j, 'ENTITE').blocs;
    expect(e).toContainEqual({ type: 'texte', texte: 'Domicile · RD Congo', source: 'FICHE_DOSSIER' });
    expect(e).toContainEqual({ type: 'texte', texte: 'Adresse du siège social · 12 avenue du Port, Kinshasa', source: 'FICHE_DOSSIER' });
    expect(j.motifsNonPubliable).toContain('Notes · forme juridique de l’entité à renseigner (IFRS 18 § 116 a).');
    expect(j.motifsNonPubliable).toContain('Notes · société mère et société mère ultime non déclarées (IFRS 18 § 116 c).');
    expect(j.motifsNonPubliable).toContain('Notes · durée de vie de l’entité non déclarée (IFRS 18 § 116 d).');
    expect(j.motifsNonPubliable).toContain('Notes · mesures de la performance définies par la direction · question non répondue (IFRS 18 § 117) · déclarez les sous-totaux que l’entité communique hors des états financiers, ou qu’il n’y en a aucun.');
  });

  it('une société mère nommée sans la mère ultime reste incomplète', () => {
    const d = { ...COMPLETE, entite: { ...COMPLETE.entite, sansSocieteMere: false, societeMere: 'Holding Beta' } };
    expect(construireNotesIfrs(entrees({ declarations: d })).motifsNonPubliable).toContain('Notes · société mère et société mère ultime non déclarées (IFRS 18 § 116 c).');
  });

  it('continuité · retenue avec incertitudes significatives, elles doivent être décrites (§ 6K)', () => {
    const d = { ...COMPLETE, continuite: { ...COMPLETE.continuite, incertitudesSignificatives: true } };
    expect(construireNotesIfrs(entrees({ declarations: d })).motifsNonPubliable).toEqual(['Notes · appréciation de la continuité d’exploitation non déclarée ou incomplète (IAS 8 § 6K).']);
    const ok = { ...COMPLETE, continuite: { ...COMPLETE.continuite, incertitudesSignificatives: true, incertitudes: 'Échéance d’un emprunt en mars.' } };
    const j = construireNotesIfrs(entrees({ declarations: ok }));
    expect(j.motifsNonPubliable).toEqual([]);
    expect(textes(j, 'BASE')).toMatch(/Incertitudes significatives · Échéance d’un emprunt en mars\./);
  });

  it('continuité retenue sans que les incertitudes soient tranchées · rien ne s’imprime (§ 6K)', () => {
    const d = { ...COMPLETE, continuite: { ...COMPLETE.continuite, incertitudesSignificatives: null } };
    const j = construireNotesIfrs(entrees({ declarations: d }));
    expect(j.motifsNonPubliable).toEqual(['Notes · appréciation de la continuité d’exploitation non déclarée ou incomplète (IAS 8 § 6K).']);
    expect(textes(j, 'BASE')).not.toMatch(/sont préparés sur la base de la continuité/);
  });

  it('continuité non retenue · la base et la raison se disent (§ 6K)', () => {
    const d = { ...COMPLETE, continuite: { retenue: false, incertitudesSignificatives: null, incertitudes: null, baseRetenue: 'Valeur liquidative', raison: null } };
    expect(construireNotesIfrs(entrees({ declarations: d })).motifsNonPubliable).toHaveLength(1);
    const ok = { ...d, continuite: { ...d.continuite, raison: 'Dissolution décidée par l’assemblée.' } };
    expect(construireNotesIfrs(entrees({ declarations: ok })).motifsNonPubliable).toEqual([]);
  });

  it('aucune méthode déclarée · § 27A', () => {
    expect(construireNotesIfrs(entrees({ declarations: { ...COMPLETE, methodes: [] } })).motifsNonPubliable).toEqual([
      'Notes · informations significatives sur les méthodes comptables non déclarées (IAS 8 § 27A).',
    ]);
  });

  it('une source d’incertitude renvoie à son poste et exige sa valeur comptable (§ 31A b)', () => {
    const d = { ...COMPLETE, aucuneEstimation: null, estimations: [{ nature: 'Dépréciation des créances', rubrique: 'SF_CREANCES_CLIENTS', valeurComptable: null, informations: null }] };
    const j = construireNotesIfrs(entrees({ declarations: d }));
    expect(j.motifsNonPubliable).toEqual(['Notes · valeur comptable de la source d’incertitude « Dépréciation des créances » non déclarée (IAS 8 § 31A b).']);
    expect(j.renvois.SF_CREANCES_CLIENTS).toEqual([5, 6]);
  });

  it('capital · soumis à des exigences externes, leur respect se déclare (§ 127 d) et leur non-respect a des conséquences (§ 127 e)', () => {
    const k = { ...COMPLETE.capital, soumisExigencesExternes: true, natureExigences: 'Ratio imposé par le prêteur.' };
    expect(construireNotesIfrs(entrees({ declarations: { ...COMPLETE, capital: k } })).motifsNonPubliable).toEqual([
      'Notes · respect des exigences externes en matière de capital non déclaré (IFRS 18 § 127 d).',
    ]);
    expect(construireNotesIfrs(entrees({ declarations: { ...COMPLETE, capital: { ...k, exigencesRespectees: false } } })).motifsNonPubliable).toEqual([
      'Notes · conséquences du non-respect des exigences externes · à déclarer (IFRS 18 § 127 e).',
    ]);
    expect(construireNotesIfrs(entrees({ declarations: { ...COMPLETE, capital: { ...k, exigencesRespectees: true } } })).motifsNonPubliable).toEqual([]);
  });

  it('capital · sans données quantitatives, le total des capitaux propres ne les remplace pas (§ 127 b)', () => {
    const j = construireNotesIfrs(entrees({ declarations: { ...COMPLETE, capital: { ...COMPLETE.capital, quantitatif: [] } } }));
    expect(j.motifsNonPubliable).toEqual(['Notes · données quantitatives sur le capital géré non déclarées (IFRS 18 § 127 b).']);
  });

  it('une catégorie d’actions incomplète nomme les points du § 130 a qui manquent', () => {
    const a = { ...COMPLETE.categoriesActions[0], autorisees: null, valeurNominale: null, autoDetenues: null };
    const j = construireNotesIfrs(entrees({ declarations: { ...COMPLETE, categoriesActions: [a] } }));
    expect(j.motifsNonPubliable).toEqual(['Notes · catégorie de capital « Actions ordinaires » incomplète (IFRS 18 § 130 a i, iii, vi).']);
    const sansNominal = { ...a, autorisees: 100, autoDetenues: 0, sansValeurNominale: true };
    expect(construireNotesIfrs(entrees({ declarations: { ...COMPLETE, categoriesActions: [sansNominal] } })).motifsNonPubliable).toEqual([]);
  });

  it('entité sans capital social · les informations équivalentes du § 131, et plus de montant par action', () => {
    const d = { ...COMPLETE, sansCapitalSocial: true, categoriesActions: [], dividendes: { ...COMPLETE.dividendes, proposesNonComptabilises: 500 } };
    expect(construireNotesIfrs(entrees({ declarations: d })).motifsNonPubliable).toEqual(['Notes · informations équivalentes du § 131 non déclarées (entité sans capital social).']);
    const ok = { ...d, informationsEquivalentes: 'Parts de l’associé unique · aucune restriction.' };
    const j = construireNotesIfrs(entrees({ declarations: ok, distributionsDeclarees: true }));
    expect(j.motifsNonPubliable).toEqual([]);
    expect(tableau(j, 'DIVIDENDES', /^/).lignes.map((l) => l.libelle)).toEqual([
      'Dividendes proposés ou déclarés, non comptabilisés en distribution (§ 132 a)',
      'Dividendes préférentiels cumulés non comptabilisés (§ 132 b)',
    ]);
  });

  it('§ 130 b · chaque réserve présente se décrit, et seulement elle', () => {
    const j = construireNotesIfrs(entrees({ declarations: { ...COMPLETE, reserves: {} } }));
    // SF_RESERVES vaut 300 · SF_AUTRES_COMPOSANTES_CP vaut zéro et n'est pas réclamée.
    expect(j.motifsNonPubliable).toEqual(['Notes · nature et objet de la réserve « Réserves » non décrits (IFRS 18 § 130 b).']);
  });

  it('dividendes · zéro est une réponse, null ne l’est pas ; proposés, ils ont leur montant par action ; distribués, le § 110', () => {
    const dv = (x: Partial<DeclarationsNotesIfrs['dividendes']>) => ({ ...COMPLETE, dividendes: { ...COMPLETE.dividendes, ...x } });
    expect(construireNotesIfrs(entrees({ declarations: dv({ proposesNonComptabilises: null }) })).motifsNonPubliable).toEqual([
      'Notes · dividendes proposés ou déclarés non comptabilisés non déclarés (IFRS 18 § 132 a).',
    ]);
    expect(construireNotesIfrs(entrees({ declarations: dv({ proposesNonComptabilises: 400 }) })).motifsNonPubliable).toEqual([
      'Notes · montant par action des dividendes proposés non déclaré (IFRS 18 § 132 a).',
    ]);
    expect(construireNotesIfrs(entrees({ declarations: dv({ preferentielsCumulesNonComptabilises: null }) })).motifsNonPubliable).toEqual([
      'Notes · dividendes préférentiels cumulés non comptabilisés non déclarés (IFRS 18 § 132 b).',
    ]);
    expect(construireNotesIfrs(entrees({ distributionsDeclarees: true })).motifsNonPubliable).toEqual([
      'Notes · montant par action des dividendes comptabilisés non déclaré (IFRS 18 § 110).',
    ]);
    expect(construireNotesIfrs(entrees({ distributionsDeclarees: true, declarations: dv({ comptabilisesParAction: 1.5 }) })).motifsNonPubliable).toEqual([]);
  });
});

describe('notes IFRS · les autres éléments du résultat global (§ 93, § 109)', () => {
  const REEVAL: RetraitementDeclare = {
    id: 'c',
    libelle: 'Réévaluation d’un terrain',
    fondement: 'IAS 16 § 39',
    lignes: [{ rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: 100 }, { rubrique: 'OCI_NR_AUTRES', montant: -100 }],
  };
  const nOci = construireEtatsIfrs(EX26, BALANCE, REGLES, [...LOCATION, REEVAL], 'AUCUNE');

  it('une note par élément présenté, avec son origine · l’impôt relatif se déclare', () => {
    const j = construireNotesIfrs(entrees({ n: nOci, retraitements: [...LOCATION, REEVAL] }));
    expect(j.motifsNonPubliable).toEqual(['Notes · impôt relatif à « Autres éléments qui ne seront pas reclassés en résultat net » non déclaré (IFRS 18 § 93).']);
    expect(tableau(j, 'OCI', /§ 93, § 109/).lignes).toEqual([{ libelle: 'Autres éléments qui ne seront pas reclassés en résultat net', valeurs: [100, null] }]);
    expect(tableau(j, 'OCI', /^Origine/).lignes).toEqual([{ libelle: 'Réévaluation d’un terrain', valeurs: ['IAS 16 § 39', 100] }]);
    // La réévaluation est un retraitement · le poste renvoie aussi à la note des méthodes.
    expect(j.renvois.OCI_NR_AUTRES).toEqual([3, 7]);
    expect(note(j, 'OCI').numero).toBe(7);
    expect(j.renvois.SF_AUTRES_COMPOSANTES_CP).toEqual([7]);
  });

  it('déclaré, l’impôt figure à côté du montant net', () => {
    const j = construireNotesIfrs(entrees({ n: nOci, retraitements: [...LOCATION, REEVAL], declarations: { ...COMPLETE, impotOci: { OCI_NR_AUTRES: -30 } } }));
    expect(j.motifsNonPubliable).toEqual([]);
    expect(tableau(j, 'OCI', /§ 93, § 109/).lignes[0].valeurs).toEqual([100, -30]);
  });
});

describe('notes IFRS · les mesures de la performance définies par la direction (§ 117 à 125)', () => {
  const mesure = (x: Record<string, unknown> = {}) => ({
    libelle: 'Résultat opérationnel hors restructuration',
    aspect: 'La performance récurrente.',
    calcul: 'Résultat opérationnel augmenté des coûts de restructuration.',
    sousTotalReference: 'RESULTAT_OPERATIONNEL',
    elements: [{ libelle: 'Coûts de restructuration', rubrique: 'PL_AUTRES_CHARGES_OPERATIONNELLES', montant: 25, effetImpot: -7.5 }],
    methodeImpot: 'Au taux légal de l’impôt applicable (B141 a).',
    ...x,
  });
  const avec = (m: Record<string, unknown>[], n1: Record<string, unknown>[] | null = null) =>
    entrees({
      declarations: normaliserDeclarationsNotes({ ...COMPLETE, aucuneMesurePerformance: null, mesuresPerformance: m }),
      declarationsN1: n1 ? normaliserDeclarationsNotes({ mesuresPerformance: n1 }) : null,
    });

  it('l’énoncé du § 122, et le rapprochement · 310 + 25 = 335 ; N-1 · 300 + 40 = 340', () => {
    const j = construireNotesIfrs(avec([mesure()], [mesure({ elements: [{ libelle: 'Coûts de restructuration', rubrique: 'PL_AUTRES_CHARGES_OPERATIONNELLES', montant: 40, effetImpot: -12 }] })]));
    expect(j.motifsNonPubliable).toEqual([]);
    expect(note(j, 'MPM').blocs[0]).toEqual({ type: 'texte', texte: ENONCE_MESURES_PERFORMANCE, source: 'TEXTE_NORME' });
    expect(tableau(j, 'MPM', /^Rapprochement/).lignes).toEqual([
      { libelle: 'Résultat opérationnel (§ 69 a, § 118 c)', valeurs: [null, 310, 300, null, null] },
      { libelle: 'Coûts de restructuration', valeurs: ['Autres charges opérationnelles', 25, 40, -7.5, 'Sans objet · comptes individuels'] },
      { libelle: 'Résultat opérationnel hors restructuration', valeurs: [null, 335, 340, null, null], total: true },
    ]);
    expect(j.renvois.PL_AUTRES_CHARGES_OPERATIONNELLES).toContain(note(j, 'MPM').numero);
    expect(j.renvois.RESULTAT_OPERATIONNEL).toEqual([note(j, 'MPM').numero]);
  });

  it('sans comparatif déclaré ni changement décrit, le comparatif manque (§ 124 c, § 125)', () => {
    expect(construireNotesIfrs(avec([mesure()])).motifsNonPubliable).toEqual([
      'Notes · comparatif de la mesure « Résultat opérationnel hors restructuration » non déclaré (IFRS 18 § 124 c, § 125).',
    ]);
    expect(construireNotesIfrs(avec([mesure({ changement: 'Mesure ajoutée · comparatif impraticable.' })])).motifsNonPubliable).toEqual([]);
  });

  it('l’incidence fiscale de chaque élément et sa méthode se déclarent (§ 123 d, e)', () => {
    const m = mesure({ elements: [{ libelle: 'Coûts de restructuration', rubrique: 'PL_AUTRES_CHARGES_OPERATIONNELLES', montant: 25 }], methodeImpot: null, changement: 'Ajout.' });
    expect(construireNotesIfrs(avec([m])).motifsNonPubliable).toEqual([
      'Notes · méthode de détermination de l’incidence fiscale de « Résultat opérationnel hors restructuration » non décrite (IFRS 18 § 123 e).',
      'Notes · incidence fiscale de l’élément « Coûts de restructuration » de « Résultat opérationnel hors restructuration » non déclarée (IFRS 18 § 123 d).',
    ]);
  });
});

describe('notes IFRS · normalisation et refus à la porte', () => {
  it('une réponse illisible vaut null, jamais une valeur supposée', () => {
    const d = normaliserDeclarationsNotes({
      entite: { domicile: '  Kinshasa  ', formeJuridique: '   ', sansSocieteMere: 'true' },
      conformiteDeclaree: 'oui',
      dividendes: { proposesNonComptabilises: '1 234,5', preferentielsCumulesNonComptabilises: 'beaucoup' },
      reserves: { SF_RESERVES: '  ', SF_AUTRES_COMPOSANTES_CP: 'Écarts de réévaluation.' },
      impotOci: { OCI_NR_AUTRES: 'x', OCI_R_AUTRES: -3 },
    });
    expect(d.entite).toMatchObject({ domicile: 'Kinshasa', formeJuridique: null, sansSocieteMere: null });
    expect(d.conformiteDeclaree).toBeNull();
    expect(d.dividendes).toMatchObject({ proposesNonComptabilises: 1234.5, preferentielsCumulesNonComptabilises: null });
    expect(d.reserves).toEqual({ SF_AUTRES_COMPOSANTES_CP: 'Écarts de réévaluation.' });
    expect(d.impotOci).toEqual({ OCI_R_AUTRES: -3 });
  });

  it('ce qui se contredit est refusé', () => {
    const refus = motifsRefusDeclarationsNotes(
      normaliserDeclarationsNotes({
        entite: { sansSocieteMere: true, societeMere: 'Holding' },
        aucunJugement: true,
        jugements: [{ intitule: 'Contrôle', texte: 'x' }],
        estimations: [{ nature: 'Litige', rubrique: 'PL_PRODUITS' }],
        mesuresPerformance: [{ libelle: 'M', aspect: 'a', calcul: 'c', sousTotalReference: 'EBITDA', elements: [{ libelle: 'e', rubrique: 'SF_STOCKS', montant: 5 }] }],
        sansCapitalSocial: true,
        categoriesActions: [{ intitule: 'A' }],
        reserves: { SF_CAPITAL: 'x' },
        impotOci: { PL_PRODUITS: 3 },
      }),
    );
    expect(refus).toEqual([
      'Société mère · l’entité est déclarée sans société mère et une société mère est nommée (IFRS 18 § 116 c).',
      'Jugements · « aucun » est déclaré et des jugements sont décrits (IAS 8 § 27G).',
      'Source d’incertitude n° 1 · le poste de l’état de la situation financière qui porte l’actif ou le passif (IAS 8 § 31A).',
      'Mesure « M » · le sous-total de référence du rapprochement, parmi ceux que le jeu présente (§ 123 c, § 118).',
      'Mesure « M », élément n° 1 · le poste du compte de résultat auquel il se rapporte (B137 a).',
      'Capital social · l’entité est déclarée sans capital social et des catégories d’actions sont décrites (§ 131).',
      'Réserves · « SF_CAPITAL » n’est pas une rubrique de réserves des capitaux propres (§ 130 b).',
      'Impôt des autres éléments du résultat global · « PL_PRODUITS » n’est pas un poste de l’état du résultat global (§ 93).',
    ]);
  });

  it('une déclaration stockée qui se contredit ne passe pas en silence au calcul', () => {
    const d = normaliserDeclarationsNotes({ ...COMPLETE, entite: { ...COMPLETE.entite, societeMere: 'Holding' } });
    expect(construireNotesIfrs(entrees({ declarations: d })).motifsNonPubliable[0]).toMatch(/^Notes · déclaration irrecevable · Société mère/);
  });
});

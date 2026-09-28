import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Aucun import de « vitest » (globales) · convention du dépôt.

/**
 * AUDIT FINAL F181, F183, F184 · UN ÉCHEC DE LECTURE SE DIT.
 *
 * Trois écrans lisaient un refus comme une réponse · « Chargement… » pour
 * toujours, « Aucune caisse sans procès-verbal », « Aucun mandat
 * enregistré ». Les deux derniers sont la réponse FAVORABLE à la question que
 * l'écran pose. D'où la même règle partout · la liste part de null, un échec
 * s'affiche, et « aucun » ne se dit que sur une liste lue.
 *
 * AUDIT FINAL F254 et F255 · la même règle, étendue à l'accueil (un
 * brouillard inconnu s'affichait en vert) et à cinq lectures qui laissaient
 * des listes vides : la saisie des journaux, le passage d'une facture au
 * journal, les libellés, les simulations budgétaires et les états
 * personnalisés.
 */
const lire = (fichier: string) => readFileSync(join(__dirname, fichier), 'utf8');

describe('tableau de bord · un refus n’est pas un chargement (F181)', () => {
  const source = lire('DashboardPage.tsx');

  it('chaque lecture a son second argument, qui pose l’erreur', () => {
    expect(source).toContain("setErreurEcritures(e instanceof Error ? e.message : 'Les dernières écritures n’ont pas pu être lues.')");
    expect(source).toContain("setErreurBalance(e instanceof Error ? e.message : 'La balance n’a pas pu être lue.')");
  });

  it('l’erreur se lit à l’écran, AVANT « Chargement… »', () => {
    expect(source).toContain('Dernières écritures illisibles · {erreurEcritures}');
    expect(source).toContain('Indicateurs indisponibles · {erreurBalance}');
    const erreur = source.indexOf('{erreurEcritures ? (');
    const chargement = source.indexOf('>Chargement…</div>');
    expect(erreur).toBeGreaterThan(-1);
    expect(chargement).toBeGreaterThan(erreur);
  });
});

describe('inventaire · une caisse illisible n’est pas une caisse comptée (F183)', () => {
  const source = lire('InventairePage.tsx');

  it('la liste part de null, et un échec la remet à null avec son motif', () => {
    expect(source).toContain('useState<CaisseNonComptee[] | null>(null)');
    const debut = source.indexOf('const chargerCaisses = (id: string) =>');
    const corps = source.slice(debut, source.indexOf('\n  };', debut));
    expect(corps).toContain('setCaisses(null);');
    expect(corps).toContain('setErreurCaisses(');
  });

  it('« Aucune caisse » ne se dit que sur une liste lue', () => {
    const erreur = source.indexOf('Liste des caisses illisible · {erreur}');
    const lecture = source.indexOf(') : caisses === null ? (');
    const vide = source.indexOf('Aucune caisse à solde non nul sans procès-verbal.');
    expect(erreur).toBeGreaterThan(-1);
    expect(lecture).toBeGreaterThan(erreur);
    expect(vide).toBeGreaterThan(lecture);
  });
});

describe('mandat · un échec n’est pas une absence de mandat (F184)', () => {
  const source = lire('MandatAuditeurPage.tsx');

  it('la liste part de null, et la relecture pose l’erreur au lieu de lever', () => {
    expect(source).toContain('useState<Mandat[] | null>(null)');
    const debut = source.indexOf('const recharger = () =>');
    const corps = source.slice(debut, source.indexOf('\n    );', debut));
    expect(corps).toContain('setErreurLecture(');
  });

  it('« Aucun mandat » ne se dit que sur une liste lue', () => {
    const erreur = source.indexOf('Liste des mandats illisible · {erreurLecture}');
    const lecture = source.indexOf(') : mandats === null ? (');
    const vide = source.indexOf('Aucun mandat enregistré.');
    expect(erreur).toBeGreaterThan(-1);
    expect(lecture).toBeGreaterThan(erreur);
    expect(vide).toBeGreaterThan(lecture);
  });

  it('le rang ne se compte jamais sur une liste non lue', () => {
    const debut = source.indexOf('async function enregistrer()');
    const corps = source.slice(debut, source.indexOf('await api.post', debut));
    expect(corps).toContain('if (mandats === null) {');
  });
});

/**
 * Une liste qui part de null, dont l'échec pose un motif, et qui ne dit
 * « aucun » qu'une fois lue · l'ordre des trois branches dans la source est
 * celui du rendu.
 */
function verifierTroisBranches(source: string, erreur: string, lecture: string, vide: string) {
  const iErreur = source.indexOf(erreur);
  const iLecture = source.indexOf(lecture);
  const iVide = source.indexOf(vide);
  expect({ erreur, trouve: iErreur > -1 }).toEqual({ erreur, trouve: true });
  expect(iLecture).toBeGreaterThan(iErreur);
  expect(iVide).toBeGreaterThan(iLecture);
}

describe('accueil · une absence de réponse n’est jamais favorable (F254)', () => {
  const source = lire('AccueilPage.tsx');

  it('un état du brouillard inconnu ne s’affiche pas en vert', () => {
    expect(source).toContain('bon={brouillard?.satisfait ?? false}');
  });

  it('« aucun jalon en retard » et « rien à venir » ne se disent que sur un planning lu', () => {
    expect(source).toContain('const jalons = planning?.jalons ?? null;');
    const debut = source.indexOf('titre="Jalons de clôture en retard"');
    const ligne = source.slice(debut, source.indexOf('/>', debut));
    expect(ligne).toMatch(/jalons === null\s*\?\s*'Non déterminé'\s*:\s*enRetard\.length === 0\s*\?\s*'Aucun jalon en retard'/);
    expect(ligne).toContain('bon={jalons !== null && enRetard.length === 0}');
    const debutProchaine = source.indexOf('titre="Prochaine échéance"');
    const prochaine = source.slice(debutProchaine, source.indexOf('/>', debutProchaine));
    expect(prochaine).toMatch(/jalons === null\s*\?\s*'Non déterminé'/);
    expect(prochaine).toContain('bon={jalons !== null}');
  });

  it('sans exercice, le chargement se referme au lieu de rester ouvert', () => {
    const debut = source.indexOf('if (!exerciceCourant) {');
    expect(debut).toBeGreaterThan(-1);
    const corps = source.slice(debut, source.indexOf('}', debut));
    // Refermé dès que le contexte a fini de lire les exercices, même sans
    // en avoir trouvé ni lu un seul.
    expect(corps).toContain('\n      setChargement(attenteExercices);\n      return;');
    expect(source).toContain('const attenteExercices = !exerciceCourant && chargementExercices;');
  });
});

describe('saisie des journaux · journaux, comptes et écritures illisibles se disent (F255)', () => {
  const source = lire('SaisiePage.tsx');

  it('les deux listes partent de null, et chaque refus pose son motif', () => {
    expect(source).toContain('useState<Journal[] | null>(null)');
    expect(source).toContain('useState<Compte[] | null>(null)');
    const debut = source.indexOf("api.get<Journal[]>('/journaux').then(");
    const lectures = source.slice(debut, source.indexOf("api.get<DeviseDuDossier[]>('/devises')", debut));
    expect(lectures).toContain('(e) => setErreurJournaux(e instanceof Error');
    expect(lectures).toContain('(e) => setErreurComptes(e instanceof Error');
  });

  it('« Aucun journal » ne se dit que sur une liste lue', () => {
    verifierTroisBranches(
      source,
      'Liste des journaux illisible · {erreurJournaux}',
      ') : journauxLus === null ? (',
      'Aucun journal · créez-les dans Structure → Codes journaux.',
    );
  });

  it('un plan de comptes illisible s’affiche au-dessus de la zone de saisie', () => {
    expect(source).toContain('Plan de comptes illisible · {erreurComptes}');
  });

  it('une lecture refusée des écritures ne se lit ni « aucune écriture » ni en totaux à zéro', () => {
    const erreur = source.indexOf('Écritures du journal illisibles · {erreurEcritures}');
    const vide = source.indexOf('Aucune écriture sur ce journal pour');
    expect(erreur).toBeGreaterThan(-1);
    expect(vide).toBeGreaterThan(erreur);
    expect(source).toContain('setTotauxJournal(null);');
    expect(source).toContain("{totauxJournal ? totauxJournal.debit.toLocaleString('fr-FR') : ''}");
  });

  it('avant la première réponse, ni « aucune écriture » ni des totaux à zéro', () => {
    // Relecture de l'audit final F255 · la liste vide de départ disait
    // « Aucune écriture » et les totaux « 0 » avant que le serveur ait répondu.
    expect(source).toContain('useState<{ debit: number; credit: number } | null>(null)');
    const debut = source.indexOf('// Chargement des écritures du journal ouvert');
    expect(debut).toBeGreaterThan(-1);
    const effet = source.slice(debut, source.indexOf('}, [ouvert, journalId,', debut));
    expect(effet).toContain('setEcrituresLues(false);');
    expect(effet).toContain('setEcrituresLues(true);');
    // Posé à la réussite, jamais au départ ni à l'échec.
    expect(effet.indexOf('setEcrituresLues(true);')).toBeGreaterThan(effet.indexOf('lireJournalDeSaisie(r)'));
    expect(effet.indexOf('setEcrituresLues(true);')).toBeLessThan(effet.indexOf('(e) => {'));
    const lecture = source.indexOf('(ecrituresLues ? (');
    expect(lecture).toBeGreaterThan(-1);
    const vide = source.indexOf('Aucune écriture sur ce journal pour', lecture);
    const attente = source.indexOf('Chargement…</div>', lecture);
    expect(vide).toBeGreaterThan(lecture);
    expect(attente).toBeGreaterThan(vide);
  });
});

describe('passage d’une facture au journal · une lecture refusée se dit (F255)', () => {
  const source = readFileSync(join(__dirname, '..', 'components', 'PasserEcritureFacture.tsx'), 'utf8');

  it('les listes partent de null, et les deux lectures posent le motif', () => {
    expect(source).toContain('useState<Journal[] | null>(null)');
    expect(source).toContain('useState<Compte[] | null>(null)');
    const debut = source.indexOf("api.get<Journal[]>('/journaux')");
    const lectures = source.slice(debut, source.indexOf('}, [ouvert, facture.sens]);', debut));
    expect(lectures).toContain('}, echec);');
    expect(lectures).toContain('      echec,\n    );');
  });

  it('le motif s’affiche, et « aucun journal » n’est dit que sur une liste lue', () => {
    expect(source).toContain('Lecture impossible · {erreurLecture}');
    expect(source).toContain('{!erreurLecture && journaux?.length === 0 && (');
  });
});

describe('libellés, simulations, états personnalisés · « aucun » sur une liste lue (F255)', () => {
  const ecrans: { fichier: string; etat: string; erreur: string; lecture: string; vide: string }[] = [
    {
      fichier: 'LibellesPage.tsx',
      etat: 'useState<Libelle[] | null>(null)',
      erreur: 'Liste des libellés illisible · {erreurLecture}',
      lecture: ') : liste === null ? (',
      vide: 'Aucun libellé.',
    },
    {
      fichier: 'SimulationsBudgetairesPage.tsx',
      etat: 'useState<SimulationBudgetaire[] | null>(null)',
      erreur: 'Liste des simulations illisible · {erreurLecture}',
      lecture: ') : simulations === null ? (',
      vide: 'Aucune simulation.',
    },
    {
      fichier: 'EtatsPersonnalisesPage.tsx',
      etat: 'useState<EtatPersonnalise[] | null>(null)',
      erreur: 'Liste des états illisible · {erreurLecture}',
      lecture: ') : etats === null ? (',
      vide: 'Aucun état.',
    },
  ];

  for (const e of ecrans) {
    it(`${e.fichier} · la liste part de null, la première lecture refusée pose son motif`, () => {
      const source = lire(e.fichier);
      expect(source).toContain(e.etat);
      const debut = source.indexOf('charger().catch((e) => {');
      expect(debut).toBeGreaterThan(-1);
      const corps = source.slice(debut, source.indexOf('});', debut));
      expect(corps).toContain('setErreurLecture(');
    });

    it(`${e.fichier} · « aucun » ne se dit que sur une liste lue`, () => {
      verifierTroisBranches(lire(e.fichier), e.erreur, e.lecture, e.vide);
    });
  }
});

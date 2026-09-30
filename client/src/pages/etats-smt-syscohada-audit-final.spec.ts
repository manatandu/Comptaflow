import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Aucun import de « vitest » (globales) · convention du dépôt. L'écran se
// vérifie sur sa SOURCE, comme ses voisins : le `.tsx` n'est ni transformé
// ni résolu par le Jest de la racine.

const lire = (chemin: string) => readFileSync(join(__dirname, '..', chemin), 'utf8');
const page = lire('pages/EtatsSmtSyscohadaPage.tsx');

/** Le corps de l'effet React qui contient `repere` · de son ouverture à sa liste de dépendances. */
function effetQuiContient(source: string, repere: string): string {
  const position = source.indexOf(repere);
  expect(position).toBeGreaterThan(-1);
  const debut = source.lastIndexOf('useEffect(() => {', position);
  const fin = source.indexOf('}, [', position);
  expect(debut).toBeGreaterThan(-1);
  return source.slice(debut, source.indexOf(']);', fin) + 3);
}

describe('états SMT SYSCOHADA · la NOTE 4 se lit à l’ouverture de son onglet (audit final F258)', () => {
  it('le journal est demandé par un effet gardé sur l’onglet « journal », qui dépend de l’onglet', () => {
    // Lu au montage, il faisait parcourir au serveur toutes les écritures de
    // trésorerie de l'exercice pour qui venait voir le bilan.
    const effet = effetQuiContient(page, "/etats-financiers-syscohada/smt/journal-tresorerie?exerciceId=");
    expect(effet).toContain("onglet !== 'journal'");
    expect(effet).toContain('}, [exerciceCourant?.id, onglet]);');
  });

  it('un refus du journal se lit sur son onglet, avant « Chargement »', () => {
    // Au-delà de son plafond, le serveur refuse la NOTE 4 en disant par où
    // passer · l'écran doit montrer ce refus, pas un chargement sans fin.
    const effet = effetQuiContient(page, "/etats-financiers-syscohada/smt/journal-tresorerie?exerciceId=");
    expect(effet).toContain('setErreurNote4(e.message)');
    const refus = page.indexOf('Journal de trésorerie indisponible · {erreurNote4}');
    const chargement = page.indexOf('Chargement du journal de trésorerie…');
    expect(refus).toBeGreaterThan(-1);
    expect(chargement).toBeGreaterThan(refus);
    // Le chargement ne s'affiche pas sur un refus · « Chargement » sous un
    // refus se lirait comme une lecture encore en cours.
    expect(page).toContain("{onglet === 'journal' && !journalNote4 && !erreurNote4 && (");
  });

  it('le journal affiché est celui de l’exercice affiché', () => {
    expect(page).toContain(
      'const journalNote4 = note4 && exerciceCourant && note4.exerciceId === exerciceCourant.id ? note4.journal : null;',
    );
    expect(page).toContain("{onglet === 'journal' && journalNote4 && (");
  });
});

describe('éligibilité SMT SYSCOHADA · la monnaie du jeu légal est nommée (audit final F215)', () => {
  it('l’écran écrit la monnaie servie, le serveur la sert toujours', () => {
    expect(page).toContain('Montants exprimés en {eligibilite.deviseDossier}.');
    const types = lire('lib/types.ts');
    const debut = types.indexOf('export interface EligibiliteSmtSyscohada {');
    expect(debut).toBeGreaterThan(-1);
    const corps = types.slice(debut, types.indexOf('\n}', debut));
    expect(corps).toContain('deviseDossier: string;');
    const service = readFileSync(
      join(__dirname, '../../../src/modules/etats-financiers-syscohada/etats-financiers-smt-syscohada.service.ts'),
      'utf8',
    );
    expect(service).toContain('deviseDossier: monnaieDuJeuLegal(tenant.devise),');
  });
});

describe('états SMT SYSCOHADA · NOTE 1, biens détenus et biens sortis (passe R6, E15)', () => {
  it('le total est celui des biens détenus, et les biens sortis passent par le même rendu, sous le total', () => {
    const total = page.indexOf('TOTAL DES BIENS DÉTENUS À LA CLÔTURE');
    const sorties = page.indexOf("Biens sortis pendant l'exercice · hors du total");
    expect(total).toBeGreaterThan(-1);
    expect(sorties).toBeGreaterThan(total);
    expect(page).toContain('{notes.note1.sortiesDeLExercice.map((l, i) => ligneNote1(l, i))}');
    expect(page).toContain('{notes.note1.ecartsImmobilisations.map((e) => (');
  });
});

describe('états SMT SYSCOHADA · les deux journaux de suivi (passe R2, C4)', () => {
  it('l’onglet des notes sert les lignes des journaux de suivi, la limite de leur source en infobulle', () => {
    expect(page).toContain('{notes.journauxDeSuivi.journaux.map((j) =>');
    expect(page).toContain('notes.journauxDeSuivi.limite,');
    expect(page).toContain("{l.datePaiement ? jour(l.datePaiement) : l.paiementPartiel ? 'En partie' : '·'}");
  });
});

describe('états SMT SYSCOHADA · les états des garanties que la forme exige sont nommés (passes O1a C7, O6 B3)', () => {
  it('l’onglet des notes rend chacun des deux états servis, avec l’article qui les exige en source de l’aide', () => {
    // Le bloc est gardé sur ce que le serveur sert · null pour une forme
    // qu'aucun des deux Actes ne vise, et rien ne s'affiche alors.
    const debut = page.indexOf('{notes.etatsDesGaranties && (');
    expect(debut).toBeGreaterThan(-1);
    const bloc = page.slice(debut, page.indexOf('\n          )}', debut));
    expect(bloc).toContain('source={notes.etatsDesGaranties.article}');
    expect(bloc).toContain('notes.etatsDesGaranties.etats.map((e) => (');
    expect(bloc).toContain('non produits par OmegaX');
  });
});

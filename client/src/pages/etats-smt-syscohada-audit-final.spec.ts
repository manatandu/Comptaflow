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

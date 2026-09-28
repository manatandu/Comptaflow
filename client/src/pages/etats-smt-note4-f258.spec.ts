import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Aucun import de « vitest » (globales) · convention du dépôt. L'écran se
// vérifie sur sa SOURCE, comme son jumeau SYSCOHADA
// (`etats-smt-syscohada-audit-final.spec.ts`) : le `.tsx` n'est ni transformé
// ni résolu par le Jest de la racine.

const lire = (chemin: string) => readFileSync(join(__dirname, '..', chemin), 'utf8');
const page = lire('pages/EtatsSmtPage.tsx');
const ROUTE_NOTE4 = '/etats-financiers/smt/journal-tresorerie?exerciceId=';

/** Le corps de l'effet React qui contient `repere` · de son ouverture à sa liste de dépendances. */
function effetQuiContient(source: string, repere: string): string {
  const position = source.indexOf(repere);
  expect(position).toBeGreaterThan(-1);
  const debut = source.lastIndexOf('useEffect(() => {', position);
  const fin = source.indexOf('}, [', position);
  expect(debut).toBeGreaterThan(-1);
  return source.slice(debut, source.indexOf(']);', fin) + 3);
}

describe('états S.M.T SYCEBNL · la NOTE 4 se lit à l’ouverture de son onglet (jumeau de F258)', () => {
  it('le journal n’est demandé qu’une fois, par un effet gardé sur l’onglet « journal », qui dépend de l’onglet', () => {
    // Lu au montage, il faisait parcourir au serveur toutes les écritures de
    // trésorerie de l'exercice pour qui venait voir le bilan.
    expect(page.split('/etats-financiers/smt/journal-tresorerie').length - 1).toBe(1);
    const effet = effetQuiContient(page, ROUTE_NOTE4);
    expect(effet).toContain("onglet !== 'journal'");
    expect(effet).toContain('}, [exerciceCourant?.id, onglet]);');
  });

  it('un refus du journal se lit sur son onglet, avant « Chargement »', () => {
    // Au-delà de son plafond, le serveur refuse la NOTE 4 en nommant le grand
    // livre · l'écran doit montrer ce refus, pas un chargement sans fin ni le
    // bandeau d'erreur général, qui s'appliquerait aux cinq onglets.
    const effet = effetQuiContient(page, ROUTE_NOTE4);
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

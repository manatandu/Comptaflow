import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ATTRIBUT_MODALE, echapPourLaFenetre, ecouterEchap } from './echap';

// Aucun import de « vitest » (globales) · convention du dépôt. Pas de DOM ici :
// le document est simulé au plus juste, et le câblage se lit dans les sources.

/**
 * AUDIT FINAL F177 · Échap sur un menu ouvert fermait le menu ET la fenêtre
 * derrière, et la pièce en cours partait avec.
 */

type Ecouteur = { type: string; fn: (e: KeyboardEvent) => void; capture: unknown };

function documentSimule(avecModale = false) {
  const ecouteurs: Ecouteur[] = [];
  const doc = {
    addEventListener: (type: string, fn: (e: KeyboardEvent) => void, capture: unknown) => ecouteurs.push({ type, fn, capture }),
    removeEventListener: (type: string, fn: (e: KeyboardEvent) => void) => {
      const i = ecouteurs.findIndex((x) => x.type === type && x.fn === fn);
      if (i >= 0) ecouteurs.splice(i, 1);
    },
    querySelector: (sel: string) => (avecModale && sel === `[${ATTRIBUT_MODALE}]` ? {} : null),
  };
  (globalThis as unknown as { document: unknown }).document = doc;
  return ecouteurs;
}

function touche(key: string) {
  const e = { key, defaultPrevented: false, preventDefault: () => (e.defaultPrevented = true) };
  return e as unknown as KeyboardEvent & { defaultPrevented: boolean };
}

afterEach(() => {
  delete (globalThis as unknown as { document?: unknown }).document;
});

describe('Échap · la couche la plus haute le prend', () => {
  it('une couche écoute en CAPTURE, avant la fenêtre', () => {
    const ecouteurs = documentSimule();
    ecouterEchap(() => true);
    expect(ecouteurs).toHaveLength(1);
    expect(ecouteurs[0].type).toBe('keydown');
    expect(ecouteurs[0].capture).toBe(true);
  });

  it('la touche n’est consommée que si la couche a agi · un menu fermé la laisse passer', () => {
    const ecouteurs = documentSimule();
    let menuOuvert = false;
    ecouterEchap(() => menuOuvert);
    const e1 = touche('Escape');
    ecouteurs[0].fn(e1);
    expect(e1.defaultPrevented).toBe(false);
    expect(echapPourLaFenetre(e1)).toBe(true);

    menuOuvert = true;
    const e2 = touche('Escape');
    ecouteurs[0].fn(e2);
    expect(e2.defaultPrevented).toBe(true);
    expect(echapPourLaFenetre(e2)).toBe(false);
  });

  it('une autre touche n’est jamais prise, et une touche déjà prise ne l’est pas deux fois', () => {
    const ecouteurs = documentSimule();
    let appels = 0;
    ecouterEchap(() => {
      appels++;
      return true;
    });
    ecouteurs[0].fn(touche('Enter'));
    const prise = touche('Escape');
    prise.preventDefault();
    ecouteurs[0].fn(prise);
    expect(appels).toBe(0);
  });

  it('sous une modale ouverte, la fenêtre ne se ferme pas, même si la modale ignore Échap', () => {
    documentSimule(true);
    expect(echapPourLaFenetre(touche('Escape'))).toBe(false);
    documentSimule(false);
    expect(echapPourLaFenetre(touche('Escape'))).toBe(true);
  });

  it('se désabonne', () => {
    const ecouteurs = documentSimule();
    const cesser = ecouterEchap(() => true);
    cesser();
    expect(ecouteurs).toHaveLength(0);
  });
});

const lire = (chemin: string) => readFileSync(join(__dirname, '..', chemin), 'utf8');

/** Le corps d'une fonction, découpé par équilibrage des accolades (CLAUDE.md § 10). */
function corps(source: string, debut: string): string {
  const i = source.indexOf(debut);
  expect(i).toBeGreaterThan(-1);
  const ouvrante = source.indexOf('{', source.indexOf('=>', i));
  let profondeur = 0;
  for (let k = ouvrante; k < source.length; k++) {
    if (source[k] === '{') profondeur++;
    if (source[k] === '}' && --profondeur === 0) return source.slice(ouvrante, k + 1);
  }
  throw new Error(`corps introuvable · ${debut}`);
}

describe('Échap · le câblage', () => {
  it('la fenêtre ne se ferme que sur une touche que personne n’a prise', () => {
    expect(lire('components/chrome/Fenetre.tsx')).toContain('if (echapPourLaFenetre(e) && !dansUnChamp) fermer(fenetre.cle);');
  });

  it('menu, bulle, calculette et modale de correction passent par ecouterEchap', () => {
    for (const f of ['components/chrome/MenuBar.tsx', 'components/chrome/Aide.tsx', 'components/Calculette.tsx', 'components/ModaleCorrection.tsx']) {
      expect(lire(f)).toContain('ecouterEchap(() => {');
    }
    // Le menu ne prend la touche qu'ouvert.
    expect(lire('components/chrome/MenuBar.tsx')).toContain('if (ouvertRef.current === null) return false;');
  });

  it('toute modale porte le marqueur', () => {
    expect(lire('components/PortailModale.tsx')).toContain('<div {...{ [ATTRIBUT_MODALE]: \'\' }} style={{ display: \'contents\' }}>');
  });

  it('la fermeture consulte la garde avant de retirer la fenêtre, et Accueil aussi', () => {
    const f = lire('lib/fenetres.tsx');
    const fermer = corps(f, 'const fermer = useCallback((cle: string)');
    expect(fermer.indexOf('confirmerPerte(')).toBeGreaterThan(-1);
    expect(fermer.indexOf('confirmerPerte(')).toBeLessThan(fermer.indexOf('setFenetres('));
    const tout = corps(f, 'const fermerTout = useCallback(()');
    expect(tout.indexOf('confirmerPerte(')).toBeGreaterThan(-1);
    expect(tout.indexOf('confirmerPerte(')).toBeLessThan(tout.indexOf('setFenetres('));
  });

  it('la saisie déclare sa pièce non enregistrée, et la fenêtre fournit sa clé', () => {
    expect(lire('pages/SaisiePage.tsx')).toContain('useGardeFermeture(\n    lignes.length > 0');
    expect(lire('components/chrome/Fenetre.tsx')).toContain('<FenetreCourante.Provider value={fenetre.cle}>');
  });
});

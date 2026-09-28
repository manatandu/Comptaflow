import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLE_RECHARGEMENT_CHUNK,
  FENETRE_RECHARGEMENT_MS,
  autoriserRechargement,
  peutRecharger,
  type StockageMarqueur,
} from './rechargement-chunk';

// Aucun import de « vitest » (globales) · convention du dépôt.

/**
 * AUDIT FINAL F246 · le garde-fou contre la boucle de rechargement était
 * effacé à chaque chargement de la page, c'est-à-dire juste après le
 * rechargement qu'il devait borner. Un morceau encore introuvable après le
 * rechargement relançait la page sans fin.
 */

/** Un stockage de session en mémoire, qui garde ce qu'on y écrit. */
function stockageMemoire(): StockageMarqueur & { valeurs: Map<string, string> } {
  const valeurs = new Map<string, string>();
  return {
    valeurs,
    getItem: (cle: string) => valeurs.get(cle) ?? null,
    setItem: (cle: string, valeur: string) => {
      valeurs.set(cle, valeur);
    },
  };
}

const T0 = Date.UTC(2026, 8, 28, 9, 0, 0);

describe('peutRecharger · un rechargement par fenêtre de temps', () => {
  it('autorise sans marqueur', () => {
    expect(peutRecharger(null, T0)).toBe(true);
  });

  it('refuse un marqueur posé dans la fenêtre', () => {
    expect(peutRecharger(String(T0 - 1_000), T0)).toBe(false);
    expect(peutRecharger(String(T0 - FENETRE_RECHARGEMENT_MS + 1), T0)).toBe(false);
  });

  it('autorise de nouveau une fois la fenêtre passée · un second déploiement recharge encore', () => {
    expect(peutRecharger(String(T0 - FENETRE_RECHARGEMENT_MS), T0)).toBe(true);
    expect(peutRecharger(String(T0 - 2 * FENETRE_RECHARGEMENT_MS), T0)).toBe(true);
  });

  it('autorise sur un marqueur illisible ou futur, qui sera aussitôt remplacé par une date juste', () => {
    expect(peutRecharger('pas une date', T0)).toBe(true);
    // Le marqueur de l'ancienne version, resté dans une session ouverte.
    expect(peutRecharger('1', T0)).toBe(true);
    expect(peutRecharger(String(T0 + 60_000), T0)).toBe(true);
  });
});

describe('autoriserRechargement · la boucle ne peut plus se former', () => {
  it('le premier échec recharge, le second dans la fenêtre ne recharge pas', () => {
    const s = stockageMemoire();
    expect(autoriserRechargement(() => s, T0)).toBe(true);
    expect(s.valeurs.get(CLE_RECHARGEMENT_CHUNK)).toBe(String(T0));
    // La page rechargée échoue encore, vingt secondes plus tard.
    expect(autoriserRechargement(() => s, T0 + 20_000)).toBe(false);
    // Le marqueur n'est pas repoussé par le refus · il date du rechargement.
    expect(s.valeurs.get(CLE_RECHARGEMENT_CHUNK)).toBe(String(T0));
  });

  it('un nouveau déploiement, passé la fenêtre, recharge de nouveau', () => {
    const s = stockageMemoire();
    expect(autoriserRechargement(() => s, T0)).toBe(true);
    expect(autoriserRechargement(() => s, T0 + FENETRE_RECHARGEMENT_MS)).toBe(true);
  });

  it('un stockage inaccessible refuse · sans marqueur, rien ne bornerait la suite', () => {
    const jette = () => {
      throw new Error('SecurityError');
    };
    expect(autoriserRechargement(jette, T0)).toBe(false);
    const ecritureRefusee: StockageMarqueur = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(autoriserRechargement(() => ecritureRefusee, T0)).toBe(false);
  });

  it('un stockage qui accepte sans garder refuse aussi', () => {
    const oublieux: StockageMarqueur = { getItem: () => null, setItem: () => undefined };
    expect(autoriserRechargement(() => oublieux, T0)).toBe(false);
  });
});

describe('main.tsx passe par la règle, et la clé ne vit qu’à un endroit', () => {
  const racine = join(__dirname, '..');

  function sources(dossier: string): string[] {
    const trouves: string[] = [];
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) trouves.push(...sources(chemin));
      else if (/\.tsx?$/.test(e.name) && !/\.spec\.tsx?$/.test(e.name)) trouves.push(chemin);
    }
    return trouves;
  }

  it('le gestionnaire de preloadError décide par autoriserRechargement, stockage de session compris', () => {
    const main = readFileSync(join(racine, 'main.tsx'), 'utf8');
    const debut = main.indexOf("window.addEventListener('vite:preloadError'");
    expect(debut).toBeGreaterThan(-1);
    const corps = main.slice(debut, main.indexOf('\n});', debut));
    expect(corps).toContain('if (!autoriserRechargement(() => window.sessionStorage, Date.now())) return;');
    expect(corps).toContain('window.location.reload()');
  });

  it('la clé du marqueur n’est écrite que dans lib/rechargement-chunk.ts · nul ne peut l’effacer ailleurs', () => {
    const porteurs = sources(racine)
      .filter((f) => readFileSync(f, 'utf8').includes(CLE_RECHARGEMENT_CHUNK))
      .map((f) => f.slice(racine.length + 1));
    expect(porteurs).toEqual(['lib/rechargement-chunk.ts']);
  });
});

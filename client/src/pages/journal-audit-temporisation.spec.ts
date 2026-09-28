import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F257 · LE FILTRE D'AUTEUR DU JOURNAL D'AUDIT NE LANCE PLUS UNE
 * REQUÊTE PAR FRAPPE, ET SEULE LA DERNIÈRE RÉPONSE DEMANDÉE S'AFFICHE.
 *
 * Le champ était lié à l'état même que l'appel lisait · taper une adresse de
 * vingt caractères envoyait vingt requêtes, et rien ne garantissait que la
 * dernière arrivée fût la dernière partie. Le client n'a pas de DOM de test ·
 * ces vérifications lisent le composant et s'ancrent sur sa STRUCTURE (le
 * champ, le corps de chaque effet, son tableau de dépendances), jamais sur une
 * distance entre deux mots.
 */

const page = readFileSync(join(__dirname, 'JournalAuditPage.tsx'), 'utf8');

/** Le texte de l'appel qui s'ouvre à `debut`, jusqu'à sa parenthèse fermante. */
function appelEquilibre(source: string, debut: number): string {
  const ouverture = source.indexOf('(', debut);
  let profondeur = 0;
  for (let i = ouverture; i < source.length; i++) {
    if (source[i] === '(') profondeur++;
    else if (source[i] === ')') {
      profondeur--;
      if (profondeur === 0) return source.slice(debut, i + 1);
    }
  }
  throw new Error('appel non refermé');
}

/** Chaque `useEffect(...)` du composant, entier. */
function effets(source: string): string[] {
  const trouves: string[] = [];
  let i = source.indexOf('useEffect(');
  while (i !== -1) {
    trouves.push(appelEquilibre(source, i));
    i = source.indexOf('useEffect(', i + 1);
  }
  return trouves;
}

/** Le tableau de dépendances d'un effet, lu comme une liste de noms. */
function dependances(effet: string): string[] {
  const m = effet.match(/,\s*\[([^\]]*)\]\s*\)$/);
  if (!m) throw new Error('effet sans tableau de dépendances');
  return m[1]
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
}

const effetUnique = (predicat: (e: string) => boolean) => {
  const retenus = effets(page).filter(predicat);
  expect(retenus).toHaveLength(1);
  return retenus[0];
};

describe('Journal d’audit · la saisie de l’auteur est temporisée (audit final F257)', () => {
  it('le recensement trouve encore les effets du composant · un garde-fou qui ne trouve rien ne vérifie rien', () => {
    expect(effets(page).length).toBeGreaterThanOrEqual(3);
  });

  it('le délai est déclaré, en millisecondes, au niveau du module', () => {
    expect(page).toMatch(/^const DELAI_SAISIE_MS = 250;$/m);
  });

  it('le champ AUTEUR est lié à la SAISIE, pas au filtre envoyé', () => {
    // L'élément est découpé de sa balise ouvrante à sa fermeture · une
    // expression `[^>]*` s'arrêterait au `=>` du gestionnaire.
    const repere = page.indexOf('placeholder="courriel"');
    expect(repere).toBeGreaterThan(-1);
    const champ = page.slice(page.lastIndexOf('<input', repere), page.indexOf('/>', repere) + 2);
    expect(champ.startsWith('<input')).toBe(true);
    expect(champ).toContain('value={saisieAuteur}');
    expect(champ).toContain('onChange={(e) => setSaisieAuteur(e.target.value)}');
  });

  it('la saisie devient le filtre après le délai, et la minuterie tombe à chaque frappe', () => {
    const temporisation = effetUnique((e) => e.includes('setTimeout('));
    expect(temporisation).toContain('DELAI_SAISIE_MS');
    expect(temporisation).toContain('setActeurEmail(saisieAuteur)');
    // La page revient à la première AVEC le filtre, pas à la frappe · sinon
    // chaque frappe relancerait l'appel par le changement de page.
    expect(temporisation).toContain('setPage(1)');
    expect(temporisation).toMatch(/return \(\) => clearTimeout\(minuterie\);/);
    expect(dependances(temporisation)).toEqual(['saisieAuteur', 'acteurEmail']);
  });

  it('l’appel au journal ne dépend que du filtre APPLIQUÉ', () => {
    const appel = effetUnique((e) => e.includes('/journal-audit?${parametres}'));
    expect(dependances(appel)).toEqual(['page', 'entite', 'acteurEmail']);
    expect(appel).toContain("parametres.set('acteurEmail', acteurEmail)");
  });

  it('une réponse périmée n’écrase pas la plus récente · l’appel se marque à chaque changement de filtre', () => {
    const appel = effetUnique((e) => e.includes('/journal-audit?${parametres}'));
    expect(appel).toContain('let annule = false;');
    expect(appel).toContain('(r) => !annule && setDonnees(r)');
    expect(appel).toMatch(/\(e\) => !annule && setErreur\(/);
    expect(appel).toMatch(/return \(\) => \{\s*annule = true;\s*\};/);
  });
});

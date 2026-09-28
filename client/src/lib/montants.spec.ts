import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { montant, montantOuVide } from './montants';

/** Les espaces du groupement français (U+202F) ramenés à une espace simple. */
const lisible = (s: string) => s.replace(/[  ]/g, ' ');

describe('le formateur unique des montants (audit final F256)', () => {
  it('écrit toujours deux décimales, ni plus ni moins', () => {
    expect(lisible(montant(1234.5))).toBe('1 234,50');
    expect(lisible(montant(1234.567))).toBe('1 234,57');
    expect(lisible(montant(12))).toBe('12,00');
  });

  it('lit un Decimal sérialisé en chaîne', () => {
    expect(lisible(montant('98765.4'))).toBe('98 765,40');
  });

  it('ramène un zéro négatif à zéro, après l’arrondi au centime', () => {
    expect(montant(-0.001)).toBe('0,00');
    expect(montant(-0)).toBe('0,00');
  });

  it('arrondit le demi-centime loin de zéro des deux côtés, comme Intl', () => {
    // Un débit et un crédit du même montant doivent s'écrire pareil au signe
    // près · `Math.round` seul rendait -1 234,12 face à 1 234,13.
    expect(lisible(montant(1234.125))).toBe('1 234,13');
    expect(lisible(montant(-1234.125))).toBe('-1 234,13');
    expect(montant(-0.125)).toBe('-' + montant(0.125));
  });

  it('une valeur absente ou illisible n’est jamais un nombre', () => {
    expect(montant(null)).toBe('·');
    expect(montant(undefined)).toBe('·');
    expect(montant('')).toBe('·');
    expect(montant('abc')).toBe('·');
    expect(montant(Number.NaN)).toBe('·');
    expect(montant(null, '')).toBe('');
  });

  it('montantOuVide tait le zéro et l’absence, et seulement eux', () => {
    expect(montantOuVide(0)).toBe('');
    expect(montantOuVide(0.004)).toBe('');
    expect(montantOuVide(null)).toBe('');
    expect(lisible(montantOuVide(-5))).toBe('-5,00');
  });
});

/**
 * LA RÈGLE NE VIT QU'ICI. Un écran qui formate un montant à deux décimales
 * passe par ce fichier · une copie locale est la forme exacte du défaut que
 * F256 a relevé, et elle divergerait au premier correctif. Le test lit la
 * source de tout le client et refuse une option de centimes écrite ailleurs.
 */
const RACINE = join(__dirname, '..');
function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(ts|tsx)$/.test(nom) && !/\.spec\./.test(nom) ? [chemin] : [];
  });
}

describe('aucune copie du formatage des montants hors de lib/montants.ts', () => {
  const sources = fichiers(RACINE);

  it('le recensement lit encore le client', () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it('aucun fichier ne pose lui-même les centimes', () => {
    const fautifs = sources
      .filter((f) => !f.endsWith(join('lib', 'montants.ts')))
      .filter((f) => /minimumFractionDigits\s*:\s*2/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(RACINE, f));
    expect(fautifs).toEqual([]);
  });
});

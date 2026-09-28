import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { libelleExercice } from './libelle-exercice';

/**
 * LE LIBELLÉ D'UN EXERCICE, CÔTÉ SERVEUR · jumeau de l'audit final F250.
 *
 * Le contrat est celui du client (`client/src/lib/libelle-exercice.ts`) · un
 * exercice civil se lit sur son année, les autres « début-fin », en UTC. Le
 * second bloc gèle la STRUCTURE · aucun fichier du serveur ne compose plus
 * dans un gabarit l'année d'une date d'exercice, ailleurs que dans le porteur.
 */
const jour = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('libelleExercice (serveur)', () => {
  it('un exercice civil se lit sur son année', () => {
    expect(libelleExercice({ dateDebut: jour('2026-01-01'), dateFin: jour('2026-12-31') })).toBe('2026');
  });

  it('un premier exercice long se lit « début-fin »', () => {
    expect(libelleExercice({ dateDebut: jour('2026-07-01'), dateFin: jour('2027-12-31') })).toBe('2026-2027');
  });

  it('l’année se lit en UTC · minuit UTC du 1er janvier reste dans son année', () => {
    expect(libelleExercice({ dateDebut: jour('2027-01-01'), dateFin: jour('2027-12-31') })).toBe('2027');
  });
});

describe('aucun libellé d’exercice composé à la main côté serveur', () => {
  const RACINE = join(__dirname, '..');
  const sources: string[] = [];
  const parcourir = (dossier: string) => {
    for (const nom of readdirSync(dossier)) {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (nom.endsWith('.ts') && !nom.endsWith('.spec.ts')) sources.push(chemin);
    }
  };
  parcourir(RACINE);
  // Une année de date d'exercice interpolée dans un gabarit · le libellé
  // d'une écriture ou le suffixe d'un nom de fichier.
  const COMPOSITION = /\$\{[^}]*\b(dateDebut|dateFin)\.get(UTC)?FullYear\(\)[^}]*\}/;

  it('le recensement lit bien le serveur, et le motif reconnaît la forme visée', () => {
    expect(sources.some((f) => f.endsWith(join('exercice', 'exercice.service.ts')))).toBe(true);
    expect(COMPOSITION.test('`exercice ${exercice.dateDebut.getUTCFullYear()}`')).toBe(true);
    expect(COMPOSITION.test('`-${e.dateFin.getFullYear()}`')).toBe(true);
    // Un calcul d'année n'est pas un libellé.
    expect(COMPOSITION.test('Date.UTC(dateDebut.getUTCFullYear(), 11, 31)')).toBe(false);
  });

  it('seul le porteur écrit l’exercice', () => {
    const fautifs = sources
      .filter((f) => COMPOSITION.test(readFileSync(f, 'utf8')))
      .map((f) => relative(RACINE, f));
    expect(fautifs).toEqual([]);
  });

  it('les libellés des écritures de clôture, de report et d’affectation l’appellent', () => {
    const exercice = readFileSync(join(RACINE, 'modules', 'exercice', 'exercice.service.ts'), 'utf8');
    expect(exercice).toContain('`Clôture des charges/produits · exercice ${libelleExercice(exercice)}`');
    expect(exercice).toContain('`Report à-nouveau · ouverture exercice ${libelleExercice(exerciceSuivant)}`');
    expect(exercice).toContain('`Report à-nouveau PROVISOIRE · ouverture exercice ${libelleExercice(exerciceSuivant)}`');
    const affectation = readFileSync(join(RACINE, 'modules', 'affectation', 'affectation.service.ts'), 'utf8');
    expect(affectation).toContain("`Affectation du résultat de l'exercice ${libelleExercice(exercice)} · ${dto.organe}`");
  });
});

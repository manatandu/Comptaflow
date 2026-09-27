import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, normalize, relative } from 'path';

/**
 * TOUT FICHIER DE `src/` SERT LE SERVEUR, OU DIT POURQUOI IL NE LE SERT PAS
 * (audit du serveur, C1).
 *
 * Un fichier que seuls des specs importent se lit comme du code en service ·
 * un contrôle qu'aucun écran n'appelle, une table qu'aucun calcul ne consulte.
 * On le croit actif, il ne l'est pas. Chaque exception est donc NOMMÉE avec
 * son motif, et son en-tête le dit aussi ; un fichier qui tomberait hors de
 * tout appel fait échouer ce test tant que quelqu'un n'a pas décidé de son
 * sort.
 */
const SANS_APPELANT_DE_PRODUCTION: Record<string, string> = {
  'modules/comptabilite/detenteurs-ecriture.ts': 'table de décision confrontée par son spec à detenteursDe et au schéma',
  'modules/controles/rapprochement-guide-plan.ts': 'rapprochement des guides, en attente du contrôle des schémas d’écriture',
  'modules/controles/schemas-guide-sycebnl.ts': 'table engendrée du guide SYCEBNL, en attente du même contrôle',
  'modules/controles/schemas-guide-syscohada.ts': 'table engendrée du guide SYSCOHADA, en attente du même contrôle',
  'modules/notes-annexes/notes-sycebnl.commun.ts': 'outil partagé des deux balayages de notes SYCEBNL',
};

const RACINE = join(__dirname, '..');

function fichiersTs(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiersTs(chemin);
    return nom.endsWith('.ts') ? [chemin] : [];
  });
}

describe('fichiers de src/ sans appelant de production', () => {
  const tous = fichiersTs(RACINE);
  const connus = new Set(tous.map((f) => normalize(f)));
  const importes = (f: string): string[] => {
    const src = readFileSync(f, 'utf8');
    const cibles: string[] = [];
    for (const m of src.matchAll(/(?:from|import|require\()\s*['"](\.[^'"]+)['"]/g)) {
      const base = normalize(join(dirname(f), m[1]));
      for (const c of [`${base}.ts`, join(base, 'index.ts')]) if (connus.has(c)) cibles.push(c);
    }
    return cibles;
  };
  const production = tous.filter((f) => !f.endsWith('.spec.ts'));
  const atteints = new Set(production.flatMap(importes));
  const orphelins = production
    .filter((f) => !atteints.has(normalize(f)) && !f.endsWith('main.ts'))
    .map((f) => relative(RACINE, f).split('\\').join('/'))
    .sort();

  it('le relevé trouve encore des fichiers importés · un graphe vide ne vérifierait rien', () => {
    expect(atteints.size).toBeGreaterThan(400);
  });

  it('seuls les fichiers nommés, avec leur motif, échappent à tout appel de production', () => {
    expect(orphelins).toEqual(Object.keys(SANS_APPELANT_DE_PRODUCTION).sort());
  });

  it('chaque exception le dit dans son propre en-tête', () => {
    for (const f of Object.keys(SANS_APPELANT_DE_PRODUCTION)) {
      expect({ f, dit: readFileSync(join(RACINE, f), 'utf8').includes('fichiers-sans-appelant.spec.ts') }).toEqual({ f, dit: true });
    }
  });
});

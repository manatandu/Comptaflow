import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Aucun import de « vitest » (globales) · convention du dépôt.

/**
 * AUDIT FINAL F179 · une lecture échouée des sauvegardes s'affichait
 * « Aucune copie dans ce dossier », en rouge · un constat faux, sur la seule
 * question qui compte le jour où le disque lâche.
 */
const source = readFileSync(join(__dirname, 'SauvegardesSurSite.tsx'), 'utf8');

describe('sauvegardes sur site · « lu » et « vide » ne se confondent pas', () => {
  it('la liste part de null, jamais d’un tableau vide', () => {
    expect(source).toContain('useState<Copie[] | null>(null)');
  });

  it('seul le refus d’un autre dossier masque le cadre · toute autre erreur s’affiche', () => {
    expect(source).toContain('if (err instanceof ApiError && err.status === 403) return;');
    expect(source).toContain("setErreurLecture(err instanceof ApiError ? err.message : 'La liste des sauvegardes n’a pas pu être lue.');");
    expect(source).toContain('Liste des sauvegardes illisible · {erreurLecture}');
  });

  it('« Aucune copie » ne se dit que sur une liste LUE', () => {
    const lecture = source.indexOf('copies === null ?');
    const vide = source.indexOf('copies.length === 0 ?');
    expect(lecture).toBeGreaterThan(-1);
    expect(vide).toBeGreaterThan(lecture);
    expect(source).toContain('copies !== null && (!externe?.dossier');
  });

  it('une sauvegarde faite n’est pas dite échouée parce que la relecture a échoué', () => {
    const debut = source.indexOf('const sauvegarder = async');
    const corps = source.slice(debut, source.indexOf('const definirExterne', debut));
    expect(corps.indexOf('await relire();')).toBeGreaterThan(corps.indexOf('} catch (e) {'));
  });
});

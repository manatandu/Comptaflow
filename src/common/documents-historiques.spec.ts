import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * LES DOCUMENTS HISTORIQUES SE DISENT TELS (audit final F267).
 *
 * L'audit final a trouvé des documents qui décrivaient un état révolu du
 * logiciel sans rien en dire · un rapport d'écart dont presque tous les
 * manques étaient construits, un audit d'août qui donnait pour « écartés » la
 * paie, l'IFRS et le dérogatoire, livrés depuis. Lus sans bandeau, ils font
 * redemander ce qui existe, ou renoncer à ce qui est dû. Ceux qui ne sont plus
 * que de l'histoire vivent dans `docs/historique/`.
 *
 * Ce spec gèle trois PRÉSENCES, pour que le dossier ne redevienne pas le
 * défaut qu'il corrige : chaque document y porte en tête son bandeau daté,
 * chacun a sa ligne dans la table du README, et aucun double ne reste à son
 * ancienne adresse dans `docs/`, où il continuerait de se lire comme vivant.
 */
const RACINE = join(__dirname, '..', '..');
const DOSSIER = join(RACINE, 'docs', 'historique');

/** Le bandeau doit ouvrir le document · plus bas, un lecteur a déjà lu comme vivant ce qui précède. */
const LIGNES_DE_TETE = 6;
const BANDEAU_DATE = /HISTORIQUE · bandeau posé le \d{4}-\d{2}-\d{2}/;

describe('docs/historique · chaque document se dit historique (audit final F267)', () => {
  const documents = readdirSync(DOSSIER).filter((f) => f.endsWith('.md') && f !== 'README.md');
  const readme = readFileSync(join(DOSSIER, 'README.md'), 'utf8');

  it('le recensement trouve encore les deux documents rangés le 2026-09-28', () => {
    expect(documents).toEqual(expect.arrayContaining(['ecarts-sage-omegax.md', 'audit-complet-2026-08.md']));
  });

  it('chaque document porte en tête son bandeau daté', () => {
    for (const f of documents) {
      const tete = readFileSync(join(DOSSIER, f), 'utf8').split('\n').slice(0, LIGNES_DE_TETE).join('\n');
      expect({ f, bandeau: BANDEAU_DATE.test(tete) }).toEqual({ f, bandeau: true });
    }
  });

  it('chaque document a sa ligne dans la table du README', () => {
    for (const f of documents) {
      expect({ f, dansLaTable: readme.includes(`| \`${f}\` |`) }).toEqual({ f, dansLaTable: true });
    }
  });

  it('aucun double ne reste à l’ancienne adresse dans docs/', () => {
    for (const f of documents) {
      expect({ f, double: existsSync(join(RACINE, 'docs', f)) }).toEqual({ f, double: false });
    }
  });
});

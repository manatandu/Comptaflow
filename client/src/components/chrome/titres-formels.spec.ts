import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Aucun import de « vitest » · convention du dépôt, le spec tourne aussi sous
// le jest de la racine.

/**
 * TITRES FORMELS (décision de Manasse, 2026-09-28 · « j'ai vu une rubrique où
 * le titre c'est "article 212" »). Un titre de cadre, un onglet, un en-tête de
 * colonne, une légende, un libellé de champ ou de case porte un INTITULÉ
 * MÉTIER, comme dans Sage, SAP ou Cegid. La référence juridique ne disparaît
 * pas : elle passe dans la bulle d'aide (`<Aide source=… />`) ou dans
 * l'infobulle (`title=`), que ce spec ne lit jamais.
 *
 * Ce qui est relu, dans chaque fichier du périmètre, commentaires retirés :
 *   · les attributs `titre=`, `label=`, `libelle=`, `intitule=` d'un élément
 *     (dont le `titre` d'une bulle d'aide et le `label` d'un `<optgroup>`) ;
 *   · les propriétés `titre:`, `label:`, `libelle:`, `intitule:` d'un objet
 *     (registres d'onglets, listes de champs) ;
 *   · le TEXTE VISIBLE des `<th>`, `<h1>` à `<h4>`, `<legend>`, `<label>`,
 *     `<option>`, `<button>`, `<summary>` et `<caption>` · les attributs et
 *     les expressions `{…}` en sont retirés, sauf un littéral seul, qui est
 *     du texte écrit autrement.
 *
 * Ce qui n'est PAS relu, et c'est voulu : `title=`, la bulle `Aide` (texte et
 * source), les messages, refus et avertissements, et les mentions gelées par
 * d'autres specs. On gèle une propriété des TITRES, jamais une absence de mot
 * dans un fichier.
 *
 * PÉRIMÈTRE · les pages dont le nom commence par A à L et tous les
 * composants. Les pages M à Z sont traitées par une passe parallèle · le jour
 * où elles le sont, élargir `DANS_LE_PERIMETRE`.
 */

const RACINE = join(__dirname, '../..');

/** Une référence juridique : « art. 60 », « Article 212 », « § 116 c », « § A7 ». */
const REFERENCE = [/\b(art\.|article)\s*\d/i, /§\s*[A-Z]?\d/];

const DANS_LE_PERIMETRE = (chemin: string) =>
  /^pages\/[A-L][^/]*\.tsx$/.test(chemin) || /^components\/.*\.tsx$/.test(chemin);

function fichiers(dossier: string): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(join(RACINE, dossier))) {
    const chemin = `${dossier}/${nom}`;
    if (statSync(join(RACINE, chemin)).isDirectory()) sortie.push(...fichiers(chemin));
    else sortie.push(chemin);
  }
  return sortie;
}

/** Retire les commentaires `/* … *\/` et `// …`, en gardant les numéros de ligne. */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, a: string) => a + ' '.repeat(m.length - a.length));
}

/**
 * Le texte VISIBLE d'un contenu JSX : un littéral seul entre accolades est
 * gardé, toute autre expression est retirée par équilibrage (une flèche `=>`
 * dans un attribut ne ferme donc aucune balise), puis les balises et leurs
 * attributs littéraux (`title="…"`, `placeholder="…"`).
 */
function texteVisible(contenu: string): string {
  const litteraux = contenu.replace(
    /\{\s*(?:"([^"{}]*)"|'([^'{}]*)'|`([^`{}$]*)`)\s*\}/g,
    (_m, a?: string, b?: string, c?: string) => ` ${a ?? b ?? c ?? ''} `,
  );
  let sortie = '';
  let profondeur = 0;
  for (const c of litteraux) {
    if (c === '{') profondeur++;
    else if (c === '}') profondeur = Math.max(0, profondeur - 1);
    else if (profondeur === 0) sortie += c;
  }
  return sortie.replace(/<[^<>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Le contenu de chaque élément `balise`, fin de la balise ouvrante trouvée par équilibrage. */
function contenus(source: string, balise: string): Array<{ index: number; contenu: string }> {
  const sortie: Array<{ index: number; contenu: string }> = [];
  const ouvrante = new RegExp(`<${balise}\\b`, 'g');
  for (const m of source.matchAll(ouvrante)) {
    let i = m.index! + m[0].length;
    let profondeur = 0;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === '{') profondeur++;
      else if (c === '}') profondeur--;
      else if (c === '>' && profondeur === 0) break;
    }
    if (source[i - 1] === '/') continue; // balise auto-fermante, sans contenu
    const fin = source.indexOf(`</${balise}>`, i);
    if (fin < 0) continue;
    // Un <Aide> imbriqué n'est pas du titre · sa source est justement l'endroit voulu.
    sortie.push({ index: m.index!, contenu: source.slice(i + 1, fin).replace(/<Aide\b[\s\S]*?\/>/g, ' ') });
  }
  return sortie;
}

type Titre = { fichier: string; ligne: number; genre: string; texte: string };

function titres(fichier: string, brut: string): Titre[] {
  const source = sansCommentaires(brut);
  const ligne = (index: number) => source.slice(0, index).split('\n').length;
  const sortie: Titre[] = [];

  // Un littéral, quelle que soit sa forme : "…", '…', {"…"}, {'…'}, {`…`}.
  const attribut =
    /\b(titre|label|libelle|intitule)=(?:"([^"\n]*)"|'([^'\n]*)'|\{\s*(?:"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`)\s*\})/g;
  for (const m of source.matchAll(attribut)) {
    sortie.push({ fichier, ligne: ligne(m.index!), genre: `${m[1]}=`, texte: m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? '' });
  }
  const propriete = /\b(titre|label|libelle|intitule):\s*(?:"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`)/g;
  for (const m of source.matchAll(propriete)) {
    sortie.push({ fichier, ligne: ligne(m.index!), genre: `${m[1]}:`, texte: m[2] ?? m[3] ?? m[4] ?? '' });
  }
  for (const balise of ['th', 'h1', 'h2', 'h3', 'h4', 'legend', 'label', 'option', 'button', 'summary', 'caption']) {
    for (const { index, contenu } of contenus(source, balise)) {
      sortie.push({ fichier, ligne: ligne(index), genre: `<${balise}>`, texte: texteVisible(contenu) });
    }
  }
  return sortie;
}

const estReference = (texte: string) => REFERENCE.some((r) => r.test(texte));

const PERIMETRE = [...fichiers('pages'), ...fichiers('components')].filter(DANS_LE_PERIMETRE);

describe('titres formels · aucun titre n’est une référence juridique', () => {
  const tous = PERIMETRE.flatMap((f) => titres(f, readFileSync(join(RACINE, f), 'utf8')));

  it('le recensement trouve des fichiers et des titres · sinon rien n’est vérifié', () => {
    expect(PERIMETRE.length).toBeGreaterThan(60);
    expect(PERIMETRE).toContain('pages/FacturationPage.tsx');
    expect(PERIMETRE).toContain('components/NotesIfrs.tsx');
    expect(tous.length).toBeGreaterThan(2000);
  });

  it('le détecteur reconnaît les formes vues à l’écran, et laisse la bulle et l’infobulle', () => {
    const essai = [
      '<Aide titre="Article 212" texte="Code du travail, art. 212" source="art. 212" />',
      '<h3 title="IFRS 18, § 116">Informations sur l’entité</h3>',
      '<legend>Indicateurs (§ A7)</legend>',
      '<label className="x" title="art. 37, 1°">Représentation en RDC <input onChange={(e) => f(e)} /></label>',
      "const onglets = [{ cle: 'a', label: 'Mention de l’art. 60' }];",
      '<th>{"Seuil de l\'art. 95"}</th>',
    ].join('\n');
    const references = titres('essai.tsx', essai).filter((t) => estReference(t.texte));
    expect(references.map((t) => t.genre)).toEqual(['titre=', 'label:', '<th>', '<legend>']);
  });

  it('aucun titre du périmètre ne porte d’article ni de paragraphe', () => {
    const fautifs = tous
      .filter((t) => estReference(t.texte))
      .map((t) => `${t.fichier}:${t.ligne} ${t.genre} « ${t.texte} »`);
    expect(fautifs).toEqual([]);
  });
});

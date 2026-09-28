import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * TITRES FORMELS · aucun titre visible n'est une référence juridique.
 *
 * Demandé par Manasse le 2026-09-28 : « Mets des titres formels façon logiciel
 * professionnel. J'ai vu une rubrique où le titre c'est "article 212" ». Un
 * titre dit CE QUE la rubrique contient (« Contrôle des contrats »,
 * « Mentions manquantes »), comme chez Sage, SAP ou Cegid ; l'article qui la
 * fonde ne disparaît pas, il va dans la bulle d'aide (`Aide`) ou dans
 * l'infobulle (`title`) du même élément.
 *
 * CE QUI EST RELU · les pages de M à Z et `lib/` (l'autre moitié, pages A à L
 * et composants, a son propre garde). Dans chaque fichier : les titres de
 * bloc (`titre=`, `titre:`), les étiquettes de groupe d'options, les en-têtes
 * de tableau, les titres h1 à h4 et les légendes, le texte des boutons (les
 * onglets en sont), le texte des étiquettes de champ et de case à cocher
 * (`<label>`), les intitulés posés en classe `etiquette`, et les libellés des
 * tables d'onglets.
 *
 * CE QUI N'EST PAS RELU, et c'est voulu · `title=` (c'est l'infobulle, là où
 * l'article doit aller), les propriétés `texte` et `source` de la bulle
 * d'aide, les messages, refus et avertissements, et les commentaires. Le texte
 * d'un élément est pris SANS ses balises imbriquées ni leurs attributs · une
 * étiquette qui porte `title="Code du travail, art. 44"` sur son `<span>` est
 * précisément la forme voulue.
 */

const RACINE = join(__dirname, '..');
const REFERENCE = [/\b(art\.|article)\s*\d/i, /§\s*\d/];

function fichiers(): string[] {
  const pages = readdirSync(join(RACINE, 'pages'))
    .filter((f) => /^[M-Z].*\.tsx$/.test(f))
    .map((f) => join('pages', f));
  const lib = readdirSync(join(RACINE, 'lib'))
    .filter((f) => /\.tsx?$/.test(f) && !/\.spec\.tsx?$/.test(f))
    .map((f) => join('lib', f));
  return [...pages, ...lib];
}

/** Retire les commentaires · un commentaire cite ses articles, c'est son rôle. */
function sansCommentaires(s: string): string {
  return s.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Fin de la balise ouvrante qui commence en `i` (sur le `<`). Les accolades
 * sont comptées · un attribut `{() => x > 0}` ne ferme pas la balise.
 */
function finDeBalise(s: string, i: number): number {
  let profondeur = 0;
  let chaine: string | null = null;
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (chaine) {
      if (c === chaine && s[j - 1] !== '\\') chaine = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      if (profondeur === 0 && c !== '"') continue;
      chaine = c;
      continue;
    }
    if (c === '{') profondeur++;
    else if (c === '}') profondeur--;
    else if (c === '>' && profondeur === 0) return j;
  }
  return -1;
}

/** Le texte d'un fragment JSX, sans aucune balise ni aucun attribut. */
function texteSansBalises(s: string): string {
  let sortie = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '<' && /[A-Za-z/]/.test(s[i + 1] ?? '')) {
      const fin = finDeBalise(s, i);
      if (fin < 0) break;
      i = fin + 1;
      sortie += ' ';
      continue;
    }
    sortie += s[i];
    i++;
  }
  return sortie;
}

interface Element {
  ouvrante: string;
  contenu: string;
}

/** Les éléments `<tag …>…</tag>` du fichier, balises de même nom imbriquées comprises. */
function elements(source: string, tag: string): Element[] {
  const trouves: Element[] = [];
  const debut = new RegExp(`<${tag}(?=[\\s>/])`, 'g');
  let m: RegExpExecArray | null;
  while ((m = debut.exec(source))) {
    const fin = finDeBalise(source, m.index);
    if (fin < 0) continue;
    const ouvrante = source.slice(m.index, fin + 1);
    if (ouvrante.endsWith('/>')) continue;
    const ouvre = new RegExp(`<${tag}(?=[\\s>/])`, 'g');
    const ferme = `</${tag}>`;
    let profondeur = 1;
    let j = fin + 1;
    while (profondeur > 0 && j < source.length) {
      const k = source.indexOf(ferme, j);
      if (k < 0) break;
      ouvre.lastIndex = j;
      const o = ouvre.exec(source);
      if (o && o.index < k) {
        const fo = finDeBalise(source, o.index);
        if (!source.slice(o.index, fo + 1).endsWith('/>')) profondeur++;
        j = fo + 1;
        continue;
      }
      profondeur--;
      if (profondeur === 0) {
        trouves.push({ ouvrante, contenu: source.slice(fin + 1, k) });
      }
      j = k + ferme.length;
    }
  }
  return trouves;
}

/**
 * Retire d'un contenu les NOTES secondaires (`text-text-dim`) · sous une case
 * à cocher, la ligne grisée qui dit « aucun texte n'impose cette séparation
 * (AUDCIF art. 69) » est une explication, pas le libellé de la case.
 */
function sansNotes(contenu: string): string {
  let s = contenu;
  for (const tag of ['span', 'div', 'p', 'small']) {
    for (const e of elements(s, tag)) {
      if (/\btext-text-dim\b/.test(e.ouvrante)) s = s.replace(e.ouvrante + e.contenu, '');
    }
  }
  return s;
}

function estReference(texte: string): boolean {
  return REFERENCE.some((r) => r.test(texte));
}

/** Toutes les fautes d'un fichier, lisibles dans le message d'échec. */
function fautes(source: string): string[] {
  const s = sansCommentaires(source);
  const trouvees: string[] = [];
  const noter = (quoi: string, texte: string) => {
    if (estReference(texte)) trouvees.push(`${quoi} : ${texte.replace(/\s+/g, ' ').trim().slice(0, 120)}`);
  };

  // Titres de bloc, de cadre et de bulle · `titre="…"`, `titre: '…'`.
  for (const m of s.matchAll(/\btitre\s*[=:]\s*\{?\s*(["'`])((?:(?!\1)[\s\S])*)\1/g)) noter('titre', m[2]);

  // Étiquettes de groupe d'options.
  for (const m of s.matchAll(/<optgroup\b[^>]*?\blabel\s*=\s*(["'])((?:(?!\1).)*)\1/g)) noter('optgroup', m[2]);

  // En-têtes de tableau, titres, légendes, boutons (les onglets en sont) et
  // étiquettes de champ.
  for (const tag of ['th', 'h1', 'h2', 'h3', 'h4', 'legend', 'button', 'label', 'SectionTitre']) {
    for (const e of elements(s, tag)) noter(tag, texteSansBalises(sansNotes(e.contenu)));
  }

  // Intitulés posés en classe `etiquette` (div ou span).
  for (const tag of ['div', 'span']) {
    for (const e of elements(s, tag)) {
      if (/\betiquette\b/.test(e.ouvrante)) noter(`${tag}.etiquette`, texteSansBalises(e.contenu));
    }
  }

  // Tables d'onglets · `const ONGLETS… = [ … ]`.
  for (const m of s.matchAll(/const\s+\w*ONGLET\w*[^=]*=\s*\[([\s\S]*?)\];/gi)) {
    for (const l of m[1].matchAll(/(["'`])((?:(?!\1).)*)\1/g)) noter('onglet', l[2]);
  }
  return trouvees;
}

describe('Titres formels · pages M à Z et lib/', () => {
  const liste = fichiers();

  it('le recensement trouve encore les fichiers et les titres qu’il surveille', () => {
    // Un garde-fou qui ne trouve plus rien passe sans rien vérifier.
    expect(liste.length).toBeGreaterThan(40);
    expect(liste).toContain(join('pages', 'PersonnelPage.tsx'));
    const personnel = readFileSync(join(RACINE, 'pages', 'PersonnelPage.tsx'), 'utf8');
    expect(elements(personnel, 'button').length).toBeGreaterThan(10);
    expect(elements(personnel, 'label').length).toBeGreaterThan(10);
    expect(elements(personnel, 'th').length).toBeGreaterThan(3);
  });

  it('aucun titre, onglet, en-tête, bouton ou libellé de champ n’est une référence juridique', () => {
    const tout: string[] = [];
    for (const f of liste) {
      for (const faute of fautes(readFileSync(join(RACINE, f), 'utf8'))) tout.push(`${f} · ${faute}`);
    }
    expect(tout).toEqual([]);
  });

  it('le détecteur tombe bien sur un onglet « Article 212 » et sur une étiquette « (art. 70) »', () => {
    // Vu tomber sur la page réelle avant correction · ce jeu d'essai le garde.
    const onglet = `<button type="button" onClick={() => setOnglet(o)}>{o === 'x' ? 'Article 212' : 'Registre'}</button>`;
    const etiquette = `<div className={etiquette}>Assiette fiscale nette (art. 70)</div>`;
    const infobulle = `<label><input type="checkbox" /><span title="Code du travail, art. 44">Constaté par écrit</span></label>`;
    expect(fautes(onglet)).toHaveLength(1);
    expect(fautes(etiquette)).toHaveLength(1);
    expect(fautes(infobulle)).toEqual([]);
  });
});

/**
 * La référence NE DISPARAÎT PAS · elle passe dans l'infobulle ou la bulle
 * d'aide du même élément. On gèle sa PRÉSENCE à côté du nouveau titre.
 */
describe('Titres formels · la référence reste à portée', () => {
  const personnel = readFileSync(join(RACINE, 'pages', 'PersonnelPage.tsx'), 'utf8');
  const parametres = readFileSync(join(RACINE, 'pages', 'ParametresDossierPage.tsx'), 'utf8');
  const perimetre = readFileSync(join(RACINE, 'pages', 'PerimetreConsolidationPage.tsx'), 'utf8');
  const provisions = readFileSync(join(RACINE, 'pages', 'ProvisionsPage.tsx'), 'utf8');
  const donateurs = readFileSync(join(RACINE, 'pages', 'RegistreDonateursPage.tsx'), 'utf8');

  it('l’onglet « Contrôle des contrats » porte l’article 212 en infobulle', () => {
    expect(personnel).toContain("? 'Contrôle des contrats'");
    expect(personnel).toContain("title={o === 'confrontation' ? 'Code du travail, art. 212 et art. 40 à 45' : undefined}");
  });

  it('« Mentions manquantes » garde l’article 212 à portée', () => {
    expect(personnel).toContain('title="Code du travail, art. 212">\n                    Mentions manquantes (');
  });

  it('les colonnes des conditions fiscales gardent leurs articles', () => {
    expect(personnel).toContain('title="Loi n° 23/053, art. 69, 8, b et c">Condition d’immunité</th>');
    expect(personnel).toContain('title="Loi n° 23/053, art. 68, 1">Remboursement de frais</th>');
  });

  it('les deux groupes de natures gardent l’art. 7, point 8', () => {
    expect(personnel).toContain('<optgroup label="Éléments de rémunération" title="Code du travail, art. 7, point 8">');
    expect(personnel).toContain('<optgroup label="Éléments hors rémunération" title="Code du travail, art. 7, point 8">');
  });

  it('« Mentions légales » garde l’AUSCGIE art. 17', () => {
    expect(parametres).toContain('<Ligne label="Mentions légales" large>');
    expect(parametres).toContain('title="AUSCGIE art. 17 · mentions des actes et documents destinés aux tiers"');
  });

  it('le seuil et les faits de consolidation gardent leurs articles', () => {
    expect(perimetre).toContain('titre="Seuil de consolidation"');
    expect(perimetre).toContain('source="AUDCIF art. 95"');
    expect(perimetre).toContain("source: 'AUDCIF art. 78'");
    expect(perimetre).toContain('title={f.source}');
    expect(perimetre).toContain('title={source}');
  });

  it('les provisions interdites gardent le ch. 18 § 4.11', () => {
    expect(provisions).toContain('<optgroup label="Provisions interdites" title="AUDCIF Titre VIII ch. 18 § 4.11">');
  });

  it('le contenu obligatoire du registre des donateurs garde l’art. 17', () => {
    expect(donateurs).toContain("'Contenu obligatoire des lignes'");
    expect(donateurs).toContain("'SYCEBNL, art. 17, points 1 à 4'");
    expect(donateurs).toContain('title={source}>{titre}</span>');
  });
});

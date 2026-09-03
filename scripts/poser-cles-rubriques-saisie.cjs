#!/usr/bin/env node
/**
 * Pose une `cle` sur chaque rubrique de note `saisie: true` qui n'en a pas.
 *
 * POURQUOI · une rubrique en saisie est renseignée hors comptabilité
 * (engagements, effectifs, informations sociales). Pour STOCKER ce que le
 * dossier y saisit, il faut une ancre stable · exactement le problème déjà
 * tranché pour le rattachement (`RubriqueNote.cle`) : « s'appuyer sur le
 * libellé serait fragile · une correction de transcription, une apostrophe
 * typée autrement, et tous les rattachements du dossier tomberaient en
 * silence ». Une saisie perdue est pire : ce n'est pas un rattachement à
 * refaire, c'est un texte d'annexe rédigé par le cabinet qui disparaît.
 *
 * La clé est DÉRIVÉE une fois du libellé, puis écrite dans la source et gelée.
 * Le script n'écrase jamais une clé existante : le relancer après l'ajout
 * d'une rubrique ne sert que la nouvelle, et les clés déjà posées ne bougent
 * pas, quoi qu'il advienne du libellé.
 *
 * Usage : node scripts/poser-cles-rubriques-saisie.cjs
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const FICHIERS = [
  'src/modules/notes-annexes/correspondance-notes-associations.ts',
  'src/modules/notes-annexes/correspondance-notes-projets.ts',
  'src/modules/etats-financiers-syscohada/correspondance-notes-syscohada-1.ts',
  'src/modules/etats-financiers-syscohada/correspondance-notes-syscohada-2.ts',
  'src/modules/etats-financiers-syscohada/correspondance-notes-syscohada-3.ts',
];

/** Valeur textuelle d'un libellé, y compris écrit en concaténation de littéraux. */
function texte(noeud) {
  if (ts.isStringLiteral(noeud) || ts.isNoSubstitutionTemplateLiteral(noeud)) return noeud.text;
  if (ts.isBinaryExpression(noeud) && noeud.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const g = texte(noeud.left);
    const d = texte(noeud.right);
    return g === null || d === null ? null : g + d;
  }
  return null;
}

function slug(libelle) {
  return libelle
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

function propriete(objet, nom) {
  return objet.properties.find(
    (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === nom,
  );
}

let posees = 0;
for (const relatif of FICHIERS) {
  // Clés déjà prises, PAR CODE DE NOTE et pour tout le fichier · une note à
  // plusieurs sous-tableaux (16C, 1, 27B…) est écrite en plusieurs littéraux
  // sous un même code, et l'ancre de stockage est le couple (code, clé).
  const prisesParCode = new Map();
  const chemin = path.join(process.cwd(), relatif);
  const source = fs.readFileSync(chemin, 'utf8');
  const ast = ts.createSourceFile(relatif, source, ts.ScriptTarget.ES2021, true);

  // Les insertions sont collectées puis appliquées de la FIN vers le DÉBUT :
  // insérer d'avant en arrière décalerait toutes les positions suivantes.
  const insertions = [];

  const visiter = (noeud) => {
    if (ts.isObjectLiteralExpression(noeud)) {
      const code = propriete(noeud, 'code');
      const rubriques = propriete(noeud, 'rubriques');
      if (code && rubriques && ts.isArrayLiteralExpression(rubriques.initializer)) {
        const codeNote = texte(code.initializer);
        // Unicité DANS LE CODE, pas dans le sous-tableau : l'ancre de
        // stockage est le couple (code, clé), et la note 1 aligne trois
        // tableaux sous ce même code unique.
        if (!prisesParCode.has(codeNote)) prisesParCode.set(codeNote, new Set());
        const prises = prisesParCode.get(codeNote);
        for (const r of rubriques.initializer.elements) {
          if (!ts.isObjectLiteralExpression(r)) continue;
          const cle = propriete(r, 'cle');
          if (cle) prises.add(texte(cle.initializer));
        }
        const poser = (valeur, position, enAppel = false) => {
          if (valeur === null) {
            throw new Error(`Libellé non littéral, note ${codeNote} · clé impossible à dériver`);
          }
          const base = slug(valeur) || 'rubrique';
          let candidate = base;
          for (let n = 2; prises.has(candidate); n += 1) candidate = `${base}-${n}`;
          prises.add(candidate);
          insertions.push({ position, texte: enAppel ? `'${candidate}', ` : `cle: '${candidate}', ` });
          posees += 1;
        };
        for (const r of rubriques.initializer.elements) {
          // Rubrique écrite en toutes lettres.
          if (ts.isObjectLiteralExpression(r)) {
            const saisie = propriete(r, 'saisie');
            if (!saisie || saisie.initializer.kind !== ts.SyntaxKind.TrueKeyword) continue;
            if (propriete(r, 'cle')) continue;
            const libelle = propriete(r, 'libelle');
            poser(libelle ? texte(libelle.initializer) : null, libelle.getStart(ast));
            continue;
          }
          // Rubrique construite par l'abréviation `saisie(cle, libelle, renvoi?)`
          // de la troisième tranche SYSCOHADA. La clé y est le PREMIER
          // argument · un appel qui n'en a qu'un est un appel d'avant la
          // pose des clés, à compléter.
          if (ts.isCallExpression(r) && ts.isIdentifier(r.expression) && r.expression.text === 'saisie') {
            const premier = r.arguments[0];
            if (!premier) continue;
            const dejaCle = ts.isStringLiteral(premier) && !premier.text.includes(' ') && r.arguments.length >= 2;
            if (dejaCle) {
              prises.add(premier.text);
              continue;
            }
            poser(texte(premier), premier.getStart(ast), true);
          }
        }
      }
    }
    ts.forEachChild(noeud, visiter);
  };
  visiter(ast);

  if (insertions.length === 0) continue;
  insertions.sort((a, b) => b.position - a.position);
  let sortie = source;
  for (const i of insertions) sortie = sortie.slice(0, i.position) + i.texte + sortie.slice(i.position);
  fs.writeFileSync(chemin, sortie);
  console.log(`${relatif} · ${insertions.length} clés posées`);
}
console.log(`TOTAL ${posees} clés posées`);

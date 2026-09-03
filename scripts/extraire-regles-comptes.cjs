/**
 * EXTRACTEUR DES RÈGLES PAR COMPTE · SYCEBNL, Partie 2 chapitre 3.
 *
 * Le référentiel décrit chaque compte par un bloc régulier, et deux de ses
 * rubriques ne servent aujourd'hui à RIEN dans le logiciel alors qu'elles
 * sont, pour un cabinet, la matière même de la révision :
 *
 *  · « Exclusions » · ce que le compte ne doit PAS enregistrer, et le compte
 *    qu'il faut utiliser à la place. C'est une règle dure, écrite par le
 *    texte, qui prévient l'erreur d'imputation AU MOMENT de la saisie ;
 *  · « Éléments de contrôle » · les pièces à partir desquelles le solde du
 *    compte se justifie. C'est le dossier de révision, compte par compte.
 *
 * Comme pour les guides d'application, la table est ENGENDRÉE puis
 * committée : le serveur n'a pas accès aux compétences, et une règle
 * comptable ne doit pas dépendre d'un fichier absent à l'exécution.
 *
 * La classe 9 est écartée · elle n'a pas de fiche par compte (contributions
 * volontaires en nature et comptabilité analytique de libre usage).
 *
 * Usage : node scripts/extraire-regles-comptes.cjs <racine des compétences>
 */
const fs = require('node:fs');
const path = require('node:path');

const racine = process.argv[2];
if (!racine || !fs.existsSync(racine)) {
  console.error('Racine des compétences introuvable · passer le chemin en argument.');
  process.exit(1);
}

const dossier = path.join(racine, 'sycebnl/references');
const fichiers = fs
  .readdirSync(dossier)
  .filter((n) => /^partie2-ch3-classe[1-8]-/.test(n))
  .sort();

/** Le texte d'une rubrique en gras, jusqu'à la ligne vide. */
function rubrique(corps, nom) {
  const debut = corps.indexOf(`**${nom}.**`);
  if (debut < 0) return null;
  const fin = corps.indexOf('\n\n', debut);
  const texte = (fin < 0 ? corps.slice(debut) : corps.slice(debut, fin))
    .replace(`**${nom}.**`, '')
    .replace(/\s+/g, ' ')
    .trim();
  return texte.length ? texte : null;
}

/**
 * LES COMPTES À UTILISER À LA PLACE, et EUX SEULS.
 *
 * Prendre tous les nombres du bloc était faux : la phrase nomme d'abord les
 * comptes EXCLUS. Le bloc du compte 10 cite ainsi « Les comptes 101 et 102 …
 * ne doivent pas servir à … (utiliser 104) » · une extraction naïve
 * proposait 101 et 102 comme remplacement de 101 et 102.
 *
 * Le texte a deux formes, et deux seulement :
 *
 *  · « … (utiliser 104 - Dotation consomptible) ; … » · le remplacement tient
 *    dans la parenthèse ;
 *  · « Il convient … d'utiliser les comptes ci-après : 481 - … ; 25 - … » ·
 *    la liste court jusqu'à la fin du bloc.
 */
function comptesAUtiliser(texte) {
  const trouves = [];
  const re = /utiliser/g;
  let m;
  while ((m = re.exec(texte)) !== null) {
    const suite = texte.slice(m.index);
    // « ci-après » annonce une liste qui va jusqu'au bout ; sinon le
    // remplacement se referme avec la parenthèse.
    const fin = /ci-apr[eè]s/i.test(suite.slice(0, 40)) ? suite.length : (suite.indexOf(')') + 1 || suite.length);
    for (const n of suite.slice(0, fin).matchAll(/\b(\d{2,5})\b/g)) trouves.push(n[1]);
  }
  return [...new Set(trouves)].sort();
}

const regles = [];
for (const nom of fichiers) {
  const texte = fs.readFileSync(path.join(dossier, nom), 'utf8');
  const lignes = texte.split('\n');
  let courant = null;
  const fiches = [];
  for (const l of lignes) {
    // Trois fiches portent un numéro à TROIS chiffres (603, 659, 759) ·
    // le texte descend d'un cran là où la division le demande. Un motif à
    // deux chiffres les perdait en silence.
    const m = l.match(/^## COMPTE (\d{1,3}) : (.+)$/);
    if (m) {
      if (courant) fiches.push(courant);
      courant = { numero: m[1], intitule: m[2].trim(), corps: [] };
    } else if (courant) {
      courant.corps.push(l);
    }
  }
  if (courant) fiches.push(courant);

  for (const f of fiches) {
    const corps = f.corps.join('\n');
    const exclusions = rubrique(corps, 'Exclusions');
    regles.push({
      numero: f.numero,
      intitule: f.intitule,
      exclusions,
      comptesAUtiliser: exclusions ? comptesAUtiliser(exclusions) : [],
      elementsDeControle: rubrique(corps, 'Éléments de contrôle'),
    });
  }
}

// CLASSE 9 · ses règles existent mais ne sont pas présentées en fiche par
// compte : le texte traite les comptes 90 et 91 ENSEMBLE, sous une
// sous-section. Les écarter aurait perdu une règle vraie (« les comptes 90 et
// 91 ne doivent pas servir à enregistrer les produits de la vente des dons en
// nature… »). Les deux comptes reçoivent donc le même texte, ce que le texte
// dit lui-même.
const classe9 = fs.readFileSync(path.join(dossier, 'partie2-ch3-classe9-comptes90-99.md'), 'utf8');
const sous1 = classe9.slice(
  classe9.indexOf('## Sous-section 1'),
  classe9.indexOf('## Sous-section 2') < 0 ? undefined : classe9.indexOf('## Sous-section 2'),
);
const exclusions9 = rubrique(sous1, 'Exclusions');
const controle9 = rubrique(sous1, 'Éléments de contrôle');
for (const [numero, intitule] of [
  ['90', 'Contributions volontaires en nature · comptes de contrepartie (débit)'],
  ['91', 'Contributions volontaires en nature · comptes de contrepartie (crédit)'],
]) {
  regles.push({
    numero,
    intitule,
    exclusions: exclusions9,
    comptesAUtiliser: exclusions9 ? comptesAUtiliser(exclusions9) : [],
    elementsDeControle: controle9,
  });
}

regles.sort((a, b) => a.numero.localeCompare(b.numero, 'fr', { numeric: true }));

// ---------------------------------------------------------------------------
// SYSCOHADA · AUDCIF, Titre VII. MÊMES RUBRIQUES, AUTRE ÉCRITURE.
//
// Le SYCEBNL écrit « … (utiliser 104) » ; l'AUDCIF écrit « … → **481**
// (Fournisseurs d'investissements) ». La flèche remplace le verbe, et une
// exclusion peut s'étendre sur une liste à puces sous un deux-points. Deux
// lecteurs distincts, donc · appliquer la règle de l'un à l'autre ne
// rendrait rien, ou pire, rendrait n'importe quoi.
// ---------------------------------------------------------------------------
const dossierAudcif = path.join(racine, 'audcif-acte-uniforme/references');

/** Une rubrique de l'AUDCIF · jusqu'à la rubrique suivante ou au filet. */
function rubriqueAudcif(corps, nom) {
  const debut = corps.indexOf(`**${nom}.**`);
  if (debut < 0) return null;
  const suite = corps.slice(debut + `**${nom}.**`.length);
  const lignes = [];
  for (const l of suite.split('\n')) {
    if (/^\*\*[A-ZÉÀ]/.test(l.trim()) || l.trim() === '---' || /^#{2,4} /.test(l)) break;
    lignes.push(l);
  }
  // Le gras est un ajout de transcription, pas du texte officiel · on rend
  // la phrase telle qu'elle se lit.
  const texte = lignes.join(' ').replace(/\*\*/g, '').replace(/^\s*[-•]\s*/gm, '').replace(/\s+/g, ' ').trim();
  return texte.length ? texte : null;
}

/**
 * Les comptes de remplacement de l'AUDCIF · ceux qui SUIVENT une flèche.
 *
 * « → 481 (Fournisseurs d'investissements) ». Prendre tous les nombres du
 * bloc rendrait ici aussi les comptes exclus eux-mêmes.
 */
function comptesApresFleche(texte) {
  const trouves = [];
  for (const m of texte.matchAll(/→\s*([^→]{0,60})/g)) {
    for (const n of m[1].matchAll(/\b(\d{2,5})\b/g)) trouves.push(n[1]);
  }
  return [...new Set(trouves)].sort();
}

const reglesSyscohada = [];
for (const nom of fs.readdirSync(dossierAudcif).filter((n) => /^titre-7-comptes-classe-/.test(n)).sort()) {
  const texte = fs.readFileSync(path.join(dossierAudcif, nom), 'utf8');
  const lignes = texte.split('\n');
  let courant = null;
  const fiches = [];
  for (const l of lignes) {
    // QUATRE chiffres · les comptes d'engagements hors bilan de la classe 9
    // (9011 Crédits confirmés obtenus, 9021 Avals obtenus…) descendent à ce
    // niveau. Un motif à trois chiffres perdait les 31 fiches de la classe.
    const m = l.match(/^#{2,4} COMPTE (\d{1,4})\s*:\s*(.*)$/);
    if (m) {
      if (courant) fiches.push(courant);
      courant = { numero: m[1], intitule: m[2].trim(), corps: [] };
    } else if (courant) {
      courant.corps.push(l);
    }
  }
  if (courant) fiches.push(courant);

  for (const f of fiches) {
    const corps = f.corps.join('\n');
    const exclusions = rubriqueAudcif(corps, 'Exclusions');
    reglesSyscohada.push({
      numero: f.numero,
      intitule: f.intitule,
      exclusions,
      comptesAUtiliser: exclusions ? comptesApresFleche(exclusions) : [],
      elementsDeControle: rubriqueAudcif(corps, 'Éléments de contrôle'),
    });
  }
}
reglesSyscohada.sort((a, b) => a.numero.localeCompare(b.numero, 'fr', { numeric: true }));

function ecrire(chemin, constante, referentiel, source, table) {
  const lignes = table
    .map(
      (r) =>
        `  {\n    numero: ${JSON.stringify(r.numero)},\n    intitule: ${JSON.stringify(r.intitule)},\n` +
        `    exclusions: ${JSON.stringify(r.exclusions)},\n    comptesAUtiliser: ${JSON.stringify(r.comptesAUtiliser)},\n` +
        `    elementsDeControle: ${JSON.stringify(r.elementsDeControle)},\n  },`,
    )
    .join('\n');
  fs.writeFileSync(
    chemin,
    `/**
 * RÈGLES PAR COMPTE · ${referentiel}, ${source}.
 *
 * FICHIER ENGENDRÉ · ne pas retoucher à la main. Il se régénère par
 * \`node scripts/extraire-regles-comptes.cjs <racine des compétences>\`.
 *
 * Deux rubriques du texte officiel, transcrites VERBATIM · le texte n'est
 * jamais reformulé : un avertissement qui paraphrase la règle cesse d'être
 * opposable, et c'est sa citation qui vaut.
 */
import type { RegleCompte } from './regles-comptes-sycebnl';

export const ${constante}: RegleCompte[] = [
${lignes}
];
`,
    'utf8',
  );
}

const corps = regles
  .map(
    (r) =>
      `  {\n    numero: ${JSON.stringify(r.numero)},\n    intitule: ${JSON.stringify(r.intitule)},\n` +
      `    exclusions: ${JSON.stringify(r.exclusions)},\n    comptesAUtiliser: ${JSON.stringify(r.comptesAUtiliser)},\n` +
      `    elementsDeControle: ${JSON.stringify(r.elementsDeControle)},\n  },`,
  )
  .join('\n');

fs.writeFileSync(
  'src/modules/controles/regles-comptes-sycebnl.ts',
  `/**
 * RÈGLES PAR COMPTE · SYCEBNL, Partie 2 chapitre 3.
 *
 * FICHIER ENGENDRÉ · ne pas retoucher à la main. Il se régénère par
 * \`node scripts/extraire-regles-comptes.cjs <racine des compétences>\`.
 *
 * Deux rubriques du texte officiel, transcrites VERBATIM :
 *
 *  · \`exclusions\` · ce que le compte ne doit pas enregistrer, et le compte à
 *    utiliser à la place. Sert d'avertissement d'imputation à la saisie.
 *  · \`elementsDeControle\` · les pièces qui justifient le solde. C'est le
 *    dossier de révision, compte par compte.
 *
 * Le texte n'est jamais reformulé · un avertissement qui paraphrase la règle
 * cesse d'être opposable, et c'est justement sa citation qui vaut.
 */
export interface RegleCompte {
  /** Numéro de tête, à deux chiffres · les fiches du texte sont à ce niveau. */
  numero: string;
  intitule: string;
  /** Texte intégral du bloc « Exclusions », ou null quand le texte n'en donne pas. */
  exclusions: string | null;
  /**
   * Les comptes que le texte désigne À UTILISER À LA PLACE · seuls ceux qui
   * suivent « utiliser », jamais les comptes exclus eux-mêmes.
   */
  comptesAUtiliser: string[];
  /** Texte intégral du bloc « Éléments de contrôle ». */
  elementsDeControle: string | null;
}

export const REGLES_COMPTES_SYCEBNL: RegleCompte[] = [
${corps}
];
`,
  'utf8',
);

ecrire(
  'src/modules/controles/regles-comptes-syscohada.ts',
  'REGLES_COMPTES_SYSCOHADA',
  'SYSCOHADA',
  'AUDCIF Titre VII',
  reglesSyscohada,
);

const bilan = (t) =>
  `${t.length} comptes · ${t.filter((r) => r.exclusions).length} exclusions · ` +
  `${t.filter((r) => r.elementsDeControle).length} éléments de contrôle`;
console.log('SYCEBNL   ·', bilan(regles));
console.log('SYSCOHADA ·', bilan(reglesSyscohada));

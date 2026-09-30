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
/** Les segments qui suivent « utiliser » · la liste des remplacements. */
function segmentsAUtiliser(texte) {
  const segments = [];
  const re = /utiliser/g;
  let m;
  while ((m = re.exec(texte)) !== null) {
    const suite = texte.slice(m.index);
    // « ci-après » annonce une liste qui va jusqu'au bout ; sinon le
    // remplacement se referme avec la parenthèse.
    const fin = /ci-apr[eè]s/i.test(suite.slice(0, 40)) ? suite.length : (suite.indexOf(')') + 1 || suite.length);
    segments.push(suite.slice(0, fin));
  }
  return segments;
}

/**
 * LES NUMÉROS D'UN SEGMENT, PLAGES COMPRISES (passe R5-B4). « utiliser
 * comptes 21 à 26 » se lisait « 21, 26 » · un terrain légué (22) ou un
 * matériel (24) disparaissait de la liste. Une plage « N à M » de même
 * longueur se restitue en entier, comme le texte la désigne.
 */
function numerosDuSegment(segment) {
  const trouves = [];
  const plages = [];
  for (const p of segment.matchAll(/\b(\d{2,5})\s+à\s+(\d{2,5})\b/g)) {
    const [a, b] = [Number(p[1]), Number(p[2])];
    if (p[1].length === p[2].length && b > a && b - a <= 9) {
      for (let n = a; n <= b; n++) trouves.push(String(n));
      plages.push(p[0]);
    }
  }
  let reste = segment;
  for (const p of plages) reste = reste.replace(p, ' ');
  for (const n of reste.matchAll(/\b(\d{2,5})\b/g)) trouves.push(n[1]);
  return trouves;
}

function comptesAUtiliser(texte) {
  return [...new Set(segmentsAUtiliser(texte).flatMap(numerosDuSegment))].sort();
}

/**
 * LE PLAN SYCEBNL SEMÉ, numéro → intitulé · lu dans `compte-seed.ts`, que ce
 * script ne modifie pas. Un compte de détail à huit chiffres est rangé aussi
 * sous son numéro sans les zéros de complément (84800000 → 848).
 */
function planSycebnlSeme() {
  const source = fs.readFileSync('src/modules/comptes/compte-seed.ts', 'utf8');
  const plan = new Map();
  for (const m of source.matchAll(/total\('(\d+)',\s*(['"])(.*?)\2/g)) plan.set(m[1], m[3]);
  for (const m of source.matchAll(/\['(\d{8})',\s*(['"])(.*?)\2\]/g)) {
    plan.set(m[1], m[3]);
    const court = m[1].replace(/0+$/, '');
    if (!plan.has(court)) plan.set(court, m[3]);
  }
  return plan;
}
const PLAN_SYCEBNL = planSycebnlSeme();
/** Intitulé normalisé → numéros du plan qui le portent. */
const INTITULES_SYCEBNL = new Map();
for (const [numero, intitule] of PLAN_SYCEBNL) {
  if (numero.length === 8) continue;
  const cle = intitule
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!INTITULES_SYCEBNL.has(cle)) INTITULES_SYCEBNL.set(cle, []);
  INTITULES_SYCEBNL.get(cle).push(numero);
}

const normaliser = (t) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * LES RENVOIS QUE LE PLAN DU MÊME RÉFÉRENTIEL NUMÉROTE AUTREMENT (passes
 * R5-A1 et R5-C1). Les fiches 64 et 67 écrivent « 16 · Emprunts et dettes
 * assimilées » · la numérotation du tableau de synthèse du ch. 1, que le plan
 * détaillé du ch. 2 a remplacée (16 Fonds affectés, 18 Emprunts). La fiche
 * 78 écrit « 848 - Transferts de charges H.A.O. » quand le plan intitule le
 * 848 « Transferts de produits H.A.O. ». Le texte reste CITÉ tel quel ; le
 * numéro dont TOUTES les citations contredisent l'intitulé semé sort de la
 * liste « à utiliser » et devient un renvoi discordant, nommé. Rien ne choisit
 * un autre numéro à la place du texte · la fiche 84 elle-même dit que le 84
 * « comprend […] des transferts de charges », le texte se contredit.
 */
function renvoisDiscordants(texte) {
  const citations = new Map();
  for (const segment of segmentsAUtiliser(texte)) {
    for (const c of segment.matchAll(/\b(?:(\d{2,5})\s+et\s+)?(\d{2,5})\s*[\u2014-]\s*([^;()]+)/g)) {
      // « 654 et 7542 - Dons en nature courants à distribuer » · un intitulé
      // posé sur DEUX numéros n'est l'intitulé exact d'aucun des deux, il ne
      // se confronte pas.
      if (c[1]) continue;
      const intitule = c[3].trim().replace(/\.$/, '').trim();
      if (!citations.has(c[2])) citations.set(c[2], []);
      citations.get(c[2]).push(intitule);
    }
  }
  const discordants = [];
  for (const [numero, cites] of citations) {
    const duPlan = PLAN_SYCEBNL.get(numero);
    if (!duPlan) continue;
    const plan = normaliser(duPlan);
    const concorde = cites.some((c) => {
      const n = normaliser(c);
      return n.length > 0 && (plan.includes(n) || n.includes(plan));
    });
    // DISCORDANT, ET SEULEMENT LÀ, quand l'intitulé cité est mot pour mot
    // celui qu'un AUTRE numéro porte au plan. Une simple variante de
    // rédaction (« Ventes » pour « Revenus ») n'est pas une discordance ·
    // la déclarer telle retirerait des renvois justes.
    const autre = cites
      .map((c) => INTITULES_SYCEBNL.get(normaliser(c)) ?? [])
      .flat()
      .find((n) => n !== numero);
    if (!concorde && autre) discordants.push({ numero, intituleCite: cites[0], intitulePlan: duPlan });
  }
  return discordants.sort((a, b) => a.numero.localeCompare(b.numero));
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
      // UN TITRE, DEUX COMPTES (passe R5-C5) · « COMPTE 62 : Services
      // extérieurs / COMPTE 63 : Autres services extérieurs ». Le texte les
      // traite ensemble ; chacun reçoit sa fiche, sur le même corps, comme 90
      // et 91. Sans cela un 63 n'avait aucune fiche au dossier de révision.
      const second = m[2].match(/^(.+?)\s*\/\s*COMPTE (\d{1,3}) : (.+)$/);
      if (second) {
        const corpsCommun = [];
        fiches.push({ numero: m[1], intitule: second[1].trim(), corps: corpsCommun });
        courant = { numero: second[2], intitule: second[3].trim(), corps: corpsCommun };
      } else {
        courant = { numero: m[1], intitule: m[2].trim(), corps: [] };
      }
    } else if (courant) {
      courant.corps.push(l);
    }
  }
  if (courant) fiches.push(courant);

  for (const f of fiches) {
    const corps = f.corps.join('\n');
    const exclusions = rubrique(corps, 'Exclusions');
    const discordants = exclusions ? renvoisDiscordants(exclusions) : [];
    regles.push({
      numero: f.numero,
      intitule: f.intitule,
      exclusions,
      comptesAUtiliser: exclusions
        ? comptesAUtiliser(exclusions).filter((n) => !discordants.some((d) => d.numero === n))
        : [],
      renvoisDiscordants: discordants,
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
    renvoisDiscordants: exclusions9 ? renvoisDiscordants(exclusions9) : [],
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
  // TOUT LE SEGMENT, jusqu'à la puce suivante ou à la flèche suivante (passe
  // R1-C10). Une fenêtre de soixante caractères perdait la fin des listes ·
  // « → 759 (…) ; 779 (…) ; 849 (…) » rendait 759 seul, et le 697 du 86
  // disparaissait. Les parenthèses sont des intitulés, jamais des comptes.
  // Les notes de la TRANSCRIPTION (« *[…]* », « > *Anomalie du texte
  // officiel* … ») ne sont pas du texte officiel · les numéros qu'elles
  // citent pour commenter une anomalie ne sont pas des remplacements.
  const officiel = texte.replace(/\*\[[^\]]*\]\*/g, ' ').replace(/>\s*\*Anomalie[\s\S]*$/, ' ');
  for (const m of officiel.matchAll(/→\s*([^→]*)/g)) {
    const segment = m[1].split(/\s-\s/)[0].replace(/\([^)]*\)/g, ' ');
    for (const n of segment.matchAll(/\b(\d{2,5})\b/g)) trouves.push(n[1]);
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

  // DES EN-TÊTES QUI SE SUIVENT SANS CORPS SE PARTAGENT LA FICHE COMMUNE
  // (passe R1-C3). Le Titre VII traite ensemble 62 et 63, 9013, 9014 et 9018,
  // 9033 et 9038, 9043 et 9048, 9051 et 9058, 9083 et 9088 · seul le DERNIER
  // en-tête recevait le corps, les autres sortaient sans exclusions ni
  // éléments de contrôle, et le dossier de révision affichait qu'un 62 n'en a
  // pas. Parcours à rebours pour que les chaînes de trois se remplissent.
  for (let i = fiches.length - 2; i >= 0; i--) {
    if (fiches[i].corps.every((l) => !l.trim())) fiches[i].corps = fiches[i + 1].corps;
  }

  for (const f of fiches) {
    const corps = f.corps.join('\n');
    const exclusions = rubriqueAudcif(corps, 'Exclusions');
    reglesSyscohada.push({
      numero: f.numero,
      intitule: f.intitule,
      exclusions,
      comptesAUtiliser: exclusions ? comptesApresFleche(exclusions) : [],
      renvoisDiscordants: [],
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
        `    renvoisDiscordants: ${JSON.stringify(r.renvoisDiscordants)},\n` +
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
      `    renvoisDiscordants: ${JSON.stringify(r.renvoisDiscordants)},\n` +
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
  /**
   * Les renvois du texte dont le numéro porte, au plan semé du même
   * référentiel, un autre intitulé que celui que la fiche lui accole · sortis
   * de \`comptesAUtiliser\`, nommés, jamais remplacés par un autre numéro.
   */
  renvoisDiscordants: { numero: string; intituleCite: string; intitulePlan: string }[];
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

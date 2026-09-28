/**
 * EXTRACTEUR DU BARÈME FISCAL D'AMORTISSEMENT · arrêté ministériel
 * n° 013/CAB/MIN/FINANCES/2025 du 19 février 2025, article 2.
 *
 * Le tableau de l'article 2 porte 131 lignes (neuf sections) · une durée et un
 * taux par nature de bien. Le recopier à la main serait écrire 262 nombres de
 * mémoire, exactement ce que la règle n°1 du dépôt interdit. La table est donc
 * ENGENDRÉE depuis la compétence `fiscalite-rdc-socle`, puis committée : le
 * serveur n'a pas accès aux compétences à l'exécution.
 *
 * Deux défauts du texte officiel sont conservés tels quels, parce qu'ils sont
 * la citation (le fichier de la compétence les signale) :
 *  · la section IV numérote 1, 2, 3, 6, 6, 11, 12, 13, 14, 15, et la VII
 *    1, 2, 5, 6, 7 · le NUMÉRO n'est donc pas une clé. La clé est la section
 *    et le RANG de la ligne dans sa section (« IV.5 »), le numéro publié étant
 *    gardé à côté pour l'affichage ;
 *  · la section VIII porte, sous un intitulé hôtelier, de la plasturgie et de
 *    la blanchisserie · rien n'est déplacé.
 *
 * Usage : node scripts/extraire-bareme-amortissement.cjs <racine des compétences>
 */
const fs = require('node:fs');
const path = require('node:path');

const racine = process.argv[2];
if (!racine || !fs.existsSync(racine)) {
  console.error('Racine des compétences introuvable · passer le chemin en argument.');
  process.exit(1);
}

const source = path.join(racine, 'fiscalite-rdc-socle/references/amortissements-am-013-2025.md');
const texte = fs.readFileSync(source, 'utf8');

// Le tableau vit entre le titre de l'article 2 et celui des articles 3 à 6 ·
// on n'extrait rien d'autre, le tableau de l'art. 5 (location-acquisition)
// ayant la même forme et un autre objet.
const debut = texte.indexOf('## Article 2');
const fin = texte.indexOf('## Articles 3');
if (debut < 0 || fin < 0 || fin < debut) {
  console.error("Bornes de l'article 2 introuvables dans la compétence.");
  process.exit(1);
}
const article2 = texte.slice(debut, fin);

const lignes = [];
let section = null;
let intitule = null;
let rang = 0;
for (const brute of article2.split('\n')) {
  const titre = /^### ([IVX]+)\. (.+)$/.exec(brute.trim());
  if (titre) {
    section = titre[1];
    intitule = titre[2].trim();
    rang = 0;
    continue;
  }
  const cellule = /^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*([\d,]+)\s*\|$/.exec(brute.trim());
  if (!cellule) continue;
  if (!section) {
    console.error(`Ligne hors section : ${brute}`);
    process.exit(1);
  }
  rang += 1;
  lignes.push({
    cle: `${section}.${rang}`,
    section,
    intituleSection: intitule,
    numero: cellule[1],
    designation: cellule[2],
    dureeAns: Number(cellule[3]),
    taux: Number(cellule[4].replace(',', '.')),
  });
}

// Le fichier de la compétence annonce 131 lignes, confrontées à deux
// exemplaires de l'arrêté · un autre compte veut dire que la lecture a changé.
if (lignes.length !== 131) {
  console.error(`Attendu 131 lignes, lu ${lignes.length}.`);
  process.exit(1);
}
// Le dépôt n'admet pas le tiret cadratin hors d'une liste fermée · une
// désignation qui le porterait se signale ici plutôt que de passer.
for (const l of lignes) {
  if (/\u2014/.test(l.designation)) {
    console.error(`Tiret cadratin dans la désignation ${l.cle} · à trancher avant d'engendrer.`);
    process.exit(1);
  }
}

const sortie = path.join(__dirname, '../src/modules/immobilisations/bareme-amortissement-013-2025.ts');
const corps = `/*
  FICHIER ENGENDRÉ · ne pas retoucher à la main.
  Source · compétence fiscalite-rdc-socle, references/amortissements-am-013-2025.md,
  arrêté ministériel n° 013/CAB/MIN/FINANCES/2025 du 19 février 2025, article 2
  (en vigueur au 1er janvier 2026, art. 6).
  Engendré par scripts/extraire-bareme-amortissement.cjs · corriger la source et
  régénérer.

  La clé est « section.rang » et non le numéro publié · la section IV répète
  son numéro 6 et saute des numéros, la VII aussi (défauts du texte officiel,
  reproduits). Le taux est celui IMPRIMÉ · 100 / durée tronqué à deux décimales.
*/

export interface NatureBaremeFiscal {
  /** Section et rang dans la section, « IV.5 » · la seule clé unique. */
  cle: string;
  /** Section de l'art. 2, en chiffres romains. */
  section: string;
  intituleSection: string;
  /** Numéro tel que publié · répété ou sauté dans les sections IV et VII. */
  numero: string;
  designation: string;
  dureeAns: number;
  /** Taux annuel en pour cent du coût de revient. */
  taux: number;
}

export const BAREME_AMORTISSEMENT_013_2025: readonly NatureBaremeFiscal[] = ${JSON.stringify(lignes, null, 2)};
`;
fs.writeFileSync(sortie, corps, 'utf8');
console.log(`${lignes.length} lignes écrites dans ${path.relative(process.cwd(), sortie)}`);

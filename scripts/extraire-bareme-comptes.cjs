/**
 * EXTRACTEUR DE LA CORRESPONDANCE BARÈME FISCAL / PLAN DE COMPTES (lot 6,
 * décision D-4 de Manasse du 2026-10-01).
 *
 * Source · `docs/bareme-013-2025-comptes.md`, qui confronte les 131 natures de
 * l'arrêté n° 013/CAB/MIN/FINANCES/2025, art. 2, aux comptes de détail 21 à 24
 * des DEUX plans semés. AUCUN TEXTE NE RELIE UNE NATURE À UN COMPTE · chaque
 * ligne est une proposition de l'éditeur, et le module engendré ne sert qu'à
 * PROPOSER, jamais à refuser.
 *
 * Deux colonnes, jamais une · « un numéro, deux sens » dans la classe 24
 * (2443 « Matériel bureautique » au SYSCOHADA, « Matériel et mobilier
 * religieux » au SYCEBNL ; 2444 « Mobilier de bureau » contre « Matériel et
 * mobilier sportifs »).
 *
 * Seuls les numéros à HUIT chiffres des colonnes de comptes sont lus · un
 * intitulé du plan peut contenir « · », et une remarque cite des numéros
 * courts (« 2441 si le poste est mobile ») qui ne sont pas des propositions.
 *
 * Usage : node scripts/extraire-bareme-comptes.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const racine = path.join(__dirname, '..');
const source = path.join(racine, 'docs/bareme-013-2025-comptes.md');
// Un chemin passé en argument écrit ailleurs · le spec vérifie ainsi que le
// fichier committé est bien celui que la source engendre.
const cible = process.argv[2] ? path.resolve(process.argv[2]) : path.join(racine, 'src/modules/immobilisations/bareme-comptes-013-2025.ts');

const lignes = fs.readFileSync(source, 'utf8').split('\n');
const entrees = [];
for (const ligne of lignes) {
  if (!/^\| [IVX]+\.\d+ \|/.test(ligne)) continue;
  const cellules = ligne.split('|').slice(1, -1).map((c) => c.trim());
  if (cellules.length !== 8) {
    console.error(`Ligne à ${cellules.length} colonnes au lieu de 8 · ${ligne.slice(0, 60)}`);
    process.exit(1);
  }
  const [cle, , , , syscohada, remarqueSyscohada, sycebnl, remarqueSycebnl] = cellules;
  const numeros = (c) => (c.match(/\b\d{8}\b/g) ?? []);
  entrees.push({
    cle,
    SYSCOHADA: { comptes: numeros(syscohada), remarque: remarqueSyscohada },
    SYCEBNL: { comptes: numeros(sycebnl), remarque: remarqueSycebnl },
  });
}
if (entrees.length !== 131) {
  console.error(`${entrees.length} natures lues au lieu des 131 de l'art. 2.`);
  process.exit(1);
}

const entete = `/*
  FICHIER ENGENDRÉ · ne pas retoucher à la main.
  Source · docs/bareme-013-2025-comptes.md (proposition de l'éditeur, décision
  D-4 de Manasse du 2026-10-01). Engendré par scripts/extraire-bareme-comptes.cjs
  · corriger la source et régénérer.

  Aucun texte ne relie une nature de l'arrêté n° 013/2025 à un compte du plan ·
  ces comptes se PROPOSENT, le premier en tête, et ne refusent jamais rien.
  Une colonne par référentiel, jamais servie à l'autre.
*/

export interface ComptesDeLaNature {
  /** Numéros semés, dans l'ordre de préférence · vide si le plan n'en ouvre aucun. */
  comptes: string[];
  /** Pourquoi ce compte, ou quand en choisir un autre · vide si rien à dire. */
  remarque: string;
}

export interface CorrespondanceBareme {
  /** Clé « section.rang » de la table engendrée du barème. */
  cle: string;
  SYSCOHADA: ComptesDeLaNature;
  SYCEBNL: ComptesDeLaNature;
}

export const CORRESPONDANCE_BAREME_COMPTES: readonly CorrespondanceBareme[] = `;
fs.writeFileSync(cible, entete + JSON.stringify(entrees, null, 2) + ';\n');
console.log(`${entrees.length} natures écrites dans ${path.relative(racine, cible)}`);

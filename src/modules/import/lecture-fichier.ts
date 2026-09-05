import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

/** Un fichier lu : ses en-têtes et ses lignes, valeurs déjà en texte. */
export interface Tableau {
  colonnes: string[];
  lignes: string[][];
  separateur?: string;
}

/**
 * Détecte le séparateur d'un CSV en comparant, sur les premières lignes, celui
 * qui découpe le plus régulièrement. Un point-virgule l'emporte à égalité :
 * c'est ce qu'Excel produit en locale française, et donc la quasi-totalité de
 * ce qui nous arrivera d'une association congolaise.
 */
function detecterSeparateur(texte: string): string {
  let meilleur = ';';
  let meilleurScore = -1;
  for (const sep of [';', ',', '\t']) {
    // On ANALYSE avec chaque candidat plutôt que de découper des lignes de
    // texte · un retour à la ligne entre guillemets fausserait autrement la
    // détection avant même qu'on ait le séparateur pour le voir.
    const comptes = analyserCsv(texte, sep)
      .slice(0, 10)
      .map((l) => l.length);
    if (comptes.length === 0) continue;
    const max = Math.max(...comptes);
    if (max < 2) continue;
    const regulier = comptes.filter((c) => c === max).length;
    const score = max * 10 + regulier;
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = sep;
    }
  }
  return meilleur;
}

/**
 * ANALYSE UN CSV D'UN SEUL TENANT, texte entier, guillemets compris.
 *
 * CE QUE FAISAIT LA VERSION PRÉCÉDENTE · elle découpait d'abord le texte sur
 * les retours à la ligne, puis traitait les guillemets DANS chaque morceau.
 * Un champ entre guillemets contenant un retour à la ligne — un libellé de
 * cotisation sur deux lignes, une adresse de tiers, une observation — était
 * donc coupé en deux. L'écriture devenait deux lignes, dont l'une portait
 * `annee 2026;1500` en une seule cellule : le montant disparaissait, et RIEN
 * ne remontait comme anomalie, puisque chacune des deux moitiés était un
 * texte parfaitement lisible.
 *
 * Le retour à la ligne ne termine donc un enregistrement que HORS
 * guillemets. `\r\n`, `\n` et `\r` seuls sont acceptés · un fichier
 * enregistré sous Windows, sous Unix ou par un vieux tableur Mac se lit
 * pareil.
 *
 * ÉLAGAGE · avec `elaguer`, seules les cellules NON PROTÉGÉES perdent leurs
 * espaces de bord. Une cellule entre guillemets est littérale (RFC 4180) · son
 * auteur a demandé ces espaces, et les manger rendrait l'aller-retour faux.
 * Sans l'option, rien n'est touché.
 */
export function analyserCsv(
  texte: string,
  separateur: string,
  options: { elaguer?: boolean } = {},
): string[][] {
  const lignes: string[][] = [];
  let cellules: string[] = [];
  let courante = '';
  let dansGuillemets = false;
  let protegee = false;
  const clore = () => {
    cellules.push(options.elaguer && !protegee ? courante.trim() : courante);
    courante = '';
    protegee = false;
  };
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (dansGuillemets) {
      if (c === '"') {
        // Un guillemet doublé est un guillemet littéral · c'est la seule
        // façon d'en écrire un dans un champ protégé (RFC 4180).
        if (texte[i + 1] === '"') {
          courante += '"';
          i++;
        } else {
          dansGuillemets = false;
        }
      } else {
        courante += c;
      }
      continue;
    }
    if (c === '"') {
      dansGuillemets = true;
      protegee = true;
    } else if (c === separateur) {
      clore();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      clore();
      lignes.push(cellules);
      cellules = [];
    } else {
      courante += c;
    }
  }
  // La dernière ligne n'est close par aucun retour · sans ceci, un fichier
  // qui ne finit pas par une ligne vide perdrait son dernier enregistrement.
  if (courante !== '' || cellules.length > 0) {
    clore();
    lignes.push(cellules);
  }
  return lignes;
}

/**
 * ÉCRIT une cellule CSV, réversible par `analyserCsv`.
 *
 * On protège dès qu'un séparateur, un guillemet, un retour à la ligne ou une
 * espace de bord est présent · les trois premiers casseraient la relecture,
 * la quatrième serait mangée par l'élagage de `lireCsv`.
 */
export function ecrireCelluleCsv(valeur: string, separateur: string): string {
  const doitProteger =
    valeur.includes(separateur) ||
    valeur.includes('"') ||
    /[\r\n]/.test(valeur) ||
    valeur !== valeur.trim();
  if (!doitProteger) return valeur;
  return `"${valeur.replace(/"/g, '""')}"`;
}

/** Écrit un tableau complet · en-têtes puis lignes, en CRLF (RFC 4180). */
export function ecrireCsv(colonnes: string[], lignes: string[][], separateur = ';'): string {
  const ligne = (cellules: string[]) =>
    cellules.map((c) => ecrireCelluleCsv(c, separateur)).join(separateur);
  return [ligne(colonnes), ...lignes.map(ligne)].join('\r\n');
}

function lireCsv(texte: string, separateurImpose?: string): Tableau {
  // BOM UTF-8 : Excel en ajoute un systématiquement, et sans ce retrait la
  // première colonne s'appellerait "﻿Numéro" et aucun mappage ne la
  // reconnaîtrait.
  const propre = texte.replace(/^﻿/, '');
  const separateur = separateurImpose ?? detecterSeparateur(propre);
  const analysees = analyserCsv(propre, separateur, { elaguer: true }).filter((l) =>
    l.some((c) => c !== ''),
  );
  if (analysees.length === 0) {
    throw new BadRequestException('Le fichier est vide.');
  }
  return { colonnes: analysees[0], lignes: analysees.slice(1), separateur };
}

async function lireXlsx(contenu: Buffer): Promise<Tableau> {
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(contenu as unknown as ArrayBuffer);
  const feuille = classeur.worksheets[0];
  if (!feuille) throw new BadRequestException('Le classeur ne contient aucune feuille.');

  const enTexte = (v: ExcelJS.CellValue): string => {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'object') {
      // Formule, texte enrichi ou lien : ExcelJS renvoie un objet dont on
      // retient la valeur affichée, pas la mécanique interne.
      const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
      if (o.richText) return o.richText.map((t) => t.text).join('');
      if (o.text !== undefined) return String(o.text);
      if (o.result !== undefined) return String(o.result);
      return '';
    }
    return String(v);
  };

  const toutes: string[][] = [];
  feuille.eachRow((row) => {
    const valeurs: string[] = [];
    // `row.values` est 1-indexé chez ExcelJS, d'où la coupe du premier élément.
    const brut = (row.values as ExcelJS.CellValue[]).slice(1);
    for (const v of brut) valeurs.push(enTexte(v).trim());
    toutes.push(valeurs);
  });

  const nonVides = toutes.filter((l) => l.some((c) => c !== ''));
  if (nonVides.length === 0) throw new BadRequestException('La feuille est vide.');
  return { colonnes: nonVides[0], lignes: nonVides.slice(1) };
}

/** Lit un CSV ou un XLSX selon l'extension du nom de fichier. */
export async function lireFichier(
  nomFichier: string,
  contenuBase64: string,
  separateur?: string,
): Promise<Tableau> {
  let contenu: Buffer;
  try {
    contenu = Buffer.from(contenuBase64, 'base64');
  } catch {
    throw new BadRequestException('Contenu du fichier illisible.');
  }
  if (contenu.length === 0) throw new BadRequestException('Le fichier est vide.');

  if (/\.xlsx$/i.test(nomFichier)) return lireXlsx(contenu);
  if (/\.xls$/i.test(nomFichier)) {
    throw new BadRequestException(
      "Le format .xls (Excel 97-2003) n'est pas lu. Enregistrez le fichier en .xlsx ou en CSV.",
    );
  }
  return lireCsv(contenu.toString('utf8'), separateur);
}

/**
 * Lit un montant écrit par un tableur francophone : espaces fines ou
 * insécables comme séparateurs de milliers, virgule décimale, parenthèses pour
 * le négatif. « 1 234,56 » et « (1234.56) » donnent 1234.56 et -1234.56.
 */
export function lireMontant(valeur: string): number | null {
  const brut = (valeur ?? '').trim();
  if (brut === '' || brut === '-') return 0;
  const negatifParenthese = /^\(.*\)$/.test(brut);
  // On retire les parenthèses, les espaces (y compris insécables et fines) et
  // un code monétaire éventuel en tête ou en queue · « 12 000 CDF » est un
  // montant, « douze » n'en est pas un et doit remonter comme anomalie plutôt
  // que de se transformer en zéro silencieux.
  let nettoye = brut
    .replace(/[()]/g, '')
    .replace(/[\s\u00a0\u202f\u2009]/g, '')
    .replace(/^(?:CDF|USD|FC|EUR|XAF|XOF|€|\$)/i, '')
    .replace(/(?:CDF|USD|FC|EUR|XAF|XOF|€|\$)$/i, '');
  if (nettoye === '') return 0;
  // Virgule décimale : on ne la convertit que si elle est la dernière
  // ponctuation, sinon « 1,234.56 » (notation anglo-saxonne) serait mal lu.
  const derniereVirgule = nettoye.lastIndexOf(',');
  const dernierPoint = nettoye.lastIndexOf('.');
  if (derniereVirgule > dernierPoint) {
    nettoye = nettoye.replace(/\./g, '').replace(',', '.');
  } else {
    nettoye = nettoye.replace(/,/g, '');
  }
  // Tout ce qui n'est pas strictement numérique après nettoyage est une
  // anomalie : mieux vaut arrêter l'import sur une cellule douteuse que de
  // reprendre une balance amputée d'un montant qu'on aura lu comme zéro.
  if (!/^[+-]?\d+(\.\d+)?$/.test(nettoye)) return null;
  const n = Number(nettoye);
  if (!Number.isFinite(n)) return null;
  return negatifParenthese ? -Math.abs(n) : n;
}

/** Lit une date en JJ/MM/AAAA, AAAA-MM-JJ ou JJ-MM-AAAA. */
export function lireDate(valeur: string): Date | null {
  const brut = (valeur ?? '').trim();
  if (!brut) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(brut);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(brut);
  if (m) {
    const annee = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(Date.UTC(annee, Number(m[2]) - 1, Number(m[1])));
  }
  // Pas de repli sur `new Date(brut)` : V8 accepte des chaînes fantaisistes
  // et daterait « le 3 mars » du 3 mars 2001. Sur un import, une date mal lue
  // est pire qu'une date refusée · on ne reconnaît que les deux formats
  // ci-dessus.
  return null;
}

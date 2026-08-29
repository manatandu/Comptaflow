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
  const echantillon = texte.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  if (echantillon.length === 0) return ';';
  let meilleur = ';';
  let meilleurScore = -1;
  for (const sep of [';', ',', '\t']) {
    const comptes = echantillon.map((l) => decouperLigne(l, sep).length);
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

/** Découpe une ligne CSV en respectant les guillemets et les doublements. */
function decouperLigne(ligne: string, separateur: string): string[] {
  const cellules: string[] = [];
  let courante = '';
  let dansGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') {
      if (dansGuillemets && ligne[i + 1] === '"') {
        courante += '"';
        i++;
      } else {
        dansGuillemets = !dansGuillemets;
      }
    } else if (c === separateur && !dansGuillemets) {
      cellules.push(courante);
      courante = '';
    } else {
      courante += c;
    }
  }
  cellules.push(courante);
  return cellules.map((c) => c.trim());
}

function lireCsv(texte: string, separateurImpose?: string): Tableau {
  // BOM UTF-8 : Excel en ajoute un systématiquement, et sans ce retrait la
  // première colonne s'appellerait "﻿Numéro" et aucun mappage ne la
  // reconnaîtrait.
  const propre = texte.replace(/^﻿/, '');
  const separateur = separateurImpose ?? detecterSeparateur(propre);
  const lignesBrutes = propre.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lignesBrutes.length === 0) {
    throw new BadRequestException('Le fichier est vide.');
  }
  const colonnes = decouperLigne(lignesBrutes[0], separateur);
  const lignes = lignesBrutes.slice(1).map((l) => decouperLigne(l, separateur));
  return { colonnes, lignes, separateur };
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

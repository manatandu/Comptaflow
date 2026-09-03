import * as ExcelJS from 'exceljs';

/**
 * CHARTE GRAPHIQUE « ETAFI » · port TypeScript de
 * `sycebnl/liasse/scripts/theme_etafi.py` (le skill fait référence).
 *
 * Le skill produit les classeurs modèles en Python + openpyxl ; le serveur
 * tourne en Node + ExcelJS, sans Python dans l'environnement de déploiement.
 * On ne peut donc pas APPELER le thème : on le PORTE, constante par
 * constante et primitive par primitive, pour que les exports d'OmegaX
 * sortent exactement dans la présentation des classeurs d'exemple du skill
 * (`liasse/exemples/*.xlsx`).
 *
 * Palette exacte du modèle (liasse fiscale professionnelle réelle, ETAFI) :
 *   CCFFFF  bandeaux d'en-têtes de colonnes     FFFFCC  lignes de rubriques
 *   C0C0C0  totaux intermédiaires               008000  totaux de section
 *   000080  TOTAL GENERAL / bandeau de garde    003366  titres de notes, TFT
 *   CCFFCC  en-têtes CONTROLE BALANCE           FFCC99  titre CONTROLE
 *   CCCCFF  bandes de parties TABLE COMMENTAIRE 660066  bandeau Couverture
 *
 * Niveaux de lignes (styleLigne) :
 *   normal    ligne ordinaire (Arial 9, filets)
 *   rubrique  intitulé de rubrique en gras sur fond jaune pâle FFFFCC
 *   inter     total intermédiaire en gras sur fond gris C0C0C0
 *   section   total de section en gras blanc sur fond vert 008000
 *   general   TOTAL GENERAL en gras blanc sur fond bleu nuit 000080
 *   cle       ligne clef (TFT trésorerie ZA/ZF/ZG) en blanc sur 003366
 *   bande     bande de section sans référence (gras sur gris C0C0C0)
 *
 * Une seule adaptation de fond, assumée : le modèle ivoirien étiquette son
 * identifiant « N° de compte contribuable (NCC) » · en RDC, l'identifiant
 * exigé en tête des états est le NIF (CPCC, § 7.4 règle 7-a, voir
 * docs/identifiants-legaux-ebnl-rdc.md). La ligne garde sa place et sa
 * forme, son étiquette dit NIF.
 */

// ---------------------------------------------------------------------------
// Palette, polices, bordures, formats
// ---------------------------------------------------------------------------

export const C_ENTETE = 'CCFFFF';
export const C_RUBRIQUE = 'FFFFCC';
export const C_GRIS = 'C0C0C0';
export const C_SECTION = '008000';
export const C_NAVY = '000080';
export const C_NOTE = '003366';
export const C_CTRL_ENT = 'CCFFCC';
export const C_CTRL_TITRE = 'FFCC99';
export const C_PARTIE_TC = 'CCCCFF';
export const C_COUV = '660066';
export const C_GARDE_TXT = 'CC99FF';

const argb = (hex: string) => ({ argb: `FF${hex}` });
export const fond = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: argb(hex) });

type Police = Partial<ExcelJS.Font>;
export const F_DONNEE: Police = { name: 'Arial', size: 9 };
export const F_DONNEE_G: Police = { name: 'Arial', size: 9, bold: true };
export const F_BLANC_G: Police = { name: 'Arial', size: 9, bold: true, color: argb('FFFFFF') };
export const F_CARTOUCHE: Police = { name: 'Arial', size: 9 };
export const F_PAGE_REF: Police = { name: 'Arial', size: 8 };
export const F_ENTETE_COL: Police = { name: 'Arial', size: 9, bold: true };
export const F_TITRE_ETAT: Police = { name: 'Arial Black', size: 16, bold: true, color: argb(C_SECTION) };
export const F_TITRE_ETAT_M: Police = { name: 'Arial Black', size: 14, bold: true, color: argb(C_SECTION) };
export const F_TITRE_NOTE: Police = { name: 'Arial Black', size: 11, bold: true, color: argb(C_NOTE) };
export const F_VERDICT: Police = { name: 'Arial Black', size: 10, bold: true, color: argb(C_NAVY) };

const NOIR = { argb: 'FF000000' };
export const FIN: ExcelJS.Border = { style: 'thin', color: NOIR };
export const FILET: ExcelJS.Border = { style: 'hair', color: NOIR };
export const MOYEN: ExcelJS.Border = { style: 'medium', color: NOIR };
export const POINTILLE: ExcelJS.Border = { style: 'dashed', color: NOIR };

export const B_DONNEE: Partial<ExcelJS.Borders> = { top: FILET, bottom: FILET, left: FIN, right: FIN };
export const B_FIN: Partial<ExcelJS.Borders> = { top: FIN, bottom: FIN, left: FIN, right: FIN };
export const B_SOULIGNE: Partial<ExcelJS.Borders> = { bottom: POINTILLE };

export const AL_CENTRE: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };
export const AL_GAUCHE: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'middle', wrapText: true };
export const AL_DROITE: Partial<ExcelJS.Alignment> = { horizontal: 'right', vertical: 'middle' };

/** Format comptable du modèle : milliers en espaces, zéro affiché « - ». */
export const FMT_MONTANT = '_-* #,##0\\ _€_-;\\-* #,##0\\ _€_-;_-* "-"\\ _€_-;_-@_-';
export const FMT_PCT = '0.0%';

/** Noms normalisés des feuilles de balance dans les classeurs produits. */
export const NOM_BALANCE = 'BALANCE N';
export const NOM_BALANCE_N1 = 'BALANCE N-1';

/** Référence de feuille prête pour une formule (apostrophes si nécessaire). */
export function q(nom: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(nom)) return nom;
  return `'${nom.replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// Identité de l'entité (cartouche)
// ---------------------------------------------------------------------------

export interface IdentiteLiasse {
  /** Dénomination sociale. */
  entite: string;
  /** NIF · l'identifiant que le CPCC impose en tête de chaque page. */
  nif: string;
  /** Exercice · « 2026 » ou une date « 31/12/2026 ». */
  exercice: string;
  /** Durée en mois. */
  duree: string;
  adresse: string;
  sigle: string;
  /** N° de télédéclarant · ligne du modèle, vide tant qu'il n'existe pas. */
  ntd: string;
  /**
   * DATE D'ARRÊTÉ DES COMPTES · quatrième mention obligatoire de chaque page
   * publiée (AUDCIF Titre IX ch. 1 § 2.4), exigée dans toute publication par
   * l'art. 23. Vide tant que les organes dirigeants n'ont pas arrêté : le
   * cartouche le DIT alors, plutôt que de laisser une ligne muette passer pour
   * une page complète.
   *
   * Portée sur la ligne 6, à côté du NTD, et non sur une septième ligne · le
   * cartouche à six lignes reproduit le modèle officiel, et lui ajouter une
   * ligne décalerait toutes les références de page du classeur.
   */
  dateArrete: string;
}

export function texteExercice(exercice: string): string {
  const ex = (exercice ?? '').trim();
  if (/^\d{4}$/.test(ex)) return `Exercice clos le 31-12-${ex}`;
  return ex ? `Exercice clos le ${ex}` : 'Exercice clos le';
}

// ---------------------------------------------------------------------------
// Aides bas niveau
// ---------------------------------------------------------------------------

export function fusion(ws: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number) {
  if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
}

/** Cadre extérieur autour d'une plage, en préservant les bordures posées. */
export function cadre(ws: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number, cote: ExcelJS.Border = MOYEN) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      const b: Partial<ExcelJS.Borders> = { ...(cell.border ?? {}) };
      if (r === r1) b.top = cote;
      if (r === r2) b.bottom = cote;
      if (c === c1) b.left = cote;
      if (c === c2) b.right = cote;
      cell.border = b;
    }
  }
}

export function hauteurs(ws: ExcelJS.Worksheet, spec: Record<number, number>) {
  for (const [r, h] of Object.entries(spec)) ws.getRow(Number(r)).height = h;
}

export function largeurs(ws: ExcelJS.Worksheet, spec: Record<string, number>) {
  for (const [lettre, l] of Object.entries(spec)) ws.getColumn(lettre).width = l;
}

export function masquerQuadrillage(ws: ExcelJS.Worksheet) {
  // `views` peut déjà porter des volets figés · on complète sans écraser.
  ws.views = ws.views?.length ? ws.views.map((v) => ({ ...v, showGridLines: false })) : [{ showGridLines: false }];
}

// ---------------------------------------------------------------------------
// Cartouche de page (lignes 1 à 6) et titres
// ---------------------------------------------------------------------------

/**
 * Cartouche d'identification du modèle en tête de page :
 *   L1  - 0 -                                  (renuméroté par numeroterPages)
 *   L2                        [réf. de page]
 *   L3  Dénomination sociale : X
 *   L4  Adresse : ...            Sigle usuel : X
 *   L5  NIF : X    Exercice clos le X    Durée (en mois) : X
 *   L6  N° de télédéclarant (NTD) : X
 * Rend la ligne du titre (7).
 */
export function ecrireCartouche(ws: ExcelJS.Worksheet, ident: IdentiteLiasse, pageRef: string, colMax: number): number {
  masquerQuadrillage(ws);
  let c = ws.getCell(1, 1);
  c.value = '- 0 -';
  c.font = { name: 'Arial', size: 10 };
  c.alignment = { horizontal: 'center', vertical: 'middle' };
  c.numFmt = '@';

  const cRef = Math.max(2, colMax - 1);
  fusion(ws, 2, cRef, 2, colMax);
  c = ws.getCell(2, cRef);
  c.value = pageRef;
  c.font = F_PAGE_REF;
  c.alignment = AL_CENTRE;
  c.numFmt = '@';
  for (let cc = cRef; cc <= colMax; cc++) ws.getCell(2, cc).border = { top: FIN, bottom: FIN, left: FIN };

  c = ws.getCell(3, 1);
  c.value = `Dénomination sociale : ${ident.entite}`.trimEnd();
  c.font = F_CARTOUCHE;

  ws.getCell(4, 1).value = 'Adresse :';
  ws.getCell(4, 1).font = F_CARTOUCHE;
  const finAdr = Math.max(2, colMax - 3);
  fusion(ws, 4, 2, 4, finAdr);
  c = ws.getCell(4, 2);
  c.value = ident.adresse;
  c.font = F_CARTOUCHE;
  for (let cc = 2; cc <= finAdr; cc++) ws.getCell(4, cc).border = B_SOULIGNE;
  c = ws.getCell(4, Math.max(3, colMax - 1));
  c.value = 'Sigle usuel :';
  c.font = F_CARTOUCHE;
  c.alignment = AL_DROITE;
  c = ws.getCell(4, colMax);
  c.value = ident.sigle;
  c.font = F_CARTOUCHE;
  c.border = B_SOULIGNE;

  c = ws.getCell(5, 1);
  c.value = `N° d'identification fiscale (NIF) : ${ident.nif}`.trimEnd();
  c.font = F_CARTOUCHE;
  c = ws.getCell(5, Math.max(3, colMax - 3));
  c.value = texteExercice(ident.exercice);
  c.font = F_CARTOUCHE;
  c = ws.getCell(5, Math.max(3, colMax - 1));
  c.value = `Durée (en mois) : ${ident.duree}`;
  c.font = F_CARTOUCHE;

  c = ws.getCell(6, 1);
  c.value = `N° de télédéclarant (NTD) : ${ident.ntd}`.trimEnd();
  c.font = F_CARTOUCHE;

  // La quatrième mention · § 2.4. Elle est écrite même absente, parce qu'une
  // page publiée sans elle est une page incomplète, et que le silence se lit
  // comme une page complète.
  c = ws.getCell(6, Math.max(3, colMax - 3));
  c.value = ident.dateArrete
    ? `Comptes arrêtés le ${ident.dateArrete}`
    : "Date d'arrêté des comptes non renseignée";
  c.font = F_CARTOUCHE;

  hauteurs(ws, { 1: 12, 2: 26, 3: 15, 4: 15, 5: 15, 6: 15, 7: 28 });
  return 7;
}

/** Titre d'état : Arial Black vert, centré, filet inférieur moyen. */
export function titreEtat(ws: ExcelJS.Worksheet, texte: string, colMin: number, colMax: number, row = 7, taille = 16): number {
  fusion(ws, row, colMin, row, colMax);
  const c = ws.getCell(row, colMin);
  c.value = texte;
  c.font = taille >= 16 ? F_TITRE_ETAT : F_TITRE_ETAT_M;
  c.alignment = { horizontal: 'center', vertical: 'middle' };
  for (let cc = colMin; cc <= colMax; cc++) ws.getCell(row, cc).border = { bottom: MOYEN };
  return row + 1;
}

/**
 * BANDE « NEANT » · la mention portée par une note annexe que l'exercice ne
 * chiffre pas.
 *
 * Une note sans rien à déclarer doit quand même FIGURER dans la liasse. Le
 * modèle officiel le dit par sa fiche : « FICHE RECAPITULATIVE DES NOTES
 * ANNEXES PRESENTEES », colonnes « A (Applicable) » et « N/A (Non
 * applicable) » (Partie 4, ch. 2, section 4) · on déclare une note non
 * applicable, on ne la fait pas disparaître. Une note absente ne se
 * distingue pas d'une note oubliée, et c'est précisément ce qu'un lecteur
 * des états, un auditeur ou le CPCC ont besoin de départager.
 *
 * Excel n'a pas de vrai filigrane de page accessible par ExcelJS · la
 * mention est donc rendue par une bande fusionnée sur toute la largeur du
 * tableau, en gris clair et en gros caractères, qui s'imprime comme un
 * filigrane et se lit à l'écran sans ambiguïté.
 */
export function bandeNeant(ws: ExcelJS.Worksheet, row: number, colMax: number): number {
  fusion(ws, row, 1, row + 1, colMax);
  const c = ws.getCell(row, 1);
  c.value = 'NEANT';
  c.font = { name: 'Arial Black', size: 26, bold: true, color: argb(C_GRIS) };
  c.alignment = AL_CENTRE;
  ws.getRow(row).height = 30;
  ws.getRow(row + 1).height = 30;
  return row + 2;
}

/** Titre de note annexe : Arial Black 11 bleu nuit, centré. */
export function titreNote(ws: ExcelJS.Worksheet, texte: string, colMax: number, row = 7): number {
  fusion(ws, row, 1, row, colMax);
  const c = ws.getCell(row, 1);
  c.value = texte;
  c.font = F_TITRE_NOTE;
  c.alignment = AL_CENTRE;
  return row + 1;
}

// ---------------------------------------------------------------------------
// Bandeaux d'en-têtes et niveaux de lignes
// ---------------------------------------------------------------------------

/** Bandeau d'en-têtes : fond CCFFFF, Arial 9 gras, cadre extérieur moyen. */
export function entetesBande(ws: ExcelJS.Worksheet, rowMin: number, rowMax: number, colMin: number, colMax: number) {
  for (let r = rowMin; r <= rowMax; r++) {
    for (let c = colMin; c <= colMax; c++) {
      const cell = ws.getCell(r, c);
      cell.font = F_ENTETE_COL;
      cell.fill = fond(C_ENTETE);
      cell.alignment = AL_CENTRE;
      cell.border = B_FIN;
    }
  }
  cadre(ws, rowMin, colMin, rowMax, colMax, MOYEN);
}

export type NiveauLigne = 'normal' | 'rubrique' | 'inter' | 'section' | 'general' | 'cle' | 'bande';

const NIVEAUX: Record<Exclude<NiveauLigne, 'normal'>, [string, Police]> = {
  rubrique: [C_RUBRIQUE, F_DONNEE_G],
  inter: [C_GRIS, F_DONNEE_G],
  section: [C_SECTION, F_BLANC_G],
  general: [C_NAVY, F_BLANC_G],
  cle: [C_NOTE, F_BLANC_G],
  bande: [C_GRIS, F_DONNEE_G],
};

/**
 * Habille une ligne de tableau selon son niveau. `colRef` : colonne du code
 * REF · elle reste SANS fond (le modèle laisse la case REF blanche même sur
 * une ligne verte ou bleu nuit) et centrée, en gras dès que la ligne est
 * remarquable.
 */
export function styleLigne(
  ws: ExcelJS.Worksheet,
  row: number,
  colMin: number,
  colMax: number,
  niveau: NiveauLigne = 'normal',
  colsMontant: readonly number[] = [],
  colRef?: number,
) {
  const [fondHex, police] = niveau === 'normal' ? [null, F_DONNEE] : NIVEAUX[niveau];
  for (let c = colMin; c <= colMax; c++) {
    const cell = ws.getCell(row, c);
    cell.border = B_DONNEE;
    if (fondHex && c !== colRef) cell.fill = fond(fondHex);
    cell.font = c !== colRef ? police : niveau !== 'normal' ? F_DONNEE_G : F_DONNEE;
    if (colsMontant.includes(c)) {
      cell.numFmt = FMT_MONTANT;
      if (!cell.alignment || !cell.alignment.wrapText) cell.alignment = { vertical: 'middle' };
    } else if (c === colRef) {
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    } else if (!cell.alignment || !cell.alignment.horizontal) {
      cell.alignment = AL_GAUCHE;
    }
  }
  if (niveau === 'general') {
    for (let c = colMin; c <= colMax; c++) {
      const cell = ws.getCell(row, c);
      cell.border = { ...cell.border, bottom: MOYEN };
    }
  }
}

// ---------------------------------------------------------------------------
// Numérotation des pages
// ---------------------------------------------------------------------------

/** Numérote « - n - » (cellule A1) les pages porteuses du cartouche. */
export function numeroterPages(wb: ExcelJS.Workbook) {
  let n = 0;
  wb.eachSheet((ws) => {
    const v = ws.getCell(1, 1).value;
    if (typeof v === 'string' && v.trim().startsWith('-')) {
      n += 1;
      ws.getCell(1, 1).value = `- ${n} -`;
    }
  });
}

// ---------------------------------------------------------------------------
// Couverture
// ---------------------------------------------------------------------------

/** Page de couverture : cadre, bande verticale bleu nuit, nom de l'entité,
 *  bandeau violet « LIASSE ... ». */
export function construireCouverture(wb: ExcelJS.Workbook, ident: IdentiteLiasse, titreLiasse: string, pays = '') {
  const ws = wb.addWorksheet('Couverture');
  masquerQuadrillage(ws);
  largeurs(ws, { A: 1.3, B: 0.8, C: 1.3, D: 8.7, E: 10.5, F: 11.5, G: 11.5, H: 13.2, I: 11.5, J: 8.7, K: 11.5, L: 1.3, M: 0.8 });
  hauteurs(ws, { 1: 4, 2: 4, 31: 33, 53: 5 });
  for (let r = 3; r < 53; r++) if (r !== 31) ws.getRow(r).height = 13;
  cadre(ws, 2, 2, 52, 13, MOYEN);
  for (let r = 3; r < 19; r++) for (const c of [3, 4]) ws.getCell(r, c).fill = fond(C_NOTE);
  if (pays) {
    fusion(ws, 4, 6, 4, 9);
    const c = ws.getCell(4, 6);
    c.value = pays;
    c.font = { name: 'Times New Roman', size: 12, bold: true };
    c.alignment = AL_CENTRE;
  }
  fusion(ws, 26, 5, 29, 10);
  let c = ws.getCell(26, 5);
  c.value = ident.entite;
  c.font = { name: 'Arial', size: 22, bold: true };
  c.alignment = AL_CENTRE;
  fusion(ws, 31, 5, 31, 11);
  c = ws.getCell(31, 5);
  c.value = titreLiasse;
  c.font = { name: 'Arial Black', size: 20, bold: true, color: argb('FFFFFF') };
  c.alignment = AL_CENTRE;
  for (let cc = 5; cc < 12; cc++) ws.getCell(31, cc).fill = fond(C_COUV);
  fusion(ws, 34, 5, 34, 11);
  c = ws.getCell(34, 5);
  c.value = texteExercice(ident.exercice);
  c.font = { name: 'Arial', size: 12, bold: true };
  c.alignment = AL_CENTRE;
  return ws;
}

// ---------------------------------------------------------------------------
// Garde
// ---------------------------------------------------------------------------

/** Page de garde du modèle : bande grise du référentiel, bandeau bleu nuit,
 *  désignation de l'entité, documents déposés, zone de l'administration. */
export function construireGarde(
  wb: ExcelJS.Workbook,
  ident: IdentiteLiasse,
  options: { bandeau: string; sousBandeau: string; systeme: string; documents: string[]; lignesAdmin?: string[]; centreDepot?: string },
) {
  const ws = wb.addWorksheet('Garde');
  masquerQuadrillage(ws);
  largeurs(ws, { A: 1.0, B: 19.8, C: 11.3, D: 11.0, E: 3.2, F: 5.2, G: 5.2, H: 3.2, I: 11.0, J: 11.3, K: 19.8, L: 1.0 });
  hauteurs(ws, { 2: 20, 3: 20, 4: 20, 8: 12, 9: 14, 12: 44, 13: 22, 16: 18, 20: 16, 22: 18, 26: 18, 28: 18, 30: 14, 31: 17, 32: 30, 33: 14 });
  let r = 2;
  for (const [i, ligne] of (options.lignesAdmin ?? []).entries()) {
    fusion(ws, r, 3, r, 10);
    const c = ws.getCell(r, 3);
    c.value = ligne;
    c.font = { name: 'Arial', size: i === 0 ? 14 : 10, bold: true };
    c.alignment = AL_CENTRE;
    r += 1;
  }
  if (options.centreDepot) {
    fusion(ws, 8, 3, 8, 10);
    let c = ws.getCell(8, 3);
    c.value = 'CENTRE DE DEPOT DE';
    c.font = { name: 'Arial', size: 10 };
    c.alignment = AL_CENTRE;
    fusion(ws, 9, 3, 9, 10);
    c = ws.getCell(9, 3);
    c.value = options.centreDepot;
    c.font = { name: 'Arial', size: 11, bold: true };
    c.alignment = AL_CENTRE;
  }
  fusion(ws, 12, 2, 12, 11);
  let c = ws.getCell(12, 2);
  c.value = options.bandeau;
  c.font = { name: 'Arial', size: 14, bold: true };
  c.alignment = AL_CENTRE;
  for (let cc = 2; cc < 12; cc++) {
    ws.getCell(12, cc).fill = fond(C_GRIS);
    ws.getCell(12, cc).border = { top: MOYEN, bottom: FIN };
  }
  fusion(ws, 13, 2, 13, 11);
  c = ws.getCell(13, 2);
  c.value = options.sousBandeau;
  c.font = { name: 'Arial', size: 17, bold: true, color: argb(C_GARDE_TXT) };
  c.alignment = AL_CENTRE;
  for (let cc = 2; cc < 12; cc++) {
    ws.getCell(13, cc).fill = fond(C_NAVY);
    ws.getCell(13, cc).border = { bottom: MOYEN };
  }
  fusion(ws, 16, 3, 16, 10);
  c = ws.getCell(16, 3);
  c.value = `${texteExercice(ident.exercice)}   -   Durée (en mois) : ${ident.duree}`;
  c.font = { name: 'Arial', size: 14, bold: true };
  c.alignment = AL_CENTRE;
  fusion(ws, 20, 2, 20, 11);
  c = ws.getCell(20, 2);
  c.value = "DESIGNATION DE L'ENTITE";
  c.font = { name: 'Arial', size: 12, bold: true };
  c.alignment = AL_CENTRE;
  for (let cc = 2; cc < 12; cc++) ws.getCell(20, cc).border = { top: FIN, bottom: FIN };
  const champs: Array<[number, string, string]> = [
    [22, 'DENOMINATION SOCIALE :', ident.entite],
    [24, 'SIGLE USUEL :', ident.sigle],
    [26, 'ADRESSE COMPLETE :', ident.adresse],
    [28, "N° d'identification fiscale (NIF) :", ident.nif],
    [30, 'N° de télédéclarant (NTD) :', ident.ntd],
  ];
  for (const [rr, lab, val] of champs) {
    c = ws.getCell(rr, 2);
    c.value = lab;
    c.font = { name: 'Arial', size: 9, bold: rr >= 28 };
    fusion(ws, rr, 5, rr, 10);
    c = ws.getCell(rr, 5);
    c.value = val;
    c.font = { name: 'Arial', size: 12, bold: true };
    c.alignment = AL_CENTRE;
    for (let cc = 5; cc < 11; cc++) ws.getCell(rr, cc).border = B_SOULIGNE;
  }
  fusion(ws, 32, 2, 32, 11);
  c = ws.getCell(32, 2);
  c.value = options.systeme;
  c.font = { name: 'Arial', size: 16, bold: true };
  c.alignment = AL_CENTRE;
  for (let cc = 2; cc < 12; cc++) ws.getCell(32, cc).border = { top: POINTILLE };
  ws.getCell(34, 2).value = 'Documents déposés';
  ws.getCell(34, 2).font = { name: 'Arial', size: 10, bold: true };
  ws.getCell(34, 8).value = "Réservé à l'administration";
  ws.getCell(34, 8).font = { name: 'Arial', size: 10, bold: true };
  r = 35;
  for (const doc of options.documents) {
    fusion(ws, r, 2, r, 5);
    c = ws.getCell(r, 2);
    c.value = doc;
    c.font = F_DONNEE;
    for (let cc = 2; cc < 6; cc++) ws.getCell(r, cc).border = B_FIN;
    c = ws.getCell(r, 6);
    c.value = 'X';
    c.font = { name: 'Arial Black', size: 8, bold: true };
    c.alignment = AL_CENTRE;
    c.border = B_FIN;
    r += 1;
  }
  const zone: Array<[string, number]> = [
    ['Date de dépôt', 1],
    ['', 3],
    ["Nom de l'agent ayant réceptionné le dépôt", 1],
    ['', 3],
    ["Signature de l'agent et cachet du service", 1],
    ['', 3],
  ];
  let rz = 35;
  for (const [texte, h] of zone) {
    fusion(ws, rz, 8, rz + h - 1, 11);
    if (texte) {
      c = ws.getCell(rz, 8);
      c.value = texte;
      c.font = { name: 'Arial', size: 8 };
      c.alignment = { horizontal: 'center', vertical: 'top' };
    }
    for (let rr = rz; rr < rz + h; rr++) for (let cc = 8; cc < 12; cc++) ws.getCell(rr, cc).border = B_FIN;
    rz += h;
  }
  r = Math.max(r, rz) + 1;
  for (const lab of ['Nombre de pages déposées par exemplaire :', "Nombre d'exemplaires déposés :"]) {
    fusion(ws, r, 2, r, 5);
    c = ws.getCell(r, 2);
    c.value = lab;
    c.font = F_DONNEE;
    for (let cc = 2; cc < 7; cc++) ws.getCell(r, cc).border = B_FIN;
    r += 1;
  }
  return ws;
}

// ---------------------------------------------------------------------------
// Fiche 1 et Fiche 2
// ---------------------------------------------------------------------------

/** Fiche d'identification à cases codes (ZA, ZB, ...) sur fond FFFFCC ·
 *  champs connus pré-remplis, le reste à compléter par l'entité. */
export function construireFiche1(
  wb: ExcelJS.Workbook,
  ident: IdentiteLiasse,
  referentiel: string,
  systeme: string,
  prerempli: Partial<Record<string, string>> = {},
  pageRef = 'FICHE 1',
) {
  const ws = wb.addWorksheet('Fiche 1');
  const NB = 10;
  ecrireCartouche(ws, ident, pageRef, NB);
  fusion(ws, 7, 1, 7, NB);
  let c = ws.getCell(7, 1);
  c.value = "FICHE D'IDENTIFICATION ET RENSEIGNEMENTS DIVERS";
  c.font = { name: 'Arial', size: 11, bold: true, color: argb(C_SECTION) };
  c.alignment = AL_CENTRE;
  fusion(ws, 8, 1, 8, NB);
  c = ws.getCell(8, 1);
  c.value = `${referentiel} - ${systeme}`;
  c.font = { name: 'Arial', size: 9, bold: true };
  c.alignment = AL_CENTRE;
  const ex = (ident.exercice ?? '').trim();
  const annee = /^\d{4}$/.test(ex) ? ex : '';
  const champs: Array<[string, string, string]> = [
    ['ZA', 'EXERCICE COMPTABLE', `DU : ${annee ? `01-01-${annee}` : ''}    AU : ${annee ? `31-12-${annee}` : ex}`],
    ['ZB', "DATE D'ARRETE EFFECTIF DES COMPTES", ''],
    ['ZC', 'EXERCICE PRECEDENT CLOS LE', ''],
    ['ZD', "DUREE DE L'EXERCICE PRECEDENT (EN MOIS)", ''],
    // Une entité SYCEBNL n'a pas de RCCM (AUDCG art. 2 et 35) · la case du
    // modèle cite les registres possibles, l'appelant remplit ce qui vaut
    // pour SON entité (arrêté de personnalité juridique, décret...).
    ['ZE', "N° REGISTRE (RCCM, F92, CONVENTION...) ET GREFFE", ''],
    ['ZF', 'N° REPERTOIRE DES ENTITES', ''],
    ['ZG', 'N° DE CAISSE SOCIALE', ''],
    ['ZH', 'N° CODE IMPORTATEUR', ''],
    ['ZI', 'CODE ACTIVITE PRINCIPALE', ''],
    ['ZJ', "DESIGNATION DE L'ENTITE ET SIGLE", `${ident.entite}${ident.sigle ? `  (${ident.sigle})` : ''}`.trim()],
    ['ZK', 'N° DE TELEPHONE, ADRESSE E-MAIL, BOITE POSTALE, VILLE', ''],
    ['ZL', 'ADRESSE GEOGRAPHIQUE COMPLETE (IMMEUBLE, RUE, QUARTIER, VILLE, PAYS)', ident.adresse],
    ['ZM', "DESIGNATION PRECISE DE L'ACTIVITE PRINCIPALE EXERCEE", ''],
    ['ZN', '% DE CAPACITE DE PRODUCTION UTILE', ''],
    ['ZO', 'NOM, ADRESSE, TELEPHONE, E-MAIL ET QUALITE DE LA PERSONNE A CONTACTER EN CAS DE DEMANDE', ''],
    ['ZP', 'NOM, ADRESSE, TELEPHONE ET E-MAIL DU SALARIE OU DU PROFESSIONNEL COMPTABLE AYANT ETABLI LES ETATS FINANCIERS', ''],
    ['ZQ', "NOM, ADRESSE, TELEPHONE, E-MAIL ET N° D'INSCRIPTION A L'ORDRE DE L'EXPERT-COMPTABLE AYANT DELIVRE L'ATTESTATION DE VISA", ''],
    ['ZR', "NOM, ADRESSE, TELEPHONE, E-MAIL ET N° D'INSCRIPTION DU COMMISSAIRE AUX COMPTES, LE CAS ECHEANT", ''],
    ['ZS', "ETATS FINANCIERS APPROUVES PAR L'ORGANE COMPETENT (OUI / NON)", ''],
    ['ZT', 'NOM DU SIGNATAIRE DES ETATS FINANCIERS', ''],
    ['ZU', 'QUALITE DU SIGNATAIRE DES ETATS FINANCIERS', ''],
    ['ZV', 'DATE DE SIGNATURE', ''],
    ['ZW', 'DOMICILIATIONS BANCAIRES (BANQUE ET NUMERO DE COMPTE)', ''],
  ];
  let r = 9;
  for (const [code, lab, defaut] of champs) {
    r += 1;
    c = ws.getCell(r, 1);
    c.value = code;
    c.font = { name: 'Arial', size: 8, bold: true };
    c.fill = fond(C_RUBRIQUE);
    c.alignment = AL_CENTRE;
    c.border = B_FIN;
    fusion(ws, r, 2, r, 6);
    c = ws.getCell(r, 2);
    c.value = lab;
    c.font = { name: 'Arial', size: 8 };
    c.alignment = AL_GAUCHE;
    fusion(ws, r, 7, r, NB);
    c = ws.getCell(r, 7);
    c.value = prerempli[code] ?? defaut;
    c.font = { name: 'Arial', size: 8, bold: true };
    c.alignment = AL_GAUCHE;
    for (let cc = 2; cc <= NB; cc++) ws.getCell(r, cc).border = { bottom: FILET };
    ws.getRow(r).height = 24;
  }
  r += 2;
  fusion(ws, r, 2, r, 5);
  ws.getCell(r, 2).value = 'Signature';
  ws.getCell(r, 2).font = { name: 'Arial', size: 8 };
  for (let cc = 2; cc < 6; cc++) ws.getCell(r, cc).border = { top: FIN };
  largeurs(ws, { A: 5, B: 12, C: 12, D: 12, E: 12, F: 12, G: 11, H: 11, I: 11, J: 11 });
  return ws;
}

/** Fiche 2 : tableau de l'équipe / des dirigeants de l'entité. */
export function construireFiche2(
  wb: ExcelJS.Workbook,
  ident: IdentiteLiasse,
  sousTitre: string,
  dirigeants: Array<{ nom: string; qualite: string; nif?: string }> = [],
  pageRef = 'FICHE 2',
  lignes = 20,
) {
  const ws = wb.addWorksheet('Fiche 2');
  const NB = 10;
  ecrireCartouche(ws, ident, pageRef, NB);
  fusion(ws, 7, 1, 7, NB);
  let c = ws.getCell(7, 1);
  c.value = "FICHE D'IDENTIFICATION ET RENSEIGNEMENTS DIVERS";
  c.font = { name: 'Arial', size: 12, bold: true, color: argb(C_SECTION) };
  c.alignment = AL_CENTRE;
  fusion(ws, 8, 1, 8, NB);
  c = ws.getCell(8, 1);
  c.value = sousTitre;
  c.font = { name: 'Arial', size: 11, bold: true };
  c.alignment = AL_CENTRE;
  const entetes: Array<[string, number, number]> = [
    ['Nom et Prénoms', 1, 2],
    ['Nationalité', 3, 3],
    ['Autres nationalités (à préciser) (2)', 4, 4],
    ['Qualité', 5, 5],
    ["N° d'identification fiscale", 6, 7],
    ['Adresse (BP, ville, pays, adresse géographique et adresse e-mail)', 8, 10],
  ];
  let r = 10;
  for (const [lab, c1, c2] of entetes) {
    fusion(ws, r, c1, r, c2);
    ws.getCell(r, c1).value = lab;
  }
  entetesBande(ws, r, r, 1, NB);
  ws.getRow(r).height = 34;
  for (let i = 0; i < Math.max(lignes, dirigeants.length); i++) {
    r += 1;
    ws.getRow(r).height = 26;
    for (const [, c1, c2] of entetes) fusion(ws, r, c1, r, c2);
    const d = dirigeants[i];
    if (d) {
      ws.getCell(r, 1).value = d.nom;
      ws.getCell(r, 1).font = F_DONNEE;
      ws.getCell(r, 5).value = d.qualite;
      ws.getCell(r, 5).font = F_DONNEE;
      if (d.nif) {
        ws.getCell(r, 6).value = d.nif;
        ws.getCell(r, 6).font = F_DONNEE;
      }
    }
    for (let cc = 1; cc <= NB; cc++) ws.getCell(r, cc).border = B_FIN;
  }
  r += 2;
  c = ws.getCell(r, 1);
  c.value = '(2) Mentionner les autres nationalités le cas échéant.';
  c.font = { name: 'Arial', size: 8 };
  largeurs(ws, { A: 12, B: 16, C: 13, D: 13, E: 13, F: 8, G: 8, H: 11, I: 11, J: 11 });
  return ws;
}

// ---------------------------------------------------------------------------
// Feuilles de balance et CONTROLE BALANCE
// ---------------------------------------------------------------------------

/** Une ligne de balance à six colonnes de soldes. */
export interface LigneBalanceLiasse {
  compte: string;
  libelle: string;
  ouvertureDebit: number;
  ouvertureCredit: number;
  mouvementDebit: number;
  mouvementCredit: number;
  clotureDebit: number;
  clotureCredit: number;
}

export const ENTETES_BALANCE = [
  'Compte',
  'Intitulé',
  "Solde d'ouverture débit",
  "Solde d'ouverture crédit",
  'Mouvement débit',
  'Mouvement crédit',
  'Solde de clôture débit',
  'Solde de clôture crédit',
];

/** Feuille de balance du modèle : comptes croissants, trois blocs de soldes,
 *  TOTAL GENERAL par bloc et ligne de contrôle d'équilibre. */
export function ecrireFeuilleBalance(wb: ExcelJS.Workbook, nom: string, lignes: LigneBalanceLiasse[]) {
  const ws = wb.addWorksheet(nom);
  const nb = ENTETES_BALANCE.length;
  for (const [i, h] of ENTETES_BALANCE.entries()) ws.getCell(1, i + 1).value = h;
  entetesBande(ws, 1, 1, 1, nb);
  ws.getRow(1).height = 30;
  const montants = [3, 4, 5, 6, 7, 8];
  let r = 1;
  for (const l of [...lignes].sort((a, b) => a.compte.localeCompare(b.compte))) {
    r += 1;
    ws.getCell(r, 1).value = l.compte;
    ws.getCell(r, 2).value = l.libelle;
    ws.getCell(r, 3).value = arrondi(l.ouvertureDebit);
    ws.getCell(r, 4).value = arrondi(l.ouvertureCredit);
    ws.getCell(r, 5).value = arrondi(l.mouvementDebit);
    ws.getCell(r, 6).value = arrondi(l.mouvementCredit);
    ws.getCell(r, 7).value = arrondi(l.clotureDebit);
    ws.getCell(r, 8).value = arrondi(l.clotureCredit);
    styleLigne(ws, r, 1, nb, 'normal', montants);
  }
  const fin = r;
  r += 1;
  ws.getCell(r, 2).value = 'TOTAL GENERAL';
  for (let c = 3; c <= nb; c++) {
    const lettre = String.fromCharCode(64 + c);
    ws.getCell(r, c).value = fin >= 2 ? { formula: `SUM(${lettre}2:${lettre}${fin})` } : 0;
  }
  styleLigne(ws, r, 1, nb, 'general', montants);
  ws.getRow(r).height = 20;
  r += 1;
  ws.getCell(r, 2).value = "Contrôle d'équilibre par solde (débit - crédit, doit être 0)";
  for (const c of [3, 5, 7]) {
    const d = String.fromCharCode(64 + c);
    const cr = String.fromCharCode(64 + c + 1);
    ws.getCell(r, c).value = { formula: `${d}${r - 1}-${cr}${r - 1}` };
  }
  styleLigne(ws, r, 1, nb, 'inter', montants);
  largeurs(ws, { A: 12, B: 42, C: 16.5, D: 16.5, E: 16.5, F: 16.5, G: 16.5, H: 16.5 });
  ws.views = [{ state: 'frozen', ySplit: 1, showGridLines: true }];
  return ws;
}

function arrondi(v: number): number {
  return Math.round((v ?? 0) * 100) / 100;
}

/** Feuille CONTROLE BALANCE : totaux des trois blocs de soldes de chaque
 *  balance et verdict Equilibre / Déséquilibre par bloc. */
export function construireControleBalance(wb: ExcelJS.Workbook, avecN1: boolean, nLignes: number, nLignesN1: number) {
  const ws = wb.addWorksheet('CONTROLE BALANCE');
  masquerQuadrillage(ws);
  largeurs(ws, { A: 22.5, B: 20.7, C: 20.7, D: 20.7, E: 20.7, F: 20.7, G: 20.7 });
  fusion(ws, 1, 1, 1, 7);
  const t = ws.getCell(1, 1);
  t.value = 'EQUILIBRE DE LA BALANCE';
  t.font = { name: 'Arial', size: 20, bold: true };
  t.alignment = AL_CENTRE;
  for (let cc = 1; cc < 8; cc++) ws.getCell(1, cc).fill = fond(C_CTRL_TITRE);
  ws.getRow(1).height = 26;

  const cols = ['C', 'D', 'E', 'F', 'G', 'H'];
  const bloc = (r0: number, nom: string, feuille: string, n: number) => {
    fusion(ws, r0, 1, r0 + 2, 1);
    let c = ws.getCell(r0, 1);
    c.value = nom;
    c.font = { name: 'Arial', size: 14, bold: true };
    c.fill = fond(C_GRIS);
    c.alignment = AL_CENTRE;
    const heads: Array<[string, string, boolean]> = [
      ["Solde d'ouverture Débit", cols[0], true],
      ["Solde d'ouverture Crédit", cols[1], true],
      ['Mouvements Débit', cols[2], false],
      ['Mouvements Crédit', cols[3], false],
      ['Solde de clôture Débit', cols[4], true],
      ['Solde de clôture Crédit', cols[5], true],
    ];
    for (const [i, [lab, lettre, vert]] of heads.entries()) {
      const cc = 2 + i;
      c = ws.getCell(r0, cc);
      c.value = lab;
      c.font = { name: 'Arial', size: 10, bold: true };
      c.alignment = AL_CENTRE;
      if (vert) c.fill = fond(C_CTRL_ENT);
      c.border = B_FIN;
      c = ws.getCell(r0 + 1, cc);
      c.value = { formula: `SUM(${q(feuille)}!${lettre}2:${lettre}${n})` };
      c.font = { name: 'Arial', size: 11, bold: true };
      c.fill = fond(C_GRIS);
      c.numFmt = '#,##0';
      c.border = B_DONNEE;
    }
    for (const [c1, c2] of [
      [2, 3],
      [4, 5],
      [6, 7],
    ] as const) {
      fusion(ws, r0 + 2, c1, r0 + 2, c2);
      const la = String.fromCharCode(64 + c1);
      const lb = String.fromCharCode(64 + c2);
      const rr = r0 + 1;
      c = ws.getCell(r0 + 2, c1);
      c.value = {
        formula: `IF(ROUND(${la}${rr}-${lb}${rr},0)=0,"Equilibre","Déséquilibre : écart de "&TEXT(${la}${rr}-${lb}${rr},"#,##0"))`,
      };
      c.font = F_VERDICT;
      c.alignment = AL_CENTRE;
      for (let cc = c1; cc <= c2; cc++) ws.getCell(r0 + 2, cc).border = B_DONNEE;
    }
    ws.getRow(r0).height = 50;
    ws.getRow(r0 + 1).height = 21;
    ws.getRow(r0 + 2).height = 54;
    cadre(ws, r0, 1, r0 + 2, 7, MOYEN);
  };

  bloc(2, 'BALANCE N', NOM_BALANCE, Math.max(2, nLignes + 1));
  if (avecN1) bloc(5, 'BALANCE N-1', NOM_BALANCE_N1, Math.max(2, nLignesN1 + 1));
  return ws;
}

// ---------------------------------------------------------------------------
// NOTES ANNEXES (fiche récapitulative) et TABLE COMMENTAIRE
// ---------------------------------------------------------------------------

export type PartiesNotes = Array<[string, Array<[string, string]>]>;

/** Feuille NOTES ANNEXES : fiche récapitulative des notes présentées. */
export function construireFicheNotes(
  wb: ExcelJS.Workbook,
  parties: PartiesNotes,
  ident: IdentiteLiasse,
  applicables?: ReadonlySet<string>,
  pageRef = 'NOTES ANNEXES',
  notePied?: string,
) {
  const ws = wb.addWorksheet('NOTES ANNEXES');
  const NB = 10;
  ecrireCartouche(ws, ident, pageRef, NB);
  fusion(ws, 7, 1, 7, NB);
  let c = ws.getCell(7, 1);
  c.value = 'FICHE RECAPITULATIVE NOTES ANNEXES PRESENTEES (1)';
  c.font = F_TITRE_NOTE;
  c.alignment = AL_CENTRE;
  ws.getRow(7).height = 22;
  let r = 8;
  ws.getCell(r, 1).value = 'NOTES';
  fusion(ws, r, 2, r, 8);
  ws.getCell(r, 2).value = 'INTITULES';
  ws.getCell(r, 9).value = 'A (2)';
  ws.getCell(r, 10).value = 'N/A (2)';
  entetesBande(ws, r, r, 1, NB);
  ws.getRow(r).height = 19;
  for (const [titrePartie, lignes] of parties) {
    r += 1;
    fusion(ws, r, 1, r, NB);
    c = ws.getCell(r, 1);
    c.value = titrePartie;
    c.font = { name: 'Arial', size: 10, bold: true };
    c.alignment = AL_CENTRE;
    for (let cc = 1; cc <= NB; cc++) {
      ws.getCell(r, cc).fill = fond(C_GRIS);
      ws.getCell(r, cc).border = B_FIN;
    }
    ws.getRow(r).height = 16;
    for (const [numero, intitule] of lignes) {
      r += 1;
      c = ws.getCell(r, 1);
      c.value = numero;
      c.font = { name: 'Arial', size: 10 };
      c.alignment = AL_CENTRE;
      fusion(ws, r, 2, r, 8);
      c = ws.getCell(r, 2);
      c.value = intitule;
      c.font = { name: 'Arial', size: 10 };
      c.alignment = AL_GAUCHE;
      if (applicables) {
        const colonne = applicables.has(numero) ? 9 : 10;
        c = ws.getCell(r, colonne);
        c.value = 'X';
        c.font = { name: 'Arial', size: 10, bold: true };
        c.alignment = AL_CENTRE;
      }
      for (let cc = 1; cc <= NB; cc++) ws.getCell(r, cc).border = B_FIN;
    }
  }
  r += 2;
  fusion(ws, r, 1, r, NB);
  c = ws.getCell(r, 1);
  c.value =
    notePied ??
    '(1) Les notes non documentées ne doivent pas être jointes aux états financiers ; dans une note, les lignes non chiffrées doivent être supprimées.';
  c.font = { name: 'Arial', size: 8 };
  c.alignment = AL_GAUCHE;
  ws.getRow(r).height = 30;
  r += 1;
  fusion(ws, r, 1, r, NB);
  c = ws.getCell(r, 1);
  c.value = '(2) A : applicable ; N/A : non applicable. Cocher la colonne correspondante pour chaque note.';
  c.font = { name: 'Arial', size: 8 };
  c.alignment = AL_GAUCHE;
  largeurs(ws, { A: 11.5, B: 19, C: 10, D: 8, E: 17, F: 9.5, G: 8, H: 21.5, I: 6.3, J: 6.3 });
  return ws;
}

/** Feuille TABLE COMMENTAIRE : référence de chaque note (case grise) et zone
 *  haute de commentaire libre, bandes de parties lilas, blocs par page. */
export function construireTableCommentaires(wb: ExcelJS.Workbook, parties: PartiesNotes, ident: IdentiteLiasse, parPage = 4) {
  const ws = wb.addWorksheet('TABLE COMMENTAIRE');
  masquerQuadrillage(ws);
  const NB = 8;
  largeurs(ws, { A: 11.2, B: 14.8, C: 11.5, D: 19.8, E: 14.5, F: 10.3, G: 13.5, H: 6.3 });
  const plates: Array<[string | null, string, string]> = [];
  for (const [titrePartie, lignes] of parties) {
    let premier = true;
    for (const [numero, intitule] of lignes) {
      plates.push([premier ? titrePartie : null, numero, intitule]);
      premier = false;
    }
  }
  const nbPages = Math.max(1, Math.ceil(plates.length / parPage));
  let r = 1;
  let page = 0;
  for (const [i, [partie, numero, intitule]] of plates.entries()) {
    if (i % parPage === 0) {
      page += 1;
      fusion(ws, r, 1, r, 6);
      let c = ws.getCell(r, 1);
      c.value = 'TABLE DES COMMENTAIRES';
      c.font = { name: 'Arial', size: 11, bold: true, color: argb(C_SECTION) };
      c.alignment = AL_CENTRE;
      fusion(ws, r, 7, r, 8);
      c = ws.getCell(r, 7);
      c.value = `COMMENTAIRES\nPAGE ${page}/${nbPages}`;
      c.font = F_PAGE_REF;
      c.alignment = AL_CENTRE;
      for (let cc = 7; cc < 9; cc++) ws.getCell(r, cc).border = { top: FIN, bottom: FIN, left: FIN };
      ws.getRow(r).height = 26;
      const petits: Array<[number, number, string]> = [
        [r + 1, 1, `Dénomination sociale : ${ident.entite}`],
        [r + 2, 1, `Adresse : ${ident.adresse}`],
        [r + 2, 6, `Sigle usuel : ${ident.sigle}`],
        [r + 3, 1, `N° d'identification fiscale (NIF) : ${ident.nif}`],
        [r + 3, 5, texteExercice(ident.exercice)],
        [r + 3, 7, `Durée (en mois) : ${ident.duree}`],
        [r + 4, 1, `N° de télédéclarant (NTD) : ${ident.ntd}`],
      ];
      for (const [rr, cc, texte] of petits) {
        c = ws.getCell(rr, cc);
        c.value = texte;
        c.font = { name: 'Arial', size: 8 };
      }
      r += 5;
    }
    if (partie) {
      fusion(ws, r, 1, r, NB);
      const c = ws.getCell(r, 1);
      c.value = partie;
      c.font = { name: 'Arial Black', size: 10, bold: true };
      c.alignment = AL_CENTRE;
      for (let cc = 1; cc <= NB; cc++) {
        ws.getCell(r, cc).fill = fond(C_PARTIE_TC);
        ws.getCell(r, cc).border = { bottom: FIN };
      }
      ws.getRow(r).height = 17;
      r += 1;
    }
    let c = ws.getCell(r, 1);
    c.value = numero;
    c.font = { name: 'Arial', size: 8 };
    c.fill = fond(C_GRIS);
    c.alignment = AL_CENTRE;
    c.border = B_FIN;
    fusion(ws, r, 2, r, NB);
    c = ws.getCell(r, 2);
    c.value = intitule;
    c.font = { name: 'Arial', size: 8, bold: true };
    c.alignment = AL_GAUCHE;
    for (let cc = 2; cc <= NB; cc++) ws.getCell(r, cc).border = B_FIN;
    ws.getRow(r).height = 16;
    r += 1;
    fusion(ws, r, 1, r, NB);
    for (let cc = 1; cc <= NB; cc++) ws.getCell(r, cc).border = B_FIN;
    ws.getCell(r, 1).alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
    ws.getRow(r).height = 110;
    r += 1;
  }
  return ws;
}

// ---------------------------------------------------------------------------
// Bilan paysage (actif et passif côte à côte)
// ---------------------------------------------------------------------------

export interface CoteBilanPaysage {
  /** Nom de la feuille source (Bilan-Actif / Bilan-Passif). */
  feuille: string;
  libelle: 'ACTIF' | 'PASSIF';
  /** Colonnes de montants : en-tête affiché et lettre de la colonne source. */
  cols: Array<{ entete: string; lettre: string }>;
  /** Lignes à reprendre : rang dans la feuille source et niveau visuel. */
  lignes: Array<{ ref: string; libelle: string; note: string; rangSource: number; niveau: NiveauLigne }>;
}

/** Bilan sur une page : actif à gauche, passif à droite, chaque montant en
 *  LIEN vers la feuille du bilan (aucune re-saisie). */
export function construireBilanPaysage(
  wb: ExcelJS.Workbook,
  ident: IdentiteLiasse,
  coteActif: CoteBilanPaysage,
  cotePassif: CoteBilanPaysage,
  titre = 'BILAN',
  nom = 'Bilan paysage',
) {
  const ws = wb.addWorksheet(nom);
  const nca = coteActif.cols.length;
  const ncp = cotePassif.cols.length;
  const ca0 = 1;
  const cp0 = 3 + nca + 1;
  const colMax = cp0 + 2 + ncp;
  ecrireCartouche(ws, ident, `${titre}\nPAGE 1/1`, colMax);
  titreEtat(ws, titre, 3, colMax - 2, 7, 16);

  const entetesCote = (c0: number, cote: CoteBilanPaysage) => {
    ws.getCell(8, c0).value = 'REF';
    ws.getCell(8, c0 + 1).value = cote.libelle;
    ws.getCell(8, c0 + 2).value = 'NOTE';
    fusion(ws, 8, c0, 9, c0);
    fusion(ws, 8, c0 + 1, 9, c0 + 1);
    fusion(ws, 8, c0 + 2, 9, c0 + 2);
    for (const [i, col] of cote.cols.entries()) {
      ws.getCell(8, c0 + 3 + i).value = col.entete;
      fusion(ws, 8, c0 + 3 + i, 9, c0 + 3 + i);
    }
    entetesBande(ws, 8, 9, c0, c0 + 2 + cote.cols.length);
  };
  entetesCote(ca0, coteActif);
  entetesCote(cp0, cotePassif);
  ws.getRow(8).height = 24;
  ws.getRow(9).height = 24;

  const ecrireCote = (c0: number, cote: CoteBilanPaysage): number => {
    const qsrc = q(cote.feuille);
    let rOut = 10;
    for (const l of cote.lignes) {
      ws.getCell(rOut, c0).value = l.ref;
      const c = ws.getCell(rOut, c0 + 1);
      c.value = l.libelle;
      c.alignment = AL_GAUCHE;
      ws.getCell(rOut, c0 + 2).value = l.note;
      const monts: number[] = [];
      for (const [i, col] of cote.cols.entries()) {
        const cc = c0 + 3 + i;
        ws.getCell(rOut, cc).value = { formula: `${qsrc}!${col.lettre}${l.rangSource}` };
        monts.push(cc);
      }
      styleLigne(ws, rOut, c0, c0 + 2 + cote.cols.length, l.niveau, monts, c0);
      ws.getRow(rOut).height = 18;
      rOut += 1;
    }
    return rOut;
  };
  const finA = ecrireCote(ca0, coteActif);
  const finP = ecrireCote(cp0, cotePassif);
  cadre(ws, 8, ca0, Math.max(finA, finP) - 1, ca0 + 2 + nca, MOYEN);
  cadre(ws, 8, cp0, Math.max(finA, finP) - 1, cp0 + 2 + ncp, MOYEN);
  const lettre = (n: number) => String.fromCharCode(64 + n);
  const spec: Record<string, number> = {
    [lettre(ca0)]: 5,
    [lettre(ca0 + 1)]: 34,
    [lettre(ca0 + 2)]: 6,
    [lettre(cp0)]: 5,
    [lettre(cp0 + 1)]: 34,
    [lettre(cp0 + 2)]: 6,
  };
  for (let i = 0; i < nca; i++) spec[lettre(ca0 + 3 + i)] = 13.5;
  for (let i = 0; i < ncp; i++) spec[lettre(cp0 + 3 + i)] = 13.5;
  largeurs(ws, spec);
  return ws;
}

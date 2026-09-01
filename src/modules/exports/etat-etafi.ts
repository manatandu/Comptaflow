import * as ExcelJS from 'exceljs';
import {
  AL_GAUCHE,
  cadre,
  ecrireCartouche,
  entetesBande,
  F_DONNEE,
  fusion,
  IdentiteLiasse,
  largeurs,
  MOYEN,
  NiveauLigne,
  styleLigne,
  titreEtat,
} from './theme-etafi';

/**
 * FEUILLES D'ÉTAT « ETAFI » · la disposition commune des états financiers du
 * modèle (`monter_etats_sycebnl.py`, `construire_etat`) :
 *
 *   lignes 1-6   cartouche d'identification
 *   ligne 7      titre en Arial Black vert, filet moyen
 *   lignes 8-9   bandeau d'en-têtes CCFFFF sur deux lignes
 *   lignes 10+   REF | LIBELLÉ | NOTE | montants · une hauteur de 22,
 *                niveaux de lignes du modèle (rubrique / inter / section /
 *                general), case REF blanche et centrée
 *   pied         cadre extérieur moyen autour du tableau
 *
 * Les MONTANTS de détail sont posés en VALEURS (celles que le serveur a
 * calculées · elles portent les clauses « sauf » et les qualificatifs de
 * sens que des SUMIF de préfixes ne savent pas exprimer) ; les TOTAUX sont
 * posés en FORMULES de somme de leurs composantes, comme dans le modèle :
 * la hiérarchie se vérifie dans Excel, et un total ne peut pas diverger de
 * ses lignes.
 */

/** En-tête de colonne de montants · un groupe (ligne 8) et ses sous-titres (ligne 9). */
export interface GroupeColonnes {
  titre: string;
  sousTitres: string[];
}

export interface LigneEtatEtafi {
  ref: string;
  libelle: string;
  note: string;
  niveau: NiveauLigne;
  /**
   * Une valeur par colonne de montants · null laisse la cellule vide, et
   * `{ formule }` pose une formule où « {r} » est remplacé par le rang de la
   * ligne (le NET du bilan actif s'écrit `D{r}-E{r}`, comme dans le modèle).
   */
  montants: Array<number | { formule: string } | null>;
}

/**
 * TOTAUX du jeu associations (Partie 4, ch. 2) · chaque total est la somme
 * de ses composantes, réécrite en formule Excel ligne à ligne.
 */
export const TOTAUX_ASSOCIATIONS: Record<string, string> = {
  AA: 'AB+AC',
  AD: 'AE+AF+AG',
  AH: 'AI+AJ+AK+AL+AM+AN',
  AO: 'AX+AY',
  AZ: 'AA+AD+AH+AO',
  BT: 'BA+BB+BC+BD+BE',
  BX: 'BU+BV+BW',
  BZ: 'AZ+BT+BX+BY',
  CK: 'CA+CB+CC+CD+CE+CF+CG+CH+CI+CJ',
  CY: 'CW+CX',
  CZ: 'CK+CY',
  DD: 'DA+DB+DC',
  DE: 'CZ+DD',
  DV: 'DF+DG+DH+DI',
  DX: 'DW',
  DZ: 'DE+DV+DX+DY',
  XA: 'RA+RB+RC+RD+RE+RF+RG+RH',
  XB: 'TA+TB+TC+TD+TE+TF+TG+TH+TI+TJ+TK+TL',
  // Le serveur présente les charges en POSITIF, « dans leur sens naturel de
  // lecture, comme l'état officiel » (correspondance-compte-resultat.ts).
  // Les formules officielles se lisent donc littéralement : XC = XA - XB,
  // XD = TM - TN. (Le moteur Python du skill stocke lui tout en net
  // créditeur et additionne · même arithmétique, autre convention.)
  XC: 'XA-XB',
  XD: 'TM-TN',
  XE: 'XC+XD',
};

/** Niveau visuel de chaque ligne remarquable (bilan et compte de résultat). */
export const NIVEAUX_ETAT_ASSOCIATIONS: Record<string, NiveauLigne> = {
  AA: 'rubrique',
  AD: 'rubrique',
  AH: 'rubrique',
  AO: 'inter',
  AZ: 'section',
  BT: 'section',
  BX: 'section',
  BZ: 'general',
  CK: 'inter',
  CY: 'inter',
  CZ: 'inter',
  DD: 'inter',
  DE: 'section',
  DV: 'section',
  DX: 'section',
  DZ: 'general',
  XA: 'section',
  XB: 'section',
  XC: 'inter',
  XD: 'inter',
  XE: 'section',
};

/**
 * Renvois de notes du tableau de correspondance officiel (colonne « note »
 * de `correspondance-associations.tsv` du skill), tels que le modèle les
 * affiche · les renvois trop longs pour la colonne restent vides, comme
 * dans le modèle.
 */
export const NOTE_PAR_REF_ASSOCIATIONS: Record<string, string> = {
  AA: 'note 5',
  AD: 'note 5',
  AE: 'note 5F',
  AH: 'note 5',
  AO: 'note 6',
  BA: 'note 7',
  BB: 'note 8',
  BC: 'note 19',
  BD: 'note 9',
  BE: 'note 10',
  BU: 'note 11',
  BV: 'note 12',
  BW: 'note 13',
  BY: 'note 14',
  CA: 'note 15',
  CB: 'note 15',
  CC: 'note 15',
  CD: 'note 15',
  CE: 'note 5F',
  CF: 'note 16',
  CG: 'note 16',
  CI: 'note 17A',
  CJ: 'note 17A',
  CW: 'note 17B',
  CX: 'note 17B',
  DA: 'note 18A',
  DB: 'note 18A',
  DC: 'note 18A',
  DF: 'note 7',
  DG: 'note 9',
  DH: 'note 19',
  DI: 'note 20 et 21',
  DW: 'note 22',
  DY: 'note 14',
  RA: 'note 23',
  RB: 'note 23',
  RC: 'note 23',
  RD: 'note 23',
  RE: 'note 23',
  RF: 'note 23',
  RG: 'note 23',
  RH: 'note 5D et 30',
  TA: 'note 24',
  TB: 'note 8',
  TC: 'note 24',
  TD: 'note 24',
  TE: 'note 8',
  TF: 'note 25',
  TG: 'note 26',
  TH: 'note 27',
  TI: 'note 28',
  TJ: 'note 29',
  TK: 'note 31',
  TL: 'note 5D et 30',
  TM: 'note 32',
  TN: 'note 32',
};

/** Colonne des repères du TFT (« Rep. ») et niveaux de ses lignes clefs. */
export const REP_TFT: Record<string, string> = { ZA: 'A', ZB: 'B', ZC: 'C', ZD: 'D', ZE: 'E', ZF: 'G', ZG: 'H' };
export const NIVEAUX_TFT: Record<string, NiveauLigne> = {
  ZA: 'cle',
  ZB: 'section',
  ZC: 'section',
  ZD: 'inter',
  ZE: 'inter',
  ZF: 'cle',
  ZG: 'cle',
};

const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface OptionsFeuilleEtat {
  nom: string;
  titre: string;
  /** 16 pour un bilan, 14 pour les autres · règle du modèle. */
  taille?: number;
  ident: IdentiteLiasse;
  pageRef?: string;
  /** Intitulé de la colonne B : ACTIF, PASSIF ou LIBELLES. */
  libelleColonne: string;
  groupes: GroupeColonnes[];
  lignes: LigneEtatEtafi[];
  /** Totaux en formules · ref -> expression sur les REF (« AB+AC », « XA-XB »). */
  totaux?: Record<string, string>;
  largeurLibelle?: number;
}

/** Construit une feuille d'état à la disposition exacte du modèle et rend la
 *  correspondance ref -> rang de ligne (pour les liens du Bilan paysage). */
export function construireFeuilleEtat(wb: ExcelJS.Workbook, options: OptionsFeuilleEtat): Map<string, number> {
  const ws = wb.addWorksheet(options.nom);
  const nbMontants = options.groupes.reduce((n, g) => n + g.sousTitres.length, 0);
  const ncols = 3 + nbMontants;
  ecrireCartouche(ws, options.ident, options.pageRef ?? options.titre, ncols);
  titreEtat(ws, options.titre, 2, ncols - 1, 7, options.taille ?? 14);

  ws.getCell(8, 1).value = 'REF';
  ws.getCell(8, 2).value = options.libelleColonne;
  ws.getCell(8, 3).value = 'NOTE';
  for (const c of [1, 2, 3]) fusion(ws, 8, c, 9, c);
  let colonne = 4;
  for (const groupe of options.groupes) {
    const debut = colonne;
    ws.getCell(8, debut).value = groupe.titre;
    if (groupe.sousTitres.length > 1) fusion(ws, 8, debut, 8, debut + groupe.sousTitres.length - 1);
    for (const sous of groupe.sousTitres) {
      ws.getCell(9, colonne).value = sous;
      colonne += 1;
    }
  }
  entetesBande(ws, 8, 9, 1, ncols);
  ws.getRow(8).height = 22;
  ws.getRow(9).height = 22;
  ws.getCell(8, 2).font = { name: 'Arial Black', size: 11, bold: true };

  let r = 9;
  const colsMontant = Array.from({ length: nbMontants }, (_, i) => 4 + i);
  const refVersRang = new Map<string, number>();
  for (const ligne of options.lignes) {
    r += 1;
    refVersRang.set(ligne.ref, r);
    ws.getCell(r, 1).value = ligne.ref;
    ws.getCell(r, 2).value = ligne.libelle;
    ws.getCell(r, 3).value = ligne.note;
    const estTotal = Boolean(options.totaux?.[ligne.ref]);
    if (!estTotal) {
      for (const [i, montant] of ligne.montants.entries()) {
        if (montant === null || montant === undefined) continue;
        ws.getCell(r, 4 + i).value =
          typeof montant === 'number' ? montant : { formula: montant.formule.replace(/\{r\}/g, String(r)) };
      }
    }
    styleLigne(ws, r, 1, ncols, ligne.niveau, colsMontant, 1);
    ws.getCell(r, 3).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(r).height = 22;
  }

  // Formules de totalisation, colonne par colonne de montants. L'expression
  // est écrite sur les REF (« AB+AC ») · chaque REF se substitue par sa
  // cellule dans la colonne courante, et une composante absente de l'état
  // vaut 0 (un jeu réduit ne doit pas produire une formule cassée).
  for (const [ref, expression] of Object.entries(options.totaux ?? {})) {
    const rang = refVersRang.get(ref);
    if (!rang) continue;
    for (const col of colsMontant) {
      const lettre = LETTRES[col - 1];
      const formule = expression.replace(/[A-Z]{2}/g, (composante) => {
        const rr = refVersRang.get(composante);
        return rr ? `${lettre}${rr}` : '0';
      });
      ws.getCell(rang, col).value = { formula: formule };
    }
  }

  cadre(ws, 8, 1, r, ncols, MOYEN);
  const spec: Record<string, number> = { A: 5.5, B: options.largeurLibelle ?? 52, C: 6.5 };
  for (const col of colsMontant) spec[LETTRES[col - 1]] = 15.7;
  largeurs(ws, spec);
  ws.views = [{ state: 'frozen', ySplit: 9, showGridLines: false }];
  return refVersRang;
}

/** Petite ligne de contrôle sous le cadre d'un état individuel · Arial 8. */
export function ligneControleSousEtat(ws: ExcelJS.Worksheet, rang: number, texte: string) {
  const c = ws.getCell(rang, 1);
  c.value = texte;
  c.font = { ...F_DONNEE, size: 8, italic: true };
  c.alignment = AL_GAUCHE;
}

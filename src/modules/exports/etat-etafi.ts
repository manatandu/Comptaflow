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
import {
  POSTES_ACTIF_SYSCOHADA,
  POSTES_PASSIF_SYSCOHADA,
  TOTAUX_ACTIF_SYSCOHADA,
  TOTAUX_PASSIF_SYSCOHADA,
} from '../etats-financiers-syscohada/correspondance-bilan-syscohada';
import {
  POSTES_COMPTE_RESULTAT_SYSCOHADA,
  resoudreRenvoiNote,
  SOLDES_INTERMEDIAIRES,
} from '../etats-financiers-syscohada/correspondance-compte-resultat-syscohada';
import { TOTAUX_FLUX_SYSCOHADA } from '../etats-financiers-syscohada/correspondance-tft-syscohada';

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
  /**
   * Clé UNIQUE de la ligne quand le ref affiché ne l'est pas · le compte
   * d'exploitation des projets porte deux TJ et deux TK (doublon du texte
   * officiel, signalé `[texte officiel]` dans le skill) : les formules de
   * totaux se nouent sur la clé, l'écran montre le ref.
   */
  cle?: string;
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
    refVersRang.set(ligne.cle ?? ligne.ref, r);
    ws.getCell(r, 1).value = ligne.ref;
    ws.getCell(r, 2).value = ligne.libelle;
    ws.getCell(r, 3).value = ligne.note;
    const estTotal = Boolean(options.totaux?.[ligne.cle ?? ligne.ref]);
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
      // [A-Z]{2}\d? · les clés TJ2/TK2 du compte d'exploitation des projets
      // portent un chiffre : sans lui, « TJ2 » se lirait « TJ » suivi d'un 2.
      const formule = expression.replace(/[A-Z]{2}[0-9]?/g, (composante) => {
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

// ---------------------------------------------------------------------------
// Jeu « projets de développement et assimilés » (Partie 4, ch. 3)
// ---------------------------------------------------------------------------

/** Totaux du bilan projet (présenté EN NET · pas de colonne amortissements). */
export const TOTAUX_PROJETS_BILAN: Record<string, string> = {
  AZ: 'AA+AB+AC+AD+AE+AF+AG+AH',
  BF: 'BA+BB+BC+BD+BE',
  BX: 'BV+BW',
  BZ: 'AZ+BF+BX+BY',
  CZ: 'CA+CB+CC+CD',
  DC: 'DA+DB',
  DD: 'CZ+DC',
  DJ: 'DE+DF+DG+DH+DI',
  DX: 'DW',
  DZ: 'DD+DJ+DX+DY',
};

/**
 * Totaux du compte d'exploitation · les charges sont servies en POSITIF par
 * le serveur (même convention que le jeu associations), donc XC = XA - XB.
 * TJ2/TK2 sont les CLÉS des deux lignes au ref dupliqué du texte officiel.
 */
export const TOTAUX_PROJETS_CE: Record<string, string> = {
  XA: 'RA+RB+RC+RD+RE',
  XB: 'TA+TB+TC+TD+TG+TH+TI+TJ+TK+TJ2+TK2+TL',
  XC: 'XA-XB',
};

export const NIVEAUX_ETAT_PROJETS: Record<string, NiveauLigne> = {
  AZ: 'section',
  BF: 'section',
  BX: 'section',
  BZ: 'general',
  CZ: 'inter',
  DC: 'inter',
  DD: 'section',
  DJ: 'section',
  DX: 'section',
  DZ: 'general',
  XA: 'section',
  XB: 'section',
  XC: 'section',
};

/**
 * Renvois de notes du tableau de correspondance officiel du jeu projets
 * (`correspondance-projets.tsv` du skill) · indexés par CLÉ (TJ2/TK2 pour
 * les deux lignes au ref dupliqué).
 */
export const NOTE_PAR_CLE_PROJETS: Record<string, string> = {
  AA: '3A',
  AB: '3A',
  AC: '3A',
  AD: '3A',
  AE: '3A',
  AF: '3A',
  AG: '3A',
  AH: '3A',
  BA: '4',
  BB: '5',
  BC: '6',
  BD: '6',
  BE: '6',
  BV: '7',
  BW: '7',
  BY: '8',
  CA: '9',
  CD: '10',
  DA: '11',
  DB: '11',
  DE: '4',
  DF: '9',
  DG: '12',
  DH: '12',
  DW: '13',
  DY: '8',
  RA: '9 et 14',
  RB: '14',
  RC: '14',
  RD: '14',
  RE: '22',
  TA: '15',
  TB: '15',
  TC: '5',
  TD: '16',
  TG: '17',
  TH: '18',
  TI: '19',
  TJ: '20A',
  TK: '21',
  TJ2: '22',
  TK2: '23',
  TL: '23',
};

/** Totaux du tableau emplois-ressources · les expressions officielles. */
export const TOTAUX_TER: Record<string, string> = {
  GR: 'FA+FB+FC+FD',
  GS: 'FE+FF+FG+FH+FI+FJ+FK+FL',
  GT: 'FM+FN+FO+FP+FQ+FR+FS+FT',
  GU: 'GS+GT',
  GV: 'GR-GU',
  GW: 'FU+FV+FW',
  GX: 'GV+GW',
  GY: 'FX+FY+FZ',
  GZ: 'GX-GY',
};

export const NIVEAUX_TER: Record<string, NiveauLigne> = {
  GR: 'section',
  GS: 'inter',
  GT: 'inter',
  GU: 'section',
  GV: 'cle',
  GW: 'section',
  GX: 'cle',
  GY: 'section',
  GZ: 'general',
};

export const NIVEAUX_RECONCILIATION: Record<string, NiveauLigne> = { G: 'section', I: 'general' };


// ---------------------------------------------------------------------------
// Jeu SYSCOHADA révisé · Système normal (AUDCIF Titre IX)
// ---------------------------------------------------------------------------
//
// RIEN n'est repris du SYCEBNL ici : autres postes, autres codes, autres
// renvois de notes, autres articles. Seule la MISE EN PAGE est commune (la
// charte ETAFI et `construireFeuilleEtat` ci-dessus), comme le sont les
// aides techniques de `etats-financiers.communs.ts` et le moteur déclaratif
// de notes · CLAUDE.md §6.
//
// Les quatre tables qui suivent sont DÉRIVÉES des tables de correspondance
// SYSCOHADA, jamais retranscrites : un renvoi de note ou une formule de
// totalisation recopié ici vivrait sa vie et finirait par contredire l'état
// que le serveur calcule, sans qu'aucun test ne le voie. La source reste
// `correspondance-bilan-syscohada.ts`, `correspondance-compte-resultat-
// syscohada.ts` et `correspondance-tft-syscohada.ts`, qui portent chacune
// leur citation de l'AUDCIF et leur section ANOMALIES.


/**
 * TOTAUX du Système normal SYSCOHADA · bilan (AD, AI, AQ, AZ, BG, BK, BT, BZ
 * à l'actif ; CP, DD, DF, DP, DT, DZ au passif · AUDCIF Titre IX ch. 3
 * section 2) et soldes intermédiaires XA à XI (ch. 4 section 2).
 *
 * Chaque expression est la liste des `deRefs` de la table, jointe par « + ».
 * Ce sont des SOMMES et rien d'autre, y compris au compte de résultat :
 * « Les postes de charges (préfixe R) sont saisis en négatif ; les formules
 * de totalisation sont des sommes, jamais des différences. XA = TA + RA + RB,
 * avec RA et RB négatifs. […] ne jamais soustraire deux fois » (ch. 4
 * section 2, logique de signe). Le serveur sert les montants dans cette même
 * convention (`montantSigne` = crédit − débit, charge comprise), donc la
 * formule Excel se lit littéralement.
 *
 * C'est L'INVERSE de la convention du jeu associations SYCEBNL, où les
 * charges sont présentées en positif et où XC s'écrit « XA − XB » : ne pas
 * transposer une formule d'un jeu à l'autre.
 */
export const TOTAUX_SYSCOHADA: Record<string, string> = (() => {
  const table: Record<string, string> = {};
  for (const t of [...TOTAUX_ACTIF_SYSCOHADA, ...TOTAUX_PASSIF_SYSCOHADA]) table[t.ref] = t.deRefs.join('+');
  for (const s of SOLDES_INTERMEDIAIRES) table[s.ref] = s.deRefs.join('+');
  return table;
})();

/**
 * Niveau visuel de chaque ligne remarquable du bilan et du compte de résultat.
 *
 * La hiérarchie suit la GRAISSE du modèle officiel (ch. 3 et ch. 4 section 2,
 * qui impriment en gras les rubriques en capitales et toutes les lignes de
 * totalisation) :
 *  - `rubrique` · les rubriques en capitales du modèle, qu'elles totalisent
 *    (AD, AI, AQ, BG) ou qu'elles portent directement leurs comptes
 *    (AP, BA, BB, BU, DV) ;
 *  - `inter` · CP et DD, que DF additionne ; les soldes en cascade XA à XF
 *    et XH ;
 *  - `section` · les totaux de masse (AZ, BK, BT, DF, DP, DT) et XG, terme du
 *    « résultat courant » ;
 *  - `general` · BZ et DZ (« TOTAL GÉNÉRAL ») et XI (« RÉSULTAT NET »).
 */
export const NIVEAUX_ETAT_SYSCOHADA: Record<string, NiveauLigne> = {
  // Bilan · actif (ch. 3 section 2).
  AD: 'rubrique',
  AI: 'rubrique',
  AP: 'rubrique',
  AQ: 'rubrique',
  AZ: 'section',
  BA: 'rubrique',
  BB: 'rubrique',
  BG: 'rubrique',
  BK: 'section',
  BT: 'section',
  BU: 'rubrique',
  BZ: 'general',
  // Bilan · passif.
  CP: 'inter',
  DD: 'inter',
  DF: 'section',
  DP: 'section',
  DT: 'section',
  DV: 'rubrique',
  DZ: 'general',
  // Compte de résultat · les neuf lignes X* (ch. 4 section 2).
  XA: 'inter',
  XB: 'inter',
  XC: 'inter',
  XD: 'inter',
  XE: 'inter',
  XF: 'inter',
  XG: 'section',
  XH: 'inter',
  XI: 'general',
};

/**
 * Renvois de la colonne NOTE, tels que le modèle du ch. 3 (bilan) et du
 * ch. 4 (compte de résultat) les imprime · lus dans les tables, jamais
 * recopiés.
 *
 * Une seule transformation, et elle est prescrite par la table elle-même :
 * les renvois que le ch. 6 subdivise passent par `resoudreRenvoiNote`, si
 * bien que le « 27 » de RK s'imprime « 27A et 27B ». ANOMALIE DU TEXTE
 * OFFICIEL (n° 11 de `correspondance-compte-resultat-syscohada.ts`) : le
 * ch. 4 renvoie à une note « 27 » que le ch. 6 ne connaît pas, puisqu'il
 * n'a que 27A (charges de personnel) et 27B (effectifs, masse salariale).
 * Imprimer « 27 » pointerait sur une feuille absente du classeur.
 *
 * Le renvoi de CE reste « 3e », en minuscule : c'est ainsi que le ch. 3
 * l'imprime, « seul renvoi du bilan écrit en minuscule ». Transcrit tel
 * quel, pas normalisé en « 3E ».
 */
export const NOTE_PAR_REF_SYSCOHADA: Record<string, string> = (() => {
  const table: Record<string, string> = {};
  for (const p of [...POSTES_ACTIF_SYSCOHADA, ...POSTES_PASSIF_SYSCOHADA]) {
    if (p.note) table[p.ref] = p.note;
  }
  for (const t of [...TOTAUX_ACTIF_SYSCOHADA, ...TOTAUX_PASSIF_SYSCOHADA]) {
    if (t.note) table[t.ref] = t.note;
  }
  const renvois = (notes: readonly string[]) => notes.flatMap((n) => resoudreRenvoiNote(n)).join(' et ');
  for (const p of POSTES_COMPTE_RESULTAT_SYSCOHADA) {
    if (p.notes.length) table[p.ref] = renvois(p.notes);
  }
  for (const s of SOLDES_INTERMEDIAIRES) {
    if (s.notes.length) table[s.ref] = renvois(s.notes);
  }
  return table;
})();

/**
 * Colonne « Clé » du tableau des flux (ch. 5 section 2) · A à H.
 *
 * ZA porte la clé A sans être une ligne de totalisation : c'est le poste
 * d'ouverture lui-même qui l'affiche dans le modèle, d'où l'entrée écrite en
 * dur, les sept autres venant de la table.
 *
 * ANOMALIE DU TEXTE OFFICIEL, signalée dans `correspondance-tft-syscohada.ts`
 * (n° 1) : le schéma de la section 1 attribue DEUX FOIS la lettre F et
 * numérote la clôture G. C'est le MODÈLE de la section 2 qui fait foi
 * (F = D + E, G = B + C + F, H = G + A), et c'est lui que cette table sert.
 * Le jeu associations SYCEBNL a ses propres lettres (`REP_TFT`) : elles ne
 * coïncident pas, ne pas les échanger.
 */
export const REP_TFT_SYSCOHADA: Record<string, string> = (() => {
  const table: Record<string, string> = { ZA: 'A' };
  for (const t of TOTAUX_FLUX_SYSCOHADA) {
    if (t.cle) table[t.ref] = t.cle;
  }
  return table;
})();

/**
 * Niveaux visuels du tableau des flux · les trois lignes que le modèle met en
 * évidence (ouverture ZA, variation ZG, clôture ZH) sur le bleu nuit des
 * lignes clefs, les flux de rubrique en vert, ZD et ZE en gris puisque ZF les
 * additionne.
 */
export const NIVEAUX_TFT_SYSCOHADA: Record<string, NiveauLigne> = {
  ZA: 'cle',
  ZB: 'section',
  ZC: 'section',
  ZD: 'inter',
  ZE: 'inter',
  ZF: 'section',
  ZG: 'cle',
  ZH: 'cle',
};

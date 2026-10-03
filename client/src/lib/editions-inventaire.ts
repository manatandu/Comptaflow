import { montant } from './montants';
import type { EcartInventaire, EditionFichesVierges, EditionPvCaisse, EditionPvInventaire } from './types';

/**
 * LES ÉDITIONS DE L'INVENTAIRE À L'ÉCRAN (ligne A19, relevé CPCC C16).
 *
 * Le CONTENU est servi par le serveur (`src/modules/inventaire/editions-
 * inventaire.ts`) · l'écran ne recalcule rien, il met en forme. Les tableaux
 * sont construits ICI, en cellules de texte, et `components/EditionsInventaire
 * .tsx` ne fait que les poser · un spec relit ainsi ce qui sera imprimé sans
 * monter React (`specs-sans-react.spec.ts`), comme `editions-structures.ts`.
 *
 * DEUX RÈGLES DE FORME. Un montant passe par `lib/montants.ts`, une quantité
 * garde sa précision ; une ABSENCE s'imprime « · », jamais « 0 » · « pas
 * encore compté » n'est pas zéro.
 */

export interface Table {
  colonnes: string[];
  lignes: string[][];
}

/** Les quatre décisions de l'enum `DecisionEcartInventaire` (CPCC, étape 5). */
export const LIBELLE_DECISION_ECART: Record<NonNullable<EcartInventaire['decision']>, string> = {
  A_REDRESSER: 'À redresser',
  EXPLIQUE: 'Expliqué, non redressé',
  EXCEDENT_NON_COMPTABILISE: 'Excédent laissé au bilan',
  RENVOYE_COMMISSION_PRINCIPALE: 'Renvoyé à la commission principale',
};

/** L'écart dit par un mot, jamais par la seule couleur (seconde passe A10, k). */
export const LIBELLE_SENS_ECART: Record<EditionPvInventaire['ecarts'][number]['sens'], string> = {
  MANQUANT: 'Manquant',
  EXCEDENT: 'Excédent',
  SANS_ECART: 'Aucun écart',
};

const ABSENT = '·';

/** Les routes de lecture des trois éditions. */
export function cheminEdition(
  e:
    | { nature: 'FICHES_DE_COMPTAGE'; campagneId: string; sousCommissionId?: string | null }
    | { nature: 'PROCES_VERBAL_INVENTAIRE'; campagneId: string }
    | { nature: 'PROCES_VERBAL_CAISSE'; pvId: string },
): string {
  switch (e.nature) {
    case 'FICHES_DE_COMPTAGE':
      return (
        `/inventaire/${encodeURIComponent(e.campagneId)}/editions/fiches-de-comptage` +
        (e.sousCommissionId ? `?sousCommissionId=${encodeURIComponent(e.sousCommissionId)}` : '')
      );
    case 'PROCES_VERBAL_INVENTAIRE':
      return `/inventaire/${encodeURIComponent(e.campagneId)}/editions/proces-verbal`;
    case 'PROCES_VERBAL_CAISSE':
      return `/inventaire/pv-caisse/${encodeURIComponent(e.pvId)}/edition`;
  }
}

/**
 * Une QUANTITÉ n'est pas un montant · elle garde sa précision (trois
 * décimales au schéma), sans zéros imposés.
 */
export function quantiteImprimee(q: number | null | undefined): string {
  if (q === null || q === undefined || !Number.isFinite(q)) return ABSENT;
  return q.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
}

/** Un jour servi à minuit UTC, lu en UTC · à l'heure du poste il reculait d'un jour à l'ouest de Greenwich. */
export function jourImprime(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : ABSENT;
}

/** Un montant dans l'unité de la caisse quand elle en a une (ligne A10). */
export function dansLUnite(v: unknown, unite: string | null): string {
  return unite ? `${montant(v)} ${unite}` : montant(v);
}

const texte = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? ABSENT : v);

// --- Fiches de comptage ------------------------------------------------------

/**
 * Une section de fiches vierges · désignation, compte, lieu, unité, puis les
 * colonnes à remplir sur place, VIDES.
 */
export function tableFichesVierges(
  section: EditionFichesVierges['sections'][number],
  colonnesARemplir: string[],
): Table {
  return {
    colonnes: ['N°', 'Désignation', 'Compte', 'Lieu', 'Unité', ...colonnesARemplir],
    lignes: section.lignes.map((l, n) => [
      String(n + 1),
      l.designation,
      l.compte,
      l.lieu,
      texte(l.unite),
      ...colonnesARemplir.map(() => ''),
    ]),
  };
}

// --- Procès-verbal d'inventaire ---------------------------------------------

export function tableReleve(e: EditionPvInventaire): Table {
  return {
    colonnes: ['Désignation', 'Compte', 'Lieu', 'Unité', 'Quantité', 'Valeur d’inventaire', 'Pièce', 'Sous-commission'],
    lignes: e.releve.map((l) => [
      l.designation,
      l.compte,
      l.lieu,
      texte(l.unite),
      quantiteImprimee(l.quantite),
      montant(l.valeur),
      texte(l.piece),
      texte(l.sousCommission),
    ]),
  };
}

export function tableTotauxParCompte(e: EditionPvInventaire): Table {
  return {
    colonnes: ['Compte', 'Fiches', 'Valeur d’inventaire'],
    lignes: e.totauxParCompte.map((t) => [
      t.compte,
      String(t.nombreFiches),
      // Un total partiel n'est pas un total · le manque se dit à sa place.
      t.valeurInventaire === null ? `${t.nonValorisees} fiche(s) non valorisée(s)` : montant(t.valeurInventaire),
    ]),
  };
}

export function tableEcarts(e: EditionPvInventaire): Table {
  return {
    colonnes: ['Compte', 'Inventaire', 'Comptabilité', 'Écart', 'Sens', 'Décision', 'Responsable', 'Explication'],
    lignes: e.ecarts.map((x) => [
      x.compte,
      montant(x.valeurInventaire),
      montant(x.soldeComptable),
      montant(x.ecart),
      LIBELLE_SENS_ECART[x.sens],
      x.decision ? LIBELLE_DECISION_ECART[x.decision] : 'Sans décision',
      texte(x.responsable),
      texte(x.explication),
    ]),
  };
}

export function tableCaisses(e: EditionPvInventaire): Table {
  return {
    colonnes: ['Caisse', 'Comptage', 'Sous-commission', 'Espèces comptées', 'Solde au livre-journal', 'Écart'],
    lignes: e.caisses.map((c) => [
      c.caisse,
      `${jourImprime(c.dateComptage)}${c.heureComptage ? ` à ${c.heureComptage}` : ''}`,
      c.sousCommission,
      dansLUnite(c.especesComptees, c.unite),
      dansLUnite(c.soldeComptable, c.unite),
      dansLUnite(c.ecart, c.unite),
    ]),
  };
}

// --- Procès-verbal de comptage de caisse ------------------------------------

/** Le mot qui dit l'écart d'une caisse. */
export function qualifierEcartCaisse(ecart: number): string {
  if (ecart === 0) return 'aucun écart';
  return ecart < 0 ? 'manquant' : 'excédent';
}

/**
 * Les lignes chiffrées du PV d'une caisse, dans l'ordre de l'écran (ligne
 * A10) · la reconstitution n'apparaît que si le PV l'a FIGÉE.
 */
export function lignesPvCaisse(e: EditionPvCaisse): [string, string][] {
  const u = e.unite;
  const r = e.reconstitution;
  const l: [string, string][] = [];
  if (r) {
    l.push([`Solde à la clôture du ${jourImprime(r.dateCloture)}`, dansLUnite(r.soldeALaCloture, u)]);
    if (r.mouvementsValeurAvantCloture !== null && r.mouvementsValeurAvantCloture !== 0) {
      l.push(['Opérations à date de valeur antérieure à la clôture', dansLUnite(r.mouvementsValeurAvantCloture, u)]);
    }
    l.push([
      `+ Encaissements jusqu’au comptage (${r.mouvementsPosterieurs ?? ABSENT} ligne(s) au total)`,
      dansLUnite(r.encaissementsPosterieurs, u),
    ]);
    l.push(['− Paiements jusqu’au comptage', dansLUnite(r.decaissementsPosterieurs, u)]);
  }
  l.push(['Solde au livre-journal au jour du comptage', dansLUnite(e.soldeComptable, u)]);
  l.push(['Espèces comptées', dansLUnite(e.especesComptees, u)]);
  if (r) l.push(['Espèces reconstituées à la clôture', dansLUnite(r.especesReconstitueesALaCloture, u)]);
  l.push(['Écart', `${dansLUnite(e.ecart, u)} · ${qualifierEcartCaisse(e.ecart)}`]);
  return l;
}

export function tableCoupures(e: EditionPvCaisse): Table | null {
  if (e.coupures.length === 0) return null;
  return {
    colonnes: ['Valeur unitaire', 'Nombre', 'Total'],
    lignes: [
      ...e.coupures.map((c) => [dansLUnite(c.valeurUnitaire, e.unite), String(c.nombre), dansLUnite(c.total, e.unite)]),
      ['Total', '', dansLUnite(e.totalCoupures, e.unite)],
    ],
  };
}

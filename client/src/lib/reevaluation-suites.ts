/**
 * LES SUITES D'UNE RÉÉVALUATION À L'ÉCRAN (ligne A15) · types des réponses du
 * serveur et règles d'affichage, sans calcul · tout montant est SERVI par
 * `reevaluation-bilan.service.ts` (note, déclaration spéciale) ou par le
 * tableau des amortissements, jamais recalculé ici.
 */

export interface PosteReevalue {
  poste: string;
  biens: number;
  coutHistorique: number;
  valeurReevaluee: number;
  ecart106: number;
  provision154: number;
  amortissementsSupplementaires: number;
  repriseExercice: number;
}

export interface NoteReevaluations {
  referentiel: 'SYSCOHADA' | 'SYCEBNL';
  codeNote: '3E' | '5H' | null;
  motifSansObjet: string | null;
  reevaluations: Array<{
    id: string;
    type: 'LEGALE' | 'LIBRE';
    methodeLibre: 'AJUSTEMENT' | 'ELIMINATION' | null;
    neutraliteFiscale: boolean;
    dateReevaluation: string;
    decision: string;
    traitementFiscal: string;
    methodeEvaluation: string;
    totalEcart: number;
  }>;
  postes: PosteReevalue[];
  sortis: Array<{ immobilisationId: string; designation: string; dateSortie: string; nature: string | null; transfereReserve: number; reprise861: number }>;
  total: Omit<PosteReevalue, 'poste'> | null;
  tronque: boolean;
}

export interface LigneDeclaration {
  immobilisationId: string;
  designation: string;
  numeroInventaire: string | null;
  compte: string;
  dateAcquisition: string;
  brutAvant: number;
  amortissementsAvant: number;
  valeurNetteAvant: number;
  coefficient: number | null;
  coefficientRetenu: number;
  valeurActuelle: number | null;
  valeurReevaluee: number;
  brutApres: number;
  amortissementsApres: number;
  ecart: number;
  compteEcart: string | null;
  motifNonReevalue: string | null;
}

type TotauxDeclaration = {
  brutAvant: number;
  amortissementsAvant: number;
  valeurNetteAvant: number;
  valeurReevaluee: number;
  brutApres: number;
  amortissementsApres: number;
  ecart: number;
};

export interface DeclarationSpeciale {
  dossier: string;
  exercice: { dateDebut: string; dateFin: string };
  reevaluation: NoteReevaluations['reevaluations'][number] | null;
  categories: Array<{ cle: string; libelle: string; coefficient: number | null; source: string | null; lignes: LigneDeclaration[]; total: TotauxDeclaration }>;
  total: TotauxDeclaration | null;
  mentions: { echeance: string; modele: string; depot: string };
}

export interface SortDeLEcart {
  ligneId: string;
  compteEcart: string;
  montant: number;
  traitement: 'RESERVE' | 'REPRISE_861' | 'NON_PASSE';
  motif: string | null;
}

export interface EcartALaSortie {
  cession: SortDeLEcart[];
  miseHorsService: SortDeLEcart[];
}

/** Le code de la note qui porte l'encadré, par jeu · la NOTE 3E au SYSCOHADA normal, la 5H des associations. */
export const NOTE_DES_REEVALUATIONS = { SYSCOHADA: '3E', ASSOCIATIONS: '5H' } as const;

/**
 * L'ÉTAT DE L'ENCADRÉ · `null` n'est pas vide (§ 9 ter) · chargement tant que
 * rien n'est lu, l'échec dit, l'encadré absent quand le dossier n'a aucune
 * réévaluation (rien à dire), et une note sans objet le dit.
 */
export function etatEncadreReevaluations(
  lu: NoteReevaluations | null,
  erreur: string | null,
):
  | { type: 'chargement' }
  | { type: 'erreur'; motif: string }
  | { type: 'absent' }
  | { type: 'sansObjet'; motif: string }
  | { type: 'encadre'; lu: NoteReevaluations } {
  if (erreur) return { type: 'erreur', motif: erreur };
  if (!lu) return { type: 'chargement' };
  if (!lu.codeNote) return lu.motifSansObjet ? { type: 'sansObjet', motif: lu.motifSansObjet } : { type: 'absent' };
  if (lu.reevaluations.length === 0 && lu.postes.length === 0) return { type: 'absent' };
  return { type: 'encadre', lu };
}

/** Le libellé de la nature d'une réévaluation, comme la décision la nomme. */
export function natureDeLaReevaluation(r: Pick<NoteReevaluations['reevaluations'][number], 'type' | 'methodeLibre' | 'neutraliteFiscale'>): string {
  if (r.type === 'LEGALE') return r.neutraliteFiscale ? 'Réévaluation légale · provision spéciale (neutralité fiscale)' : 'Réévaluation légale';
  return r.methodeLibre === 'ELIMINATION'
    ? 'Réévaluation libre · élimination des amortissements'
    : 'Réévaluation libre · ajustement du brut et des amortissements';
}

/**
 * LA SORTIE DEMANDE-T-ELLE UNE RÉSERVE ? · seulement quand le serveur annonce
 * un transfert du 106 pour CE type de sortie. Jamais déduit du référentiel ni
 * du compte à l'écran · c'est `sortDesEcarts` qui tranche, une seule règle.
 */
export function sortsDuType(lu: EcartALaSortie | null, type: 'CESSION' | 'MISE_HORS_SERVICE'): SortDeLEcart[] | null {
  if (!lu) return null;
  return type === 'CESSION' ? lu.cession : lu.miseHorsService;
}

export function reserveExigee(sorts: SortDeLEcart[] | null): boolean {
  return (sorts ?? []).some((s) => s.traitement === 'RESERVE');
}

/** Un choix unique se présélectionne (§ 9 ter). */
export function reservePreselectionnee(comptes: Array<{ id: string }> | null): string | null {
  return comptes && comptes.length === 1 ? comptes[0].id : null;
}

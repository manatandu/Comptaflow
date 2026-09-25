/**
 * États personnalisés (point 20) · types et aides d'écran. Le calcul et la
 * règle vivent au serveur (`etats-personnalises/moteur-etat-personnalise.ts`).
 */
export interface LigneEtat {
  cle: string;
  libelle: string;
  racines?: string;
  mesure?: 'SOLDE' | 'MOUVEMENT';
  sens?: 'DEBIT' | 'CREDIT';
  total?: string;
}

export interface EtatPersonnalise {
  id: string;
  nom: string;
  lignes: LigneEtat[];
}

export interface CalculEtat {
  etat: EtatPersonnalise;
  inclureBrouillard: boolean;
  colonnes: Array<{ exerciceId: string; dateDebut: string; dateFin: string; valeurs: Record<string, number> }>;
}

/** Une rubrique neuve · clé libre suivante (L1, L2…), pour ne jamais proposer une clé déjà prise. */
export function ligneNeuve(lignes: LigneEtat[]): LigneEtat {
  const prises = new Set(lignes.map((l) => l.cle));
  let n = lignes.length + 1;
  while (prises.has(`L${n}`)) n++;
  return { cle: `L${n}`, libelle: '', racines: '', mesure: 'MOUVEMENT', sens: 'DEBIT' };
}

/** Le modèle proposé à la création · un exemple lisible, que le cabinet remplace. */
export const MODELE_ETAT: LigneEtat[] = [
  { cle: 'PRODUITS', libelle: 'Produits (classe 7)', racines: '7', mesure: 'MOUVEMENT', sens: 'CREDIT' },
  { cle: 'CHARGES', libelle: 'Charges (classe 6)', racines: '6', mesure: 'MOUVEMENT', sens: 'DEBIT' },
  { cle: 'ECART', libelle: 'Produits moins charges', total: 'PRODUITS-CHARGES' },
];

/** Libellé de colonne · l'année de clôture, ou les deux dates si l'exercice n'est pas civil. */
export function titreColonne(dateDebut: string, dateFin: string): string {
  const d = new Date(dateDebut);
  const f = new Date(dateFin);
  const civil = d.getUTCMonth() === 0 && d.getUTCDate() === 1 && f.getUTCMonth() === 11 && f.getUTCDate() === 31;
  return civil ? String(f.getUTCFullYear()) : `${d.toLocaleDateString('fr-FR')} au ${f.toLocaleDateString('fr-FR')}`;
}

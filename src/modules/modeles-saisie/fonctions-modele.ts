/**
 * FONCTIONS DE LIGNE D'UN MODÈLE DE SAISIE · règles pures.
 *
 * Sage 100 i7, manuel de formation, « Modèles de saisie » · « Saisir : la
 * valeur doit être saisie manuellement par l'utilisateur. Répéter : reprendre
 * la même valeur que celle mentionnée sur la ligne précédente dans la même
 * colonne. Équilibrer : calcul du contenu de la zone par équilibrage avec les
 * autres montants saisis en débit et crédit. Calculer : calcul suivant un
 * paramétrage enregistré dans une autre commande (ex : calcul de TVA
 * automatiquement). »
 *
 * INCRÉMENTER N'EST PAS REPRIS, et c'est dit plutôt que tu. Chez Sage il sert
 * au numéro de facture ; ici le numéro de pièce est déjà incrémenté par la
 * numérotation du journal, et incrémenter un MONTANT n'a aucun sens comptable.
 * « Fonction » (fonction pré-paramétrée) ne l'est pas non plus · son contenu
 * n'est décrit nulle part dans le manuel.
 */
export type FonctionLigne = 'SAISIR' | 'REPETER' | 'CALCULER' | 'EQUILIBRER';

export interface LigneAVerifier {
  fonction?: FonctionLigne;
  montant?: number | null;
  tauxTvaId?: string | null;
}

export function motifRefusFonctions(lignes: LigneAVerifier[]): string | null {
  const equilibres = lignes.filter((l) => (l.fonction ?? 'SAISIR') === 'EQUILIBRER').length;
  if (equilibres > 1) {
    return 'Une seule ligne peut équilibrer la pièce · deux lignes « Équilibrer » se partageraient un solde que rien ne dit comment répartir.';
  }
  for (let i = 0; i < lignes.length; i++) {
    const f = lignes[i].fonction ?? 'SAISIR';
    const rang = i + 1;
    if ((f === 'REPETER' || f === 'CALCULER') && i === 0) {
      return `Ligne ${rang} · « ${f === 'REPETER' ? 'Répéter' : 'Calculer'} » s'appuie sur la ligne précédente, la première ligne n'en a pas.`;
    }
    if (f === 'CALCULER' && !lignes[i].tauxTvaId) {
      return `Ligne ${rang} · « Calculer » demande le taux de taxe à appliquer.`;
    }
    if (f !== 'CALCULER' && lignes[i].tauxTvaId) {
      return `Ligne ${rang} · un taux de taxe ne sert qu'à une ligne « Calculer ».`;
    }
    if (f !== 'SAISIR' && lignes[i].montant !== undefined && lignes[i].montant !== null) {
      return `Ligne ${rang} · un montant figé ne vaut que pour une ligne « Saisir » · les autres fonctions le calculent.`;
    }
  }
  return null;
}

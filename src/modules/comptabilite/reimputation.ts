/**
 * RÉIMPUTATION D'ÉCRITURES · règles pures, sans Prisma.
 *
 * La comparaison avec Sage i7 nomme la « réimputation » ; les manuels lus ne
 * la décrivent pas. Ce qu'elle doit faire est dit par les deux articles qui
 * régissent toute retouche d'une écriture, et ils ne disent pas la même chose
 * selon qu'elle est validée ou non :
 *
 *  · AUDCIF art. 22, 2° · « l'irréversibilité des traitements interdise toute
 *    suppression, addition ou modification ultérieure. Toute donnée entrée
 *    fait l'objet d'une validation ». Une ligne encore au BROUILLARD n'est pas
 *    entrée au livre-journal : on change son compte, c'est encore la saisie.
 *  · AUDCIF art. 20 · « Toute correction d'erreur commise et découverte sur
 *    l'exercice en cours s'effectue EXCLUSIVEMENT par inscription en négatif
 *    des éléments erronés ; l'enregistrement exact est ensuite opéré. » Une
 *    ligne VALIDÉE ne bouge donc jamais : la réimputation passe, dans le même
 *    journal, la ligne en négatif sur le mauvais compte puis la ligne exacte
 *    sur le bon, même sens, même montant.
 *
 * Le texte vise l'erreur de l'exercice EN COURS · un exercice clôturé se
 * corrige par le report à nouveau (même article, alinéa 3), pas ici.
 */

export interface LigneAReimputer {
  id: string;
  compteId: string;
  compteNumero: string;
  debit: number;
  credit: number;
  lettre: string | null;
  rapprochementId: string | null;
  tauxTvaId: string | null;
  statut: 'BROUILLARD' | 'VALIDEE';
  exerciceClos: boolean;
  estGenereeParCloture: boolean;
  /** Une immobilisation (acquisition, sortie, dotation) tient l'écriture. */
  tenueParImmobilisation: boolean;
}

/** Le refus nommé d'une ligne, ou null si elle se réimpute. */
export function motifRefusLigne(l: LigneAReimputer, compteCibleId: string): string | null {
  const q = `La ligne du ${l.compteNumero}`;
  if (l.compteId === compteCibleId) return `${q} est déjà sur le compte cible.`;
  if (l.exerciceClos) {
    return `${q} appartient à un exercice clôturé · une erreur d'un exercice antérieur se corrige par le report à nouveau (AUDCIF art. 20, al. 3).`;
  }
  if (l.estGenereeParCloture) {
    return `${q} vient de la clôture (report à-nouveau) · la réimputer désaccorderait le bilan d'ouverture.`;
  }
  if (l.tenueParImmobilisation) {
    return `${q} porte une immobilisation · la réimputer laisserait la fiche et son plan d'amortissement sans écriture en face. Passez par le module Immobilisations.`;
  }
  if (l.lettre) return `${q} est lettrée (${l.lettre}) · délettrez-la d'abord.`;
  if (l.rapprochementId) return `${q} est pointée dans un rapprochement bancaire · dépointez-la d'abord.`;
  if (l.tauxTvaId) {
    return `${q} porte un taux de TVA · la déplacer changerait la déclaration. Corrigez la pièce entière (inscription en négatif).`;
  }
  return null;
}

export interface LignePassee {
  compteId: string;
  debit: number;
  credit: number;
  /** Signe appliqué aux ventilations analytiques recopiées de l'origine. */
  signeAnalytique: 1 | -1;
}

/**
 * Les deux lignes de la réimputation d'une ligne validée · l'inscription en
 * NÉGATIF sur le compte erroné (même sens, montant opposé, jamais une
 * contre-passation qui gonflerait les deux cumuls de la balance), puis
 * l'enregistrement exact. La paire s'équilibre par construction.
 */
export function lignesDeReimputation(l: { compteId: string; debit: number; credit: number }, compteCibleId: string): LignePassee[] {
  return [
    { compteId: l.compteId, debit: -l.debit, credit: -l.credit, signeAnalytique: -1 },
    { compteId: compteCibleId, debit: l.debit, credit: l.credit, signeAnalytique: 1 },
  ];
}

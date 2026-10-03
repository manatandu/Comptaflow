import { designationLettrage, estTenueParUnLettrage } from '../lettrage/ligne-lettree';

/** Une ligne telle que le refus la lit · son lettrage et son pointage. */
export interface LigneTenue {
  lettre: string | null;
  lettrageId: string | null;
  rapprochementId: string | null;
}

/**
 * UNE ÉCRITURE DONT UNE LIGNE EST LETTRÉE OU POINTÉE NE SE CORRIGE NI NE
 * S'ANNULE · le lettrage affirme que ses lignes sont soldées entre elles, le
 * pointage qu'elles concordent avec un relevé. Corriger ou annuler sans les
 * défaire laisse l'affirmation en place, devenue fausse · un groupe « soldé »
 * d'une seule ligne, un crédit fantôme à la balance âgée et aux relances
 * (relecture adverse d'A6, B1). Une seule écriture du refus, servie à la
 * correction par inscription en négatif (`verifierCorrigeable`) et à
 * l'annulation d'une réévaluation des devises (D6). `objet` nomme ce qui est
 * lu (« cette écriture », « l'écriture n° 12 »), `geste` ce qui est refusé.
 * `null` si rien ne tient.
 */
export function motifLignesTenues(lignes: LigneTenue[], objet: string, geste: string, issue = ''): string | null {
  const lettrees = lignes.filter(estTenueParUnLettrage);
  if (lettrees.length > 0) {
    return (
      `${lettrees.length} ligne(s) de ${objet} sont lettrées (${[...new Set(lettrees.map(designationLettrage))].join(', ')}). ` +
      `Le lettrage affirme que ces lignes sont soldées entre elles ; ${geste} sans délettrer laisserait cette ` +
      `affirmation en place, devenue fausse. Délettrez-les d’abord${issue}.`
    );
  }
  const pointees = lignes.filter((l) => l.rapprochementId);
  if (pointees.length > 0) {
    return (
      `${pointees.length} ligne(s) de ${objet} sont pointées dans un rapprochement bancaire. Le pointage ` +
      `affirme la concordance avec un relevé ; dépointez-les d’abord (possible tant que le rapprochement est en cours)${issue}.`
    );
  }
  return null;
}

/**
 * UNE LIGNE TENUE PAR UN LETTRAGE, SOLDÉ OU PARTIEL (audit final F50).
 *
 * Deux champs, et c'est le cœur du modèle (commentaire de `LigneEcriture`) ·
 * `lettrageId` rattache la ligne à son groupe, soldé ou partiel ; `lettre`
 * n'est servie que lorsque le groupe est SOLDÉ. Les gardes qui défendent une
 * ligne lettrée ne testaient que `lettre` : une ligne d'un groupe PARTIEL se
 * modifiait, se supprimait, se corrigeait ou se réimputait, et le groupe se
 * dénouait en silence · solde stocké faux, groupe à cheval sur deux comptes,
 * facture payée à moitié qui reparaît entière aux relances.
 *
 * Toute garde qui refuse de toucher une ligne lettrée passe par ici, et le
 * type EXIGE les deux champs · un appelant qui oublierait de lire
 * `lettrageId` ne compilerait pas.
 */
export interface LigneLettrable {
  lettre: string | null;
  lettrageId: string | null;
}

export function estTenueParUnLettrage(l: LigneLettrable): boolean {
  // `!= null` et non `!== null` · un champ non lu vaut undefined, et une ligne
  // sans lettrage ne doit pas en être tenue pour une.
  return l.lettre != null || l.lettrageId != null;
}

/** Ce que le message dit du lettrage · sa lettre s'il est soldé, sa nature sinon. */
export function designationLettrage(l: LigneLettrable): string {
  return l.lettre ?? 'lettrage partiel';
}

/**
 * LA MISE EN SERVICE D'UN BIEN EN COURS EST UN VIREMENT DE POSTE À POSTE
 * (décision de Manasse du 2026-10-01, D6 de
 * `docs/suivi-immobilisations-verrouille.md`).
 *
 * L'écriture D compte définitif / C compte en cours (2x9) que passe
 * `ImmobilisationService.mettreEnService` ne fait entrer ni sortir aucun bien
 * du patrimoine · elle le change de poste. Les tableaux qui lisent les
 * MOUVEMENTS de la balance la prenaient pourtant pour une acquisition du
 * compte définitif ET une cession du compte en cours :
 *
 *  · les tableaux des valeurs brutes des Notes annexes · AUDCIF Titre IX
 *    ch. 6, NOTE 3A (« Acquisitions, Apports, Créations · Virements de poste
 *    à poste · […] · Cessions, Scissions, Hors service · Virements de poste
 *    à poste ») ; SYCEBNL Partie 4 ch. 2, NOTES 5A et 5B, et ch. 3, NOTE 3A
 *    (« AUGMENTATIONS B (Acquisitions/Apports/Créations ; Virements de poste
 *    à poste ; […]) | DIMINUTIONS C (Cessions/Scissions hors service ;
 *    Virements de poste à poste) ») · les modèles ont une colonne pour le
 *    virement, de chaque côté ;
 *  · le tableau des flux du SYCEBNL (poste FI, débits des 21 à 25), qui
 *    comptait le débit du compte définitif comme un second décaissement.
 *
 * L'ÉCRITURE SE RECONNAÎT PAR LA LIAISON DE LA FICHE
 * (`Immobilisation.ecritureMiseEnServiceId`), JAMAIS PAR LE COMPTE NI PAR LE
 * LIBELLÉ · un crédit du 2x9 peut aussi être une mise au rebut d'un en-cours
 * (fiche du COMPTE 23, « Utilisation au crédit ») ou un virement passé à la
 * main, et un libellé se retape. Ce qui n'est pas lié à une fiche reste où la
 * balance le met · c'est la limite de l'anomalie n° 9 de
 * `correspondance-notes-syscohada-1.ts`, désormais restreinte à ce qui
 * n'est pas passé par le module.
 *
 * La lecture vit dans `EcritureService.virementsDeMiseEnService` (sur les
 * mêmes écritures que la colonne « mouvements » de la balance, livre-journal
 * seul) ; ce fichier ne porte que le type et le cumul, sans accès à la base.
 */

/** Débit et crédit, sur UN compte, des écritures de mise en service liées à une fiche. */
export interface VirementDeCompte {
  debit: number;
  credit: number;
}

/** Les virements de mise en service d'un exercice, par identifiant de compte. */
export type VirementsParCompte = ReadonlyMap<string, VirementDeCompte>;

export const AUCUN_VIREMENT: VirementsParCompte = new Map();

/**
 * Le cumul des virements portés par un ensemble de lignes de balance · la part
 * de leurs mouvements débit et crédit qui n'est qu'un changement de poste.
 */
export function virementsDesLignes(lignes: readonly { compteId: string }[], virements: VirementsParCompte): VirementDeCompte {
  let debit = 0;
  let credit = 0;
  for (const l of lignes) {
    const v = virements.get(l.compteId);
    if (!v) continue;
    debit += v.debit;
    credit += v.credit;
  }
  return { debit, credit };
}

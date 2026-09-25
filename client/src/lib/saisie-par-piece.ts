/**
 * SAISIE PAR PIÈCE · la commande de Sage i7 du même nom, en mode de la
 * fenêtre de saisie.
 *
 * Manuel i7 : « Saisie par pièce : permet une saisie par pièce des
 * écritures », date libre, et en visualisation « Vous pouvez faire défiler
 * les pièces à l'aide des boutons [Précédent] et [Suivant] ». La saisie des
 * journaux, elle, ouvre un journal sur UN mois et ne demande que le jour.
 *
 * Le mode par pièce n'est qu'une autre FENÊTRE sur le même journal · la même
 * grille, les mêmes contrôles, le même enregistrement. Seules changent la
 * période lue (l'exercice entier) et la date, saisie en entier.
 */

export interface PeriodeSaisie {
  annee: number;
  /** 0 à 11 */
  mois: number;
}

const deux = (n: number) => String(n).padStart(2, '0');

function joursDansMois(annee: number, mois: number): number {
  return new Date(annee, mois + 1, 0).getDate();
}

/** Les dates lues par la grille · le mois ouvert, ou l'exercice entier. */
export function fenetreDeSaisie(
  parPiece: boolean,
  periode: PeriodeSaisie | null,
  exercice: { dateDebut: string; dateFin: string },
): { debut: string; fin: string } | null {
  if (parPiece) return { debut: exercice.dateDebut.slice(0, 10), fin: exercice.dateFin.slice(0, 10) };
  if (!periode) return null;
  return {
    debut: `${periode.annee}-${deux(periode.mois + 1)}-01`,
    fin: `${periode.annee}-${deux(periode.mois + 1)}-${deux(joursDansMois(periode.annee, periode.mois))}`,
  };
}

/**
 * La date de la pièce. En mode par pièce elle est saisie en entier, et une
 * date hors de l'exercice est refusée ICI, avant l'envoi · le serveur la
 * refuserait aussi, mais après que le comptable a tout saisi.
 */
export function dateDeLaPiece(params: {
  parPiece: boolean;
  datePiece: string;
  periode: PeriodeSaisie | null;
  jour: number;
  exercice: { dateDebut: string; dateFin: string };
}): { date: string } | { motif: string } {
  const { parPiece, datePiece, periode, jour, exercice } = params;
  if (parPiece) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePiece)) return { motif: 'Indiquez la date de la pièce.' };
    if (datePiece < exercice.dateDebut.slice(0, 10) || datePiece > exercice.dateFin.slice(0, 10)) {
      return { motif: "La date de la pièce tombe hors de l'exercice ouvert." };
    }
    return { date: datePiece };
  }
  if (!periode) return { motif: 'Choisissez la période.' };
  const j = Math.min(Math.max(1, jour), joursDansMois(periode.annee, periode.mois));
  return { date: `${periode.annee}-${deux(periode.mois + 1)}-${deux(j)}` };
}

/** Rang borné de la pièce affichée · une liste qui rétrécit ne laisse jamais un rang vide. */
export function rangBorne(rang: number, nombre: number): number {
  if (nombre <= 0) return 0;
  return Math.min(Math.max(0, rang), nombre - 1);
}

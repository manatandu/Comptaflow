/**
 * UNE LIGNE EN DEVISE DANS LA GRILLE DE SAISIE (audit final F49).
 *
 * La saisie n'écrivait jamais la devise d'une ligne · la réévaluation de
 * clôture ne trouvait aucune position, et le lettrage ne calculait aucun
 * écart de change réalisé. La ligne garde son montant en francs, monnaie de
 * tenue (loi n° 23/053 art. 141, 1° ; AUDCIF art. 17, 1°), et porte à côté
 * l'opération d'origine · la devise, son montant, le cours appliqué.
 *
 * Le serveur vérifie la même chose (`src/modules/comptabilite/
 * ligne-en-devise.ts`) · la vérification faite ici ne sert qu'à dire l'écart
 * sur la ligne plutôt qu'au moment d'enregistrer la pièce.
 */

export const MONNAIE_DE_TENUE = 'CDF';

export interface CoursCote {
  date: string;
  cours: number | string;
}

export interface DeviseDuDossier {
  id: string;
  code: string;
  intitule: string;
  estActive: boolean;
  cours: CoursCote[];
}

/** Les devises proposables · actives, et jamais la monnaie de tenue. */
export function devisesEtrangeres(devises: DeviseDuDossier[]): DeviseDuDossier[] {
  return devises.filter((d) => d.estActive && d.code.toUpperCase() !== MONNAIE_DE_TENUE);
}

/**
 * Le cours PROPOSÉ pour une pièce datée · le dernier coté au plus tard ce
 * jour-là, avec sa date, pour que l'écran dise s'il est du jour ou d'avant.
 * Jamais un cours postérieur à la pièce. C'est une proposition · l'AUDCIF
 * art. 52 veut le cours « à la date de formalisation de l'accord des
 * parties », que seul le comptable connaît, et le champ reste modifiable.
 */
export function coursPropose(devise: DeviseDuDossier | undefined, datePiece: string): { cours: number; date: string } | null {
  if (!devise || !datePiece) return null;
  let retenu: { cours: number; date: string } | null = null;
  for (const c of devise.cours) {
    const jour = c.date.slice(0, 10);
    if (jour > datePiece) continue;
    if (!retenu || jour > retenu.date) retenu = { cours: Number(c.cours), date: jour };
  }
  return retenu;
}

/** Montant en devise × cours, au centime, comme le montant de la ligne. */
export function contrevaleur(montantDevise: number, cours: number): number {
  return Math.round(montantDevise * cours * 100) / 100;
}

/**
 * Le motif pour lequel la ligne en devise ne tient pas, ou `null`. Mêmes
 * seuils que le serveur · un centime, plus la part d'arrondi d'un cours gardé
 * à six décimales.
 */
export function motifLigneEnDevise(l: { francs: number; montantDevise: number; cours: number | null; code: string }): string | null {
  if (!(l.montantDevise > 0)) return `Saisissez le montant en ${l.code}, positif · le sens est celui de la ligne.`;
  if (l.cours === null) return null;
  if (!(l.cours > 0)) return `Le cours de ${l.code} doit être positif.`;
  const attendu = contrevaleur(l.montantDevise, l.cours);
  if (Math.abs(attendu - l.francs) > 0.01 + l.montantDevise * 0.5e-6) {
    return `${l.montantDevise} ${l.code} au cours de ${l.cours} font ${attendu} ${MONNAIE_DE_TENUE}, et la ligne porte ${l.francs}.`;
  }
  return null;
}

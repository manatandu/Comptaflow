/**
 * LA PÉRIODE DES LISTES DE TRAVAIL · audit final F188.
 *
 * La facturation, les devis et le registre des exonérations recevaient tout le
 * dossier à chaque ouverture. Le serveur les lit désormais sur une période
 * (`du`, `au`, jours AAAA-MM-JJ, bornes comprises) et sous un plafond qu'il
 * DIT (`total`, `tronque`, § 8 bis). L'écran demande une période par défaut,
 * et il dit laquelle :
 *
 *  · l'EXERCICE COURANT du sélecteur, quand la fenêtre lit des pièces datées
 *    de l'exercice (factures, devis) · c'est celui sur lequel portent tous les
 *    écrans, et une pièce se passe au journal de son exercice ;
 *  · à défaut, les DOUZE DERNIERS MOIS, ouverts vers l'avant · une pièce datée
 *    de demain reste visible, et l'échéance d'un registre ne se coupe pas.
 *
 * Ce n'est qu'une borne de LECTURE · aucune date opposable ne s'en déduit, et
 * l'horloge du poste suffit à la poser.
 */
export interface PeriodeListe {
  du: string | null;
  au: string | null;
}

export type OriginePeriode = 'EXERCICE' | 'DOUZE_MOIS' | 'CHOISIE';

/** Le jour civil du poste, au format que le serveur lit. */
export function jourDuPoste(d: Date): string {
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}

export function periodeParDefaut(
  exercice: { dateDebut: string; dateFin: string } | null,
  aujourdhui: Date,
): PeriodeListe & { origine: 'EXERCICE' | 'DOUZE_MOIS' } {
  if (exercice) return { du: exercice.dateDebut.slice(0, 10), au: exercice.dateFin.slice(0, 10), origine: 'EXERCICE' };
  // Le même jour un an plus tôt · un 29 février recule au 28, sans quoi la
  // date déborderait sur le 1er mars et le serveur la lirait telle quelle.
  const annee = aujourdhui.getFullYear() - 1;
  const mois = aujourdhui.getMonth();
  const dernierDuMois = new Date(annee, mois + 1, 0).getDate();
  const debut = new Date(annee, mois, Math.min(aujourdhui.getDate(), dernierDuMois));
  return { du: jourDuPoste(debut), au: null, origine: 'DOUZE_MOIS' };
}

/** Les paramètres de la requête · une borne absente n'est pas envoyée. */
export function requetePeriode(p: PeriodeListe): string {
  const parties = [p.du ? `du=${encodeURIComponent(p.du)}` : null, p.au ? `au=${encodeURIComponent(p.au)}` : null].filter(Boolean);
  return parties.length ? `?${parties.join('&')}` : '';
}

const jourLisible = (j: string) => `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}`;

/** La période telle que l'écran la dit, une ligne. */
export function libellePeriode(p: PeriodeListe, origine: OriginePeriode): string {
  const bornes =
    p.du && p.au
      ? `Du ${jourLisible(p.du)} au ${jourLisible(p.au)}`
      : p.du
        ? `Depuis le ${jourLisible(p.du)}`
        : p.au
          ? `Jusqu’au ${jourLisible(p.au)}`
          : 'Toutes dates';
  const suffixe = origine === 'EXERCICE' ? ' · exercice courant' : origine === 'DOUZE_MOIS' ? ' · douze derniers mois' : '';
  return `${bornes}${suffixe}`;
}

/** La tranche, dite quand elle en est une · `null` quand la liste est entière. */
export function libelleTranche(r: { total: number; tronque: boolean }, affiches: number): string | null {
  return r.tronque ? `${affiches} affichés sur ${r.total} · resserrez la période.` : null;
}

/** Une pièce datée hors de la période affichée ne se verra pas après l'enregistrement · l'écran le dit. */
export function horsPeriode(jour: string, p: PeriodeListe): boolean {
  const j = jour.slice(0, 10);
  return (p.du !== null && j < p.du) || (p.au !== null && j > p.au);
}

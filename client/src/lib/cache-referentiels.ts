/**
 * CE QU'UNE ÉCRITURE VIDE DU CACHE DES RÉFÉRENTIELS (audit final F249).
 *
 * `/comptes` et `/journaux` sont gardés trente secondes (lib/api.ts), et le
 * cache se vide quand une écriture touche la même famille de chemins. Mais
 * des écritures changent la liste des comptes SANS passer par `/comptes` ·
 * la création d'un tiers ouvre son compte individuel, la fusion de deux
 * comptes met l'absorbé en sommeil. Pendant trente secondes, les fenêtres
 * ouvertes ensuite servaient un plan faux · le compte du tiers introuvable à
 * la saisie, le compte absorbé encore proposé comme actif.
 *
 * La règle vit ici, hors de api.ts, pour être vérifiable sans navigateur.
 * Une route ajoutée demain qui crée ou modifie un compte hors de `/comptes`
 * vient s'inscrire dans ECRITURES_INDIRECTES.
 */
export const CHEMINS_CACHES: readonly string[] = ['/comptes', '/journaux'];

/**
 * Le chemin appartient-il à la famille ? Par SEGMENT entier · `/tiers` ne
 * vise pas `/tiersX`, et `/relances/tiers/…` n'est pas une écriture sur les
 * tiers.
 */
function dansLaFamille(chemin: string, prefixe: string): boolean {
  return chemin === prefixe || chemin.startsWith(`${prefixe}/`) || chemin.startsWith(`${prefixe}?`);
}

/** Les écritures qui touchent un référentiel caché par un autre chemin que le sien. */
const ECRITURES_INDIRECTES: readonly { prefixe: string; vide: readonly string[] }[] = [
  // L'import crée des comptes, et peut créer des journaux, sans jamais
  // toucher un chemin /comptes ou /journaux.
  { prefixe: '/import', vide: CHEMINS_CACHES },
  // Un tiers naît avec son compte individuel sous le collectif du type
  // (tiers/collectifs-tiers.ts), `/tiers/:id/compte-individuel` en ouvre un
  // après coup, et la fusion de deux tiers reporte leurs comptes.
  { prefixe: '/tiers', vide: ['/comptes'] },
  // La fusion de deux comptes met le compte absorbé en sommeil
  // (comptabilite/reimputation.ts).
  { prefixe: '/ecritures/fusion-comptes', vide: ['/comptes'] },
  // La nature s'affiche dans la liste des comptes (CompteService.lister), et
  // l'alignement réécrit leur mode de report.
  { prefixe: '/natures-compte', vide: ['/comptes'] },
];

/** Les entrées du cache qu'une écriture sur `chemin` rend fausses. */
export function cheminsAViderApres(chemin: string): string[] {
  const vides = new Set<string>();
  for (const prefixe of CHEMINS_CACHES) if (dansLaFamille(chemin, prefixe)) vides.add(prefixe);
  for (const e of ECRITURES_INDIRECTES) {
    if (dansLaFamille(chemin, e.prefixe)) for (const c of e.vide) vides.add(c);
  }
  return [...vides];
}

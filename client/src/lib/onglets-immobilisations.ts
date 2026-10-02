/**
 * LES ONGLETS DE LA FENÊTRE IMMOBILISATIONS · règle sortie du composant pour
 * être testable (même découpe que `exercice-choix.ts`).
 *
 * Un RANGEMENT, pas une règle de droit · ce qui porte sur UN bien (sortie,
 * dépréciation, composants, coûts d'emprunt, mise en service, révision du
 * plan, échange) reste sur sa ligne dans « Biens » ; « Financements » tient
 * les subventions, fonds et legs, « Opérations » ce qui ne porte pas sur un
 * seul bien (prix global, clôture des contrats de location-acquisition).
 *
 * L'onglet se MÉMORISE PAR POSTE (préférence du navigateur, comme le choix
 * d'exercice et l'onglet de l'accueil) · `localStorage` jette en fenêtre
 * privée, d'où le `try/catch` des deux côtés.
 */
export type OngletImmobilisations = 'biens' | 'tableaux' | 'financements' | 'operations' | 'lieux';
export type TableauImmobilisations = 'immobilisations' | 'amortissements';

export const CLE_ONGLET_IMMOBILISATIONS = 'omegax.immobilisations.onglet';

const CLES: readonly OngletImmobilisations[] = ['biens', 'tableaux', 'financements', 'operations', 'lieux'];

/**
 * L'onglet à ouvrir. Une vue demandée par le menu (un tableau) prime sur la
 * mémoire ; un onglet mémorisé inconnu, ou « Lieux » pour qui n'administre
 * pas le dossier (référentiel réservé à l'administrateur), retombe sur Biens.
 */
export function ongletAOuvrir(
  memorise: string | null,
  vueDemandee: 'biens' | TableauImmobilisations,
  estAdmin: boolean,
): OngletImmobilisations {
  if (vueDemandee !== 'biens') return 'tableaux';
  const lu = CLES.find((c) => c === memorise);
  if (!lu) return 'biens';
  return ongletPermis(lu, estAdmin);
}

/** « Lieux » n'est servi qu'à l'administrateur · ailleurs, Biens. */
export function ongletPermis(onglet: OngletImmobilisations, estAdmin: boolean): OngletImmobilisations {
  return onglet === 'lieux' && !estAdmin ? 'biens' : onglet;
}

export function lireOngletMemorise(): string | null {
  try {
    return localStorage.getItem(CLE_ONGLET_IMMOBILISATIONS);
  } catch {
    return null;
  }
}

export function memoriserOnglet(onglet: OngletImmobilisations): void {
  try {
    localStorage.setItem(CLE_ONGLET_IMMOBILISATIONS, onglet);
  } catch {
    // Fenêtre privée ou stockage bloqué · l'onglet n'est simplement pas retenu.
  }
}

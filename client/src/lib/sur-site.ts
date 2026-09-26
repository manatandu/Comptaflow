/**
 * L'INSTALLATION SUR SITE vue de l'écran d'ouverture · une réponse de
 * `GET /sur-site/etat`, et ce qu'on en montre. En ligne, le serveur répond
 * `surSite: false` et rien de tout ceci ne s'affiche.
 */
export interface LicenceResumee {
  numero: string;
  titulaire: string;
  emiseLe: string;
  finMaintenance: string;
  expiration: string | null;
  dossiersMax: number;
}

export interface EtatSurSite {
  surSite: boolean;
  statut?: string;
  motif?: string | null;
  empreinte?: string | null;
  dateVersion?: string | null;
  licence?: LicenceResumee | null;
}

/** La ligne qui résume une licence valide · la fin d'usage n'est jamais tue, même perpétuelle. */
export function resumeLicence(l: LicenceResumee): string {
  const usage = l.expiration ? `valable jusqu'au ${l.expiration}` : 'perpétuelle';
  return `Licence n° ${l.numero} · ${l.titulaire} · ${l.dossiersMax} dossier(s) · ${usage} · mises à jour jusqu'au ${l.finMaintenance}`;
}

/**
 * Le dépôt n'est proposé que si la licence ne vaut pas ici · une licence
 * valide se remplace en déposant la nouvelle, et c'est aussi permis, mais
 * derrière un clic de plus pour qu'un fichier ne l'écrase pas par mégarde.
 */
export function licenceABloquer(e: EtatSurSite): boolean {
  return e.surSite && e.statut !== 'VALIDE';
}

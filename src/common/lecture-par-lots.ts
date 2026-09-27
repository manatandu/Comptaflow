/**
 * LIRE PAR TRANCHES · la mémoire ne dépend plus de la taille du dossier.
 *
 * Le banc d'un million de lignes (`docs/capacite-mesuree.md`) l'a établi · ce
 * n'est pas le volume du dossier qui tue l'instance, c'est le nombre de lignes
 * qu'UNE fenêtre réclame d'un coup. Toute route de travail qui parcourt les
 * écritures d'un exercice les lit donc par lots, curseur sur l'identifiant, et
 * ne garde que ce qu'elle rend (audit final F185).
 *
 * DEUX PIÈGES, et chacun rend un chiffre FAUX sans lever d'erreur :
 *
 *  · sans `skip: 1` chez l'appelant, Prisma rend de nouveau la ligne du
 *    curseur à chaque tranche · son montant est compté deux fois ;
 *  · s'arrêter sur un lot VIDE plutôt que sur un lot INCOMPLET fait une
 *    requête de plus à chaque appel, pour rien.
 *
 * L'arrêt se fait donc sur un lot plus court que la taille demandée, et le
 * curseur avance sur le DERNIER élément rendu. `pageApres` écrit les deux
 * arguments de pagination d'une seule façon, pour qu'aucun appelant n'oublie
 * le `skip`.
 */

/**
 * Taille d'un lot de lecture. Cinq mille éléments pèsent quelques mégaoctets
 * et tiennent dans n'importe quel conteneur · l'intérêt n'est pas la vitesse,
 * c'est que la mémoire ne dépende PLUS de la taille du dossier.
 */
export const LOT_LECTURE = 5000;

/**
 * Lot des lectures qui ramènent une écriture AVEC ses lignes · cinq cents
 * écritures, même ordre de grandeur que l'export du journal en flux.
 */
export const LOT_ECRITURES = 500;

export async function lireParLots<T extends { id: string }>(
  charger: (curseur: string | undefined) => Promise<T[]>,
  traiter: (element: T) => void,
  taille = LOT_LECTURE,
): Promise<void> {
  let curseur: string | undefined;
  for (;;) {
    const lot = await charger(curseur);
    for (const element of lot) traiter(element);
    if (lot.length < taille) return;
    curseur = lot[lot.length - 1].id;
  }
}

/** Les arguments Prisma d'une tranche · ordre par identifiant, curseur exclu. */
export function pageApres(curseur: string | undefined, taille: number) {
  return {
    orderBy: { id: 'asc' as const },
    take: taille,
    ...(curseur ? { cursor: { id: curseur }, skip: 1 } : {}),
  };
}

/**
 * Une liste bornée qui COMPTE ce qu'elle ne garde pas · un contrôle qui ne
 * montre que ses deux cents premières occurrences doit dire combien il en a
 * trouvé, sans quoi « 200 » se lit comme le total.
 */
export class Collecte<T> {
  readonly elements: T[] = [];
  nombre = 0;

  constructor(private readonly plafond: number) {}

  ajouter(element: T): void {
    this.nombre++;
    if (this.elements.length < this.plafond) this.elements.push(element);
  }

  get tronquee(): boolean {
    return this.nombre > this.elements.length;
  }
}

/**
 * Les N PREMIERS selon un ordre, gardés au fil d'un parcours par tranches ·
 * un écran qui montre les deux mille échéances les plus proches ne doit pas
 * garder en mémoire les cent mille autres pour les trier à la fin. Le tas
 * est retaillé chaque fois qu'il double, puis une dernière fois à la sortie.
 */
export class PremiersSelon<T> {
  private tas: T[] = [];
  nombre = 0;

  constructor(
    private readonly capacite: number,
    private readonly ordre: (a: T, b: T) => number,
  ) {}

  ajouter(element: T): void {
    this.nombre++;
    this.tas.push(element);
    if (this.tas.length >= 2 * this.capacite) this.retailler();
  }

  private retailler(): void {
    this.tas.sort(this.ordre);
    this.tas.length = Math.min(this.tas.length, this.capacite);
  }

  /** Les premiers, dans l'ordre. */
  elements(): T[] {
    this.retailler();
    return this.tas;
  }

  get tronquee(): boolean {
    return this.nombre > this.capacite;
  }
}

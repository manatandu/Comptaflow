/**
 * LECTURE DE LA CHAÎNE DE CONNEXION · ce que le serveur a le droit d'en dire.
 *
 * La chaîne elle-même ne sort JAMAIS d'ici : ni journal, ni message d'erreur,
 * ni sortie de commande (CLAUDE.md §4). Ce fichier n'en extrait que deux faits
 * sans valeur pour un attaquant, et qui suffisent à répondre à la seule
 * question qui se pose en exploitation : « le service est-il bien passé par
 * l'endpoint poolé, et combien de connexions s'autorise-t-il ? »
 *
 * POURQUOI CETTE QUESTION EST VITALE · Cloud Run multiplie les instances sous
 * la charge, et chaque instance ouvre son propre pool Prisma. Sans endpoint
 * poolé ni plafond, quelques dossiers actifs en même temps épuisent les
 * connexions de la base, et le service tombe pour TOUS les cabinets à la
 * fois · une panne qui ne vient d'aucun bug et qu'aucun test ne voit.
 *
 * L'endpoint poolé de Neon se reconnaît à son hôte, suffixé `-pooler`. Il
 * parle le protocole PgBouncer en mode TRANSACTION, qui ne garde pas les
 * requêtes préparées d'une transaction à l'autre : Prisma doit alors les
 * désactiver (`pgbouncer=true`), faute de quoi la deuxième requête d'une même
 * session échoue sur un « prepared statement already exists ».
 */

export interface EtatDuPooling {
  /** L'hôte porte le suffixe `-pooler` · connexions multiplexées par PgBouncer. */
  poole: boolean;
  /** `pgbouncer=true` présent dans la chaîne · requêtes préparées désactivées. */
  pgbouncerDeclare: boolean;
  /** Valeur de `connection_limit`, ou `null` si la chaîne ne la borne pas. */
  plafondConnexions: number | null;
}

/**
 * Ce que la chaîne dit d'elle-même. Rend `null` quand elle est absente ou
 * illisible · ce n'est pas à cette fonction de décider qu'un démarrage doit
 * échouer, seulement de rapporter.
 */
export function lireEtatDuPooling(chaine: string | undefined): EtatDuPooling | null {
  if (!chaine) return null;
  let url: URL;
  try {
    url = new URL(chaine);
  } catch {
    return null;
  }
  const limite = url.searchParams.get('connection_limit');
  const valeur = limite === null ? null : Number(limite);
  return {
    poole: url.hostname.includes('-pooler'),
    pgbouncerDeclare: url.searchParams.get('pgbouncer') === 'true',
    plafondConnexions: valeur !== null && Number.isFinite(valeur) ? valeur : null,
  };
}

/**
 * La ligne écrite au démarrage. Volontairement dépourvue d'hôte, de base et
 * d'utilisateur : un journal Cloud Run se lit par toute personne ayant accès
 * au projet, et une chaîne de connexion n'a rien à y faire.
 */
export function messageDePooling(etat: EtatDuPooling | null): string {
  if (!etat) return 'Base · chaîne de connexion absente ou illisible';
  const plafond = etat.plafondConnexions === null ? 'défaut Prisma' : `${etat.plafondConnexions} par instance`;
  if (!etat.poole) {
    return `Base · endpoint DIRECT (non poolé), plafond de connexions ${plafond}`;
  }
  return (
    `Base · endpoint POOLÉ, plafond de connexions ${plafond}` +
    (etat.pgbouncerDeclare ? '' : ' · ATTENTION : pgbouncer=true absent de la chaîne')
  );
}

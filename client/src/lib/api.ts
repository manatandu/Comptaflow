const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * SESSION EN COOKIE httpOnly · le jeton de session n'est PLUS stocké ici :
 * il vit dans un cookie httpOnly que ce code ne peut pas lire (c'est le
 * but · une XSS ne peut plus le voler), et le navigateur l'envoie tout seul
 * grâce à `credentials: 'include'`. Ce qui reste côté JavaScript est le
 * jeton CSRF apparié, rejoué en en-tête X-CSRF-Token : sans lui, le serveur
 * refuse toute mutation portée par le cookie. Il est inutilisable seul (il
 * ne vaut que combiné au cookie), le garder en localStorage est donc sans
 * danger équivalent à l'ancien jeton de session.
 */
const CLE_CSRF = 'omegax:csrf';
// L'ancien jeton de session en localStorage n'a plus aucun usage · on
// l'efface pour ne pas laisser traîner un identifiant de session lisible.
localStorage.removeItem('omegax:token');

function getCsrf(): string | null {
  return localStorage.getItem(CLE_CSRF);
}

export function setCsrf(token: string | null) {
  if (token) localStorage.setItem(CLE_CSRF, token);
  else localStorage.removeItem(CLE_CSRF);
  // Changement de dossier ou déconnexion : rien de ce qui a été chargé pour
  // l'ancienne session ne doit être resservi (voir cacheReferentiels plus bas).
  cacheReferentiels.clear();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const csrf = getCsrf();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    // Le cookie de session voyage avec chaque appel (origines croisées :
    // oomega.web.app vers Cloud Run) · le serveur n'admet cela que pour les
    // origines de sa liste CORS.
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = Array.isArray(body.message) ? body.message.join(', ') : body.message ?? message;
    } catch {
      // corps non-JSON (erreur réseau, 502, etc.) · on garde statusText
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Télécharge un export binaire (Excel). Le cookie de session suffit
 * désormais à l'authentifier, mais le passage par fetch + Blob + lien
 * temporaire est conservé : c'est lui qui permet de reprendre le nom de
 * fichier proposé par le serveur et d'afficher une erreur lisible au lieu
 * d'une page blanche.
 *
 * Le nom de fichier vient du serveur (en-tête Content-Disposition), qui y
 * met l'année de l'exercice et, pour un grand livre, le numéro de compte ·
 * il est le seul à connaître ces éléments. `nomParDefaut` ne sert que si
 * l'en-tête est absent ou illisible.
 */
async function telecharger(path: string, nomParDefaut: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = Array.isArray(body.message) ? body.message.join(', ') : body.message ?? message;
    } catch {
      // corps non-JSON
    }
    throw new ApiError(res.status, message);
  }

  const disposition = res.headers.get('Content-Disposition');
  const nomServeur = disposition?.match(/filename="([^"]+)"/)?.[1];

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomServeur ?? nomParDefaut;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
}

/**
 * CACHE DES RÉFÉRENTIELS · `/comptes` et `/journaux` sont rechargés par
 * presque chaque fenêtre à son ouverture, alors que ces listes ne changent
 * qu'à l'initiative de l'utilisateur. La PROMESSE est mise en cache (deux
 * fenêtres ouvertes coup sur coup partagent la même requête en vol), pour
 * 30 secondes, et le cache est vidé dès qu'une écriture (POST/PATCH/DELETE)
 * touche la même famille de chemins · créer un compte re-remplit donc la
 * liste immédiatement. Les variantes avec paramètres (`/comptes?...`) ne
 * sont pas mises en cache : la clé est le chemin exact.
 */
const CHEMINS_CACHES = ['/comptes', '/journaux'];
const cacheReferentiels = new Map<string, { promesse: Promise<unknown>; expire: number }>();

function viderCachePour(path: string) {
  // L'import crée des comptes (et peut créer des journaux) côté serveur sans
  // jamais toucher un chemin /comptes ou /journaux : il vide tout.
  if (path.startsWith('/import')) {
    cacheReferentiels.clear();
    return;
  }
  for (const prefixe of CHEMINS_CACHES) {
    if (path === prefixe || path.startsWith(`${prefixe}/`) || path.startsWith(`${prefixe}?`)) {
      cacheReferentiels.delete(prefixe);
    }
  }
}

/** Fenêtre → Actualiser : le F5 doit recharger VRAIMENT, cache compris. */
export function viderCacheReferentiels() {
  cacheReferentiels.clear();
}

function getAvecCache<T>(path: string): Promise<T> {
  if (!CHEMINS_CACHES.includes(path)) return request<T>(path);
  const present = cacheReferentiels.get(path);
  if (present && present.expire > Date.now()) return present.promesse as Promise<T>;
  const promesse = request<T>(path).catch((err) => {
    // Une réponse en erreur ne doit jamais rester servie depuis le cache.
    cacheReferentiels.delete(path);
    throw err;
  });
  cacheReferentiels.set(path, { promesse, expire: Date.now() + 30_000 });
  return promesse;
}

export const api = {
  get: <T>(path: string) => getAvecCache<T>(path),
  post: <T>(path: string, body?: unknown) => {
    viderCachePour(path);
    return request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  },
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => {
    viderCachePour(path);
    return request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
  },
  // Corps optionnel : `DELETE /notes-annexes/rattachements` identifie la
  // ligne à retirer par (jeu, codeNote, cleRubrique, compteId), pas par un
  // identifiant dans l'URL · il n'existe pas de ressource `/rattachements/:id`
  // adressable côté client, seule cette combinaison l'est.
  delete: <T>(path: string, body?: unknown) => {
    viderCachePour(path);
    return request<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined });
  },
  telecharger,
};

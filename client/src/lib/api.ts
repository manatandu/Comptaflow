const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function getToken(): string | null {
  return localStorage.getItem('omegax:token');
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('omegax:token', token);
  else localStorage.removeItem('omegax:token');
  // Changement de dossier ou déconnexion : rien de ce qui a été chargé pour
  // l'ancien jeton ne doit être resservi (voir cacheReferentiels plus bas).
  cacheReferentiels.clear();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
 * Télécharge un export binaire (Excel) protégé par le Bearer token · un
 * <a href> classique ne peut pas porter l'en-tête Authorization, d'où le
 * passage par fetch + Blob + lien temporaire déclenché par script.
 *
 * Le nom de fichier vient du serveur (en-tête Content-Disposition), qui y
 * met l'année de l'exercice et, pour un grand livre, le numéro de compte ·
 * il est le seul à connaître ces éléments. `nomParDefaut` ne sert que si
 * l'en-tête est absent ou illisible.
 */
async function telecharger(path: string, nomParDefaut: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
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

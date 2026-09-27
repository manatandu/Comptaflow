/**
 * LA SESSION PERDUE EN COURS DE TRAVAIL (audit final F164).
 *
 * Le serveur marque le 401 d'une session absente, expirée ou close par
 * `session: 'perdue'` (`JwtAuthGuard.handleRequest`). Sans reprise, chaque
 * fenêtre ouverte affichait « Unauthorized » à la suite, et rien ne ramenait
 * à la connexion. Un 401 SANS ce drapeau n'est pas une session perdue · c'est
 * un mot de passe actuel faux, un code de vérification refusé, et il reste une
 * erreur de la fenêtre qui l'a reçu.
 *
 * `api.ts` SIGNALE, `AuthProvider` DÉCIDE · il ne ferme que la session
 * qu'il tenait ouverte. Au chargement de la page, sans session, le même 401
 * n'est pas une perte · on n'avait rien.
 */
export const SIGNAL_SESSION_PERDUE = 'perdue';

type Ecouteur = (motif: string) => void;
const ecouteurs = new Set<Ecouteur>();

export function surSessionPerdue(ecouteur: Ecouteur): () => void {
  ecouteurs.add(ecouteur);
  return () => {
    ecouteurs.delete(ecouteur);
  };
}

/** Lit le corps d'une réponse refusée · rend le motif si c'est une session perdue, sinon null. */
export function motifDeSessionPerdue(statut: number, corps: unknown): string | null {
  if (statut !== 401 || typeof corps !== 'object' || corps === null) return null;
  const c = corps as { session?: unknown; message?: unknown };
  if (c.session !== SIGNAL_SESSION_PERDUE) return null;
  return typeof c.message === 'string' && c.message.trim() ? c.message : 'Session absente ou expirée · reconnectez-vous.';
}

export function signalerSessionPerdue(motif: string) {
  for (const e of [...ecouteurs]) e(motif);
}

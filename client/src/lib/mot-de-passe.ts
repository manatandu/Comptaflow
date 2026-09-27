import { api, setCsrf } from './api';

/**
 * CHANGEMENT DE SON PROPRE MOT DE PASSE · une seule règle pour les deux
 * portes : l'écran bloquant de première connexion (ChangerMotDePassePage) et
 * le changement volontaire de « Mon compte… » (ModaleMonCompte). Deux copies
 * du même envoi auraient divergé au premier correctif, et c'est la ligne
 * `setCsrf` qu'on oublie · sans elle, la mutation suivante part avec l'ancien
 * jeton et se fait refuser.
 */

/** Refus rendus AVANT l'envoi · `null` quand rien ne s'y oppose. */
export function refusNouveauMotDePasse(actuel: string, nouveau: string, confirmation: string): string | null {
  if (nouveau !== confirmation) return 'La confirmation ne correspond pas au nouveau mot de passe.';
  if (nouveau === actuel) return "Le nouveau mot de passe doit être différent de l'actuel.";
  return null;
}

/**
 * Le serveur RÉVOQUE toutes les sessions du compte au changement (un mot de
 * passe change souvent parce qu'il a fuité) et repose aussitôt une session
 * neuve. Le jeton CSRF apparié change donc lui aussi. Les clés sont celles de
 * `ChangerMotDePasseDto` · le serveur refuse toute clé de plus.
 */
export async function changerMonMotDePasse(actuel: string, nouveau: string): Promise<void> {
  const { csrfToken } = await api.post<{ change: boolean; csrfToken: string }>('/auth/changer-mot-de-passe', {
    motDePasseActuel: actuel,
    nouveauMotDePasse: nouveau,
  });
  setCsrf(csrfToken);
}

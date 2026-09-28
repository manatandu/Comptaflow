import type { AuthResponse } from './types';

/**
 * LA CONNEXION, VUE DE L'ÉCRAN D'OUVERTURE · ce que `POST /auth/login` reçoit,
 * et ce que sa réponse demande à l'écran de faire.
 */

/** Ce que rend `POST /auth/login` · un code attendu, ou une session posée. */
export type ReponseConnexion = { deuxiemeFacteurRequis: true } | AuthResponse;

/**
 * LA CASE VOYAGE AVEC LE CODE, COMME LE MOT DE PASSE (audit final F270) · le
 * serveur ne garde aucun état entre l'appel qui réclame le second facteur et
 * celui qui le porte, et c'est au second qu'il décide de la durée de la
 * session. Une case perdue en route ouvrirait une session courte à qui l'a
 * cochée.
 */
export function corpsConnexion(s: {
  email: string;
  motDePasse: string;
  resterConnecte: boolean;
  codeRequis: boolean;
  code: string;
}) {
  return {
    email: s.email,
    motDePasse: s.motDePasse,
    resterConnecte: s.resterConnecte,
    ...(s.codeRequis && s.code.trim() ? { code: s.code.trim() } : {}),
  };
}

export type IssueConnexion =
  | { etape: 'CODE_REQUIS' }
  /**
   * `avis` · la session s'est ouverte, mais pas comme demandé. La console de
   * l'éditeur n'admet pas « Rester connecté » · le serveur ouvre alors une
   * session COURTE et dit pourquoi (`motifSessionCourte`). L'écran le dit en
   * une ligne avant d'entrer, sans quoi l'opérateur croirait sa session
   * gardée trente jours et la verrait se fermer avec le navigateur.
   */
  | { etape: 'OUVERTE'; csrfToken: string; avis: string | null };

export function issueConnexion(res: ReponseConnexion): IssueConnexion {
  if ('deuxiemeFacteurRequis' in res) return { etape: 'CODE_REQUIS' };
  return { etape: 'OUVERTE', csrfToken: res.csrfToken, avis: res.motifSessionCourte ?? null };
}

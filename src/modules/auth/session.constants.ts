import { CookieOptions } from 'express';

/**
 * SESSION EN COOKIE httpOnly · le jeton de session ne passe plus par
 * localStorage : un script injecté (XSS) ne peut pas lire un cookie
 * httpOnly, là où localStorage lui était ouvert. Contreparties assumées :
 *
 * - SameSite=None + Secure : le client (oomega.web.app) et l'API (Cloud
 *   Run) sont des origines différentes, le cookie doit voyager en
 *   inter-site. None exige Secure ; les navigateurs modernes acceptent un
 *   cookie Secure sur http://localhost (origine réputée sûre), le
 *   développement local n'est donc pas cassé.
 * - Qui dit cookie inter-site dit CSRF : chaque jeton de session porte un
 *   jeton CSRF apparié (claim `csrf` du JWT), que le client renvoie en
 *   en-tête X-CSRF-Token · JwtStrategy exige la correspondance sur toute
 *   requête MUTANTE portée par le cookie (voir jwt.strategy.ts).
 */
export const COOKIE_SESSION = 'omegax_session';

/** En-tête porteur du jeton CSRF apparié au cookie de session. */
export const ENTETE_CSRF = 'x-csrf-token';

// 8 heures · aligné sur JWT_EXPIRES_IN (le cookie n'est qu'un véhicule, la
// vraie échéance est celle du JWT qu'il transporte).
export const OPTIONS_COOKIE_SESSION: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
  maxAge: 8 * 60 * 60 * 1000,
};

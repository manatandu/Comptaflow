import { CookieOptions, Response } from 'express';
import { estSurSite } from '../../common/mode-installation';

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
export const COOKIE_SESSION = '__session';

/**
 * LE NOM `__session` N'EST PAS UN CHOIX DE STYLE. Le site sert l'API sous sa
 * propre adresse (oomega.web.app/api, relayé par Firebase Hosting vers Cloud
 * Run), pour que le cookie de session soit un cookie DU SITE et non un cookie
 * tiers · les navigateurs de l'iPhone jettent tout cookie tiers, et la
 * connexion y « réussissait » pour être aussitôt perdue. Or Firebase Hosting
 * retire des requêtes relayées TOUS les cookies sauf celui qui porte ce nom.
 * L'ancien nom reste LU le temps que les sessions ouvertes sous lui expirent
 * (huit heures au plus).
 */
export const ANCIEN_COOKIE_SESSION = 'omegax_session';

/** En-tête porteur du jeton CSRF apparié au cookie de session. */
export const ENTETE_CSRF = 'x-csrf-token';

// SANS `maxAge` NI `expires` (audit final F270) · un cookie DE SESSION, que le
// navigateur jette à sa fermeture. Il portait huit heures jusque-là, et une
// session laissée sur un poste partagé s'y rouvrait au lancement suivant. La
// durée d'une session « Rester connecté » se pose au cas par cas
// (`poserCookieSession`), jamais ici · la vraie échéance reste celle du JWT
// que le cookie transporte.
export const OPTIONS_COOKIE_SESSION: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
};

/**
 * SUR SITE, LE COOKIE CHANGE DE RÉGIME · l'interface et l'API y sont la MÊME
 * origine, servies en http sur le réseau local (http://192.168.1.10:8080). Un
 * navigateur refuse un cookie `Secure` sur une origine http qui n'est pas
 * localhost : garder le régime en ligne, c'était une connexion qui « réussit »
 * côté serveur et une session que le navigateur jette, depuis tous les postes
 * du bureau sauf la machine serveur elle-même. `lax` suffit, rien ne voyage
 * plus entre deux sites · le jeton CSRF reste exigé, il ne coûte rien.
 */
export function optionsCookieSession(surSite = estSurSite(), httpLocal = false): CookieOptions {
  return surSite || httpLocal ? { ...OPTIONS_COOKIE_SESSION, secure: false, sameSite: 'lax' } : OPTIONS_COOKIE_SESSION;
}

/**
 * UNE REQUÊTE EN HTTP SUR CETTE MACHINE MÊME · le développement et les tests
 * navigateur. WebKit (le moteur de l'iPhone) refuse un cookie `Secure` sur
 * http://localhost là où Chrome l'accepte · sans cette exception, les tests
 * sous WebKit ne pourraient pas ouvrir de session. Jamais vrai en production,
 * servie en https sous un nom qui n'est pas localhost.
 */
export function estHttpLocal(req?: { secure?: boolean; hostname?: string } | null): boolean {
  return !!req && !req.secure && ['localhost', '127.0.0.1', '::1'].includes(req.hostname ?? '');
}

/**
 * LE SEUL ENDROIT OÙ LE COOKIE DE SESSION SE POSE (audit final F270) · la
 * connexion, les réémissions du contrôleur et la prolongation de
 * `JwtAuthGuard` passent toutes par lui, si bien que les deux régimes ne
 * peuvent pas diverger d'un chemin à l'autre. `maxAgeMs` nul · cookie de
 * session, fermé avec le navigateur ; sinon la durée de la session longue,
 * calculée par `emettreSession` et jamais ailleurs.
 */
export function poserCookieSession(res: Response, jeton: string, maxAgeMs: number | null): void {
  const base = optionsCookieSession(estSurSite(), estHttpLocal(res.req));
  res.cookie(COOKIE_SESSION, jeton, maxAgeMs === null ? base : { ...base, maxAge: maxAgeMs });
}

/** Fait tomber le cookie de session, et l'ancien nom avec lui. */
export function effacerCookiesSession(res: Response): void {
  const base = { ...optionsCookieSession(estSurSite(), estHttpLocal(res.req)), maxAge: undefined };
  res.clearCookie(COOKIE_SESSION, base);
  res.clearCookie(ANCIEN_COOKIE_SESSION, base);
}

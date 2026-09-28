import { INestApplication } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import { static as servirFichiers } from 'express';
import { Response } from 'express';

/**
 * SUR SITE, LE SERVEUR SERT AUSSI L'INTERFACE · il n'y a pas de Firebase chez
 * le client. L'interface et l'API partagent donc l'origine
 * (http://poste-serveur:8080), ce qui dispense de CORS et règle le cookie en
 * `lax` (voir `optionsCookieSession`).
 *
 * POSÉ AVANT `configurerApplication`, ET C'EST LA RAISON D'ÊTRE DE CE FICHIER ·
 * helmet y pose sur TOUTES les réponses la politique de l'API
 * (`default-src 'none'`), qui interdirait au navigateur d'exécuter le moindre
 * script de l'interface. Le fichier statique répond ici et n'atteint jamais
 * helmet ; ce qui n'est pas un fichier (toutes les routes de l'API) continue
 * sa route et reçoit la politique stricte. Les en-têtes de l'interface
 * reprennent ceux de `client/firebase.json` À L'IDENTIQUE, `connect-src 'self'`
 * compris · l'API est à la même origine ici, et le site publié l'appelle lui
 * aussi sous la sienne depuis le relais `/api` du 2026-09-26. La politique du
 * site portait jusqu'au 2026-09-28 l'adresse de Cloud Run, que celle-ci
 * retirait (audit final F264) ; `configuration-a-jour.spec.ts` tient les deux
 * égales.
 */
export const POLITIQUE_INTERFACE =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; " +
  "object-src 'none'; manifest-src 'self'; worker-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

export function entetesInterface(res: Response, chemin: string) {
  res.setHeader('Content-Security-Policy', POLITIQUE_INTERFACE);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Les fichiers nommés par leur empreinte ne changent jamais ; la page
  // d'entrée, elle, doit être relue à chaque mise à jour du poste.
  const immuable = /[\\/](assets|polices)[\\/]/.test(chemin);
  res.setHeader('Cache-Control', immuable ? 'public, max-age=31536000, immutable' : 'no-cache');
}

export function servirInterfaceSurSite(app: INestApplication, dossier: string | undefined): boolean {
  if (!dossier || !existsSync(join(dossier, 'index.html'))) return false;
  app.use(servirFichiers(dossier, { index: 'index.html', setHeaders: entetesInterface }));
  return true;
}

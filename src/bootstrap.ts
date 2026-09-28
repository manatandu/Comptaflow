import { INestApplication, ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import { sautsDeConfiance } from './common/sauts-de-confiance';

/**
 * L'API SOUS L'ADRESSE DU SITE · Firebase Hosting relaie oomega.web.app/api/**
 * vers Cloud Run en gardant le chemin entier. Le préfixe est retiré ici, et
 * les routes restent les mêmes · un appel direct à l'adresse de Cloud Run
 * (sans préfixe) continue donc de marcher, ce qui rend la bascule sans coupure.
 */
export function retirerPrefixeApi(url: string): string {
  if (url === '/api') return '/';
  if (url.startsWith('/api?')) return `/${url.slice(4)}`;
  return url.startsWith('/api/') ? url.slice(4) : url;
}

/**
 * Configuration commune de l'application (CORS, taille du corps,
 * validation), appelée par `main.ts`. Elle vivait à part pour être partagée
 * avec un point d'entrée Vercel, retiré le 2026-09-27 (audit du serveur,
 * C11) · le déploiement est Cloud Run seul, et le script `vercel-build`
 * aurait appliqué les migrations par une seconde chaîne si un projet Vercel
 * était resté relié au dépôt. Ce commentaire était posé au-dessus de
 * `retirerPrefixeApi`, dont il semblait être la documentation (audit final
 * F264).
 */
export function configurerApplication(app: INestApplication) {
  app.use((req: { url: string }, _res: unknown, next: () => void) => {
    req.url = retirerPrefixeApi(req.url);
    next();
  });
  // DURCISSEMENT · l'API ne sert que du JSON à un client connu, jamais de
  // pages HTML : la politique la plus stricte ne casse donc rien.
  //
  // - helmet pose les en-têtes défensifs (X-Content-Type-Options, HSTS,
  //   Referrer-Policy, X-Frame-Options…). La CSP est réglée sur `none` pour
  //   tout : si une réponse de l'API se retrouvait interprétée comme du HTML
  //   (réflexion d'une erreur, mauvais Content-Type forcé), rien ne pourrait
  //   s'y exécuter.
  // - `trust proxy` : derrière Firebase Hosting et Cloud Run, l'adresse du
  //   client arrive dans X-Forwarded-For. Sans le bon nombre de relais, toute
  //   limitation par adresse (le ThrottlerGuard) compterait l'adresse d'un
  //   relais Google, donc une poignée d'adresses pour tous les utilisateurs ·
  //   voir sauts-de-confiance.ts.
  // - compression : les réponses JSON d'un dossier réel (plan de comptes,
  //   balance, grand livre) pèsent des centaines de Ko · les compresser
  //   change la vitesse perçue sur une connexion congolaise typique.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  // Le nombre de relais de confiance vient d'une seule règle (sauts-de-confiance.ts) ·
  // zéro vaut `false`, jamais « tout croire ».
  app.getHttpAdapter().getInstance().set('trust proxy', sautsDeConfiance() || false);
  app.use(compression());
  // 12 Mo : l'import de balance et d'écritures envoie le fichier encodé en
  // base64 dans le corps JSON (voir ImportService), ce qui déborde largement
  // la limite de 100 ko d'Express. Le DTO borne le contenu à 8 Mo de fichier ;
  // cette marge couvre l'encodage et le reste du corps.
  app.use(json({ limit: '12mb' }));
  app.use(urlencoded({ extended: true, limit: '12mb' }));
  // Session en cookie httpOnly (voir auth/session.constants.ts) · le
  // parseur rend req.cookies lisible par JwtStrategy.
  app.use(cookieParser());
  // En développement (CORS_ORIGIN absent), tout est autorisé. En production,
  // restreindre au(x) domaine(s) du client évite qu'un site tiers appelle
  // l'API avec les identifiants d'un utilisateur connecté. Séparateur
  // virgule pour plusieurs domaines (ex. un domaine personnalisé en plus des
  // deux domaines Firebase ci-dessous · l'exemple d'un domaine Vercel est
  // retiré avec Vercel, audit final F264).
  //
  // Les deux domaines que Firebase Hosting sert sont admis D'OFFICE, en plus
  // de CORS_ORIGIN : ce sont les adresses fixes du site, elles ne dépendent
  // d'aucun réglage. Les faire reposer sur une variable d'environnement
  // signifiait qu'une variable oubliée sur une cible de déploiement coupait
  // le site entier · panne muette côté navigateur (le serveur répond, le
  // navigateur jette la réponse), donc longue à diagnostiquer.
  const ORIGINES_SITE = ['https://oomega.web.app', 'https://oomega.firebaseapp.com'];
  const configurees = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  // En production, l'absence de CORS_ORIGIN ne doit JAMAIS vouloir dire
  // « tout le monde » : le repli est la liste fermée des domaines du site.
  // Seul le développement local (NODE_ENV ≠ production) reste ouvert.
  const enProduction = process.env.NODE_ENV === 'production';
  const origines = configurees
    ? [...new Set([...configurees, ...ORIGINES_SITE])]
    : enProduction
      ? ORIGINES_SITE
      : undefined;
  // credentials · le cookie de session ne voyage en inter-site que si le
  // serveur l'autorise explicitement, ET pour une origine NOMMÉE (jamais
  // `*`, que les navigateurs refusent avec credentials) · en développement,
  // `origin: true` reflète l'origine appelante, ce qui reste nominatif.
  app.enableCors(optionsCors(origines));
  // whitelist: rejette tout champ non déclaré dans un DTO · évite qu'un client
  // injecte silencieusement un champ (ex: tenantId) qui devrait venir du JWT.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  return app;
}

/**
 * LE CONTRÔLE PRÉALABLE CORS SE MET EN CACHE · `maxAge`.
 *
 * Quand le site et l'API sont deux origines, toute écriture (JSON, jeton
 * CSRF) est précédée d'une requête OPTIONS. Sans `Access-Control-Max-Age`,
 * Chrome n'en garde la réponse que CINQ SECONDES, si bien que presque chaque
 * écriture coûtait deux allers-retours entre Kinshasa et us-east1 au lieu
 * d'un. 7 200 secondes est le plafond de Chrome (Firefox en admet davantage) :
 * au delà, la valeur est ramenée à 7 200, pas refusée.
 *
 * CE N'EST PLUS LE CAS DU SITE PUBLIÉ (audit final F264) · depuis le
 * 2026-09-26, Firebase Hosting relaie oomega.web.app/api/** vers Cloud Run
 * (`client/firebase.json`, `client/.env.production`), et le site appelle
 * l'API sous sa propre origine, sans contrôle préalable. Le cache sert encore
 * là où deux origines demeurent · le développement local (Vite sur 5173,
 * serveur sur 3000) et un appel direct à l'adresse de Cloud Run.
 *
 * Le cache ne relâche rien : il porte sur la réponse au contrôle (origine,
 * méthodes, en-têtes admis), pas sur les données, et il est propre à chaque
 * origine appelante.
 */
export const DUREE_CACHE_CONTROLE_CORS = 7200;

export function optionsCors(origines: string[] | undefined) {
  return {
    origin: origines ?? true,
    credentials: true,
    maxAge: DUREE_CACHE_CONTROLE_CORS,
  };
}

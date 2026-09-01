import { INestApplication, ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';

/**
 * Configuration commune de l'application, partagée entre le serveur classique
 * (`main.ts`, `app.listen()` · développement local, Cloud Run) et le point
 * d'entrée serverless (`api/index.ts`, `app.init()` sans écoute de port ·
 * Vercel). Les deux doivent rester STRICTEMENT identiques : une divergence
 * entre eux (une limite de taille, une règle CORS) serait un comportement
 * qui change selon la cible de déploiement, invisible à la relecture du code
 * métier.
 */
export function configurerApplication(app: INestApplication) {
  // DURCISSEMENT · l'API ne sert que du JSON à un client connu, jamais de
  // pages HTML : la politique la plus stricte ne casse donc rien.
  //
  // - helmet pose les en-têtes défensifs (X-Content-Type-Options, HSTS,
  //   Referrer-Policy, X-Frame-Options…). La CSP est réglée sur `none` pour
  //   tout : si une réponse de l'API se retrouvait interprétée comme du HTML
  //   (réflexion d'une erreur, mauvais Content-Type forcé), rien ne pourrait
  //   s'y exécuter.
  // - `trust proxy` : derrière Cloud Run, l'adresse du client arrive dans
  //   X-Forwarded-For. Sans ce réglage, toute limitation par adresse (le
  //   ThrottlerGuard) compterait l'adresse du proxy Google, donc UNE seule
  //   adresse pour tous les utilisateurs · le premier arrivé épuiserait le
  //   quota du monde entier.
  // - compression : les réponses JSON d'un dossier réel (plan de comptes,
  //   balance, grand livre) pèsent des centaines de Ko · les compresser
  //   change la vitesse perçue sur une connexion congolaise typique.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
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
  // virgule pour plusieurs domaines (ex. domaine Vercel par défaut + domaine
  // personnalisé).
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
  app.enableCors(origines ? { origin: origines, credentials: true } : { origin: true, credentials: true });
  // whitelist: rejette tout champ non déclaré dans un DTO · évite qu'un client
  // injecte silencieusement un champ (ex: tenantId) qui devrait venir du JWT.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  return app;
}

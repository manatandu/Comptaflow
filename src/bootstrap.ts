import { INestApplication, ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';

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
  // 12 Mo : l'import de balance et d'écritures envoie le fichier encodé en
  // base64 dans le corps JSON (voir ImportService), ce qui déborde largement
  // la limite de 100 ko d'Express. Le DTO borne le contenu à 8 Mo de fichier ;
  // cette marge couvre l'encodage et le reste du corps.
  app.use(json({ limit: '12mb' }));
  app.use(urlencoded({ extended: true, limit: '12mb' }));
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
  const origines = configurees ? [...new Set([...configurees, ...ORIGINES_SITE])] : undefined;
  app.enableCors(origines ? { origin: origines } : undefined);
  // whitelist: rejette tout champ non déclaré dans un DTO · évite qu'un client
  // injecte silencieusement un champ (ex: tenantId) qui devrait venir du JWT.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  return app;
}

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // 12 Mo : l'import de balance et d'écritures envoie le fichier encodé en
  // base64 dans le corps JSON (voir ImportService), ce qui déborde largement
  // la limite de 100 ko d'Express. Le DTO borne le contenu à 8 Mo de fichier ;
  // cette marge couvre l'encodage et le reste du corps.
  app.use(json({ limit: '12mb' }));
  app.use(urlencoded({ extended: true, limit: '12mb' }));
  // En développement (CORS_ORIGIN absent), tout est autorisé. En production
  // (déploiement Firebase Hosting + Cloud Run), restreindre au(x) domaine(s)
  // du client évite qu'un site tiers appelle l'API avec les identifiants
  // d'un utilisateur connecté. Séparateur virgule pour plusieurs domaines
  // (ex. domaine par défaut *.web.app + domaine personnalisé Workspace).
  const origines = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim());
  app.enableCors(origines ? { origin: origines } : undefined);
  // whitelist: rejette tout champ non déclaré dans un DTO · évite qu'un client
  // injecte silencieusement un champ (ex: tenantId) qui devrait venir du JWT.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // En développement (CORS_ORIGIN absent), tout est autorisé. En production
  // (déploiement Firebase Hosting + Cloud Run), restreindre au(x) domaine(s)
  // du client évite qu'un site tiers appelle l'API avec les identifiants
  // d'un utilisateur connecté. Séparateur virgule pour plusieurs domaines
  // (ex. domaine par défaut *.web.app + domaine personnalisé Workspace).
  const origines = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim());
  app.enableCors(origines ? { origin: origines } : undefined);
  // whitelist: rejette tout champ non déclaré dans un DTO — évite qu'un client
  // injecte silencieusement un champ (ex: tenantId) qui devrait venir du JWT.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();

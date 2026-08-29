import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurerApplication } from './bootstrap';

/**
 * Serveur classique · développement local et toute cible qui héberge un
 * processus long (Cloud Run, un conteneur). Écoute sur `process.env.PORT`.
 * Le point d'entrée Vercel (`api/index.ts`) réutilise `configurerApplication`
 * mais n'écoute jamais de port : Vercel invoque la fonction requête par
 * requête.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configurerApplication(app);
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();

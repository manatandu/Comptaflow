import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurerApplication } from './bootstrap';
import { estSurSite } from './common/mode-installation';
import { servirInterfaceSurSite } from './modules/sur-site/interface-sur-site';

/**
 * Serveur classique · développement local et toute cible qui héberge un
 * processus long (Cloud Run, un conteneur, le poste d'un client sur site).
 * Écoute sur `process.env.PORT`. Le point d'entrée Vercel (`api/index.ts`)
 * réutilise `configurerApplication` mais n'écoute jamais de port : Vercel
 * invoque la fonction requête par requête.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Sur site, l'interface est servie AVANT la configuration commune · voir
  // interface-sur-site.ts pour la raison (la politique de sécurité de l'API).
  if (estSurSite() && !servirInterfaceSurSite(app, process.env.DOSSIER_INTERFACE)) {
    new Logger('SurSite').warn('DOSSIER_INTERFACE absent ou sans index.html · l’interface n’est pas servie par ce poste.');
  }
  configurerApplication(app);
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();

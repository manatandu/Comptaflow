import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'http';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
import { AppModule } from '../src/app.module';
import { configurerApplication } from '../src/bootstrap';

/**
 * Point d'entrée Vercel · une fonction Node serverless par requête, pas un
 * serveur qui écoute un port (voir `src/main.ts` pour ce cas-là). Toute la
 * configuration métier (CORS, taille du corps, validation) vient de
 * `configurerApplication`, PARTAGÉE avec `main.ts` : les deux cibles doivent
 * se comporter identiquement, une divergence serait invisible à la relecture
 * du code métier.
 *
 * L'application Nest est construite UNE SEULE FOIS par instance de fonction
 * et réutilisée entre les invocations (« warm start ») : la reconstruire à
 * chaque requête rouvrirait une connexion Prisma à chaque fois, ce que la
 * base (Neon, en pool limité) ne supporterait pas sous charge.
 */
const serveurExpress = express();
let applicationPrete: Promise<void> | null = null;

async function demarrer(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(serveurExpress));
  configurerApplication(app);
  await app.init();
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!applicationPrete) {
    applicationPrete = demarrer();
  }
  await applicationPrete;
  serveurExpress(req, res);
}

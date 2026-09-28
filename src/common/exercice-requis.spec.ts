import 'reflect-metadata';
import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { EXERCICE_REQUIS, MESSAGE_EXERCICE_REQUIS, exigerExercice } from './exercice-requis';

/**
 * UN SEUL PORTEUR POUR L'EXERCICE EXIGÉ.
 *
 * Le pipe vivait en huit copies, et la huitième disait déjà autre chose que
 * les sept autres. Ce spec relit les MÉTADONNÉES que Nest lit lui-même pour
 * câbler une route (ROUTE_ARGS_METADATA), contrôleur par contrôleur : tout
 * `ParseUUIDPipe` posé sur un paramètre `exerciceId`, en requête comme en
 * chemin, doit être l'instance du porteur. Une copie locale, même au message
 * identique, fait tomber le test · c'est ce que le code FAIT qui est lu, pas
 * la forme de sa source, si bien qu'un commentaire ou un saut de ligne ne le
 * trompe pas.
 */

type Arg = { index: number; data?: unknown; pipes?: unknown[] };

function fichiersControleurs(dossier: string): string[] {
  const trouves: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiersControleurs(chemin));
    else if (nom.endsWith('.controller.ts')) trouves.push(chemin);
  }
  return trouves;
}

type RouteExercice = { route: string; pipes: unknown[] };

function routesExercice(): { fichiers: number; sansControleur: string[]; routes: RouteExercice[] } {
  const racine = join(__dirname, '..');
  const fichiers = fichiersControleurs(racine);
  const sansControleur: string[] = [];
  const routes: RouteExercice[] = [];
  for (const fichier of fichiers) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exports = require(fichier) as Record<string, unknown>;
    let controleurs = 0;
    for (const exporte of Object.values(exports)) {
      if (typeof exporte !== 'function' || Reflect.getMetadata(PATH_METADATA, exporte) === undefined) continue;
      controleurs++;
      const prototype = (exporte as { prototype: Record<string, unknown> }).prototype;
      for (const methode of Object.getOwnPropertyNames(prototype)) {
        if (methode === 'constructor') continue;
        const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, exporte, methode) ?? {}) as Record<string, Arg>;
        for (const [cle, arg] of Object.entries(args)) {
          const type = Number(cle.split(':')[0]);
          if (type !== RouteParamtypes.QUERY && type !== RouteParamtypes.PARAM) continue;
          if (arg.data !== 'exerciceId') continue;
          routes.push({ route: `${relative(racine, fichier)} ${methode}`, pipes: arg.pipes ?? [] });
        }
      }
    }
    if (controleurs === 0) sansControleur.push(relative(racine, fichier));
  }
  return { fichiers: fichiers.length, sansControleur, routes };
}

describe('EXERCICE_REQUIS · un seul porteur', () => {
  // Chargé une fois · les contrôleurs tirent la plupart des services.
  let lecture: ReturnType<typeof routesExercice>;
  beforeAll(() => {
    lecture = routesExercice();
  }, 120_000);

  it('le recensement lit chaque fichier de contrôleur et trouve des routes gardées (un garde-fou vide ne garde rien)', () => {
    // Un fichier `.controller.ts` dont aucun export ne porte @Controller
    // échapperait à la lecture sans rien dire · il est nommé.
    expect(lecture.sansControleur).toEqual([]);
    expect(lecture.fichiers).toBeGreaterThan(60);
    const gardees = lecture.routes.filter((r) => r.pipes.includes(EXERCICE_REQUIS));
    // Soixante-dix-sept au 2026-09-28 · le plancher dit seulement que la
    // lecture des métadonnées rend encore quelque chose.
    expect(gardees.length).toBeGreaterThanOrEqual(70);
  });

  it('aucun contrôleur ne redéclare un ParseUUIDPipe pour exerciceId hors du porteur', () => {
    const copies = lecture.routes
      .filter((r) =>
        r.pipes.some((p) => p !== EXERCICE_REQUIS && (p === ParseUUIDPipe || p instanceof ParseUUIDPipe)),
      )
      .map((r) => r.route);
    expect(copies).toEqual([]);
  });

  it('refuse un exercice absent, vide ou illisible par un 400 nommé, laisse passer un identifiant', async () => {
    const meta = { type: 'query' as const, data: 'exerciceId' };
    for (const v of [undefined, '', 'ex-2026', '1']) {
      const refus = await EXERCICE_REQUIS.transform(v as unknown as string, meta).catch((e: unknown) => e);
      expect(refus).toBeInstanceOf(BadRequestException);
      expect((refus as BadRequestException).message).toBe(MESSAGE_EXERCICE_REQUIS);
    }
    const id = '0b5f9c1e-3a4d-4c2b-9f1e-2a7d6c8b1e30';
    await expect(EXERCICE_REQUIS.transform(id, meta)).resolves.toBe(id);
  });

  it('exigerExercice refuse au service ce que la route aurait refusé', () => {
    for (const v of [undefined, null, '', '   ', 3]) {
      expect(() => exigerExercice(v)).toThrow(MESSAGE_EXERCICE_REQUIS);
    }
    expect(() => exigerExercice('0b5f9c1e-3a4d-4c2b-9f1e-2a7d6c8b1e30')).not.toThrow();
  });
});

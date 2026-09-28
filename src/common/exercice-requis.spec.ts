import 'reflect-metadata';
import { BadRequestException, ParseUUIDPipe, PipeTransform } from '@nestjs/common';
import { PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  EXERCICE_FACULTATIF,
  EXERCICE_REQUIS,
  MESSAGE_EXERCICE_ILLISIBLE,
  MESSAGE_EXERCICE_REQUIS,
  exigerExercice,
} from './exercice-requis';

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
 *
 * ET AUCUN `exerciceId` NE PASSE SANS PORTEUR (audit final F234, suite). Dix-
 * neuf contrôleurs lisaient encore `@Query('exerciceId')` ou
 * `@Param('exerciceId')` nu · un scalaire échappe au ValidationPipe global,
 * l'identifiant absent arrivait `undefined` à Prisma, qui IGNORE le champ, et
 * la lecture portait sur tous les exercices du dossier. Chaque paramètre
 * porte désormais le porteur REQUIS, ou le FACULTATIF sur une route de la
 * liste fermée ci-dessous, chacune avec son motif · un paramètre nouveau sans
 * l'un ni l'autre fait tomber le test, et un facultatif posé ailleurs aussi.
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

type RouteExercice = { route: string; type: 'query' | 'param'; pipes: unknown[] };

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
          routes.push({
            route: `${relative(racine, fichier)} ${methode}`,
            type: type === RouteParamtypes.QUERY ? 'query' : 'param',
            pipes: arg.pipes ?? [],
          });
        }
      }
    }
    if (controleurs === 0) sansControleur.push(relative(racine, fichier));
  }
  return { fichiers: fichiers.length, sansControleur, routes };
}

/**
 * LES SEULES ROUTES OÙ L'EXERCICE EST FACULTATIF, chacune avec son motif. La
 * liste est FERMÉE · une route qui a besoin d'un exercice pour que sa lecture
 * ait un sens porte le porteur requis, et y poser le facultatif « pour ne rien
 * casser » rouvrirait exactement la lecture de tous les exercices que F234
 * ferme. Ajouter une ligne ici oblige à écrire pourquoi la route a un sens
 * sans exercice.
 */
const ROUTES_A_EXERCICE_FACULTATIF: Record<string, string> = {
  'modules/comptabilite/ecriture.controller.ts lister':
    "le journal se filtre aussi par dates, et `perimetreJournal` n'ajoute le filtre d'exercice que s'il est nommé",
  'modules/exports/export.controller.ts journal':
    "même périmètre que la fenêtre du journal · sans exercice, le classeur se titre « Toutes périodes »",
  'modules/questionnaire/questionnaire.controller.ts lister':
    'la liste des questionnaires du dossier, chacun portant son exercice',
  'modules/inventaire/inventaire.controller.ts lister':
    "la liste des campagnes d'inventaire du dossier, chacune portant son exercice",
  'modules/faiblesses/faiblesses.controller.ts lister':
    'la liste des registres de faiblesses du dossier, chacun portant son exercice',
  'modules/circularisation/circularisation.controller.ts lister':
    'la liste des campagnes de circularisation du dossier, chacune portant son exercice',
};

/** Joue les pipes de la route comme Nest les joue, dans l'ordre. */
async function jouer(pipes: unknown[], valeur: unknown, type: 'query' | 'param'): Promise<unknown> {
  let courant = valeur;
  for (const pipe of pipes as PipeTransform[]) {
    courant = await pipe.transform(courant, { type, data: 'exerciceId' });
  }
  return courant;
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
    // Cent vingt au 2026-09-28, soixante-dix-sept avant la suite de F234 ·
    // le plancher dit seulement que la lecture des métadonnées rend encore
    // quelque chose, et qu'aucune route gardée n'a perdu son porteur.
    expect(gardees.length).toBeGreaterThanOrEqual(120);
    expect(lecture.routes.filter((r) => r.pipes.includes(EXERCICE_FACULTATIF)).length).toBeGreaterThan(0);
  });

  it('aucun contrôleur ne redéclare un ParseUUIDPipe pour exerciceId hors des deux porteurs', () => {
    const copies = lecture.routes
      .filter((r) =>
        r.pipes.some(
          (p) =>
            p !== EXERCICE_REQUIS &&
            p !== EXERCICE_FACULTATIF &&
            (p === ParseUUIDPipe || p instanceof ParseUUIDPipe),
        ),
      )
      .map((r) => r.route);
    expect(copies).toEqual([]);
  });

  it('aucun exerciceId, en requête comme en chemin, ne passe sans porteur', () => {
    const nus = lecture.routes
      .filter((r) => !r.pipes.includes(EXERCICE_REQUIS) && !r.pipes.includes(EXERCICE_FACULTATIF))
      .map((r) => r.route);
    expect(nus).toEqual([]);
    // Et jamais les deux à la fois · le facultatif laisserait passer l'absence
    // que le requis refuse, selon l'ordre des pipes.
    expect(
      lecture.routes.filter((r) => r.pipes.includes(EXERCICE_REQUIS) && r.pipes.includes(EXERCICE_FACULTATIF)),
    ).toEqual([]);
  });

  it('le porteur facultatif ne vit que sur la liste fermée de ses routes, et jamais sur un chemin', () => {
    const facultatives = lecture.routes.filter((r) => r.pipes.includes(EXERCICE_FACULTATIF));
    // Un paramètre de chemin est toujours présent · le dire facultatif
    // laisserait passer « undefined » écrit en toutes lettres dans l'adresse.
    expect(facultatives.filter((r) => r.type === 'param').map((r) => r.route)).toEqual([]);
    expect(facultatives.map((r) => r.route).sort()).toEqual(Object.keys(ROUTES_A_EXERCICE_FACULTATIF).sort());
    for (const motif of Object.values(ROUTES_A_EXERCICE_FACULTATIF)) expect(motif.length).toBeGreaterThan(20);
  });

  it('chaque route, jouée comme Nest la joue, refuse un identifiant illisible par un 400 nommé', async () => {
    // Le refus est VÉRIFIÉ sur les pipes de la route, pas seulement leur
    // présence · « undefined » est ce qu'un écran envoie quand il interpole un
    // exercice pas encore choisi.
    const id = '0b5f9c1e-3a4d-4c2b-9f1e-2a7d6c8b1e30';
    for (const r of lecture.routes) {
      const facultative = r.pipes.includes(EXERCICE_FACULTATIF);
      const message = facultative ? MESSAGE_EXERCICE_ILLISIBLE : MESSAGE_EXERCICE_REQUIS;
      for (const v of ['undefined', '', 'ex-2026']) {
        const refus = await jouer(r.pipes, v, r.type).catch((e: unknown) => e);
        expect({ route: r.route, v, refus: refus instanceof BadRequestException ? refus.message : refus }).toEqual({
          route: r.route,
          v,
          refus: message,
        });
      }
      const absent = await jouer(r.pipes, undefined, r.type).catch((e: unknown) => e);
      expect({ route: r.route, absent: absent instanceof BadRequestException ? absent.message : absent }).toEqual({
        route: r.route,
        absent: facultative ? undefined : MESSAGE_EXERCICE_REQUIS,
      });
      await expect(jouer(r.pipes, id, r.type)).resolves.toBe(id);
    }
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

  it('le porteur facultatif laisse passer l’absence, jamais un identifiant illisible', async () => {
    const meta = { type: 'query' as const, data: 'exerciceId' };
    await expect(EXERCICE_FACULTATIF.transform(undefined as unknown as string, meta)).resolves.toBeUndefined();
    for (const v of ['', 'undefined', 'ex-2026', '1']) {
      const refus = await EXERCICE_FACULTATIF.transform(v, meta).catch((e: unknown) => e);
      expect(refus).toBeInstanceOf(BadRequestException);
      expect((refus as BadRequestException).message).toBe(MESSAGE_EXERCICE_ILLISIBLE);
    }
    const id = '0b5f9c1e-3a4d-4c2b-9f1e-2a7d6c8b1e30';
    await expect(EXERCICE_FACULTATIF.transform(id, meta)).resolves.toBe(id);
  });

  it('exigerExercice refuse au service ce que la route aurait refusé', () => {
    for (const v of [undefined, null, '', '   ', 3]) {
      expect(() => exigerExercice(v)).toThrow(MESSAGE_EXERCICE_REQUIS);
    }
    expect(() => exigerExercice('0b5f9c1e-3a4d-4c2b-9f1e-2a7d6c8b1e30')).not.toThrow();
  });
});

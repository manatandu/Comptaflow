import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { getMetadataStorage } from 'class-validator';
import type { MetadataStorage } from 'class-transformer/types/MetadataStorage';

// Le registre de `@Type(() => …)` n'est pas exporté par l'entrée publique de
// class-transformer · c'est celui que `ValidationPipe` relit à chaque requête.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { defaultMetadataStorage } = require('class-transformer/cjs/storage') as {
  defaultMetadataStorage: MetadataStorage;
};

/**
 * TOUT DTO DU MODULE ANALYTIQUE EST REÇU PAR UNE ROUTE (audit final F230).
 *
 * Deux DTO décrivaient une ventilation PAR LOT (`VentilerLotDto`, et la ligne
 * qu'il imbriquait) sans qu'aucun contrôleur ne les reçoive. Un troisième,
 * `ListerEngagementsDto`, décrivait un filtre que la route lit en paramètre
 * nommé. Rien ne casse · mais un DTO sans route se lit comme une capacité
 * servie, et la validation qu'il porte ne s'applique nulle part.
 *
 * Le recensement se fait sur les MÉTADONNÉES, pas sur le texte des fichiers ·
 * les classes exportées par les fichiers `dto/`, les paramètres `@Body()` et
 * `@Query()` que Nest a enregistrés sur les méthodes des contrôleurs du
 * module, puis, de proche en proche, les types que `@Type(() => …)` imbrique
 * dans un DTO déjà reçu. Un DTO imbriqué dans un DTO mort est mort lui aussi ·
 * c'était le cas de la ligne du lot.
 */

const DOSSIER_DTO = __dirname;
const DOSSIER_MODULE = path.join(__dirname, '..');

type Classe = new (...args: unknown[]) => unknown;

function classesExportees(fichiers: string[]): Map<Classe, string> {
  const classes = new Map<Classe, string>();
  for (const fichier of fichiers) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const exporte = require(fichier) as Record<string, unknown>;
    for (const [nom, valeur] of Object.entries(exporte)) {
      if (typeof valeur === 'function' && /^class\s/.test(Function.prototype.toString.call(valeur))) {
        classes.set(valeur as Classe, `${path.basename(fichier)} · ${nom}`);
      }
    }
  }
  return classes;
}

function fichiersDuDossier(dossier: string, suffixe: RegExp): string[] {
  return fs
    .readdirSync(dossier)
    .filter((f) => suffixe.test(f) && !f.endsWith('.spec.ts'))
    .map((f) => path.join(dossier, f));
}

/** Les classes que les routes reçoivent en corps ou en requête entière. */
function recuesParLesRoutes(controleurs: Classe[]): Set<Classe> {
  const recues = new Set<Classe>();
  for (const controleur of controleurs) {
    const proto = controleur.prototype as Record<string, unknown>;
    for (const methode of Object.getOwnPropertyNames(proto)) {
      if (methode === 'constructor') continue;
      const types = (Reflect.getMetadata('design:paramtypes', proto, methode) ?? []) as Classe[];
      const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controleur, methode) ?? {}) as Record<
        string,
        { index: number; data?: unknown }
      >;
      for (const [cle, arg] of Object.entries(args)) {
        const genre = Number(cle.split(':')[0]);
        // `@Query('exerciceId')` lit UN paramètre, typé `string` · seul
        // `@Body()` ou `@Query()` sans nom valide une classe entière.
        if ((genre === RouteParamtypes.BODY || genre === RouteParamtypes.QUERY) && arg.data === undefined) {
          const type = types[arg.index];
          if (type) recues.add(type);
        }
      }
    }
  }
  return recues;
}

/** Ferme l'ensemble par les types imbriqués (`@Type(() => …)`). */
function fermerParImbrication(depart: Set<Classe>): Set<Classe> {
  const atteintes = new Set(depart);
  const aVoir = [...depart];
  while (aVoir.length > 0) {
    const cible = aVoir.pop()!;
    const proprietes = new Set(
      getMetadataStorage()
        .getTargetValidationMetadatas(cible, '', true, false)
        .map((m) => m.propertyName),
    );
    for (const propriete of proprietes) {
      const meta = defaultMetadataStorage.findTypeMetadata(cible, propriete);
      if (!meta) continue;
      const imbrique = meta.typeFunction() as Classe;
      if (imbrique && !atteintes.has(imbrique)) {
        atteintes.add(imbrique);
        aVoir.push(imbrique);
      }
    }
  }
  return atteintes;
}

describe('les DTO du module analytique sont tous reçus par une route (audit final F230)', () => {
  const dtos = classesExportees(fichiersDuDossier(DOSSIER_DTO, /\.dto\.ts$/));
  const controleurs = [...classesExportees(fichiersDuDossier(DOSSIER_MODULE, /\.controller\.ts$/)).keys()];
  const servies = fermerParImbrication(recuesParLesRoutes(controleurs));

  it('le recensement trouve les contrôleurs, les DTO et les imbrications', () => {
    // Un garde-fou qui ne trouve plus rien passe sans rien vérifier · on exige
    // donc qu'il voie un DTO reçu en corps ET un DTO atteint par imbrication.
    expect(controleurs.length).toBeGreaterThan(0);
    const nomsServis = [...servies].map((c) => c.name);
    expect(nomsServis).toEqual(expect.arrayContaining(['VentilerLigneDto', 'CreerOdAnalytiqueDto']));
    expect(nomsServis).toEqual(expect.arrayContaining(['LigneVentilationDto', 'LigneOdAnalytiqueDto']));
    expect(dtos.size).toBeGreaterThan(0);
  });

  it('aucun DTO exporté ne reste sans route', () => {
    const sansRoute = [...dtos.entries()].filter(([classe]) => !servies.has(classe)).map(([, nom]) => nom);
    expect(sansRoute).toEqual([]);
  });
});

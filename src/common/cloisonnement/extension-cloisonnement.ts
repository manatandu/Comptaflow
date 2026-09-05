import { Prisma, PrismaClient } from '@prisma/client';
import { acteurCourant } from '../audit/contexte-audit';
import { MODELES_CLOISONNES } from './modeles-cloisonnes';
import {
  CloisonnementViole,
  perimetreCourant,
  raisonHorsCloisonnement,
} from './contexte-cloisonnement';

/**
 * CLOISONNEMENT MULTI-LOCATAIRE PAR LE MOTEUR.
 *
 * Avant : le fait qu'un cabinet ne voie jamais les données d'un autre reposait
 * sur la DISCIPLINE DU CODE · chaque service ajoutait son `tenantId`. Le
 * balayage du 2026-09-02 l'a confirmée sur les 361 appels Prisma des modèles
 * cloisonnés : aucune fuite. Mais une requête écrite un jour sans ce filtre
 * passerait tous les tests, ne lèverait aucune erreur, et rendrait les données
 * d'un autre cabinet.
 *
 * La garde déplace la garantie du programmeur vers le moteur. Trois règles,
 * choisies pour ne coûter aucune requête supplémentaire sur les chemins
 * chauds :
 *
 *  A · LECTURE d'une ligne · le résultat est VÉRIFIÉ APRÈS coup. La ligne est
 *      déjà en main, il n'y a rien à relire. Une ligne d'un autre dossier est
 *      traitée comme inexistante (`null`), et non rendue avec une erreur : le
 *      code appelant sait déjà traiter l'absence, et une erreur distincte
 *      apprendrait à l'attaquant que l'identifiant existe ailleurs.
 *
 *  B · ÉCRITURE d'une ligne désignée par son identifiant · la ligne est RELUE
 *      AVANT. C'est la seule règle qui coûte une requête, et les écritures ne
 *      sont pas le chemin chaud. Un dossier étranger lève.
 *
 *  C · COLLECTION (findMany, updateMany, count…) · le filtre DOIT porter un
 *      `tenantId`. Impossible à vérifier après coup sans relire tout ce qu'on
 *      vient d'écrire, et sans borne une collection rend le monde entier.
 *
 * Le cloisonnement reste posé aux DEUX bouts (CLAUDE.md §6) · cette garde
 * s'ajoute aux filtres des services, elle ne les remplace pas. Un service qui
 * cesserait de filtrer verrait ses collections refusées, pas silencieusement
 * élargies : la garde ne RÉÉCRIT jamais une requête, elle la refuse. Réécrire
 * masquerait le défaut au lieu de le montrer.
 */

const LECTURES_UNITAIRES = ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow'];
const ECRITURES_UNITAIRES = ['update', 'delete', 'upsert'];
const COLLECTIONS = ['findMany', 'updateMany', 'deleteMany', 'count', 'aggregate', 'groupBy'];

/**
 * LES CLÉS QUI NE BORNENT PAS, MÊME QUAND ELLES PORTENT UN `tenantId`.
 *
 * `NOT` inverse la condition · `{ NOT: { tenantId: d } }` rend tout SAUF le
 * dossier. `none` et `isNot` sont les mêmes sur une relation. `every` est
 * vacieusement vrai pour une ligne sans relation : `{ lignes: { every:
 * { tenantId: d } } }` rend aussi les écritures sans ligne, de n'importe quel
 * dossier.
 */
const CLES_QUI_NE_BORNENT_PAS = new Set(['NOT', 'none', 'isNot', 'every']);

/**
 * La valeur posée sur `tenantId` ÉPINGLE-t-elle un dossier autorisé ?
 *
 * `dossier` est celui de la session, `perimetre` celui que le siège d'un
 * groupe a déclaré (voir perimetreDeGroupe). Quand aucun dossier n'est connu
 * — semis, chemins sans acteur —, on exige au moins une valeur LITTÉRALE :
 * il n'y a alors rien à quoi comparer, mais `{ not: null }` reste refusé.
 *
 * Seuls `equals` et `in` épinglent. Tout le reste (`not`, `notIn`, `contains`,
 * `mode`) est refusé plutôt qu'interprété · une garde qui devine se trompe en
 * silence, une garde qui refuse se voit.
 */
function valeurEpingle(
  valeur: unknown,
  dossier?: string | null,
  perimetre?: ReadonlySet<string>,
): boolean {
  if (typeof valeur === 'string') {
    return dossier == null || valeur === dossier || perimetre?.has(valeur) === true;
  }
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) return false;
  const o = valeur as Record<string, unknown>;
  const cles = Object.keys(o);
  if (cles.length === 0) return false;
  return cles.every((cle) => {
    if (cle === 'equals') return valeurEpingle(o.equals, dossier, perimetre);
    if (cle === 'in') {
      return (
        Array.isArray(o.in) &&
        o.in.length > 0 &&
        o.in.every((x) => valeurEpingle(x, dossier, perimetre))
      );
    }
    return false;
  });
}

/**
 * Le filtre ÉPINGLE-t-il le dossier de la session (ou l'un de ceux du
 * périmètre déclaré) ?
 *
 * CE QUE CETTE FONCTION FAISAIT AVANT · elle constatait la PRÉSENCE d'un
 * `tenantId` dans le filtre, sans jamais en regarder la VALEUR. Trois
 * conséquences, et la première n'était pas la plus grave :
 *
 *  · une collection filtrée sur `{ tenantId: dossierDUnAutreCabinet }` était
 *    servie telle quelle ;
 *  · pire, la règle B (relecture avant écriture) et la règle A (vérification
 *    après lecture) SE COURT-CIRCUITENT toutes deux sur `filtreBorne` · un
 *    `tenantId` étranger au filtre ne se contentait pas de passer, il
 *    DÉSACTIVAIT la vérification.
 *
 * D'où l'égalité, et non plus la présence. Et d'où, parce que le siège d'un
 * groupe lit légitimement dans ses cellules, un périmètre qui se DÉCLARE
 * (perimetreDeGroupe) au lieu d'une frontière qui ne se regardait pas.
 */
export function filtreBorne(
  where: unknown,
  dossier?: string | null,
  perimetre?: ReadonlySet<string>,
): boolean {
  if (!where || typeof where !== 'object') return false;
  // Un tableau est une CONJONCTION (la forme tableau de `AND`) · il suffit
  // qu'une de ses branches borne pour que l'ensemble soit borné.
  if (Array.isArray(where)) return where.some((w) => filtreBorne(w, dossier, perimetre));
  const o = where as Record<string, unknown>;
  return Object.entries(o).some(([cle, v]) => {
    if (cle === 'tenantId') return valeurEpingle(v, dossier, perimetre);
    if (CLES_QUI_NE_BORNENT_PAS.has(cle)) return false;
    if (cle === 'OR') {
      // Une DISJONCTION ne borne que si TOUTES ses branches bornent · une
      // seule branche libre rend le monde entier. C'est l'autre moitié du
      // défaut · l'ancienne version acceptait `{ OR: [{ tenantId: d }, {}] }`.
      return (
        Array.isArray(v) && v.length > 0 && v.every((b) => filtreBorne(b, dossier, perimetre))
      );
    }
    // `AND`, et tout filtre par relation · `{ ecriture: { tenantId } }`.
    return typeof v === 'object' && v !== null && filtreBorne(v, dossier, perimetre);
  });
}

function dossierDeLaLigne(ligne: unknown): string | null | undefined {
  if (!ligne || typeof ligne !== 'object') return undefined;
  const t = (ligne as { tenantId?: unknown }).tenantId;
  return typeof t === 'string' ? t : t === null ? null : undefined;
}

export async function garderCloisonnement(
  base: PrismaClient,
  contexte: {
    model: string;
    operation: string;
    args: unknown;
    query: (args: unknown) => Promise<unknown>;
  },
): Promise<unknown> {
  const { model, operation, args, query } = contexte;
  if (!MODELES_CLOISONNES.has(model)) return query(args);
  // Sortie explicite et motivée · connexion, console plateforme, siège de
  // groupe, semis. Voir contexte-cloisonnement.ts.
  if (raisonHorsCloisonnement()) return query(args);

  const dossier = acteurCourant()?.tenantId;
  // Les dossiers que le siège d'un groupe a déclarés · vide en dehors.
  const perimetre = perimetreCourant();
  const a = args as { where?: unknown };
  /** La ligne relue appartient-elle à un dossier que la session peut toucher ? */
  const dossierAutorise = (proprietaire: string | null) =>
    proprietaire === dossier || (proprietaire !== null && perimetre?.has(proprietaire) === true);

  if (COLLECTIONS.includes(operation)) {
    if (!filtreBorne(a?.where, dossier, perimetre)) {
      throw new CloisonnementViole(
        `Requête non cloisonnée · ${model}.${operation} sans borne de dossier vérifiable dans son filtre. ` +
          'Un tenantId présent ne suffit pas · il doit ÉGALER le dossier de la session, ou l’un de ' +
          'ceux déclarés par perimetreDeGroupe(...). Sinon, déclarer la sortie par horsCloisonnement("raison", ...).',
      );
    }
    return query(args);
  }

  if (ECRITURES_UNITAIRES.includes(operation)) {
    // Le filtre porte déjà la borne · rien à relire.
    if (filtreBorne(a?.where, dossier, perimetre)) return query(args);
    if (!dossier) {
      throw new CloisonnementViole(
        `Écriture hors dossier · ${model}.${operation} sans dossier au contexte et sans tenantId au filtre. ` +
          'Déclarer la sortie par horsCloisonnement("raison", ...) si elle est voulue.',
      );
    }
    const propriete = model.charAt(0).toLowerCase() + model.slice(1);
    const existante = await (
      base as unknown as Record<string, { findFirst: (x: unknown) => Promise<unknown> }>
    )[propriete].findFirst({ where: a?.where as never, select: { tenantId: true } as never });
    const proprietaire = dossierDeLaLigne(existante);
    // Ligne absente · on laisse Prisma rendre son erreur habituelle, qui est
    // celle que le code appelant sait traiter. `upsert` créera, et la création
    // porte son tenantId dans `data`.
    if (existante === null || proprietaire === undefined) return query(args);
    if (!dossierAutorise(proprietaire)) {
      throw new CloisonnementViole(
        `Écriture refusée · ${model} appartient à un autre dossier que celui de la session.`,
      );
    }
    return query(args);
  }

  if (LECTURES_UNITAIRES.includes(operation)) {
    const resultat = await query(args);
    if (!dossier || filtreBorne(a?.where, dossier, perimetre)) return resultat;
    const proprietaire = dossierDeLaLigne(resultat);
    // Une ligne d'un autre dossier est traitée comme INEXISTANTE · le code
    // appelant sait déjà traiter l'absence, et une erreur distincte
    // apprendrait que l'identifiant existe ailleurs.
    if (proprietaire !== undefined && !dossierAutorise(proprietaire)) return null;
    return resultat;
  }

  return query(args);
}

export function extensionCloisonnement(base: PrismaClient) {
  return Prisma.defineExtension({
    name: 'cloisonnement-dossier',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return garderCloisonnement(base, { model, operation, args, query });
        },
      },
    },
  });
}

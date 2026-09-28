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
 * D · CRÉATION · le `tenantId` posé dans `data` doit être celui de la session
 * (ou d'un dossier du périmètre déclaré). Audit du serveur du 2026-09-27, I7 ·
 * les créations n'étaient dans aucune liste : rien ne confrontait le dossier
 * d'une ligne créée à celui de la session. Aucun coût · la valeur est dans
 * la requête elle-même.
 */
const CREATIONS = ['create', 'createMany', 'createManyAndReturn'];

/** Le dossier que `data` fait porter à la ligne créée, sous ses deux formes. */
function dossierCree(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as { tenantId?: unknown; tenant?: { connect?: { id?: unknown } } };
  if (typeof d.tenantId === 'string') return d.tenantId;
  const connecte = d.tenant?.connect?.id;
  return typeof connecte === 'string' ? connecte : undefined;
}

/**
 * E · MISE À JOUR · le dossier que `data` (ou le bloc `update` d'un upsert)
 * ferait porter à la ligne. Audit final F240 · les règles B et C vérifiaient
 * la ligne VISÉE par le filtre, jamais la ligne OBTENUE · un
 * `update({ where: { id, tenantId: session }, data: { tenantId: autre } })`
 * passait la borne du filtre et DÉPLAÇAIT la ligne chez un autre cabinet, qui
 * la voyait ensuite comme la sienne. Aucun coût non plus · la valeur est dans
 * la requête.
 *
 * PLUS STRICT QUE `dossierCree`, et pour deux raisons que la création n'a pas.
 *
 *  · Une mise à jour admet des formes qu'une création n'admet pas · `{ set: d }`
 *    sur la colonne, et sur la relation `create`, `connectOrCreate`, `upsert`,
 *    `disconnect`, ou un `connect` par une autre clé unique que l'identifiant
 *    (`Tenant.dossierCombinaisonId`). Chacune peut changer le dossier sans le
 *    nommer lisiblement · elles rendent FORME_ILLISIBLE, et la garde refuse
 *    au lieu de deviner, comme `valeurEpingle` refuse `not` et `mode`.
 *  · `null` y est une CIBLE et non une absence · poser `tenantId: null` sur un
 *    maillon du journal d'audit (seul modèle où la colonne est facultative) le
 *    sortirait de la chaîne du dossier pour celle de la plateforme. À la
 *    création, en revanche, `null` est légitime · c'est le maillon d'un acte
 *    de la console, écrit pendant une session du dossier de l'éditeur.
 *
 * `tenant: { update }` ne déplace rien · il modifie le dossier auquel la ligne
 * appartient déjà, et que le filtre ou la relecture ont vérifié. Il n'est pas
 * une cible.
 */
const FORME_ILLISIBLE = Symbol('forme de dossier illisible');
type DossierVise = string | null | typeof FORME_ILLISIBLE;

function dossiersVises(data: unknown): DossierVise[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  const cibles: DossierVise[] = [];

  if (d.tenantId !== undefined) {
    const v = d.tenantId;
    if (typeof v === 'string' || v === null) cibles.push(v);
    else if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.keys(v).length === 1 &&
      (typeof (v as { set?: unknown }).set === 'string' || (v as { set?: unknown }).set === null)
    ) {
      cibles.push((v as { set: string | null }).set);
    } else cibles.push(FORME_ILLISIBLE);
  }

  if (d.tenant !== undefined) {
    const r = d.tenant;
    if (!r || typeof r !== 'object' || Array.isArray(r)) return [...cibles, FORME_ILLISIBLE];
    for (const [cle, valeur] of Object.entries(r as Record<string, unknown>)) {
      if (cle === 'update') continue;
      if (cle === 'connect') {
        // Un `id` présent désigne à lui seul le dossier relié · d'autres
        // critères à côté ne peuvent que faire échouer la liaison, jamais
        // la porter ailleurs. Sans `id`, la clé unique est une autre, et
        // l'identifiant du dossier ne se lit pas.
        const c = valeur as Record<string, unknown> | null;
        const lisible = !!c && typeof c === 'object' && typeof c.id === 'string';
        cibles.push(lisible ? (c!.id as string) : FORME_ILLISIBLE);
        continue;
      }
      cibles.push(FORME_ILLISIBLE);
    }
  }
  return cibles;
}

const MISES_A_JOUR = ['update', 'updateMany', 'upsert'];

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
 * (semis, chemins sans acteur), on exige au moins une valeur LITTÉRALE :
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

  if (CREATIONS.includes(operation) || operation === 'upsert') {
    const donnees = operation === 'upsert' ? (args as { create?: unknown })?.create : (args as { data?: unknown })?.data;
    const lignes = Array.isArray(donnees) ? donnees : [donnees];
    if (dossier) {
      for (const ligne of lignes) {
        const cible = dossierCree(ligne);
        if (cible !== undefined && !dossierAutorise(cible)) {
          throw new CloisonnementViole(
            `Création refusée · ${model}.${operation} dans un autre dossier que celui de la session. ` +
              'Déclarer le périmètre par perimetreDeGroupe(...) ou la sortie par horsCloisonnement("raison", ...).',
          );
        }
      }
    }
    if (operation !== 'upsert') return query(args);
  }

  // E · la ligne OBTENUE, et pas seulement la ligne visée (F240). Posé AVANT
  // les règles B et C, qui rendent la main dès que le filtre porte la borne ·
  // placé après, il ne verrait jamais le cas qu'il existe pour refuser.
  if (MISES_A_JOUR.includes(operation) && dossier) {
    const donnees =
      operation === 'upsert' ? (args as { update?: unknown })?.update : (args as { data?: unknown })?.data;
    for (const cible of dossiersVises(donnees)) {
      if (cible === FORME_ILLISIBLE) {
        throw new CloisonnementViole(
          `Mise à jour refusée · ${model}.${operation} touche au dossier de la ligne sous une forme que la garde ne sait pas lire. ` +
            'Écrire le tenantId en clair, ou relier par tenant.connect.id.',
        );
      }
      if (!dossierAutorise(cible)) {
        throw new CloisonnementViole(
          `Mise à jour refusée · ${model}.${operation} ferait passer la ligne dans un autre dossier que celui de la session. ` +
            'Déclarer le périmètre par perimetreDeGroupe(...) ou la sortie par horsCloisonnement("raison", ...).',
        );
      }
    }
  }

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
    if (!dossier || filtreBorne(a?.where, dossier, perimetre)) return query(args);
    // Un `select` qui ne demande pas `tenantId` rendait une ligne que la
    // règle A ne pouvait pas vérifier · elle passait telle quelle, d'où
    // qu'elle vienne (audit I7). La colonne est ajoutée à la demande, puis
    // retirée du résultat pour que l'appelant reçoive ce qu'il a demandé.
    const select = (args as { select?: Record<string, unknown> })?.select;
    const ajoute = !!select && select.tenantId !== true;
    const resultat = await query(ajoute ? { ...(args as object), select: { ...select, tenantId: true } } : args);
    const proprietaire = dossierDeLaLigne(resultat);
    // Une ligne d'un autre dossier est traitée comme INEXISTANTE · le code
    // appelant sait déjà traiter l'absence, et une erreur distincte
    // apprendrait que l'identifiant existe ailleurs.
    if (proprietaire !== undefined && !dossierAutorise(proprietaire)) return null;
    if (ajoute && resultat && typeof resultat === 'object') delete (resultat as { tenantId?: unknown }).tenantId;
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

import { Prisma, PrismaClient } from '@prisma/client';
import { acteurCourant } from '../audit/contexte-audit';
import { MODELES_CLOISONNES } from './modeles-cloisonnes';
import { CloisonnementViole, raisonHorsCloisonnement } from './contexte-cloisonnement';

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

/** `tenantId` présent quelque part dans le filtre, y compris sous un AND/OR. */
export function filtreBorne(where: unknown): boolean {
  if (!where || typeof where !== 'object') return false;
  if (Array.isArray(where)) return where.some(filtreBorne);
  const o = where as Record<string, unknown>;
  if (o.tenantId !== undefined) return true;
  // Un filtre par relation borne aussi · `{ ecriture: { tenantId } }`.
  return Object.values(o).some((v) => typeof v === 'object' && v !== null && filtreBorne(v));
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
  const a = args as { where?: unknown };

  if (COLLECTIONS.includes(operation)) {
    if (!filtreBorne(a?.where)) {
      throw new CloisonnementViole(
        `Requête non cloisonnée · ${model}.${operation} sans tenantId dans son filtre. ` +
          'Ajouter la borne de dossier, ou déclarer la sortie par horsCloisonnement("raison", ...).',
      );
    }
    return query(args);
  }

  if (ECRITURES_UNITAIRES.includes(operation)) {
    // Le filtre porte déjà la borne · rien à relire.
    if (filtreBorne(a?.where)) return query(args);
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
    if (proprietaire !== dossier) {
      throw new CloisonnementViole(
        `Écriture refusée · ${model} appartient à un autre dossier que celui de la session.`,
      );
    }
    return query(args);
  }

  if (LECTURES_UNITAIRES.includes(operation)) {
    const resultat = await query(args);
    if (!dossier || filtreBorne(a?.where)) return resultat;
    const proprietaire = dossierDeLaLigne(resultat);
    // Une ligne d'un autre dossier est traitée comme INEXISTANTE · le code
    // appelant sait déjà traiter l'absence, et une erreur distincte
    // apprendrait que l'identifiant existe ailleurs.
    if (proprietaire !== undefined && proprietaire !== dossier) return null;
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

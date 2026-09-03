import { Prisma, PrismaClient } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { acteurCourant, ACTEUR_SYSTEME } from './contexte-audit';
import { MODELES_AUDITES, masquer } from './champs-audites';
import { calculerEmpreinte, EMPREINTE_ORIGINE } from './empreinte-audit';

const journal = new Logger('JournalAudit');

/** Opérations d'écriture que l'extension intercepte, et l'action qu'elles portent. */
const ACTIONS: Record<string, 'CREATION' | 'MODIFICATION' | 'SUPPRESSION'> = {
  create: 'CREATION',
  createMany: 'CREATION',
  createManyAndReturn: 'CREATION',
  update: 'MODIFICATION',
  updateMany: 'MODIFICATION',
  upsert: 'MODIFICATION',
  delete: 'SUPPRESSION',
  deleteMany: 'SUPPRESSION',
};

/**
 * Ajoute un maillon à la chaîne du dossier.
 *
 * Le verrou consultatif est PAR CHAÎNE (le dossier, ou la plateforme). Sans
 * lui, deux ajouts simultanés liraient le même « précédent » et
 * produiraient deux maillons de même rang · la contrainte d'unicité en
 * rejetterait un, et surtout la chaîne paraîtrait falsifiée alors que rien ne
 * l'aurait été. Le verrou est pris DANS la transaction (`xact`), il se relâche
 * donc tout seul, y compris si la transaction échoue.
 */
async function ajouterMaillon(
  base: PrismaClient,
  evenement: {
    tenantId: string | null;
    acteurId: string | null;
    acteurEmail: string;
    adresseIp: string | null;
    action: 'CREATION' | 'MODIFICATION' | 'SUPPRESSION';
    entite: string;
    entiteId: string | null;
    avant: unknown;
    apres: unknown;
  },
): Promise<void> {
  await base.$transaction(async (tx) => {
    const cle = evenement.tenantId ?? 'plateforme';
    // `$executeRaw` et NON `$queryRaw` · `pg_advisory_xact_lock` rend le type
    // `void`, que le moteur Prisma ne sait pas désérialiser en colonne · le
    // verrou levait alors une erreur, rattrapée plus haut, et AUCUN maillon
    // n'était jamais écrit. Le journal paraissait posé, il ne l'était pas.
    // `$executeRaw` ne lit aucune colonne, seulement un nombre de lignes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cle}))`;

    const precedent = await tx.evenementAudit.findFirst({
      where: { tenantId: evenement.tenantId },
      orderBy: { rang: 'desc' },
      select: { rang: true, empreinte: true },
    });

    const rang = (precedent?.rang ?? 0) + 1;
    const empreintePrecedente = precedent?.empreinte ?? EMPREINTE_ORIGINE;
    const horodatage = new Date();
    const empreinte = calculerEmpreinte({ ...evenement, rang, horodatage, empreintePrecedente });

    await tx.evenementAudit.create({
      data: {
        tenantId: evenement.tenantId,
        rang,
        horodatage,
        acteurId: evenement.acteurId,
        acteurEmail: evenement.acteurEmail,
        adresseIp: evenement.adresseIp,
        action: evenement.action,
        entite: evenement.entite,
        entiteId: evenement.entiteId,
        avant: (evenement.avant ?? Prisma.DbNull) as Prisma.InputJsonValue,
        apres: (evenement.apres ?? Prisma.DbNull) as Prisma.InputJsonValue,
        empreintePrecedente,
        empreinte,
      },
    });
  });
}

/** L'identifiant de la ligne touchée, quand l'opération en désigne une seule. */
function identifiant(resultat: unknown, args: { where?: Record<string, unknown> }): string | null {
  const r = resultat as { id?: unknown } | null;
  if (r && typeof r === 'object' && typeof r.id === 'string') return r.id;
  const w = args?.where;
  if (w && typeof w.id === 'string') return w.id;
  return null;
}

/** Le dossier touché · celui de la ligne si elle le porte, sinon celui de l'acteur. */
function dossier(avant: unknown, apres: unknown, secours: string | null): string | null {
  for (const source of [apres, avant]) {
    const s = source as { tenantId?: unknown; id?: unknown } | null;
    if (s && typeof s === 'object' && typeof s.tenantId === 'string') return s.tenantId;
  }
  return secours;
}

/**
 * L'INTERCEPTION · sortie de l'extension pour être testable telle quelle.
 *
 * `Prisma.defineExtension` rend une fonction opaque : le corps du crochet
 * n'est atteignable par aucun test s'il y reste enfermé. Un branchement qu'on
 * ne peut pas éprouver est un branchement qu'on croit posé.
 *
 * `base` est le client NON étendu · c'est par lui que le journal s'écrit, ce
 * qui évite qu'un maillon déclenche l'écriture d'un maillon.
 */
export async function intercepterEcriture(
  base: PrismaClient,
  contexte: {
    model: string;
    operation: string;
    args: unknown;
    query: (args: unknown) => Promise<unknown>;
  },
): Promise<unknown> {
  const { model, operation, args, query } = contexte;
  const action = ACTIONS[operation];
  if (!action || !MODELES_AUDITES.has(model)) return query(args);

  const a = args as { where?: Record<string, unknown>; data?: unknown };

  // L'état AVANT n'existe que si on le lit avant de le détruire. On ne le fait
  // que pour les opérations qui désignent une ligne · un `updateMany` en
  // lirait potentiellement des milliers.
  let avant: unknown = null;
  const cible = ['update', 'delete', 'upsert'].includes(operation);
  if (cible && a.where) {
    try {
      avant = await (base as unknown as Record<string, { findFirst: (x: unknown) => Promise<unknown> }>)[
        model.charAt(0).toLowerCase() + model.slice(1)
      ].findFirst({ where: a.where });
    } catch {
      // Une lecture de pré-image impossible ne doit pas empêcher l'opération ·
      // l'événement sera simplement moins riche.
      avant = null;
    }
  }

  const resultat = await query(args);

  try {
    const acteur = acteurCourant();
    const apres = ['delete', 'deleteMany'].includes(operation) ? null : resultat;
    const estMasse = ['createMany', 'createManyAndReturn', 'updateMany', 'deleteMany'].includes(operation);

    await ajouterMaillon(base, {
      tenantId: dossier(avant, apres, acteur?.tenantId ?? null),
      acteurId: acteur?.acteurId ?? null,
      acteurEmail: acteur?.acteurEmail ?? ACTEUR_SYSTEME,
      adresseIp: acteur?.adresseIp ?? null,
      action,
      entite: model,
      // Une opération de masse ne désigne aucune ligne · on garde le filtre,
      // qui dit ce qui a été visé, plutôt qu'un faux identifiant.
      entiteId: estMasse ? null : identifiant(resultat, a),
      avant: masquer(avant),
      apres: estMasse ? masquer({ operation, filtre: a.where ?? null, resultat }) : masquer(apres),
    });
  } catch (erreur) {
    // CHOIX ASSUMÉ · l'opération métier a RÉUSSI à ce stade. Faire échouer la
    // requête ferait voir une erreur pour un acte accompli, et l'utilisateur
    // le rejouerait · une écriture en double vaut pire qu'un trou dans le
    // journal. On crie donc dans les journaux d'exploitation et on laisse
    // passer.
    //
    // Ce que cela veut dire, et il faut le dire : la chaîne détecte la
    // FALSIFICATION d'un maillon, pas l'ABSENCE d'un maillon jamais écrit. Ce
    // sont deux garanties différentes, et seule la première est tenue ici.
    journal.error(
      `Maillon d'audit NON écrit · ${model}.${operation} · ${erreur instanceof Error ? erreur.message : erreur}`,
    );
  }

  return resultat;
}

/**
 * L'EXTENSION · posée sur le client Prisma, elle voit passer TOUTE écriture,
 * d'où qu'elle vienne. C'est le point de la chose : un journal appelé à la
 * main dans les services serait oublié le jour où l'on ajoute un service.
 */
export function extensionAudit(base: PrismaClient) {
  return Prisma.defineExtension({
    name: 'journal-audit',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return intercepterEcriture(base, { model, operation, args, query });
        },
      },
    },
  });
}

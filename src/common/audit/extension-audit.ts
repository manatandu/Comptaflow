import { ActionAudit, Prisma, PrismaClient } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { acteurCourant, ACTEUR_SYSTEME, transactionAuditee } from './contexte-audit';
import { MODELES_AUDITES, colonnesExclues, masquer } from './champs-audites';
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
 * La pré-image ne relit jamais une colonne BINAIRE. Elle serait masquée de
 * toute façon (aucun octet n'entre au journal), mais la relire coûterait le
 * transfert entier · 5 Mo remontés de la base pour changer le commentaire
 * d'une pièce attachée à un tiers. Sans colonne binaire, aucun `select` n'est
 * posé et la ligne entière est lue, comme avant.
 */
const selectsPreImage = new Map<string, { select?: Record<string, true> }>();
export function selectPreImage(model: string): { select?: Record<string, true> } {
  const connu = selectsPreImage.get(model);
  if (connu) return connu;
  const champs = Prisma.dmmf.datamodel.models.find((m) => m.name === model)?.fields ?? [];
  const binaires = champs.some((f) => f.kind === 'scalar' && f.type === 'Bytes');
  const resultat = binaires
    ? {
        select: Object.fromEntries(
          champs
            .filter((f) => (f.kind === 'scalar' && f.type !== 'Bytes') || f.kind === 'enum')
            .map((f) => [f.name, true as const]),
        ),
      }
    : {};
  selectsPreImage.set(model, resultat);
  return resultat;
}

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
/**
 * EXPORTÉ pour un seul appelant hors extension · la journalisation d'une
 * EXTRACTION. Une extraction est une LECTURE : elle ne passe par aucune des
 * opérations de la table `ACTIONS`, donc par aucun crochet d'écriture, et son
 * maillon doit bien être posé à la main.
 *
 * NE PAS ÉCRIRE UN SECOND ÉCRIVAIN DE CHAÎNE. Le verrou consultatif
 * (`pg_advisory_xact_lock`, pris DANS la transaction) et le calcul du rang
 * doivent rester au même endroit · deux écrivains liraient le même précédent
 * et la chaîne paraîtrait falsifiée alors que rien ne l'aurait été. C'est
 * pour cela que cet export existe, et non pour ouvrir une porte générale.
 *
 * Rend le maillon écrit · le manifeste d'une archive porte son rang et son
 * empreinte, ce qui permet de rattacher plus tard une copie qui circule à
 * l'acte qui l'a produite.
 */
type EvenementAEcrire = {
  tenantId: string | null;
  acteurId: string | null;
  acteurEmail: string;
  adresseIp: string | null;
  action: ActionAudit;
  entite: string;
  entiteId: string | null;
  avant: unknown;
  apres: unknown;
};

export async function ajouterMaillon(
  base: PrismaClient,
  evenement: {
    tenantId: string | null;
    acteurId: string | null;
    acteurEmail: string;
    adresseIp: string | null;
    action: ActionAudit;
    entite: string;
    entiteId: string | null;
    avant: unknown;
    apres: unknown;
  },
): Promise<{ rang: number; empreinte: string }> {
  return base.$transaction((tx) => ecrireMaillon(tx as unknown as ClientMaillon, evenement, false));
}

type ClientMaillon = {
  $executeRaw: (gabarit: TemplateStringsArray, ...valeurs: unknown[]) => Promise<number>;
  $queryRaw: <T>(gabarit: TemplateStringsArray, ...valeurs: unknown[]) => Promise<T>;
  evenementAudit: {
    findFirst: (x: unknown) => Promise<{ rang: number; empreinte: string } | null>;
    create: (x: unknown) => Promise<unknown>;
  };
};

/**
 * L'UNIQUE ÉCRIVAIN DE LA CHAÎNE · appelé soit dans une transaction courte
 * ouverte pour lui (`ajouterMaillon`), soit dans la transaction de l'acte
 * lui-même (`journaliserDansTransaction`).
 *
 * `lectureBrute` · le client d'une transaction d'acte porte les extensions,
 * cloisonnement compris. Lu à travers lui depuis la console (session du
 * dossier de l'éditeur), le dernier maillon du dossier qui naît serait tenu
 * pour « inexistant », le rang repartirait à 1 et la contrainte d'unicité
 * ferait échouer la création du dossier. La lecture passe alors en SQL brut,
 * que les extensions de modèle ne voient pas.
 */
async function ecrireMaillon(
  tx: ClientMaillon,
  evenement: EvenementAEcrire,
  lectureBrute: boolean,
): Promise<{ rang: number; empreinte: string }> {
  {
    const cle = evenement.tenantId ?? 'plateforme';
    // `$executeRaw` et NON `$queryRaw` · `pg_advisory_xact_lock` rend le type
    // `void`, que le moteur Prisma ne sait pas désérialiser en colonne · le
    // verrou levait alors une erreur, rattrapée plus haut, et AUCUN maillon
    // n'était jamais écrit. Le journal paraissait posé, il ne l'était pas.
    // `$executeRaw` ne lit aucune colonne, seulement un nombre de lignes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cle}))`;

    const precedent = lectureBrute
      ? ((
          await tx.$queryRaw<{ rang: number; empreinte: string }[]>`
            SELECT rang, empreinte FROM evenements_audit
            WHERE "tenantId" IS NOT DISTINCT FROM ${evenement.tenantId}::text
            ORDER BY rang DESC LIMIT 1`
        )[0] ?? null)
      : await tx.evenementAudit.findFirst({
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
    return { rang, empreinte };
  }
}

export class ErreurMaillonDansTransaction extends Error {
  constructor(model: string, operation: string, cause: unknown) {
    super(`Maillon d'audit NON écrit dans la transaction · ${model}.${operation} · ${cause instanceof Error ? cause.message : cause}`);
    // La cause reste lisible · un échec de SÉRIALISATION du maillon (40001)
    // est un conflit que `avecRetrySerialisable` doit rejouer, non une panne
    // (A5, quatrième relecture · deux réévaluations de dossiers différents
    // finissaient en 500 au lieu d'être reprises).
    (this as { cause?: unknown }).cause = cause;
  }
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
function dossier(model: string, avant: unknown, apres: unknown, secours: string | null): string | null {
  // LE DOSSIER EST SA PROPRE CHAÎNE · sa création en est le premier maillon.
  // Rangée sous le dossier de l'acteur, la création d'un cabinet depuis la
  // console irait grossir la chaîne de l'éditeur, et celle du cabinet
  // commencerait sans dire d'où il vient.
  if (model === 'Tenant') {
    for (const source of [apres, avant]) {
      const s = source as { id?: unknown } | null;
      if (s && typeof s === 'object' && typeof s.id === 'string') return s.id;
    }
  }
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
      ].findFirst({ where: a.where, ...selectPreImage(model) });
    } catch {
      // Une lecture de pré-image impossible ne doit pas empêcher l'opération ·
      // l'événement sera simplement moins riche.
      avant = null;
    }
  }

  const resultat = await query(args);

  try {
    const acteur = acteurCourant();
    // Les colonnes que ce modèle ne recopie JAMAIS dans le journal · liste
    // fermée, tenue par un test. Voir COLONNES_EXCLUES_PAR_MODELE.
    const exclues = colonnesExclues(model);
    const apres = ['delete', 'deleteMany'].includes(operation) ? null : resultat;
    const estMasse = ['createMany', 'createManyAndReturn', 'updateMany', 'deleteMany'].includes(operation);

    const evenement: EvenementAEcrire = {
      tenantId: dossier(model, avant, apres, acteur?.tenantId ?? null),
      acteurId: acteur?.acteurId ?? null,
      acteurEmail: acteur?.acteurEmail ?? ACTEUR_SYSTEME,
      adresseIp: acteur?.adresseIp ?? null,
      action,
      entite: model,
      // Une opération de masse ne désigne aucune ligne · on garde le filtre,
      // qui dit ce qui a été visé, plutôt qu'un faux identifiant.
      entiteId: estMasse ? null : identifiant(resultat, a),
      avant: masquer(avant, exclues),
      apres: estMasse
        ? masquer({ operation, filtre: a.where ?? null, resultat }, exclues)
        : masquer(apres, exclues),
    };
    const tx = transactionAuditee();
    if (tx) {
      // DANS LA TRANSACTION DE L'ACTE, une erreur n'est PAS avalée · une
      // requête qui échoue invalide toute la transaction PostgreSQL, et la
      // suite de l'acte tomberait de toute façon, sur un motif trompeur.
      // Mieux vaut qu'elle tombe ici, en disant pourquoi.
      await ecrireMaillon(tx as ClientMaillon, evenement, true).catch((erreur) => {
        throw new ErreurMaillonDansTransaction(model, operation, erreur);
      });
    } else {
      await ajouterMaillon(base, evenement);
    }
  } catch (erreur) {
    if (erreur instanceof ErreurMaillonDansTransaction) throw erreur;
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

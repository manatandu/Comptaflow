import { ForbiddenException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { acteurCourant } from '../audit/contexte-audit';

/**
 * JOURNAUX AUTORISÉS PAR UTILISATEUR (priorité 5 de la comparaison avec les
 * autres produits Sage, docs/comparaison-sage-i7-omegax.md).
 *
 * Sage X3 range, au bout de ses quatre couches d'habilitation, des « Rôles »
 * qui filtrent les DONNÉES et non plus seulement les actions (compétence
 * `sage-i7`, paie-et-x3.md). La source ne décrit rien de plus · la règle
 * ci-dessous est celle d'OmegaX, et l'écran le dit.
 *
 * CE QUI EST RESTREINT, C'EST LA SAISIE · un utilisateur restreint ne crée,
 * ne modifie, ne valide ni ne supprime une écriture que dans les journaux
 * cochés. Le cas visé est celui du caissier qui tient la caisse et rien
 * d'autre, ou de l'aide qui saisit les achats sans toucher à la banque.
 *
 * CE QUI NE L'EST PAS, ET POURQUOI · la LECTURE. Une balance, un grand livre
 * ou un bilan lus sur une partie des journaux boucleraient, et seraient faux ·
 * un livre amputé en silence est un document faux (AUDCIF art. 22, 6°). La
 * confidentialité d'une donnée relève du rôle cantonné (le gestionnaire de
 * paie, l'aide-comptable fermé au personnel), pas de ce filtre. Le lettrage et
 * le pointage ne sont pas une saisie et restent ouverts.
 *
 * POSÉE SUR LE CLIENT PRISMA, comme le cloisonnement et le journal d'audit ·
 * huit fichiers créent ou modifient des écritures (saisie, imports, clôture,
 * affectation, immobilisations, paie, TVA, groupe), et un contrôle qu'on
 * peut oublier d'appeler n'est pas un contrôle. L'administrateur n'est jamais
 * restreint · c'est lui qui lève la restriction.
 */

export type EcritureCiblee = { journalId: string | null | undefined };

/** Le journal que la saisie vise est-il hors du périmètre ? null = pas de restriction. */
export function journalHorsPerimetre(journalId: string | null | undefined, autorises: readonly string[] | null | undefined): boolean {
  if (!autorises) return false;
  // Une écriture sans journal ne se saisit pas · la laisser passer ouvrirait
  // une porte, la refuser ne ferme rien de légitime.
  return !journalId || !autorises.includes(journalId);
}

export const MESSAGE_HORS_PERIMETRE =
  "Ce journal n'est pas dans votre périmètre de saisie · l'administrateur du dossier a restreint vos écritures aux journaux cochés dans la fenêtre Utilisateurs.";

const CREATIONS = ['create', 'createMany', 'createManyAndReturn'];
const MODIFICATIONS = ['update', 'updateMany', 'delete', 'deleteMany', 'upsert'];

/** Le journal que porte une donnée de création ou de modification, s'il y en a un. */
function journalDeLaDonnee(data: unknown): string | null | undefined {
  const d = data as { journalId?: string; journal?: { connect?: { id?: string } } } | undefined;
  if (!d) return undefined;
  if (d.journalId !== undefined) return d.journalId;
  return d.journal?.connect?.id;
}

export async function garderPerimetreJournaux(
  base: PrismaClient,
  contexte: { model: string; operation: string; args: unknown; query: (args: unknown) => Promise<unknown> },
): Promise<unknown> {
  const { model, operation, args, query } = contexte;
  if (model !== 'Ecriture') return query(args);
  const autorises = acteurCourant()?.journauxAutorises;
  if (!autorises) return query(args);
  const a = args as { data?: unknown; where?: unknown; create?: unknown; update?: unknown };

  if (CREATIONS.includes(operation)) {
    const donnees = Array.isArray(a.data) ? a.data : [a.data];
    if (donnees.some((d) => journalHorsPerimetre(journalDeLaDonnee(d), autorises))) {
      throw new ForbiddenException(MESSAGE_HORS_PERIMETRE);
    }
    return query(args);
  }

  if (MODIFICATIONS.includes(operation)) {
    // UN CHANGEMENT DE JOURNAL VERS L'EXTÉRIEUR est refusé comme une création.
    const nouveau = journalDeLaDonnee(operation === 'upsert' ? a.update : a.data);
    if (nouveau !== undefined && journalHorsPerimetre(nouveau, autorises)) {
      throw new ForbiddenException(MESSAGE_HORS_PERIMETRE);
    }
    if (operation === 'upsert' && journalHorsPerimetre(journalDeLaDonnee(a.create), autorises)) {
      throw new ForbiddenException(MESSAGE_HORS_PERIMETRE);
    }
    // ET LES ÉCRITURES VISÉES doivent toutes être dans le périmètre · on relit
    // leur journal, le filtre ne le porte pas.
    const visees = (await base.ecriture.findMany({ where: a.where as Prisma.EcritureWhereInput, select: { journalId: true } })) as EcritureCiblee[];
    if (visees.some((e) => journalHorsPerimetre(e.journalId, autorises))) {
      throw new ForbiddenException(MESSAGE_HORS_PERIMETRE);
    }
    return query(args);
  }

  return query(args);
}

export function extensionPerimetreJournaux(base: PrismaClient) {
  return Prisma.defineExtension({
    name: 'perimetre-journaux',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return garderPerimetreJournaux(base, { model, operation, args, query });
        },
      },
    },
  });
}

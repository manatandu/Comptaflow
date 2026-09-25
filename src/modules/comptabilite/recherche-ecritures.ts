import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * RECHERCHE D'ÉCRITURES MULTICRITÈRE · la commande de Sage i7
 * (« Traitement / Recherche d'écritures »), servie par le panneau de filtres
 * du journal et par son export, qui lisent le même périmètre
 * (`perimetreJournal`).
 *
 * TROIS RÈGLES DE LECTURE, chacune fausse si on l'oublie.
 *  · LE COMPTE ET LE MONTANT SE CHERCHENT SUR LA MÊME LIGNE. « Le 401 à
 *    116 000 » est une ligne ; deux conditions posées séparément rendraient
 *    aussi la pièce où le 401 porte 5 000 et une autre ligne 116 000, et la
 *    recherche la plus courante d'un cabinet (retrouver un règlement) se
 *    noierait dans le bruit.
 *  · UN MONTANT SEUL EST UN MONTANT EXACT, au débit OU au crédit · le sens
 *    n'est pas demandé, on cherche une somme vue sur un relevé ou une facture.
 *    Une borne haute en fait une fourchette.
 *  · LE COMPTE SE LIT PAR SA RACINE · « 401 » trouve tous les fournisseurs,
 *    « 40110000 » un seul, comme les comptes Total du plan (§ 7).
 */
export interface CriteresRecherche {
  /** Libellé de l'écriture OU de l'une de ses lignes. */
  recherche?: string;
  compte?: string;
  montantMin?: number;
  montantMax?: number;
  numeroPiece?: number;
  reference?: string;
}

/** Lit les critères d'une requête · un chiffre illisible est un refus, jamais un critère ignoré. */
export function lireCriteres(q: {
  compte?: string;
  montant?: string;
  montantMax?: string;
  numeroPiece?: string;
  reference?: string;
}): { criteres: CriteresRecherche } | { motif: string } {
  const criteres: CriteresRecherche = {};
  const nombre = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));
  if (q.compte?.trim()) {
    const c = q.compte.replace(/\s/g, '');
    if (!/^\d+$/.test(c)) return { motif: 'Le compte se cherche par son numéro ou sa racine (chiffres seulement).' };
    criteres.compte = c;
  }
  if (q.montant?.trim()) {
    const m = nombre(q.montant);
    if (!Number.isFinite(m) || m < 0) return { motif: 'Montant illisible.' };
    criteres.montantMin = m;
  }
  if (q.montantMax?.trim()) {
    const m = nombre(q.montantMax);
    if (!Number.isFinite(m) || m < 0) return { motif: 'Montant maximal illisible.' };
    if (criteres.montantMin === undefined) return { motif: 'Une fourchette de montants commence par le montant minimal.' };
    if (m < criteres.montantMin) return { motif: 'Le montant maximal est inférieur au minimal.' };
    criteres.montantMax = m;
  }
  if (q.numeroPiece?.trim()) {
    const n = Number(q.numeroPiece.trim());
    if (!Number.isInteger(n) || n <= 0) return { motif: 'Le numéro de pièce est un entier positif.' };
    criteres.numeroPiece = n;
  }
  if (q.reference?.trim()) criteres.reference = q.reference.trim();
  return { criteres };
}

/** Le filtre Prisma des critères · vide quand aucun n'est posé. */
export function filtreRecherche(c: CriteresRecherche): Prisma.EcritureWhereInput {
  const et: Prisma.EcritureWhereInput[] = [];
  if (c.recherche) {
    const contient = { contains: c.recherche, mode: 'insensitive' as const };
    et.push({ OR: [{ libelle: contient }, { lignes: { some: { libelle: contient } } }] });
  }
  if (c.numeroPiece !== undefined) et.push({ numeroPiece: c.numeroPiece });
  if (c.reference) et.push({ reference: { contains: c.reference, mode: 'insensitive' } });

  // Compte et montant sur la MÊME ligne · un seul `some`.
  const ligne: Prisma.LigneEcritureWhereInput = {};
  if (c.compte) ligne.compte = { numero: { startsWith: c.compte } };
  if (c.montantMin !== undefined) {
    const borne = { gte: c.montantMin, lte: c.montantMax ?? c.montantMin };
    ligne.OR = [{ debit: borne }, { credit: borne }];
  }
  if (Object.keys(ligne).length > 0) et.push({ lignes: { some: ligne } });

  return et.length ? { AND: et } : {};
}

/** Les critères d'une route, ou le refus nommé · appelé par le journal ET par son export. */
export function criteresOuRefus(q: Parameters<typeof lireCriteres>[0]): CriteresRecherche {
  const r = lireCriteres(q);
  if ('motif' in r) throw new BadRequestException(r.motif);
  return r.criteres;
}

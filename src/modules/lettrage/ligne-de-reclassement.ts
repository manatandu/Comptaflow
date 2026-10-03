import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * LA LIGNE DU COMPTE CLIENT D'UN RECLASSEMENT AU 416 NE SE LETTRE PAS (ligne
 * A7 ter, B3 · règle 6 de `creances-douteuses/creances-douteuses.ts`).
 *
 * Le reclassement d'une créance douteuse ou litigieuse passe D 416 / C compte
 * du client (fiche du compte 41) et NE LETTRE PAS ce compte. Lettrée avec la
 * facture, sa ligne créditrice serait lue par le calcul de la TVA comme un
 * ENCAISSEMENT · or « l'encaissement s'entend de la perception des sommes »
 * (décret n° 011/42, art. 57), et la TVA d'une prestation de services, exigible
 * « au moment de l'encaissement du prix » (O.-L. n° 10/001, art. 25, 2°),
 * deviendrait exigible au reclassement sans qu'aucun prix ne soit perçu · et
 * déclarée DEUX fois si le mois de la facture est déjà liquidé.
 *
 * Le lettrage par montant (`calculerPropositions`, paires exactes) appariait
 * justement la facture et cette ligne, de même montant · le groupe soldé
 * `AUTOMATIQUE_MONTANT` rendait la TVA exigible. Tant que la ligne A7 bis du
 * suivi (TVA des créances douteuses) n'est pas faite, un groupe qui réunit
 * cette ligne et une ligne dont l'ÉCRITURE porte de la TVA facturée (compte
 * 443, « État, TVA facturée » au SYSCOHADA, « Etat, T.V.A. facturée » au
 * SYCEBNL, fiche du compte 44 des deux plans) n'est ni proposé ni posé · refus
 * par ce motif nommé.
 *
 * SEULEMENT AVEC UNE TVA FACTURÉE (relecture adverse d'A7 ter, mineur 6) ·
 * une facture sans 443 (association exonérée, opération hors champ) n'a
 * aucune TVA que le lettrage rendrait exigible · la lettrer avec son
 * reclassement solde le compte du client, et le refuser bloquait un geste
 * juste. Les groupes facture-reclassement déjà posés depuis A7 vont à la
 * ligne A7 bis du suivi, sans code ici.
 *
 * Reconnue par sa LIAISON (`CreanceDouteuse.ecritureReclassementId`), jamais
 * par le compte ni le libellé · seule la ligne du compte d'ORIGINE de la
 * créance (`compteCreanceId`), la ligne 416 restant lettrable (aucune TVA n'y
 * est lue, et le module la lettre lui-même à l'extinction de la créance). Un
 * reclassement ANNULÉ ne retient plus rien.
 */
export const MOTIF_LETTRAGE_RECLASSEMENT =
  "Ne lettrez pas la facture avec le reclassement · ce groupe réunit le crédit du compte du client par le reclassement d'une " +
  "créance douteuse ou litigieuse au 416 et une pièce qui porte de la TVA facturée (compte 443). Lettrée, le calcul de la TVA " +
  "lirait la ligne du reclassement comme un encaissement (décret n° 011/42, " +
  "art. 57), et la TVA d'une prestation de services deviendrait exigible sans qu'aucun prix ne soit perçu (O.-L. n° 10/001, " +
  'art. 25, 2°). La créance se suit dans « Créances douteuses ou litigieuses » ; le traitement de sa TVA est la ligne A7 bis du suivi.';

/** Client Prisma minimal · le service ou une transaction ouverte. */
interface LecteurLignes {
  ligneEcriture: { findMany: (args: Prisma.LigneEcritureFindManyArgs) => Promise<unknown[]> };
}

interface LigneLue {
  id: string;
  compteId: string;
  ecriture: { creanceDouteuseReclassement: { compteCreanceId: string } | null } | null;
}

/** Une créance au reclassement NON annulé, dont le compte d'origine est celui de la ligne. */
const RECLASSEMENT_EN_VIGUEUR = { annuleeLe: null } satisfies Prisma.CreanceDouteuseWhereInput;

/**
 * Parmi `ligneIds`, celles qui sont la ligne du compte client d'un
 * reclassement en vigueur · vide si aucune.
 */
export async function lignesDuCompteClientReclasse(db: LecteurLignes, tenantId: string, ligneIds: readonly string[]): Promise<Set<string>> {
  if (ligneIds.length === 0) return new Set();
  const lues = (await db.ligneEcriture.findMany({
    where: { id: { in: [...ligneIds] }, ecriture: { tenantId, creanceDouteuseReclassement: { is: RECLASSEMENT_EN_VIGUEUR } } },
    select: { id: true, compteId: true, ecriture: { select: { creanceDouteuseReclassement: { select: { compteCreanceId: true } } } } },
  })) as LigneLue[];
  // `!= null` · une liaison absente vaut `null` en base ; une doublure qui ne
  // la sert pas ne fait jamais passer une ligne pour un reclassement.
  return new Set(
    lues.filter((l) => l.ecriture?.creanceDouteuseReclassement != null && l.ecriture.creanceDouteuseReclassement.compteCreanceId === l.compteId).map((l) => l.id),
  );
}

/**
 * Les lignes d'un compte client qui sont la ligne d'un reclassement en
 * vigueur · lues par le compte, sans liste d'identifiants (le compte d'un
 * client tenu depuis des années en porte des milliers).
 */
export async function lignesReclasseesDuCompte(db: LecteurLignes, tenantId: string, compteId: string): Promise<Set<string>> {
  const lues = (await db.ligneEcriture.findMany({
    where: {
      compteId,
      lettrageId: null,
      ecriture: { tenantId, creanceDouteuseReclassement: { is: { ...RECLASSEMENT_EN_VIGUEUR, compteCreanceId: compteId } } },
    },
    select: { id: true, compteId: true, ecriture: { select: { creanceDouteuseReclassement: { select: { compteCreanceId: true } } } } },
  })) as LigneLue[];
  // La liaison se relit sur la ligne servie · une doublure qui ne sert pas le
  // filtre de relation ne fait jamais passer tout le compte pour reclassé.
  return new Set(
    lues
      .filter((l) => l.ecriture?.creanceDouteuseReclassement != null && l.ecriture.creanceDouteuseReclassement.compteCreanceId === compteId)
      .map((l) => l.id),
  );
}

/** La racine de la TVA facturée, commune aux deux plans (443, fiche du compte 44). */
export const RACINE_TVA_FACTUREE = '443';

interface LigneTaxee {
  id: string;
  ecriture: { lignes: Array<{ compte: { numero: string } | null }> } | null;
}

/**
 * Parmi `ligneIds`, celles dont l'ÉCRITURE porte une ligne de TVA facturée
 * (443) · la facture dont la TVA deviendrait exigible au lettrage.
 */
export async function lignesAvecTvaFacturee(db: LecteurLignes, tenantId: string, ligneIds: readonly string[]): Promise<Set<string>> {
  if (ligneIds.length === 0) return new Set();
  const tva = { compte: { numero: { startsWith: RACINE_TVA_FACTUREE } } } satisfies Prisma.LigneEcritureWhereInput;
  const lues = (await db.ligneEcriture.findMany({
    where: { id: { in: [...ligneIds] }, ecriture: { tenantId, lignes: { some: tva } } },
    select: { id: true, ecriture: { select: { lignes: { where: tva, select: { compte: { select: { numero: true } } }, take: 1 } } } },
  })) as LigneTaxee[];
  // Le numéro se relit sur la ligne servie · une doublure qui ne sert pas le
  // filtre de relation ne fait jamais passer une pièce pour taxée.
  return new Set(lues.filter((l) => (l.ecriture?.lignes ?? []).some((x) => x.compte?.numero.startsWith(RACINE_TVA_FACTUREE))).map((l) => l.id));
}

/**
 * Les lignes NON LETTRÉES d'un compte dont l'écriture porte de la TVA facturée
 * · lues par le compte, sans liste d'identifiants (le compte d'un client tenu
 * depuis des années en porte des milliers).
 */
export async function lignesTaxeesDuCompte(db: LecteurLignes, tenantId: string, compteId: string): Promise<Set<string>> {
  const tva = { compte: { numero: { startsWith: RACINE_TVA_FACTUREE } } } satisfies Prisma.LigneEcritureWhereInput;
  const lues = (await db.ligneEcriture.findMany({
    where: { compteId, lettrageId: null, ecriture: { tenantId, lignes: { some: tva } } },
    select: { id: true, ecriture: { select: { lignes: { where: tva, select: { compte: { select: { numero: true } } }, take: 1 } } } },
  })) as LigneTaxee[];
  return new Set(lues.filter((l) => (l.ecriture?.lignes ?? []).some((x) => x.compte?.numero.startsWith(RACINE_TVA_FACTUREE))).map((l) => l.id));
}

/**
 * LE REFUS NOMMÉ d'un groupe qui réunirait la ligne d'un reclassement en
 * vigueur et une ligne dont l'écriture porte de la TVA facturée (mineur 6).
 * `dejaDuGroupe` · les lignes d'un groupe partiel que l'on complète, lues
 * avec les nouvelles.
 */
export async function refuserLignesDuCompteClientReclasse(
  db: LecteurLignes,
  tenantId: string,
  ligneIds: readonly string[],
  dejaDuGroupe: readonly string[] = [],
) {
  const toutes = [...new Set([...ligneIds, ...dejaDuGroupe])];
  const reclassees = await lignesDuCompteClientReclasse(db, tenantId, toutes);
  if (reclassees.size === 0) return;
  const taxees = await lignesAvecTvaFacturee(db, tenantId, toutes.filter((id) => !reclassees.has(id)));
  if (taxees.size > 0) throw new BadRequestException(MOTIF_LETTRAGE_RECLASSEMENT);
}


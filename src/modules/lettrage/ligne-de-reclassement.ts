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
 * suivi (TVA des créances douteuses) n'est pas faite, la ligne est ÉCARTÉE des
 * propositions et son lettrage manuel est REFUSÉ, par ce motif nommé.
 *
 * Reconnue par sa LIAISON (`CreanceDouteuse.ecritureReclassementId`), jamais
 * par le compte ni le libellé · seule la ligne du compte d'ORIGINE de la
 * créance (`compteCreanceId`), la ligne 416 restant lettrable (aucune TVA n'y
 * est lue, et le module la lettre lui-même à l'extinction de la créance). Un
 * reclassement ANNULÉ ne retient plus rien.
 */
export const MOTIF_LETTRAGE_RECLASSEMENT =
  "Ne lettrez pas la facture avec le reclassement · cette ligne est le crédit du compte du client par le reclassement d'une " +
  "créance douteuse ou litigieuse au 416. Lettrée, le calcul de la TVA la lirait comme un encaissement (décret n° 011/42, " +
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

/** Le refus nommé de tout lettrage qui prendrait une telle ligne. */
export async function refuserLignesDuCompteClientReclasse(db: LecteurLignes, tenantId: string, ligneIds: readonly string[]) {
  const tenues = await lignesDuCompteClientReclasse(db, tenantId, ligneIds);
  if (tenues.size > 0) throw new BadRequestException(MOTIF_LETTRAGE_RECLASSEMENT);
}

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
 * `AUTOMATIQUE_MONTANT` rendait la TVA exigible. La ligne est donc ÉCARTÉE des
 * propositions, et son lettrage manuel, son complément et la confirmation d'un
 * pré-lettrage qui la prendrait sont REFUSÉS, par ce motif nommé · TOUJOURS,
 * quelle que soit la pièce d'en face.
 *
 * LA RÈGLE D'A7, RÉTABLIE (seconde relecture d'A7 ter, B-2) · « le
 * reclassement ne lettre pas le 411 ». Le mineur 6 du premier tour l'avait
 * réduite aux factures portant un compte 443 · le critère était trop large
 * (une vente de BIENS taxée a son exigibilité au fait générateur, art. 25, 1°)
 * et arbitraire sur une ligne d'à-nouveau, et surtout un groupe ainsi posé,
 * une fois FIGÉ par une clôture de période, ne se défaisait plus · l'annulation
 * du reclassement et le délettrage étaient refusés, la créance enfermée. Les
 * groupes facture-reclassement déjà posés (avant et pendant A7 ter) restent à
 * la ligne A7 bis du suivi.
 *
 * Reconnue par sa LIAISON (`CreanceDouteuse.ecritureReclassementId`), jamais
 * par le compte ni le libellé · seule la ligne du compte d'ORIGINE de la
 * créance (`compteCreanceId`), la ligne 416 restant lettrable (aucune TVA n'y
 * est lue, et le module la lettre lui-même à l'extinction de la créance). Un
 * reclassement ANNULÉ ne retient plus rien.
 */
export const MOTIF_LETTRAGE_RECLASSEMENT =
  "Ne lettrez pas la facture avec le reclassement · cette ligne est le crédit du compte du client par le reclassement d'une " +
  "créance douteuse ou litigieuse au 416, et le reclassement ne lettre pas ce compte. Lettrée, le calcul de la TVA la lirait " +
  "comme un encaissement (décret n° 011/42, art. 57), et la TVA d'une prestation de services deviendrait exigible sans " +
  "qu'aucun prix ne soit perçu (O.-L. n° 10/001, art. 25, 2°) ; figé ensuite par une clôture, le groupe ne se déferait plus " +
  "et le reclassement ne s'annulerait plus. La créance se suit dans « Créances douteuses ou litigieuses » ; le traitement de " +
  'sa TVA se déclare par le cabinet lui-même pour l’instant.';

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

/**
 * LE REFUS NOMMÉ de tout lettrage qui prendrait la ligne d'un reclassement en
 * vigueur · `dejaDuGroupe`, les lignes d'un groupe partiel que l'on complète,
 * lues avec les nouvelles (un groupe hérité qui la porterait ne s'étend pas).
 */
export async function refuserLignesDuCompteClientReclasse(
  db: LecteurLignes,
  tenantId: string,
  ligneIds: readonly string[],
  dejaDuGroupe: readonly string[] = [],
) {
  const tenues = await lignesDuCompteClientReclasse(db, tenantId, [...new Set([...ligneIds, ...dejaDuGroupe])]);
  if (tenues.size > 0) throw new BadRequestException(MOTIF_LETTRAGE_RECLASSEMENT);
}

/**
 * LIGNE A7 QUATER, (B) · UN RECLASSEMENT OUVERT SUR LE COMPTE SUSPEND TOUTES
 * LES PASSES PAR MONTANT.
 *
 * Écarter la ligne R du reclassement, ou les groupes qui la portent, ne
 * suffisait pas · la facture reclassée U restait candidate, et la passe des
 * paires exactes la donnait au règlement P d'une AUTRE facture T dès que P
 * précédait R (U 10/02, T 01/05, P 20/05, R 15/06 · [U,P] posé, T laissée
 * ouverte, la TVA de T datée à tort, décret n° 011/42, art. 57 ; O.-L.
 * n° 10/001, art. 25, 2°). Rien ne relie R aux lignes qu'il reclasse (le
 * reclassement ne lettre pas le 411, règle d'A7).
 *
 * AUCUNE EXCEPTION, PAS MÊME LA « CANDIDATE UNIQUE » (second tour) · mettre
 * de côté la seule facture de même montant que R était encore une devinette.
 * Le montant de R peut couvrir PLUSIEURS factures ou une PARTIE d'une seule ·
 * V 500 000, X 300 000, Y 200 000, R 500 000 qui reclasse X et Y, P 500 000
 * qui paie V · V était mise de côté avec R, et la passe N pour 1 posait
 * [P,X,Y], X et Y lues comme encaissées, V ouverte ; U 1 000 000 payée
 * 600 000 par P1, R 400 000 qui reclasse le reste, W 400 000 payée par Q ·
 * W partait avec R, et [U,P1,Q] était posé.
 *
 * Règle · dès qu'une ligne R ouverte existe sur le compte, les passes par
 * montant s'ABSTIENNENT, toutes ; seule la passe par référence de pièce,
 * saisie par un humain, reste, et un groupe qu'elle formerait avec R reste
 * écarté. La ligne R, jamais lettrée, reste ouverte dans son exercice même
 * clôturé · en N+1, les à-nouveaux de U et de R (celui de R sans liaison)
 * restent donc hors des passes par montant eux aussi. Le lettrage du compte
 * se fait à la main ou par référence de pièce (convention d'OmegaX).
 */
export interface LigneAMettreDeCote {
  id: string;
}

export function lignesMisesDeCote(
  lignes: readonly LigneAMettreDeCote[],
  reclassees: ReadonlySet<string>,
): { ecartees: Set<string>; passesParMontantSuspendues: boolean } {
  const rs = lignes.filter((l) => reclassees.has(l.id));
  return { ecartees: new Set(rs.map((r) => r.id)), passesParMontantSuspendues: rs.length > 0 };
}

/**
 * Ce que le lettrage automatique et le pré-lettrage DISENT de la règle
 * ci-dessus (A7 quater, m7) · une ligne laissée ouverte sans un mot passerait
 * pour une ligne que le logiciel n'a pas su rapprocher.
 */
export function messageMiseDeCote(nombre: number, suspendues: boolean): string | null {
  if (!suspendues) return null;
  return (
    `Un reclassement en créance douteuse ou litigieuse est ouvert sur ce compte, et rien ne dit quelles factures il a ` +
    `reclassées · aucun rapprochement par montant n'est fait (${nombre} ligne(s) laissée(s) ouverte(s)), seuls ceux par ` +
    `référence de pièce le sont. Lettrez le reste à la main, sans jamais lettrer une facture avec le reclassement.`
  );
}

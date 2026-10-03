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
 * LIGNE A7 QUATER, (B) · CE QUE LES PASSES PAR MONTANT NE TOUCHENT PAS QUAND
 * UN RECLASSEMENT EST OUVERT SUR LE COMPTE.
 *
 * Écarter la ligne R du reclassement, ou les groupes qui la portent, ne
 * suffisait pas · la facture reclassée U restait candidate, et la passe des
 * paires exactes la donnait au règlement P d'une AUTRE facture T dès que P
 * précédait R (U 10/02, T 01/05, P 20/05, R 15/06 · [U,P] posé, T laissée
 * ouverte, la TVA de T datée à tort, décret n° 011/42, art. 57 ; O.-L.
 * n° 10/001, art. 25, 2°). Rien ne relie R à la ligne de U (le reclassement
 * ne lettre pas le 411, règle d'A7) · deviner laquelle des factures de même
 * montant il a reclassée serait la présomption même que ce module refuse.
 *
 * Règle, SANS DEVINETTE · dès qu'une ligne R ouverte existe sur le compte,
 *  · si chaque R a UNE SEULE candidate de même montant, de sens contraire,
 *    datée au plus tard de R, distincte pour chaque R, la paire est mise de
 *    côté (ni l'une ni l'autre ne s'apparie par montant) et les passes par
 *    montant jouent sur le reste ;
 *  · sinon (aucune candidate, ou plusieurs, ou une candidate convoitée par
 *    deux reclassements) les passes par montant S'ABSTIENNENT, seule la passe
 *    par référence de pièce, saisie par un humain, reste.
 * Les candidates se lisent sur TOUTES les lignes non lettrées du compte,
 * figées comprises · une facture figée par une clôture de période reste une
 * facture que R a pu reclasser, et l'ignorer rendrait unique à tort une autre
 * candidate.
 *
 * L'À-NOUVEAU DE R N'A PAS DE LIAISON · le report en détail recopie U et R,
 * non lettrées, dans l'exercice suivant (provisoire ou à la clôture), et la
 * ligne recopiée de R n'est plus reconnue comme un reclassement. U et R de N
 * restant ouvertes, la candidate unique de R tenait encore, et les à-nouveaux
 * de U et de R s'appariaient en N+1 · la paire même que la règle d'A7
 * interdit. Dès qu'une ligne d'à-nouveau postérieure à R porte le montant et
 * le sens de R, elle peut être la sienne · abstention.
 */
export interface LigneAMettreDeCote {
  id: string;
  net: number;
  date: Date;
  /** La ligne vient d'un report à-nouveau (à la clôture ou provisoire). */
  aNouveau: boolean;
}

export function lignesMisesDeCote(
  lignes: readonly LigneAMettreDeCote[],
  reclassees: ReadonlySet<string>,
): { ecartees: Set<string>; passesParMontantSuspendues: boolean } {
  const rs = lignes.filter((l) => reclassees.has(l.id));
  if (rs.length === 0) return { ecartees: new Set(), passesParMontantSuspendues: false };
  // Comparées en centimes entiers · deux flottants égaux au centime peuvent
  // différer au millionième.
  const centimes = (v: number) => Math.round(v * 100);
  const choisies = new Set<string>();
  let suspendre = false;
  for (const r of rs) {
    const reportDeR = lignes.some(
      (l) => !reclassees.has(l.id) && l.aNouveau && centimes(l.net) === centimes(r.net) && l.date.getTime() > r.date.getTime(),
    );
    if (reportDeR) {
      suspendre = true;
      break;
    }
    const candidates = lignes.filter(
      (l) => !reclassees.has(l.id) && centimes(l.net) === -centimes(r.net) && l.date.getTime() <= r.date.getTime(),
    );
    if (candidates.length !== 1 || choisies.has(candidates[0].id)) {
      suspendre = true;
      break;
    }
    choisies.add(candidates[0].id);
  }
  const ecartees = new Set(rs.map((r) => r.id));
  if (!suspendre) for (const id of choisies) ecartees.add(id);
  return { ecartees, passesParMontantSuspendues: suspendre };
}

/**
 * Ce que le lettrage automatique et le pré-lettrage DISENT de la règle
 * ci-dessus (A7 quater, m7) · une ligne laissée ouverte sans un mot passerait
 * pour une ligne que le logiciel n'a pas su rapprocher.
 */
export function messageMiseDeCote(nombre: number, suspendues: boolean): string | null {
  if (suspendues) {
    return (
      `Un reclassement en créance douteuse ou litigieuse est ouvert sur ce compte, et la facture qu'il a reclassée ne se ` +
      `reconnaît pas avec certitude · aucun rapprochement par montant n'est fait (${nombre} ligne(s) laissée(s) ` +
      `ouverte(s)), seuls ceux par référence de pièce le sont. Lettrez le reste à la main, sans jamais lettrer une facture ` +
      `avec le reclassement.`
    );
  }
  if (nombre === 0) return null;
  return (
    `${nombre} ligne(s) mise(s) de côté · le reclassement en créance douteuse ou litigieuse et la seule facture qu'il ` +
    `a pu reclasser, qui ne se lettrent pas ensemble.`
  );
}

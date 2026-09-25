import { BadRequestException } from '@nestjs/common';
import { GranulariteCloture, Prisma, StatutExercice } from '@prisma/client';

/**
 * CE QU'UNE CLÔTURE FIGE AU-DELÀ DE LA SAISIE · le lettrage et l'analytique.
 *
 * Le manuel Sage i7 définit les trois clôtures par ce qu'elles laissent faire,
 * et c'est la Partielle qui porte la phrase décisive : « Les éléments
 * comptables des écritures déjà validées ne seront plus modifiables mais de
 * nouvelles écritures pourront être passées dans les journaux. LE LETTRAGE ET
 * LA VENTILATION ANALYTIQUE PAR EXEMPLE POURRONT TOUT DE MÊME ÊTRE
 * EFFECTUÉS. » Puis : « Totale : Les journaux ne seront plus modifiables.
 * Période : Les journaux jusqu'à la période sélectionnée ne seront plus
 * modifiables. » Et, pour l'exercice : « On ne peut pas modifier les
 * enregistrements d'exercice clôturé. »
 *
 * L'exception n'est écrite que pour la Partielle · la Totale et la Période
 * figent donc aussi le lettrage et la ventilation. OmegaX ne l'appliquait
 * qu'à la SAISIE (`ExerciceService.verifierEcritureAutorisee`) : on pouvait
 * délettrer, relettrer et reventiler une ligne d'un journal clôturé, ce qui
 * changeait le détail d'un compte de tiers et le réalisé d'un projet sur une
 * période que le cabinet tenait pour arrêtée, sans qu'aucun total ne bouge.
 *
 * TROIS CAS FIGENT une ligne, et un seul ne la fige pas :
 *  · l'exercice de la ligne est CLÔTURÉ ;
 *  · une clôture TOTALE active porte sur SON journal, et la ligne est datée
 *    au plus tard de la date limite (la fin de l'exercice clôturé) · une
 *    clôture totale de 2025 ne fige pas les lignes de 2026 du même journal ;
 *  · une clôture PÉRIODE active couvre sa date, tous journaux confondus ;
 *  · la PARTIELLE ne fige rien, c'est tout son objet.
 */

export interface ClotureActive {
  granularite: GranulariteCloture;
  journalId: string | null;
  dateLimite: Date;
}

export interface LigneAGeler {
  journalId: string;
  journalCode?: string;
  date: Date;
  exerciceClos: boolean;
}

const jour = (d: Date) => d.toISOString().slice(0, 10);

/** Pourquoi la ligne est figée, ou null si elle ne l'est pas. */
export function motifLigneFigee(ligne: LigneAGeler, clotures: ClotureActive[]): string | null {
  if (ligne.exerciceClos) {
    return "son exercice est clôturé · « on ne peut pas modifier les enregistrements d'exercice clôturé »";
  }
  for (const c of clotures) {
    if (c.granularite === GranulariteCloture.TOTALE && c.journalId === ligne.journalId && ligne.date <= c.dateLimite) {
      const code = ligne.journalCode ? ` ${ligne.journalCode}` : '';
      return `le journal${code} est clôturé totalement · « les journaux ne seront plus modifiables »`;
    }
    if (c.granularite === GranulariteCloture.PERIODE && ligne.date <= c.dateLimite) {
      return `la période jusqu'au ${jour(c.dateLimite)} est clôturée pour tous les journaux`;
    }
  }
  return null;
}

/** Client Prisma minimal · le service ou une transaction ouverte. */
interface ClientGel {
  ligneEcriture: { findMany: (args: Prisma.LigneEcritureFindManyArgs) => Promise<unknown[]> };
  cloture: { findMany: (args: Prisma.ClotureFindManyArgs) => Promise<unknown[]> };
}

interface LigneLue {
  id: string;
  ecriture: { date: Date; journalId: string; journal: { code: string }; exercice: { statut: StatutExercice } };
}

/**
 * Lit les lignes et les clôtures actives, et rend l'ensemble des lignes
 * figées avec leur motif. Sert les deux usages · le refus (une action de
 * l'utilisateur sur des lignes qu'il a choisies) et le filtre (le lettrage
 * automatique, qui ne doit pas proposer ce qu'il ne pourrait pas poser).
 */
export async function lignesFigees(
  prisma: unknown,
  tenantId: string,
  ligneIds: string[],
): Promise<Map<string, { date: Date; motif: string }>> {
  const client = prisma as ClientGel;
  const figees = new Map<string, { date: Date; motif: string }>();
  if (ligneIds.length === 0) return figees;
  const [lignes, clotures] = await Promise.all([
    client.ligneEcriture.findMany({
      where: { id: { in: ligneIds }, ecriture: { tenantId } },
      select: {
        id: true,
        ecriture: {
          select: { date: true, journalId: true, journal: { select: { code: true } }, exercice: { select: { statut: true } } },
        },
      },
    }) as Promise<LigneLue[]>,
    client.cloture.findMany({
      where: { tenantId, annuleeAt: null, granularite: { not: GranulariteCloture.PARTIELLE } },
      select: { granularite: true, journalId: true, dateLimite: true },
    }) as Promise<ClotureActive[]>,
  ]);
  for (const l of lignes) {
    const motif = motifLigneFigee(
      {
        journalId: l.ecriture.journalId,
        journalCode: l.ecriture.journal.code,
        date: l.ecriture.date,
        exerciceClos: l.ecriture.exercice.statut === StatutExercice.CLOTURE,
      },
      clotures,
    );
    if (motif) figees.set(l.id, { date: l.ecriture.date, motif });
  }
  return figees;
}

/**
 * Refuse l'action si une seule ligne est figée, en nommant la première · une
 * action sur un lot ne se fait pas à moitié.
 */
export async function refuserSiLignesFigees(prisma: unknown, tenantId: string, ligneIds: string[], action: string) {
  const figees = await lignesFigees(prisma, tenantId, ligneIds);
  const premiere = [...figees.values()][0];
  if (premiere) {
    throw new BadRequestException(
      `Impossible ${/^[aeiouyéèê]/i.test(action) ? "d'" : 'de '}${action} : la ligne du ${jour(premiere.date)} est figée, ${premiere.motif}. ` +
        "Une clôture totale, de période ou d'exercice fige aussi le lettrage et la ventilation analytique ; " +
        'seule la clôture partielle les laisse ouverts (Sage i7).',
    );
  }
}

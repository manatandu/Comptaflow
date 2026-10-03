import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../common/prisma.service';
import { CodeContrePassationIntegrale, LIBELLE_INTEGRALE, estDisponibilite } from './ecarts-disponibilites';

type Lecteur = Pick<PrismaService, 'reevaluation'>;

/**
 * Borne de lecture · une seule réévaluation non annulée par exercice (index
 * unique, audit final F54), et sa contre-passation tombe dans l'exercice qui
 * suit · quelques-unes par exercice au plus. La borne ne joue donc jamais en
 * pratique, et si elle jouait, la liste le dirait (`tronque`).
 */
export const PLAFOND_REEVALUATIONS_EXAMINEES = 50;

/** Une ligne de disponibilité qu'une ancienne contre-passation a inversée. */
export interface DisponibiliteContrePassee {
  dateReevaluation: Date;
  /** L'exercice de la réévaluation est clôturé. */
  exerciceReevaluationClos: boolean;
  /**
   * L'exercice qui PORTE la contre-passation est clôturé (second tour, m2) ·
   * c'est lui qui règle l'issue · ouvert, elle s'annule seule.
   */
  exerciceContrePassationClos: boolean;
  piece: number | null;
  date: Date;
  compteNumero: string;
  /** Débit moins crédit de la ligne de contre-passation. */
  montant: number;
  /**
   * La contre-passation INTÉGRALE par exception nommée (relecture adverse
   * d'A5 bis, B2 et M2), dite au libellé · sa raison, ou `null` pour une
   * contre-passation d'avant A5 bis, qui inversait tout sans le dire.
   */
  exception: string | null;
}

/**
 * LES ANCIENNES CONTRE-PASSATIONS QUI ONT INVERSÉ UNE DISPONIBILITÉ (ligne A5
 * bis). Avant cette ligne, `extourner` contre-passait TOUTE l'écriture des
 * écarts, la banque et la caisse comprises, dont l'écart est pourtant RÉALISÉ
 * (AUDCIF art. 57 ; Titre VIII ch. 22, section 4 ; Application 86 du Guide,
 * aucune contre-passation). AUCUN RETRAITEMENT · une écriture validée ne se
 * modifie plus (art. 22, 2°) et l'erreur se corrige « exclusivement par
 * inscription en négatif » (art. 20, al. 2) · le contrôle NOMME les lignes,
 * l'issue est au cabinet.
 *
 * Lu dans l'exercice qui PORTE la contre-passation · c'est là que la
 * trésorerie est revenue au coût historique.
 */
export async function contrePassationsDeDisponibilites(
  prisma: Lecteur,
  p: { tenantId: string; exerciceId: string },
): Promise<{ elements: DisponibiliteContrePassee[]; tronque: boolean }> {
  const reevaluations = await prisma.reevaluation.findMany({
    where: { tenantId: p.tenantId, annuleeLe: null, ecritureExtourne: { is: { exerciceId: p.exerciceId } } },
    orderBy: { dateReevaluation: 'asc' },
    take: PLAFOND_REEVALUATIONS_EXAMINEES + 1,
    select: {
      dateReevaluation: true,
      contrePassationIntegrale: true,
      exercice: { select: { statut: true } },
      ecritureExtourne: {
        select: {
          numeroPiece: true,
          date: true,
          exercice: { select: { statut: true } },
          lignes: { select: { debit: true, credit: true, compte: { select: { numero: true } } } },
        },
      },
    },
  });
  const tronque = reevaluations.length > PLAFOND_REEVALUATIONS_EXAMINEES;
  const elements: DisponibiliteContrePassee[] = [];
  for (const r of reevaluations.slice(0, PLAFOND_REEVALUATIONS_EXAMINEES)) {
    if (!r.ecritureExtourne) continue;
    for (const l of r.ecritureExtourne.lignes) {
      if (!estDisponibilite(l.compte.numero)) continue;
      elements.push({
        dateReevaluation: r.dateReevaluation,
        exerciceReevaluationClos: r.exercice.statut === 'CLOTURE',
        exerciceContrePassationClos: r.ecritureExtourne.exercice?.statut === 'CLOTURE',
        piece: r.ecritureExtourne.numeroPiece,
        date: r.ecritureExtourne.date,
        compteNumero: l.compte.numero,
        montant: Math.round((Number(l.debit) - Number(l.credit)) * 100) / 100,
        exception: r.contrePassationIntegrale
          ? (LIBELLE_INTEGRALE[r.contrePassationIntegrale as CodeContrePassationIntegrale] ?? r.contrePassationIntegrale)
          : null,
      });
    }
  }
  return { elements, tronque };
}

/**
 * LES ÉCRITURES D'UNE CONTRE-PASSATION ANNULÉE ET LEURS NÉGATIFS (second
 * tour, m3) · déliées de la réévaluation par « Annuler la contre-passation »
 * (M1), elles ne se reconnaissent plus par la liaison `reevaluationExtourne`,
 * et une ancienne contre-passation qui inversait la banque passerait pour un
 * mouvement du relevé (contrôle 32 d'A13, compte 52 fermé). La trace gardée
 * (`annulationsContrePassation`) les nomme · l'écriture d'origine et son
 * inscription en négatif. Bornée comme le contrôle 34 (une réévaluation non
 * annulée par exercice, quelques annulations au plus) ; au-delà, `tronque`.
 */
export async function ecrituresDesContrePassationsAnnulees(
  prisma: Lecteur,
  tenantId: string,
): Promise<{ ids: Set<string>; tronque: boolean }> {
  const traces = await prisma.reevaluation.findMany({
    where: { tenantId, annulationsContrePassation: { not: Prisma.DbNull } },
    take: PLAFOND_REEVALUATIONS_EXAMINEES + 1,
    select: { annulationsContrePassation: true },
  });
  const ids = new Set<string>();
  for (const t of traces.slice(0, PLAFOND_REEVALUATIONS_EXAMINEES)) {
    const liste = Array.isArray(t.annulationsContrePassation) ? t.annulationsContrePassation : [];
    for (const a of liste) {
      if (!a || typeof a !== 'object' || Array.isArray(a)) continue;
      const { ecritureId, negatifId } = a as { ecritureId?: unknown; negatifId?: unknown };
      if (typeof ecritureId === 'string') ids.add(ecritureId);
      if (typeof negatifId === 'string') ids.add(negatifId);
    }
  }
  return { ids, tronque: traces.length > PLAFOND_REEVALUATIONS_EXAMINEES };
}

import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../common/prisma.service';
import { CodeContrePassationIntegrale, LIBELLE_INTEGRALE, estDisponibilite, partagerLignesDEcarts } from './ecarts-disponibilites';
import { disponibilitesInversees } from './contre-passation-manuelle';

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
  /**
   * Une contre-passation faite À LA MAIN et déclarée (troisième tour) · elle
   * ne s'annule pas par le module ; l'issue est de retirer la déclaration et
   * de corriger l'écriture du cabinet.
   */
  manuelle: boolean;
  /**
   * La réévaluation porte un écart de conversion (le tiers et son 478 ou
   * 479) · une fois la contre-passation annulée, il y a quelque chose à
   * repasser. Sans lui (les seules disponibilités), rien (mineur 1).
   */
  aRepasser: boolean;
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
  const lignesLues = { select: { compteId: true, debit: true, credit: true, compte: { select: { numero: true } } } } as const;
  const reevaluations = await prisma.reevaluation.findMany({
    where: {
      tenantId: p.tenantId,
      annuleeLe: null,
      // La contre-passation du module, ou celle faite à la main et DÉCLARÉE
      // (troisième tour) · l'une et l'autre peuvent avoir inversé la banque.
      OR: [{ ecritureExtourne: { is: { exerciceId: p.exerciceId } } }, { contrePassationDeclaree: { is: { exerciceId: p.exerciceId } } }],
    },
    // Tri STABLE · la borne garde toujours les mêmes.
    orderBy: [{ dateReevaluation: 'asc' }, { id: 'asc' }],
    take: PLAFOND_REEVALUATIONS_EXAMINEES + 1,
    select: {
      dateReevaluation: true,
      contrePassationIntegrale: true,
      exercice: { select: { statut: true } },
      ecritureEcarts: { select: { lignes: lignesLues } },
      ecritureExtourne: {
        select: {
          exerciceId: true,
          numeroPiece: true,
          date: true,
          exercice: { select: { statut: true } },
          lignes: lignesLues,
        },
      },
      contrePassationDeclaree: {
        select: {
          exerciceId: true,
          numeroPiece: true,
          date: true,
          exercice: { select: { statut: true } },
          lignes: lignesLues,
        },
      },
    },
  });
  const tronque = reevaluations.length > PLAFOND_REEVALUATIONS_EXAMINEES;
  const elements: DisponibiliteContrePassee[] = [];
  const enLignes = (lignes: { compteId: string; debit: unknown; credit: unknown; compte: { numero: string } }[]) =>
    lignes.map((l) => ({ compteId: l.compteId, compteNumero: l.compte.numero, debit: Number(l.debit), credit: Number(l.credit) }));
  for (const r of reevaluations.slice(0, PLAFOND_REEVALUATIONS_EXAMINEES)) {
    const ecarts = enLignes(r.ecritureEcarts?.lignes ?? []);
    const aRepasser = partagerLignesDEcarts(ecarts).aContrePasser.length > 0;
    const commun = { dateReevaluation: r.dateReevaluation, exerciceReevaluationClos: r.exercice.statut === 'CLOTURE', aRepasser };
    const x = r.ecritureExtourne;
    if (x && x.exerciceId === p.exerciceId) {
      for (const l of x.lignes) {
        if (!estDisponibilite(l.compte.numero)) continue;
        elements.push({
          ...commun,
          exerciceContrePassationClos: x.exercice?.statut === 'CLOTURE',
          piece: x.numeroPiece,
          date: x.date,
          compteNumero: l.compte.numero,
          montant: Math.round((Number(l.debit) - Number(l.credit)) * 100) / 100,
          exception: r.contrePassationIntegrale
            ? (LIBELLE_INTEGRALE[r.contrePassationIntegrale as CodeContrePassationIntegrale] ?? r.contrePassationIntegrale)
            : null,
          manuelle: false,
        });
      }
    }
    // La déclarée · seuls les comptes de banque ou de caisse dont elle inverse
    // EXACTEMENT l'écart passé · une autre ligne de banque de la même OD
    // d'ouverture est une opération du cabinet, pas une contre-passation.
    const d = r.contrePassationDeclaree;
    if (d && d.exerciceId === p.exerciceId) {
      const lignes = enLignes(d.lignes);
      const inversees = disponibilitesInversees(ecarts, lignes, estDisponibilite);
      for (const compteId of inversees) {
        const surLeCompte = lignes.filter((l) => l.compteId === compteId);
        elements.push({
          ...commun,
          exerciceContrePassationClos: d.exercice?.statut === 'CLOTURE',
          piece: d.numeroPiece,
          date: d.date,
          compteNumero: surLeCompte[0]?.compteNumero ?? '',
          montant: Math.round(surLeCompte.reduce((t, l) => t + l.debit - l.credit, 0) * 100) / 100,
          exception: null,
          manuelle: true,
        });
      }
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
    // Tri STABLE (troisième tour, mineur 3) · les plus récentes d'abord, les
    // plus proches de l'exercice contrôlé ; au-delà de la borne, `tronque`, que
    // le contrôle 32 DIT.
    orderBy: [{ dateReevaluation: 'desc' }, { id: 'asc' }],
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

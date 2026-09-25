import { GranulariteCloture } from '@prisma/client';

/**
 * AUDCIF ART. 22, 4° · l'opération qui tombe dans une période close.
 *
 * « Les enregistrements d'une période clôturée [sont] classés dans l'ordre
 * chronologique de la date de valeur comptable. Lorsque cette date correspond
 * à une période déjà clôturée, l'opération est enregistrée au PREMIER JOUR DE
 * LA PÉRIODE NON ENCORE CLÔTURÉE, sa date de valeur étant mentionnée
 * distinctement. » L'art. 22 n'est pas dans la liste d'exclusion de l'art. 3
 * du SYCEBNL · il vaut des deux côtés.
 *
 * OmegaX refusait sec, et deux de ses trois clôtures sont définitives
 * (PÉRIODE, TOTALE) : une facture de mars reçue en mai, mars étant clos,
 * n'avait AUCUN chemin dans le logiciel. Arbitrage de Manasse, 2026-09-24 ·
 * le texte s'applique, sur demande expresse du comptable, jamais d'office.
 *
 * CE QUE CETTE FONCTION NE FAIT PAS · franchir un exercice. Le premier jour
 * ouvert peut tomber dans l'exercice suivant quand la clôture couvre la fin
 * de l'exercice ; y reporter l'opération changerait l'exercice qui porte la
 * charge ou le produit, contre le postulat de spécialisation des exercices.
 * C'est l'appelant qui le refuse, parce que c'est lui qui connaît l'exercice.
 */
export interface ClotureActive {
  granularite: GranulariteCloture;
  journalId: string | null;
  dateLimite: Date;
}

/** Même règle de blocage que `ExerciceService.verifierEcritureAutorisee`. */
function bloque(c: ClotureActive, journalId: string, date: Date): boolean {
  if (c.granularite === GranulariteCloture.TOTALE) return c.journalId === journalId && date <= c.dateLimite;
  if (c.granularite === GranulariteCloture.PARTIELLE) return c.journalId === journalId && date <= c.dateLimite;
  return date <= c.dateLimite;
}

const JOUR = 24 * 60 * 60 * 1000;

/** Lendemain calendaire, au début du jour UTC · les dates comptables le sont. */
function lendemain(d: Date): Date {
  const debut = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return new Date(debut + JOUR);
}

/**
 * Premier jour de la période non encore clôturée pour ce journal, à partir de
 * `date`. Rend `date` elle-même si rien ne la bloque. Une clôture TOTALE porte
 * sur un journal jusqu'à une date, comme chez Sage (« pour le mois de
 * janvier ») · elle se franchit donc comme les autres.
 *
 * Les clôtures peuvent s'enchaîner (une PARTIELLE du journal au 31 mars, une
 * PÉRIODE au 30 avril) · on avance tant qu'une clôture bloque encore.
 */
export function premierJourNonCloture(clotures: ClotureActive[], journalId: string, date: Date): Date {
  let d = date;
  for (let garde = 0; garde <= clotures.length; garde++) {
    const bloquantes = clotures.filter((c) => bloque(c, journalId, d));
    if (bloquantes.length === 0) return d;
    const limite = bloquantes.reduce((m, c) => (c.dateLimite > m ? c.dateLimite : m), bloquantes[0].dateLimite);
    d = lendemain(limite);
  }
  return d;
}
